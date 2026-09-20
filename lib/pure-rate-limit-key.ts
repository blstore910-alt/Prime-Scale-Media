// ─────────────────────────────────────────────────────────────────────
// A rate-limit key, without the person in it
// ─────────────────────────────────────────────────────────────────────
// rate_limit_buckets is a GLOBAL table -- no tenant column -- and its
// read policy is "owner of any tenant". This deployment has two
// tenants, so the owner of one can read the other's keys, and the keys
// are built from identifiers:
//
//   login:ip:203.0.113.44
//   financial-request:user:8bd9b91b-c07b-4aae-9bd5-2aff773ab082
//
// That is a customer's IP address and a customer's user id, on a
// dashboard refreshing every thirty seconds.
//
// The screen exists to answer "is somebody hammering an endpoint", and
// that question is answered by the KIND and the COUNT. The identifier
// only matters when you have already decided to act, and then it is in
// the audit log with the rest of the context.
//
// So the kind stays, the identifier is reduced to a short fingerprint:
// two keys are still visibly different, still stable across refreshes,
// and neither is a person. Same thing the integration cron already does
// before it notifies anybody.
// ─────────────────────────────────────────────────────────────────────

/** A short, stable, non-reversible tag for one identifier. */
function fingerprint(value: string): string {
  // FNV-1a. Not a security hash and does not need to be: the input
  // space is large and the output is never compared against anything.
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(0, 7);
}

export function maskRateLimitKey(key: string | null | undefined): string {
  const raw = String(key ?? "").trim();
  if (!raw) return "—";

  const parts = raw.split(":");
  // "kind:scope:identifier" is the shape every caller uses. Anything
  // else is masked whole rather than guessed at.
  if (parts.length < 3) {
    return parts.length === 2 ? `${parts[0]}:${parts[1]}` : `…${fingerprint(raw)}`;
  }

  const kind = parts[0];
  const scope = parts[1];
  const identifier = parts.slice(2).join(":");
  return `${kind}:${scope}:…${fingerprint(identifier)}`;
}
