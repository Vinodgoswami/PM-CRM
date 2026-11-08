import { toMinor } from '@salescrm/types';

/** What could be read from an invoice: each field only when found (D-040). */
export interface InvoiceFields {
  invoiceId?: string;
  amountMinor?: number;
  date?: string;
  /** D-041: when the invoice asks to be paid, for a new milestone's due date. */
  dueDate?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NUMBER = String.raw`\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;
const CURRENCY = String.raw`(?:[$₹€£¥]|USD|INR|EUR|GBP|AUD|CAD|SGD|JPY|Rs\.?)`;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) =>
  y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : undefined;

const SEP = String.raw`\s*[/.-]\s*`; // pdf.js may split "05/11/2026" into "05 / 11 / 2026"
const fullYear = (y: string) => (y.length === 2 ? 2000 + +y : +y);
const monthOf = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

interface FoundDate {
  at: number;
  date: string;
}

/**
 * Every date in `text`, in page order: year first, day/month/year (month first when the second part is over 12, or
 * when `today` is given and only the month-first reading is not in the future), or a written month; 2-digit years too.
 */
function allDates(text: string, today?: string): FoundDate[] {
  const found: (FoundDate & { end: number })[] = [];
  const add = (m: RegExpMatchArray, date: string | undefined) => {
    if (date) found.push({ at: m.index!, end: m.index! + m[0].length, date });
  };
  for (const m of text.matchAll(new RegExp(String.raw`\b(\d{4})${SEP}(\d{1,2})${SEP}(\d{1,2})\b`, 'g')))
    add(m, iso(+m[1]!, +m[2]!, +m[3]!));
  for (const m of text.matchAll(new RegExp(String.raw`\b(\d{1,2})${SEP}(\d{1,2})${SEP}(\d{4}|\d{2})\b`, 'g'))) {
    const [a, b, y] = [+m[1]!, +m[2]!, fullYear(m[3]!)];
    const dayFirst = iso(y, b, a);
    const monthFirst = iso(y, a, b);
    // Day first (India, UK) unless it cannot be, or (for an issue date) it would be in the future and month first is not.
    const futureOnly = !!today && !!dayFirst && dayFirst > today && !!monthFirst && monthFirst <= today;
    add(m, b > 12 || futureOnly ? monthFirst : dayFirst);
  }
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4}|\d{2})\b/g)) {
    const month = monthOf(m[2]!);
    if (month) add(m, iso(fullYear(m[3]!), month, +m[1]!));
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g)) {
    const month = monthOf(m[1]!);
    if (month) add(m, iso(+m[3]!, month, +m[2]!));
  }
  found.sort((x, y) => x.at - y.at);
  // A match inside an earlier one (e.g. "26-11-05" within "2026-11-05") is not a date of its own.
  return found.filter((f, i) => !found.slice(0, i).some((g) => f.at < g.end));
}

const ISSUE_LABEL = String.raw`(?<!due\s)\b(?:invoice\s+date|date\s+of\s+issue|issue\s+date|bill\s+date|issued(?:\s+on)?|dated?|payment\s+date|paid\s+on)\b`;
const DUE_LABEL = String.raw`\b(?:due\s+date|payment\s+due|due\s+(?:on|by)|pay\s+by)\b`;

/**
 * The date that belongs to the first `label`: on the same line, else (a table header) the date in the same column on
 * the next line, else the first date shortly after it.
 */
function dateAfter(text: string, label: string, dates: FoundDate[]): string | undefined {
  const m = new RegExp(label, 'i').exec(text);
  if (!m) return undefined;
  const from = m.index + m[0].length;
  const lineEnd = text.indexOf('\n', from) === -1 ? text.length : text.indexOf('\n', from);
  const sameLine = dates.find((d) => d.at >= from && d.at < lineEnd);
  if (sameLine) return sameLine.date;
  const lineStart = text.lastIndexOf('\n', m.index) + 1;
  const column = [...text.slice(lineStart, m.index).matchAll(new RegExp(`${ISSUE_LABEL}|${DUE_LABEL}`, 'gi'))].length;
  const nextEnd = text.indexOf('\n', lineEnd + 1) === -1 ? text.length : text.indexOf('\n', lineEnd + 1);
  const nextLine = dates.filter((d) => d.at > lineEnd && d.at < nextEnd);
  if (nextLine.length > 1 && nextLine[column]) return nextLine[column].date;
  return dates.find((d) => d.at >= from && d.at - from <= 60)?.date;
}

/** The amount after the most specific total label (amount due, grand total, total), the last one on the page. */
function findAmount(text: string, currency: string): number | undefined {
  const labels = [
    String.raw`(?:total\s+)?amount\s+due|balance\s+due|total\s+due|amount\s+payable|grand\s+total|invoice\s+total|total\s+amount`,
    String.raw`\btotal\b`,
  ];
  for (const label of labels) {
    const re = new RegExp(String.raw`(?:${label})\s*[:\-]?\s*(?:${CURRENCY}\s*)?(${NUMBER})`, 'gi');
    const found = [...text.matchAll(re)].map((m) => m[1]!);
    for (const value of found.reverse()) {
      try {
        const minor = Number(toMinor(value, currency));
        if (minor > 0) return minor;
      } catch {
        /* not a well-formed amount; try the next */
      }
    }
  }
  return undefined;
}

function findInvoiceId(text: string): string | undefined {
  const labelled = /\b(?:invoice|inv|bill)\s*(?:no\.?|number|num\.?|#|id)\s*[:\-#]?\s*([A-Z0-9][A-Z0-9/\-_.]{0,39})/i.exec(text);
  if (labelled) return labelled[1]!.replace(/[.\-/]+$/, '');
  const bare = /\bINV[-/]?[A-Z0-9][A-Z0-9/-]*\b/i.exec(text);
  return bare?.[0];
}

/**
 * Reads invoice ID, total, date and due date from an invoice's text (D-040, D-041, D-046). Unknown fields are left out.
 * `today` lets an ambiguous issue date (10/12) be read month-first when day-first would be in the future.
 */
export function parseInvoiceText(text: string, currency: string, today?: string): InvoiceFields {
  const out: InvoiceFields = {};
  const invoiceId = findInvoiceId(text);
  if (invoiceId) out.invoiceId = invoiceId;
  const amountMinor = findAmount(text, currency);
  if (amountMinor !== undefined) out.amountMinor = amountMinor;
  // Prefer the date that belongs to a date label; otherwise the first date on the page.
  const issueDates = allDates(text, today);
  const date = dateAfter(text, ISSUE_LABEL, issueDates) ?? issueDates[0]?.date;
  if (date) out.date = date;
  const dueDate = dateAfter(text, DUE_LABEL, allDates(text));
  if (dueDate) out.dueDate = dueDate;
  return out;
}
