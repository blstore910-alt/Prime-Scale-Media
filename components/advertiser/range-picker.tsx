"use client";

import { useState } from "react";
import dayjs from "dayjs";

import { Ic } from "@/components/advertiser/adv-icons";

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
  month: "This month",
  last: "Last month",
  "30d": "Last 30 days",
  year: "This year",
  all: "All time",
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
  const [customOpen, setCustomOpen] = useState(value.key === "custom");

  const draftOk = !!draftFrom && !!draftTo && draftFrom <= draftTo;

  return (
    <div className="xrange">
      <div className="xr-bar" role="tablist" aria-label="Period">
        {(Object.keys(LABELS) as Exclude<RangeKey, "custom">[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={value.key === k}
            className={`xr-opt${value.key === k ? " on" : ""}`}
            onClick={() => {
              setCustomOpen(false);
              onChange({ key: k });
            }}
          >
            {LABELS[k]}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={value.key === "custom"}
          className={`xr-opt${value.key === "custom" ? " on" : ""}`}
          onClick={() => setCustomOpen((o) => !o)}
        >
          <Ic name="i-clock" /> Custom
        </button>
      </div>

      {customOpen ? (
        <div className="xr-custom">
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
            className="btn sm"
            disabled={!draftOk}
            onClick={() => onChange({ key: "custom", from: draftFrom, to: draftTo })}
          >
            Apply
          </button>
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
