import { MoneyParseError, toMinor } from '@salescrm/types';
import { checkPayment } from './payments';
import { type IsoDate } from './period';

/**
 * CSV import of existing work (roadmap P6-4). One row per milestone: client and project columns repeat, the first row
 * of a project sets its fields, and a repeated milestone title on a later row adds another payment to it. Every rule
 * the app enforces on entry applies here too, so imported data could have been typed in by hand.
 */
export const IMPORT_COLUMNS = [
  'client',
  'client_email',
  'project',
  'status',
  'expected_amount',
  'currency',
  'won_date',
  'closed_date',
  'owner_email',
  'milestone',
  'milestone_amount',
  'due_date',
  'paid_amount',
  'paid_date',
  'invoice_id',
] as const;
type Column = (typeof IMPORT_COLUMNS)[number];
const REQUIRED: Column[] = ['client', 'project', 'expected_amount'];

const STATUSES = ['LEAD', 'PROPOSAL', 'WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'LOST'] as const;
export type ImportStatus = (typeof STATUSES)[number];
const BOOKED: ImportStatus[] = ['WON', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];
const CLOSED: ImportStatus[] = ['COMPLETED', 'LOST'];

export interface ImportPayment {
  amountMinor: bigint;
  paymentDate: IsoDate;
  invoiceId: string | null;
}
export interface ImportMilestone {
  title: string;
  amountMinor: bigint;
  dueDate: IsoDate | null;
  payments: ImportPayment[];
}
export interface ImportProject {
  /** CSV line of the project's first row (line 1 is the header). */
  line: number;
  client: { name: string; email: string | null };
  name: string;
  status: ImportStatus;
  currency: string;
  expectedAmountMinor: bigint;
  wonAt: IsoDate | null;
  closedAt: IsoDate | null;
  ownerEmail: string | null;
  milestones: ImportMilestone[];
}
export interface ImportError {
  line: number;
  message: string;
}

/** RFC 4180 CSV: quoted fields, "" escapes, CR/LF or LF rows; blank lines and a leading BOM are ignored. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const endRow = () => {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    field = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') endRow();
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

function isCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD, or DD/MM/YYYY and DD-MM-YYYY as spreadsheets in India write them. Null when not a real date. */
function parseDate(v: string): IsoDate | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : [];
  if (!y) return null;
  const out = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const back = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(back.getTime()) && back.toISOString().slice(0, 10) === out ? out : null;
}

