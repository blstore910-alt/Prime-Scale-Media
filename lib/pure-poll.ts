/**
 * POLLS — the owner asks everybody a question.
 *
 * The owner, 28-09: "bouw ook de poll systeem dat super admin makkelijk
 * een poll kan maken voor alle users."
 *
 * The arithmetic and the rules live here so the admin screen, the
 * customer's card and the tests all agree on what a poll is, what
 * counts as a vote, and how a result is worked out. The database keeps
 * the rows; this decides what they mean.
 */

export type PollOption = {
  /** Stable across edits, so a vote never moves to a different answer. */
  id: string;
  label: string;
};

/** Who is asked. Everyone, unless the owner narrows it. */
export type PollAudience = "everyone" | "advertisers" | "affiliates";

export type PollStatus = "draft" | "open" | "closed";

/**
 * What kind of answer the poll wants.
 *
 *   "choice" — pick one of the answers the owner wrote.
 *   "open"   — say it in your own words.
 *   "both"   — pick one, and add a line if you want to.
 *
 * The owner, 28-09: "het moet zijn poll + words of alleen poll of
 * alleen words". "both" is the one people actually answer twice: the
 * bars give you a number you can act on, and the comments tell you why
 * the number is what it is.
 *
 * The owner, 28-09: "open answer moet ook mogelijk zijn en char limited
 * en veilig". Both halves of that are enforced below and again in the
 * database (plak 133), because a length checked only on the screen is
 * not a length check: the RPC is callable directly.
 */
export type PollKind = "choice" | "open" | "both";

/** The longest answer somebody can type. Short enough to read in a
 *  list of two hundred, long enough to say something. */
export const MAX_ANSWER = 280;

/**
 * An open answer, ready to store: trimmed, capped, and with the
 * characters that make a mess of a CSV or a log taken out.
 *
 * NOT escaped for HTML — React escapes what it renders, and escaping
 * here would store `&amp;` in the database and show it to the owner.
 * What IS removed are control characters: they are invisible on screen,
 * they break a CSV export mid-row, and a NUL byte is refused by
 * Postgres outright, which would turn a customer typing into an error
 * they cannot understand.
 */
export function cleanAnswer(value: unknown): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0) ?? 0;
    // Control characters become a space: they are invisible on screen,
    // they break a CSV export mid-row, and Postgres refuses a NUL byte
    // outright — which would turn somebody typing into an error they
    // cannot understand. Tab and newline are controls too, and a
    // one-line answer does not need them.
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/ {2,}/g, " ").trim().slice(0, MAX_ANSWER);
}

export type PollRow = {
  id: string;
  question: string;
  options: PollOption[] | null;
  audience: string | null;
  status: string | null;
  closes_at?: string | null;
};

export const POLL_AUDIENCES: PollAudience[] = [
  "everyone",
  "advertisers",
  "affiliates",
];

export const MAX_OPTIONS = 8;
export const MIN_OPTIONS = 2;
export const MAX_QUESTION = 200;
export const MAX_LABEL = 80;

/** A slug that survives an edit to the label it was made from. */
export function optionId(index: number): string {
  return `o${index + 1}`;
}

/**
 * The options as the database should store them: trimmed, empty ones
 * dropped, each with an id that does not move.
 *
 * The ids are positional on purpose. An owner who fixes a typo in
 * "Meta" keeps every vote on it; an owner who REPLACES option 2 with a
 * different answer keeps the votes too, and that is the honest
 * trade — the alternative is a random id per edit, which silently
 * discards votes whenever anybody touches the wording. The admin
 * screen says so before saving on a poll that already has votes.
 */
export function normalizeOptions(labels: readonly string[]): PollOption[] {
  return labels
    .map((l) => String(l ?? "").trim().slice(0, MAX_LABEL))
    .filter((l) => l.length > 0)
    .map((label, i) => ({ id: optionId(i), label }));
}

export type PollProblem =
  | "question-missing"
  | "question-too-long"
  | "too-few-options"
  | "too-many-options"
  | "duplicate-options";

/** Everything wrong with a poll, so the screen can say all of it at once. */
export function pollProblems(input: {
  question: string;
  options: readonly string[];
  kind?: PollKind;
}): PollProblem[] {
  const out: PollProblem[] = [];
  const q = String(input.question ?? "").trim();
  if (!q) out.push("question-missing");
  if (q.length > MAX_QUESTION) out.push("question-too-long");

  // An open poll has no answers to write, so none of the checks below
  // apply. Asking for two of them would be asking for something that
  // does not exist on that form. "both" DOES have answers, so it keeps
  // every check.
  if (input.kind === "open") return out;

  const opts = normalizeOptions(input.options);
  if (opts.length < MIN_OPTIONS) out.push("too-few-options");
  if (opts.length > MAX_OPTIONS) out.push("too-many-options");

  const seen = new Set<string>();
  for (const o of opts) {
    const key = o.label.toLowerCase();
    if (seen.has(key)) {
      out.push("duplicate-options");
      break;
    }
    seen.add(key);
  }
  return out;
}

