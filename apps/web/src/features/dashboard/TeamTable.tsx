import { type Dashboard } from '@salescrm/schemas';
import { Table, TBody, TD, TH, THead, TR } from '@salescrm/ui';
import { ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
import { formatApiMoney } from '../../lib/money';
import { MiniBars } from './MoreCharts';
import { Panel } from './Panel';

/** docs/09 team performance: one row per salesperson; a row expands to its 12-month trend. */
export function TeamTable({ team, currency }: { team: NonNullable<Dashboard['team']>; currency: string }) {
  const money = (m: number) => formatApiMoney(m, currency);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="Team performance" subtitle="Per salesperson, this period">
      <Table>
        <THead>
          <TR>
            <TH>Salesperson</TH>
            <TH className="text-right">Booked</TH>
            <TH className="text-right">Collected</TH>
            <TH className="text-right">Outstanding</TH>
            <TH className="text-right">Overdue</TH>
            <TH className="text-right">Upsell</TH>
            <TH className="text-right">Win rate</TH>
            <TH className="text-right">Avg deal</TH>
            <TH className="text-right">Active projects</TH>
          </TR>
        </THead>
        <TBody>
          {team.map((t) => (
            <Fragment key={t.user.id}>
              <TR>
                <TD className="font-medium">
                  <button
                    type="button"
                    aria-expanded={open === t.user.id}
                    aria-label={`Show monthly trend for ${t.user.name}`}
                    onClick={() => setOpen(open === t.user.id ? null : t.user.id)}
                    className="inline-flex items-center gap-1.5 hover:text-primary"
                  >
                    <ChevronDown
                      className={`size-4 transition-transform print:hidden ${open === t.user.id ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                    {t.user.name}
                  </button>
                </TD>
                <TD className="text-right tabular-nums">{money(t.bookedMinor)}</TD>
                <TD className="text-right tabular-nums text-success">{money(t.collectedMinor)}</TD>
                <TD className="text-right tabular-nums">{money(t.outstandingMinor)}</TD>
                <TD className={`text-right tabular-nums ${t.overdueMinor > 0 ? 'text-danger' : ''}`}>{money(t.overdueMinor)}</TD>
                <TD className="text-right tabular-nums">{money(t.upsellMinor)}</TD>
                <TD className="text-right tabular-nums">{t.winRate === null ? '—' : `${Math.round(t.winRate * 100)}%`}</TD>
                <TD className="text-right tabular-nums">{t.avgDealMinor === null ? '—' : money(t.avgDealMinor)}</TD>
                <TD className="text-right tabular-nums">{t.activeProjects}</TD>
              </TR>
              {open === t.user.id && (
                <TR>
                  <TD colSpan={9} className="bg-background/60">
                    <MiniBars name={t.user.name} data={t.monthly} currency={currency} />
                  </TD>
                </TR>
              )}
            </Fragment>
          ))}
        </TBody>
      </Table>
    </Panel>
  );
}
