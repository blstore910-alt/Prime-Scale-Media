"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { RejectReasonField } from "@/components/ui/reject-reason-field";
import type { RejectContext } from "@/lib/pure-reject-reasons";
import { createClient } from "@/lib/supabase/client";
import PsmSortFilter from "@/components/psm/sort-filter";
import CustomerName from "@/components/psm/customer-name";
import { useAppContext } from "@/context/app-provider";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownToLine,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import {
  approveAdAccountWithdrawal,
  rejectAdAccountWithdrawal,
} from "@/actions/withdrawal-actions";
import {
  requestWalletRefund,
  approveWalletRefund,
  rejectWalletRefund,
} from "@/actions/refund-actions";
import {
  requestWalletAdjustment,
  approveWalletAdjustment,
  rejectWalletAdjustment,
} from "@/actions/adjustment-actions";
import type { AdAccountWithdrawal } from "@/lib/types/withdrawal";
import { formatCurrency } from "@/lib/utils";

/**
 * One confirmation for the approve/reject pairs on this screen.
 *
 * Approve used to be a window.confirm() and Reject had NOTHING — despite
 * being the irreversible half: the RPCs refuse any status other than
 * 'pending', so a rejected request is dead and the customer has to file it
 * again. Reject also sat immediately to the left of Approve.
 *
 * window.confirm was not much better: after a few dialogs from one page
 * both Chrome and Firefox offer "prevent this page from creating
 * additional dialogs", and once that is ticked confirm() silently returns
 * false — the button appears dead — which is exactly the box a busy
 * operator ticks while working through a queue of twenty. It also cannot
 * show the amount, the currency and the customer as structured facts,
 * which is the whole point of asking.
 */
type ActionAsk = {
  title: string;
  lead: string;
  cta: string;
  danger?: boolean;
  facts: Array<[string, string]>;
  // ── A REFUSAL THE CUSTOMER CAN READ ─────────────────────────────
  //
  // Set this and the dialog grows a reason box, the confirm button
  // stays dead until something is typed, and what was typed is handed
  // to run(). Reject on this screen called run() with no argument at
  // all, so `reason` -- which the mutation, the action, the RPC and
  // the customer notification all carry end to end -- arrived as null
  // every single time. The customer asking for their own money back
  // was told "no" and nothing else.
  reasonFor?: RejectContext;
  // ── DOES THIS ADD UP, BEFORE WE RELEASE IT ───────────────────────
  //
  // Approving a withdrawal credits the customer's wallet with money
  // that has to come back off the ad account. If it is not there, PSM
  // is out of pocket and nobody finds out until the books are done.
  //
  // The ceiling on both sides of this journey is "funded minus already
  // asked back" and subtracts nothing for what the account has SPENT,
  // so it is not an answer to that question. Set this and the modal
  // asks the platform what it actually holds, states whether the
  // amount is covered, and keeps the confirm dead until somebody ticks
  // that they checked.
  //
  // The owner's rule: with an API we read it AND the admin approves;
  // without one the admin checks it themselves and approves. Either
  // way a person signs off, which is why the tick is not optional even
  // when the figure comes back.
  coverCheck?: { accountId: string; amount: number; currency: string };
  run: (reason?: string) => void;
};

