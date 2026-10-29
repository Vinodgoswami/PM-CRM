import { expect, test } from 'vitest';
import { fyOf, quarterOf, todayIn } from '../src/period';

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
