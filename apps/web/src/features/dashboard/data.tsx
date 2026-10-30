import { dashboardSchema } from '@salescrm/schemas';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

/** Dashboard and comparison periods (D-019): quarter first, because project managers report quarterly. */
export const PERIODS = [
  { key: 'THIS_MONTH', label: 'Month' },
  { key: 'THIS_QUARTER', label: 'Quarter' },
  { key: 'FY_TO_DATE', label: 'YTD' },
  { key: 'THIS_FY', label: 'Year' },
  { key: 'LAST_FY', label: 'Last year' },
  { key: 'TWO_FY', label: '2 years' },
] as const;
export type Period = (typeof PERIODS)[number]['key'];

export function useDashboard(period: Period, ownerId: string, enabled = true) {
  const search = new URLSearchParams({ period, ...(ownerId ? { ownerId } : {}) }).toString();
  return useQuery({
    queryKey: ['dashboard', search],
    queryFn: () => apiFetch(`/dashboard?${search}`, { schema: dashboardSchema }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const isPeriod = (v: string | null): v is Period => PERIODS.some((p) => p.key === v);

/** Pill radio group for the period (Month … 2 years). */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div role="radiogroup" aria-label="Period" className="flex flex-wrap rounded-full bg-surface p-1 shadow-card">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          role="radio"
          aria-checked={value === p.key}
          onClick={() => onChange(p.key)}
          className={`rounded-full px-4 py-1.5 text-sm transition-colors ${value === p.key ? 'bg-primary font-semibold text-primary-contrast' : 'text-text-muted hover:text-text'}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
