"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { toast } from "sonner";

import { Ic } from "@/components/advertiser/adv-icons";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import { whatsappUrl } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { payoutMinimumFor } from "@/lib/pure-payout-min";
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

const FEE_PCT = 0.6;

type Cur = "EUR" | "USD";

type Props = {
  /** Their own advertiser row — payouts are read by RLS, this only gates. */
  enabled: boolean;
  /** Cache scope, so two identities never share a payout list. */
  scope?: string | null;
  owedEur: number;
  owedUsd: number;
  /** The owed figure could not be read (or is lifetime, not outstanding). */
  owedUnknown: boolean;
  /** What they saved under Settings as their standing bank details. The
   *  dialog starts from these so an IBAN is not retyped every time --
   *  retyping is how a digit gets dropped. Undefined until plak 78. */
  defaults?: Record<string, string> | null;
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for us",
  paid: "Paid",
  rejected: "Not paid",
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
  owedEur,
  owedUsd,
  owedUnknown,
  defaults,
}: Props) {
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
  const { data: minOverride } = useQuery<number | string | null>({
    queryKey: ["affiliate-payout-min", scope],
    enabled: !!scope,
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

  if (!enabled) return null;

  if (payouts.isPending) {
    return (
      <div className="card xpay">
        <div className="xp-top">
          <span className="ci g">
            <Ic name="i-download" />
          </span>
          <div>
            <h2>Getting paid</h2>
            <p className="cap">Checking what is ready to be paid out…</p>
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
            <h2>Getting paid</h2>
            <p className="cap" style={{ color: "var(--danger)" }}>
              We couldn&apos;t read your payouts just now. This is NOT
              &quot;you have none&quot; &mdash; reload before asking for
              one, so you do not ask twice.
            </p>
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
            <h2>Getting paid</h2>
            <p className="cap">
              Payout requests are being switched on. Message us and we&apos;ll
              arrange it by hand — nothing you have earned is lost.
            </p>
          </div>
        </div>
        <a
          className="btn ghost wa"
          href={whatsappUrl("Hi PSM team, I'd like to arrange a payout of my affiliate balance.")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <WhatsappIcon /> Message us
        </a>
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
  const afterFee = (n: number) => round2(n * (1 - FEE_PCT / 100));
  const bestEur = afterFee(round2(owed.EUR + (rate ? owed.USD * rate : 0)));
  const bestUsd = afterFee(round2(owed.USD + (rate ? owed.EUR / rate : 0)));
  // A pot paid out in its OWN currency is not converted, so no fee.
  const sameEur = owed.EUR >= MIN_PER_CURRENCY;
  const sameUsd = owed.USD >= MIN_PER_CURRENCY;
  const reachable =
    sameEur || sameUsd || bestEur >= MIN_PER_CURRENCY || bestUsd >= MIN_PER_CURRENCY
      ? 1
      : 0;
  // Which way it can actually be done, so step 2 does not open on the
  // one the server will refuse.
  const onlyByConverting = !sameEur && !sameUsd && reachable === 1;
  const blockedByOpen = available.some((c) => inFlight[c] > 0);
  const canRequest = available.length > 0 && !blockedByOpen && reachable === 1;
  const shortBy = Math.max(round2(MIN_PER_CURRENCY - bestEur), 0);
  // The bar already says how much and how far; this line only carries
  // what the bar cannot -- that a request is already with us, or that
  // two currencies TOGETHER would reach the floor.
  // Open ONLY because the two pots are added up -- neither reaches 200 on
  // its own. Then the card has to say so, or the green and the open button
  // sit over two bars that both still read as short.
  const openOnlyTogether =
    canRequest &&
    available.length > 1 &&
    owed.EUR < MIN_PER_CURRENCY &&
    owed.USD < MIN_PER_CURRENCY;
  const requestHint = blockedByOpen || (!available.length && waitingGroups.length)
    ? "Your request is with us. The next one can go out once it is settled."
    : !available.length
      ? null
      : openOnlyTogether && rate
        ? `Converted into one currency that is about ${formatCurrency(
            bestEur,
            "EUR",
          )} — enough for a payout.`
        : canRequest
          ? null
          : available.length > 1 && rate
            ? `Together that is about ${formatCurrency(bestEur, "EUR")} — payouts start at ${formatCurrency(
                MIN_PER_CURRENCY,
                "EUR",
              )}.`
            : null;
  void shortBy;

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
    setPayIn(
      onlyByConverting ? (bestEur >= MIN_PER_CURRENCY ? "EUR" : "USD") : "SAME",
    );
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
      toast.success(`Payout requested: ${parts.join(" + ")}`, {
        description: "We'll confirm here the moment it is transferred.",
      });
      setOpen(false);
      await payouts.refetch();
      queryClient.invalidateQueries({ queryKey: ["affiliate-stats"] });
    } catch {
      toast.error("We couldn't send that just now. Try again shortly.");
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
      toast.success("Request withdrawn.");
      setView(null);
      await payouts.refetch();
      queryClient.invalidateQueries({ queryKey: ["affiliate-stats"] });
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
          <h2>Getting paid</h2>
          <p className="cap">Choose what to be paid, and in which currency.</p>
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
              {first.payout_no ? <span className="xo-no">Payout #{first.payout_no}</span> : null}
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
                Requested
              </span>
              <span className="st now">
                <span className="s-dot" />
                We check it
              </span>
              <span className="st">
                <span className="s-dot" />
                Transferred
              </span>
            </span>
            <span className="xo-more">
              View request <Ic name="i-arrow" />
            </span>
          </button>
        );
      })}

      {/* ── READY TO ASK FOR ───────────────────────────────────────── */}
      {owedUnknown ? (
        <p className="cap">
          We couldn&apos;t read your balance just now — this is not a zero.
          Reload before requesting a payout.
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
                        ? "ready to pay out"
                        : canRequest
                          ? /* The card is green and the button is open because
                               the two pots TOGETHER clear the floor. Saying
                               "EUR 80,00 to go" underneath that contradicts the
                               button right above it. */
                            "goes together with the other currency"
                          : `${formatCurrency(round2(MIN_PER_CURRENCY - owed[c]), c)} to go`}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="xp-empty">
              {waitingGroups.length
                ? "Everything you are owed is in that request. What you earn from now on can be asked for once it is settled."
                : "This is where you ask to be paid. As soon as you have €200 or $200 in commission, the button below opens."}
            </p>
          )}
          {/* The button stays, and says why it cannot be pressed. A
              control that vanishes leaves people wondering where it went. */}
          <button className="btn grad" disabled={!canRequest} onClick={startRequest}>
            <Ic name="i-download" /> Request payout
          </button>
          {requestHint ? <p className="xp-hint">{requestHint}</p> : null}
        </>
      )}

      {/* ── WHAT HAPPENED BEFORE ───────────────────────────────────── */}
      {history.length ? (
        <div className="xp-hist">
          <div className="xp-hh">Earlier payouts</div>
          {history.map((p) => (
            <button className="xp-h" key={p.id} onClick={() => setView([p])}>
              <span className={`hi ${p.status}`}>
                <Ic name={p.status === "paid" ? "i-check" : "i-x"} />
              </span>
              <span className="mid">
                <span className="m">{receives(p)}</span>
                <span className="d">
                  {p.payout_no ? `Payout #${p.payout_no} · ` : ""}
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
          ))}
        </div>
      ) : null}

      {/* ── THE REQUEST, IN THREE STEPS ────────────────────────────── */}
      {open ? (
        <div className="modal">
          <div className="mback" onClick={() => (busy ? null : setOpen(false))} />
          <div className="mcard" style={{ width: "min(470px,100%)" }}>
            <div className="mhead">
              <h2>Request payout</h2>
              <button
                className="iconbtn"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Close"
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
                  What do you want paid out?
                </p>
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
                    Go back
                  </button>
                  <button className="btn grad" disabled={!picked.length} onClick={() => setStep(2)}>
                    Next
                  </button>
                </div>
              </>
            ) : step === 2 ? (
              <>
                <p className="cap" style={{ margin: "0 0 10px" }}>
                  How do you want it?
                </p>
                <div className="xp-ways">
                  {/* Two banks only for somebody who actually earned in
                      both — the owner's rule. */}
                  {picked.length > 1 ? (
                    <button
                      type="button"
                      className={`xp-w${payIn === "SAME" ? " on" : ""}`}
                      onClick={() => setPayIn("SAME")}
                    >
                      <b>Keep them separate</b>
                      <small>
                        Euros to your EUR bank, dollars to your USD bank. No
                        conversion, no fee.
                      </small>
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
                          <b>Pay me in {c}</b>
                          <small>Straight to your {c} bank. No conversion, no fee.</small>
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
                        <b>All in {c}</b>
                        <small>
                          {canConvert
                            ? `We convert the rest at today's rate, minus ${FEE_PCT}%.`
                            : "We can't convert right now — no rate is set."}
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
                      <span>You receive</span>
                      <b>
                        {Object.entries(totalPer)
                          .map(([c, a]) => formatCurrency(a, c))
                          .join(" + ")}
                      </b>
                    </div>
                    {legs.some((l) => l.rate) ? (
                      <p className="note">
                        Live rate: 1 USD = {Number(legs.find((l) => l.rate)?.rate ?? 0).toFixed(4)}{" "}
                        EUR. We confirm the exact figure when we transfer it.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mfoot">
                  <button
                    className="btn ghost"
                    onClick={() => (available.length > 1 ? setStep(1) : setOpen(false))}
                  >
                    {available.length > 1 ? "Back" : "Go back"}
                  </button>
                  <button className="btn grad" disabled={!legs.length} onClick={() => setStep(3)}>
                    Next
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="xp-sum">
                  <span className="l">You are asking for</span>
                  <span className="v">
                    {Object.entries(totalPer)
                      .map(([c, a]) => formatCurrency(a, c))
                      .join(" + ")}
                  </span>
                  <span className="c">
                    Anything earned after this request goes into the next one.
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="po2-holder">Account holder</label>
                  <input
                    id="po2-holder"
                    value={form.holder ?? ""}
                    onChange={(e) => setForm({ ...form, holder: e.target.value })}
                    placeholder="Your company or your name"
                  />
                </div>
                {needsEurBank ? (
                  <div className="frow">
                    <div className="field">
                      <label htmlFor="po2-iban">IBAN (for euros)</label>
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
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                ) : null}
                {needsUsdBank ? (
                  <>
                    <div className="field">
                      <label htmlFor="po2-bank">Bank (for dollars)</label>
                      <input
                        id="po2-bank"
                        value={form.bankName ?? ""}
                        onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                        placeholder="Bank name"
                      />
                    </div>
                    <div className="frow">
                      <div className="field">
                        <label htmlFor="po2-acct">Account number</label>
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
                  <label htmlFor="po2-addr">Billing address</label>
                  <input
                    id="po2-addr"
                    value={form.address ?? ""}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street, city, country"
                  />
                </div>
                <div className="frow">
                  <div className="field">
                    <label htmlFor="po2-tax">VAT / Tax ID</label>
                    <input
                      id="po2-tax"
                      value={form.taxId ?? ""}
                      onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="po2-note">Anything we should know</label>
                    <input
                      id="po2-note"
                      value={form.note ?? ""}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="mfoot">
                  <button className="btn ghost" onClick={() => setStep(2)} disabled={busy}>
                    Back
                  </button>
                  <button className="btn grad" onClick={submit} disabled={busy || !detailsOk}>
                    {busy ? "Sending…" : "Send the request"}
                  </button>
                </div>
                {!detailsOk ? (
                  <p className="xr-hint" style={{ marginTop: 8 }}>
                    {(form.holder ?? "").trim().length <= 1
                      ? "We need the account holder."
                      : needsEurBank && (form.iban ?? "").trim().length <= 5
                        ? "We need the IBAN to transfer the euros."
                        : "We need the bank and the account number for the dollars."}
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
              <h2>{view[0].payout_no ? `Payout #${view[0].payout_no}` : "Your payout request"}</h2>
              <button className="iconbtn" onClick={() => setView(null)} aria-label="Close">
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
              <span className="l">You receive</span>
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
                    <div className="row">
                      <span>From your {String(p.currency).toUpperCase()} balance</span>
                      <b>{formatCurrency(Number(p.amount) || 0, p.currency)}</b>
                    </div>
                    {converted ? (
                      <>
                        <div className="row">
                          <span>Converted at</span>
                          <b>1 USD = {Number(p.fx_rate ?? 0).toFixed(4)} EUR</b>
                        </div>
                        <div className="row">
                          <span>Conversion fee ({Number(p.fx_fee_pct ?? FEE_PCT)}%)</span>
                          <b>−{formatCurrency(Number(p.fx_fee_amount) || 0, dst)}</b>
                        </div>
                      </>
                    ) : null}
                    {Number(p.clawback_amount) > 0 ? (
                      <div className="row">
                        <span>Returned volume settled</span>
                        <b>{formatCurrency(Number(p.clawback_amount), p.currency)}</b>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div className="row">
                <span>Commissions in it</span>
                <b>{view.reduce((n, p) => n + (Number(p.commission_count) || 0), 0)}</b>
              </div>
              {view[0].reference ? (
                <div className="row">
                  <span>Our reference</span>
                  <b>{view[0].reference}</b>
                </div>
              ) : null}
              {view[0].reason ? (
                <div className="row">
                  <span>Note</span>
                  <b>{view[0].reason}</b>
                </div>
              ) : null}
            </div>

            <div className="xp-sec">
              <Ic name="i-building" />
              <span>The details you gave us</span>
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
                  No bank details were sent with this request.
                </p>
              ) : null}
            </div>

            <div className="mfoot xp-vfoot">
              {/* Their invoice, written for them from the payout itself
                  — the owner: "invoice met referral earning auto created
                  met zijn bedrijfsgegevens". */}
              <a
                className="btn ghost"
                href={`/api/payouts/${view[0].id}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Ic name="i-receipt" /> Invoice
              </a>
              {view[0].status === "requested" ? (
                <button
                  className="btn ghost"
                  disabled={cancelling === view[0].id}
                  onClick={() => cancel(view[0].id)}
                >
                  {cancelling === view[0].id ? "Withdrawing…" : "Withdraw request"}
                </button>
              ) : null}
              <button className="btn" onClick={() => setView(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
