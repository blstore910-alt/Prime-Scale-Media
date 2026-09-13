"use client";

import { PLATFORMS } from "@/lib/constants";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { Eye, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useAdAccountRequests from "./use-ad-account-requests";
import AdAccountRequestReviewDialog from "./ad-account-request-review-dialog";
import AdAccountRequestRejectDialog from "./ad-account-request-reject-dialog";
import AdAccountRequestDetailsSheet from "./ad-account-request-details-sheet";
import CreateAdAccountFromRequestDialog from "./create-ad-account-from-request-dialog";
import CreateAdAccountRequestInvoiceDialog from "./create-ad-account-request-invoice-dialog";
import TablePagination from "../ui/table-pagination";

const platformLabel = (p: string | null) =>
  PLATFORMS.find((x) => x.value === p)?.label ?? p ?? "—";

const advName = (r: AdAccountRequest) => {
  const a = r.advertiser as
    | { name?: string; profile?: { full_name?: string } | null }
    | null
    | undefined;
  return a?.profile?.full_name || a?.name || "Advertiser";
};

const statusCls = (s: string | null) => {
  if (s === "live" || s === "approved" || s === "completed") return "ok";
  if (s === "rejected") return "due";
  return "pend";
};

// Admin ad-account requests queue, mockup look. Reuses the real data hook
// and the real review / reject / create-invoice / create-account dialogs
// (which carry the approve → BM / invoice logic) — presentation only.
export default function PsmRequests() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("newest");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 12;

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [requestForInvoiceCreation, setRequestForInvoiceCreation] =
    useState<AdAccountRequest | null>(null);
  const [requestForAccountCreation, setRequestForAccountCreation] =
    useState<AdAccountRequest | null>(null);
  const [requestToReject, setRequestToReject] =
    useState<AdAccountRequest | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, sort, statusFilter]);

  const { requests, isLoading, refetch, total } = useAdAccountRequests({
    search: debounced,
    sort,
    status: statusFilter,
    page,
    perPage,
  });

  // Status now filters server-side, so we no longer filter the fetched page
  // client-side (which hid pending requests on unreachable later pages).
  const rows = requests ?? [];

  const handleRejectRequest = async (reason: string) => {
    if (!requestToReject) return;
    setIsRejecting(true);
    try {
      const { rejectAdAccountRequest } = await import(
        "@/actions/ad-account-actions"
      );
      const result = await rejectAdAccountRequest(requestToReject.id, reason);
      if (!result.ok) throw new Error(result.error);
      toast.success("Ad account request rejected.");
      await queryClient.invalidateQueries({
        queryKey: ["ad-account-request-details", requestToReject.id],
      });
      setRequestToReject(null);
      await refetch();
    } catch (err) {
      toast.error("Unable to reject request", {
        description: err instanceof Error ? err.message : "Failed to reject.",
      });
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Account Requests</h1>
          <p>Approve to set up on our Business Manager (live in 3–12h).</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search requests…"
          />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Oldest</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="payment_pending">Payment pending</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : rows.length ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))",
            gap: 12,
          }}
        >
          {rows.map((r) => (
            <div key={r.id} className="card" style={{ padding: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{advName(r)}</div>
                  <div style={{ color: "var(--faint)", fontSize: ".8rem" }}>
                    {platformLabel(r.platform)} ·{" "}
                    {dayjs(r.created_at).format("D MMM")}
                  </div>
                </div>
                <span
                  className={`badge ${statusCls(r.status)}`}
                  style={{ marginLeft: "auto", textTransform: "capitalize" }}
                >
                  {(r.status ?? "pending").replace(/_/g, " ")}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  className="btn sm"
                  onClick={() => setSelectedRequestId(r.id)}
                >
                  Review
                </button>
                <button
                  className="btn ghost sm"
                  onClick={() => setDetailsId(r.id)}
                >
                  <Eye /> Details
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No account requests to show.
          </p>
        </div>
      )}

      {!isLoading && rows.length && total > perPage ? (
        <div className="my-4 px-4">
          <TablePagination
            page={page}
            total={total}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      ) : null}

      <AdAccountRequestReviewDialog
        requestId={selectedRequestId}
        open={selectedRequestId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRequestId(null);
        }}
        onCreateInvoice={setRequestForInvoiceCreation}
        onCreateAdAccount={setRequestForAccountCreation}
        onReject={setRequestToReject}
      />
      <CreateAdAccountRequestInvoiceDialog
        request={requestForInvoiceCreation}
        open={requestForInvoiceCreation !== null}
        onOpenChange={(open) => {
          if (!open) setRequestForInvoiceCreation(null);
        }}
      />
      <CreateAdAccountFromRequestDialog
        request={requestForAccountCreation}
        open={requestForAccountCreation !== null}
        onOpenChange={(open) => {
          if (!open) setRequestForAccountCreation(null);
        }}
      />
      <AdAccountRequestRejectDialog
        open={requestToReject !== null}
        onOpenChange={(open) => {
          if (!open) setRequestToReject(null);
        }}
        isSubmitting={isRejecting}
        onSubmit={handleRejectRequest}
      />
      <AdAccountRequestDetailsSheet
        requestId={detailsId}
        open={detailsId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
      />
    </div>
  );
}
