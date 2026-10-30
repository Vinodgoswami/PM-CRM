import { type Dashboard } from '@salescrm/schemas';
import { currencyDigits, minorFromJson } from '@salescrm/types';

const BOM = String.fromCharCode(0xfeff);

/** Minor units → plain major-unit string ("1500.50"), exact (no floating point). */
function major(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  const v = minorFromJson(minor);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const unit = 10n ** BigInt(d);
  const frac = d > 0 ? `.${String(abs % unit).padStart(d, '0')}` : '';
  return `${neg ? '-' : ''}${abs / unit}${frac}`;
}

/** Quote a text cell; text starting with = + - @ is prefixed with ' so spreadsheets never run it as a formula. */
function text(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n']/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The dashboard's tables as one CSV (docs/09 Export): amounts in major units with a currency column. */
export function dashboardCsv(data: Dashboard): string {
  const c = data.currency;
  const m = (minor: number) => major(minor, c);
  const k = data.kpis;
  const rows: string[][] = [
    ['Key figures', `${data.period.from ?? 'all time'} to ${data.period.to ?? ''}`],
    ['Figure', 'Amount', 'Currency'],
    ['Booked', m(k.bookedMinor), c],
    ['Collected', m(k.collectedMinor), c],
    ['Expected in period', m(k.expectedMinor), c],
    ['Outstanding', m(k.outstandingMinor), c],
    ['Overdue', m(k.overdueMinor), c],
    ['Due next 30 days', m(k.dueNext30Minor), c],
    ['Pipeline', m(k.pipelineMinor), c],
    ['Upsell', m(k.upsellMinor), c],
    ['Avg deal', k.avgDealMinor === null ? '' : m(k.avgDealMinor), c],
    ['Projects won', String(k.wonCount)],
    ['Win rate %', k.winRate === null ? '' : String(Math.round(k.winRate * 100))],
    ['Collection rate %', k.collectionRate === null ? '' : String(Math.round(k.collectionRate * 100))],
    ['Avg days to pay', k.avgDaysToPay === null ? '' : String(k.avgDaysToPay)],
    [],
    ['Monthly'],
    ['Month', 'Booked', 'Collected', 'Expected', 'Currency'],
    ...data.monthly.map((x) => [x.month, m(x.bookedMinor), m(x.collectedMinor), m(x.expectedMinor), c]),
    [],
    ['Quarters'],
    ['Quarter', 'Booked', 'Collected', 'Booked last year', 'Collected last year', 'Currency'],
    ...data.quarters.map((q) => [q.label, m(q.bookedMinor), m(q.collectedMinor), m(q.prevBookedMinor), m(q.prevCollectedMinor), c]),
    [],
    ['Revenue by client'],
    ['Client', 'Booked', 'Collected', 'Currency'],
    ...data.clientRevenue.map((x) => [text(x.name), m(x.bookedMinor), m(x.collectedMinor), c]),
    [],
    ['Pipeline'],
    ['Status', 'Projects', 'Value', 'Currency'],
    ...data.funnel.map((f) => [f.status, String(f.count), m(f.valueMinor), c]),
    [],
    ['Overdue milestones'],
    ['Project', 'Client', 'Milestone', 'Due date', 'Days overdue', 'Salesperson', 'Balance', 'Currency'],
    ...data.overdue.map((o) => [
      o.project.code,
      text(o.client.name),
      text(`M${o.number} ${o.title}`),
      o.dueDate,
      String(o.daysOverdue),
      text(o.owner.name),
      m(o.balanceMinor),
      c,
    ]),
    ...(data.team
      ? [
          [],
          ['Team performance'],
          [
            'Salesperson',
            'Booked',
            'Collected',
            'Outstanding',
            'Overdue',
            'Upsell',
            'Win rate %',
            'Avg deal',
            'Active projects',
            'Currency',
          ],
          ...data.team.map((t) => [
            text(t.user.name),
            m(t.bookedMinor),
            m(t.collectedMinor),
            m(t.outstandingMinor),
            m(t.overdueMinor),
            m(t.upsellMinor),
            t.winRate === null ? '' : String(Math.round(t.winRate * 100)),
            t.avgDealMinor === null ? '' : m(t.avgDealMinor),
            String(t.activeProjects),
            c,
          ]),
        ]
      : []),
  ];
  // BOM so Excel opens the file as UTF-8 (₹ and names survive).
  return `${BOM}${rows.map((r) => r.join(',')).join('\r\n')}\r\n`;
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
