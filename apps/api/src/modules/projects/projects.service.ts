import { Injectable } from '@nestjs/common';
import { can } from '@salescrm/auth/permissions';
import {
  changedFields,
  checkTransition,
  endDateFor,
  type IsoDate,
  milestoneStatus,
  type ProjectStatus,
  statusDates,
  wouldCreateCycle,
} from '@salescrm/core';
import { type Prisma } from '@salescrm/database';
import {
  type CreateProjectInput,
  type ProjectDetail,
  type ProjectListItem,
  type ProjectListQuery,
  type UpdateProjectInput,
  type UpsellEntryInput,
} from '@salescrm/schemas';
import { formatMoney, minorFromJson, minorToJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { AppError, conflict, notFound, RuleViolation } from '../../common/errors';
import { assertCanAccess, ownerWhere } from '../../common/ownership';
import { AuditService } from '../audit/audit.service';
import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../prisma/prisma.module';
import { SettingsService } from '../settings/settings.service';
import { FxService } from '../fx/fx.service';
import { isoDate, PROJECT_MONEY_INCLUDE, totalsFor } from './project-money';

const LIST_INCLUDE = {
  ...PROJECT_MONEY_INCLUDE,
  client: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.ProjectInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  upsellEntries: { select: { id: true, amountMinor: true, date: true, note: true, milestoneId: true }, orderBy: { date: 'asc' } },
  milestones: {
    select: {
      id: true,
      number: true,
      title: true,
      amountMinor: true,
      dueDate: true,
      payments: { select: { amountMinor: true } },
      upsellEntry: { select: { id: true } },
    },
    orderBy: { number: 'asc' },
  },
  parentProject: { select: { id: true, code: true, name: true, upsellProjects: { select: { id: true }, orderBy: { code: 'asc' } } } },
  upsellProjects: {
    select: { id: true, code: true, name: true, status: true, phaseKind: true, expectedAmountMinor: true, ...PROJECT_MONEY_INCLUDE },
    orderBy: { code: 'asc' },
  },
} satisfies Prisma.ProjectInclude;

type ListRow = Prisma.ProjectGetPayload<{ include: typeof LIST_INCLUDE }>;
type DetailRow = Prisma.ProjectGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const toDate = (d: IsoDate | null | undefined) => (d ? new Date(`${d}T00:00:00Z`) : null);
const paidOf = (m: { payments: { amountMinor: bigint }[] }) => m.payments.reduce((s, p) => s + p.amountMinor, 0n);

function toListItem(p: ListRow, today: IsoDate): ProjectListItem {
  const t = totalsFor(p, today);
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    status: p.status,
    currency: p.currency,
    client: p.client,
    owner: p.owner,
    wonAt: isoDate(p.wonAt),
    contractValueMinor: minorToJson(t.contractValueMinor),
    collectedMinor: minorToJson(t.collectedMinor),
    outstandingMinor: minorToJson(t.outstandingMinor),
    nextDueDate: t.nextDueDate,
    hasOverdue: t.hasOverdue,
    parentProjectId: p.parentProjectId,
    expectedAmountMinor: minorToJson(p.expectedAmountMinor),
    milestoneCount: p.milestones.length,
    paidMilestoneCount: p.milestones.filter((m) => paidOf(m) >= m.amountMinor).length,
  };
}

