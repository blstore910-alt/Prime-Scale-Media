"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { toast } from "sonner";

import { Ic } from "@/components/advertiser/adv-icons";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import { whatsappUrl } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/utils";
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
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Waiting for us",
  paid: "Paid",
  rejected: "Not paid",
  cancelled: "Withdrawn",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

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

export default function PayoutCard({ enabled, scope, owedEur, owedUsd, owedUnknown }: Props) {
  const queryClient = useQueryClient();
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
  const owed: Record<Cur, number> = {
    EUR: Math.max(round2(owedEur - inFlight.EUR), 0),
    USD: Math.max(round2(owedUsd - inFlight.USD), 0),
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

  const startRequest = () => {
    // Everything they gave us last time, per affiliate — the owner:
    // "moet alle gegevens van de laatste keer herinneren, pre filled".
    setForm(detailsOf(last));
    setPicked(available);
    setPayIn("SAME");
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
          <p className="cap">
            You choose what to be paid and in which currency. We transfer it and
            confirm it here.
          </p>
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
      ) : available.length ? (
        <>
          <div className="xp-legs">
            {available.map((c) => (
              <div className="xp-leg" key={c}>
                <span className="l">Ready in {c}</span>
                <span className="v">{formatCurrency(owed[c], c)}</span>
              </div>
            ))}
          </div>
          <button className="btn grad" onClick={startRequest}>
            <Ic name="i-download" /> Request payout
          </button>
        </>
      ) : waitingGroups.length ? (
        <p className="cap">
          Everything you are owed is in the request above. Anything earned from
          now on can be asked for once this one is settled.
        </p>
      ) : (
        <p className="cap">
          Nothing to pay out yet. Commission appears here as your referrals fund
          their accounts.
        </p>
      )}

      {/* ── WHAT HAPPENED BEFORE ───────────────────────────────────── */}
      {history.length ? (
        <div className="xp-hist">
          {history.map((p) => (
            <button className="xp-h" key={p.id} onClick={() => setView([p])}>
              <span className="d">
                {dayjs(p.paid_at ?? p.decided_at ?? p.requested_at).format("D MMM YYYY")}
              </span>
              <span className="m">{receives(p)}</span>
              <span
                className={`badge xs ${
                  p.status === "paid" ? "ok" : p.status === "rejected" ? "due" : "muted"
                }`}
              >
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
              <span className="r">{p.reference || p.reason || "View"}</span>
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
                    <p className="note">
                      Today&apos;s rate. We confirm the exact figure when we
                      transfer it.
                    </p>
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
              <h2>Your payout request</h2>
              <button className="iconbtn" onClick={() => setView(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="xp-view">
              <div className="row">
                <span>Asked on</span>
                <b>{dayjs(view[0].requested_at).format("D MMM YYYY, HH:mm")}</b>
              </div>
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
              <div className="row big">
                <span>You receive</span>
                <b>
                  {Object.entries(sumOf(view))
                    .map(([c, a]) => formatCurrency(a, c))
                    .join(" + ")}
                </b>
              </div>
              <div className="row">
                <span>Commissions in it</span>
                <b>{view.reduce((n, p) => n + (Number(p.commission_count) || 0), 0)}</b>
              </div>
              <div className="row">
                <span>State</span>
                <b>{STATUS_LABEL[view[0].status] ?? view[0].status}</b>
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

            <div className="subhead2" style={{ marginTop: 14 }}>
              <Ic name="i-building" /> The details you gave us
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
              {view[0].status === "requested" ? (
                <>
                  <a
                    className="btn ghost wa"
                    href={whatsappUrl(
                      `Hi PSM team, about my payout request of ${Object.entries(sumOf(view))
                        .map(([c, a]) => formatCurrency(a, c))
                        .join(" + ")}.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsappIcon /> Ask about it
                  </a>
                  <button
                    className="btn ghost"
                    disabled={cancelling === view[0].id}
                    onClick={() => cancel(view[0].id)}
                  >
                    {cancelling === view[0].id ? "Withdrawing…" : "Withdraw request"}
                  </button>
                </>
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
