import { Injectable } from '@nestjs/common';
import { scopeFor } from '@salescrm/auth/permissions';
import {
  agingBuckets,
  cashInForecast,
  comparableRange,
  fyOf,
  INVOICE_GROUP_ORDER,
  invoiceGroup,
  type MetricProject,
  monthlySeries,
  periodRange,
  pipelineFunnel,
  quarterComparison,
  summarise,
  yearOverYear,
} from '@salescrm/core';
import { type Dashboard, type DashboardQuery } from '@salescrm/schemas';
import { minorToJson } from '@salescrm/types';
import { type SessionUser } from '../../common/current-user';
import { PrismaService } from '../prisma/prisma.module';
import { isoDate } from '../projects/project-money';
import { inBase, rowInDisplay } from '../fx/to-base';
import { can } from '@salescrm/auth/permissions';
import { SettingsService } from '../settings/settings.service';

const j = minorToJson;
const EVER = { from: '0000-01-01', to: '9999-12-31' };
const BOOKED: string[] = ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

/** docs/09: one call for KPIs, charts, team performance and the two tables. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * `display` (D-036): show the figures in the viewer's own currency. Projects already in that currency use their own
   * amounts; the rest go through the base currency and then today's rate (`rate` = display units per base unit).
   */
  async get(user: SessionUser, q: DashboardQuery, display?: { currency: string; rate: string }): Promise<Dashboard> {
    const [settings, today] = await Promise.all([this.settings.get(), this.settings.today()]);
    // Company view (CEO / Admin) may narrow to one owner; everyone else is limited to their own projects.
    const company = scopeFor(user.role, 'dashboard.company') === 'all';
    const ownerId = company ? q.ownerId : user.id;

    const all = await this.prisma.project.findMany({
      where: { archivedAt: null, ...(ownerId ? { ownerId } : {}) },
      include: {
        client: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        upsellEntries: { select: { amountMinor: true, date: true } },
        milestones: {
          select: {
            id: true,
            number: true,
            title: true,
            amountMinor: true,
            dueDate: true,
            payments: {
              select: {
                id: true,
                amountMinor: true,
                paymentDate: true,
                invoiceId: true,
                createdAt: true,
                baseAmountMinor: true,
                baseCurrency: true,
              },
            },
          },
        },
      },
    });
    // D-020: every project is converted to the base currency at its saved rate; one without a rate is left out and
    // counted for a note (M-4).
    const base = settings.baseCurrency;
    const rows = all.flatMap((p) => {
      if (display && p.currency === display.currency) return inBase(p, p.currency) ?? [];
      const row = inBase(p, base);
      if (!row) return [];
      return display ? rowInDisplay(row, display.rate, base, display.currency) : row;
    });
    const metric: MetricProject[] = rows.map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      clientId: p.clientId,
      status: p.status,
      wonAt: isoDate(p.wonAt),
      closedAt: isoDate(p.closedAt),
      expectedAmountMinor: p.expectedAmountMinor,
      // D-037: a phase that is part of the original scope is initial booking, not upsell.
      isUpsell: p.parentProjectId !== null && p.phaseKind === 'UPSELL',
      upsellEntries: p.upsellEntries.map((u) => ({ amountMinor: u.amountMinor, date: isoDate(u.date)! })),
      milestones: p.milestones.map((m) => ({
        amountMinor: m.amountMinor,
        dueDate: isoDate(m.dueDate),
        payments: m.payments.map((x) => ({
          amountMinor: x.amountMinor,
          collectedMinor: x.collectedMinor,
          paymentDate: isoDate(x.paymentDate)!,
        })),
      })),
    }));

    const range = periodRange(q.period, today, settings.fyStartMonth);
    const r = range.from && range.to ? { from: range.from, to: range.to } : EVER;
    const s = summarise(metric, r, today);
    const prevRange = comparableRange(q.period, today, settings.fyStartMonth);
    const prev = prevRange.from && prevRange.to ? summarise(metric, { from: prevRange.from, to: prevRange.to }, today) : null;

    const [y, m] = today.split('-').map(Number) as [number, number];
    const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 12 + i, 1)).toISOString().slice(0, 7));

    // Top clients by collected in the period.
    const byClient = new Map<string, { id: string; name: string; booked: bigint; collected: bigint }>();
    for (const [i, p] of rows.entries()) {
      const one = summarise([metric[i]!], r, today);
      const c = byClient.get(p.client.id) ?? { id: p.client.id, name: p.client.name, booked: 0n, collected: 0n };
      c.booked += one.bookedMinor;
      c.collected += one.collectedMinor;
      byClient.set(p.client.id, c);
    }

    const team = company
      ? [...new Map(rows.map((p) => [p.owner.id, p.owner])).values()]
          .map((owner) => {
            const mine = metric.filter((p) => p.ownerId === owner.id);
            const t = summarise(mine, r, today);
            return {
              user: owner,
              bookedMinor: j(t.bookedMinor),
              collectedMinor: j(t.collectedMinor),
              outstandingMinor: j(t.outstandingMinor),
              overdueMinor: j(t.overdueMinor),
              upsellMinor: j(t.upsellMinor),
              activeProjects: mine.filter((p) => p.status === 'ACTIVE').length,
              winRate: t.winRate,
              avgDealMinor: t.wonCount > 0 ? j(t.wonExpectedMinor / BigInt(t.wonCount)) : null,
              monthly: monthlySeries(mine, months, today).map((x) => ({
                month: x.month,
                bookedMinor: j(x.bookedMinor),
                collectedMinor: j(x.collectedMinor),
              })),
            };
          })
          .sort((a, b) => b.bookedMinor - a.bookedMinor)
      : null;

    const in30 = new Date(Date.UTC(y, m - 1, Number(today.slice(8)) + 30)).toISOString().slice(0, 10);
    const upcoming = rows
      .flatMap((p) =>
        p.milestones.map((ms) => ({
          p,
          ms,
          balance: ms.amountMinor - ms.payments.reduce((a, x) => a + x.amountMinor, 0n),
          due: isoDate(ms.dueDate),
        })),
      )
      .filter((x) => x.balance > 0n && x.due !== null && x.due >= today && x.due <= in30)
      .sort((a, b) => a.due!.localeCompare(b.due!))
      .slice(0, 8)
      .map(({ p, ms, balance, due }) => ({
        milestoneId: ms.id,
        number: ms.number,
        title: ms.title,
        balanceMinor: j(balance),
        dueDate: due!,
        project: { id: p.id, code: p.code, name: p.name },
        client: p.client,
      }));

    const overdue = rows
      .flatMap((p) =>
        BOOKED.includes(p.status)
          ? p.milestones.map((ms) => ({
              p,
              ms,
              balance: ms.amountMinor - ms.payments.reduce((a, x) => a + x.amountMinor, 0n),
              due: isoDate(ms.dueDate),
            }))
          : [],
      )
      .filter((x) => x.balance > 0n && x.due !== null && x.due < today)
      .sort((a, b) => a.due!.localeCompare(b.due!))
      .slice(0, 10)
      .map(({ p, ms, balance, due }) => ({
        milestoneId: ms.id,
        number: ms.number,
        title: ms.title,
        balanceMinor: j(balance),
        dueDate: due!,
        daysOverdue: Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due!}T00:00:00Z`)) / 86_400_000),
        project: { id: p.id, code: p.code, name: p.name },
        client: p.client,
        owner: p.owner,
      }));

    // C6: top 10 by collected, the rest folded into "Others".
    const ranked = [...byClient.values()]
      .filter((c) => c.collected > 0n || c.booked > 0n)
      .sort((a, b) => (b.collected > a.collected ? 1 : b.collected < a.collected ? -1 : 0));
    const rest = ranked.slice(10);
    const clientRevenue = [
      ...ranked.slice(0, 10).map((c) => ({ id: c.id, name: c.name, bookedMinor: j(c.booked), collectedMinor: j(c.collected) })),
      ...(rest.length
        ? [
            {
              id: null,
              name: `Others (${rest.length})`,
              bookedMinor: j(rest.reduce((a, c) => a + c.booked, 0n)),
              collectedMinor: j(rest.reduce((a, c) => a + c.collected, 0n)),
            },
          ]
        : []),
    ];
    const fyFrom = fyOf(range.from ?? today, settings.fyStartMonth).start;

    const upcomingBookings = rows
      .filter((p) => p.status === 'LEAD' || p.status === 'PROPOSAL')
      .sort((a, b) => (b.expectedAmountMinor > a.expectedAmountMinor ? 1 : b.expectedAmountMinor < a.expectedAmountMinor ? -1 : 0))
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        expectedAmountMinor: j(p.expectedAmountMinor),
        startDate: isoDate(p.startDate),
        client: p.client,
        owner: p.owner,
      }));

    const recentPayments = rows
      .flatMap((p) => p.milestones.flatMap((ms) => ms.payments.map((pay) => ({ p, pay }))))
      .sort((a, b) => b.pay.paymentDate.getTime() - a.pay.paymentDate.getTime() || b.pay.createdAt.getTime() - a.pay.createdAt.getTime())
      .slice(0, 6)
      .map(({ p, pay }) => ({
        id: pay.id,
        amountMinor: j(pay.collectedMinor),
        paymentDate: isoDate(pay.paymentDate)!,
        invoiceId: pay.invoiceId,
        project: { id: p.id, code: p.code, name: p.name },
        client: p.client,
      }));

    const aging = agingBuckets(metric, today);

    // Unpaid balances by when they fall due (same groups as Upcoming Invoices), totals only.
    const summary = new Map<string, { count: number; total: bigint }>();
    for (const p of rows) {
      if (!BOOKED.includes(p.status)) continue;
      for (const ms of p.milestones) {
        const balance = ms.amountMinor - ms.payments.reduce((a, x) => a + x.amountMinor, 0n);
        if (balance <= 0n) continue;
        const key = invoiceGroup(isoDate(ms.dueDate), today);
        const g = summary.get(key) ?? { count: 0, total: 0n };
        summary.set(key, { count: g.count + 1, total: g.total + balance });
      }
    }
    const upcomingSummary = INVOICE_GROUP_ORDER.filter((k) => summary.has(k)).map((k) => ({
      key: k,
      count: summary.get(k)!.count,
      totalMinor: j(summary.get(k)!.total),
    }));

    // D-022: a viewer who may not see client or project records (the Admin) gets every figure, but no names.
    const anonymous = !can(user, 'projects.read');
    const result: Dashboard = {
      currency: display?.currency ?? settings.baseCurrency,
      conversion: null,
      anonymous,
      upcomingSummary,
      otherCurrencyProjects: all.length - rows.length,
      period: { key: q.period, from: range.from ?? null, to: range.to ?? null },
      kpis: {
        bookedMinor: j(s.bookedMinor),
        upsellMinor: j(s.upsellMinor),
        collectedMinor: j(s.collectedMinor),
        expectedMinor: j(s.expectedMinor),
        collectionRate: s.collectionRate,
        outstandingMinor: j(s.outstandingMinor),
        overdueMinor: j(s.overdueMinor),
        overdueCount: s.overdueCount,
        dueNext30Minor: j(s.dueNext30Minor),
        pipelineMinor: j(s.pipelineMinor),
        wonCount: s.wonCount,
        winRate: s.winRate,
        avgDealMinor: s.wonCount > 0 ? j(s.wonExpectedMinor / BigInt(s.wonCount)) : null,
        avgDaysToPay: s.avgDaysToPay,
      },
      previous: prev ? { bookedMinor: j(prev.bookedMinor), collectedMinor: j(prev.collectedMinor) } : null,
      monthly: monthlySeries(metric, months, today).map((x) => ({
        month: x.month,
        bookedMinor: j(x.bookedMinor),
        collectedMinor: j(x.collectedMinor),
        expectedMinor: j(x.expectedMinor),
      })),
      forecast: cashInForecast(metric, today, 6).map((x) => ({ month: x.month, scheduledMinor: j(x.scheduledMinor) })),
      aging: { d1_30: j(aging.d1_30), d31_60: j(aging.d31_60), d61_90: j(aging.d61_90), d90plus: j(aging.d90plus) },
      quarters: quarterComparison(metric, fyFrom, today).map((x) => ({
        label: x.label,
        bookedMinor: j(x.bookedMinor),
        collectedMinor: j(x.collectedMinor),
        prevBookedMinor: j(x.prevBookedMinor),
        prevCollectedMinor: j(x.prevCollectedMinor),
      })),
      yearOverYear: yearOverYear(metric, fyFrom, today).map((x) => ({
        month: x.month,
        cumulativeMinor: x.cumulativeMinor === null ? null : j(x.cumulativeMinor),
        previousCumulativeMinor: j(x.previousCumulativeMinor),
      })),
      clientRevenue,
      upcomingBookings,
      funnel: pipelineFunnel(metric).map((f) => ({ status: f.status, count: f.count, valueMinor: j(f.valueMinor) })),
      overdue,
      topClients: [...byClient.values()]
        .filter((c) => c.collected > 0n || c.booked > 0n)
        .sort((a, b) => (b.collected > a.collected ? 1 : b.collected < a.collected ? -1 : 0))
        .slice(0, 5)
        .map((c) => ({ id: c.id, name: c.name, bookedMinor: j(c.booked), collectedMinor: j(c.collected) })),
      team,
      upcoming,
      recentPayments,
    };
    return anonymous
      ? { ...result, upcoming: [], overdue: [], recentPayments: [], topClients: [], clientRevenue: [], upcomingBookings: [] }
      : result;
  }
}
