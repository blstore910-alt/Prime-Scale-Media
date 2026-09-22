"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { toast } from "sonner";

import { Ic } from "@/components/advertiser/adv-icons";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import { whatsappUrl } from "@/lib/whatsapp";
import { formatCurrency } from "@/lib/utils";
import useAffiliatePayouts, { type AffiliatePayout } from "@/hooks/use-affiliate-payouts";
import type { PayoutDetails } from "@/actions/payout-actions";

// ── ASKING TO BE PAID ───────────────────────────────────────────────────
//
// The owner, on payouts: "hoef geen mark paid, dat moeten we in bulk
// doen". So this asks for ONE payout covering everything that is owed in
// one currency, and the request itself is a record with a state the
// affiliate can see — not a WhatsApp message that disappears into a chat.
//
// The amount is the server's, never this screen's arithmetic: the RPC
// hangs the exact commission rows on the payout, so what is shown here
// after the request is what was fixed at that moment.

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

export default function PayoutCard({ enabled, scope, owedEur, owedUsd, owedUnknown }: Props) {
  const queryClient = useQueryClient();
  const payouts = useAffiliatePayouts(enabled, scope);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState<"EUR" | "USD">(owedUsd > 0 && owedEur <= 0 ? "USD" : "EUR");
  const [form, setForm] = useState<PayoutDetails>(() => detailsOf(undefined));
  const [cancelling, setCancelling] = useState<string | null>(null);

  const last = payouts.rows[0];
  const openRequest = useMemo(
    () => payouts.rows.find((p) => p.status === "requested"),
    [payouts.rows],
  );
  const history = useMemo(
    () => payouts.rows.filter((p) => p.status !== "requested").slice(0, 3),
    [payouts.rows],
  );

  const owed = { EUR: owedEur, USD: owedUsd };
  const available = (["EUR", "USD"] as const).filter((c) => owed[c] > 0.005);

  if (!enabled) return null;

  // No answer yet. Not "no payouts" and not "the feature is off": either
  // would put a live Request button in front of somebody who may already
  // have one waiting.
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

  // Plak 50 is not in yet: say so, and keep the human route open. Never a
  // button that cannot work, and never silence about money.
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
    setForm(detailsOf(last));
    setCurrency(available.includes("EUR") ? "EUR" : (available[0] ?? "EUR"));
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { requestAffiliatePayout } = await import("@/actions/payout-actions");
      const res = await requestAffiliatePayout(currency, form);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Payout requested: ${formatCurrency(res.data.amount, res.data.currency)}`,
        { description: "We'll confirm here the moment it is transferred." },
      );
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
      await payouts.refetch();
      queryClient.invalidateQueries({ queryKey: ["affiliate-stats"] });
    } finally {
      setCancelling(null);
    }
  };

  const detailsOk =
    (form.holder ?? "").trim().length > 1 &&
    (currency === "EUR"
      ? (form.iban ?? "").trim().length > 5
      : (form.accountNumber ?? "").trim().length > 3 && (form.bankName ?? "").trim().length > 1);

  return (
    <div className="card xpay">
      <div className="xp-top">
        <span className="ci g">
          <Ic name="i-download" />
        </span>
        <div>
          <h2>Getting paid</h2>
          <p className="cap">
            One request covers everything owed in that currency. We transfer it
            to your bank and confirm it here.
          </p>
        </div>
      </div>

      {openRequest ? (
        <div className="xp-open">
          <div className="xp-amt">
            <span className="v">
              {formatCurrency(Number(openRequest.amount), openRequest.currency)}
            </span>
            <span className="badge pend xs">{STATUS_LABEL.requested}</span>
          </div>
          <p className="cap">
            Requested {dayjs(openRequest.requested_at).format("D MMM YYYY, HH:mm")} ·{" "}
            {openRequest.commission_count}{" "}
            {openRequest.commission_count === 1 ? "commission" : "commissions"}
            {Number(openRequest.clawback_amount) > 0
              ? ` · ${formatCurrency(Number(openRequest.clawback_amount), openRequest.currency)} returned volume settled`
              : ""}
            .
          </p>
          <div className="xp-acts">
            <button
              className="btn ghost sm"
              disabled={cancelling === openRequest.id}
              onClick={() => cancel(openRequest.id)}
            >
              {cancelling === openRequest.id ? "Withdrawing…" : "Withdraw request"}
            </button>
            <a
              className="btn ghost sm wa"
              href={whatsappUrl(
                `Hi PSM team, about my payout request of ${formatCurrency(Number(openRequest.amount), openRequest.currency)}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsappIcon /> Ask about it
            </a>
          </div>
        </div>
      ) : owedUnknown ? (
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
      ) : (
        <p className="cap">
          Nothing to pay out yet. Commission appears here as your referrals
          fund their accounts.
        </p>
      )}

      {history.length ? (
        <div className="xp-hist">
          {history.map((p) => (
            <div className="xp-h" key={p.id}>
              <span className="d">
                {dayjs(p.paid_at ?? p.decided_at ?? p.requested_at).format("D MMM YYYY")}
              </span>
              <span className="m">{formatCurrency(Number(p.amount), p.currency)}</span>
              <span
                className={`badge xs ${
                  p.status === "paid" ? "ok" : p.status === "rejected" ? "due" : "muted"
                }`}
              >
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
              {p.status === "paid" && p.reference ? (
                <span className="r" title={p.reference}>
                  {p.reference}
                </span>
              ) : null}
              {p.status === "rejected" && p.reason ? <span className="r">{p.reason}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="modal">
          <div className="mback" onClick={() => (busy ? null : setOpen(false))} />
          <div className="mcard" style={{ width: "min(460px,100%)" }}>
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

            {available.length > 1 ? (
              <div className="xp-cur" role="radiogroup" aria-label="Currency">
                {available.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={currency === c}
                    className={currency === c ? "on" : ""}
                    onClick={() => setCurrency(c)}
                  >
                    {c} · {formatCurrency(owed[c], c)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="xp-sum">
              <span className="l">You are asking for</span>
              <span className="v">{formatCurrency(owed[currency] ?? 0, currency)}</span>
              <span className="c">
                Everything owed in {currency} right now. Anything earned after
                this request goes into the next one.
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
            {currency === "EUR" ? (
              <div className="frow">
                <div className="field">
                  <label htmlFor="po2-iban">IBAN</label>
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
            ) : (
              <>
                <div className="field">
                  <label htmlFor="po2-bank">Bank</label>
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
            )}
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
              <button className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>
                Go back
              </button>
              <button className="btn grad" onClick={submit} disabled={busy || !detailsOk}>
                {busy ? "Sending…" : "Send the request"}
              </button>
            </div>
            {!detailsOk ? (
              <p className="xr-hint" style={{ marginTop: 8 }}>
                {currency === "EUR"
                  ? "We need the account holder and the IBAN to transfer it."
                  : "We need the account holder, the bank and the account number."}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
