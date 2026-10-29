type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function toJson(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toJson(v)]));
  }
  return value as Json;
}

/** The fields that changed, JSON-safe for AuditLog.before / after. `null` when nothing changed. */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, Json>; after: Record<string, Json> } | null {
  const b: Record<string, Json> = {};
  const a: Record<string, Json> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const from = toJson(before[key]);
    const to = toJson(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      b[key] = from;
      a[key] = to;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}