/** What to put under the form, in the owner's words. */
export function pollProblemText(p: PollProblem): string {
  switch (p) {
    case "question-missing":
      return "Write the question first.";
    case "question-too-long":
      return `Keep the question under ${MAX_QUESTION} characters.`;
    case "too-few-options":
      return "A poll needs at least two answers.";
    case "too-many-options":
      return `That is more than ${MAX_OPTIONS} answers.`;
    case "duplicate-options":
      return "Two answers say the same thing.";
    default:
      return "Something about this poll is not right.";
  }
}

/** A poll is only open if it says so AND its closing time has not passed. */
export function isPollOpen(
  poll: Pick<PollRow, "status" | "closes_at">,
  now: Date = new Date(),
): boolean {
  if (String(poll.status ?? "").toLowerCase() !== "open") return false;
  const closes = poll.closes_at ? Date.parse(poll.closes_at) : NaN;
  // A closing time we cannot read is not a closed poll. The owner set
  // the status; an unparseable date should not silently retire it.
  if (!Number.isFinite(closes)) return true;
  return closes > now.getTime();
}

/**
 * Whether this person is one of the people being asked.
 *
 * Admins are shown every poll whatever the audience — they are the ones
 * who have to see what their customers are being asked, and a poll they
 * cannot see is one nobody proof-reads.
 */
export function pollIsForRole(
  audience: string | null | undefined,
  role: string | null | undefined,
  opts: { isAffiliate?: boolean } = {},
): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "admin") return true;
  // `?? "everyone"` does NOT catch an empty string, and a column that
  // has never been written comes back as "" often enough. It fell
  // through to the unrecognised branch and the poll reached nobody —
  // the exact opposite of the default it is meant to be.
  const a = String(audience ?? "").trim().toLowerCase() || "everyone";
  if (a === "everyone") return true;
  if (a === "affiliates") return r === "affiliate" || opts.isAffiliate === true;
  if (a === "advertisers") return r === "advertiser";
  // An audience nobody recognises is shown to nobody rather than to
  // everybody: a typo must not broadcast a question to the whole book.
  return false;
}

export type PollTallyRow = {
  option: PollOption;
  votes: number;
  /** 0-100, rounded to one decimal, and they add to 100 (see below). */
  pct: number;
};

/**
 * The result. Percentages that ADD UP.
 *
 * Rounding each share on its own gives 33.3 + 33.3 + 33.3 = 99.9 under
 * a heading that says 3 of 3 voted, which is the kind of thing somebody
 * screenshots. The largest remainder gets the difference, so the column
 * always totals 100 when anybody has voted at all.
 */
export function pollTally(
  options: readonly PollOption[],
  votes: readonly { option_id: string | null }[],
): { rows: PollTallyRow[]; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const v of votes) {
    const id = String(v.option_id ?? "");
    if (!options.some((o) => o.id === id)) continue; // a retired answer
    counts.set(id, (counts.get(id) ?? 0) + 1);
    total += 1;
  }

  if (total === 0) {
    return {
      rows: options.map((option) => ({ option, votes: 0, pct: 0 })),
      total: 0,
    };
  }

  const raw = options.map((option) => {
    const votes = counts.get(option.id) ?? 0;
    return { option, votes, exact: (votes / total) * 100 };
  });
  const rows: PollTallyRow[] = raw.map((r) => ({
    option: r.option,
    votes: r.votes,
    pct: Math.floor(r.exact * 10) / 10,
  }));

  // Hand the rounding loss to whoever lost the most of it.
  const sum = rows.reduce((a, r) => a + r.pct, 0);
  const short = Math.round((100 - sum) * 10) / 10;
  if (short !== 0) {
    let best = 0;
    let bestRemainder = -1;
    raw.forEach((r, i) => {
      const remainder = r.exact * 10 - Math.floor(r.exact * 10);
      if (remainder > bestRemainder) {
        bestRemainder = remainder;
        best = i;
      }
    });
    rows[best] = {
      ...rows[best],
      pct: Math.round((rows[best].pct + short) * 10) / 10,
    };
  }
  return { rows, total };
}

/** The sentence under the result. */
export function pollTotalText(total: number): string {
  if (total === 0) return "Nobody has answered yet.";
  if (total === 1) return "1 answer so far.";
  return `${total} answers so far.`;
}
