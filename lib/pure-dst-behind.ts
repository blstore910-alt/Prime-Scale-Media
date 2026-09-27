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
  /**
   * The whole gap nobody has entered, ready to prefill: the day after
   * the last entry, through to YESTERDAY.
   *
   * Not a fixed seven days. The owner, 27-09: "als iemand dus 13 dagen
   * behind is vult die dst voor 13 dagen ofzo, altijd -1 dag want
   * vandaag kan nog niet klaar." Right on both counts -- a 13-day gap
   * filled as one 7-day week leaves six days behind and nobody notices,
   * and a period ending today asks somebody to enter a base for a day
   * the supplier has not finished billing.
   */
  nextPeriodStart: string;
  nextPeriodEnd: string;
  /** Days in that period. 13 behind is a 13-day period, not two weeks. */
  periodDays: number;
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
    // The day after the last entry, through to yesterday. Today is not
    // offered: the supplier has not finished billing it, so a base typed
    // for it would be a guess that has to be corrected later.
    const nextStart = new Date(end.getTime() + DAY);
    const nextEnd = new Date(today.getTime() - DAY);
    // daysBehind >= thresholdDays >= 1 guarantees nextEnd >= nextStart,
    // but a threshold of 0 would not, and a period that runs backwards
    // is worse than no suggestion.
    if (nextEnd < nextStart) continue;
    out.push({
      advertiserId,
      lastPeriodEnd: iso(end),
      daysBehind,
      // Still reported, because "three weeks behind" is the sentence a
      // person understands -- but it is no longer what gets entered.
      weeksMissing: Math.floor(daysBehind / 7),
      nextPeriodStart: iso(nextStart),
      nextPeriodEnd: iso(nextEnd),
      periodDays:
        Math.round((nextEnd.getTime() - nextStart.getTime()) / DAY) + 1,
    });
  }

  out.sort((a, b) => b.daysBehind - a.daysBehind);
  return out;
}