function ActionAskModal({
  ask,
  close,
  busy,
}: {
  ask: ActionAsk | null;
  close: () => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState("");
  const needsReason = !!ask?.reasonFor;
  const [checked, setChecked] = useState(false);
  const [cover, setCover] = useState<
    | { state: "loading" }
    | { state: "known"; amount: number; currency: string }
    | { state: "unknown"; reason: string }
    | null
  >(null);
  useEffect(() => {
    setChecked(false);
    setCover(null);
    const c = ask?.coverCheck;
    if (!c) return;
    let cancelled = false;
    setCover({ state: "loading" });
    (async () => {
      const { readAdAccountLiveBalance } = await import(
        "@/actions/withdrawal-actions"
      );
      const res = await readAdAccountLiveBalance(c.accountId);
      if (cancelled) return;
      if (!res.ok) {
        setCover({ state: "unknown", reason: res.error });
      } else if (res.data.available) {
        setCover({
          state: "known",
          amount: res.data.amount,
          currency: res.data.currency,
        });
      } else {
        setCover({ state: "unknown", reason: res.data.reason });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ask]);
  // Cleared whenever a different question is asked, so last refusal's
  // sentence cannot be submitted against this row.
  useEffect(() => {
    setReason("");
  }, [ask]);

  return (
    <ConfirmModal
      open={!!ask}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={ask?.title ?? ""}
      lead={ask?.lead}
      cta={ask?.cta ?? "Confirm"}
      tone={ask?.danger ? "danger" : "default"}
      busy={busy}
      busyLabel="Working…"
      // Close FIRST, then act. Left open, the operator working a queue saw
      // the same dialog after every approval, blocking the page with its
      // button re-enabled — and a second press re-fired the mutation on a
      // row that was already approved, producing a red "Approve failed"
      // toast for an action that had succeeded. psm-subscriptions.tsx does
      // it in this order; this copy did not.
      disabled={
        (needsReason && !reason.trim()) || (!!ask?.coverCheck && !checked)
      }
      onConfirm={() => {
        const a = ask;
        const why = reason.trim();
        close();
        a?.run(why || undefined);
      }}
    >
      {(ask?.facts ?? []).map(([k, v]) => (
        <ConfirmFact key={k} label={k} value={v} strong={k === "Amount"} />
      ))}
      {ask?.coverCheck ? (
        <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">Balance at the platform</span>
            <span className="font-semibold tabular-nums">
              {cover?.state === "loading"
                ? "checking…"
                : cover?.state === "known"
                  ? formatCurrency(cover.amount, cover.currency)
                  : "not read"}
            </span>
          </div>
          {/* The arithmetic, stated. Not "probably fine" -- either the
              amount is covered by what the platform holds, or we do not
              know, and both are worth saying out loud before money
              leaves. */}
          <p className="mt-1 text-xs text-muted-foreground">
            {cover?.state === "known"
              ? // TWO CURRENCIES, COMPARED AS IF THEY WERE ONE. The
                // platform reports in ITS currency and the withdrawal is
                // in the account's; "Covered — €1,000.00 of $1,000.00"
                // was a true-looking sentence about a platform holding
                // about €872. Nothing here converts, and it must not
                // start: it says so instead.
                cover.currency !== ask.coverCheck.currency
                ? `The platform reports ${formatCurrency(cover.amount, cover.currency)} and this withdrawal is in ${ask.coverCheck.currency}. Nothing here converts one into the other — check it in the portal before approving.`
                : cover.amount + 0.0001 >= ask.coverCheck.amount
                  ? `Covered — ${formatCurrency(ask.coverCheck.amount, ask.coverCheck.currency)} of ${formatCurrency(cover.amount, cover.currency)}.`
                  : `SHORT by ${formatCurrency(ask.coverCheck.amount - cover.amount, ask.coverCheck.currency)}. Approving credits the wallet with money the platform does not hold.`
              : cover?.state === "unknown"
                ? `We could not read it: ${cover.reason}.`
                : "Asking the platform what it holds…"}
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              checked={checked}
              disabled={busy}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              <span className="font-medium">
                I have checked the balance myself
              </span>
              <span className="block text-muted-foreground">
                This amount really is on the account and can come back.
              </span>
            </span>
          </label>
        </div>
      ) : null}
      {ask?.reasonFor ? (
        <div className="mt-3">
          <RejectReasonField
            context={ask.reasonFor}
            value={reason}
            onChange={setReason}
            disabled={busy}
          />
        </div>
      ) : null}
    </ConfirmModal>
  );
}

// Admin Withdrawals, ported to the PSM mockup look. Three sections behind a
// segmented control (Withdrawals / Refunds / Adjustments). Every
// list read uses the same Supabase select the original panels used (reads are
// RLS-covered); every mutation reuses the existing server actions
// (withdrawal-actions / refund-actions / adjustment-actions)
// with identical payloads, toasts and cache invalidations. The two
// create/request forms are the original panel dialogs copied verbatim — same
// shadcn Dialog, same server-action calls — so money behaviour is unchanged.

type AdvertiserOption = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null; email: string | null } | null;
};

type Tab = "withdrawals" | "refunds" | "adjustments";

// "Reload to retry" is a sentence. On a screen that says "Approving moves
// money — verify", a failed read has to offer the button.
const emptyRow = (
  colSpan: number,
  msg: string,
  danger = false,
  retry?: () => void,
) => (
  <tr>
    <td
      colSpan={colSpan}
      style={{
        textAlign: "center",
        padding: 28,
        color: danger ? "var(--danger)" : "var(--txt-2)",
      }}
    >
      <div>{msg}</div>
      {retry ? (
        <button
          className="btn ghost sm"
          style={{ marginTop: 12 }}
          onClick={() => retry()}
        >
          Retry
        </button>
      ) : null}
    </td>
  </tr>
);

const loadingRow = (colSpan: number) => (
  <tr>
    <td colSpan={colSpan} style={{ textAlign: "center", padding: 28 }}>
      <Loader2 className="animate-spin" style={{ display: "inline" }} />
    </td>
  </tr>
);

/** A tab's own queue length. A dash, never a 0, for a count we could
 *  not read -- that is the difference between "nothing waiting" and
 *  "we could not ask". */
function QueueCount({ n }: { n: number | null }) {
  if (n === null) {
    return (
      <span className="badge pend" title="We couldn't read this queue">
        —
      </span>
    );
  }
  if (n <= 0) return null;
  return <span className="badge due">{n}</span>;
}

export default function PsmWithdrawals() {
  const [tab, setTab] = useState<Tab>("withdrawals");
  const pendingCounts = usePendingCounts();

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Withdrawals</h1>
          <p>
            Approving moves money — verify.
          </p>
        </div>
      </div>

      <div
        role="tablist"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        {/* ── EVERY TAB CARRIES ITS OWN COUNT ─────────────────────
            The sibling screen's tab bar says the rule out loud: "a tab
            that hides a queue with work in it is the only way this
            change could make things worse." These three carried none,
            and only the ACTIVE panel showed a badge -- so the screen
            opened on Withdrawals reading "1 pending" while the
            dashboard card, which sums all three tables, said 4. An
            admin concludes the dashboard is stale, or that the queue is
            done. A dash, never a 0, when a count could not be read. */}
        <SegBtn active={tab === "withdrawals"} onClick={() => setTab("withdrawals")}>
          <ArrowDownToLine /> Withdrawals{" "}
          <QueueCount n={pendingCounts.adAccountWithdrawals} />
        </SegBtn>
        <SegBtn active={tab === "refunds"} onClick={() => setTab("refunds")}>
          <RotateCcw /> Refunds <QueueCount n={pendingCounts.walletRefunds} />
        </SegBtn>
        <SegBtn
          active={tab === "adjustments"}
          onClick={() => setTab("adjustments")}
        >
          <SlidersHorizontal /> Adjustments{" "}
          <QueueCount n={pendingCounts.walletAdjustments} />
        </SegBtn>
      </div>

      {tab === "withdrawals" && <WithdrawalsSection />}
      {tab === "refunds" && <RefundsSection />}
      {tab === "adjustments" && <AdjustmentsSection />}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`btn sm${active ? "" : " ghost"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const badgeFor = (
  status: string,
  okSet: string[],
  pendSet: string[],
): "ok" | "pend" | "due" => {
  if (okSet.includes(status)) return "ok";
  if (pendSet.includes(status)) return "pend";
  return "due";
};

/* ------------------------------------------------------------------ */
/* Withdrawals — ad-account balance pulled back to the wallet.         */
/* ------------------------------------------------------------------ */

function WithdrawalsSection() {
  // Approve and Reject both ask first. See ActionAskModal above.
  const [ask, setAsk] = useState<ActionAsk | null>(null);
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ad-account-withdrawals", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_account_withdrawals")
        .select(
          "*, ad_account:ad_accounts(name, platform), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdAccountWithdrawal[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveAdAccountWithdrawal(id);
      if (!res.ok) throw new Error(res.error);
      return res.warning ?? null;
    },
    onSuccess: (warning) => {
      toast.success("Withdrawal approved — wallet credited");
      // The supplier side can refuse for reasons that are nobody's
      // fault — a manual account, a currency we will not convert, the
      // push gate closed. The wallet is credited either way, so this
      // is the admin's instruction to take the money off the ad
      // account by hand. Long, because it is an action, not a notice.
      if (warning) {
        toast.warning("Take it off the ad account by hand", {
          description: warning,
          duration: 20000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    // ── THE REASON THE RPC STORES, ACTUALLY SENT ──────────────────
    //
    // rejectAdAccountWithdrawal takes a reason and the RPC writes it;
    // this called it with ONE argument, so every refusal was recorded
    // with no reason and the customer -- who now gets a notification --
    // would have been told nothing but "no".
    mutationFn: async (vars: { id: string; reason?: string }) => {
      setActingId(vars.id);
      const res = await rejectAdAccountWithdrawal(vars.id, vars.reason);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Withdrawal rejected");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const rows = useMemo(() => {
    let list = data ?? [];
    if (status !== "all") list = list.filter((w) => w.status === status);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (w) =>
          (w.reference ?? "").toLowerCase().includes(q) ||
          (w.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
          (w.advertiser?.tenant_client_code ?? "")
            .toLowerCase()
            .includes(q) ||
          (w.ad_account?.name ?? "").toLowerCase().includes(q),
      );
    return list;
  }, [data, status, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="muted" style={{ margin: 0, fontSize: ".9rem" }}>
        Advertisers pull balance from an ad account back to their wallet.
        Approving credits their wallet immediately.
      </p>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, advertiser, account…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
// ── AN OPTION THAT MATCHES NOTHING IS NOT A FILTER ──────────────
// ad_account_withdrawals.status allows 'cancelled', but nothing in
// the app ever writes it: the only two writers are
// ad_account_withdrawal_approve (writes 'approved') and _reject
// (writes 'rejected'), and withdrawal-actions calls only those. So
// this option returned an empty list every single time, above an
// empty state that reads as "there are none" rather than "this
// filter cannot find any". Put it back the day something writes it.
                              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatus("all");
            setSearch("");
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Ref</th>
                <th>Advertiser</th>
                <th>Ad account</th>
                <th className="r">Amount</th>
                <th className="r">Status</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !tenantId
                ? loadingRow(6)
                : isError
                  ? emptyRow(
                      6,
                      (error as Error)?.message ??
                        "Failed to load withdrawals.",
                      true,
                      refetch,
                    )
                  : rows.length
                    ? rows.map((w) => (
                        <tr key={w.id}>
                          <td
                            className="mono"
                            style={{ fontSize: ".8rem" }}
                            data-label="Ref"
                          >
                            {w.reference ?? "—"}
                          </td>
                          <td data-label="Advertiser">
                            {/* Code first, name beneath. */}
                            <CustomerName
                              clientCode={w.advertiser?.tenant_client_code}
                              name={w.advertiser?.profile?.full_name}
                              full
                            />
                          </td>
                          <td data-label="Ad account">
                            <div>{w.ad_account?.name ?? "—"}</div>
                            <div
                              className="muted"
                              style={{
                                fontSize: ".78rem",
                                textTransform: "capitalize",
                              }}
                            >
                              {w.ad_account?.platform ?? ""}
                            </div>
                          </td>
                          <td
                            className="r mono"
                            style={{ fontWeight: 700 }}
                            data-label="Amount"
                          >
                            {formatCurrency(Number(w.amount), w.currency)}
                          </td>
                          <td className="r" data-label="Status">
                            <span
                              className={`badge ${badgeFor(
                                w.status,
                                ["approved"],
                                ["pending"],
                              )}`}
                              style={{ textTransform: "capitalize" }}
                            >
                              {w.status}
                            </span>
                          </td>
                          <td className="r" data-label="Action">
                            {w.status === "pending" ? (
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: 8,
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  className="btn ghost sm"
                                  disabled={actingId === w.id}
                                  onClick={() =>
                                    setAsk({
                                      title: "Reject this withdrawal?",
                                      lead: "There is no way back: the request is closed for good and the customer has to file a new one.",
                                      cta: "Yes, reject it",
                                      danger: true,
                                      facts: [
                                        [
                                          "Customer",
                                          w.advertiser?.tenant_client_code ?? "—",
                                        ],
                                        ["Ad account", w.ad_account?.name ?? "—"],
                                        [
                                          "Amount",
                                          formatCurrency(
                                            Number(w.amount),
                                            w.currency,
                                          ),
                                        ],
                                      ],
                                      reasonFor: "withdrawal",
                                      run: (why) =>
                                        reject.mutate({ id: w.id, reason: why }),
                                    })
                                  }
                                >
                                  Reject
                                </button>
                                <button
                                  className="btn sm"
                                  disabled={actingId === w.id}
                                  onClick={() =>
                                    setAsk({
                                      title: "Approve this withdrawal?",
                                      lead: "It credits the customer's wallet straight away, and it cannot be undone from this screen.",
                                      cta: "Yes, approve it",
                                      facts: [
                                        [
                                          "Customer",
                                          w.advertiser?.tenant_client_code ?? "—",
                                        ],
                                        ["Ad account", w.ad_account?.name ?? "—"],
                                        [
                                          "Amount",
                                          formatCurrency(
                                            Number(w.amount),
                                            w.currency,
                                          ),
                                        ],
                                      ],
                                      coverCheck: w.ad_account_id
                                        ? {
                                            accountId: String(w.ad_account_id),
                                            amount: Number(w.amount),
                                            currency: w.currency,
                                          }
                                        : undefined,
                                      run: () => approve.mutate(w.id),
                                    })
                                  }
                                >
                                  {actingId === w.id ? "…" : "Approve"}
                                </button>
                              </div>
                            ) : (
                              <span
                                className="muted"
                                style={{ fontSize: ".8rem" }}
                              >
                                {w.reviewed_at
                                  ? new Date(
                                      w.reviewed_at,
                                    ).toLocaleDateString()
                                  : "—"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    : emptyRow(
                        6,
                        status !== "all" || search.trim()
                          ? "Nothing matches that filter or search — the queue itself may not be empty."
                          : "No withdrawal requests yet.",
                      )}
            </tbody>
          </table>
        </div>
      </div>

      <ActionAskModal
        ask={ask}
        close={() => setAsk(null)}
        busy={!!actingId}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Refunds — admin requests, tenant owner approves.                    */
/* ------------------------------------------------------------------ */

type RefundRow = {
  id: string;
  reference: string | null;
  amount: number;
  currency: "USD" | "EUR";
  status: string;
  reason: string | null;
  payout_details: string | null;
  payout_business_name: string | null;
  payout_address: string | null;
  payout_bank_currency: string | null;
  created_at: string;
  advertiser: AdvertiserOption | null;
};

function RefundsSection() {
  // Approve and Reject both ask first. See ActionAskModal above.
  const [ask, setAsk] = useState<ActionAsk | null>(null);
  const { profile, isSuperAdmin } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ["wallet-refunds", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_refunds")
        .select(
          "id, reference, amount, currency, status, reason, payout_details, payout_business_name, payout_address, payout_bank_currency, created_at, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RefundRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveWalletRefund(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund approved — wallet debited");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    mutationFn: async (vars: { id: string; reason?: string }) => {
      setActingId(vars.id);
      const res = await rejectWalletRefund(vars.id, vars.reason);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund rejected");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const list = rows ?? [];
  // A failed read gives an empty list, and an absent badge then says the
  // same thing an empty queue does. The tab bar above already shows an
  // em dash for an unreadable count; these two headers disagreed with it.
  const pendingCount = isError
    ? null
    : list.filter((r) => r.status === "pending").length;

  const filtered = useMemo(() => {
    let l = rows ?? [];
    if (status !== "all") l = l.filter((r) => r.status === status);
    const q = search.trim().toLowerCase();
    if (q)
      l = l.filter(
        (r) =>
          (r.reference ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.tenant_client_code ?? "").toLowerCase().includes(q) ||
          (r.payout_business_name ?? "").toLowerCase().includes(q),
      );
    return l;
  }, [rows, status, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <p className="muted" style={{ margin: 0, fontSize: ".9rem", flex: 1 }}>
          When a customer leaves, refund their wallet balance to their bank. An
          admin requests it; the tenant owner approves.
        </p>
        {pendingCount === null ? (
          <span className="badge pend" title="We couldn't read this queue">
            &mdash;
          </span>
        ) : pendingCount > 0 ? (
          <span className="badge pend">{pendingCount} pending</span>
        ) : null}
        <button className="btn sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Request refund
        </button>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, advertiser, payee…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatus("all");
            setSearch("");
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Ref</th>
                <th>Advertiser</th>
                <th className="r">Amount</th>
                <th>Payout to</th>
                <th className="r">Status</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !tenantId
                ? loadingRow(6)
                : filtered.length
                  ? filtered.map((r) => (
                      <tr key={r.id}>
                        <td
                          className="mono"
                          style={{ fontSize: ".8rem" }}
                          data-label="Ref"
                        >
                          {r.reference ?? "—"}
                        </td>
                        <td data-label="Advertiser">
                            {/* Code first, name beneath. */}
                            <CustomerName
                              clientCode={r.advertiser?.tenant_client_code}
                              name={r.advertiser?.profile?.full_name}
                              full
                            />
                          </td>
                        <td
                          className="r mono"
                          style={{ fontWeight: 700 }}
                          data-label="Amount"
                        >
                          {formatCurrency(Number(r.amount), r.currency)}
                        </td>
                        <td
                          style={{
                            maxWidth: 240,
                            fontSize: ".8rem",
                            color: "var(--txt-2)",
                          }}
                          data-label="Payout to"
                        >
                          {r.payout_business_name || r.payout_details ? (
                            <div>
                              {r.payout_business_name && (
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--ink)",
                                  }}
                                >
                                  {r.payout_business_name}
                                </div>
                              )}
                              {r.payout_address && (
                                <div
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {r.payout_address}
                                </div>
                              )}
                              {r.payout_details && (
                                <div
                                  className="mono"
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {r.payout_details}
                                  {r.payout_bank_currency
                                    ? ` · ${r.payout_bank_currency}`
                                    : ""}
                                </div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="r" data-label="Status">
                          <span
                            className={`badge ${badgeFor(
                              r.status,
                              ["approved"],
                              ["pending"],
                            )}`}
                            style={{ textTransform: "capitalize" }}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="r" data-label="Action">
                          {r.status === "pending" && isSuperAdmin ? (
                            <div
                              style={{
                                display: "inline-flex",
                                gap: 8,
                                justifyContent: "flex-end",
                              }}
                            >
                              <button
                                className="btn ghost sm"
                                disabled={actingId === r.id}
                                onClick={() =>
                                  setAsk({
                                    title: "Reject this refund request?",
                                    lead: "There is no way back: the request is closed for good and the customer has to file a new one.",
                                    cta: "Yes, reject it",
                                    danger: true,
                                    facts: [
                                      ["Customer", r.advertiser?.tenant_client_code ?? "—"],
                                      ["Amount", formatCurrency(Number(r.amount), r.currency)],
                                    ],
                                    reasonFor: "withdrawal",
                                    run: (why) =>
                                      reject.mutate({ id: r.id, reason: why }),
                                  })
                                }
                              >
                                Reject
                              </button>
                              <button
                                className="btn sm"
                                disabled={actingId === r.id}
                                onClick={() =>
                                  setAsk({
                                    title: "Approve this refund?",
                                    lead: "It debits the customer's wallet straight away, and it cannot be undone from this screen.",
                                    cta: "Yes, approve it",
                                    facts: [
                                      ["Customer", r.advertiser?.tenant_client_code ?? "—"],
                                      ["Amount", formatCurrency(Number(r.amount), r.currency)],
                                      // The wallet is debited in one
                                      // currency and the bank is paid in
                                      // another. Naming only the first is
                                      // how EUR 5,000 gets wired as
                                      // HKD 5,000 — about a tenth of it.
                                      ...(r.payout_bank_currency &&
                                      String(r.payout_bank_currency).toUpperCase() !==
                                        String(r.currency).toUpperCase()
                                        ? ([
                                            [
                                              "Pay out in",
                                              `${String(r.payout_bank_currency).toUpperCase()} — convert ${formatCurrency(Number(r.amount), r.currency)} at today's rate yourself; this app does not`,
                                            ],
                                          ] as Array<[string, string]>)
                                        : []),
                                    ],
                                    run: () => approve.mutate(r.id),
                                  })
                                }
                              >
                                {actingId === r.id ? "…" : "Approve"}
                              </button>
                            </div>
                          ) : r.status === "pending" ? (
                            <span className="muted" style={{ fontSize: ".8rem" }}>
                              awaiting owner
                            </span>
                          ) : (
                            <span
                              className="muted"
                              style={{
                                fontSize: ".8rem",
                                textTransform: "capitalize",
                              }}
                            >
                              {r.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  : emptyRow(
                      6,
                      // A failed read is not an empty queue. Saying "no
                      // refund requests yet" when the query errored tells an
                      // admin there is nothing waiting — which is the one
                      // thing it cannot know. The Withdrawals section in this
                      // same file already got this right; these two did not.
                      isError
                        ? "Couldn't load refund requests — this is NOT an empty queue."
                        : status !== "all" || search.trim()
                          ? "Nothing matches that filter or search — the queue itself may not be empty."
                          : "No refund requests yet.",
                      isError,
                      isError ? refetch : undefined,
                    )}
            </tbody>
          </table>
        </div>
      </div>

      <RefundRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
      />

      <ActionAskModal
        ask={ask}
        close={() => setAsk(null)}
        busy={!!actingId}
      />
    </div>
  );
}

