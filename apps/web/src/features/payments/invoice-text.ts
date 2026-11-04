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

/** The first date in `text`: ISO, day/month/year (month/day when the day is over 12), or a written month. */
function findDate(text: string): string | undefined {
  const isoDate = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (isoDate) return iso(+isoDate[1]!, +isoDate[2]!, +isoDate[3]!);
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(text);
  if (numeric) {
    const [a, b, y] = [+numeric[1]!, +numeric[2]!, +numeric[3]!];
    // Day first (India, UK); month first only when the second part cannot be a month.
    return b > 12 ? iso(y, a, b) : iso(y, b, a);
  }
  const dayMonth = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})\b/.exec(text);
  if (dayMonth) {
    const m = MONTHS.indexOf(dayMonth[2]!.slice(0, 3).toLowerCase()) + 1;
    if (m) return iso(+dayMonth[3]!, m, +dayMonth[1]!);
  }
  const monthDay = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(text);
  if (monthDay) {
    const m = MONTHS.indexOf(monthDay[1]!.slice(0, 3).toLowerCase()) + 1;
    if (m) return iso(+monthDay[3]!, m, +monthDay[2]!);
  }
  return undefined;
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

/** Reads invoice ID, total and date from an invoice's text (D-040). Unknown fields are left out. */
export function parseInvoiceText(text: string, currency: string): InvoiceFields {
  const out: InvoiceFields = {};
  const invoiceId = findInvoiceId(text);
  if (invoiceId) out.invoiceId = invoiceId;
  const amountMinor = findAmount(text, currency);
  if (amountMinor !== undefined) out.amountMinor = amountMinor;
  // Prefer the date next to a date label; otherwise the first date on the page.
  const labelled =
    /(?<!due\s)(?:invoice\s+date|date\s+of\s+issue|issued(?:\s+on)?|dated?|payment\s+date|paid\s+on)\s*[:-]?\s*([^\n]{6,30})/i.exec(text);
  const date = (labelled && findDate(labelled[1]!)) || findDate(text);
  if (date) out.date = date;
  const due = /(?:due\s+date|payment\s+due|due\s+(?:on|by)|pay\s+by)\s*[:-]?\s*([^\n]{6,30})/i.exec(text);
  const dueDate = due && findDate(due[1]!);
  if (dueDate) out.dueDate = dueDate;
  return out;
}
