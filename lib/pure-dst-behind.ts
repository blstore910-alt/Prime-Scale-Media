// ── WHO IS BEHIND ON DST, AND BY HOW MUCH ───────────────────────────
//
// The owner, 27-09: "dit moet een slimmere systeem en buttons beter
// plaatsen en we moeten zien bijv welke klanten al 7+ dagen achterlopen
// met dit dan moet weer aangevuld worden, moet fijne auto systeem en
// easy voor alle medewerkers."
//
// DST is entered by hand: one line per customer, per week, per country,
// with the base the supplier debited us. Nothing schedules it and
// nothing chases it -- so a week nobody typed is a week nobody sees. On
// the live database today there is ONE customer with ONE line, its
// period ended 20-09, and it is 27-09.
//
// WHO COUNTS AS "SUBJECT TO DST". There is no flag for it: any customer
// can be given a line, and the desk decides. So the only honest
// definition is the one the desk has already made -- a customer with at
// least one DST line is a customer we tax, and the question is whether
// their weeks are up to date. A customer with no line at all is not
// "behind", they are simply not on this list, and inventing them here
// would fill the screen with everybody.
//
// WEEKS, NOT DAYS, is what gets entered. So the answer a person needs is
// not "7 days late" on its own but "the week of 21-27 Sep is missing" --
// something they can act on without working out the dates themselves.

export type DstRow = {
  advertiser_id: string;
  period_start: string;
  period_end: string;
};

export type DstBehind = {
  advertiserId: string;
  /** The end of the most recent week entered, as yyyy-mm-dd. */
  lastPeriodEnd: string;
  /** Whole days between that end and today. */
  daysBehind: number;
  /** Complete weeks that could be entered now. At least 1 when listed. */
  weeksMissing: number;
  /** The first week nobody has entered yet, ready to prefill. */
  nextPeriodStart: string;
  nextPeriodEnd: string;
};

const DAY = 86_400_000;

/** yyyy-mm-dd from a Date, in the reader's own clock. */
function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Midnight local, from a yyyy-mm-dd. Parsing "2026-09-20" with the Date
 *  constructor gives UTC midnight, which is the previous evening in any
 *  western timezone -- and that is a whole day of error in a figure whose
 *  only job is counting days. */
function day(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Per customer: how far behind, and which week to enter next.
 *
 * `thresholdDays` is how stale a customer has to be before they are
 * worth showing. The owner said 7 — one whole week missed. Anything less
 * is just "this week has not finished yet".
 *
 * Sorted worst first, because a list of people who are late is read from
 * the top and acted on until somebody runs out of time.
 */
export function dstBehind(
  rows: DstRow[] | null | undefined,
  now: Date = new Date(),
  thresholdDays = 7,
): DstBehind[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // The latest period_end per customer. Strings would sort correctly for
  // yyyy-mm-dd, but a bad row would sort as text and win, so they are
  // compared as dates and anything unparseable is skipped rather than
  // trusted.
  const latest = new Map<string, Date>();
  for (const r of rows ?? []) {
    const id = String(r?.advertiser_id ?? "");
    if (!id) continue;
    const end = day(String(r?.period_end ?? ""));
    if (!end) continue;
    const held = latest.get(id);
    if (!held || end > held) latest.set(id, end);
  }

  const out: DstBehind[] = [];
  for (const [advertiserId, end] of latest) {
    const daysBehind = Math.floor((today.getTime() - end.getTime()) / DAY);
    if (daysBehind < thresholdDays) continue;
    // The next week starts the day after the last one ended.
    const nextStart = new Date(end.getTime() + DAY);
    const nextEnd = new Date(nextStart.getTime() + 6 * DAY);
    out.push({
      advertiserId,
      lastPeriodEnd: iso(end),
      daysBehind,
      // Only whole weeks that have finished. A week still running is not
      // missing yet, and offering it would have the desk entering a
      // partial base and correcting it later.
      weeksMissing: Math.floor(daysBehind / 7),
      nextPeriodStart: iso(nextStart),
      nextPeriodEnd: iso(nextEnd),
    });
  }

  out.sort((a, b) => b.daysBehind - a.daysBehind);
  return out;
}
