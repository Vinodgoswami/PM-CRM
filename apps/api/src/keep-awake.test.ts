import { afterEach, expect, test, vi } from 'vitest';
import { startKeepAwake } from './keep-awake';

afterEach(() => vi.useRealTimers());

test('pings the URL on every interval and keeps going after a failed ping', async () => {
  vi.useFakeTimers();
  const fetchFn = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(new Response('{"status":"ok"}'));
  const warn = vi.fn();
  const stop = startKeepAwake({ url: 'https://pm-crm.onrender.com/api/v1/health', everyMs: 600_000 }, fetchFn, warn);
  expect(fetchFn).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(fetchFn).toHaveBeenCalledWith('https://pm-crm.onrender.com/api/v1/health', expect.objectContaining({ signal: expect.anything() }));
  expect(warn).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(fetchFn).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(600_000);
  expect(fetchFn).toHaveBeenCalledTimes(2);
});
