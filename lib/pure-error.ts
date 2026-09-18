/**
 * Return a compact, PII-scrubbed representation of an error object
 * for logging. Never surface Supabase's `details`/`hint`/`row` fields
 * to server logs — those can contain user emails, IDs, or full row
 * payloads.
 *
 * Kept as a stand-alone module with no framework imports so it can be
 * unit-tested with Node's built-in test runner.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "unknown error";
}

/**
 * A message it is safe to show a CUSTOMER.
 *
 * safeErrorMessage keeps Supabase's `details`, `hint` and `row` out of a
 * log. It does not help with the message itself — and PostgREST's
 * messages are written for whoever wrote the query, not for the person
 * the screen belongs to. "column plans_1.features does not exist" has
 * been read by a customer on their own dashboard, which is what the
 * pending-migration rule in CLAUDE.md exists to stop.
 *
 * So: if the message looks like it came from the database or the API
 * layer, it is replaced with the caller's own sentence. Anything else is
 * passed through, because our server actions write their refusals for
 * people — "This top-up was updated by someone else. Reload and retry."
 * is exactly what somebody needs to read, and blanking it would be a
 * step backwards.
 *
 * Deliberately a DENY-list rather than an allow-list. An allow-list means
 * every new hand-written message has to be registered somewhere before it
 * can be seen, which is the kind of rule that gets forgotten and turns
 * every refusal into "Something went wrong".
 */
const DB_SHAPED = [
  // PostgREST / PostgreSQL
  "pgrst",
  "column ",
  "relation ",
  "does not exist",
  "duplicate key",
  "violates ",
  "constraint",
  "permission denied",
  "syntax error",
  "invalid input syntax",
  "null value in column",
  "operator does not exist",
  "function ",
  "schema cache",
  "row-level security",
  "jwt",
  // Transport noise nobody can act on
  "failed to fetch",
  "networkerror",
  "load failed",
];

export function userFacingErrorMessage(err: unknown, fallback: string): string {
  const raw = safeErrorMessage(err);
  if (!raw || raw === "unknown error") return fallback;
  const low = raw.toLowerCase();
  if (DB_SHAPED.some((m) => low.includes(m))) return fallback;
  // A message that is mostly identifiers is not a sentence somebody can
  // act on either — uuids and table_name.column_name both read as noise.
  if (/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw)) return fallback;
  return raw;
}
