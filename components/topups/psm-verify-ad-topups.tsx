"use client";

import { Topup } from "@/lib/types/topup";
import { Check, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import useTopups from "./use-topups";
import VerifyTopupDialog from "./verify-topup-dialog";
import RejectTopupDialog from "./reject-topup-dialog";
import { TopupDetailsSheet } from "./topup-details-sheet";
import TablePagination from "../ui/table-pagination";

const money = (v: number | string | null | undefined, cur: string | null) =>
  (cur === "USD" ? "$" : "€") +
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));

const advName = (t: Topup) => {
  const a = t.advertiser as
    | { name?: string; profile?: { full_name?: string }; tenant_client_code?: string }
    | undefined;
  return a?.profile?.full_name || a?.name || a?.tenant_client_code || "Advertiser";
};

// Admin ad-account topup verify queue, ported to the mockup look. Reuses
// the real data hook (useTopups) and the real self-contained verify /
// reject / details dialogs (which carry the effective-fee logic) — money
// logic untouched, presentation only.
export default function PsmVerifyAdTopups() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 12;

  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, debounced]);

  const { topups, isLoading, total, isError, error, refetch } = useTopups({
    status,
    search: debounced,
    page,
    perPage,
  });

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Ad-account Topups</h1>
          <p>Wallet → ad account · verify pending with the effective fee.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search advertiser, code, number…"
          />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : topups?.length ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))",
            gap: 12,
          }}
        >
          {topups.map((t: Topup) => {
            const pend = t.status === "pending";
            const cur = t.currency;
            return (
              <div key={t.id} className="card" style={{ padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{advName(t)}</div>
                    <div style={{ color: "var(--faint)", fontSize: ".8rem" }}>
                      {t.account?.name ?? "Ad account"} · #{t.number}
                    </div>
                  </div>
                  <span
                    className={`badge ${pend ? "pend" : "ok"}`}
                    style={{ marginLeft: "auto", textTransform: "capitalize" }}
                  >
                    {t.status}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <b
                    style={{
                      fontFamily: "var(--font-jakarta)",
                      fontWeight: 800,
                      fontSize: "1.35rem",
                    }}
                  >
                    {money(t.topup_amount ?? t.amount_received, cur)}
                  </b>
                  <span style={{ color: "var(--faint)", fontSize: ".82rem" }}>
                    fee {money(t.fee_amount, cur)}
                  </span>
                </div>
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
                          setVerifyId(t.id);
                          setVerifyOpen(true);
                        }}
                      >
                        <Check /> Verify
                      </button>
                      <button
                        className="btn ghost sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRejectId(t.id);
                          setRejectOpen(true);
                        }}
                      >
                        <X /> Reject
                      </button>
                    </>
                  )}
                  <button
                    className="btn ghost sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailsId(t.id);
                    }}
                  >
                    Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : isError ? (
        /* A failed read must never look like an empty queue. */
        <div className="card">
          <p style={{ margin: 0, fontWeight: 600 }}>
            Couldn&apos;t load the ad-account top-ups.
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
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No ad-account topups to show.
          </p>
        </div>
      )}

      {!isLoading && topups?.length && total > perPage ? (
        <div className="my-4 px-4">
          <TablePagination
            page={page}
            total={total}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      ) : null}

      <VerifyTopupDialog
        topupId={verifyId}
        open={verifyOpen}
        setOpen={setVerifyOpen}
      />
      <RejectTopupDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        topupId={rejectId}
      />
      <TopupDetailsSheet
        open={!!detailsId}
        onOpenChange={(o) => !o && setDetailsId(null)}
        topupId={detailsId}
      />
    </div>
  );
}
