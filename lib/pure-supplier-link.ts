// ── WHERE AN ADMIN GOES TO DO THE TOP-UP BY HAND ─────────────────────
//
// Only one ad-account type tops up over the API. Every other type means
// an admin opens the supplier's own dashboard in another tab, moves the
// money there, and comes back here to press Verify — and until now the
// review screen did not say which supplier, let alone link to it. With
// three or four suppliers in play that is a guess made against a
// customer's money.
//
// The link is stored per ad-account type (supabase/migrations/
// 20260920...supplier_link.sql), so it is data the owner edits in
// Settings, not a constant in a file. This module is the pure half:
// deciding whether a stored string is something we are willing to put
// behind a link, with no imports so it can be unit-tested.
//
// PSM's rule that a customer never learns the supplier's name still
// holds: everything here is rendered on admin-only surfaces.

/** Schemes that may appear behind a pill an admin clicks. */
const SAFE_SCHEMES = new Set(["http:", "https:"]);

/**
 * Normalise a stored supplier dashboard URL.
 *
 * Returns an absolute http(s) URL, or null when the value is empty or
 * is something we will not link to. A bare host ("app.example.com") is
 * accepted and upgraded to https, because that is how an owner types it.
 *
 * `javascript:` is the reason this function exists rather than an
 * `href={row.supplier_url}`: the field is owner-editable free text and
 * it renders inside the admin shell, so a pasted `javascript:` URL
 * would run in the session of whoever pressed the pill.
 */
export function normalizeSupplierUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  // No control characters or whitespace — "java\nscript:" is the classic
  // way past a scheme check, and a URL never legitimately contains one.
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return null;
  }

  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
    ? value
    : `https://${value}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (!SAFE_SCHEMES.has(url.protocol)) return null;
  // A scheme and nothing else ("https://") parses, and links nowhere.
  if (!url.hostname || !url.hostname.includes(".")) return null;

  return url.toString();
}

/**
 * The words on the pill.
 *
 * Falls back to the type's own label when no supplier name is recorded,
 * so a link entered without a name still says something useful instead
 * of "Open ↗".
 */
export function supplierPillLabel(
  supplierLabel: unknown,
  typeLabel: unknown,
): string {
  const supplier = String(supplierLabel ?? "").trim();
  if (supplier) return supplier;
  const type = String(typeLabel ?? "").trim();
  return type || "supplier";
}

/**
 * The host, for the line under the pill — an admin with four supplier
 * tabs open wants to know which one this is before clicking.
 */
export function supplierUrlHost(url: unknown): string {
  const normalized = normalizeSupplierUrl(url);
  if (!normalized) return "";
  try {
    return new URL(normalized).host;
  } catch {
    return "";
  }
}
