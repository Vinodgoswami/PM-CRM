/** Only same-app paths: "/projects" yes; "//evil.test" or "https://evil.test" fall back to the dashboard. */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
