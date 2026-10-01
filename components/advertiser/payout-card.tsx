"use client";

import { useT } from "@/hooks/use-t";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { toast } from "sonner";

import { Ic } from "@/components/advertiser/adv-icons";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { payoutMinimumFor } from "@/lib/pure-payout-min";
import { payoutGroupKey, payoutRef, payoutSequence } from "@/lib/pure-payout-ref";
import {
  PAYOUT_FEE_PCT,
  payoutReach,
} from "@/lib/pure-payout-reach";
import useUsdToEur from "@/hooks/use-usd-to-eur";
import useAffiliatePayouts, { type AffiliatePayout } from "@/hooks/use-affiliate-payouts";
import type { PayoutDetails } from "@/actions/payout-actions";

// ── ASKING TO BE PAID ───────────────────────────────────────────────────
//
// The owner: "hoef geen mark paid, dat moeten we in bulk doen" — so one
// request covers everything owed, and it is a RECORD with a state, not a
// WhatsApp message that disappears into a chat.
//
// 22-09: "mensen moeten eerst kiezen welke spend ze uit willen betalen,
// EUR of USD of allebei, en dan of wij alles converteren naar EUR of USD
// — dan kun je gelijk 0,6% fee applyen — of dat het naar een EUR- en een
// USD-bank moet." Two banks is only offered to somebody who actually
// earned in both.
//
// And: "doe view request en withdraw request niet overal wat buttons
// proppen". So the card in flight carries ONE quiet line — open it — and
// everything you can DO with the request lives inside that panel.
//
// The figures in the dialog are a preview at today's rate; the payout row
// carries the rate the server actually used, and that is what is shown
// afterwards.

// Re-exported from the module that also does the arithmetic, so the
// percentage on the screen and the percentage in the sum cannot drift.
const FEE_PCT = PAYOUT_FEE_PCT;

type Cur = "EUR" | "USD";

type Props = {
  /** Their own advertiser row — payouts are read by RLS, this only gates. */
  enabled: boolean;
  /** Cache scope, so two identities never share a payout list. */
  scope?: string | null;
  /** Their partner code (PSM0008). The reference they are shown is
   *  built from it -- see lib/pure-payout-ref.ts for why they are not
   *  shown the house-wide `payout_no`. */
  clientCode?: string | null;
  owedEur: number;
  owedUsd: number;
  /** The owed figure could not be read (or is lifetime, not outstanding). */
  owedUnknown: boolean;
  /** What they saved under Settings as their standing bank details. The
   *  dialog starts from these so an IBAN is not retyped every time --
   *  retyping is how a digit gets dropped. Undefined until plak 78. */
  defaults?: Record<string, string> | null;
};

/**
 * The four words an affiliate reads about their own money.
 *
 * The owner, 28-09: "waiting for us is lelijk". It was also written from
 * OUR side of the desk — the affiliate is not waiting for us, they are
 * waiting for their money, and the progress bar right underneath
 * already says who has it ("Requested / We check it / Transferred").
 *
 * `rejected` went with it. "Not paid" is what every unpaid state looks
 * like, including the one two lines above that is merely waiting, and
 * the admin queue calls this exact state "Sent back". One state should
 * not have two names, and the affiliate's next move is to send it
 * again — which "Sent back" says and "Not paid" does not.
 */
const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for payout",
  paid: "Paid",
  rejected: "Sent back",
  cancelled: "Withdrawn",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The last payout wins, their saved default fills the gaps. A field
 *  they cleared on the last request stays cleared. */
function mergeDetails(
  last: PayoutDetails,
  saved: Record<string, string> | null | undefined,
): PayoutDetails {
  if (!saved) return last;
  const anyLast = Object.values(last).some((v) => String(v ?? "").trim());
  if (anyLast) return last;
  const out: PayoutDetails = { ...last };
  for (const [k, v] of Object.entries(saved)) {
    if (typeof v === "string" && v.trim() && k in out) {
      (out as Record<string, string>)[k] = v.trim();
    }
  }
  return out;
}

function detailsOf(p: AffiliatePayout | undefined): PayoutDetails {
  const d = (p?.details ?? {}) as Record<string, string>;
  return {
    holder: d.holder ?? "",
    accountType: d.accountType ?? "",
    taxId: d.taxId ?? "",
    address: d.address ?? "",
    iban: d.iban ?? "",
    bic: d.bic ?? "",
    bankName: d.bankName ?? "",
    accountNumber: d.accountNumber ?? "",
    routing: d.routing ?? "",
    note: d.note ?? "",
  };
}

const DETAIL_LABEL: Record<string, string> = {
  holder: "Account holder",
  accountType: "Account type",
  taxId: "VAT / Tax ID",
  address: "Billing address",
  iban: "IBAN",
  bic: "BIC / SWIFT",
  bankName: "Bank",
  accountNumber: "Account number",
  routing: "Routing / SWIFT",
  note: "Note",
};

/** What one leg becomes at this rate — a preview, not the record. */
function preview(amount: number, from: Cur, to: Cur, rate: number | null) {
  if (from === to) return { net: amount, fee: 0, gross: amount, rate: null as number | null };
  if (!rate || rate <= 0) return null;
  const gross = round2(from === "USD" ? amount * rate : amount / rate);
  const fee = round2((gross * FEE_PCT) / 100);
  return { gross, fee, net: round2(gross - fee), rate };
}