export function parseImport(
  csv: string,
  opts: { today: IsoDate; baseCurrency: string },
): { projects: ImportProject[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const [header, ...body] = parseCsv(csv);
  const cols = (header ?? []).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !cols.includes(c));
  if (missing.length) return { projects: [], errors: [{ line: 1, message: `Missing column: ${missing.join(', ')}.` }] };

  const projects = new Map<string, ImportProject & { firstRow: Record<string, string> }>();
  const broken = new Set<string>();

  body.forEach((cells, i) => {
    const line = i + 2;
    const get = (c: Column) => (cells[cols.indexOf(c)] ?? '').trim();
    const fail = (message: string) => errors.push({ line, message });
    const client = get('client');
    const name = get('project');
    if (!client) return fail('Client is required.');
    if (!name) return fail('Project is required.');
    const key = `${client.toLowerCase()}\u0000${name.toLowerCase()}`;
    if (broken.has(key)) return;

    const money = (c: Column, currency: string): bigint | null => {
      try {
        return toMinor(get(c), currency);
      } catch (e) {
        if (!(e instanceof MoneyParseError)) throw e;
        fail(`${c}: "${get(c)}" is not a valid amount (${e.reason}).`);
        return null;
      }
    };
    const date = (c: Column): IsoDate | null | false => {
      if (!get(c)) return null;
      const d = parseDate(get(c));
      if (!d) fail(`${c}: "${get(c)}" is not a date (use YYYY-MM-DD or DD/MM/YYYY).`);
      return d ?? false;
    };

    let project = projects.get(key);
    if (!project) {
      const statusText = (get('status') || 'ACTIVE').toUpperCase().replace(' ', '_');
      if (!(STATUSES as readonly string[]).includes(statusText)) {
        broken.add(key);
        return fail(`status "${get('status')}" is not one of ${STATUSES.join(', ')}.`);
      }
      const status = statusText as ImportStatus;
      const currency = (get('currency') || opts.baseCurrency).toUpperCase();
      if (!isCurrency(currency)) {
        broken.add(key);
        return fail(`currency "${get('currency')}" is not a three-letter currency code.`);
      }
      const expected = money('expected_amount', currency);
      const wonAt = date('won_date');
      const closedAt = date('closed_date');
      if (expected === null || wonAt === false || closedAt === false) return void broken.add(key);
      const needsWon = BOOKED.includes(status);
      if (needsWon && !wonAt) {
        broken.add(key);
        return fail(`won_date is required for status ${status}.`);
      }
      if (CLOSED.includes(status) && !closedAt) {
        broken.add(key);
        return fail(`closed_date is required for status ${status}.`);
      }
      if ((wonAt && wonAt > opts.today) || (closedAt && closedAt > opts.today)) {
        broken.add(key);
        return fail('won_date and closed_date cannot be in the future.');
      }
      project = {
        line,
        client: { name: client, email: get('client_email') || null },
        name,
        status,
        currency,
        expectedAmountMinor: expected,
        wonAt: status === 'LEAD' || status === 'PROPOSAL' ? null : (wonAt ?? null),
        closedAt: CLOSED.includes(status) ? closedAt : null,
        ownerEmail: get('owner_email') || null,
        milestones: [],
        firstRow: Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, get(c)])),
      };
      projects.set(key, project);
    } else {
      // Later rows of a project may leave project fields blank, but may not change them.
      for (const c of ['status', 'expected_amount', 'currency', 'won_date', 'closed_date', 'owner_email'] as const) {
        if (get(c) && get(c) !== project.firstRow[c]) {
          broken.add(key);
          return fail(`${c} differs from line ${project.line} for the same project.`);
        }
      }
    }

    const title = get('milestone');
    if (!title) {
      if (get('paid_amount')) fail('paid_amount needs a milestone on the same row.');
      return;
    }
    let milestone = project.milestones.find((m) => m.title.toLowerCase() === title.toLowerCase());
    if (!milestone) {
      const amount = money('milestone_amount', project.currency);
      const due = date('due_date');
      if (amount === null || due === false) return void broken.add(key);
      milestone = { title, amountMinor: amount, dueDate: due, payments: [] };
      project.milestones.push(milestone);
    } else if (get('milestone_amount') && money('milestone_amount', project.currency) !== milestone.amountMinor) {
      broken.add(key);
      return fail(`milestone_amount for "${title}" differs from an earlier row.`);
    }

    if (!get('paid_amount')) return;
    if (project.status === 'LOST') {
      broken.add(key);
      return fail('PS-6: a Lost project cannot have payments.');
    }
    if (!BOOKED.includes(project.status)) {
      broken.add(key);
      return fail('P-8: payments can only be recorded on Won, Active, On hold or Completed projects.');
    }
    const paid = money('paid_amount', project.currency);
    const paidDate = date('paid_date');
    if (paid === null || paidDate === false) return void broken.add(key);
    if (!paidDate) {
      broken.add(key);
      return fail('paid_date is required with paid_amount.');
    }
    const paidSoFar = milestone.payments.reduce((s, p) => s + p.amountMinor, 0n);
    const check = checkPayment(
      { amountMinor: paid, paymentDate: paidDate },
      { amountMinor: milestone.amountMinor, paidMinor: paidSoFar },
      opts.today,
    );
    if (!check.ok) {
      broken.add(key);
      return fail(
        check.rule === 'P-6'
          ? `P-6: paid_date ${paidDate} is in the future.`
          : `P-2: payments on milestone "${milestone.title}" add up to more than its amount.`,
      );
    }
    milestone.payments.push({ amountMinor: paid, paymentDate: paidDate, invoiceId: get('invoice_id') || null });
  });

  // PS-4 needs the whole project, so it is checked once every row is in.
  for (const [key, p] of projects) {
    if (broken.has(key)) continue;
    if (p.status === 'ACTIVE' && (p.milestones.length === 0 || p.milestones.some((m) => !m.dueDate))) {
      broken.add(key);
      errors.push({ line: p.line, message: 'PS-4: an Active project needs at least one milestone, and every milestone needs a due date.' });
    }
  }
  errors.sort((a, b) => a.line - b.line);
  return {
    projects: [...projects.entries()].filter(([k]) => !broken.has(k)).map(([, { firstRow: _f, ...p }]) => p),
    errors,
  };
}
