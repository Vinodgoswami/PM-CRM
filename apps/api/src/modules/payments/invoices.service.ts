import { Injectable } from '@nestjs/common';
import { can } from '@salescrm/auth/permissions';
import { INVOICE_GROUP_ORDER, invoiceGroup, milestoneStatus } from '@salescrm/core';
import { type InvoiceItem, type InvoicesResponse } from '@salescrm/schemas';
import { minorToJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { ownerWhere } from '../../common/ownership';
import { PrismaService } from '../prisma/prisma.module';
import { isoDate } from '../projects/project-money';
import { convertMinor } from '@salescrm/types';
import { projectRate } from '../fx/to-base';
import { SettingsService } from '../settings/settings.service';

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Upcoming Invoices (docs/08 S2): every unpaid milestone of booked work, grouped by when it is due. */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async list(user: SessionUser, q: { clientId?: string; ownerId?: string }): Promise<InvoicesResponse> {
    const [settings, today] = await Promise.all([this.settings.get(), this.settings.today()]);
    const milestones = await this.prisma.milestone.findMany({
      where: {
        project: {
          archivedAt: null,
          status: { in: ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'] },
          ...(q.clientId ? { clientId: q.clientId } : {}),
          ...(q.ownerId ? { ownerId: q.ownerId } : {}),
          ...ownerWhere(user, 'invoices.read'), // last, so a filter can never widen the scope
        },
      },
      include: {
        payments: { select: { amountMinor: true } },
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            currency: true,
            fxRate: true,
            fxBaseCurrency: true,
            ownerId: true,
            client: { select: { id: true, name: true } },
            owner: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { number: 'asc' }],
    });

    let otherCurrencyItems = 0;
    const groups = new Map<InvoiceItem['status'] | string, { totalMinor: bigint; items: InvoiceItem[] }>();
    for (const m of milestones) {
      const paid = m.payments.reduce((s, p) => s + p.amountMinor, 0n);
      const balance = m.amountMinor - paid;
      if (balance <= 0n) continue;
      const due = isoDate(m.dueDate);
      const key = invoiceGroup(due, today);
      const group = groups.get(key) ?? { totalMinor: 0n, items: [] };
      // D-020: listed in its own currency, summed in the base currency at the project's saved rate (M-4 when none).
      const rate = projectRate(m.project, settings.baseCurrency);
      const conv = (x: bigint) => convertMinor(x, rate!, m.project.currency, settings.baseCurrency);
      const baseBalance = rate ? conv(m.amountMinor) - conv(paid) : null;
      if (baseBalance !== null) group.totalMinor += baseBalance;
      else otherCurrencyItems += 1;
      group.items.push({
        milestoneId: m.id,
        number: m.number,
        title: m.title,
        invoiceId: m.invoiceId,
        amountMinor: minorToJson(m.amountMinor),
        balanceMinor: minorToJson(balance),
        baseBalanceMinor: baseBalance === null ? null : minorToJson(baseBalance),
        dueDate: due,
        daysFromToday: due ? daysBetween(today, due) : null,
        status: milestoneStatus({ amountMinor: m.amountMinor, paidMinor: paid, dueDate: due }, today, settings.dueSoonDays),
        currency: m.project.currency,
        canPay: can(user, 'payments.create', { ownerId: m.project.ownerId }),
        canEdit: can(user, 'projects.write', { ownerId: m.project.ownerId }),
        project: { id: m.project.id, code: m.project.code, name: m.project.name },
        client: m.project.client,
        owner: m.project.owner,
      });
      groups.set(key, group);
    }
    return {
      currency: settings.baseCurrency,
      otherCurrencyItems,
      groups: INVOICE_GROUP_ORDER.filter((k) => groups.has(k)).map((k) => {
        const g = groups.get(k)!;
        return { key: k, totalMinor: minorToJson(g.totalMinor), count: g.items.length, items: g.items };
      }),
    };
  }
}
