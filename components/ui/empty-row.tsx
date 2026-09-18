"use client";

/**
 * The empty state of a filtered list.
 *
 * Every table in this app said the same thing whether the list was empty or
 * the FILTER was: "No invoices found." An admin who left a search term in
 * the box, or a status chip set from the last time they used the screen,
 * reads that as "this tenant has no invoices" — and on a financial dashboard
 * that is not a cosmetic difference. It sends someone looking for a broken
 * query, or worse, reassures them that nothing is outstanding.
 *
 * So the sentence has to name the cause, and the way out has to be one
 * click. Three cases, three different sentences:
 *
 *   search active   -> No invoices match "acme". [Clear the search]
 *   filters active  -> No invoices match the filters. [Clear the filters]
 *   genuinely empty -> No invoices yet.
 *
 * The clear button is rendered only when there is something to clear, so the
 * genuinely-empty case stays quiet.
 */
export function EmptyState({
  noun,
  search,
  filtered,
  onClear,
  emptyText,
}: {
  /** Plural, lowercase, as a person would say it: "invoices", "top-ups". */
  noun: string;
  search?: string | null;
  /** True when any filter OTHER than the search narrows the list. */
  filtered?: boolean;
  onClear?: () => void;
  /** Overrides the genuinely-empty sentence when the screen has a better one. */
  emptyText?: string;
}) {
  const term = (search ?? "").trim();
  const narrowed = term.length > 0 || !!filtered;

  let text: string;
  if (term && filtered) {
    text = `No ${noun} match “${term}” with the filters you have set.`;
  } else if (term) {
    text = `No ${noun} match “${term}”.`;
  } else if (filtered) {
    text = `No ${noun} match the filters you have set.`;
  } else {
    text = emptyText ?? `No ${noun} yet.`;
  }

  return (
    <div style={{ textAlign: "center" }}>
      <span style={{ color: "var(--txt-2)" }}>{text}</span>
      {narrowed && onClear ? (
        <div style={{ marginTop: 10 }}>
          <button className="btn ghost sm" onClick={onClear}>
            {term && !filtered
              ? "Clear the search"
              : term
                ? "Clear the search and filters"
                : "Clear the filters"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The same thing as a full-width table row. */
export function emptyRow(
  colSpan: number,
  props: React.ComponentProps<typeof EmptyState>,
) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 28 }}>
        <EmptyState {...props} />
      </td>
    </tr>
  );
}

export default EmptyState;
