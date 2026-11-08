import { expect, test } from 'vitest';
import { dueRecurringIndexes, recurringDates } from '../src/recurring';

// D-063: a recurring milestone series is due on the same day each month, from its start date.
test('the same day each month, the 31st becoming the last day of shorter months', () => {
  expect(recurringDates('2026-04-15', 3)).toEqual(['2026-04-15', '2026-05-15', '2026-06-15']);
  expect(recurringDates('2026-01-31', 4)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  expect(recurringDates('2026-11-10', 3)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10']);
});

test('the invoices due by today that are not created yet', () => {
  // Apr, 12 invoices, today 8 Nov: Apr..Oct are due (15 Nov is not yet).
  expect(dueRecurringIndexes('2026-04-15', 12, 0, '2026-11-08')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(dueRecurringIndexes('2026-04-15', 12, 7, '2026-11-15')).toEqual([7]);
  expect(dueRecurringIndexes('2026-04-15', 12, 12, '2027-09-01')).toEqual([]);
  expect(dueRecurringIndexes('2026-12-01', 3, 0, '2026-11-08')).toEqual([]);
});
