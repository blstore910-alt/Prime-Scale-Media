// ── ONE TO FIVE BUSINESS MANAGERS ON ONE REQUEST ─────────────────────
//
// The owner, 27-09: "advertisers mogen meerdere bms doen bij nieuwe ad
// acc request en max 5 bm ids en min 1."
//
// The field has always been one string, and it is stored in the
// request's `metadata` jsonb, which the creating RPC passes through
// whole. So the STORAGE takes a list today without any schema change.
// The readers are the problem, and there are six of them, each with its
// own idea of the shape:
//
//   - three copies of `formatMetadataValue` already join an array
//   - `toBmId` does Number(raw), which is NaN for a list of two, so the
//     account was created with NO business manager and a green toast
//   - the details sheet renders a string[] as React children, which
//     concatenates: "111", "222" prints as 111222, a plausible-looking
//     id that is not one
//   - the update form's getString() empties a non-string, and its own
//     validation then refuses to save until somebody retypes it
//
// So: one parser, one formatter, and every reader goes through them.
// Both shapes are accepted on the way in for ever, because rows written
// before today hold a bare string and nothing rewrites them.

export const BM_ID_MIN = 1;
export const BM_ID_MAX = 5;

/**
 * Read whatever is in metadata as a list.
 *
 * Accepts a bare string (every row written before today), an array, or
 * a comma/newline-separated string — people paste lists. Trims, drops
 * blanks, de-duplicates, and keeps the order they were given in, since
 * the first one is the one that goes on the account.
 */
export function parseBmIds(raw: unknown): string[] {
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (v === null || v === undefined) return;
    // A number is what a row written by the old numeric path holds.
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
    for (const piece of s.split(/[,\n;]+/)) {
      const t = piece.trim();
      if (t) parts.push(t);
    }
  };
  if (Array.isArray(raw)) raw.forEach(push);
  else push(raw);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out.slice(0, BM_ID_MAX);
}

/** For a one-line cell: "111, 222, 333". Empty list reads as an em dash. */
export function formatBmIds(raw: unknown): string {
  const ids = parseBmIds(raw);
  return ids.length ? ids.join(", ") : "—";
}

/**
 * The one that goes on `ad_accounts.bm_id`, which is a single scalar
 * column and stays one.
 *
 * An ad account belongs to exactly ONE business manager — the list on
 * the request is the advertiser saying which of their BMs they want
 * accounts for, not five owners of one account. So the account carries
 * the first, the whole list stays on the request, and an admin creating
 * a second account picks the next one.
 *
 * Returns null rather than 0 or NaN when there is nothing: `toBmId` used
 * to hand `Number([...])` straight through, and NaN became null one line
 * later with no word to anybody.
 */
export function primaryBmId(raw: unknown): string | null {
  return parseBmIds(raw)[0] ?? null;
}

export type BmIdsProblem =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Validate what somebody typed into the request form.
 *
 * Deliberately NOT a digits-only rule: the old field had no shape check
 * at all, Meta ids are long numeric strings but the app has never
 * enforced it, and refusing a paste that works is worse than storing a
 * value an admin can see and correct.
 */
export function validateBmIds(raw: unknown): BmIdsProblem {
  const ids = parseBmIds(raw);
  if (ids.length < BM_ID_MIN) {
    return { ok: false, error: "Give at least one Business Manager ID." };
  }
  // parseBmIds already caps at five, so this catches the person who
  // typed six and would otherwise silently lose the last one.
  const all = Array.isArray(raw)
    ? raw.filter((v) => String(v ?? "").trim()).length
    : String(raw ?? "")
        .split(/[,\n;]+/)
        .filter((v) => v.trim()).length;
  if (all > BM_ID_MAX) {
    return {
      ok: false,
      error: `Up to ${BM_ID_MAX} Business Manager IDs — you gave ${all}.`,
    };
  }
  const tooLong = ids.find((i) => i.length > 64);
  if (tooLong) {
    return { ok: false, error: "That does not look like a Business Manager ID." };
  }
  return { ok: true, ids };
}