export default function PayoutCard({
  enabled,
  scope,
  clientCode,
  owedEur,
  owedUsd,
  owedUnknown,
  defaults,
}: Props) {
  const { t: tr } = useT();
  const queryClient = useQueryClient();

  // ── THE FLOOR, AND THE ONE EXCEPTION TO IT ──────────────────────
  //
  // The owner, 22-09: "200 usd of 200 eur ondergrens" — per TRANSFER, so
  // per currency they receive. Checked here so the button says so before
  // it is pressed, and again in affiliate_payout_request_multi so it is a
  // rule and not a suggestion.
  //
  // The owner, 25-09: "tenzij admin het vrijgeeft, super admin". So a
  // super-admin can lift it for one affiliate, and this card has to read
  // the same number the RPC will, or the button and the refusal disagree.
  //
  // Two things stay deliberately on the safe side. The column arrives
  // with plak 98 and migrations are pasted by hand, so a 42703 means the
  // standing 200 — the behaviour of yesterday, not an open door. And
  // while the read is in flight `undefined` resolves to 200 as well: a
  // button that turns on a moment late is a nuisance, one that turns on
  // wrongly is a refusal in the customer's face.
  const { data: minOverride, isError: minUnknown } = useQuery<
    number | string | null
  >({
    queryKey: ["affiliate-payout-min", scope],
    enabled: !!scope,
    // ── THE OWNER RELEASING THE FLOOR HAS TO REACH THEM ───────────
    //
    // Walked on production, 28-09, and it did not: the owner pressed
    // Release and set 0, and the affiliate's own tab still read
    // "EUR 125,00 to go" with the button greyed out -- over a server
    // that would now accept the request.
    //
    // The app default is refetchOnWindowFocus:false with a 30s
    // staleTime, and this card is never unmounted (the affiliate views
    // are CSS toggles, not routes), so it never remounts and never
    // refetches. Its two neighbours -- useAffiliatePayouts and
    // useAffiliateStats -- both already refetch on focus, which is why
    // the balance updated and the floor did not.
    //
    // Nothing in the affiliate's browser can be invalidated from the
    // owner's, so focus is the signal there is.
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async () => {
      const supabase = createClient();
      const r = await supabase
        .from("advertisers")
        .select("payout_min_override")
        .eq("id", scope!)
        .maybeSingle();
      if (!r.error) {
        return (
          (r.data as { payout_min_override?: number | string | null } | null)
            ?.payout_min_override ?? null
        );
      }
      if ((r.error as { code?: string } | null)?.code === "42703") return null;
      throw r.error;
    },
  });
  const MIN_PER_CURRENCY = payoutMinimumFor(minOverride);
  const payouts = useAffiliatePayouts(enabled, scope);
  const { rate } = useUsdToEur();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [picked, setPicked] = useState<Cur[]>([]);
  const [payIn, setPayIn] = useState<"EUR" | "USD" | "SAME">("SAME");
  const [form, setForm] = useState<PayoutDetails>(() => detailsOf(undefined));
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [view, setView] = useState<AffiliatePayout[] | null>(null);

  const last = payouts.rows[0];
  const waiting = useMemo(
    () => payouts.rows.filter((p) => p.status === "requested"),
    [payouts.rows],
  );

  // WHAT IS STILL FREE TO ASK FOR. A commission that is already in an open
  // request is still "unpaid" in the stats -- correctly, nobody has been
  // paid yet -- so without this the screen showed "€4.96 waiting for us"
  // and "€4.96 ready, request payout" at the same time, and pressing the
  // button just failed.
  const inFlight: Record<Cur, number> = { EUR: 0, USD: 0 };
  for (const p of waiting) {
    const c = String(p.currency).toUpperCase() as Cur;
    if (c === "EUR" || c === "USD") inFlight[c] = round2(inFlight[c] + (Number(p.amount) || 0));
  }
  // ---- AND NOT SUBTRACTED TWICE ---------------------------------
  //
  // The comment above is out of date and the sum below was wrong
  // because of it. The live `affiliate_referral_stats` filters
  // `rc.payout_id is null`, so a commission that is already pinned to an
  // open request is ALREADY out of `payable` -- taking `inFlight` off
  // again removes it a second time. With a EUR 15,96 request open and a
  // EUR 30,00 commission booked after it, this bar read EUR 14,04 for
  // money that is really EUR 30,00 free, and "EUR 185,96 to go" against
  // a floor it had in fact cleared.
  //
  // `blockedByOpen` below is what stops a second request while one is
  // in flight; that is the guard, not this subtraction.
  const owed: Record<Cur, number> = {
    EUR: Math.max(round2(owedEur), 0),
    USD: Math.max(round2(owedUsd), 0),
  };
  const available = (["EUR", "USD"] as Cur[]).filter((c) => owed[c] > 0.005);
  // Asked for together is one transfer: shown as one.
  const waitingGroups = useMemo(() => {
    const by = new Map<string, AffiliatePayout[]>();
    for (const p of waiting) {
      const k = String(p.group_id ?? p.id);
      by.set(k, [...(by.get(k) ?? []), p]);
    }
    return [...by.values()];
  }, [waiting]);
  const history = useMemo(
    () => payouts.rows.filter((p) => p.status !== "requested").slice(0, 4),
    [payouts.rows],
  );
  // Their OWN numbering. `payout_no` is house-wide and stays out of
  // sight here -- the owner, 28-09: "hun mogen niet zien tenant payouts
  // alleen per affiliate". lib/pure-payout-ref.ts explains why the
  // database column still has to be house-wide.
  const seq = useMemo(() => payoutSequence(payouts.rows), [payouts.rows]);
  const refOf = (p: { id: string; group_id?: string | null }) =>
    payoutRef(clientCode, seq.get(payoutGroupKey(p)));

  if (!enabled) return null;

  if (payouts.isPending) {
    return (
      <div className="card xpay">
        <div className="xp-top">
          <span className="ci g">
            <Ic name="i-download" />
          </span>
          <div>
            <h2>{tr("label.payout.gettingPaid")}</h2>
            <p className="cap">{tr("payout.checkingWhatIsReadyTo")}</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- A FAILED READ IS NOT "NO PAYOUTS" ------------------------
  //
  // This branched on isPending and `missing` only. On a read that
  // FAILED the card drew as if there were none: no open request, no
  // history, inFlight 0 -- so the whole balance was offered again, with
  // nothing on screen saying anything had gone wrong. On the one card
  // that asks for money.
  if (payouts.isError) {
    return (
      <div className="card xpay">
        <div className="xp-top">
          <span className="ci g">
            <Ic name="i-download" />
          </span>
          <div>
            <h2>{tr("label.payout.gettingPaid")}</h2>
            <p className="cap" style={{ color: "var(--danger)" }}>
              {tr("payout.weCouldnTReadYour")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (payouts.missing) {
    return (
      <div className="card xpay">
        <div className="xp-top">
          <span className="ci g">
            <Ic name="i-download" />
          </span>
          <div>
            <h2>{tr("label.payout.gettingPaid")}</h2>
            <p className="cap">
              {tr("payout.payoutRequestsAreBeingSwitched")}</p>
          </div>
        </div>
        {/* Naar de groep. Zie lib/whatsapp.ts: elke "Message us" ging
            naar het privénummer van de eigenaar, en met elf klanten
            zijn dat elf losse gesprekken waar niemand kan overnemen. */}
        <p className="btn ghost wa" style={{ cursor: "default" }}>
          <WhatsappIcon /> {" "}{tr("payout.askUsInYourWhatsapp")}</p>
      </div>
    );
  }

  // ---- AFTER THE FEE, LIKE THE SERVER -----------------------------
  //
  // Can they reach 200 in SOME currency? Either pot on its own, or both
  // converted into one. This ignored the 0,6% conversion fee, and the
  // RPC applies the floor per receiving bank AFTER that fee -- so the
  // card turned green, step 2 opened with "Keep them separate" already
  // chosen, and Send the request came back "A payout starts at EUR 200
  // -- this one is EUR 120,00", with nothing recorded.
  //
  // EUR 120 + $110 at 0,92 was the case: about EUR 221 converted, so the
  // card said yes; neither pot is 200 on its own, so the preselected
  // mode could never pass. And EUR 100 + $108,70 cleared the old test by
  // 0,60 and was refused on the fee alone.
  // ---- AND THE FEE ONLY ON THE LEG THAT IS CONVERTED --------------
  //
  // The line above took 0,6% off the WHOLE sum, including the pot that is
  // already in the receiving currency. The RPC does not: v_fee_pct is set
  // to 0 and stays 0 when `v_pay_cur = 'SAME' or v_pay_cur = v_cur`, and
  // the 0,60 is applied per leg, to the converted amount only. Read off
  // the live definition of affiliate_payout_request_multi.
  //
  // So this refused requests the server would have taken. EUR 199 + $1,50
  // at 0,872361 arrives as EUR 199 + EUR 1,30 = EUR 200,30 and passes;
  // the old line computed 0,994 x 200,31 = EUR 199,11 and the card said
  // "payouts start at EUR 200,00" over a request that was good. Same
  // shape as the bug the note above this one fixes, one layer in: the
  // card has to predict the server, not approximate it.
  //
  // Which is why it now lives in lib/pure-payout-reach.ts with tests, and
  // not in four lines here. Twice in a row this arithmetic has been wrong
  // in a way only the server could tell us about.
  const reach = payoutReach(owed, MIN_PER_CURRENCY, rate);
  const blockedByOpen = available.some((c) => inFlight[c] > 0);
  // minUnknown, not just owedUnknown. The floor is half of the sum --
  // an affiliate the owner released to 50 who is owed 60 would otherwise
  // be told "140,00 to go" over a server that would have accepted the
  // request. A figure we cannot stand behind is not printed.
  const canRequest =
    available.length > 0 && !blockedByOpen && !minUnknown && reach.reachable;
  // The bar already says how much and how far; this line only carries
  // what the bar cannot -- that a request is already with us, or that
  // two currencies TOGETHER would reach the floor.
  // Open ONLY because the two pots are added up -- neither reaches 200 on
  // its own. Then the card has to say so, or the green and the open button
  // sit over two bars that both still read as short.
  const openOnlyTogether =
    canRequest && available.length > 1 && reach.onlyByConverting;
  // ---- AND IT HAS TO QUOTE THE LEG THAT ACTUALLY PASSES -----------
  //
  // Both these sentences printed bestEur, whichever way the floor was
  // reached. `reachable` is an OR, and at a rate of 0,872361 EUR per USD
  // bestEur is always the smaller of the two -- so an affiliate whose
  // pots only clear the floor in dollars read "about EUR 174,47 -- enough
  // for a payout" under a card that had just said payouts start at 200.
  // The refusal line had it the other way round: it quoted the EUR figure
  // against the EUR floor while the USD one was nearer, so it overstated
  // the gap.
  const bestCur: Cur = reach.quoteCurrency;
  const bestAmt = reach.quoteAmount ?? 0;
  // Short of the floor it quotes the same way: whichever side comes
  // closest, because that is the one the next commission carries over the
  // line. payoutReach decides both.
  const nearCur: Cur = reach.quoteCurrency;
  const nearAmt = reach.quoteAmount ?? 0;
  const requestHint = blockedByOpen || (!available.length && waitingGroups.length)
    ? "Your request is with us. The next one can go out once it is settled."
    : !available.length
      ? null
      : openOnlyTogether && rate
        ? `Converted into one currency that is about ${formatCurrency(
            bestAmt,
            bestCur,
          )} — enough for a payout.`
        : canRequest
          ? null
          : available.length > 1 && rate
            ? `Together that is about ${formatCurrency(nearAmt, nearCur)} — payouts start at ${formatCurrency(
                MIN_PER_CURRENCY,
                nearCur,
              )}.`
            : null;

  const startRequest = () => {
    // Everything they gave us last time, per affiliate — the owner:
    // "moet alle gegevens van de laatste keer herinneren, pre filled".
    // The LAST payout first -- what they actually used most recently --
  // then what they saved as their default, then empty. Retyping an IBAN
  // every time is how a digit gets dropped.
  setForm(mergeDetails(detailsOf(last), defaults));
    setPicked(available);
    // ---- START ON A MODE THAT CAN PASS ---------------------------
    //
    // "Keep them separate" was always preselected, including when
    // neither pot reaches the floor on its own and the only way through
    // is converting both into one. Then the very first thing the
    // customer sees is the option the server is going to refuse.
    // reach.quoteCurrency IS the side that can pass -- the same figure the
    // hint above quotes, so the mode that opens and the amount it names
    // cannot disagree.
    setPayIn(reach.onlyByConverting ? reach.quoteCurrency : "SAME");
    setStep(available.length > 1 ? 1 : 2);
    setOpen(true);
  };

  const legs = picked
    .map((c) => {
      const to: Cur = payIn === "SAME" ? c : (payIn as Cur);
      const p = preview(owed[c], c, to, rate);
      return p ? { from: c, to, ...p } : null;
    })
    .filter(Boolean) as {
    from: Cur;
    to: Cur;
    net: number;
    fee: number;
    gross: number;
    rate: number | null;
  }[];
  const payCurrencies = Array.from(new Set(legs.map((l) => l.to)));
  const totalPer: Record<string, number> = {};
  for (const l of legs) totalPer[l.to] = round2((totalPer[l.to] ?? 0) + l.net);

  const needsEurBank = payCurrencies.includes("EUR");
  const needsUsdBank = payCurrencies.includes("USD");
  const detailsOk =
    (form.holder ?? "").trim().length > 1 &&
    (!needsEurBank || (form.iban ?? "").trim().length > 5) &&
    (!needsUsdBank ||
      ((form.accountNumber ?? "").trim().length > 3 && (form.bankName ?? "").trim().length > 1));

  const submit = async () => {
    setBusy(true);
    try {
      const { requestAffiliatePayoutMulti } = await import("@/actions/payout-actions");
      const res = await requestAffiliatePayoutMulti(picked, payIn, form);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const parts = res.data.legs.map((l) => formatCurrency(l.receives, l.paysIn));
      toast.success(tr("payout.payoutRequested", { v: String(parts.join(" + ")) }), {
        description: tr("payout.weLlConfirmHereThe"),
      });
      setOpen(false);
      await payouts.refetch();
      queryClient.invalidateQueries({ queryKey: ["affiliate-stats"] });
    } catch {
      toast.error(tr("payout.weCouldnTSendThat"));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setCancelling(id);
    try {
      const { cancelAffiliatePayout } = await import("@/actions/payout-actions");
      const res = await cancelAffiliatePayout(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(tr("payout.requestWithdrawn"));
      setView(null);
      await payouts.refetch();
      queryClient.invalidateQueries({ queryKey: ["affiliate-stats"] });
    } catch {
      // Without this the promise rejects unhandled: "Withdrawing…" goes
      // back to "Withdraw request", the request is still open, and
      // nothing on screen says the attempt failed. The submit handler
      // twenty lines up has had this catch all along.
      toast.error(tr("payout.weCouldnTWithdrawIt"));
    } finally {
      setCancelling(null);
    }
  };

  /** What the server recorded that they receive. */
  const receives = (p: AffiliatePayout) =>
    formatCurrency(
      Number(p.payout_amount ?? p.amount) || 0,
      String(p.payout_currency ?? p.currency),
    );

  const sumOf = (g: AffiliatePayout[]) => {
    const per: Record<string, number> = {};
    for (const p of g) {
      const cur = String(p.payout_currency ?? p.currency);
      per[cur] = round2((per[cur] ?? 0) + (Number(p.payout_amount ?? p.amount) || 0));
    }
    return per;
  };

  return (
    <div className="card xpay">
      <div className="xp-top">
        <span className="ci g">
          <Ic name="i-download" />
        </span>
        <div>
          <h2>{tr("label.payout.gettingPaid")}</h2>
          <p className="cap">{tr("payout.chooseWhatToBePaid")}</p>
        </div>
      </div>

      {/* ── ON ITS WAY. One card, one line to open it. ─────────────── */}
      {waitingGroups.map((g) => {
        const first = g[0];
        const per = sumOf(g);
        const commissions = g.reduce((n, p) => n + (Number(p.commission_count) || 0), 0);
        return (
          <button
            type="button"
            className="xp-open"
            key={String(first.group_id ?? first.id)}
            onClick={() => setView(g)}
          >
            <span className="xo-aur a" aria-hidden="true" />
            <span className="xo-aur b" aria-hidden="true" />
            <span className="xo-head">
              <span className="xo-pill">
                <span className="dot" /> {STATUS_LABEL.requested}
              </span>
              {refOf(first) ? <span className="xo-no">{tr("payout.payout", { v: String(refOf(first)) })}</span> : null}
              <span className="xo-when">{dayjs(first.requested_at).format("D MMM, HH:mm")}</span>
            </span>
            <span className="xo-amt">
              {Object.entries(per).map(([cur, amt], i) => {
                const t = formatCurrency(amt, cur);
                return (
                  <span key={cur}>
                    {i > 0 ? <span className="plus"> + </span> : null}
                    <span className="cur">{t.charAt(0)}</span>
                    {t.slice(1)}
                  </span>
                );
              })}
            </span>
            <span className="xo-sub">
              {g
                .map((p) => {
                  const src = formatCurrency(Number(p.amount) || 0, p.currency);
                  const dst = String(p.payout_currency ?? p.currency).toUpperCase();
                  return dst === String(p.currency).toUpperCase()
                    ? `${src} to your ${dst} bank`
                    : `${src} converted to ${dst}`;
                })
                .join(" · ")}
              {commissions
                ? ` · ${commissions} ${commissions === 1 ? "commission" : "commissions"}`
                : ""}
            </span>
            <span className="xo-steps" aria-hidden="true">
              <span className="st done">
                <span className="s-dot" />
                {tr("label.stRequested")}</span>
              <span className="st now">
                <span className="s-dot" />
                {tr("label.payout.weCheckIt")}</span>
              <span className="st">
                <span className="s-dot" />
                {tr("label.payout.transferred")}</span>
            </span>
            <span className="xo-more">
              {tr("label.payout.viewRequest")}{" "}<Ic name="i-arrow" />
            </span>
          </button>
        );
      })}

      {/* ── READY TO ASK FOR ───────────────────────────────────────── */}
      {owedUnknown || minUnknown ? (
        <p className="cap">
          {owedUnknown
            ? tr("payout.weCouldnTReadYour2")
            : tr("payout.weCouldnTCheckThe")}
        </p>
      ) : (
        <>
          {available.length ? (
            /* ── HOW CLOSE THEY ARE ───────────────────────────────
               "Ready in EUR EUR 10,00" over a button that cannot be
               pressed reads as money waiting for a click -- the owner:
               "er staat nu ready in EUR, is er nog niet toch?". A bar
               says the same thing honestly: this is what you have, that
               is what it takes, this much to go. */
            <div className={`xp-prog${canRequest ? " ok" : ""}`}>
              {available.map((c) => {
                // A released floor of 0 makes this 0/0 -- NaN -- and
                // `width: NaN%` is no width at all, so the bar vanishes
                // instead of reading full. There is nothing left to
                // reach, so it is full.
                const pctFull =
                  MIN_PER_CURRENCY > 0
                    ? Math.min(100, (owed[c] / MIN_PER_CURRENCY) * 100)
                    : 100;
                return (
                  <div className="xp-pr" key={c}>
                    <span className="top">
                      <span className="l">{c}</span>
                      <span className="v">{formatCurrency(owed[c], c)}</span>
                    </span>
                    <span className="bar">
                      <span className="fill" style={{ width: `${pctFull}%` }} />
                    </span>
                    <span className="foot">
                      {owed[c] >= MIN_PER_CURRENCY
                        ? tr("label.payout.readyToPayOut")
                        : canRequest
                          ? /* The card is green and the button is open because
                               the two pots TOGETHER clear the floor. Saying
                               "EUR 80,00 to go" underneath that contradicts the
                               button right above it. */
                            tr("payout.goesTogetherWithTheOther")
                          : tr("payout.toGo", { v: String(formatCurrency(round2(MIN_PER_CURRENCY - owed[c]), c)) })}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="xp-empty">
              {waitingGroups.length
                ? tr("payout.everythingYouAreOwedIs")
                : minUnknown
                  ? tr("payout.thisIsWhereYouAsk")
                  : tr("payout.thisIsWhereYouAsk2", { v: String(formatCurrency(MIN_PER_CURRENCY, "EUR")), v2: String(formatCurrency(MIN_PER_CURRENCY, "USD")) })}
            </p>
          )}
          {/* The button stays, and says why it cannot be pressed. A
              control that vanishes leaves people wondering where it went. */}
          <button className="btn grad" disabled={!canRequest} onClick={startRequest}>
            <Ic name="i-download" /> {" "}{tr("label.payout.requestPayout")}</button>
          {requestHint ? <p className="xp-hint">{requestHint}</p> : null}
        </>
      )}

      {/* ── WHAT HAPPENED BEFORE ───────────────────────────────────── */}
      {history.length ? (
        <div className="xp-hist">
          <div className="xp-hh">{tr("payout.earlierPayouts")}</div>
          {history.map((p) => (
            // ── THE INVOICE IS ON THE ROW, NOT ONLY BEHIND IT ──────
            //
            // The owner, 28-09: "ik kan ook nergens invoice zien". It
            // existed -- click the row, read the dialog, press Invoice
            // -- and that is two steps too many for the one document a
            // partner has to keep for their books. It is now on the
            // line it belongs to.
            //
            // Not on a refused or withdrawn one: there is no invoice
            // for a transfer we did not make (the route answers 409).
            <div className="xp-hrow" key={p.id}>
              <button className="xp-h" onClick={() => setView([p])}>
                <span className={`hi ${p.status}`}>
                  <Ic name={p.status === "paid" ? "i-check" : "i-x"} />
                </span>
                <span className="mid">
                  <span className="m">{receives(p)}</span>
                  <span className="d">
                    {refOf(p) ? `${tr("payout.payout2", { v: String(refOf(p)) })} ` : ""}
                    {dayjs(p.paid_at ?? p.decided_at ?? p.requested_at).format("D MMM YYYY")}
                    {p.reference || p.reason ? ` · ${p.reference || p.reason}` : ""}
                  </span>
                </span>
                <span
                  className={`badge xs ${
                    p.status === "paid" ? "ok" : p.status === "rejected" ? "due" : "muted"
                  }`}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </button>
              {p.status === "rejected" || p.status === "cancelled" ? null : (
                <a
                  className="xp-hinv"
                  href={`/api/payouts/${p.id}/invoice`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Ic name="i-receipt" /> {" "}{tr("label.adv.invoice")}</a>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* ── THE REQUEST, IN THREE STEPS ────────────────────────────── */}
      {open ? (
        <div className="modal">
          <div className="mback" onClick={() => (busy ? null : setOpen(false))} />
          <div className="mcard" style={{ width: "min(470px,100%)" }}>
            <div className="mhead">
              <h2>{tr("label.payout.requestPayout")}</h2>
              <button
                className="iconbtn"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label={tr("btn.close")}
              >
                ✕
              </button>
            </div>

            <div className="xp-steps" aria-hidden="true">
              <span className={step >= 1 ? "on" : ""} />
              <span className={step >= 2 ? "on" : ""} />
              <span className={step >= 3 ? "on" : ""} />
            </div>

            {step === 1 ? (
              <>
                <p className="cap" style={{ margin: "0 0 10px" }}>
                  {tr("payout.whatDoYouWantPaid")}</p>
                <div className="xp-pick">
                  {available.map((c) => {
                    const on = picked.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`xp-p${on ? " on" : ""}`}
                        aria-pressed={on}
                        onClick={() =>
                          setPicked(on ? picked.filter((x) => x !== c) : [...picked, c])
                        }
                      >
                        <span className="c">{c}</span>
                        <span className="a">{formatCurrency(owed[c], c)}</span>
                        <span className="tick">{on ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mfoot">
                  <button className="btn ghost" onClick={() => setOpen(false)}>
                    {tr("label.adv.goBack")}</button>
                  <button className="btn grad" disabled={!picked.length} onClick={() => setStep(2)}>
                    {tr("label.payout.next")}</button>
                </div>
              </>
            ) : step === 2 ? (
              <>
                <p className="cap" style={{ margin: "0 0 10px" }}>
                  {tr("payout.howDoYouWantIt")}</p>
                <div className="xp-ways">
                  {/* Two banks only for somebody who actually earned in
                      both — the owner's rule. */}
                  {picked.length > 1 ? (
                    <button
                      type="button"
                      className={`xp-w${payIn === "SAME" ? " on" : ""}`}
                      onClick={() => setPayIn("SAME")}
                    >
                      <b>{tr("label.payout.keepThemSeparate")}</b>
                      <small>
                        {tr("payout.eurosToYourEurBank")}</small>
                    </button>
                  ) : null}
                  {(["EUR", "USD"] as Cur[]).map((c) => {
                    const others = picked.filter((x) => x !== c);
                    const canConvert = others.every((o) => preview(owed[o], o, c, rate));
                    if (picked.length === 1 && picked[0] === c) {
                      return (
                        <button
                          key={c}
                          type="button"
                          className={`xp-w${payIn === "SAME" ? " on" : ""}`}
                          onClick={() => setPayIn("SAME")}
                        >
                          <b>{tr("payout.payMeIn", { c: String(c) })}</b>
                          <small>{tr("payout.straightToYourBankNo", { c: String(c) })}</small>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`xp-w${payIn === c ? " on" : ""}`}
                        disabled={!canConvert}
                        onClick={() => setPayIn(c)}
                      >
                        <b>{tr("payout.allIn", { c: String(c) })}</b>
                        <small>
                          {canConvert
                            ? tr("payout.weConvertTheRestAt", { FEEPCT: String(FEE_PCT) })
                            : tr("payout.weCanTConvertRight")}
                        </small>
                      </button>
                    );
                  })}
                </div>

                {legs.length ? (
                  <div className="xp-calc">
                    {legs.map((l) => (
                      <div className="row" key={l.from}>
                        <span>{formatCurrency(owed[l.from], l.from)}</span>
                        {l.from === l.to ? (
                          <b>{formatCurrency(l.net, l.to)}</b>
                        ) : (
                          <>
                            <span className="fx">
                              → {formatCurrency(l.gross, l.to)} − {FEE_PCT}% (
                              {formatCurrency(l.fee, l.to)})
                            </span>
                            <b>{formatCurrency(l.net, l.to)}</b>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="tot">
                      <span>{tr("label.payout.youReceive")}</span>
                      <b>
                        {Object.entries(totalPer)
                          .map(([c, a]) => formatCurrency(a, c))
                          .join(" + ")}
                      </b>
                    </div>
                    {legs.some((l) => l.rate) ? (
                      <p className="note">
                        {tr("payout.liveRate1UsdEur", { v: String(Number(legs.find((l) => l.rate)?.rate ?? 0).toFixed(4)) })}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mfoot">
                  <button
                    className="btn ghost"
                    onClick={() => (available.length > 1 ? setStep(1) : setOpen(false))}
                  >
                    {/* With one currency there is no step 1, so this
                        button closes the dialog. It said "Go back",
                        which is what a step-back button says — pressed
                        on an affiliate's only screen for asking to be
                        paid, it shut the whole thing instead. Same
                        action, honest word. */}
                    {available.length > 1 ? tr("btn.back") : tr("btn.cancel")}
                  </button>
                  <button className="btn grad" disabled={!legs.length} onClick={() => setStep(3)}>
                    {tr("label.payout.next")}</button>
                </div>
              </>
            ) : (
              <>
                <div className="xp-sum">
                  <span className="l">{tr("label.payout.youAreAskingFor")}</span>
                  <span className="v">
                    {Object.entries(totalPer)
                      .map(([c, a]) => formatCurrency(a, c))
                      .join(" + ")}
                  </span>
                  <span className="c">
                    {tr("payout.anythingEarnedAfterThisRequest")}</span>
                </div>

                <div className="field">
                  <label htmlFor="po2-holder">{tr("label.payout.accountHolder")}</label>
                  <input
                    id="po2-holder"
                    value={form.holder ?? ""}
                    onChange={(e) => setForm({ ...form, holder: e.target.value })}
                    placeholder={tr("payout.yourCompanyOrYourName")}
                  />
                </div>
                {needsEurBank ? (
                  <div className="frow">
                    <div className="field">
                      <label htmlFor="po2-iban">{tr("label.payout.ibanForEuros")}</label>
                      <input
                        id="po2-iban"
                        className="mono"
                        value={form.iban ?? ""}
                        onChange={(e) => setForm({ ...form, iban: e.target.value })}
                        placeholder="NL00 BANK 0000 0000 00"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="po2-bic">BIC / SWIFT</label>
                      <input
                        id="po2-bic"
                        className="mono"
                        value={form.bic ?? ""}
                        onChange={(e) => setForm({ ...form, bic: e.target.value })}
                        placeholder={tr("label.payout.optional")}
                      />
                    </div>
                  </div>
                ) : null}
                {needsUsdBank ? (
                  <>
                    <div className="field">
                      <label htmlFor="po2-bank">{tr("label.payout.bankForDollars")}</label>
                      <input
                        id="po2-bank"
                        value={form.bankName ?? ""}
                        onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                        placeholder={tr("label.payout.bankName")}
                      />
                    </div>
                    <div className="frow">
                      <div className="field">
                        <label htmlFor="po2-acct">{tr("label.payout.accountNumber")}</label>
                        <input
                          id="po2-acct"
                          className="mono"
                          value={form.accountNumber ?? ""}
                          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="po2-rout">Routing / SWIFT</label>
                        <input
                          id="po2-rout"
                          className="mono"
                          value={form.routing ?? ""}
                          onChange={(e) => setForm({ ...form, routing: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="field">
                  <label htmlFor="po2-addr">{tr("label.payout.billingAddress")}</label>
                  <input
                    id="po2-addr"
                    value={form.address ?? ""}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder={tr("payout.streetCityCountry")}
                  />
                </div>
                <div className="frow">
                  <div className="field">
                    <label htmlFor="po2-tax">{tr("label.adv.vatTaxId")}</label>
                    <input
                      id="po2-tax"
                      value={form.taxId ?? ""}
                      onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                      placeholder={tr("label.payout.optional")}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="po2-note">{tr("payout.anythingWeShouldKnow")}</label>
                    <input
                      id="po2-note"
                      value={form.note ?? ""}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      placeholder={tr("label.payout.optional")}
                    />
                  </div>
                </div>

                <div className="mfoot">
                  <button className="btn ghost" onClick={() => setStep(2)} disabled={busy}>
                    {tr("btn.back")}</button>
                  <button className="btn grad" onClick={submit} disabled={busy || !detailsOk}>
                    {busy ? tr("btn.sending") : tr("label.req.sendTheRequest")}
                  </button>
                </div>
                {!detailsOk ? (
                  <p className="xr-hint" style={{ marginTop: 8 }}>
                    {(form.holder ?? "").trim().length <= 1
                      ? tr("payout.weNeedTheAccountHolder")
                      : needsEurBank && (form.iban ?? "").trim().length <= 5
                        ? tr("payout.weNeedTheIbanTo")
                        : tr("payout.weNeedTheBankAnd")}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ── THE REQUEST, AS IT WAS SENT ────────────────────────────── */}
      {view ? (
        <div className="modal">
          <div className="mback" onClick={() => setView(null)} />
          <div className="mcard" style={{ width: "min(460px,100%)" }}>
            <div className="mhead">
              {/* Their own series, not the house one. See refOf above
                  and lib/pure-payout-ref.ts. */}
              <h2>
                {refOf(view[0]) ? tr("payout.payout", { v: String(refOf(view[0])) }) : tr("payout.yourPayoutRequest")}
              </h2>
              <button className="iconbtn" onClick={() => setView(null)} aria-label={tr("btn.close")}>
                ✕
              </button>
            </div>

            <div className="xp-rhead">
              <span
                className={`badge ${
                  view[0].status === "paid"
                    ? "ok"
                    : view[0].status === "rejected"
                      ? "due"
                      : view[0].status === "requested"
                        ? "pend"
                        : "muted"
                }`}
              >
                {STATUS_LABEL[view[0].status] ?? view[0].status}
              </span>
              <span className="when">
                {dayjs(view[0].requested_at).format("D MMM YYYY, HH:mm")}
              </span>
            </div>

            <div className="xp-hero">
              <span className="l">{tr("label.payout.youReceive")}</span>
              <span className="v">
                {Object.entries(sumOf(view))
                  .map(([c, a]) => formatCurrency(a, c))
                  .join(" + ")}
              </span>
            </div>

            <div className="xp-view">
              {view.map((p) => {
                const dst = String(p.payout_currency ?? p.currency).toUpperCase();
                const converted = dst !== String(p.currency).toUpperCase();
                return (
                  <div key={p.id}>
                    {/* ── THREE NUMBERS THAT HAVE TO MAKE A SUM ─────
                        `affiliate_payouts.amount` is the NET -- the RPC
                        inserts gross minus clawback into that column.
                        This row labelled it "From your EUR balance",
                        and then a clawback row was hung underneath it,
                        so live payout #2 read:

                          You receive              EUR 15.96
                          From your EUR balance    EUR 15.96
                          Returned volume settled  EUR  4.04

                        15.96 - 4.04 = 11.92. Neither figure follows
                        from the other two. The INVOICE for that same
                        payout reads 20.00 / -4.04 / Total 15.96 and is
                        right -- its route carries a comment about this
                        exact fault. The panel is the same fault, two
                        files away, on the surface the affiliate reads
                        first.

                        So the top line is the gross again: net plus
                        what was taken back. */}
                    <div className="row">
                      <span>{tr("payout.fromYourBalance", { v: String(String(p.currency).toUpperCase()) })}</span>
                      <b>
                        {formatCurrency(
                          Math.round(
                            ((Number(p.amount) || 0) +
                              (Number(p.clawback_amount) || 0)) *
                              100,
                          ) / 100,
                          p.currency,
                        )}
                      </b>
                    </div>
                    {converted ? (
                      <>
                        <div className="row">
                          <span>{tr("label.payout.convertedAt")}</span>
                          <b>1 USD = {Number(p.fx_rate ?? 0).toFixed(4)} EUR</b>
                        </div>
                        <div className="row">
                          <span>{tr("payout.conversionFee", { v: String(Number(p.fx_fee_pct ?? FEE_PCT)) })}</span>
                          <b>−{formatCurrency(Number(p.fx_fee_amount) || 0, dst)}</b>
                        </div>
                      </>
                    ) : null}
                    {Number(p.clawback_amount) > 0 ? (
                      <div className="row">
                        <span>{tr("payout.returnedVolumeSettled")}</span>
                        <b>{formatCurrency(Number(p.clawback_amount), p.currency)}</b>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="row">
                <span>{tr("label.payout.commissionsInIt")}</span>
                <b>{view.reduce((n, p) => n + (Number(p.commission_count) || 0), 0)}</b>
              </div>
              {view[0].reference ? (
                <div className="row">
                  <span>{tr("label.payout.ourReference")}</span>
                  <b>{view[0].reference}</b>
                </div>
              ) : null}
              {view[0].reason ? (
                <div className="row">
                  <span>{tr("payout.note")}</span>
                  <b>{view[0].reason}</b>
                </div>
              ) : null}
            </div>

            <div className="xp-sec">
              <Ic name="i-building" />
              <span>{tr("payout.theDetailsYouGaveUs")}</span>
            </div>
            <div className="xp-view">
              {Object.entries(detailsOf(view[0]))
                .filter(([, v]) => (v ?? "").toString().trim())
                .map(([k, v]) => (
                  <div className="row" key={k}>
                    <span>{DETAIL_LABEL[k] ?? k}</span>
                    <b className="mono">{String(v)}</b>
                  </div>
                ))}
              {Object.values(detailsOf(view[0])).every((v) => !(v ?? "").toString().trim()) ? (
                <p className="cap" style={{ margin: 0 }}>
                  {tr("payout.noBankDetailsWereSent")}</p>
              ) : null}
            </div>

            <div className="mfoot xp-vfoot">
              {/* Their invoice, written for them from the payout itself
                  — the owner: "invoice met referral earning auto created
                  met zijn bedrijfsgegevens".

                  NOT ON A PAYOUT THAT WAS REFUSED. This button had no
                  condition on it, so payout #3 — rejected the same
                  minute, reason and all, visible two lines above —
                  still handed out a self-billed invoice, and the
                  document called itself "Awaiting transfer". That is a
                  tax document raised by us, in the affiliate's name,
                  for money we declined to pay; it is not a status
                  wrinkle, it is a paper that should not exist. A
                  `requested` one may be pro-forma, so that stays. */}
              {view[0].status === "rejected" || view[0].status === "cancelled" ? null : (
                <a
                  className="btn ghost"
                  href={`/api/payouts/${view[0].id}/invoice`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Ic name="i-receipt" /> {" "}{tr("label.adv.invoice")}</a>
              )}
              {view[0].status === "requested" ? (
                <button
                  className="btn ghost"
                  disabled={cancelling === view[0].id}
                  onClick={() => cancel(view[0].id)}
                >
                  {cancelling === view[0].id ? tr("label.payout.withdrawing") : tr("label.payout.withdrawRequest")}
                </button>
              ) : null}
              <button className="btn" onClick={() => setView(null)}>
                {tr("btn.close")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
