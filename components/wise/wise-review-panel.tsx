"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  confirmWiseSuggestion,
  probeWiseDepositLookup,
  refreshWiseDepositDetails,
  rematchWiseDeposits,
  setWiseDepositArchived,
} from "@/actions/wise-actions";
import { wiseIngestStatus } from "@/actions/integration-actions";
import { isPlaceholderIban } from "@/lib/integrations/wise-match";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import PaymentSlipDialog from "@/components/wallet-transactions/payment-slip-dialog";
import { formatPaymentReference } from "@/lib/payment-reference";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { currencySymbol } from "@/lib/pure-invoice-currency";
import { adjustWalletTopupAmount } from "@/actions/wise-actions";

// fromNow() is a plugin, not a built-in — without this it throws.
dayjs.extend(relativeTime);

type WiseRow = {
  id: string;
  external_id: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  status: string;
  note: string | null;
  archived_at: string | null;
  description: string | null;
  suggested_topup_id: string | null;
  created_at: string;
  sender_name: string | null;
  sender_iban: string | null;
};

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Map each Wise result to one of the mockup badge tones. The active
// `.psmapp` scope only ships ok/pend/due/info, so neutral results
// (unmatched/received) get the muted look inline from the shell tokens.
const NEUTRAL: CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--txt-2)",
};
/**
 * What each deposit's state is CALLED on screen.
 *
 * The column holds six words and two of them mean the same thing to the
 * person reading: 'suggested' is a match this feed found and is waiting for
 * you to confirm, and 'matched' is the same thing from before the
 * safe-start phase existed (and from an auto-settle run). Printing the raw
 * column put both on the screen, so the same situation appeared under two
 * names and you had to know the schema to tell that they were one.
 *
 * So: what state is it in, in words about MONEY.
 *   Match found  — we think we know which top-up this is. Nothing credited.
 *   Credited     — the top-up was completed and the wallet has the money.
 *   Needs a look — several top-ups fit and we refuse to guess.
 *   No match     — nothing pending fits it (yet: Re-check asks again).
 */
function statusView(status: string): {
  label: string;
  cls: string;
  tone: string;
  style?: CSSProperties;
} {
  switch (status) {
    case "confirmed":
    case "completed":
      return { label: "Credited", cls: "badge ok", tone: "t-done" };
    case "matched":
      // 'matched' means the money is ALREADY IN THE WALLET — the card body
      // says "Credited" for it and offers no button. It was folded in with
      // 'suggested' when the label changed to "Ready to credit", so a
      // settled row wore a blue bar and a badge saying it was waiting for
      // somebody, above the word Credited.
      return { label: "Credited", cls: "badge ok", tone: "t-done" };
    case "suggested":
      // "Match found" describes the database. "Ready to credit" describes
      // the admin's next move, which is the only thing this screen is for.
      return { label: "Ready to credit", cls: "badge pend", tone: "t-ready" };
    case "ambiguous":
      return { label: "Needs a look", cls: "badge due", tone: "t-open" };
    case "unmatched":
      return {
        label: "Waiting to be matched",
        cls: "badge",
        tone: "t-open",
        style: NEUTRAL,
      };
    default:
      return { label: "Received", cls: "badge", tone: "t-open", style: NEUTRAL };
  }
}

/** EUR 5.00 is a database row. 5,00 EUR with a symbol is money. */
const SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  HKD: "HK$",
};
/**
 * The same rule the MATCHER uses, so the screen and the matcher cannot
 * disagree about what counts as a bank account.
 *
 * This file had its own copy of the placeholder list, added when the only
 * problem looked like an ugly UNKNOWNBANKACCOUNT under a payer's name. It
 * is not only a display problem — that value is a matching key — so the
 * list lives in lib/integrations/wise-match.ts now and this reads it.
 */
function realIban(v: string | null): string | null {
  return isPlaceholderIban(v) ? null : v;
}

/**
 * The note, in a sentence an admin would say out loud.
 *
 * These are written by the matcher and stored on the row, so they read like
 * what they are: "no pending topup with matching amount/currency" — a
 * database column joined to another with a slash. The person reading it is
 * deciding whether somebody's money is stuck, and the sentence should tell
 * them what to DO, not which query failed.
 *
 * Mapped at render rather than at write, because 231 rows already carry the
 * old wording and they deserve the new sentence too.
 */
const NOTE_TEXT: Array<[RegExp, string]> = [
  [
    /^no pending topup with matching amount/i,
    "No customer has told us to expect this payment. Match it by hand, or leave it until they file a top-up.",
  ],
  [
    /^one pending topup fits the amount/i,
    "One top-up fits the amount — but an amount is not proof of whose money this is. Match it by hand once you are sure.",
  ],
  [
    /pending topups match the amount/i,
    "Several top-ups fit this amount, so nothing here can tell them apart. Match it by hand.",
  ],
  [
    /^amount-only match withdrawn/i,
    "This was matched on the amount alone, which proves nothing about whose money it is. It was put back for a person to decide.",
  ],
  [
    /filed too far from this payment/i,
    "A top-up fits the amount, but it was filed too long before or after this payment to be the same one.",
  ],
  [
    /no longer pending/i,
    "The top-up this pointed at has already been credited another way.",
  ],
  [
    /multiple topups share that reference/i,
    "More than one top-up carries that reference, so the reference cannot decide it.",
  ],
  [
    /multiple same-amount topups/i,
    "This payer has several top-ups of the same amount across their accounts. The reference would settle it; without one, match by hand.",
  ],
  [/^re-checked: matched via reference/i, "Matched on the payer's reference."],
  [/^re-checked: matched via sender/i, "Matched on a bank account we have seen from this customer before."],
];
function readableNote(note: string | null): string | null {
  if (!note) return null;
  for (const [pattern, text] of NOTE_TEXT) {
    if (pattern.test(note)) return text;
  }
  return note;
}

/** Put a string on the clipboard and say so. */
function copyText(value: string) {
  if (!value) return;
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success("Copied " + value))
    .catch(() =>
      toast.error("Couldn't copy that — select it by hand instead."),
    );
}

/** Digits only, for comparing two spellings of one reference. */
const refDigits = (v: string) => v.replace(/\D+/g, "");

/**
 * Wise's description, but only when it SAYS something.
 *
 * It is generated from the same two facts the card already prints in their
 * own right: "Received money from BL E-COMMERCE with reference
 * 0005-6164655424" — the sender, on the line above, and the reference, on
 * the line above that. Three lines, one fact each, and the third repeats
 * the other two in a sentence, clipped.
 *
 * A real one — a payer who typed a note, a bank that added something — is
 * worth the line. So the name and the reference are removed along with the
 * boilerplate around them, and if nothing is left, neither is the line.
 */