// Copied verbatim from components/withdrawals/refund-panel.tsx so the refund
// request flow (payload, validation, server action) is byte-identical.
function RefundRequestDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
}) {
  const queryClient = useQueryClient();
  const [advertiserId, setAdvertiserId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
  const [reason, setReason] = useState("");
  const [payoutDetails, setPayoutDetails] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [bankCurrency, setBankCurrency] = useState<"USD" | "EUR" | "HKD">("EUR");

  // ── EVERY FIELD, EVERY OPEN ─────────────────────────────────────────
  //
  // This dialog is mounted unconditionally, so its state survives a
  // close. The success path cleared the amount and the payout fields and
  // left `currency` and `bankCurrency` alone; Cancel cleared nothing at
  // all. Both of those cost money.
  //
  //   Raise a EUR 1,000 refund for one customer. Open it again for a
  //   customer leaving with USD 1,000 and no euros, type 1000, submit.
  //   It is raised as EUR 1,000: the approval drives eur_balance to
  //   -1,000 while the dollars sit untouched, and the payout instruction
  //   is for about $1,163 — more than that customer's entire balance.
  //
  //   Worse on Cancel: paste one customer's IBAN and business name,
  //   press Cancel, open it later for somebody else, and their refund
  //   carries the first customer's bank details. The money is wired to
  //   the wrong account.
  //
  // Same shape the change-amount dialog already fixed for its refund
  // pill. A default that persists is not a default.
  const [primedFor, setPrimedFor] = useState(false);
  if (open && !primedFor) {
    setPrimedFor(true);
    setAdvertiserId("");
    setAmount("");
    setCurrency("USD");
    setReason("");
    setPayoutDetails("");
    setBusinessName("");
    setAddress("");
    setBankCurrency("EUR");
  }
  if (!open && primedFor) setPrimedFor(false);

  // ── AN EMPTY DROPDOWN IS NOT "NO CUSTOMERS" ──────────────────────
  //
  // isError was not destructured, so a refused read gave an empty list
  // and a permanently disabled button with no explanation -- on the
  // control that moves money back to a customer. And .limit(200) is a
  // silent cap: customer 201 simply could not be chosen, with nothing
  // saying why.
  const { data: advertisers, isError: advertisersError } = useQuery({
    queryKey: ["refund-advertisers", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select(
          "id, tenant_client_code, profile:user_profiles(full_name, email)",
        )
        .eq("tenant_id", tenantId)
        .order("tenant_client_code", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as AdvertiserOption[];
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await requestWalletRefund({
        advertiser_id: advertiserId,
        amount: Number(amount),
        currency,
        reason: reason.trim() || undefined,
        payout_details: payoutDetails.trim() || undefined,
        business_name: businessName.trim() || undefined,
        address: address.trim() || undefined,
        bank_currency: bankCurrency,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Refund requested — awaiting owner approval");
      queryClient.invalidateQueries({ queryKey: ["wallet-refunds"] });
      setAdvertiserId("");
      setAmount("");
      setReason("");
      setPayoutDetails("");
      setBusinessName("");
      setAddress("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't request refund", { description: e.message }),
  });

  const numeric = Number(amount);
  // WHERE THE MONEY GOES IS NOT OPTIONAL. The panel says "the owner uses
  // this to send the money", and the owner's approve dialog shows only
  // the customer and the amount -- so a refund approved with these empty
  // debits the wallet and leaves nobody an address to wire it to. There
  // is no edit path on wallet_refunds anywhere in the app.
  const valid =
    !!advertiserId &&
    Number.isFinite(numeric) &&
    numeric > 0 &&
    payoutDetails.trim().length > 3 &&
    businessName.trim().length > 1;

  return (
    // Not dismissable while the write is in flight -- Escape and the
    // corner X went straight past the disabled Cancel.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request refund</DialogTitle>
          <DialogDescription>
            Refund a leaving customer&apos;s wallet balance to their bank. The
            tenant owner approves before the wallet is debited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Advertiser</Label>
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    advertisersError
                      ? "Couldn't load customers"
                      : "Select advertiser"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(advertisers ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.profile?.full_name ?? a.profile?.email ?? a.id}
                    {a.tenant_client_code ? ` · ${a.tenant_client_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="rf-amount">Amount</Label>
              <Input
                id="rf-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rf-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="rf-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rf-reason">Reason (optional)</Label>
            <Input
              id="rf-reason"
              placeholder="e.g. customer closing account"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Where to pay — the owner uses this to send the money
            </p>
            <div className="space-y-2">
              <Label htmlFor="rf-biz">Business name</Label>
              <Input
                id="rf-biz"
                placeholder="Account holder / company name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rf-addr">Address</Label>
              <Input
                id="rf-addr"
                placeholder="Street, city, country"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="rf-payout">IBAN / bank account</Label>
                <Input
                  id="rf-payout"
                  placeholder="IBAN or account number"
                  value={payoutDetails}
                  onChange={(e) => setPayoutDetails(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rf-bankcur">Bank currency</Label>
                <Select
                  value={bankCurrency}
                  onValueChange={(v: "USD" | "EUR" | "HKD") =>
                    setBankCurrency(v)
                  }
                >
                  <SelectTrigger id="rf-bankcur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="HKD">HKD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The wallet is debited in {currency}; the customer&apos;s account
              can be a different currency (the owner converts on payout).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? "Requesting…" : "Request refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Adjustments — admin requests a +/- correction, owner approves.      */
/* ------------------------------------------------------------------ */

type AdjRow = {
  id: string;
  reference: string | null;
  delta: number;
  currency: "USD" | "EUR";
  status: string;
  reason: string | null;
  created_at: string;
  advertiser: AdvertiserOption | null;
};

function AdjustmentsSection() {
  // Approve and Reject both ask first. See ActionAskModal above.
  const [ask, setAsk] = useState<ActionAsk | null>(null);
  const { profile, isSuperAdmin } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ["wallet-adjustments", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_adjustments")
        .select(
          "id, reference, delta, currency, status, reason, created_at, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AdjRow[];
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await approveWalletAdjustment(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Adjustment approved — wallet updated");
      queryClient.invalidateQueries({ queryKey: ["wallet-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Approve failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const reject = useMutation({
    mutationFn: async (vars: { id: string; reason?: string }) => {
      setActingId(vars.id);
      const res = await rejectWalletAdjustment(vars.id, vars.reason);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Adjustment rejected");
      queryClient.invalidateQueries({ queryKey: ["wallet-adjustments"] });
    },
    onError: (e: Error) =>
      toast.error("Reject failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const list = rows ?? [];
  // A failed read gives an empty list, and an absent badge then says the
  // same thing an empty queue does. The tab bar above already shows an
  // em dash for an unreadable count; these two headers disagreed with it.
  const pendingCount = isError
    ? null
    : list.filter((r) => r.status === "pending").length;

  const filtered = useMemo(() => {
    let l = rows ?? [];
    if (status !== "all") l = l.filter((r) => r.status === status);
    const q = search.trim().toLowerCase();
    if (q)
      l = l.filter(
        (r) =>
          (r.reference ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
          (r.advertiser?.tenant_client_code ?? "").toLowerCase().includes(q) ||
          (r.reason ?? "").toLowerCase().includes(q),
      );
    return l;
  }, [rows, status, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <p className="muted" style={{ margin: 0, fontSize: ".9rem", flex: 1 }}>
          Request a correction to a customer&apos;s wallet balance. An admin
          raises it; the tenant owner approves before the balance changes.
        </p>
        {pendingCount === null ? (
          <span className="badge pend" title="We couldn't read this queue">
            &mdash;
          </span>
        ) : pendingCount > 0 ? (
          <span className="badge pend">{pendingCount} pending</span>
        ) : null}
        <button className="btn sm" onClick={() => setCreateOpen(true)}>
          <Plus /> Request adjustment
        </button>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, advertiser, reason…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatus("all");
            setSearch("");
          }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Ref</th>
                <th>Advertiser</th>
                <th className="r">Change</th>
                <th>Reason</th>
                <th className="r">Status</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !tenantId
                ? loadingRow(6)
                : filtered.length
                  ? filtered.map((r) => {
                      const positive = Number(r.delta) > 0;
                      return (
                        <tr key={r.id}>
                          <td
                            className="mono"
                            style={{ fontSize: ".8rem" }}
                            data-label="Ref"
                          >
                            {r.reference ?? "—"}
                          </td>
                          <td data-label="Advertiser">
                            {/* Code first, name beneath. */}
                            <CustomerName
                              clientCode={r.advertiser?.tenant_client_code}
                              name={r.advertiser?.profile?.full_name}
                              full
                            />
                          </td>
                          <td
                            className="r mono"
                            style={{
                              fontWeight: 700,
                              color: positive
                                ? "var(--win)"
                                : "var(--warn)",
                            }}
                            data-label="Change"
                          >
                            {positive ? "+" : "−"}
                            {formatCurrency(
                              Math.abs(Number(r.delta)),
                              r.currency,
                            )}
                          </td>
                          <td
                            className="muted"
                            style={{
                              maxWidth: 220,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            data-label="Reason"
                          >
                            {r.reason ?? "—"}
                          </td>
                          <td className="r" data-label="Status">
                            <span
                              className={`badge ${badgeFor(
                                r.status,
                                ["approved"],
                                ["pending"],
                              )}`}
                              style={{ textTransform: "capitalize" }}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="r" data-label="Action">
                            {r.status === "pending" && isSuperAdmin ? (
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: 8,
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  className="btn ghost sm"
                                  disabled={actingId === r.id}
                                  onClick={() =>
                                    setAsk({
                                      title: "Reject this adjustment?",
                                      lead: "There is no way back: the adjustment is closed for good and has to be raised again from scratch.",
                                      cta: "Yes, reject it",
                                      danger: true,
                                      facts: [
                                        ["Customer", r.advertiser?.tenant_client_code ?? "—"],
                                        [
                                          "Change",
                                          `${Number(r.delta) > 0 ? "+" : ""}${formatCurrency(Number(r.delta), r.currency)}`,
                                        ],
                                      ],
                                      reasonFor: "withdrawal",
                                      run: (why) =>
                                        reject.mutate({ id: r.id, reason: why }),
                                    })
                                  }
                                >
                                  Reject
                                </button>
                                <button
                                  className="btn sm"
                                  disabled={actingId === r.id}
                                  onClick={() =>
                                    setAsk({
                                      title: "Approve this adjustment?",
                                      lead: "It moves the customer's balance straight away, and it cannot be undone from this screen.",
                                      cta: "Yes, approve it",
                                      facts: [
                                        ["Customer", r.advertiser?.tenant_client_code ?? "—"],
                                        [
                                          "Change",
                                          `${Number(r.delta) > 0 ? "+" : ""}${formatCurrency(Number(r.delta), r.currency)}`,
                                        ],
                                      ],
                                      run: () => approve.mutate(r.id),
                                    })
                                  }
                                >
                                  {actingId === r.id ? "…" : "Approve"}
                                </button>
                              </div>
                            ) : r.status === "pending" ? (
                              <span
                                className="muted"
                                style={{ fontSize: ".8rem" }}
                              >
                                awaiting owner
                              </span>
                            ) : (
                              <span
                                className="muted"
                                style={{
                                  fontSize: ".8rem",
                                  textTransform: "capitalize",
                                }}
                              >
                                {r.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  : emptyRow(
                      6,
                      isError
                        ? "Couldn't load adjustment requests — this is NOT an empty queue."
                        : status !== "all" || search.trim()
                          ? "Nothing matches that filter or search — the queue itself may not be empty."
                          : "No adjustment requests yet.",
                      isError,
                      isError ? refetch : undefined,
                    )}
            </tbody>
          </table>
        </div>
      </div>

      <AdjustmentRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
      />

      <ActionAskModal
        ask={ask}
        close={() => setAsk(null)}
        busy={!!actingId}
      />
    </div>
  );
}

// Copied verbatim from components/withdrawals/adjustment-panel.tsx so the
// direction→delta computation, payload and server action are byte-identical.
function AdjustmentRequestDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
}) {
  const queryClient = useQueryClient();
  const [advertiserId, setAdvertiserId] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
  const [reason, setReason] = useState("");

  // ── THE DIRECTION IS THE MOST IMPORTANT FIELD, AND IT PERSISTED ─────
  //
  // The reset cleared the advertiser, the amount and the reason, and
  // left `direction` and `currency` where the last request put them. So
  // removing $500 from one customer and then opening the dialog to
  // CREDIT another $200 sends delta = -200: the wallet goes down $200
  // instead of up, a $400 swing against a balance that was meant to
  // rise, on a screen whose whole purpose is correcting a balance.
  const [primedFor, setPrimedFor] = useState(false);
  if (open && !primedFor) {
    setPrimedFor(true);
    setAdvertiserId("");
    setDirection("add");
    setAmount("");
    setCurrency("USD");
    setReason("");
  }
  if (!open && primedFor) setPrimedFor(false);

  // ── AN EMPTY DROPDOWN IS NOT "NO CUSTOMERS" ──────────────────────
  //
  // isError was not destructured, so a refused read gave an empty list
  // and a permanently disabled button with no explanation -- on the
  // control that moves money back to a customer. And .limit(200) is a
  // silent cap: customer 201 simply could not be chosen, with nothing
  // saying why.
  const { data: advertisers, isError: advertisersError } = useQuery({
    queryKey: ["adjustment-advertisers", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select(
          "id, tenant_client_code, profile:user_profiles(full_name, email)",
        )
        .eq("tenant_id", tenantId)
        .order("tenant_client_code", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as AdvertiserOption[];
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const magnitude = Number(amount);
      const delta = direction === "add" ? magnitude : -magnitude;
      const res = await requestWalletAdjustment({
        advertiser_id: advertiserId,
        delta,
        currency,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Adjustment requested — awaiting owner approval");
      queryClient.invalidateQueries({ queryKey: ["wallet-adjustments"] });
      setAdvertiserId("");
      setAmount("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't request adjustment", { description: e.message }),
  });

  const numeric = Number(amount);
  const valid = !!advertiserId && Number.isFinite(numeric) && numeric > 0;

  return (
    // Not dismissable while the write is in flight -- Escape and the
    // corner X went straight past the disabled Cancel.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request balance adjustment</DialogTitle>
          <DialogDescription>
            Correct a customer&apos;s wallet balance. The tenant owner approves
            before the change is applied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Advertiser</Label>
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    advertisersError
                      ? "Couldn't load customers"
                      : "Select advertiser"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(advertisers ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.profile?.full_name ?? a.profile?.email ?? a.id}
                    {a.tenant_client_code ? ` · ${a.tenant_client_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v: "add" | "remove") => setDirection(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add (+)</SelectItem>
                  <SelectItem value="remove">Remove (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adj-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="adj-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-amount">Amount</Label>
            <Input
              id="adj-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-reason">Reason</Label>
            <Input
              id="adj-reason"
              placeholder="Why this correction is needed"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? "Requesting…" : "Request adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
