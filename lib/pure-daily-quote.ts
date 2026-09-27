// ── A KIND LINE, ONE PER PERSON PER DAY ─────────────────────────────
//
// The owner, 27-09: "miss een super mooie nette lieve aardige quote van
// de dag, elke admin moet een andere. Het zijn 100% vrouwelijke
// medewerkers bij ons momenteel die customer service doen, soms zijn ze
// vermoeid, dus iets aardigs zou mooi zijn."
//
// WHY THE LINES BELOW ARE NOT WRITTEN "FOR WOMEN"
//
// That the desk is currently all women is the reason to be kind, not a
// reason to be gendered. A line written at a woman reads as written at
// her -- and the next person hired is somebody else anyway. So these are
// written for a person at the end of a queue of other people's money
// problems, which is what the job actually is.
//
// They also avoid the two failure modes of this kind of thing: nothing
// that demands more ("crush it today"), and nothing that pretends the
// work is not work ("every problem is an opportunity"). Somebody tired
// at 4pm does not need a target or a reframe.

export const DAILY_QUOTES: string[] = [
  "Somebody's whole week gets easier because you answered. That counts.",
  "You are allowed to take the next one slowly.",
  "Careful work is faster than quick work you have to do twice.",
  "Nobody remembers the fast reply. They remember the kind one.",
  "You don't have to have the answer to be helpful.",
  "A short break is part of the work, not a pause in it.",
  "The queue will still be there. So will you. Drink some water.",
  "It is fine for a hard one to have been hard.",
  "You are the reason somebody stopped worrying about their money today.",
  "Half of this job is patience, and you have more than you think.",
  "Saying “I'll find out” is a complete answer.",
  "The person on the other end is having a worse day about this than you are.",
  "Small and steady beats heroic and exhausted.",
  "You can be tired and still be good at this. Both are true right now.",
  "Whatever is left at the end of today is tomorrow's, not yours to carry home.",
  "Ask for help before you need it, not after.",
  "Getting one thing properly right is a good day.",
  "You are not behind. There is just a lot.",
  "Being clear is kinder than being quick.",
  "Nobody here expects you to be a machine.",
  "The difficult customer is not about you.",
  "You noticed something nobody else did today. You usually do.",
  "Rest is not a reward for finishing. Take some anyway.",
  "It is okay to close the laptop at the end of the day mid-queue.",
  "Thank you for the ones nobody saw you handle.",
  "You made something complicated feel simple for somebody. That is skill.",
  "Two more, then stretch.",
  "The standard is care, not speed. You already meet it.",
  "If today is a slow one, let it be a slow one.",
  "Somebody trusted you with their money today and you were worth it.",
];

/**
 * A stable 32-bit hash. Not for anything that matters — it only has to
 * spread short strings evenly across a small list and give the same
 * answer on every render.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The day, in the reader's own clock. A quote that changes at midnight
 *  UTC would change mid-afternoon for somebody, which is exactly the
 *  jarring thing this is trying not to be. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * One line, for this person, on this day.
 *
 * `seed` is the reader's profile id. Two people on the same day land on
 * different lines because their seeds differ, and one person's line
 * moves at midnight because the day is in the hash too.
 *
 * NOT GUARANTEED UNIQUE ACROSS PEOPLE, and it cannot be without knowing
 * who else is on today. With thirty lines and a handful of admins a
 * collision is uncommon and harmless — two colleagues reading the same
 * kind sentence is not a fault.
 *
 * Returns null when there is nothing to show rather than a fallback
 * string: no seed means we do not know who is reading, and a greeting
 * addressed to nobody is worse than no greeting.
 */
export function dailyQuote(
  seed: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const s = String(seed ?? "").trim();
  if (!s) return null;
  if (DAILY_QUOTES.length === 0) return null;
  const n = hash(`${s}|${dayKey(now)}`) % DAILY_QUOTES.length;
  return DAILY_QUOTES[n];
}
