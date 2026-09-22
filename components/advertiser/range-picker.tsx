"use client";

import { useState } from "react";
import dayjs from "dayjs";

import { Ic } from "@/components/advertiser/adv-icons";
import SlideSeg, { type SlideOpt } from "@/components/advertiser/slide-seg";

// ── ONE PERIOD FOR EVERY FIGURE UNDER IT ────────────────────────────────
//
// The owner, 22-09: a proper time-range picker between the earnings card
// and the stats, and changing it applies to the commissions too. So the
// period lives in ONE place and everything below reads it: the four
// stats, every referral's row, and the commission list with its totals.
// A number and the list it sums always cover the same days.

export type RangeKey = "month" | "last" | "30d" | "year" | "all" | "custom";

export type AffRange = {
  key: RangeKey;
  /** yyyy-mm-dd, only for "custom". */
  from?: string | null;
  to?: string | null;
};

const LABELS: Record<Exclude<RangeKey, "custom">, string> = {
  all: "All time",
  month: "This month",
  last: "Last month",
  "30d": "Last 30 days",
  year: "This year",
};

/** The period as dates (inclusive), or nulls for "all time". */
export function rangeDates(r: AffRange): { from: string | null; to: string | null } {
  const today = dayjs();
  const fmt = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");
  switch (r.key) {
    case "month":
      return { from: fmt(today.startOf("month")), to: fmt(today) };
    case "last": {
      const m = today.subtract(1, "month");
      return { from: fmt(m.startOf("month")), to: fmt(m.endOf("month")) };
    }
    case "30d":
      return { from: fmt(today.subtract(29, "day")), to: fmt(today) };
    case "year":
      return { from: fmt(today.startOf("year")), to: fmt(today) };
    case "custom":
      return { from: r.from || null, to: r.to || null };
    default:
      return { from: null, to: null };
  }
}

/** "1 – 22 Sep 2026", "All time", "Since 1 Sep 2026". */
export function rangeCaption(r: AffRange): string {
  const { from, to } = rangeDates(r);
  if (!from && !to) return "All time";
  const f = from ? dayjs(from) : null;
  const t = to ? dayjs(to) : null;
  if (f && t) {
    if (f.isSame(t, "day")) return f.format("D MMM YYYY");
    if (f.isSame(t, "month")) return `${f.format("D")} – ${t.format("D MMM YYYY")}`;
    if (f.isSame(t, "year")) return `${f.format("D MMM")} – ${t.format("D MMM YYYY")}`;
    return `${f.format("D MMM YYYY")} – ${t.format("D MMM YYYY")}`;
  }
  if (f) return `Since ${f.format("D MMM YYYY")}`;
  return `Until ${t!.format("D MMM YYYY")}`;
}

export default function RangePicker({
  value,
  onChange,
  busy,
}: {
  value: AffRange;
  onChange: (next: AffRange) => void;
  /** A read for the new period is under way. */
  busy?: boolean;
}) {
  // Typed dates are held here until both make sense, so the figures do not
  // jump on every keystroke of a half-typed date.
  const [draftFrom, setDraftFrom] = useState(value.from ?? dayjs().startOf("month").format("YYYY-MM-DD"));
  const [draftTo, setDraftTo] = useState(value.to ?? dayjs().format("YYYY-MM-DD"));
  const [open, setOpen] = useState(false);

  const draftOk = !!draftFrom && !!draftTo && draftFrom <= draftTo;
  const pick = (key: Exclude<RangeKey, "custom">) => {
    setOpen(false);
    onChange({ key });
  };

  // One row on every screen. A phone gets the three that are asked for
  // most and a calendar; the calendar opens the other two and your own
  // dates. From 640px up the other two sit in the row as well.
  const options: SlideOpt[] = [
    { key: "all", label: LABELS.all, onClick: () => pick("all") },
    { key: "month", label: LABELS.month, onClick: () => pick("month") },
    { key: "last", label: LABELS.last, onClick: () => pick("last") },
    { key: "30d", label: "30 days", wide: true, onClick: () => pick("30d") },
    { key: "year", label: LABELS.year, wide: true, onClick: () => pick("year") },
    {
      key: "custom",
      label: (
        <>
          <Ic name="i-cal" />
          <span className="wide-lbl">Custom</span>
        </>
      ),
      className: `cal${open ? " open" : ""}`,
      ariaLabel: "More periods, or your own dates",
      ariaExpanded: open,
      onClick: () => setOpen((o) => !o),
    },
  ];

  return (
    <div className="xrange">
      <SlideSeg options={options} active={value.key} fallback="custom" ariaLabel="Period" />

      {open ? (
        <div className="xr-custom">
          <div className="xr-quick">
            {(["30d", "year"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`xr-q${value.key === k ? " on" : ""}`}
                onClick={() => pick(k)}
              >
                {LABELS[k]}
              </button>
            ))}
          </div>
          <div className="xr-dates">
            <label>
              From
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                max={dayjs().format("YYYY-MM-DD")}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn sm grad"
              disabled={!draftOk}
              onClick={() => {
                setOpen(false);
                onChange({ key: "custom", from: draftFrom, to: draftTo });
              }}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}

      <div className="xr-meta" aria-live="polite">
        <span className={`dot${busy ? " busy" : ""}`} />
        Showing <b>{rangeCaption(value)}</b>
        {busy ? <span className="xr-busy">updating…</span> : null}
      </div>
    </div>
  );
}
