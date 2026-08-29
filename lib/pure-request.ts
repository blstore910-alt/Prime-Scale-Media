/**
 * Framework-agnostic caller-IP extractor. Reads `x-forwarded-for`
 * first (Vercel/CDN), then `x-real-ip`, then falls back to a fixed
 * string so downstream rate-limit checks still apply.
 *
 * Kept in a standalone module so it can be unit-tested without
 * dragging Next.js into the test runner.
 */
export function callerIp(req: { headers: Headers | { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0];
    if (first) return first.trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