function usefulDescription(
  description: string | null,
  senderName: string | null,
  reference: string | null,
): string | null {
  if (!description) return null;
  let rest = description;
  for (const part of [senderName, reference]) {
    if (part) rest = rest.split(part).join(" ");
  }
  rest = rest
    .replace(/received money( from)?/gi, " ")
    .replace(/with reference/gi, " ")
    .replace(/reference/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (rest.length <= 2) return null;
  // ── AND DO NOT PRINT A SENTENCE THAT STOPS MID-AIR ────────────────
  //
  // Walked on production: "Received money from Handy Products with
  // reference" — and then nothing, because that payment carries no
  // reference. It survives the filter above because the SENDER is also
  // missing from the payment record, so there is no name to strip and
  // the leftover is the payer's name out of the description itself.
  // That name is worth keeping: it is the only sender information this
  // deposit has. The dangling clause is not.
  const shown = description
    .replace(/\s*with\s+reference\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return shown.length > 2 ? shown : null;
}

function money(currency: string, cents: number): string {
  const cur = (currency || "").toUpperCase();
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  const sym = SYMBOL[cur];
  return sym ? sym + amount : cur + " " + amount;
}

// The deposit list, styled as its own thing.
//
// It used to be a five-column table folded into cards on a phone, so every
// deposit arrived as four stacked "REFERENCE & SENDER / RESULT / NOTE /
// ACTION" labels with the values hidden among them -- table headings
// pretending to be a card. An admin reading this screen wants four facts in
// this order: how much, from whom, where it is going, and what to press.
// That is what a card should be, so this is a card, not a folded row.
const WISE_CSS = `
.wdeps{display:flex;flex-direction:column;gap:10px}
@media(min-width:980px){
  .wdeps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
}
.wdep{position:relative;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;padding:13px 14px 13px 17px;overflow:hidden;
  box-shadow:var(--shadow-sm)}
.wdep::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;
  background:var(--line-2)}
.wdep.t-ready::before{background:var(--primary)}
.wdep.t-done::before{background:var(--win)}
.wdep.t-open::before{background:var(--warn)}
.wdep.is-archived{opacity:.72}
.wdh{display:flex;align-items:center;justify-content:space-between;gap:10px}
.wamt{font-family:var(--hd);font-weight:800;font-size:1.3rem;
  letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}
.wdh .badge{flex:0 0 auto}
.wdate{margin-top:1px;font-size:.76rem;color:var(--txt-2)}
.wfrom{margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
.wname{font-weight:650;font-size:.94rem;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.wname.none{font-weight:500;color:var(--faint)}
.wref{margin-top:5px;display:flex;align-items:center;gap:6px;min-width:0}
.wlab{font-size:.6rem;font-weight:800;letter-spacing:.08em;
  text-transform:uppercase;color:var(--txt-2);background:var(--panel-2);
  border-radius:5px;padding:2px 5px;flex:0 0 auto}
.wrefv{font-size:.88rem;font-weight:700;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.wnone{font-size:.83rem;color:var(--faint);font-style:italic}
.wiban,.wdesc{margin-top:4px;font-size:.73rem;color:var(--faint);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wto{margin-top:10px;display:flex;gap:9px;align-items:flex-start;
  background:var(--primary-tint);border-radius:10px;padding:9px 11px}
.wtoa{font-weight:800;color:var(--primary);flex:0 0 auto;line-height:1.35}
.wtoc{font-family:var(--hd);font-weight:800;font-size:.95rem;
  letter-spacing:-.01em}
.wtot{font-size:.8rem;color:var(--txt-2);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.wtor{margin-top:2px;font-size:.71rem;color:var(--faint)}
.wnote{margin:9px 0 0;font-size:.79rem;line-height:1.45;color:var(--txt-2)}
.wact{margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wact>.wmatch-open{grid-column:1/-1}
.wact>*{min-width:0}
.wact .btn{width:100%;justify-content:center}
.wdone{display:flex;align-items:center;justify-content:center;
  font-size:.83rem;font-weight:650;color:var(--win)}
.wtiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;
  margin-top:12px}
.wtile{background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:9px 11px;min-width:0}
.wtile b{display:block;font-family:var(--hd);font-size:1.12rem;font-weight:800;
  letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.25}
.wtile span{display:block;font-size:.64rem;color:var(--txt-2);
  text-transform:uppercase;letter-spacing:.06em;font-weight:800;margin-top:2px;
  /* Reserve the two lines the longest label needs, so three tiles with
     one-, two- and two-line captions do not end at three different
     heights. */
  min-height:2.2em;line-height:1.1}
.wtile.hot b{color:var(--warn)}
.wsearch{display:flex;align-items:center;gap:8px;margin-top:10px;
  background:var(--panel);border:1px solid var(--line);border-radius:11px;
  padding:0 10px;height:42px}
.wsearch svg{width:16px;height:16px;color:var(--faint);flex:0 0 auto}
.wsearch input{flex:1 1 auto;min-width:0;border:0;background:transparent;
  outline:none;font:inherit;font-size:.9rem;color:var(--ink);height:100%}
.wsearch input::placeholder{color:var(--faint)}
.wsearch button{flex:0 0 auto;border:0;background:transparent;cursor:pointer;
  display:flex;align-items:center;padding:4px;border-radius:6px}
.wsearch button:hover{background:var(--panel-2)}
.wcopy{display:inline-flex;align-items:center;gap:5px;border:0;padding:0;
  background:transparent;cursor:pointer;font:inherit;font-size:.88rem;
  font-weight:700;color:var(--ink);max-width:100%}
.wcopy svg{width:12px;height:12px;color:var(--faint);flex:0 0 auto}
.wcopy:hover{color:var(--primary)}
.wcopy:hover svg{color:var(--primary)}
`;

/** See the auto-sync in WiseReviewPanel. */
const AUTO_SYNC_KEY = "psm.wise.autosync";
const AUTO_SYNC_EVERY_MS = 10 * 60 * 1000;

// The state of the feed, as three numbers and — only when something is
// wrong — one sentence.
//
// This was a row of three green pills, a wrapping sentence of counts, and a
// paragraph of explanation above it: five things in a stack, saying roughly
// one thing. Worse, the pills were loudest when everything was FINE. "Webhook
// on / References readable / Manual confirm" is three green badges telling an
// admin that nothing has happened, every single time they open the screen, so
// the one day one of them turns red it reads as more of the same.
//
// So the good news is one quiet line, and the numbers an admin actually
// checks — how much arrived, how much we can read, how much is waiting on
// them — are the tiles.
function WiseTiles({
  waiting,
  waitingUnknown = false,
}: {
  waiting: number;
  /** The deposits read failed or is in flight, so `waiting` is 0 by
      accident. An admin scans this tile to decide whether anybody is
      owed a credit; a confident 0 closes the screen. */
  waitingUnknown?: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["wise-ingest-status"],
    queryFn: () => wiseIngestStatus(),
    staleTime: 60_000,
  });

  // Hold the height while it loads, and SAY something when it fails.
  // Returning null for both meant this strip appeared out of nowhere and
  // pushed the whole deposits list down — and when the read failed, the
  // line that says "webhook NOT configured — no deposit can arrive" simply
  // was not there.
  if (isLoading) {
    return <div style={{ height: 62, marginTop: 12 }} aria-hidden="true" />;
  }
  if (!data?.ok) {
    return (
      <div
        className="muted"
        style={{ marginTop: 12, fontSize: ".82rem", minHeight: 62 }}
      >
        Couldn&apos;t read the feed&apos;s status — this normally says whether
        the webhook is on.
      </div>
    );
  }

  const ago = data.newestReceivedAt
    ? dayjs(data.newestReceivedAt).fromNow()
    : null;

  // Only what is WRONG gets a sentence. Each of these changes what an admin
  // should do next; the healthy version of each changes nothing.
  const problems: string[] = [];
  if (!data.webhookConfigured) {
    problems.push("The webhook is not configured — no deposit can arrive.");
  }
  if (!data.readTokenConfigured) {
    problems.push(
      "No Wise read token — references stay blank and every deposit has to be matched by hand.",
    );
  }
  if (data.autoSettle) {
    problems.push(
      "AUTO-SETTLE IS ON — matched deposits credit wallets without anyone confirming.",
    );
  }

  return (
    <>
      <div className="wtiles">
        <div className="wtile">
          <b>{data.total}</b>
          <span>Deposits</span>
        </div>
        <div className="wtile">
          <b>{data.withReference}</b>
          <span>With a reference</span>
        </div>
        <div className={"wtile" + (!waitingUnknown && waiting > 0 ? " hot" : "")}>
          <b>{waitingUnknown ? "—" : waiting}</b>
          <span>Waiting for you</span>
        </div>
      </div>
      {problems.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          {problems.map((t) => (
            <p
              key={t}
              style={{
                margin: "4px 0 0",
                fontSize: ".82rem",
                fontWeight: 600,
                color: "var(--danger)",
              }}
            >
              {t}
            </p>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: "8px 0 0", fontSize: ".78rem" }}>
          Watching the bank automatically · nothing is credited until you
          confirm it{ago ? " · last payment " + ago : " · nothing received yet"}
        </p>
      )}
    </>
  );
}

export default function WiseReviewPanel() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["wise-incoming", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      // ── TWO OF THESE COLUMNS COME FROM PENDING MIGRATIONS ─────────
      //
      // `description` (20260917240000) and `archived_at` (20260917250000)
      // are named unconditionally. CLAUDE.md's rule is: ask for it, and
      // on error ask again without it — because a column the live schema
      // does not have yet does not degrade, it THROWS, and the whole
      // deposits screen goes dark rather than losing two fields. This is
      // the desk where customers' bank transfers wait to be credited.
      const BASE =
        "id, external_id, amount_cents, currency, reference, status, note, suggested_topup_id, created_at, sender_name, sender_iban";
      // ── SCOPED HERE TOO, NOT ONLY IN THE POLICY ────────────────
      //
      // This read had no tenant predicate at all -- its own sibling two
      // hundred lines down does -- so it leaned entirely on an RLS rule
      // that let the owner of ANY tenant see a deposit with no tenant
      // of its own. Which was all 244 of them. The policy is fixed in
      // 20260920220000; this is the belt to its braces, and it is what
      // keeps the screen honest if a policy is ever replaced by hand.
      const run = (cols: string) =>
        supabase
          .from("wise_incoming_transfers")
          .select(cols)
          // ── AND THE ONES WITH NO TENANT AT ALL ──────────────────
          //
          // .eq() EXCLUDES NULL, and an unassigned deposit is the
          // normal state for anything the matcher could not place --
          // which was all 244 of them before the backfill, and is
          // every new one until a tenant is flagged. Adding this
          // predicate to close a cross-tenant leak took the whole
          // orphan queue off the only screen that can act on it.
          //
          // Every action behind this screen is written the other way
          // and says so: "a deposit is either unassigned (tenant_id
          // null -- the matcher could not tell whose it was) or
          // already ours." The read has to match the write.
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          .order("created_at", { ascending: false })
        // 100 was less than the table holds — live has 229 — so the
        // "show N more" button below promised 92 more while 129 were not
        // fetched at all and could not be reached from this screen by any
        // means. The cap is now well above the real count; the PREVIEW cap
        // (REST_PREVIEW) is what keeps the page short.
          .limit(500);

      const { data, error } = await run(BASE + ", archived_at, description");
      if (error) {
        const retry = await run(BASE);
        if (retry.error) throw retry.error;
        // The two features stay dark — no archive filter, no bank
        // description — and every deposit is still readable and
        // creditable, which is the part that matters.
        return (retry.data ?? []).map((r) => ({
          ...(r as object),
          archived_at: null,
          description: null,
        })) as unknown as WiseRow[];
      }
      return (data ?? []) as unknown as WiseRow[];
    },
  });

  const confirm = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await confirmWiseSuggestion(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Deposit confirmed — topup completed, wallet credited");
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Confirm failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const allRows = data ?? [];
  // ── Ask the matcher again ─────────────────────────────────────────
  // The webhook matches a deposit ONCE, when it lands, against whatever
  // was pending at that second. Customers transfer first and file the
  // claim afterwards, so "no pending topup with matching amount" is very
  // often a stale answer rather than a wrong one — and nothing ever
  // re-asked. This does, on every visit, and it only ever writes a
  // SUGGESTION: the money still moves on your Confirm.
  const rematch = useMutation({
    mutationFn: async () => {
      const res = await rematchWiseDeposits();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      if (d.withdrawn > 0) {
        toast.message(
          d.withdrawn === 1
            ? "1 old match withdrawn"
            : `${d.withdrawn} old matches withdrawn`,
          {
            description:
              "They were matched on the amount alone, which is not proof of whose money it is. Match those by hand.",
          },
        );
      }
      if (d.suggested > 0) {
        toast.success(
          d.suggested === 1
            ? "1 deposit now matches a pending top-up"
            : `${d.suggested} deposits now match a pending top-up`,
          { description: "Confirm each one to credit the wallet." },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't re-check the deposits", {
        description: e.message,
      }),
  });

  // Once per mount, and only when there is something to re-check. Quiet on
  // purpose: a toast for "nothing changed" on every page view is noise.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (sweptRef.current || isLoading) return;
    const open = allRows.some(
      (r) =>
        r.status === "unmatched" ||
        r.status === "ambiguous" ||
        r.status === "received",
    );
    if (!open) return;
    sweptRef.current = true;
    rematch.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [isLoading, allRows.length]);

  // WHOSE money the match says this is. A "Confirm & complete" button
  // credits a specific customer's wallet, and the row it sat on named the
  // amount, the time and a status — nothing about the person. The admin had
  // to take the machine's word for it, which is the one thing a
  // confirmation step exists to avoid.
  const suggestedIds = Array.from(
    new Set(
      (data ?? [])
        .map((r) => r.suggested_topup_id)
        .filter((v): v is string => !!v),
    ),
  ).sort();
  const { data: matchedTo, isError: matchedToError, isLoading: matchedToLoading } = useQuery<
    Record<
      string,
      {
        code: string;
        name: string;
        reference: string;
        amount: number;
        currency: string;
        filedAt: string;
        slip: string | null;
        advertiserId: string | null;
      }
    >
  >({
    queryKey: ["wise-matched-topups", suggestedIds],
    enabled: suggestedIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select(
          "id, reference_no, amount, currency, created_at, payment_slip, advertiser_id, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name))",
        )
        .in("id", suggestedIds);
      if (error) throw error;
      const out: Record<
        string,
        {
          code: string;
          name: string;
          reference: string;
          amount: number;
          currency: string;
          filedAt: string;
          slip: string | null;
          advertiserId: string | null;
        }
      > = {};
      for (const row of data ?? []) {
        const r = row as {
          id: string;
          reference_no: string | number | null;
          amount: number | string | null;
          currency: string | null;
          created_at: string;
          payment_slip: string | null;
          advertiser_id: string | null;
          advertiser?:
            | {
                tenant_client_code?: string | null;
                profile?: { full_name?: string | null } | null;
              }
            | Array<{
                tenant_client_code?: string | null;
                profile?: { full_name?: string | null } | null;
              }>
            | null;
        };
        const a = Array.isArray(r.advertiser) ? r.advertiser[0] : r.advertiser;
        const prof = Array.isArray(a?.profile) ? a?.profile[0] : a?.profile;
        out[r.id] = {
          code: (a?.tenant_client_code ?? "").trim(),
          name: (prof?.full_name ?? "").trim(),
          // The SAME string the payer was given, so the two references on
          // this card — what the bank says they wrote, and what we asked
          // them to write — can be compared by eye. They were "0005-6164655424"
          // and "6164655424", and telling an admin those are a match
          // required knowing that the prefix is ours.
          reference: formatPaymentReference(
            a?.tenant_client_code,
            r.reference_no,
          ),
          // What the CUSTOMER claimed, so the confirmation can put it beside
          // what the BANK says without anybody leaving the screen.
          amount: Number(r.amount ?? 0),
          currency: String(r.currency ?? ""),
          filedAt: r.created_at,
          slip: r.payment_slip,
          advertiserId: r.advertiser_id,
        };
      }
      return out;
    },
  });

  // Ask Wise what it knows about the ones we recorded blind. Context
  // only — reference, sender, description — never a status or a match.
  // ── AN AUTOMATIC RUN REPORTS BY FILLING THE LIST IN ─────────────────
  //
  // The mount effect calls this, so the mutation's own toasts fired on
  // page load with nothing pressed — including a THIRTY-SECOND
  // toast.message carrying raw Wise HTTP statuses and a snippet of their
  // response body, and a toast.error when Wise cannot be reached, which
  // on production is the normal outcome because there is no Wise token.
  // An admin opened /wallet-topups and got a half-minute technical
  // report as though they had pressed "Sync with Wise".
  //
  // The effect's own comment says "It is silent: it reports by filling
  // the list in, not with a toast." Now it is.
  const refresh = useMutation({
    mutationFn: async (opts?: { silent?: boolean }) => {
      const res = await refreshWiseDepositDetails();
      if (!res.ok) throw new Error(res.error);
      return { ...res.data, silent: !!opts?.silent };
    },
    onSuccess: (d) => {
      if (d?.silent) {
        // Still refresh the list — that IS the report.
        queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
        return;
      }
      if (d.filled > 0) {
        // It no longer says "Re-check matches to use them". The refresh
        // re-matches itself now, so that sentence was instructions for a
        // step that had already happened.
        toast.success(
          `Filled in ${d.filled} deposit${d.filled === 1 ? "" : "s"}`,
          {
            description:
              d.suggested > 0
                ? `${d.suggested} now match a pending top-up and are ready to confirm.`
                : d.withReference > 0
                  ? `${d.withReference} now carry the payer's reference. None of them match a top-up that is pending right now.`
                  : "Sender and description only; no reference was on file.",
          },
        );
      } else {
        // Do not stop at "nothing". Ask Wise what it actually said, so the
        // next sentence names the cause instead of listing the
        // possibilities: an expired token, a balance this token cannot
        // see, a window outside the plan's retention, or the SCA challenge
        // Wise puts in front of statement reads for some business
        // accounts. Those need opposite responses.
        void probeWiseDepositLookup().then((probe) => {
          if (!probe.ok) {
            toast.message("Nothing new from Wise", {
              description: d.reason ?? undefined,
            });
            return;
          }
          const p = probe.data;
          const bits = [
            p.tokenConfigured ? "token set" : "NO token",
            p.profilesStatus !== null
              ? `profiles HTTP ${p.profilesStatus} (${p.profileCount})`
              : null,
            p.statementStatus !== null
              ? `statement HTTP ${p.statementStatus}`
              : null,
            p.scaRequired ? "SCA asked" : null,
            p.scaRequired
              ? p.signingKeyConfigured
                ? p.signed
                  ? "signed"
                  : "key unusable"
                : "no signing key"
              : null,
            p.transactions !== null ? `${p.transactions} in window` : null,
          ].filter(Boolean);
          // Wise's OWN words, not just our summary of the status code. A
          // 422 means it objected to a parameter, and it says which one in
          // the body — which is the difference between guessing at the
          // interval, the currency and the endpoint version, and reading
          // the answer.
          toast.message("Wise could not tell us more", {
            description: `${p.reason ?? d.reason ?? ""} — ${bits.join(" · ")}${
              p.bodySnippet ? `

Wise said: ${p.bodySnippet}` : ""
            }${
              p.balancesSeen.length
                ? `

Balances Wise shows: ${p.balancesSeen.join(" | ")}`
                : ""
            }${
              p.attempts.length
                ? `

Statement tried: ${p.attempts.join(" | ")}`
                : ""
            }`,
            duration: 30000,
          });
        });
      }
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
      queryClient.invalidateQueries({ queryKey: ["wise-ingest-status"] });
    },
    // Quiet on the automatic run too. On production there is no Wise
    // token, so THIS is the branch that fires on every page load — a red
    // "Couldn't reach Wise" for something nobody asked for.
    onError: (e: Error, vars) => {
      if (vars?.silent) return;
      toast.error("Couldn't reach Wise", { description: e.message });
    },
  });

  // Archived rows are out of the way, not gone. The toggle brings them
  // back with every field intact.
  const [showArchived, setShowArchived] = useState(false);
  // ── WHY IT WAS PUT ASIDE ──────────────────────────────────────────
  //
  // Archiving wrote one column and nothing else: no reason, no actor.
  // The three honest answers are different facts -- "this is not our
  // money", "we returned it to the sender", "the customer paid twice"
  // -- and with none of them recorded, a deposit put aside is
  // indistinguishable from one nobody got to. On a desk holding
  // hundreds of unmatched rows that is the whole difference.
  const ARCHIVE_REASONS = [
    "Not our money — nothing to do with PSM",
    "Returned to the sender",
    "Duplicate of a payment already credited",
    "A test payment",
    "Too old to chase",
  ];
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState(ARCHIVE_REASONS[0]);

  const archive = useMutation({
    mutationFn: async (v: {
      id: string;
      archived: boolean;
      reason?: string;
    }) => {
      const res = await setWiseDepositArchived(v.id, v.archived, v.reason);
      if (!res.ok) throw new Error(res.error);
      return v;
    },
    onSuccess: (v) => {
      toast.success(v.archived ? "Put aside" : "Back in the queue");
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't move that deposit", { description: e.message }),
  });

  // ARCHIVED ROWS ARE NOT WAITING FOR ANYBODY. This counted them, while
  // the tab badge beside it did not — so putting one suggested deposit
  // aside left the header saying "1 to confirm" and the tile saying 1
  // Waiting for you, in orange, over a list with nothing in it.
  // NOTHING ON THIS SCREEN MOVES MONEY ON ONE CLICK. "Confirm & credit"
  // did: one press and a customer's wallet was credited, with no chance to
  // read the two references side by side or look at the slip. Every other
  // money action in this app asks first, in the same box, and this was the
  // one that did not.
  const [askConfirm, setAskConfirm] = useState<WiseRow | null>(null);
  const [slipFor, setSlipFor] = useState<string | null>(null);
  const askTo = askConfirm?.suggested_topup_id
    ? (matchedTo?.[askConfirm.suggested_topup_id] ?? null)
    : null;

  const suggestedCount = allRows.filter(
    (r) => r.status === "suggested" && !r.archived_at,
  ).length;
  // ── AND THE ONES WITH NO SUGGESTION TO CONFIRM ────────────────────
  //
  // Walked on production 2026-09-21: eight deposits rendered with the
  // badge "Waiting to be matched" -- EUR 500, 500, 618, 630, 500, 250,
  // 250, 250 -- above a header reading "Nothing waiting on you" and a
  // tile reading 0 Waiting for you. Over EUR 3,100 of real bank money
  // that nobody has claimed, on the screen an admin scans to decide
  // whether there is anything to do.
  //
  // suggestedCount counts `suggested` only, which is right for a badge
  // that says "to confirm" -- there is a suggestion to accept. It is
  // the wrong number for "is anybody waiting on a person", because
  // `unmatched` and `ambiguous` both need a human and neither has a
  // suggestion to count. The card itself says so: "Match it by hand, or
  // leave it until they file a top-up."
  const byHandCount = allRows.filter(
    (r) =>
      !r.archived_at &&
      // Everything that is not settled needs a person. Naming the two
      // statuses we knew about let a third one (`received`) through
      // silently; the tab badge is widened the same way.
      !["confirmed", "completed", "matched", "suggested"].includes(
        String(r.status ?? ""),
      ),
  ).length;
  const anyWaiting = suggestedCount + byHandCount;
  // A boolean, not the array: `data ?? []` is a new array on every render,
  // so depending on it re-ran the effect every time. The ref below made
  // that harmless, but a dependency that always changes is a trap for
  // whoever edits this next.
  const hasBlankReference = allRows.some(
    (r) =>
      !r.reference &&
      !r.archived_at &&
      r.status !== "confirmed" &&
      r.status !== "completed",
  );

  // ── Keep itself up to date ────────────────────────────────────────
  // Pressing "Fetch details from Wise" and then "Re-check matches" was a
  // procedure an admin had to KNOW, on the one screen whose entire job is
  // to notice money arriving. A page that needs a ritual to tell the truth
  // is a page that will be read while it is lying.
  //
  // New deposits are enriched by the webhook as they land, so this is for
  // the ones recorded before that worked, and for the case where Wise's
  // statement lags the webhook by a few seconds.
  //
  // Bounded on purpose: once per mount, only when a deposit is actually
  // missing its reference, and at most once every ten minutes per browser —
  // each run is up to sixty calls to Wise, and an admin who reloads all
  // morning should not be the reason that token gets rate-limited. It is
  // silent: it reports by filling the list in, not with a toast.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (autoSyncedRef.current) return;
    if (isLoading || isError) return;
    if (!hasBlankReference) return;

    // sessionStorage can throw (private windows, blocked site data), and a
    // sync that cannot read its own clock should still not run in a loop —
    // so a failure here means "do not auto-sync", not "sync every time".
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(AUTO_SYNC_KEY) ?? 0);
    } catch {
      return;
    }
    if (Number.isFinite(last) && Date.now() - last < AUTO_SYNC_EVERY_MS) return;

    autoSyncedRef.current = true;
    try {
      window.sessionStorage.setItem(AUTO_SYNC_KEY, String(Date.now()));
    } catch {
      /* the once-per-mount ref still holds */
    }
    // THROUGH THE MUTATION, not around it. Calling the action directly left
    // refresh.isPending false, so "Sync with Wise" stayed clickable while
    // the automatic run was in flight — and each run is up to sixty calls
    // to Wise, both of them writing the same rows. It also means the
    // button, the spinner and the toast all describe the automatic run.
    refresh.mutate({ silent: true });
    // `refresh` is a stable mutation object from react-query and the effect
    // is ref-guarded to one run per mount either way; listing it only
    // silences the rule.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBlankReference, isLoading, isError]);

  // Rendering all 100 made this page 28,000px tall on a phone — 35 screens of
  // scrolling, and the handful of deposits that actually need a decision were
  // buried among dozens of unmatched ones the admin can do nothing about.
  // Anything needing action comes first and is always shown; the rest is
  // capped behind a count the admin can open.
  const REST_PREVIEW = 8;
  const [showAll, setShowAll] = useState(false);
  const [depositQuery, setDepositQuery] = useState("");
  // The archived ones are a separate view, not a longer fold. The fold
  // ("show N more with nothing to confirm") hides every quiet row
  // INCLUDING the ones that still need a person, which is why the queue
  // could not be worked down.
  const archivedCount = allRows.filter((r) => !!r.archived_at).length;
  const live = allRows.filter((r) =>
    showArchived ? !!r.archived_at : !r.archived_at,
  );

  // Search the DEPOSITS. The search box at the top of the screen only ever
  // filtered the wallet top-ups, so the one place with 231 rows in it was
  // the one place you could not search — and finding the payment a customer
  // is asking about meant scrolling past two hundred old test transfers.
  //
  // Everything a person would type is matched: the reference the payer
  // wrote, their name, their IBAN, the amount (with or without decimals),
  // Wise's own description, and — when the deposit is already pointed at a
  // top-up — that customer's PSM code and name.
  const needle = depositQuery.trim().toLowerCase();
  const searched = needle
    ? live.filter((r) => {
        const to = r.suggested_topup_id
          ? (matchedTo?.[r.suggested_topup_id] ?? null)
          : null;
        const hay = [
          r.reference,
          r.sender_name,
          r.sender_iban,
          r.description,
          r.note,
          (r.amount_cents / 100).toFixed(2),
          String(r.amount_cents / 100),
          r.currency,
          to?.code,
          to?.name,
          to?.reference,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        // Spaces removed on both sides so a typed IBAN with the bank's own
        // grouping still finds the row it was copied from.
        return (
          hay.includes(needle) ||
          hay.replace(/\s/g, "").includes(needle.replace(/\s/g, ""))
        );
      })
    : live;

  const needsAction = searched.filter((r) => r.status === "suggested");
  const rest = searched.filter((r) => r.status !== "suggested");
  // A search must not be folded away. "Show 223 more" hiding the single row
  // somebody just searched for is the whole point of the search, missed.
  const restShown = showAll || needle ? rest : rest.slice(0, REST_PREVIEW);
  const rows = [...needsAction, ...restShown];
  const hiddenCount = rest.length - restShown.length;

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <style>{WISE_CSS}</style>
      <div>
        {/* Title and its actions on ONE line. What used to sit here: the
            title, two buttons an admin had to know the order of, a
            three-line paragraph, three green pills and a wrapping sentence
            of counts — before a single deposit was visible. On a phone that
            was the entire first screen. */}
        <div className="phead">
          {/* NOT an <h2>. The tab bar names this panel, so the heading
              lost its text and kept its tag — an empty heading, which a
              screen reader announces as a heading with nothing in it.
              What is left is a status line: the one thing the tab cannot
              say, which is whether anybody is waiting on a person. */}
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {isError || isLoading ? (
              /* `data ?? []` makes suggestedCount 0 both while the read is
                 in flight and when it FAILED, and this is the line an
                 admin scans before deciding whether to close the screen.
                 "Nothing waiting on you" over an unreadable deposit feed
                 leaves customers' bank transfers uncredited — while the
                 list immediately below correctly says "We couldn't load
                 the deposits — this is NOT an empty feed." */
              <span className="muted" style={{ fontSize: ".88rem" }}>
                {isError ? "We couldn't read the deposits" : "Checking…"}
              </span>
            ) : anyWaiting > 0 ? (
              <>
                {suggestedCount > 0 && (
                  <span className="badge pend">
                    {suggestedCount} to confirm
                  </span>
                )}
                {byHandCount > 0 && (
                  <span className="badge due">
                    {byHandCount} to match by hand
                  </span>
                )}
              </>
            ) : (
              <span className="muted" style={{ fontSize: ".88rem" }}>
                Nothing waiting on you
              </span>
            )}
          </div>
          {/* wrap: .actrow is flex-end with no wrapping, and a flex-end row
              that overflows spills out of its START edge — which is how a
              button disappears behind the heading instead of moving to the
              next line. */}
          <div className="actrow" style={{ flexWrap: "wrap" }}>
            {/* `|| showArchived`: this rendered only while something was
          archived, and it is the ONLY way back to the queue. Restoring
          the last archived deposit dropped the count to zero, the button
          vanished while the filter was still on, and the entire deposits
          list — including anything waiting to be credited — was
          unreachable until a page reload. */}
        {(archivedCount > 0 || showArchived) && (
              <button
                className={`btn ${showArchived ? "" : "ghost"} sm`}
                onClick={() => setShowArchived((v) => !v)}
                title="Deposits somebody put aside. Nothing is deleted — every field is still here."
              >
                {showArchived
                  ? "Back to the queue"
                  : `Archived (${archivedCount})`}
              </button>
            )}
            {/* ONE button where there were two. "Fetch details from Wise"
                and then "Re-check matches" was a two-step chore with an
                order you had to know, on a screen whose job is to notice
                money. The fetch now re-matches on its own, and the page
                runs it on its own — so this is a manual re-try, not a
                procedure. */}
            <button
              className="btn ghost sm"
              disabled={refresh.isPending || rematch.isPending}
              onClick={() => refresh.mutate({})}
              title="Ask Wise again for the reference and sender of every deposit that arrived without them, then re-match"
            >
              <RefreshCw
                className={refresh.isPending ? "animate-spin" : undefined}
              />
              {refresh.isPending ? "Syncing…" : "Sync with Wise"}
            </button>
          </div>
        </div>
        {/* The tile says "Waiting for you", so it counts everything a
            person has to touch -- not just the ones with a suggestion
            ready to accept. */}
        <WiseTiles waiting={anyWaiting} waitingUnknown={isError || isLoading} />
        <div className="wsearch">
          <Search />
          <input
            value={depositQuery}
            onChange={(e) => setDepositQuery(e.target.value)}
            placeholder="Search reference, sender, IBAN or amount…"
            aria-label="Search bank deposits"
          />
          {depositQuery ? (
            <button
              type="button"
              onClick={() => setDepositQuery("")}
              aria-label="Clear the search"
            >
              <X />
            </button>
          ) : null}
        </div>
      </div>

      {/* Say it out loud, rather than only taking the buttons away. The
          claim read is what puts the customer's name, their reference and
          their amount on every suggested card; without it the card is the
          same card minus one strip, and an admin would reasonably press on. */}
      {matchedToError || matchedToLoading ? (
        <div
          className="card"
          style={{ padding: "12px 14px", marginBottom: 10 }}
        >
          <span
            style={{
              color: matchedToError ? "var(--danger)" : "var(--faint)",
              fontWeight: 600,
            }}
          >
            {matchedToError
              ? "We couldn't read the claims these deposits are matched to, so Confirm & credit is off until it loads. This is NOT “no customer”."
              : "Looking up the claims these deposits are matched to…"}
          </span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="card" style={{ padding: 34, textAlign: "center" }}>
          <Loader2
            className="animate-spin"
            style={{ width: 20, height: 20, color: "var(--faint)" }}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ padding: 30, textAlign: "center" }}>
          {/* A failed read is not an empty feed. "No bank deposits detected
              yet" on the screen that exists to notice incoming money is the
              worst possible way to report a broken query -- and it takes the
              "N to confirm" badge down with it. */}
          {isError ? (
            <>
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                We couldn&apos;t load the deposits — this is NOT an empty feed.
              </span>
              <div style={{ marginTop: 10 }}>
                <button className="btn ghost sm" onClick={() => refetch()}>
                  Try again
                </button>
              </div>
            </>
          ) : needle ? (
            /* NOT "no deposits detected yet". There are 231 of them; this
               search matched none. Saying the feed is empty when a filter
               is what emptied it sends an admin looking for a broken
               webhook. */
            <>
              <span className="muted">
                No deposit matches &ldquo;{depositQuery}&rdquo;
                {showArchived ? " in the archive" : ""}.
              </span>
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn ghost sm"
                  onClick={() => setDepositQuery("")}
                >
                  Clear the search
                </button>
              </div>
            </>
          ) : (
            <span className="muted">
              {showArchived
                ? "Nothing archived."
                : "No bank deposits detected yet."}
            </span>
          )}
        </div>
      ) : (
        <div className="wdeps">
          {rows.map((r) => {
            const v = statusView(r.status);
            const to = r.suggested_topup_id
              ? (matchedTo?.[r.suggested_topup_id] ?? null)
              : null;
            // ── AN ARCHIVED DEPOSIT IS NOT READY ──────────────────────
            //
            // The two counts at the top of this screen both say
            // `&& !r.archived_at` — a put-aside deposit is deliberately
            // not in the work queue. This one did not, so opening the
            // Archived view drew a live "Confirm & credit" on every
            // matched row in it, and pressing it credits a wallet from a
            // deposit an admin had explicitly set aside. Archiving is
            // described on this screen as reversible and lossless; a
            // button that moves money out of that view is neither.
            //
            // Unarchive is one click away and right there on the card, so
            // nothing is blocked — it just has to be said out loud first.
            // ── AND THE CLAIM HAS TO BE READABLE ──────────────────
            //
            // The customer strip, the reference comparison and the
            // "we asked for ..." warning all come from matchedTo, and
            // its isError/isLoading were not destructured -- the only
            // read on this panel where that was true. So on a failed
            // or in-flight claim read, every card looked normal minus
            // one strip, and Confirm & credit stayed live: the admin
            // pressed it, saw a dialog whose Customer line was a dash,
            // and EUR 5,000 landed in a wallet nobody on the screen
            // had named.
            const ready =
              r.status === "suggested" &&
              !!r.suggested_topup_id &&
              !r.archived_at &&
              !matchedToError &&
              !matchedToLoading &&
              !!matchedTo?.[String(r.suggested_topup_id)];
            const done =
              r.status === "confirmed" ||
              r.status === "completed" ||
              r.status === "matched";
            return (
              <article
                key={r.id}
                className={"wdep " + v.tone + (r.archived_at ? " is-archived" : "")}
                /* The composite idempotency key used to be PRINTED on every
                   card, directly under the sender, where it read as if it
                   were payment information. It is ours, not the bank's, and
                   it is the first thing the eye lands on when there is no
                   reference. Hover, which is where an internal id belongs. */
                title={"Wise id: " + r.external_id}
              >
                <header className="wdh">
                  <div className="wamt">{money(r.currency, r.amount_cents)}</div>
                  <span className={v.cls} style={v.style}>
                    {v.label}
                  </span>
                </header>
                <div className="wdate">{shortDate(r.created_at)}</div>

                {/* WHO PAID, in the order a person reads a bank line: the
                    name, the reference they wrote, the account it came
                    from. These were four labelled table cells stacked into
                    a column of headings on a phone. */}
                <div className="wfrom">
                  <div className={"wname" + (r.sender_name ? "" : " none")}>
                    {r.sender_name || "Sender not on the payment"}
                  </div>
                  <div className="wref">
                    {r.reference ? (
                      <>
                        <span className="wlab">Ref</span>
                        {/* Click it, it is on the clipboard. An admin
                            comparing this against a bank statement or a
                            customer's email was selecting ten digits by
                            hand on a phone. */}
                        <button
                          type="button"
                          className="wrefv mono wcopy"
                          title={"Copy " + r.reference}
                          onClick={() => copyText(r.reference ?? "")}
                        >
                          {r.reference}
                          <Copy />
                        </button>
                      </>
                    ) : (
                      <span className="wnone">no reference on the payment</span>
                    )}
                  </div>
                  {realIban(r.sender_iban) ? (
                    <div className="wiban mono" title={r.sender_iban ?? undefined}>
                      {r.sender_iban}
                    </div>
                  ) : null}
                  {usefulDescription(
                    r.description,
                    r.sender_name,
                    r.reference,
                  ) ? (
                    <div className="wdesc" title={r.description ?? undefined}>
                      {r.description}
                    </div>
                  ) : null}
                </div>

                {/* WHERE IT GOES. The whole decision on this screen is "is
                    this that person's money", so the answer gets its own
                    tinted strip rather than a third column. */}
                {to ? (
                  <div className="wto">
                    <span className="wtoa">&rarr;</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="wtoc">{to.code || "No code"}</div>
                      <div className="wtot" title={to.name}>
                        {to.name || "—"}
                      </div>
                      {/* The reference is printed three lines above, under
                          REF. Repeating it here said the same number twice
                          on one card; it is shown only when the payer wrote
                          something DIFFERENT from what we gave them, which
                          is the case worth an admin's eye. */}
                      {to.reference &&
                      refDigits(to.reference) !== refDigits(r.reference ?? "") ? (
                        <div className="wtor mono">
                          we asked for {to.reference}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {/* The note explains why there is nothing to confirm. Beside
                    a ready match it would only repeat the strip above. */}
                {r.note && !ready ? (
                  <p className="wnote" title={r.note}>
                    {readableNote(r.note)}
                  </p>
                ) : null}

                <div className="wact">
                  {ready ? (
                    <button
                      className="btn"
                      disabled={actingId === r.id}
                      onClick={() => setAskConfirm(r)}
                    >
                      {actingId === r.id ? "…" : "Confirm & credit"}
                    </button>
                  ) : done ? (
                    <span className="wdone">Credited</span>
                  ) : r.archived_at ? (
                    /* Same reason as `ready` above: matching by hand
                       credits a top-up, so it is a money action and does
                       not belong on a row that was put aside. The card
                       says what it is and keeps Unarchive beside it. */
                    <span className="wdone" title="Put aside — unarchive it to work on it">
                      Put aside
                    </span>
                  ) : (
                    /* An unmatched deposit used to show a dash — a row in a
                       money queue that nobody could do anything about, which
                       is how a queue quietly stops being worked. */
                    <ManualMatch
                      transferId={r.id}
                      amountCents={r.amount_cents}
                      currency={r.currency}
                      tenantId={tenantId}
                      busy={actingId === r.id}
                      onDone={() => {
                        queryClient.invalidateQueries({
                          queryKey: ["wise-incoming"],
                        });
                        queryClient.invalidateQueries({
                          queryKey: ["wallet-transactions"],
                        });
                        queryClient.invalidateQueries({ queryKey: ["wallets"] });
                        // Matching by hand credits a top-up, so the tab
                        // badges are stale the moment it succeeds. Every
                        // other mutation on this screen already said so.
                        queryClient.invalidateQueries({
                          queryKey: ["money-in-counts"],
                        });
                        queryClient.invalidateQueries({
                          queryKey: ["matched-deposits"],
                        });
                      }}
                    />
                  )}
                  {/* Put it aside. 231 deposits, most of them old test
                      payments of 0.01 that will never match anything, and no
                      way to clear one out of the way — so the one that
                      mattered sat in a list of two hundred that did not.
                      Archiving is reversible and loses nothing. */}
                  <button
                    className="btn ghost"
                    disabled={archive.isPending}
                    onClick={() => {
                      // Putting one back needs no explanation; putting
                      // one aside does.
                      if (r.archived_at) {
                        archive.mutate({ id: r.id, archived: false });
                        return;
                      }
                      setArchiveReason(ARCHIVE_REASONS[0]);
                      setArchiving(r.id);
                    }}
                    title={
                      r.archived_at
                        ? "Put it back in the queue"
                        : "Move it to Archived — nothing is deleted"
                    }
                  >
                    {r.archived_at ? <ArchiveRestore /> : <Archive />}
                    {r.archived_at ? "Unarchive" : "Archive"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* CREDITING REAL MONEY ASKS FIRST. Everything it needs to decide is
          in the box: what the bank says, what the customer claimed, both
          references side by side, and the slip one click away — so nobody
          has to leave the screen, and nobody credits on one press. */}
      <ConfirmModal
        open={!!askConfirm}
        onOpenChange={(o) => {
          if (!o) setAskConfirm(null);
        }}
        title="Credit this wallet?"
        lead={
          askConfirm &&
          askTo &&
          Math.abs(
            Math.round(askTo.amount * 100) -
              Math.round(Number(askConfirm.amount_cents) || 0),
          ) > 1
            ? `The bank sent ${money(askConfirm.currency, askConfirm.amount_cents)} and the claim is for ${currencySymbol(askTo.currency)}${askTo.amount.toFixed(2)}. Crediting moves the CLAIM's amount — correct the claim first if that is not what you mean.`
            : askConfirm && askTo
              ? "This completes the top-up and puts the money in their wallet. Check the two references agree before you do."
              : "This completes the top-up and puts the money in their wallet."
        }
        cta={
          // ── THE CLAIM'S FIGURE, NOT THE BANK'S ──────────────────────
          //
          // This printed the DEPOSIT's amount. wise_confirm_suggestion
          // does no amount comparison at all -- it flips the top-up to
          // completed and the balance trigger credits
          // `wallet_topups.amount`. The two are equal when the matcher
          // suggests, and nothing re-checks afterwards: rematch skips a
          // row that is already suggested, and "Set the claim to X" on
          // this same panel rewrites a pending top-up's amount from any
          // other deposit card.
          //
          // So a card reading EUR 630.00 with "Yes, credit EUR 630.00"
          // could move EUR 618.00. The admin, told 630 went in, posts a
          // EUR 12 adjustment to "fix" it, and the customer is 12 ahead
          // on money that never arrived.
          //
          // This panel already states the rule for the manual path --
          // "The credit is the CLAIM's amount, not the deposit's". The
          // suggested path, which is the one with the primary button,
          // did not.
          askTo
            ? `Yes, credit ${currencySymbol(askTo.currency)}${askTo.amount.toFixed(2)}`
            : askConfirm
              ? `Yes, credit ${money(askConfirm.currency, askConfirm.amount_cents)}`
              : "Yes, credit"
        }
        busy={confirm.isPending}
        busyLabel="Crediting…"
        onConfirm={() => {
          if (!askConfirm) return;
          const id = askConfirm.id;
          setAskConfirm(null);
          confirm.mutate(id);
        }}
      >
        {askConfirm ? (
          <>
            <ConfirmFact
              label="Bank says"
              value={`${money(askConfirm.currency, askConfirm.amount_cents)} from ${
                askConfirm.sender_name || "an unnamed sender"
              }`}
              strong
            />
            <ConfirmFact
              label="They wrote"
              value={askConfirm.reference || "no reference"}
            />
            <ConfirmFact
              label="Customer"
              value={
                askTo
                  ? `${askTo.code || "No code"}${askTo.name ? " · " + askTo.name : ""}`
                  : "—"
              }
            />
            <ConfirmFact
              label="We asked for"
              value={askTo?.reference || "—"}
            />
            <ConfirmFact
              label="They claimed"
              value={
                askTo
                  ? `${currencySymbol(askTo.currency)}${askTo.amount.toFixed(2)} on ${new Date(
                      askTo.filedAt,
                    ).toLocaleDateString()}`
                  : "—"
              }
            />
            {/* The slip is the other half of the check, and it was two
                screens away. */}
            {askTo?.slip ? (
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn ghost sm"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => setSlipFor(askTo.slip)}
                >
                  <FileText /> View the payment slip
                </button>
              </div>
            ) : (
              <p
                className="muted"
                style={{ margin: "10px 0 0", fontSize: ".8rem" }}
              >
                No payment slip was uploaded with this top-up.
              </p>
            )}
          </>
        ) : null}
      </ConfirmModal>

      <PaymentSlipDialog
        open={!!slipFor}
        onOpenChange={(o) => {
          if (!o) setSlipFor(null);
        }}
        paymentSlipUrl={slipFor}
      />

      {hiddenCount > 0 ? (
        <button
          className="btn ghost sm"
          onClick={() => setShowAll(true)}
          style={{ width: "100%", justifyContent: "center" }}
        >
          Show {hiddenCount} more deposit{hiddenCount === 1 ? "" : "s"} with
          nothing to confirm
        </button>
      ) : null}
      {showAll && rest.length > REST_PREVIEW ? (
        <button
          className="btn ghost sm"
          onClick={() => setShowAll(false)}
          style={{ width: "100%", justifyContent: "center" }}
        >
          Show fewer
        </button>
      ) : null}

      <ConfirmModal
        open={!!archiving}
        onOpenChange={(next) => {
          if (!next && !archive.isPending) setArchiving(null);
        }}
        title="Put this deposit aside?"
        lead="It leaves the queue and stops being re-checked automatically. Nothing is deleted and you can put it back at any time — but say why, or in a month nobody will know whether it was dealt with or just ignored."
        cta="Yes, put it aside"
        busy={archive.isPending}
        busyLabel="Moving…"
        onConfirm={() => {
          if (!archiving) return;
          archive.mutate({
            id: archiving,
            archived: true,
            reason: archiveReason,
          });
          setArchiving(null);
        }}
      >
        <div className="grid gap-2" style={{ marginTop: 6 }}>
          <label
            htmlFor="wise-archive-reason"
            style={{ fontSize: ".8rem", fontWeight: 700 }}
          >
            Why?
          </label>
          <select
            id="wise-archive-reason"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          >
            {ARCHIVE_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </ConfirmModal>
    </div>
  );
}

/**
 * Match a deposit to a pending top-up by hand.
 *
 * Only offers top-ups the confirm step will actually accept: same currency,
 * same amount to the cent. A picker full of choices that will be refused is
 * worse than no picker — it teaches you to expect an error. When there is
 * nothing it could be, it says so, which is itself the useful answer: the
 * money arrived and no customer has told us to expect it.
 */
function ManualMatch({
  transferId,
  amountCents,
  currency,
  tenantId,
  busy,
  onDone,
}: {
  transferId: string;
  amountCents: number;
  currency: string;
  tenantId: string | null;
  busy: boolean;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctingBusy, setCorrectingBusy] = useState(false);
  const [correctionReason, setCorrectionReason] = useState(
    "The bank sent less than was claimed — an intermediary fee was deducted in transit.",
  );

  const {
    data: candidates = [],
    isLoading,
    isError: candidatesError,
    refetch: refetchCandidates,
  } = useQuery({
    queryKey: ["wise-match-candidates", transferId, tenantId],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const amount = Number(amountCents) / 100;
      const { data, error } = await supabase
        .from("wallet_topups")
        .select(
          // reference_no too: two customers can wire the same figure —
          // candidates are matched to the cent — and without it the
          // picker gives an operator nothing to tell them apart.
          "id, amount, currency, created_at, reference_no, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name))",
        )
        // Scoped to this tenant like every other admin query on this table.
        // RLS should already do it, but a list that credits money is not the
        // place to find out that it does not — and `ilike` rather than `eq`
        // because currency is free text: a row stored as "eur" would have
        // been invisible here and looked like "nobody is expecting this".
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .ilike("currency", String(currency))
        // ── A WIDER WINDOW THAN THE MATCHER, ON PURPOSE ─────────────
        //
        // One cent either way is right for deciding AUTOMATICALLY that
        // two things are the same payment. It is wrong as the only
        // option afterwards: an intermediary bank taking EUR 12 off a
        // EUR 630 transfer is ordinary for anything that is not SEPA,
        // and that deposit could then be attached to nothing at all.
        // The only remaining route was Verify on the top-ups desk,
        // which credits the FULL claimed EUR 630 for EUR 618 received.
        //
        // So the picker offers claims within 15% or EUR 100, whichever
        // is larger, and the row says how far off each one is. A
        // human decides; nothing is matched automatically on this
        // window. Correcting the claim to what actually arrived is one
        // button on the row.
        .gte("amount", amount - Math.max(amount * 0.15, 100))
        .lte("amount", amount + Math.max(amount * 0.15, 100))
        .order("created_at", { ascending: true })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        amount: number;
        currency: string;
        created_at: string;
        reference_no: string | null;
        advertiser?: {
          tenant_client_code?: string | null;
          profile?: { full_name?: string | null } | null;
        } | null;
      }>;
    },
  });

  // How far the chosen claim is from what the bank actually sent.
  const pickedGap = (() => {
    const c = candidates.find((x) => x.id === picked);
    if (!c) return 0;
    return Math.abs(Number(c.amount ?? 0) - Number(amountCents) / 100);
  })();

  // ASK FIRST, like the Confirm & credit button on this same card.
  //
  // This credited a wallet on one click. Candidates are amount-matched to
  // the cent, so two customers who wired the same figure both appear in
  // the list, and the Wise feed currently holds 229 deposits with no
  // reference at all — the ambiguous case is the normal case. The
  // sibling action a few centimetres away shows the bank amount, the
  // sender, both references, the customer's claim and the slip before it
  // moves anything.
  const [confirming, setConfirming] = useState(false);

  const submit = async () => {
    if (!picked) return;
    setConfirming(false);
    setSaving(true);
    try {
      const { matchWiseToTopup } = await import("@/actions/wise-actions");
      const res = await matchWiseToTopup(transferId, picked);
      if (!res.ok) throw new Error(res.error);
      toast.success("Matched — the top-up is credited");
      setOpen(false);
      setPicked("");
      onDone();
    } catch (e) {
      toast.error("Couldn't match this deposit", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        className="btn ghost sm"
        onClick={() => setOpen(true)}
        title="Pick the top-up this payment settles"
      >
        <Link2 /> Match
      </button>
    );
  }

  return (
    // FULL WIDTH ONCE IT IS OPEN. `.wact` is a two-column grid, so the
    // open picker was squeezed into half a card with Archive holding the
    // other half -- "Nothing pending matches this amount." wrapped into
    // four lines beside a button. Open, this is the card's whole job.
    <div
      className="wmatch-open"
      style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}
    >
      {isLoading ? (
        <span className="muted" style={{ fontSize: ".82rem" }}>
          Looking…
        </span>
      ) : candidates.length === 0 ? (
        <span
          className="muted"
          style={{
            fontSize: ".82rem",
            textAlign: "left",
            // The cell is text-align:right and about 300px wide in card
            // mode, so this sentence ran out of the card and took the
            // Cancel button with it.
            overflowWrap: "anywhere",
          }}
        >
          {/* A FAILED READ IS NOT "NOTHING MATCHES". The admin is
              told no claim is expecting this money and the only
              remaining verb on the row is Archive -- so a real bank
              deposit gets filed away because a query timed out. */}
          {candidatesError
            ? "We couldn't check which top-ups are waiting, so none can be offered here. Reload and try again."
            : "Nothing pending matches this amount."}
        </span>
      ) : (
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          aria-label="Top-up to match"
        >
          <option value="">Pick a top-up…</option>
          {candidates.map((c) => {
            const p = Array.isArray(c.advertiser)
              ? c.advertiser[0]
              : c.advertiser;
            const prof = Array.isArray(p?.profile) ? p?.profile[0] : p?.profile;
            const who =
              [p?.tenant_client_code, prof?.full_name].filter(Boolean).join(" · ") ||
              "Unknown advertiser";
            return (
              <option key={c.id} value={c.id}>
                {/* THE AMOUNT AND THE REFERENCE, not just a name and a
                    date. Candidates are matched to the cent, so two
                    customers who wired the same figure both appear here
                    — and with only "CODE · name — 12 Mar" on the option
                    there is nothing to tell them apart. */}
                {who} — {c.currency ?? ""}
                {Number(c.amount ?? 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                {c.reference_no ? ` · ref ${c.reference_no}` : " · no ref"} ·{" "}
                {dayjs(c.created_at).format("D MMM")}
                {/* HOW FAR OFF, in words. The window is wider than the
                    cent the matcher uses, so a claim that does not
                    exactly equal the deposit can appear here -- and an
                    operator has to see that before choosing it, not
                    after. */}
                {Math.abs(Number(c.amount ?? 0) - Number(amountCents) / 100) >
                0.005
                  ? ` · ${
                      Number(c.amount ?? 0) > Number(amountCents) / 100
                        ? "claim is"
                        : "deposit is"
                    } ${Math.abs(
                      Number(c.amount ?? 0) - Number(amountCents) / 100,
                    ).toFixed(2)} higher`
                  : ""}
              </option>
            );
          })}
        </select>
      )}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          // A flex-end row that overflows spills out of its START edge, so
          // without wrapping the Cancel button left the card entirely.
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn ghost sm"
          onClick={() => {
            setOpen(false);
            setPicked("");
          }}
          disabled={saving}
        >
          Cancel
        </button>
        {/* ── CORRECT THE CLAIM TO WHAT ACTUALLY ARRIVED ───────────
            Crediting a mismatch credits the CLAIM's figure, so a EUR
            630 claim against a EUR 618 deposit hands the customer EUR
            12 that never arrived. The honest repair is to set the claim
            to the received amount first -- then the exact-match path
            credits the true figure, and the reason is kept on the
            record where the customer can read it. */}
        {picked && pickedGap > 0.005 ? (
          <button
            className="btn ghost sm"
            onClick={() => setCorrecting(true)}
            disabled={saving || busy || correctingBusy}
          >
            {correctingBusy
              ? "…"
              : `Set the claim to ${String(currency)} ${(
                  Number(amountCents) / 100
                ).toFixed(2)}`}
          </button>
        ) : null}
        {candidates.length > 0 && (
          <button
            className="btn sm"
            onClick={() => setConfirming(true)}
            disabled={!picked || saving || busy}
          >
            {saving ? "…" : "Match & credit"}
          </button>
        )}
      </div>

      <ConfirmModal
        open={correcting}
        onOpenChange={(next) => {
          if (!next && !correctingBusy) setCorrecting(false);
        }}
        title="Correct this claim to what arrived?"
        lead="The customer asked us to credit one figure and the bank sent another. This sets their claim to the amount actually received, so crediting it hands them what is really there. The reason is kept on the record and the customer can read it."
        cta="Yes, correct it"
        busy={correctingBusy}
        busyLabel="Correcting…"
        disabled={correctionReason.trim().length < 3}
        onConfirm={async () => {
          const c = candidates.find((x) => x.id === picked);
          if (!c) return;
          setCorrectingBusy(true);
          try {
            const res = await adjustWalletTopupAmount(
              c.id,
              Number(amountCents) / 100,
              correctionReason.trim(),
            );
            if (!res.ok) throw new Error(res.error);
            toast.success("Claim corrected", {
              description: "It now matches the deposit, so crediting it hands over the real figure.",
            });
            setCorrecting(false);
            // ── AND EVERY OTHER SCREEN THAT SHOWS THIS CLAIM ───────
            //
            // refetchCandidates() refreshes THIS panel only. All three
            // Money-in panels are mounted at once and merely hidden, so
            // nothing remounts; staleTime is 30s and
            // refetchOnWindowFocus is off. With no invalidation there
            // was no refetch trigger at all, and the verify card kept
            // the OLD figure for the rest of the session -- including
            // the button, which read "Yes, credit EUR 630.00" while the
            // trigger credited the corrected EUR 618.00. Correcting a
            // claim is exactly the moment those screens are wrong.
            await Promise.all([
              refetchCandidates(),
              queryClient.invalidateQueries({
                queryKey: ["wallet-transactions"],
                exact: false,
              }),
              queryClient.invalidateQueries({
                queryKey: ["matched-deposits"],
                exact: false,
              }),
              queryClient.invalidateQueries({
                queryKey: ["outstanding-precharges"],
                exact: false,
              }),
              queryClient.invalidateQueries({
                queryKey: ["money-in-counts"],
                exact: false,
              }),
            ]);
          } catch (e) {
            toast.error("Couldn't correct it", {
              description: e instanceof Error ? e.message : undefined,
            });
          } finally {
            setCorrectingBusy(false);
          }
        }}
      >
        <ConfirmFact
          label="They claimed"
          value={`${String(currency)} ${Number(
            candidates.find((x) => x.id === picked)?.amount ?? 0,
          ).toFixed(2)}`}
        />
        <ConfirmFact
          label="The bank sent"
          value={`${String(currency)} ${(Number(amountCents) / 100).toFixed(2)}`}
          strong
        />
        <div className="grid gap-2" style={{ marginTop: 10 }}>
          <label
            htmlFor="wise-correction-reason"
            style={{ fontSize: ".8rem", fontWeight: 700 }}
          >
            Why is it different?
          </label>
          <textarea
            id="wise-correction-reason"
            rows={3}
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={correctionReason}
            onChange={(e) => setCorrectionReason(e.target.value)}
          />
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !saving) setConfirming(false);
        }}
        title="Credit this customer?"
        lead="This links the bank deposit to their claim and credits their wallet by the amount THEY claimed, not the amount the bank sent. There is no undo."
        cta="Yes, credit it"
        busy={saving}
        busyLabel="Crediting…"
        onConfirm={submit}
      >
        {(() => {
          const c = candidates.find((x) => x.id === picked);
          const p = Array.isArray(c?.advertiser)
            ? c?.advertiser[0]
            : c?.advertiser;
          const prof = Array.isArray(p?.profile) ? p?.profile[0] : p?.profile;
          const money = (n: unknown, cur: unknown) =>
            `${String(cur ?? "")} ${Number(n ?? 0).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
          return (
            <>
              <ConfirmFact
                label="Customer"
                value={
                  [p?.tenant_client_code, prof?.full_name]
                    .filter(Boolean)
                    .join(" · ") || "Unknown"
                }
              />
              <ConfirmFact
                label="They claimed"
                value={money(c?.amount, c?.currency)}
              />
              <ConfirmFact
                label="Their reference"
                value={c?.reference_no ?? "none given"}
              />
              {/* ── THE DIFFERENCE, AND WHAT WILL ACTUALLY BE CREDITED
                  The credit is the CLAIM's amount, not the deposit's --
                  wise_confirm_suggestion settles the top-up, and the
                  balance trigger adds wallet_topups.amount. So on a
                  mismatch the wallet moves by a figure this modal was
                  not showing. Say both, and say which one moves. */}
              {Math.abs(
                Number(c?.amount ?? 0) - Number(amountCents) / 100,
              ) > 0.005 ? (
                <>
                  <ConfirmFact
                    label="The bank sent"
                    value={money(Number(amountCents) / 100, currency)}
                  />
                  <ConfirmFact
                    label="Difference"
                    value={money(
                      Math.abs(
                        Number(c?.amount ?? 0) - Number(amountCents) / 100,
                      ),
                      currency,
                    )}
                    strong
                  />
                </>
              ) : null}
            </>
          );
        })()}
      </ConfirmModal>
    </div>
  );
}
