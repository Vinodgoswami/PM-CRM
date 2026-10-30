import { Injectable } from '@nestjs/common';
import { type Prisma } from '@salescrm/database';
import { type BillingPage, type BillingQuery } from '@salescrm/schemas';
import { currencyDigits, minorToJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { ownerWhere } from '../../common/ownership';
import { PrismaService } from '../prisma/prisma.module';
import { SettingsService } from '../settings/settings.service';
import { isoDate } from '../projects/project-money';
import { PAYMENT_INCLUDE, toPaymentDto } from './payments.service';

const day = (d: string) => new Date(`${d}T00:00:00Z`);

/** "1234567" minor INR → "12345.67" with string maths (no floats). */
function majorUnits(minor: bigint, currency: string): string {
  const digits = currencyDigits(currency);
  const negative = minor < 0n;
  const s = (negative ? -minor : minor).toString().padStart(digits + 1, '0');
  const value = digits === 0 ? s : `${s.slice(0, -digits)}.${s.slice(-digits)}`;
  return negative ? `-${value}` : value;
}

/**
 * CSV cell safe to open in Excel / Sheets: values a spreadsheet would run as a formula get a leading quote, and
 * anything with a quote, comma or line break is quoted.
 */
function csvCell(raw: string): string {
  const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/** Completed Billing (docs/08 S7): every payment, reversals included, scoped by `billing.read`. */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private where(user: SessionUser, q: Omit<BillingQuery, 'page' | 'pageSize'>): Prisma.PaymentWhereInput {
    const scope = ownerWhere(user, 'billing.read');
    return {
      ...(q.from || q.to ? { paymentDate: { ...(q.from ? { gte: day(q.from) } : {}), ...(q.to ? { lte: day(q.to) } : {}) } } : {}),
      milestone: {
        ...(q.projectId ? { projectId: q.projectId } : {}),
        // The scope filter comes last so a request filter can never widen it.
        project: { ...(q.clientId ? { clientId: q.clientId } : {}), ...(q.ownerId ? { ownerId: q.ownerId } : {}), ...scope },
      },
    };
  }

  async list(user: SessionUser, q: BillingQuery): Promise<BillingPage> {
    const where = this.where(user, q);
    const { baseCurrency } = await this.settings.get();
    // D-020: the total adds each payment's base-currency amount; a payment with no recorded rate is listed, not summed.
    const baseOnly: Prisma.PaymentWhereInput = { AND: [where, { baseCurrency, baseAmountMinor: { not: null } }] };
    const [rows, total, sum, baseCount] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where: baseOnly, _sum: { baseAmountMinor: true } }),
      this.prisma.payment.count({ where: baseOnly }),
    ]);
    return {
      items: rows.map((r) => toPaymentDto(r, user)),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalMinor: minorToJson(sum._sum.baseAmountMinor ?? 0n),
      otherCurrencyPayments: total - baseCount,
    };
  }

  async csv(user: SessionUser, q: Omit<BillingQuery, 'page' | 'pageSize'>): Promise<string> {
    const rows = await this.prisma.payment.findMany({
      where: this.where(user, q),
      include: PAYMENT_INCLUDE,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });
    const header = [
      'Date',
      'Client',
      'Project code',
      'Project',
      'Milestone',
      'Invoice ID',
      'Amount',
      'Currency',
      'Rate',
      'Base amount',
      'Base currency',
      'Recorded by',
      'Reversal of',
    ];
    const lines = rows.map((p) => {
      const project = p.milestone.project;
      return [
        isoDate(p.paymentDate)!,
        project.client.name,
        project.code,
        project.name,
        p.milestoneLabel,
        p.invoiceId ?? '',
        majorUnits(p.amountMinor, project.currency),
        project.currency,
        p.fxRate?.toString() ?? '',
        p.baseAmountMinor === null || !p.baseCurrency ? '' : majorUnits(p.baseAmountMinor, p.baseCurrency),
        p.baseCurrency ?? '',
        p.createdBy.name,
        p.reversesPaymentId ?? '',
      ]
        .map(csvCell)
        .join(',');
    });
    // The BOM tells Excel the file is UTF-8 (₹ and non-English names would be garbled otherwise).
    return '\uFEFF' + [header.join(','), ...lines].join('\n') + '\n';
  }
}
