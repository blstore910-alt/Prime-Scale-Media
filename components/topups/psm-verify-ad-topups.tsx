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
import { landedOnAccount } from "@/lib/pure-topup-landed";

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

// ── THE CLIENT CODE IS THE NAME, ON THIS SCREEN ─────────────────────
//
// top_ups_view returns FLAT columns, not a nested advertiser object —
// the same trap `account_name` fell into one function up. So
// `t.advertiser?.profile?.full_name` was undefined on every row and
// every card in the queue was headed with the literal word
// "Advertiser", on the screen where an admin picks WHICH customer's
// money to release.
//
// And the code comes first. PSM0005 is what the bank reference, the
// invoice, the slip and every other screen carry; the person's name is
// how you recognise them once you have found the right row. Big code,
// smaller name underneath.
const flat = (t: Topup, key: string): string => {
  const v = (t as unknown as Record<string, unknown>)[key];
  return v === null || v === undefined ? "" : String(v).trim();
};

const advCode = (t: Topup) => {
  const a = t.advertiser as { tenant_client_code?: string } | undefined;
  return flat(t, "tenant_client_code") || a?.tenant_client_code || "";
};

const advPerson = (t: Topup) => {
  const a = t.advertiser as
    | { name?: string; profile?: { full_name?: string } }
    | undefined;
  return (
    flat(t, "advertiser_name") ||
    flat(t, "full_name") ||
    flat(t, "advertiser_full_name") ||
    a?.profile?.full_name ||
    a?.name ||
    ""
  );
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

  const shownCount = (topups ?? []).length;
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
            const landed = landedOnAccount(t);
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
                    {advCode(t) ? (
                      <div
                        style={{
                          fontFamily: "var(--font-jakarta)",
                          fontWeight: 800,
                          fontSize: "1.05rem",
                          letterSpacing: "-0.01em",
                        }}
                      >
                        <CopyText value={advCode(t)} what="client code" />
                      </div>
                    ) : null}
                    {advPerson(t) ? (
                      <div
                        style={{
                          color: "var(--txt-2)",
                          fontSize: ".85rem",
                          fontWeight: 500,
                        }}
                      >
                        {advPerson(t)}
                      </div>
                    ) : null}
                    {!advCode(t) && !advPerson(t) ? (
                      <div style={{ fontWeight: 700 }}>Customer unknown</div>
                    ) : null}
                    <div
                      style={{
                        color: "var(--txt-2)",
                        fontSize: ".9rem",
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      {/* top_ups_view returns a FLAT account_name column,
                          not a nested account object — so `t.account?.name`
                          was undefined on every row and this line read
                          "Ad account" for all of them, on the screen where
                          an admin picks WHICH account to fund. */}
                      <CopyText value={accountName(t)} what="account name" />
                    </div>
                    <div style={{ color: "var(--faint)", fontSize: ".78rem" }}>
                      #{t.number}
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
                  {/* THREE figures, and the currency depends on who
                      filed the row. An ad account HAS a currency:
                      AA-PSM0005-EU-01 is a euro account, euros go on it
                      and euros come off it, and there is no dollar
                      figure anywhere in its life. The customer's own RPC
                      takes the fee in the payment currency and stores
                      the net there; only the ADMIN paths convert to USD
                      first (calculateTopupAmount). Forcing "USD" here
                      was right for admin rows and wrong for every row a
                      customer filed — seen on production as "$97.00"
                      beside a dialog that had just promised "$111.19",
                      for EUR 97.00 landing on a euro account.
                      landedOnAccount tells the two apart on topup_usd,
                      which only the customer path writes. */}
                  <b
                    style={{
                      fontFamily: "var(--font-jakarta)",
                      fontWeight: 800,
                      fontSize: "1.35rem",
                    }}
                    title="Credited to the ad account"
                  >
                    {money(landed.amount, landed.currency)}
                  </b>
                  <span style={{ color: "var(--faint)", fontSize: ".82rem" }}>
                    paid {money(t.amount_received, cur)} · fee{" "}
                    {money(t.fee_amount, landed.currency)}
                  </span>
                </div>
                {/* The supplier line sits ABOVE the buttons, on its own
                    row: it is context for the decision, not one of the
                    choices, and mixing it in made a four-item row that
                    wrapped differently on every card. */}
                {pend ? (
                  <div style={{ marginTop: 12 }}>
                    <SupplierPill link={supplierFor(t.account_id)} />
                  </div>
                ) : null}
                {/* All the buttons on ONE row, and they stay on it. */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 10,
                    flexWrap: "nowrap",
                    alignItems: "center",
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
