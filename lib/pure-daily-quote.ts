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


// ── AND A DIFFERENT SET FOR THE PEOPLE WHOSE COMPANY IT IS ──────────
//
// The owner, 27-09: "super admin moet entrepreneur quotes, wij zijn de
// founders van PSM dus en andere bedrijven. Admins zijn meeste customer
// service en client success manager."
//
// Two different jobs and two different tired. The desk is tired of
// other people's problems; a founder is tired of decisions nobody else
// can make. A line that helps one is noise to the other.
//
// Same two rules as the set above, and they matter MORE here because
// this is the genre that invented both: nothing that demands ("crush
// it"), and nothing that pretends the hard part is not hard ("embrace
// the chaos"). A founder has read ten thousand of those and they are
// worth less than silence.
export const FOUNDER_QUOTES: string[] = [
  "The boring version that ships beats the good version that does not.",
  "You are allowed to change your mind about something you announced.",
  "Most decisions are reversible. Spend the worry on the few that are not.",
  "Revenue is the only feedback that is not being polite to you.",
  "You cannot out-work a problem you have not named.",
  "The thing you keep not doing is usually the thing.",
  "Ask a customer. They will tell you in one sentence what a month of guessing will not.",
  "Small company, short meetings. That is the whole advantage — do not spend it.",
  "If two people can decide it, you should not be in the room.",
  "Hire for the company you have, not the one in the deck.",
  "A month of runway is worth more than a quarter of plans.",
  "The competitor you are watching is watching someone else.",
  "You do not have to answer today just because it was asked today.",
  "Cut the feature. Nobody has ever missed the one that was not built.",
  "Being trusted with other people's money is the whole business. The rest is software.",
  "The problem you had at ten customers comes back at a hundred, louder.",
  "Say the price out loud. If you cannot, it is the wrong price.",
  "Good news travels on its own. Go and look for the other kind.",
  "You built the thing. Let someone else run it for an afternoon.",
  "The quiet customer is not happy. They are just quiet.",
  "Two founders who disagree in private and agree in public is the whole job.",
  "Write the hard message. The draft you keep rereading is already good enough.",
  "Growth you cannot support is a refund with a delay on it.",
  "Nobody is coming to tell you it is enough for today. Decide it yourself.",
  "The company can survive a bad quarter. It cannot survive you not sleeping for one.",
  "Do the unglamorous reconciliation. That is where the surprises live.",
  "You are further along than the version of you who started would have believed.",
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

// ── EN VOOR DE KLANT ────────────────────────────────────────────────
//
// De eigenaar, 30-09: "kun je hieronder zeer kleine subtiele quote
// geven voor advertisers en voor affiliates, hun zijn dus ook
// ondernemers, en of advertiser/affiliate of allebei."
//
// Drie sets, want het zijn drie verschillende dagen. Een adverteerder
// geeft geld uit en wacht op wat het doet; een affiliate verdient aan
// wie hij binnenbrengt en wacht op andermans beslissing; iemand die
// allebei is doet die twee tegelijk.
//
// Zelfde twee valkuilen vermeden als bij de balie hierboven, en bij
// een ondernemer zijn ze scherper: niets dat meer eist ("schaal op",
// "denk groter") en niets dat het werk wegwuift ("elke tegenslag is
// een kans"). Iemand die zijn eigen geld in advertenties steekt heeft
// geen aanmoediging nodig maar een rustige zin.
//
// En niets over ONS: geen "bedankt dat je klant bent" en geen
// verkapte verkoop. Dit staat op hun eigen dashboard, niet in een
// nieuwsbrief.

// ── EEN REGEL, EEN REGEL LANG ───────────────────────────────────────
//
// De eigenaar, 30-09: "is er niet teveel leegruimte bij de quote? en
// liefst zoveel mogelijk 1 quote op 1 line."
//
// De vorige lijst liep tot 67 tekens en brak op een telefoon in twee
// regels. Twee regels maken van een terloopse zin een mededeling: de
// hero wordt hoger, het saldo zakt weg, en de witruimte eromheen valt
// juist op. Daarom staat er nu een grens op, en die wordt bewaakt door
// een test in tests/lib/daily-quote.test.ts -- MAX_QUOTE_LEN. Een
// langere zin is niet "iets minder mooi", hij breekt de bedoeling.
//
// 46 is gemeten, niet gekozen. Op productie nagemeten met het echte
// font (DM Sans 11.84px) via canvas measureText: de breedste zin van
// de 26 is 254px, en er is 328px beschikbaar op een 360px-toestel --
// het smalste waar dit scherm op gebruikt wordt. Dus 74px over, en
// geen van de 26 breekt op 360 of op 390.
export const MAX_QUOTE_LEN = 46;

export const ADVERTISER_QUOTES: string[] = [
  "A slow week is data, not a verdict.",
  "The budget you did not spend is still yours.",
  "Most of the building never gets posted.",
  "You can stop a campaign that is not working.",
  "Steady beats clever more often than not.",
  "One day is a number. The line is the story.",
  "Knowing what failed is worth what it cost.",
  "You do not have to decide it all today.",
  "Small and profitable is a real business.",
  "Last month's work is still working today.",
];

export const AFFILIATE_QUOTES: string[] = [
  "One introduction outlasts a hundred posts.",
  "You brought someone here who stayed.",
  "A quiet month does not undo the ones before.",
  "People come back to whoever was straight.",
  "The referral that takes a year still counts.",
  "You cannot decide for them. Be easy to ask.",
  "Trust compounds. So does the other thing.",
  "Somebody trusted your word today.",
  "The list grows if you keep showing up.",
];

export const BOTH_QUOTES: string[] = [
  "Two ways to earn, two ways to have a week.",
  "You run your own thing and bring others.",
  "Some days the ads work, some days referrals.",
  "You spent your own money learning this.",
  "You may let one side be quiet for a while.",
  "They trust you because you do it yourself.",
  "Two slow lines still add up to one.",
];

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
  /**
   * Wie er leest. "desk" blijft de standaard, want dat was het eerst
   * en een aanroep zonder doelgroep hoort niet stil van set te
   * wisselen.
   */
  audience: "owner" | "desk" | "advertiser" | "affiliate" | "both" = "desk",
): string | null {
  const s = String(seed ?? "").trim();
  if (!s) return null;
  const list =
    audience === "owner"
      ? FOUNDER_QUOTES
      : audience === "advertiser"
        ? ADVERTISER_QUOTES
        : audience === "affiliate"
          ? AFFILIATE_QUOTES
          : audience === "both"
            ? BOTH_QUOTES
            : DAILY_QUOTES;
  if (list.length === 0) return null;
  // The audience is in the hash as well, so somebody who is both -- an
  // owner reading their own desk screen -- does not get the same line
  // twice in two places on the same day.
  const n = hash(`${s}|${audience}|${dayKey(now)}`) % list.length;
  return list[n];
}
