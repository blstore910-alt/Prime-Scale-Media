/**
 * How a person is named in a LIST, as opposed to in a detail view.
 *
 * A list cell exists to be recognised at a glance, not read. A full name
 * pushes a two-up card wider than its column and then truncates mid-word,
 * which is the worst of both: it costs the width AND fails to identify.
 *
 * So lists get the first name plus the client code — "PSM0002 · john" — which
 * is short enough to survive a 400px column intact and precise enough to be
 * unambiguous, since the code is unique where a first name is not. The full
 * name belongs in the detail sheet, where there is room for it.
 */
export function firstName(name?: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * "PSM0002 · john", or whichever half is available.
 *
 * Returns an empty string when neither is — so a caller can fall back to
 * something else rather than render a stray separator.
 */
export function customerLabel(
  clientCode?: string | null,
  fullName?: string | null,
): string {
  const code = (clientCode ?? "").trim();
  const first = firstName(fullName);
  if (code && first) return `${code} · ${first}`;
  return code || first;
}
