"use client";

import { useOutstandingPrecharges } from "@/hooks/use-outstanding-precharges";
import { userFacingErrorMessage } from "@/lib/pure-error";

import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import PsmSortFilter from "@/components/psm/sort-filter";
import { prechargeTopup } from "@/actions/precharge-actions";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Search, Undo2, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useWalletTransactions from "./use-wallet-transactions";
import WalletTransactionApproveDialog from "./wallet-transaction-approve-dialog";
import WalletTransactionDetailsSheet from "./wallet-transaction-details-sheet";
import WalletTransactionRejectDialog from "./wallet-transaction-reject-dialog";
import PaymentSlipDialog from "./payment-slip-dialog";
import UserDetailsSheet from "@/components/admin/users/user-details-sheet";
import CustomerName from "@/components/psm/customer-name";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { useAdvertiserCommunities } from "@/hooks/use-advertiser-communities";
import { CommunityPill } from "@/components/community/community-pill";
import TablePagination from "../ui/table-pagination";
import { formatPaymentReference } from "@/lib/payment-reference";
import { CopyText } from "@/components/ui/copy-text";
import {
  useMatchedDeposits,
  type MatchedDeposit,
} from "@/hooks/use-matched-deposits";
import { currencySymbol } from "@/lib/pure-invoice-currency";

// `cur === "USD" ? "$" : "€"` painted a euro sign on every currency
// that was not exactly the string USD -- including "usd", which the
// balance trigger dispatches on with lower(), so it would credit the
// USD wallet while this card said euros. currencySymbol is the shared
// helper and it upper-cases first.
const money = (v: number | string | null | undefined, cur: string | null) => {
  const n = Number(v ?? 0);
  // An unreadable amount is not a zero and not a "NaN" on a money
  // screen. Say we cannot read it, in the place where the figure goes.
  if (!Number.isFinite(n)) return currencySymbol(cur) + "—";
  return (
    currencySymbol(cur) +
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  );
};

const shortDay = (iso: string) => {
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
};

/**
 * "Matched with a bank deposit of EUR 5.00 from BL E-COMMERCE."
 *
 * Or, when nothing has arrived, it says THAT — plainly, in amber, because
 * an admin about to credit a wallet from a queue of identical-looking cards
 * has no other way to tell the two apart. A card with money behind it and a
 * card with only a claim behind it looked exactly the same.
 *
 * Three states, never two: matched, nothing yet, and "we could not read the
 * feed". The third must not render as the second — see the hook.
 */
