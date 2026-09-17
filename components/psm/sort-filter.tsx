"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useState } from "react";

export type PsmOption = { value: string; label: string };

export type PsmFilter = {
  id: string;
  label: string;
  value: string;
  /** The value that means "no filter". Defaults to "all". */
  allValue?: string;
  onChange: (value: string) => void;
  /** Includes the "all" option itself, so the caller controls its wording. */
  options: PsmOption[];
};

/**
 * One control for everything that shapes a list: the sort key and every
 * filter, behind a single button.
 *
 * A row of loose selects reads as a form rather than a toolbar, and it scales
 * badly — each new filter costs another full-width line on a phone, so on a
 * 375px screen three of them pushed the first record below the fold.
 *
 * The button carries a count, and that is not decoration: once the controls
 * are hidden, the button is the only thing left that can tell you the list is
 * narrowed. A filtered list that looks unfiltered reads as missing data.
 */
export default function PsmSortFilter({
  sort,
  onSortChange,
  sortOptions,
  filters = [],
  searchActive = false,
  extra,
  extraActive = false,
  onReset,
  label = "Sort & filter",
}: {
  sort?: string;
  onSortChange?: (value: string) => void;
  sortOptions?: PsmOption[];
  filters?: PsmFilter[];
  /** Counts the search box towards the badge, since it narrows too. */
  searchActive?: boolean;
  /**
   * Anything that is not a select — a date picker, a range — rendered at the
   * bottom of the panel. Without this those controls stayed loose in the bar
   * and cost it a second row, which is the thing this component exists to
   * stop.
   */
  extra?: React.ReactNode;
  /** Whether `extra` is currently narrowing the list, for the badge count. */
  extraActive?: boolean;
  onReset: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // Element ids must be unique per INSTANCE. /withdrawals renders three of
  // these on one page (Withdrawals, Refunds, Adjustments), so a fixed
  // "psf-status" appeared three times in the DOM — and a <label htmlFor>
  // pointing at a duplicated id focuses whichever one the browser finds
  // first, which is not the one you clicked.
  const uid = useId();

  // The scrim catches clicks; Escape is the other way out of a panel, and
  // leaving it out is the difference between a control and a trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const defaultSort = sortOptions?.[0]?.value;
  const activeCount =
    filters.filter((f) => f.value !== (f.allValue ?? "all")).length +
    (sort !== undefined && defaultSort !== undefined && sort !== defaultSort
      ? 1
      : 0) +
    (searchActive ? 1 : 0) +
    (extraActive ? 1 : 0);

  return (
    <div className="fgroup">
      <button
        className={`fbtn${activeCount ? " on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        /* The label span is hidden below the phone breakpoint, and with it
           went the button's only accessible name — a screen reader read
           "button" and the count badge beside it. */
        aria-label={label}
        title={label}
      >
        <SlidersHorizontal />
        <span>{label}</span>
        {activeCount > 0 && <span className="fcount">{activeCount}</span>}
      </button>

      {open && (
        <>
          <div className="fscrim" onClick={() => setOpen(false)} />
          <div className="fpanel" role="dialog" aria-label={label}>
            {sortOptions && sortOptions.length > 0 && onSortChange && (
              <>
                <label className="flab" htmlFor={`${uid}-sort`}>
                  Sort by
                </label>
                <select
                  id={`${uid}-sort`}
                  value={sort}
                  onChange={(e) => onSortChange(e.target.value)}
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            {filters.map((f) => (
              <div key={f.id} style={{ display: "contents" }}>
                <label className="flab" htmlFor={`${uid}-${f.id}`}>
                  {f.label}
                </label>
                <select
                  id={`${uid}-${f.id}`}
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            {extra}

            <div className="fpanel-foot">
              <button
                className="btn ghost sm"
                onClick={onReset}
                disabled={!activeCount}
              >
                Reset
              </button>
              <button className="btn sm" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Sort comparators shared by every list. Numeric keys must compare
 * numerically — a string compare puts "9" above "10", which is exactly wrong
 * on money and percentages. Text uses localeCompare so accented names land
 * where a reader expects them.
 */
export const psmNum = (v: unknown) =>
  typeof v === "number" ? v : Number(v) || 0;
export const psmTxt = (v: unknown) => String(v ?? "");

export function psmCompare(
  a: unknown,
  b: unknown,
  direction: "asc" | "desc",
  kind: "number" | "text" = "number",
) {
  const r =
    kind === "number"
      ? psmNum(a) - psmNum(b)
      : psmTxt(a).localeCompare(psmTxt(b));
  return direction === "asc" ? r : -r;
}
