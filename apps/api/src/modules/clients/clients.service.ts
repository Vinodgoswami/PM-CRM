import { Injectable } from '@nestjs/common';
import { changedFields } from '@salescrm/core';
import { Prisma } from '@salescrm/database';
import {
  type ClientDetail,
  type ClientListItem,
  type ClientListQuery,
  type ContactDto,
  type ContactInput,
  type CreateClientInput,
  type UpdateClientInput,
  type UpdateContactInput,
} from '@salescrm/schemas';
import { minorToJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { conflict, notFound } from '../../common/errors';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.module';
import { PROJECT_MONEY_INCLUDE, totalsFor } from '../projects/project-money';
import { SettingsService } from '../settings/settings.service';

/** C-2: names are compared trimmed and case-insensitively among active clients. */
export const nameKeyOf = (name: string) => name.trim().toLowerCase();

const LIST_INCLUDE = {
  contacts: { where: { isPrimary: true }, select: { email: true } },
  _count: { select: { projects: true } },
} satisfies Prisma.ClientInclude;

type ClientRow = Prisma.ClientGetPayload<{ include: typeof LIST_INCLUDE }>;

function toListItem(c: ClientRow): ClientListItem {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    primaryEmail: c.contacts[0]?.email ?? null,
    projects: c._count.projects,
    archived: c.archivedAt !== null,
    currency: c.currency,
  };
}

