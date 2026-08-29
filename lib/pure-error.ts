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
