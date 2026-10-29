import { Injectable } from '@nestjs/common';
import { type Prisma } from '@salescrm/database';
import { type BillingPage, type BillingQuery } from '@salescrm/schemas';
import { currencyDigits, minorToJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { ownerWhere } from '../../common/ownership';
import { PrismaService } from '../prisma/prisma.module';
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

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** Completed Billing (docs/08 S7): every payment, reversals included, scoped by `billing.read`. */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

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
    const [rows, total, sum] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where, _sum: { amountMinor: true } }),
    ]);
    return {
      items: rows.map(toPaymentDto),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalMinor: minorToJson(sum._sum.amountMinor ?? 0n),
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
        p.createdBy.name,
        p.reversesPaymentId ?? '',
      ]
        .map(csvCell)
        .join(',');
    });
    return [header.join(','), ...lines].join('\n') + '\n';
  }
}