const SORTERS: Record<ProjectListQuery['sort'], (a: ProjectListItem, b: ProjectListItem) => number> = {
  code: (a, b) => a.code.localeCompare(b.code),
  name: (a, b) => a.name.localeCompare(b.name),
  wonAt: (a, b) => (a.wonAt ?? '').localeCompare(b.wonAt ?? ''),
  contractValue: (a, b) => a.contractValueMinor - b.contractValueMinor,
  outstanding: (a, b) => a.outstandingMinor - b.outstandingMinor,
  nextDue: (a, b) => (a.nextDueDate ?? '9999').localeCompare(b.nextDueDate ?? '9999'),
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clients: ClientsService,
    private readonly settings: SettingsService,
    private readonly fx: FxService,
  ) {}

  /** D-020: the rate fields to save on a project in `currency` today (null rate when none is available). */
  private async fxFields(currency: string, today: IsoDate) {
    const base = (await this.settings.get()).baseCurrency;
    const found = await this.fx.find(currency, base, today);
    return { fxRate: found?.rate ?? null, fxRateDate: found ? toDate(found.date) : null, fxBaseCurrency: found ? base : null };
  }

  toDetail(p: DetailRow, user: SessionUser, today: IsoDate, dueSoonDays: number): ProjectDetail {
    const t = totalsFor(p, today);
    return {
      ...toListItem(p, today),
      description: p.description,
      startDate: isoDate(p.startDate),
      durationValue: p.durationValue,
      durationUnit: p.durationUnit,
      endDate: isoDate(p.endDate),
      closedAt: isoDate(p.closedAt),
      expectedAmountMinor: minorToJson(p.expectedAmountMinor),
      tags: p.tags,
      parent: p.parentProject && { id: p.parentProject.id, code: p.parentProject.code, name: p.parentProject.name },
      // D-028: the original project is Phase 1; its extra-work projects are Phase 2, 3, … in code order.
      phase: p.parentProject ? p.parentProject.upsellProjects.findIndex((u) => u.id === p.id) + 2 : p.upsellProjects.length > 0 ? 1 : null,
      phaseKind: p.parentProject ? p.phaseKind : null,
      upsellProjects: p.upsellProjects.map((u, i) => {
        const ut = totalsFor(u, today);
        return {
          id: u.id,
          code: u.code,
          name: u.name,
          status: u.status,
          phase: i + 2,
          phaseKind: u.phaseKind,
          expectedAmountMinor: minorToJson(u.expectedAmountMinor),
          contractValueMinor: minorToJson(ut.contractValueMinor),
          collectedMinor: minorToJson(ut.collectedMinor),
        };
      }),
      upsellEntries: p.upsellEntries.map((u) => ({
        id: u.id,
        amountMinor: minorToJson(u.amountMinor),
        date: isoDate(u.date)!,
        note: u.note,
        milestoneId: u.milestoneId,
      })),
      milestones: p.milestones.map((m) => ({
        id: m.id,
        number: m.number,
        title: m.title,
        amountMinor: minorToJson(m.amountMinor),
        dueDate: isoDate(m.dueDate),
        // D-038: billed through an upsell amount, or part of a phase that is an upsell.
        isUpsell: m.upsellEntry !== null || (p.parentProjectId !== null && p.phaseKind === 'UPSELL'),
        paidMinor: minorToJson(paidOf(m)),
        balanceMinor: minorToJson(m.amountMinor - paidOf(m)),
        status: milestoneStatus({ amountMinor: m.amountMinor, paidMinor: paidOf(m), dueDate: isoDate(m.dueDate) }, today, dueSoonDays),
      })),
      scheduledMinor: minorToJson(t.scheduledMinor),
      unscheduledMinor: minorToJson(t.unscheduledMinor),
      updatedAt: p.updatedAt.toISOString(),
      canEdit: can(user, 'projects.write', { ownerId: p.ownerId }),
    };
  }

  /** Loads a project the user may see (404 otherwise) — used by every project-scoped endpoint. */
  async load(id: string, user: SessionUser, tx: Prisma.TransactionClient = this.prisma): Promise<DetailRow> {
    const p = await tx.project.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!p || p.archivedAt) throw notFound();
    assertCanAccess(user, 'projects.read', p.ownerId, 'read');
    return p;
  }

  async loadForWrite(id: string, user: SessionUser, tx: Prisma.TransactionClient = this.prisma): Promise<DetailRow> {
    const p = await this.load(id, user, tx);
    assertCanAccess(user, 'projects.write', p.ownerId, 'write');
    return p;
  }

  async get(id: string, user: SessionUser): Promise<ProjectDetail> {
    const [project, settings, today] = await Promise.all([this.load(id, user), this.settings.get(), this.settings.today()]);
    return this.toDetail(project, user, today, settings.dueSoonDays);
  }

  async list(user: SessionUser, q: ProjectListQuery) {
    const where: Prisma.ProjectWhereInput = {
      archivedAt: null,
      ...ownerWhere(user, 'projects.read'),
      ...(q.status?.length ? { status: { in: q.status } } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.wonFrom || q.wonTo
        ? { wonAt: { ...(q.wonFrom ? { gte: toDate(q.wonFrom)! } : {}), ...(q.wonTo ? { lte: toDate(q.wonTo)! } : {}) } }
        : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const today = await this.settings.today();
    // Computed columns (contract value, outstanding, next due) are derived in core, so sort/paginate after the DB filter.
    let items = (await this.prisma.project.findMany({ where, include: LIST_INCLUDE })).map((p) => toListItem(p, today));
    if (q.hasOverdue !== undefined) items = items.filter((i) => i.hasOverdue === q.hasOverdue);
    const sorter = SORTERS[q.sort];
    items.sort((a, b) => (q.dir === 'desc' ? -sorter(a, b) : sorter(a, b)));
    const total = items.length;
    return { items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), page: q.page, pageSize: q.pageSize, total };
  }

  async create(user: SessionUser, input: CreateProjectInput): Promise<ProjectDetail> {
    const today = await this.settings.today();
    // The project's currency is the input's, else its client's, else (a new client) the base currency.
    const base = (await this.settings.get()).baseCurrency;
    const clientCurrency = input.clientId
      ? (await this.prisma.client.findUnique({ where: { id: input.clientId }, select: { currency: true } }))?.currency
      : undefined;
    const fx = await this.fxFields(input.currency ?? clientCurrency ?? base, today);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        let clientId = input.clientId;
        if (input.newClient) {
          // C-1: the client is created in the same transaction; if anything below fails, it is rolled back too.
          const created = await this.clients.createIn(tx, user, {
            name: input.newClient.name,
            // A new client is billed in the currency chosen for its first project.
            ...(input.currency ? { currency: input.currency } : {}),
            ...(input.newClient.email ? { contact: { email: input.newClient.email } } : {}),
          });
          clientId = created.id;
        }
        const client = await tx.client.findUnique({ where: { id: clientId! } });
        if (!client || client.archivedAt) throw new RuleViolation('C-3', 'Choose an active client.');

        const ownerId = await this.resolveOwner(tx, user, input.ownerId);
        const milestones = input.milestones.map((m, i) => ({ ...m, number: i + 1 }));
        // PS-4 applies to the initial status too; the PS-1 arrows only govern later changes.
        // D-025: hired work is created Active with just a booking amount; milestones can follow, but each one it
        // has needs a due date (PS-4), since invoices are scheduled by it.
        if (input.status === 'ACTIVE' && milestones.some((m) => !m.dueDate)) {
          throw new RuleViolation('PS-4', 'Give every milestone a due date.');
        }
        if (input.parentProjectId) await this.assertParent(tx, user, null, client.id, input.parentProjectId);
        if (input.phaseKind && !input.parentProjectId) throw new RuleViolation('U-4', 'Only a phase of another project has a phase type.');
        const dates = statusDates('LEAD', input.status, { wonAt: null, closedAt: null }, today);
        const [seq] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('project_code_seq')`;
        const nextval = seq!.nextval;

        const project = await tx.project.create({
          data: {
            code: `PRJ-${String(nextval).padStart(4, '0')}`,
            name: input.name,
            description: input.description,
            clientId: client.id,
            ownerId,
            status: input.status,
            startDate: toDate(input.startDate),
            durationValue: input.durationValue ?? null,
            durationUnit: input.durationUnit ?? null,
            endDate: toDate(endDateFor(input.startDate ?? null, input.durationValue ?? null, input.durationUnit ?? null)),
            expectedAmountMinor: minorFromJson(input.expectedAmountMinor),
            currency: input.currency ?? client.currency,
            ...fx,
            wonAt: toDate(dates.wonAt),
            tags: input.tags,
            parentProjectId: input.parentProjectId ?? null,
            phaseKind: input.phaseKind ?? 'UPSELL',
            createdById: user.id,
            milestones: {
              create: milestones.map((m) => ({
                number: m.number,
                title: m.title,
                description: m.description ?? null,
                amountMinor: minorFromJson(m.amountMinor),
                dueDate: toDate(m.dueDate),
                createdById: user.id,
              })),
            },
          },
        });
        await this.audit.record(tx, {
          actorId: user.id,
          action: 'project.create',
          entity: 'Project',
          entityId: project.id,
          after: {
            code: project.code,
            name: project.name,
            status: project.status,
            expectedAmountMinor: project.expectedAmountMinor.toString(),
          },
        });
        await this.assertMilestonesWithinValue(tx, project.id);
        return project.id;
      });
      return this.get(id, user);
    } catch (e) {
      if (input.newClient) return this.clients.rethrowDuplicate(e, input.newClient.name);
      throw e;
    }
  }

  /** Owner is the caller unless they may reassign (Admin), in which case it must be an active Admin or Sales user. */
  private async resolveOwner(tx: Prisma.TransactionClient, user: SessionUser, requested: string | undefined): Promise<string> {
    // D-018: the CEO works on projects but does not own them; they say which project manager does.
    if (user.role === 'CEO' && !requested) throw new AppError(400, 'VALIDATION_FAILED', 'Choose the project manager for this project.');
    if (!requested || !can(user, 'projects.reassign')) return user.id;
    const owner = await tx.user.findUnique({ where: { id: requested } });
    // D-021: projects belong to project managers only.
    if (!owner || !owner.active || owner.role !== 'SALES')
      throw new AppError(400, 'VALIDATION_FAILED', 'Choose an active Project Manager as owner.');
    // D-024: a CEO assigns projects within their own team.
    if (user.role === 'CEO' && owner.managerId !== user.id)
      throw new AppError(400, 'VALIDATION_FAILED', 'Choose a project manager from your team.');
    return owner.id;
  }

  async update(user: SessionUser, id: string, input: UpdateProjectInput): Promise<ProjectDetail> {
    // A new currency needs a new rate (D-020); looked up before the transaction.
    const fx = input.currency ? await this.fxFields(input.currency, await this.settings.today()) : null;
    await this.prisma.$transaction(async (tx) => {
      const before = await this.loadForWrite(id, user, tx);
      if (before.updatedAt.toISOString() !== input.updatedAt) {
        throw conflict('CONFLICT', 'This project was changed by someone else. Reload and try again.');
      }
      if (input.currency && input.currency !== before.currency && before.milestones.length > 0) {
        throw new RuleViolation('M-3', 'The currency cannot change once the project has milestones.');
      }
      if (input.clientId && input.clientId !== before.clientId) await this.assertClientMove(tx, before, input.clientId);
      if (input.phaseKind && !before.parentProjectId) throw new RuleViolation('U-4', 'Only a phase of another project has a phase type.');
      const startDate = input.startDate !== undefined ? input.startDate : isoDate(before.startDate);
      const durationValue = input.durationValue !== undefined ? input.durationValue : before.durationValue;
      const durationUnit = input.durationUnit !== undefined ? input.durationUnit : before.durationUnit;
      // Conditional on the version the editor saw: a concurrent save that committed first makes this match 0 rows.
      const { count } = await tx.project.updateMany({
        where: { id, updatedAt: before.updatedAt },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
          ...(input.phaseKind !== undefined ? { phaseKind: input.phaseKind } : {}),
          ...(input.currency !== undefined && input.currency !== before.currency ? { currency: input.currency, ...fx } : {}),
          ...(input.expectedAmountMinor !== undefined ? { expectedAmountMinor: minorFromJson(input.expectedAmountMinor) } : {}),
          startDate: toDate(startDate),
          durationValue,
          durationUnit,
          endDate: toDate(endDateFor(startDate, durationValue, durationUnit)), // D-1
        },
      });
      if (count === 0) throw conflict('CONFLICT', 'This project was changed by someone else. Reload and try again.');
      const after = await tx.project.findUniqueOrThrow({ where: { id } });
      const pick = (p: typeof after) => ({
        name: p.name,
        clientId: p.clientId,
        phaseKind: p.phaseKind,
        description: p.description,
        tags: p.tags,
        currency: p.currency,
        expectedAmountMinor: p.expectedAmountMinor,
        startDate: p.startDate,
        durationValue: p.durationValue,
        durationUnit: p.durationUnit,
      });
      const diff = changedFields(pick(before), pick(after));
      if (diff) await this.audit.record(tx, { actorId: user.id, action: 'project.update', entity: 'Project', entityId: id, ...diff });
      if (input.expectedAmountMinor !== undefined) await this.assertMilestonesWithinValue(tx, id);
    });
    return this.get(id, user);
  }

  /**
   * MS-5 (D-044): a project's (or phase's) milestones add up to at most its contract value, the booking plus upsells.
   * Called inside the writing transaction, after the change, so a refusal rolls the change back.
   */
  async assertMilestonesWithinValue(tx: Prisma.TransactionClient, projectId: string): Promise<void> {
    const p = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        currency: true,
        expectedAmountMinor: true,
        upsellEntries: { select: { amountMinor: true } },
        milestones: { select: { amountMinor: true } },
      },
    });
    const value = p.upsellEntries.reduce((s, u) => s + u.amountMinor, p.expectedAmountMinor);
    const scheduled = p.milestones.reduce((s, m) => s + m.amountMinor, 0n);
    if (scheduled > value) {
      throw new RuleViolation(
        'MS-5',
        `Milestones add up to ${formatMoney(scheduled, p.currency)}, more than the project's value of ${formatMoney(value, p.currency)}. ` +
          'Lower a milestone or raise the booking amount.',
      );
    }
  }

  /** D-027: a project may move to another active client billed in its currency; extra-work links stay within one client (U-2). */
  private async assertClientMove(
    tx: Prisma.TransactionClient,
    project: { id: string; currency: string; parentProjectId: string | null },
    clientId: string,
  ) {
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { currency: true, archivedAt: true } });
    if (!client || client.archivedAt) throw notFound();
    if (client.currency !== project.currency) {
      throw new RuleViolation('M-3', `Choose a client billed in ${project.currency}; this one is billed in ${client.currency}.`);
    }
    const linked = project.parentProjectId || (await tx.project.count({ where: { parentProjectId: project.id } })) > 0;
    if (linked) throw new RuleViolation('U-2', 'This project is linked to extra work, so it stays with its client.');
  }

  async changeStatus(user: SessionUser, id: string, to: ProjectStatus): Promise<ProjectDetail> {
    const today = await this.settings.today();
    // Confirming fixes the converted contract value at that day's rate (looked up before the transaction).
    const current = await this.prisma.project.findUnique({ where: { id }, select: { currency: true, wonAt: true } });
    const confirming = !!current && !current.wonAt && ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].includes(to);
    const fx = confirming ? await this.fxFields(current.currency, today) : null;
    await this.prisma.$transaction(async (tx) => {
      const p = await this.loadForWrite(id, user, tx);
      const check = checkTransition(p.status, to, {
        // D-021: the CEO (not the Admin, who sees no projects) may move a project to any stage.
        isAdmin: user.role === 'CEO',
        milestones: p.milestones.map((m) => ({ dueDate: isoDate(m.dueDate) })),
        hasPayments: p.milestones.some((m) => m.payments.length > 0),
      });
      if (!check.ok) throw new RuleViolation(check.rule, check.message);
      const dates = statusDates(p.status, to, { wonAt: isoDate(p.wonAt), closedAt: isoDate(p.closedAt) }, today);
      await tx.project.update({
        where: { id },
        data: {
          status: to,
          wonAt: toDate(dates.wonAt),
          closedAt: toDate(dates.closedAt),
          // Keep an older rate if today's cannot be found.
          ...(fx?.fxRate ? fx : {}),
        },
      });
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'project.status',
        entity: 'Project',
        entityId: id,
        before: { status: p.status },
        after: { status: to },
      });
    });
    return this.get(id, user);
  }

  async changeOwner(user: SessionUser, id: string, ownerId: string): Promise<ProjectDetail> {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.load(id, user, tx);
      const newOwner = await this.resolveOwner(tx, user, ownerId);
      if (newOwner === p.ownerId) return;
      await tx.project.update({ where: { id }, data: { ownerId: newOwner } });
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'project.owner',
        entity: 'Project',
        entityId: id,
        before: { ownerId: p.ownerId },
        after: { ownerId: newOwner },
      });
    });
    return this.get(id, user);
  }

  /** U-2: the parent must be a visible project of the same client, and the link must not create a loop. */
  private async assertParent(
    tx: Prisma.TransactionClient,
    user: SessionUser,
    childId: string | null,
    clientId: string,
    parentId: string,
  ): Promise<void> {
    const parent = await tx.project.findUnique({
      where: { id: parentId },
      select: { id: true, clientId: true, ownerId: true, archivedAt: true },
    });
    if (!parent || parent.archivedAt || !can(user, 'projects.read', { ownerId: parent.ownerId })) {
      throw new RuleViolation('U-2', 'Choose an existing project as the original project.');
    }
    if (parent.clientId !== clientId) throw new RuleViolation('U-2', 'Extra work must belong to the same client as the original project.');
    if (childId) {
      const links = await tx.project.findMany({ where: { clientId }, select: { id: true, parentProjectId: true } });
      const parentOf = new Map(links.map((l) => [l.id, l.parentProjectId]));
      if (wouldCreateCycle(childId, parentId, (id) => parentOf.get(id) ?? null)) {
        throw new RuleViolation('U-2', 'A project cannot be extra work for itself or for one of its own extra-work projects.');
      }
    }
  }

  async setParent(user: SessionUser, id: string, parentId: string | null): Promise<ProjectDetail> {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.loadForWrite(id, user, tx);
      if (parentId) await this.assertParent(tx, user, id, p.clientId, parentId);
      if (p.parentProjectId === parentId) return;
      await tx.project.update({ where: { id }, data: { parentProjectId: parentId } });
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'project.parent.set',
        entity: 'Project',
        entityId: id,
        before: { parentProjectId: p.parentProjectId },
        after: { parentProjectId: parentId },
      });
    });
    return this.get(id, user);
  }

  async addUpsell(user: SessionUser, id: string, input: UpsellEntryInput): Promise<ProjectDetail> {
    const today = await this.settings.today();
    await this.prisma.$transaction(async (tx) => {
      const p = await this.loadForWrite(id, user, tx);
      if (!p.wonAt) throw new RuleViolation('U-1', 'Extra work amounts can only be added to a confirmed project.');
      if (input.date > today) throw new RuleViolation('U-1', 'The extra work date cannot be in the future.');
      // D-038: with a due date the amount is billed through a new milestone of its own.
      const milestone = input.dueDate
        ? await tx.milestone.create({
            data: {
              projectId: id,
              number: p.milestones.length + 1,
              title: input.note?.trim() || 'Upsell',
              amountMinor: minorFromJson(input.amountMinor),
              dueDate: toDate(input.dueDate),
              createdById: user.id,
            },
          })
        : null;
      const entry = await tx.upsellEntry.create({
        data: {
          projectId: id,
          amountMinor: minorFromJson(input.amountMinor),
          date: toDate(input.date)!,
          note: input.note ?? null,
          milestoneId: milestone?.id ?? null,
          createdById: user.id,
        },
      });
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'project.upsell.add',
        entity: 'Project',
        entityId: id,
        after: { upsellEntryId: entry.id, amountMinor: entry.amountMinor.toString(), date: input.date },
      });
    });
    return this.get(id, user);
  }

  async removeUpsell(user: SessionUser, id: string, entryId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.loadForWrite(id, user, tx);
      const entry = await tx.upsellEntry.findFirst({
        where: { id: entryId, projectId: id },
        include: { milestone: { select: { id: true, _count: { select: { payments: true } } } } },
      });
      if (!entry) throw notFound();
      if (entry.milestone && entry.milestone._count.payments > 0) {
        throw new RuleViolation('MS-1', 'This upsell is already being paid through its milestone, so it cannot be removed.');
      }
      await tx.upsellEntry.delete({ where: { id: entryId } });
      if (entry.milestone) {
        // D-038: its own milestone goes with it; the rest keep 1..n without gaps (MS-1).
        await tx.milestone.delete({ where: { id: entry.milestone.id } });
        const rest = await tx.milestone.findMany({ where: { projectId: id }, orderBy: { number: 'asc' }, select: { id: true } });
        for (const [i, m] of rest.entries()) await tx.milestone.update({ where: { id: m.id }, data: { number: 1000 + i } });
        for (const [i, m] of rest.entries()) await tx.milestone.update({ where: { id: m.id }, data: { number: i + 1 } });
      }
      await this.assertMilestonesWithinValue(tx, id);
      await this.audit.record(tx, {
        actorId: user.id,
        action: 'project.upsell.remove',
        entity: 'Project',
        entityId: id,
        before: { upsellEntryId: entry.id, amountMinor: entry.amountMinor.toString(), date: isoDate(entry.date) },
      });
    });
  }

  /** The project's own audit trail, visible to anyone who may read the project (unlike the global log). */
  async activity(user: SessionUser, id: string) {
    await this.load(id, user);
    const items = await this.prisma.auditLog.findMany({
      where: { entity: 'Project', entityId: id },
      orderBy: { at: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, name: true } } },
    });
    return {
      items: items.map((i) => ({ id: i.id, action: i.action, at: i.at.toISOString(), actor: i.actor, before: i.before, after: i.after })),
    };
  }
}