const toContact = (c: { id: string; name: string | null; email: string; phone: string | null; isPrimary: boolean }): ContactDto => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  isPrimary: c.isPrimary,
});

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Throws the C-2 conflict (with the existing id) when an active client already uses this name. */
  async findOrConflict(tx: Prisma.TransactionClient, name: string, exceptId?: string): Promise<void> {
    const existing = await tx.client.findUnique({ where: { nameKey: nameKeyOf(name) }, select: { id: true } });
    if (existing && existing.id !== exceptId) this.throwDuplicate(existing.id);
  }

  private throwDuplicate(clientId: string): never {
    throw Object.assign(conflict('CONFLICT', 'A client with this name already exists'), { details: { clientId } });
  }

  /** A unique-index race lost to a concurrent request becomes the same C-2 conflict. */
  async rethrowDuplicate(e: unknown, name: string): Promise<never> {
    if (isUniqueViolation(e)) {
      const existing = await this.prisma.client.findUnique({ where: { nameKey: nameKeyOf(name) }, select: { id: true } });
      if (existing) this.throwDuplicate(existing.id);
    }
    throw e;
  }

  /** Creates a client inside the caller's transaction (also used by project create, C-1). */
  async createIn(tx: Prisma.TransactionClient, actor: SessionUser, input: CreateClientInput) {
    await this.findOrConflict(tx, input.name);
    const baseCurrency = input.currency ?? (await tx.setting.findUnique({ where: { id: 1 } }))?.baseCurrency ?? 'INR';
    const client = await tx.client.create({
      data: {
        name: input.name,
        nameKey: nameKeyOf(input.name),
        company: input.company ?? null,
        country: input.country ?? null,
        currency: baseCurrency,
        notes: input.notes ?? null,
        createdById: actor.id,
        ...(input.contact ? { contacts: { create: { ...input.contact, isPrimary: true } } } : {}),
      },
      include: LIST_INCLUDE,
    });
    await this.audit.record(tx, {
      actorId: actor.id,
      action: 'client.create',
      entity: 'Client',
      entityId: client.id,
      after: { name: client.name },
    });
    return client;
  }

  async create(actor: SessionUser, input: CreateClientInput): Promise<ClientListItem> {
    try {
      return toListItem(await this.prisma.$transaction((tx) => this.createIn(tx, actor, input)));
    } catch (e) {
      return this.rethrowDuplicate(e, input.name);
    }
  }

  async list(query: ClientListQuery): Promise<{ items: ClientListItem[]; page: number; pageSize: number; total: number }> {
    const where: Prisma.ClientWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.q
        ? {
            OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { company: { contains: query.q, mode: 'insensitive' } }],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);
    return { items: rows.map(toListItem), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<ClientDetail> {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        ...LIST_INCLUDE,
        contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
        projects: { include: PROJECT_MONEY_INCLUDE, orderBy: { code: 'asc' } },
      },
    });
    if (!client) throw notFound();
    const today = await this.settings.today();
    let booked = 0n;
    let collected = 0n;
    let outstanding = 0n;
    for (const p of client.projects) {
      const t = totalsFor(p, today);
      if (p.wonAt) booked += t.contractValueMinor;
      collected += t.collectedMinor;
      outstanding += t.outstandingMinor;
    }
    return {
      id: client.id,
      name: client.name,
      company: client.company,
      primaryEmail: client.contacts.find((c) => c.isPrimary)?.email ?? null,
      projects: client.projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        parentProjectId: p.parentProjectId,
      })),
      archived: client.archivedAt !== null,
      country: client.country,
      currency: client.currency,
      notes: client.notes,
      contacts: client.contacts.map(toContact),
      bookedMinor: minorToJson(booked),
      collectedMinor: minorToJson(collected),
      outstandingMinor: minorToJson(outstanding),
    } as ClientDetail;
  }

  async update(actor: SessionUser, id: string, input: UpdateClientInput): Promise<ClientListItem> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.client.findUnique({ where: { id } });
        if (!before) throw notFound();
        if (input.name !== undefined && before.archivedAt === null) await this.findOrConflict(tx, input.name, id);
        const after = await tx.client.update({
          where: { id },
          data: { ...input, ...(input.name !== undefined && before.archivedAt === null ? { nameKey: nameKeyOf(input.name) } : {}) },
          include: LIST_INCLUDE,
        });
        const fields = Object.keys(input) as (keyof UpdateClientInput)[];
        const diff = changedFields(
          Object.fromEntries(fields.map((k) => [k, before[k]])),
          Object.fromEntries(fields.map((k) => [k, after[k]])),
        );
        if (diff) await this.audit.record(tx, { actorId: actor.id, action: 'client.update', entity: 'Client', entityId: id, ...diff });
        return toListItem(after);
      });
    } catch (e) {
      return this.rethrowDuplicate(e, input.name ?? '');
    }
  }

  /** C-3: clients are archived, never deleted; archiving frees the name for reuse. */
  async archive(actor: SessionUser, id: string): Promise<ClientListItem> {
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({ where: { id } });
      if (!client) throw notFound();
      const after = await tx.client.update({ where: { id }, data: { archivedAt: new Date(), nameKey: null }, include: LIST_INCLUDE });
      await this.audit.record(tx, { actorId: actor.id, action: 'client.archive', entity: 'Client', entityId: id });
      return toListItem(after);
    });
  }

  async addContact(actor: SessionUser, clientId: string, input: ContactInput): Promise<ContactDto> {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw notFound();
      const hasPrimary = (await tx.clientContact.count({ where: { clientId, isPrimary: true } })) > 0;
      const isPrimary = input.isPrimary ?? !hasPrimary;
      if (isPrimary) await tx.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
      const contact = await tx.clientContact.create({ data: { ...input, clientId, isPrimary } });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'client.contact.create',
        entity: 'ClientContact',
        entityId: contact.id,
        after: { email: contact.email },
      });
      return toContact(contact);
    });
  }

  async updateContact(actor: SessionUser, clientId: string, contactId: string, input: UpdateContactInput): Promise<ContactDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.clientContact.findFirst({ where: { id: contactId, clientId } });
      if (!before) throw notFound();
      // Exactly one primary per client (docs/05).
      if (input.isPrimary) await tx.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
      const after = await tx.clientContact.update({ where: { id: contactId }, data: input });
      const diff = changedFields(toContact(before), toContact(after));
      if (diff) {
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'client.contact.update',
          entity: 'ClientContact',
          entityId: contactId,
          ...diff,
        });
      }
      return toContact(after);
    });
  }
}
