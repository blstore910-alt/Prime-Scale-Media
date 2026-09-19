/**
 * The ranges people actually ask for.
 *
 * WHY THIS REPLACED TWO DATE BOXES. The filter opened with a pair of
 * empty dd-mm-yyyy fields, which is the control that asks the customer to
 * do the work: know today's date, know what they want, type both ends, in
 * the right order, in the browser's format. Every report anyone has used —
 * Stripe, Shopify, a bank statement — leads with the four or five spans
 * people mean and keeps the calendar for the case that is genuinely
 * bespoke.
 *
 * The dates are still the state underneath. A preset just fills them in,
 * so nothing downstream has to know this exists, and picking a custom
 * range still works exactly as it did.
 *
 * yyyy-mm-dd by hand, not toISOString(): that converts to UTC first, so
 * anyone east of Greenwich gets yesterday for a day or two either side of
 * midnight — on a financial report, where the boundary of a month is the
 * whole point.
 */
export type RangeKey = "all" | "7d" | "30d" | "mtd" | "lastm" | "custom";

export const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  mtd: "This month",
  lastm: "Last month",
  custom: "Custom",
};

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function rangeToDates(key: RangeKey, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (key === "all" || key === "custom") return { from: "", to: "" };
  if (key === "7d") {
    const f = new Date(t);
    // Six days back, not seven: "last 7 days" that covers eight is the
    // kind of off-by-one nobody reports and every total is wrong by.
    f.setDate(f.getDate() - 6);
    return { from: ymd(f), to: ymd(t) };
  }
  if (key === "30d") {
    const f = new Date(t);
    f.setDate(f.getDate() - 29);
    return { from: ymd(f), to: ymd(t) };
  }
  if (key === "mtd") {
    return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t) };
  }
  // Last month, whole. Day 0 of this month is the last day of the one
  // before it, which is also how February and a leap year sort themselves
  // out without a table.
  const first = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const last = new Date(t.getFullYear(), t.getMonth(), 0);
  return { from: ymd(first), to: ymd(last) };
}

/**
 * Three letters, every month, from a table.
 *
 * NOT toLocaleDateString("short"). Newer ICU returns "Sept" for September
 * and three letters for the other eleven, so a column of dates has one
 * row a character wider than the rest — and which you get depends on the
 * Node version on the server and the browser version on the client, for a
 * string both of them render. A date on a financial report is not a place
 * for a value that moves when somebody upgrades.
 */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Day, three-letter month, and the year when it is not obvious. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "1 – 19 Sep 2026", and the shortest true form of it. */
export function describeRange(from: string, to: string): string {
  if (!from && !to) return "All time";
  const fmt = (v: string, withYear: boolean) => {
    const [y, m, d] = v.split("-").map(Number);
    if (!y || !m || !d) return v;
    const month = MONTHS[m - 1] ?? "";
    return withYear ? `${d} ${month} ${y}` : `${d} ${month}`;
  };
  if (from && !to) return `From ${fmt(from, true)}`;
  if (!from && to) return `Up to ${fmt(to, true)}`;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(5, 7) === to.slice(5, 7);
  if (from === to) return fmt(from, true);
  if (sameMonth) return `${Number(from.slice(8, 10))} – ${fmt(to, true)}`;
  return `${fmt(from, !sameYear)} – ${fmt(to, true)}`;
}
