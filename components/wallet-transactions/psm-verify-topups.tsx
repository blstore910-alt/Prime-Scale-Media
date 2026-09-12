"use client";

import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import { prechargeTopup } from "@/actions/precharge-actions";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Search, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useWalletTransactions from "./use-wallet-transactions";
import WalletTransactionApproveDialog from "./wallet-transaction-approve-dialog";
import WalletTransactionDetailsSheet from "./wallet-transaction-details-sheet";
import WalletTransactionRejectDialog from "./wallet-transaction-reject-dialog";
import PaymentSlipDialog from "./payment-slip-dialog";
import { useAdvertiserCommunities } from "@/hooks/use-advertiser-communities";
import { CommunityPill } from "@/components/community/community-pill";

const money = (v: number | string | null | undefined, cur: string | null) =>
  (cur === "USD" ? "$" : "€") +
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));

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
  const queryClient = useQueryClient();

  const doPrecharge = async (t: WalletTopupWithAdvertiser) => {
    setPrechargingId(t.id);
    try {
      const res = await prechargeTopup(t.id);
      if (!res.ok) throw new Error(res.error);
      toast.success("Precharged — wallet credited in advance");
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
    } catch (e) {
      toast.error("Precharge failed", {
        description: e instanceof Error ? e.message : undefined,
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

  const { transactions, isLoading } = useWalletTransactions({
    status,
    currency,
    search: debounced,
    page,
    perPage,
  });

  const { mutate: updateTransaction, isPending } = useUpdateTransaction(
    selected ?? ({} as WalletTopupWithAdvertiser),
  );

  const communities = useAdvertiserCommunities(
    transactions.map((t) => t.advertiser_id),
  );

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
      <div className="phead">
        <div>
          <h1>Wallet Topups</h1>
          <p>Bank transfers awaiting verification — check against the bank before crediting.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference…"
          />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="all">All statuses</option>
        </select>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="all">All currencies</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </select>
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
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      {advName(t)}
                      <CommunityPill name={communities[t.advertiser_id ?? ""]} />
                    </div>
                    <div
                      className="mono"
                      style={{ color: "var(--faint)", fontSize: ".8rem" }}
                    >
                      {t.reference_no ?? "—"}
                    </div>
                  </div>
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
                <div
                  style={{
                    color: "var(--faint)",
                    fontSize: ".82rem",
                    marginTop: 2,
                  }}
                >
                  Bank transfer
                </div>
                {(pend || t.payment_slip) && (
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    {pend && (
                      <>
                        <button
                          className="btn sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(t);
                            setApproveOpen(true);
                          }}
                        >
                          <Check /> Verify
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(t);
                            setRejectOpen(true);
                          }}
                        >
                          <X /> Reject
                        </button>
                        <button
                          className="btn ghost sm"
                          disabled={prechargingId === t.id}
                          title="Advance-credit the wallet now; settles on verify"
                          onClick={(e) => {
                            e.stopPropagation();
                            doPrecharge(t);
                          }}
                        >
                          <Zap /> Precharge
                        </button>
                      </>
                    )}
                    {t.payment_slip && (
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
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No wallet topups to show.
          </p>
        </div>
      )}

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
    </div>
  );
}
