import { describe, expect, test } from 'vitest';
import { fyOf, quarterOf, todayIn } from '../src/period';
import { periodBuckets } from '../src/period-presets';

test('PR-1 fyOf with April start', () => {
  expect(fyOf('2026-03-31', 4)).toEqual({ label: '2025-26', start: '2025-04-01', end: '2026-03-31' });
  expect(fyOf('2026-04-01', 4)).toEqual({ label: '2026-27', start: '2026-04-01', end: '2027-03-31' });
  expect(fyOf('2026-10-29', 1)).toEqual({ label: '2026', start: '2026-01-01', end: '2026-12-31' });
});

test('PR-1 fyOf handles leap-year February ends', () => {
  expect(fyOf('2028-02-29', 3)).toEqual({ label: '2027-28', start: '2027-03-01', end: '2028-02-29' });
});

test('PR-2 quarterOf', () => {
  expect(quarterOf('2026-10-29', 4, 'fy')).toEqual({ label: 'Q3', start: '2026-10-01', end: '2026-12-31' });
  expect(quarterOf('2027-02-10', 4, 'fy')).toEqual({ label: 'Q4', start: '2027-01-01', end: '2027-03-31' });
  expect(quarterOf('2026-10-29', 4, 'calendar')).toEqual({ label: 'Q4', start: '2026-10-01', end: '2026-12-31' });
  expect(quarterOf('2026-04-01', 4, 'fy')).toEqual({ label: 'Q1', start: '2026-04-01', end: '2026-06-30' });
});

test('todayIn uses the company timezone', () => {
  expect(todayIn('Asia/Kolkata', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-30');
  expect(todayIn('UTC', new Date('2026-10-29T20:00:00Z'))).toBe('2026-10-29');
});

test('previousRange is the equally long period just before', async () => {
  const { previousRange } = await import('../src/period-presets');
  expect(previousRange('THIS_MONTH', '2026-03-15', 4)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(previousRange('THIS_QUARTER', '2026-10-29', 4)).toEqual({ from: '2026-07-01', to: '2026-09-30' });
  expect(previousRange('THIS_FY', '2026-10-29', 4)).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  expect(previousRange('LAST_FY', '2026-10-29', 4)).toEqual({ from: '2024-04-01', to: '2025-03-31' });
  expect(previousRange('ALL', '2026-10-29', 4)).toEqual({});
});

test('comparableRange compares the same span of the previous period', async () => {
  const { comparableRange } = await import('../src/period-presets');
  expect(comparableRange('THIS_FY', '2026-10-29', 4)).toEqual({ from: '2025-04-01', to: '2025-10-29' });
  expect(comparableRange('THIS_MONTH', '2026-03-10', 4)).toEqual({ from: '2026-02-01', to: '2026-02-10' });
  expect(comparableRange('THIS_MONTH', '2026-03-31', 4)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(comparableRange('LAST_FY', '2026-10-29', 4)).toEqual({ from: '2024-04-01', to: '2025-03-31' });
});

test('FY_TO_DATE runs from the start of this financial year to today; compared with last year to the same date', async () => {
  const { comparableRange, periodRange } = await import('../src/period-presets');
  expect(periodRange('FY_TO_DATE', '2026-10-30', 4)).toEqual({ from: '2026-04-01', to: '2026-10-30' });
  expect(comparableRange('FY_TO_DATE', '2026-10-30', 4)).toEqual({ from: '2025-04-01', to: '2025-10-30' });
});

test('TWO_FY covers last and this financial year; its comparison is the two years before', async () => {
  const { periodRange, previousRange } = await import('../src/period-presets');
  expect(periodRange('TWO_FY', '2026-10-30', 4)).toEqual({ from: '2025-04-01', to: '2027-03-31' });
  expect(previousRange('TWO_FY', '2026-10-30', 4)).toEqual({ from: '2023-04-01', to: '2025-03-31' });
});

// D-057: the dashboard chart's bars follow the selected period.
describe('periodBuckets', () => {
  const today = '2026-11-08';
  const labels = (key: Parameters<typeof periodBuckets>[0]) => periodBuckets(key, today, 4).map((b) => b.label);

  test('a month is split into weeks', () => {
    expect(periodBuckets('THIS_MONTH', today, 4)).toEqual([
      { label: '1–7 Nov', from: '2026-11-01', to: '2026-11-07' },
      { label: '8–14 Nov', from: '2026-11-08', to: '2026-11-14' },
      { label: '15–21 Nov', from: '2026-11-15', to: '2026-11-21' },
      { label: '22–28 Nov', from: '2026-11-22', to: '2026-11-28' },
      { label: '29–30 Nov', from: '2026-11-29', to: '2026-11-30' },
    ]);
  });

  test('a quarter, year to date and whole financial years go by month', () => {
    expect(labels('THIS_QUARTER')).toEqual(['Oct', 'Nov', 'Dec']);
    expect(labels('FY_TO_DATE')).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
    expect(labels('THIS_FY')).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']);
    expect(periodBuckets('LAST_FY', today, 4)[0]).toEqual({ label: 'Apr', from: '2025-04-01', to: '2025-04-30' });
    expect(periodBuckets('LAST_FY', today, 4).at(-1)).toEqual({ label: 'Mar', from: '2026-03-01', to: '2026-03-31' });
  });

  test('two financial years go by quarter, and all time is the last 12 months', () => {
    expect(labels('TWO_FY')).toEqual([
      "Apr–Jun '25",
      "Jul–Sep '25",
      "Oct–Dec '25",
      "Jan–Mar '26",
      "Apr–Jun '26",
      "Jul–Sep '26",
      "Oct–Dec '26",
      "Jan–Mar '27",
    ]);
    expect(labels('ALL')).toEqual(['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
  });
});
