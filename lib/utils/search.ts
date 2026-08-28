/**
 * Sanitise a user-supplied search term for safe use inside a Supabase
 * PostgREST `.or("col.ilike.\"*term*\"")` filter.
 *
 * PostgREST parses `,` `(` `)` as filter DSL and `"` as the value quote.
 * Un-escaped input can widen or reshape the query. We strip those characters
 * and collapse whitespace so callers can wrap the result in `"..."` safely.
 */
export function safeIlikeTerm(raw: string, maxLength = 100): string {
  return raw
    .replace(/[,()"\\%_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
