"use client";

import { Topup } from "@/lib/types/topup";
import PsmSortFilter from "@/components/psm/sort-filter";
import { Check, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import useTopups from "./use-topups";
import VerifyTopupDialog from "./verify-topup-dialog";
import RejectTopupDialog from "./reject-topup-dialog";
import { TopupDetailsSheet } from "./topup-details-sheet";
import TablePagination from "../ui/table-pagination";
import { useSupplierLinks } from "@/hooks/use-supplier-link";
import SupplierPill, { SUPPLIER_PILL_CSS } from "./supplier-pill";
import { CopyText } from "@/components/ui/copy-text";

// A two-way map printed everything that was not USD as euros, and
// calculateTopupAmount accepts GBP and HKD too — so a pound payment was
// shown with a euro sign. An unknown code prints as a code; a wrong symbol
// is worse than a plain one.
const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", HKD: "HK$" };
const money = (v: number | string | null | undefined, cur: string | null) => {
  const code = (cur || "").toUpperCase();
  const sym = SYMBOL[code] ?? (code ? code + " " : "");
  return (
    sym +
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(v ?? 0))
  );
};

// top_ups_view is a VIEW: `select *` returns flat columns, so the
// account arrives as `account_name` and not as a nested object. Both are
// read here because the advertiser-scoped query selects the flat column
// explicitly and the type still declares the nested one.
const accountName = (t: Topup) => {
  const flat = (t as unknown as { account_name?: string | null }).account_name;
  return (
    (flat && String(flat).trim()) || t.account?.name || "Ad account"
  );
};

// ── THE BM ID, WHEREVER IT HAPPENS TO BE ────────────────────────────
//
// This is the screen where an admin funds an account by hand in a
// supplier's dashboard, so the Business Manager id is the value they
// carry across -- and it was nowhere on the card. Both shapes are
// read: top_ups_view is a VIEW whose columns are hand-authored on live
// and may or may not expose account_bm_id, and the nested object is
// what the typed query gives. Neither present means the line is simply
// not drawn -- never a query that can throw on a column that does not
// exist yet.
const accountBmId = (t: Topup) => {
  const flat = (t as unknown as { account_bm_id?: string | number | null })
    .account_bm_id;
  const nested = (t.account as unknown as { bm_id?: string | number | null } | undefined)
    ?.bm_id;
  const raw = flat ?? nested;
  const s = raw == null ? "" : String(raw).trim();
  return s.length > 0 ? s : null;
};

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

  // ── WHERE THIS ONE IS ACTUALLY FUNDED ──────────────────────────────
  //
  // Only one ad-account type tops up over the API; the rest are done by
  // hand in the supplier's own dashboard. This screen is where an admin
  // decides to do that, and it did not say which supplier — so the
  // mapping lived in one person's head. Resolved for the accounts on
  // this page in one read.
  const { supplierFor } = useSupplierLinks(
    (topups ?? []).map((t: Topup) => String(t.account_id ?? "")),
  );

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <style>{SUPPLIER_PILL_CSS}</style>
      <div className="phead">
        <div>
          <h1>Ad-account Topups</h1>
          <p>Wallet → ad account.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search top-ups…"
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
                { value: "completed", label: "Completed" },
                // There was no way to list the rejected ones at all, so
                // they sat in "All statuses" — until a moment ago wearing
                // the same green as a verified payment.
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
                      {/* top_ups_view returns a FLAT account_name column,
                          not a nested account object — so `t.account?.name`
                          was undefined on every row and this line read
                          "Ad account" for all of them, on the screen where
                          an admin picks WHICH account to fund. */}
                      <CopyText
                        value={accountName(t)}
                        what="account name"
                      />{" "}
                      · #{t.number}
                    </div>
                    {accountBmId(t) ? (
                      <div style={{ color: "var(--faint)", fontSize: ".76rem" }}>
                        BM{" "}
                        <CopyText value={accountBmId(t)} what="BM ID" mono />
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`badge ${
                        pend
                          ? "pend"
                          : t.status === "rejected" || t.status === "failed"
                            ? "due"
                            : t.status === "completed"
                              ? "ok"
                              : ""
                      }`}
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
                  {/* THREE figures, TWO currencies. topup_amount and
                      fee_amount are USD by construction — calculateTopupAmount
                      divides the received amount by the rate and takes the fee
                      off the dollar figure (lib/utils-pure.ts). Only
                      amount_received is in the currency the customer paid in.
                      Printing all of them with `cur` turned $1,139.53 into
                      "EUR 1,139.53" on the exact screen where an admin checks
                      the figures against a bank slip: ~16% out, in our favour,
                      on a decision to release money. */}
                  <b
                    style={{
                      fontFamily: "var(--font-jakarta)",
                      fontWeight: 800,
                      fontSize: "1.35rem",
                    }}
                    title="Credited to the ad account"
                  >
                    {money(t.topup_amount, "USD")}
                  </b>
                  <span style={{ color: "var(--faint)", fontSize: ".82rem" }}>
                    paid {money(t.amount_received, cur)} · fee{" "}
                    {money(t.fee_amount, "USD")}
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
                  {/* The supplier link sits with the decision, not in a
                      details sheet: this is the moment the admin goes to
                      do the top-up by hand. */}
                  {pend && <SupplierPill link={supplierFor(t.account_id)} />}
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
        <div className="card" style={{ display: "grid", gap: 10 }}>
          {/* A FILTERED QUEUE IS NOT AN EMPTY ONE. This said the same
              flat sentence whether nothing was waiting or the search
              simply missed — on the screen whose job is to say who is
              waiting on us. */}
          <p className="muted" style={{ margin: 0 }}>
            {status !== "all" || search.trim()
              ? "Nothing matches that search or filter — the queue itself may not be empty."
              : "No ad-account topups to show."}
          </p>
          {(status !== "all" || search.trim()) && (
            <button
              className="btn ghost sm"
              style={{ justifySelf: "start" }}
              onClick={() => {
                setStatus("all");
                setSearch("");
              }}
            >
              Clear filters
            </button>
          )}
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
