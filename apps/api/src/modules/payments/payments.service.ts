import { Injectable } from '@nestjs/common';
import { can } from '@salescrm/auth/permissions';
import { changedFields, checkPayment } from '@salescrm/core';
import { Prisma } from '@salescrm/database';
import { type CreatePaymentInput, type PaymentDto, type UpdatePaymentMetaInput } from '@salescrm/schemas';
import { convertMinor, minorFromJson, minorToJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { AppError, conflict, notFound, RuleViolation } from '../../common/errors';
import { assertCanAccess } from '../../common/ownership';
import { AuditService } from '../audit/audit.service';
import { FxService } from '../fx/fx.service';
import { PrismaService } from '../prisma/prisma.module';
import { isoDate } from '../projects/project-money';
import { ProjectsService } from '../projects/projects.service';
import { SettingsService } from '../settings/settings.service';

export const PAYMENT_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  reversedBy: { select: { id: true } },
  documents: { where: { status: 'READY' }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } },
  milestone: {
    select: {
      projectId: true,
      project: {
        select: { id: true, code: true, name: true, currency: true, ownerId: true, client: { select: { id: true, name: true } } },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

export function toPaymentDto(p: PaymentRow, viewer: SessionUser): PaymentDto {
  const { project } = p.milestone;
  return {
    id: p.id,
    milestoneId: p.milestoneId,
    milestoneLabel: p.milestoneLabel,
    invoiceId: p.invoiceId,
    paymentDate: isoDate(p.paymentDate)!,
    amountMinor: minorToJson(p.amountMinor),
    baseCurrency: p.baseCurrency,
    fxRate: p.fxRate?.toString() ?? null,
    baseAmountMinor: p.baseAmountMinor === null ? null : minorToJson(p.baseAmountMinor),
    reversesPaymentId: p.reversesPaymentId,
    reversedById: p.reversedBy?.id ?? null,
    note: p.note,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
    canEdit: p.reversesPaymentId === null && can(viewer, 'payments.editMeta', { ownerId: project.ownerId }),
    project: { id: project.id, code: project.code, name: project.name, currency: project.currency },
    client: project.client,
    documents: p.documents,
  };
}

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly fx: FxService,
  ) {}

  /** D-020: the rate for a payment in `currency` on `date` (typed, or looked up before any lock is taken). */
  private async rateFor(currency: string, date: string, typed: string | undefined) {
    const base = (await this.settings.get()).baseCurrency;
    if (currency === base) return { base, rate: '1' };
    return { base, rate: typed ?? (await this.fx.get(currency, base, date)).rate };
  }

  private async byKey(user: SessionUser, key: string, milestoneId: string): Promise<PaymentDto | null> {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey: key }, include: PAYMENT_INCLUDE });
    if (!existing) return null;
    if (existing.milestoneId !== milestoneId) throw conflict('CONFLICT', 'This request key was already used for another milestone.');
    return toPaymentDto(existing, user);
  }

  /** F2 "Mark as paid". Returns `created: false` when the same Idempotency-Key was already processed. */
  async create(user: SessionUser, milestoneId: string, key: string | undefined, input: CreatePaymentInput) {
    if (!key || key.length < 8 || key.length > 100) {
      throw new AppError(400, 'VALIDATION_FAILED', 'An Idempotency-Key header (8–100 characters) is required.');
    }
    const replay = await this.byKey(user, key, milestoneId);
    if (replay) return { payment: replay, created: false };

    const today = await this.settings.today();
    // The rate may need a network call, so it is settled before the transaction (and its row lock) starts.
    const target = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: { project: { select: { currency: true } } },
    });
    if (!target) throw notFound();
    const fx = await this.rateFor(target.project.currency, input.paymentDate, input.fxRate);
    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        // Serialise payments on one milestone: two parallel "Mark as paid" must not both fit in the same balance.
        await tx.$queryRaw`SELECT id FROM "Milestone" WHERE id = ${milestoneId} FOR UPDATE`;
        const milestone = await tx.milestone.findUnique({
          where: { id: milestoneId },
          include: { payments: { select: { amountMinor: true } } },
        });
        if (!milestone) throw notFound();
        const project = await this.projects.load(milestone.projectId, user, tx);
        assertCanAccess(user, 'payments.create', project.ownerId, 'write');

        // A concurrent request with the same key may have committed while we waited for the lock.
        if (await tx.payment.findUnique({ where: { idempotencyKey: key }, select: { id: true } })) return null;

        if (!['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].includes(project.status)) {
          throw new RuleViolation('P-8', 'Payments can only be recorded on confirmed work. Move the project to Confirmed or Active first.');
        }
        const paid = milestone.payments.reduce((s, p) => s + p.amountMinor, 0n);
        const amountMinor = minorFromJson(input.amountMinor);
        const check = checkPayment(
          { amountMinor, paymentDate: input.paymentDate },
          { amountMinor: milestone.amountMinor, paidMinor: paid },
          today,
        );
        if (!check.ok) throw new RuleViolation(check.rule, check.message);

        const created = await tx.payment.create({
          data: {
            milestoneId,
            milestoneLabel: input.milestoneLabel ?? `M${milestone.number}`,
            invoiceId: input.invoiceId || null,
            paymentDate: toDate(input.paymentDate),
            amountMinor,
            baseCurrency: fx.base,
            fxRate: fx.rate,
            baseAmountMinor: convertMinor(amountMinor, fx.rate, project.currency, fx.base),
            note: input.note || null,
            idempotencyKey: key,
            createdById: user.id,
          },
          include: PAYMENT_INCLUDE,
        });
        await this.audit.record(tx, {
          actorId: user.id,
          action: 'payment.create',
          entity: 'Project',
          entityId: project.id,
          after: {
            paymentId: created.id,
            milestone: created.milestoneLabel,
            invoiceId: created.invoiceId,
            amountMinor: amountMinor.toString(),
            paymentDate: input.paymentDate,
          },
        });
        return created;
      });
      if (payment) return { payment: toPaymentDto(payment, user), created: true };
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
    const raced = await this.byKey(user, key, milestoneId);
    if (!raced) throw conflict('CONFLICT', 'Please try again.');
    return { payment: raced, created: false };
  }

  private async loadPayment(tx: Prisma.TransactionClient, user: SessionUser, id: string) {
    const payment = await tx.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
    if (!payment) throw notFound();
    await this.projects.load(payment.milestone.projectId, user, tx);
    return payment;
  }

  async updateMeta(user: SessionUser, id: string, input: UpdatePaymentMetaInput): Promise<PaymentDto> {
    const today = await this.settings.today();
    return this.prisma.$transaction(async (tx) => {
      const before = await this.loadPayment(tx, user, id);
      assertCanAccess(user, 'payments.editMeta', before.milestone.project.ownerId, 'write');
      if (input.paymentDate && input.paymentDate > today) throw new RuleViolation('P-6', 'The payment date cannot be in the future.');
      const currency = before.milestone.project.currency;
      const base = before.baseCurrency ?? (await this.settings.get()).baseCurrency;
      const after = await tx.payment.update({
        where: { id },
        data: {
          ...(input.fxRate !== undefined
            ? { baseCurrency: base, fxRate: input.fxRate, baseAmountMinor: convertMinor(before.amountMinor, input.fxRate, currency, base) }
            : {}),
          ...(input.milestoneLabel !== undefined ? { milestoneLabel: input.milestoneLabel } : {}),
          ...(input.invoiceId !== undefined ? { invoiceId: input.invoiceId || null } : {}),
          ...(input.paymentDate !== undefined ? { paymentDate: toDate(input.paymentDate) } : {}),
          ...(input.note !== undefined ? { note: input.note || null } : {}),
        },
        include: PAYMENT_INCLUDE,
      });
      const pick = (p: PaymentRow) => ({
        milestoneLabel: p.milestoneLabel,
        invoiceId: p.invoiceId,
        paymentDate: isoDate(p.paymentDate),
        note: p.note,
        fxRate: p.fxRate?.toString() ?? null,
      });
      const diff = changedFields(pick(before), pick(after));
      if (diff) {
        await this.audit.record(tx, {
          actorId: user.id,
          action: 'payment.update',
          entity: 'Project',
          entityId: before.milestone.projectId,
          before: { paymentId: id, ...diff.before },
          after: { paymentId: id, ...diff.after },
        });
      }
      return toPaymentDto(after, user);
    });
  }

  /** P-5: the only way to correct an amount. One reversal per payment; reversals cannot be reversed. */
  private createReversal(
    tx: Prisma.TransactionClient,
    user: SessionUser,
    original: Pick<
      PaymentRow,
      'id' | 'milestoneId' | 'milestoneLabel' | 'invoiceId' | 'amountMinor' | 'baseCurrency' | 'fxRate' | 'baseAmountMinor'
    >,
    reason: string,
    today: string,
  ) {
    return tx.payment.create({
      data: {
        milestoneId: original.milestoneId,
        milestoneLabel: original.milestoneLabel,
        invoiceId: original.invoiceId,
        paymentDate: toDate(today),
        amountMinor: -original.amountMinor,
        // Mirrors the original in both currencies, so the base totals cancel exactly.
        baseCurrency: original.baseCurrency,
        fxRate: original.fxRate,
        baseAmountMinor: original.baseAmountMinor === null ? null : -original.baseAmountMinor,
        reversesPaymentId: original.id,
        note: reason,
        createdById: user.id,
      },
      include: PAYMENT_INCLUDE,
    });
  }

  /** D-027: reverses every live payment of a milestone (kept in history) so its amount can be changed. */
  async resetMilestone(user: SessionUser, milestoneId: string, reason: string): Promise<{ reversed: number }> {
    const today = await this.settings.today();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const milestone = await tx.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true, number: true } });
        if (!milestone) throw notFound();
        await this.projects.loadForWrite(milestone.projectId, user, tx);
        const live = await tx.payment.findMany({
          where: { milestoneId, reversesPaymentId: null, reversedBy: null },
          include: PAYMENT_INCLUDE,
        });
        for (const original of live) await this.createReversal(tx, user, original, `Reset: ${reason}`, today);
        if (live.length > 0) {
          await this.audit.record(tx, {
            actorId: user.id,
            action: 'milestone.reset',
            entity: 'Project',
            entityId: milestone.projectId,
            after: {
              milestoneId,
              number: milestone.number,
              reversed: live.map((p) => ({ paymentId: p.id, amountMinor: p.amountMinor.toString() })),
              reason,
            },
          });
        }
        return { reversed: live.length };
      });
    } catch (e) {
      if (isUnique(e)) throw conflict('CONFLICT', 'These payments were just changed. Reload and try again.');
      throw e;
    }
  }

  async reverse(user: SessionUser, id: string, reason: string): Promise<PaymentDto> {
    const today = await this.settings.today();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const original = await this.loadPayment(tx, user, id);
        if (original.reversesPaymentId) throw conflict('CONFLICT', 'A reversal cannot be reversed. Record a new payment instead.');
        if (original.reversedBy) throw conflict('CONFLICT', 'This payment has already been reversed.');
        const reversal = await this.createReversal(tx, user, original, reason, today);
        await this.audit.record(tx, {
          actorId: user.id,
          action: 'payment.reverse',
          entity: 'Project',
          entityId: original.milestone.projectId,
          after: { paymentId: original.id, reversalId: reversal.id, amountMinor: reversal.amountMinor.toString(), reason },
        });
        return toPaymentDto(reversal, user);
      });
    } catch (e) {
      if (isUnique(e)) throw conflict('CONFLICT', 'This payment has already been reversed.');
      throw e;
    }
  }
}
