import { expect, test, vi } from 'vitest';
import { FxService } from './fx.service';

// D-042: a project is converted at the rate of its start date; one with no start date uses the day it was created.
test('startRates looks up the rate on the start date, else the creation date', async () => {
  const fx = new FxService({} as never, {} as never, {} as never);
  const find = vi
    .spyOn(fx, 'find')
    .mockImplementation(async (from, to, date) => ({ from, to, rate: `r-${date}`, date: date!, source: 'test' }));
  const rates = await fx.startRates(
    [
      { id: 'a', currency: 'INR', createdAt: new Date('2026-11-01T10:00:00Z'), startDate: new Date('2026-03-15T00:00:00Z') },
      { id: 'b', currency: 'INR', createdAt: new Date('2026-11-02T10:00:00Z'), startDate: null },
    ],
    'USD',
  );
  expect(rates.get('a')).toBe('r-2026-03-15');
  expect(rates.get('b')).toBe('r-2026-11-02');
  expect(find).toHaveBeenCalledTimes(2);
});