function MatchedStrip({
  deposit,
  unreadable,
  loading,
  pending,
  ownReference,
  claimAmount,
  claimCurrency,
}: {
  deposit?: MatchedDeposit;
  unreadable: boolean;
  loading: boolean;
  pending: boolean;
  /** What the card already prints one line above. */
  ownReference: string;
  /** What the CUSTOMER asked us to credit — the figure Verify moves. */
  claimAmount: number | string | null;
  claimCurrency: string | null;
}) {
  // A settled top-up has already been credited; the question the strip
  // answers does not apply any more.
  if (!pending) return null;

  // STILL ASKING. An empty answer and an unanswered question look identical
  // from here, and the empty answer's sentence — "only the customer's word
  // so far" — is the one that tells an admin not to trust the claim. It was
  // being shown on first paint, on every page change and on every window
  // refocus, a beat before it turned green.
  if (loading && !deposit) {
    return (
      <div className="tupmatch idle">
        <Search />
        <div>
          <b>Checking the bank feed…</b>
        </div>
      </div>
    );
  }

  if (deposit) {
    const amount =
      // A deposit is whatever the payer sent, and the top-up screen
      // offers GBP and HKD transfers -- so this drew "EUR 630.00" over
      // a GBP 630 deposit, on the strip an admin reads to decide
      // whether it matches a EUR 630 claim.
      currencySymbol(deposit.currency) +
      (deposit.amountCents / 100).toFixed(2);
    // The reference is printed one line above this strip. Repeating it
    // here said the same number twice in four lines — so it is shown only
    // when the payer wrote something DIFFERENT from what we gave them,
    // which is the case where it is information rather than an echo. The
    // matcher pairs on an equal reference, so a difference means this was
    // matched by hand or by a known sender, and an admin should see that.
    const norm = (v: string) => v.replace(/\D+/g, "");
    const otherRef =
      deposit.reference && norm(deposit.reference) !== norm(ownReference)
        ? deposit.reference
        : null;
    // MORE THAN ONE PAYMENT ANSWERS THIS CLAIM. Only one of them can be
    // credited, so the others are real money sitting in the bank that no
    // screen accounts for. This is the only place that can notice.
    if (deposit.count > 1) {
      return (
        <div className="tupmatch bad">
          <X />
          <div>
            <b>
              {deposit.count} bank deposits match this one claim
            </b>
            <div>
              Only one can be credited. Check the bank before you verify —
              the others are real payments that nothing here will settle.
            </div>
          </div>
        </div>
      );
    }

    // ── AND IS IT THE SAME MONEY? ────────────────────────────────────
    //
    // This strip drew the deposit and the card drew the claim, two
    // lines apart, and nothing ever subtracted them. A EUR 618 deposit
    // against a EUR 630 claim rendered GREEN, with a tick, saying
    // "Matched" — and Verify credits the CLAIM, so the customer is
    // handed EUR 12 that never arrived. A USD deposit against a EUR
    // claim read "Matched" too.
    //
    // The Wise panel on the tab beside this one has done the sum since
    // it was written (wise-review-panel: "The bank sent X and the claim
    // is for Y"). The verify queue, where the money actually leaves,
    // did not.
    const claim = Number(claimAmount);
    const claimCur = String(claimCurrency ?? "").toUpperCase();
    const depCur = String(deposit.currency ?? "").toUpperCase();
    const gapCents = Number.isFinite(claim)
      ? Math.round(claim * 100) - deposit.amountCents
      : 0;
    const claimShown = Number.isFinite(claim)
      ? currencySymbol(claimCurrency) + claim.toFixed(2)
      : null;
    const currencyDiffers = !!claimCur && !!depCur && claimCur !== depCur;
    // One cent of slack, and no more: these are two integers that ought
    // to be equal, not a rounding problem.
    if (claimShown && (currencyDiffers || Math.abs(gapCents) > 1)) {
      return (
        <div className="tupmatch bad">
          <X />
          <div>
            <b>
              The bank sent {amount} — this claim is for {claimShown}
            </b>
            <div>
              {currencyDiffers
                ? `Different currencies: the deposit is ${depCur} and the wallet claim is ${claimCur}. `
                : ""}
              Verifying credits the CLAIM, {claimShown}, not what arrived.
              Correct the claim on the Bank deposits tab first, or refuse it
              and ask for a fresh top-up for the amount actually sent.
            </div>
            {deposit.senderName ? (
              <div>
                from {deposit.senderName} · {shortDay(deposit.receivedAt)}
              </div>
            ) : (
              <div>{shortDay(deposit.receivedAt)}</div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="tupmatch ok">
        <Check />
        <div>
          <b>Matched with a bank deposit of {amount}</b>
          <div>
            {deposit.senderName ? "from " + deposit.senderName + " · " : ""}
            {shortDay(deposit.receivedAt)}
          </div>
          {/* Its own line, and unbreakable: "· ref" was wrapping away from
              the number it labels. */}
          {otherRef ? (
            <div>
              they wrote <span className="tupref">{otherRef}</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (unreadable) {
    return (
      <div className="tupmatch bad">
        <X />
        <div>
          <b>We couldn&apos;t check the bank feed</b>
          <div>This does NOT mean no money arrived — check the slip.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tupmatch warn">
      <Search />
      <div>
        <b>No bank deposit matched this yet</b>
        <div>Only the customer&apos;s word so far — check the slip.</div>
      </div>
    </div>
  );
}

const MATCH_CSS = `
.tupmatch{display:flex;gap:9px;align-items:flex-start;margin:10px 0 12px;
  border-radius:10px;padding:9px 11px;font-size:.8rem;line-height:1.4}
.tupmatch svg{width:15px;height:15px;flex:0 0 auto;margin-top:1px}
.tupmatch b{display:block;font-size:.83rem;font-weight:700}
.tupmatch div div{color:var(--txt-2);margin-top:1px;overflow:hidden;
  text-overflow:ellipsis}
/* #0e8f66 and #8a5a00, not the fill colours: this strip said whether
   a bank deposit actually matched, at 2.2:1 on its own tint — a pale
   smear on a phone, on the sentence that stops an admin crediting a
   wallet against nothing. The badges beside it already use these. */
.tupmatch.ok{background:var(--win-soft);color:#0e8f66}
.tupmatch.warn{background:var(--warn-soft);color:#8a5a00}
.tupmatch.bad{background:var(--danger-soft);color:var(--danger)}
.tupmatch.idle{background:var(--panel-2);color:var(--txt-2)}
.tupref{font-family:var(--mono,ui-monospace,monospace);font-weight:700;
  white-space:nowrap}
`;

const advName = (t: WalletTopupWithAdvertiser) => {
  const a = t.advertiser as
    | { name?: string; profile?: { full_name?: string } }
    | undefined;
  return a?.profile?.full_name || a?.name || "Advertiser";
};

// Admin wallet-topup verify queue, ported to the mockup look. Reuses the
// real data hook + the real approve/reject/details dialogs + the
// useUpdateTransaction mutation (verify/reject RPCs) — presentation only.
export default function PsmVerifyTopups({
  defaultStatus = "pending",
}: {
  defaultStatus?: string;
}) {
  const [status, setStatus] = useState(defaultStatus);
  const [currency, setCurrency] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 12;

  const [selected, setSelected] = useState<WalletTopupWithAdvertiser | null>(
    null,
  );
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [prechargingId, setPrechargingId] = useState<string | null>(null);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);
  // Who this money belongs to. The card used to end at the name; from a
  // queue where you are about to credit somebody's wallet, their own record
  // is one tap away and nobody should have to go and find it by hand.
  const [advProfileId, setAdvProfileId] = useState<string | null>(null);
  // Precharge moves real money into a wallet before the payment has
  // cleared. It was the one action on this card that happened on the first
  // click, with no way back.
  // ── AND A WAY BACK FROM A MISTAKEN DECISION ─────────────────────
  //
  // wallet_topup_admin_undo, undoWalletTopupAsAdmin and the "undo"
  // branch of useUpdateTransaction have all existed and been wired for
  // months. NOTHING on any route dispatched them: the only Undo in the
  // repo is commented out, in a file no route renders. So verifying the
  // wrong top-up put real money in a customer's wallet and the card then
  // rendered no actions at all, because they are all behind `pend`. The
  // only correction was a hand-written SQL statement.
  //
  // The reverse is safe and deliberate in the database:
  // _wallet_topup_balance_sync's "leaving completed" branch subtracts the
  // amount again and re-opens any advance it settled, with no floor check
  // -- "a negative balance is a visible receivable, not a reason to abort
  // the correction", in its own words.
  const [undoAsk, setUndoAsk] = useState<WalletTopupWithAdvertiser | null>(
    null,
  );
  const [prechargeAsk, setPrechargeAsk] =
    useState<WalletTopupWithAdvertiser | null>(null);
  const queryClient = useQueryClient();

  const doPrecharge = async (t: WalletTopupWithAdvertiser) => {
    setPrechargingId(t.id);
    try {
      const res = await prechargeTopup(t.id);
      if (!res.ok) throw new Error(res.error);
      toast.success("Precharged — wallet credited in advance");
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
      // AND the hook the VERIFY dialog reads. Its key is
      // ["outstanding-precharges", <ids>] and nothing invalidated it —
      // while `selected` is never reset to null, so that dialog stays
      // mounted and its query stays "fresh" for the rest of the session.
      // So: open Verify (cache says no advance), close it, press
      // Precharge, then Verify again — and the dialog still says "this
      // credits exactly the figure below" over a credit that nets to
      // zero. Exactly the failure that hook was written to prevent.
      queryClient.invalidateQueries({
        queryKey: ["outstanding-precharges"],
        exact: false,
      });
    } catch (e) {
      toast.error("Precharge failed", {
        description: userFacingErrorMessage(
          e,
          "Nothing was credited. Reload and try again.",
        ),
      });
    } finally {
      setPrechargingId(null);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, currency, debounced]);

  const { transactions, isLoading, total, isError, error, refetch } =
    useWalletTransactions({
      status,
      currency,
      search: debounced,
      page,
      perPage,
    });

  const shownCount = (transactions ?? []).length;
  // ── AND WALK BACK IF THIS PAGE NO LONGER EXISTS ──────────────────
  //
  // Verify the last item on page 2 and the refetch asks for rows 12-23
  // of a queue that now has 12. It comes back empty, the empty card
  // renders, and an admin reads "nothing to do" over a queue with a
  // full first page. Clamp to the last page that exists.
  useEffect(() => {
    if (isLoading) return;
    if (page <= 1) return;
    if (shownCount > 0) return;
    if (total <= 0) return;
    setPage(Math.max(1, Math.ceil(total / perPage)));
  }, [isLoading, page, total, shownCount]);

  const { mutate: updateTransaction, isPending } = useUpdateTransaction(
    selected ?? ({} as WalletTopupWithAdvertiser),
  );

  const { byAdvertiser: communities, isError: communitiesUnreadable } =
    useAdvertiserCommunities(transactions.map((t) => t.advertiser_id));

  // The bank deposit behind each claim — see hooks/use-matched-deposits.
  const {
    byTopup: deposits,
    isError: depositsUnreadable,
    isLoading: depositsLoading,
  } = useMatchedDeposits(transactions.map((t) => t.id));

  // ── AND WHETHER EACH ONE IS ALREADY ADVANCED ────────────────────────
  //
  // The Verify dialog consults this; the card behind it did not. So
  // Precharge stayed live on a top-up that already carries an advance,
  // and its confirmation asserted "Credited now €5,000" for something
  // wallet_precharge_from_topup refuses outright with "This top-up is
  // already precharged". Enabled-then-refused, with a money figure
  // stated in between — on the desk where money is released.
  //
  // ...and it was wired for the success path only. `precharges` is
  // `data ?? {}`, so "still reading" and "the read failed" both arrive
  // as "no advance" — the two states where we do not know. That window
  // is every first paint of the queue and every page or filter change,
  // and on an expired JWT it never closes. The dialog behind the same
  // button already blocks on all three states; the cards did not.
  const {
    precharges: queueAdvances,
    isLoading: advancesLoading,
    isError: advancesUnreadable,
  } = useOutstandingPrecharges(transactions.map((t) => t.id));
  const advancesUnknown = advancesLoading || advancesUnreadable;

  const confirmApprove = () =>
    updateTransaction(
      { action: "approve" },
      { onSuccess: () => setApproveOpen(false) },
    );
  const confirmReject = (reason: string) =>
    updateTransaction(
      { action: "reject", rejectionReason: reason },
      { onSuccess: () => setRejectOpen(false) },
    );

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <style>{MATCH_CSS}</style>
      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference…"
          />
        </label>
        {/* Both filters behind one control: two loose selects cost a whole
            second row of the bar on a phone, above a queue you are trying to
            work through. The count on the button is what stops a filtered
            queue from looking like an empty one. */}
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              // "pending" is this screen's working default, not "no filter" —
              // it is a verification queue. So the badge counts anything else
              // as narrowing, and Reset returns you to the queue.
              allValue: "pending",
              onChange: setStatus,
              options: [
                { value: "pending", label: "Pending" },
                { value: "completed", label: "Completed" },
                { value: "rejected", label: "Rejected" },
                { value: "all", label: "All statuses" },
              ],
            },
            {
              id: "currency",
              label: "Currency",
              value: currency,
              onChange: setCurrency,
              options: [
                { value: "all", label: "All currencies" },
                { value: "EUR", label: "EUR" },
                { value: "USD", label: "USD" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            // The screen's own default, not a repeat of the literal. Reset
            // that does not return you to where the screen opens is a small
            // lie, and the two would drift the moment a caller passed
            // something else.
            setStatus(defaultStatus);
            setCurrency("all");
            setSearch("");
          }}
        />
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : transactions?.length ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
            gap: 12,
          }}
        >
          {transactions.map((t: WalletTopupWithAdvertiser) => {
            const pend = t.status === "pending";
            return (
              <div
                key={t.id}
                className="card"
                style={{ padding: 16, cursor: "pointer" }}
                onClick={() => setDetailsId(t.id)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  {/* PSM number first, name beneath — the same identity
                      block every other admin list uses, and the one the
                      desk actually works in. Tapping it opens that
                      advertiser's record; tapping anywhere else on the card
                      still opens this payment. */}
                  <button
                    className="custbtn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const pid = (
                        t.advertiser as { profile?: { id?: string } } | undefined
                      )?.profile?.id;
                      if (pid) setAdvProfileId(pid);
                      else
                        toast.message(
                          "No user record on this advertiser to open.",
                        );
                    }}
                    title="Open this advertiser"
                  >
                    <CustomerName
                      clientCode={
                        (
                          t.advertiser as
                            | { tenant_client_code?: string }
                            | undefined
                        )?.tenant_client_code
                      }
                      name={advName(t)}
                      full
                      community={
                        <CommunityPill
                          name={communities[t.advertiser_id ?? ""]}
                          unknown={communitiesUnreadable}
                        />
                      }
                    />
                  </button>
                  <span
                    className={`badge ${pend ? "pend" : t.status === "completed" ? "ok" : "due"}`}
                    style={{ marginLeft: "auto", textTransform: "capitalize" }}
                  >
                    {t.status}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-jakarta)",
                    fontWeight: 800,
                    fontSize: "1.4rem",
                  }}
                >
                  {money(t.amount, t.currency)}
                </div>
                {/* "Bank transfer" says how it arrived and not what it
                    is for. Everything in this queue is a wallet top-up —
                    that is what the screen is — so the line that earns its
                    place says which wallet it lands in, and the reference
                    gets a label instead of being a loose number under a
                    name. */}
                <div
                  style={{
                    color: "var(--faint)",
                    fontSize: ".82rem",
                    marginTop: 2,
                  }}
                >
                  Wallet top-up · bank transfer into their{" "}
                  {(t.currency ?? "EUR").toUpperCase()} wallet
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    marginTop: 8,
                    fontSize: ".82rem",
                  }}
                >
                  <span style={{ color: "var(--faint)" }}>Reference</span>
                  {/* THE SAME STRING THE CUSTOMER WAS GIVEN. This printed the
                      bare reference while the customer was told to write
                      <client code>-<reference>, and the bank deposit beside
                      it now shows what they actually wrote. An admin
                      matching by eye was comparing two different strings and
                      had to know that the prefix was ours. */}
                  {/* Copy on click, no icon — the value IS the button.
                      A reference is retyped into a banking app or pasted
                      into a reply to the customer, and selecting it by
                      hand on a phone catches the line above. */}
                  <CopyText
                    mono
                    what="reference"
                    value={
                      formatPaymentReference(
                        (
                          t.advertiser as
                            | { tenant_client_code?: string }
                            | undefined
                        )?.tenant_client_code,
                        t.reference_no,
                      ) || ""
                    }
                    label={
                      formatPaymentReference(
                        (
                          t.advertiser as
                            | { tenant_client_code?: string }
                            | undefined
                        )?.tenant_client_code,
                        t.reference_no,
                      ) || "—"
                    }
                  />
                </div>
                {/* DID THE MONEY ACTUALLY ARRIVE? Everything above this
                    line is what the CUSTOMER said. This is the only thing
                    on the card that is a fact about the bank, and Verify —
                    which credits real money — sits directly under it. */}
                <MatchedStrip
                  deposit={deposits[t.id]}
                  unreadable={depositsUnreadable}
                  loading={depositsLoading}
                  pending={pend}
                  claimAmount={t.amount}
                  claimCurrency={t.currency}
                  ownReference={
                    formatPaymentReference(
                      (
                        t.advertiser as
                          | { tenant_client_code?: string }
                          | undefined
                      )?.tenant_client_code,
                      t.reference_no,
                    ) || ""
                  }
                />
                {/* ── AND WHY IT WAS REFUSED, IF IT WAS ─────────────────
                    The reject dialog will not unlock until an admin has
                    written a sentence for the customer, and then the
                    queue forgot it: switch the filter to Rejected and
                    every card said "rejected" over a reference and
                    nothing else. The customer replies asking why, and
                    whoever picks that up -- usually not the admin who
                    pressed the button -- has no way to see what they
                    were told, short of the database. */}
                {t.status === "rejected" && t.rejection_reason ? (
                  <div
                    style={{
                      // The same rhythm as the matched-deposit strip it
                      // stands in for: 10 above, 12 below. Without the
                      // bottom margin the Details and Slip buttons sat
                      // flush against the box.
                      margin: "10px 0 12px",
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "var(--danger-bg, #fff1f2)",
                      border: "1px solid var(--danger-bd, #fecdd3)",
                      color: "var(--danger-tx, #9f1239)",
                      fontSize: ".8rem",
                      lineHeight: 1.45,
                    }}
                  >
                    <strong style={{ fontWeight: 700 }}>
                      Told the customer:
                    </strong>{" "}
                    {t.rejection_reason}
                  </div>
                ) : null}
                <div className="actrow tupacts">
                  {/* The card's own onClick is a mouse convenience. This is
                      the keyboard route to the details sheet — the view an
                      admin reads (reference, slip, advertiser) before
                      crediting real money. Without it the sheet was
                      unreachable without a pointer. */}
                  <button
                    className="btn ghost sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsId(t.id);
                    }}
                  >
                    <FileText /> Details
                  </button>
                  {pend && (
                      <>
                        <button
                          className="btn sm tupmain"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(t);
                            setApproveOpen(true);
                          }}
                        >
                          <Check /> Verify
                        </button>
                        {/* A reason that lives only in a title attribute
                            is invisible on a phone and unreliable on a
                            disabled button -- and it named "the Advances
                            tab", which is not what the tab beside it is
                            called. The label says it instead. */}
                        <button
                          className="btn ghost sm"
                          disabled={!!queueAdvances[t.id] || advancesUnknown}
                          title={
                            advancesUnknown
                              ? "Checking whether this top-up carries an advance."
                              : queueAdvances[t.id]
                                ? "Cancel the advance on the Precharge tab first — rejecting would leave it outstanding."
                                : undefined
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(t);
                            setRejectOpen(true);
                          }}
                        >
                          <X />{" "}
                          {advancesUnknown
                            ? "Checking…"
                            : queueAdvances[t.id]
                              ? "Cancel advance first"
                              : "Reject"}
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={
                            prechargingId === t.id ||
                            !!queueAdvances[t.id] ||
                            advancesUnknown
                          }
                          title={
                            advancesUnknown
                              ? "Checking whether this top-up carries an advance."
                              : queueAdvances[t.id]
                                ? "Already advanced — verify it to settle"
                                : "Advance-credit the wallet now; settles on verify"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrechargeAsk(t);
                          }}
                        >
                          <Zap />{" "}
                          {advancesUnknown
                            ? "Checking…"
                            : queueAdvances[t.id]
                              ? "Advanced"
                              : "Precharge"}
                        </button>
                      </>
                    )}
                    {!pend &&
                    (t.status === "completed" || t.status === "rejected") ? (
                      <button
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Both, and in this order, exactly like Verify
                          // and Reject: the mutation is built from
                          // `selected`, and the confirm happens a render
                          // later, by which time it points at this row.
                          setSelected(t);
                          setUndoAsk(t);
                        }}
                      >
                        <Undo2 /> Undo
                      </button>
                    ) : null}
                    {t.payment_slip ? (
                      <button
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSlipUrl(t.payment_slip ?? null);
                          setSlipOpen(true);
                        }}
                      >
                        <FileText /> Slip
                      </button>
                    ) : (
                      /* ABSENCE MEANT TWO THINGS. The strip above says
                         "Only the customer's word so far — check the
                         slip", and where there is no slip the button
                         simply was not rendered. An operator looking for
                         it cannot tell "there is none" from "it is
                         somewhere else on this screen". */
                      <span
                        className="muted"
                        style={{
                          alignSelf: "center",
                          fontSize: ".78rem",
                          paddingLeft: 2,
                        }}
                      >
                        No slip uploaded
                      </span>
                    )}
                </div>
                {/* THE SENTENCE THAT NAMES THE WAY OUT, ON SCREEN.
                    The disabled Reject reads "Cancel advance first" and
                    the place to do it lived in a title attribute — which
                    never appears on a phone, and a disabled button
                    dispatches no events to reveal it anyway. */}
                {pend && queueAdvances[t.id] ? (
                  <p
                    className="muted"
                    style={{ margin: "8px 0 0", fontSize: ".78rem" }}
                  >
                    This top-up carries an advance. Cancel it on the
                    Precharge tab before refusing, or verifying settles it.
                  </p>
                ) : null}
                {pend && advancesUnreadable ? (
                  <p
                    className="muted"
                    style={{ margin: "8px 0 0", fontSize: ".78rem" }}
                  >
                    We could not check whether this top-up carries an
                    advance, so Reject and Precharge are held. Reload
                    before deciding.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : isError ? (
        /* A failed read must never look like an empty queue — this is the
           screen that says whether anyone is waiting on their money. */
        <div className="card">
          <p style={{ margin: 0, fontWeight: 600 }}>
            Couldn&apos;t load the wallet top-ups.
          </p>
          <p className="muted" style={{ margin: "6px 0 12px" }}>
            {(error as Error)?.message ??
              "The request failed. This is NOT an empty queue — do not assume there is nothing to verify."}
          </p>
          <button className="btn ghost sm" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <p className="muted" style={{ margin: 0 }}>
            {status !== defaultStatus || currency !== "all" || search.trim()
              ? "Nothing matches that search or filter — the queue itself may not be empty."
              : "No wallet topups to show."}
          </p>
          {status !== defaultStatus || currency !== "all" || search.trim() ? (
            <button
              className="btn ghost sm"
              style={{ justifySelf: "start" }}
              onClick={() => {
                setStatus(defaultStatus);
                setCurrency("all");
                setSearch("");
              }}
            >
              Clear the search and filters
            </button>
          ) : null}
        </div>
      )}

            {/* ── THE PAGER MUST NOT VANISH WITH THE LAST ROW ────────────
          This was gated on the CURRENT PAGE having rows. Work the last
          item on page 2 and the refetch comes back empty, so the empty
          card renders AND the pager disappears — leaving a queue that
          says there is nothing to do while twelve items sit on page 1,
          with no control on screen to get back. Only a filter change or
          a reload escaped. The gate is `total`, which is the whole
          queue, not the slice. The clamp above walks the page back so
          this cannot be reached in the first place. */}
      {!isLoading && total > perPage ? (
        <div className="my-4 px-4">
          <TablePagination
            page={page}
            total={total}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      ) : null}

      {selected && (
        <WalletTransactionApproveDialog
          open={approveOpen}
          onOpenChange={setApproveOpen}
          topup={selected}
          onConfirm={confirmApprove}
          isPending={isPending}
        />
      )}
      <WalletTransactionRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onSubmit={confirmReject}
        isSubmitting={isPending}
      />
      <WalletTransactionDetailsSheet
        open={!!detailsId}
        onOpenChange={(o) => !o && setDetailsId(null)}
        topupId={detailsId}
      />
      <PaymentSlipDialog
        open={slipOpen}
        onOpenChange={setSlipOpen}
        paymentSlipUrl={slipUrl}
      />

      {/* The advertiser behind the payment, from the payment. */}
      <UserDetailsSheet
        open={!!advProfileId}
        profileId={advProfileId}
        onOpenChange={() => setAdvProfileId(null)}
      />

      <ConfirmModal
        open={!!undoAsk}
        onOpenChange={(next) => {
          if (!next) setUndoAsk(null);
        }}
        title={
          undoAsk?.status === "completed"
            ? "Take this credit back out?"
            : "Re-open this refusal?"
        }
        lead={
          undoAsk?.status === "completed"
            ? "The amount comes straight back out of the wallet and the top-up returns to the queue as pending. If the advertiser has already spent it, their balance goes negative — that is a receivable, not a mistake, and it is the right answer. Tell them."
            : "The top-up returns to the queue as pending and your reason is cleared. Nothing moves in the wallet — the refusal never credited anything. The customer is not told again."
        }
        cta={
          undoAsk?.status === "completed"
            ? `Yes, take back ${undoAsk ? money(undoAsk.amount, undoAsk.currency) : ""}`
            : "Yes, re-open it"
        }
        busy={isPending}
        busyLabel="Undoing…"
        onConfirm={() =>
          updateTransaction(
            { action: "undo" },
            { onSuccess: () => setUndoAsk(null) },
          )
        }
      >
        <ConfirmFact
          label="Customer"
          value={undoAsk ? advName(undoAsk) : ""}
        />
        <ConfirmFact
          label="Amount"
          value={undoAsk ? money(undoAsk.amount, undoAsk.currency) : ""}
          strong
        />
        <ConfirmFact
          label="Wallet changes by"
          value={
            undoAsk?.status === "completed"
              ? `-${undoAsk ? money(undoAsk.amount, undoAsk.currency) : ""}`
              : "nothing"
          }
          strong
        />
        <ConfirmFact
          label="Reference"
          value={
            formatPaymentReference(
              (undoAsk?.advertiser as { tenant_client_code?: string } | undefined)
                ?.tenant_client_code,
              undoAsk?.reference_no,
            ) || "—"
          }
        />
      </ConfirmModal>

      <ConfirmModal
        open={!!prechargeAsk}
        onOpenChange={(next) => {
          if (!next) setPrechargeAsk(null);
        }}
        title="Credit this wallet before the money has cleared?"
        lead="The advertiser can spend it straight away. If the transfer never arrives, this is our money they are spending — it settles when you verify the payment."
        cta="Yes, precharge it"
        busy={prechargingId === prechargeAsk?.id}
        busyLabel="Crediting…"
        onConfirm={() => {
          // Do NOT close first here. Precharge moves real money and takes a
          // round trip, so the dialog stays up with its busy label until
          // the write resolves — closing first made `busy` unreachable
          // (prechargingId is set after the modal is gone), so the only
          // feedback for a money movement was a toast arriving seconds
          // later. doPrecharge clears the dialog itself when it finishes.
          const t = prechargeAsk;
          if (!t) return;
          void doPrecharge(t).finally(() => setPrechargeAsk(null));
        }}
      >
        <ConfirmFact
          label="Advertiser"
          value={prechargeAsk ? advName(prechargeAsk) : ""}
        />
        <ConfirmFact
          label="Credited now"
          value={
            prechargeAsk
              ? money(prechargeAsk.amount, prechargeAsk.currency)
              : ""
          }
          strong
        />
        <ConfirmFact
          label="Reference"
          value={prechargeAsk?.reference_no ?? "—"}
        />
      </ConfirmModal>
    </div>
  );
}
