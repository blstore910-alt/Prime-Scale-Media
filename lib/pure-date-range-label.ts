// ─────────────────────────────────────────────────────────────────────
// A date range in as few characters as the range allows
// ─────────────────────────────────────────────────────────────────────
// The dashboard and the commissions filter both printed a range as
// `DD-MM-YYYY - DD-MM-YYYY`. That is 23 characters, always, and it sits
// in a button on a bar that also holds four period buttons and two step
// arrows. On a phone "01-08-2026 - 31-08-2026" broke onto three lines
// and left a tall ragged box in the middle of the control bar.
//
// Almost every range this app produces is a whole calendar month --
// the month arrows make one with every press -- and a whole month has
// a two-word name. So say the shortest true thing:
//
//   a whole month              Aug 2026
//   a whole year               2026
//   one day                    1 Aug 2026
//   within one month           1-31 Aug 2026
//   within one year            1 Aug - 3 Sep 2026
//   across years               1 Aug 2026 - 3 Jan 2027
//
// Local getters throughout, because the range itself is built from
// local calendar days: a UTC reading of local midnight is the previous
// day for every customer west of Greenwich, which would print
// "31 Jul - 30 Aug" for August.
// ─────────────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const EN_DASH = "\u2013";

function asDate(v: Date | string | number | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Last calendar day of the month `d` falls in. */
function lastDayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function compactRangeLabel(
  from: Date | string | number | null | undefined,
  to: Date | string | number | null | undefined,
): string {
  const a = asDate(from);
  const b = asDate(to);
  if (!a || !b) return "";

  // Given backwards, read forwards. A range that prints "31 Aug - 1 Aug"
  // reads as a mistake by us rather than by whoever picked it.
  const [s, e] = a.getTime() <= b.getTime() ? [a, b] : [b, a];

  const sy = s.getFullYear();
  const ey = e.getFullYear();
  const sm = s.getMonth();
  const em = e.getMonth();
  const sd = s.getDate();
  const ed = e.getDate();

  const sameYear = sy === ey;
  const sameMonth = sameYear && sm === em;

  if (sameMonth && sd === ed) return `${sd} ${MONTHS[sm]} ${sy}`;

  // A whole calendar year, then a whole calendar month: both are named,
  // and the name is shorter and clearer than its two endpoints.
  if (sameYear && sm === 0 && em === 11 && sd === 1 && ed === 31) {
    return String(sy);
  }
  if (sameMonth && sd === 1 && ed === lastDayOfMonth(e)) {
    return `${MONTHS[sm]} ${sy}`;
  }

  if (sameMonth) return `${sd}${EN_DASH}${ed} ${MONTHS[sm]} ${sy}`;
  if (sameYear) {
    return `${sd} ${MONTHS[sm]} ${EN_DASH} ${ed} ${MONTHS[em]} ${sy}`;
  }
  return `${sd} ${MONTHS[sm]} ${sy} ${EN_DASH} ${ed} ${MONTHS[em]} ${ey}`;
}
