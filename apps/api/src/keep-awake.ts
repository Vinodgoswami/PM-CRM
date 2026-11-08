/**
 * D-051: Render's free plan stops a service after 15 minutes without requests, and the next visitor waits about a
 * minute for it to start. Requesting our own public health URL every 10 minutes counts as a visit, so it stays up.
 * Returns a function that stops the timer.
 */
export function startKeepAwake(
  { url, everyMs }: { url: string; everyMs: number },
  fetchFn: typeof fetch = fetch,
  warn: (message: string) => void = console.warn,
): () => void {
  const timer = setInterval(() => {
    fetchFn(url, { signal: AbortSignal.timeout(30_000) }).catch((e: unknown) =>
      warn(`Keep-awake ping to ${url} failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  }, everyMs);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
