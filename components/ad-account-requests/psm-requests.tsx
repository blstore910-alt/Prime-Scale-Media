"use client";

import { PLATFORMS } from "@/lib/constants";
import { platformFamily, platformLabel } from "@/lib/pure-platform-badge";
import PsmSortFilter from "@/components/psm/sort-filter";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  Chrome,
  Clock,
  Eye,
  Infinity as InfinityIcon,
  Megaphone,
  Music2,
  Search,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useAdAccountRequests from "./use-ad-account-requests";
import AdAccountRequestReviewDialog from "./ad-account-request-review-dialog";
import AdAccountRequestRejectDialog from "./ad-account-request-reject-dialog";
import AdAccountRequestDetailsSheet from "./ad-account-request-details-sheet";
import CreateAdAccountFromRequestDialog from "./create-ad-account-from-request-dialog";
import CreateAdAccountRequestInvoiceDialog from "./create-ad-account-request-invoice-dialog";
import TablePagination from "../ui/table-pagination";

// The request's own `platform` is a family choice the CUSTOMER made, in
// whichever vocabulary their form used — "meta-ads" on the rows this
// screen was printing raw. PLATFORMS still wins when the slug is one of
// ours, because the owner named those; otherwise the family name.
const platformText = (p: string | null) =>
  platformLabel(p, PLATFORMS.find((x) => x.value === p)?.label ?? null);

const PlatformMark = ({ platform }: { platform: string | null }) => {
  const family = platformFamily(platform);
  // Lucide has no brand marks and we are not shipping other people's
  // logos into an admin queue. These read as the platform at 14px,
  // which is the whole job.
  const Icon =
    family === "meta"
      ? InfinityIcon
      : family === "google"
        ? Chrome
        : family === "tiktok"
          ? Music2
          : Megaphone;
  return (
    <span className={`pmark ${family}`}>
      <Icon />
      {platformText(platform)}
    </span>
  );
};

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
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const { requests, isLoading, isError, refetch, total } = useAdAccountRequests({
    search: debounced,
    sort,
    status: statusFilter,
    page,
    perPage,
  });

  // Status now filters server-side, so we no longer filter the fetched page
  // client-side (which hid pending requests on unreachable later pages).
  const rows = requests ?? [];

  // Claim / un-claim a request. Passes the row's updated_at so two admins
  // picking up the same request at once get a conflict instead of one
  // silently overwriting the other.
  const setRequestStatus = async (
    r: AdAccountRequest,
    status: "in_progress" | "pending",
    okMessage: string,
  ) => {
    setBusyId(r.id);
    try {
      const { setAdAccountRequestStatus } = await import(
        "@/actions/ad-account-actions"
      );
      const result = await setAdAccountRequestStatus(
        r.id,
        status,
        r.updated_at ?? undefined,
      );
      if (!result.ok) throw new Error(result.error);
      toast.success(okMessage);
      await queryClient.invalidateQueries({
        queryKey: ["ad-account-request-details", r.id],
      });
      await refetch();
    } catch (err) {
      toast.error("Couldn't update the request", {
        description: err instanceof Error ? err.message : "Failed.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const markInProgress = (r: AdAccountRequest) =>
    setRequestStatus(r, "in_progress", "Marked as in progress.");
  const markPending = (r: AdAccountRequest) =>
    setRequestStatus(r, "pending", "Moved back to pending.");

  const handleRejectRequest = async (reason: string) => {
    if (!requestToReject) return;
    setIsRejecting(true);
    try {
      const { rejectAdAccountRequest } = await import(
        "@/actions/ad-account-actions"
      );
      const result = await rejectAdAccountRequest(requestToReject.id, reason);
      if (!result.ok) throw new Error(result.error);
      // SAY WHAT HAPPENED TO THE MONEY. The customer paid 50 for this and
      // is getting it back; an admin who does not know that will field the
      // "where is my fee" email without an answer.
      const back = result.data?.refunded ?? 0;
      toast.success("Ad account request rejected.", {
        description:
          back > 0
            ? `${result.data?.currency === "USD" ? "$" : "€"}${back.toFixed(
                2,
              )} returned to their wallet.${
                result.data?.perkRestored
                  ? " Their free-request credit was given back too."
                  : ""
              }`
            : result.data?.perkRestored
              ? "Their free-request credit was given back."
              : "No fee was charged for this one, so there is nothing to refund.",
      });
      await queryClient.invalidateQueries({
        queryKey: ["ad-account-request-details", requestToReject.id],
      });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
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
      <style>{`
        .pmark{display:inline-flex;align-items:center;gap:6px;
          padding:4px 10px 4px 7px;border-radius:999px;
          border:1px solid var(--line);background:var(--panel-2);
          font-weight:700;font-size:.78rem;color:var(--ink)}
        .pmark svg{width:14px;height:14px}
        .pmark.meta{border-color:#c9d9ff;background:#eef3ff;color:#2f4fb3}
        .pmark.google{border-color:#cfe6d6;background:#eefaf1;color:#1f7a45}
        .pmark.tiktok{border-color:#e2d3f5;background:#f6efff;color:#6b3fb5}
      `}</style>

      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Account Requests</h1>
          <p>Requests waiting on you.</p>
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
        <PsmSortFilter
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
          ]}
          filters={[
            {
              id: "status",
              label: "Status",
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "payment_pending", label: "Payment pending" },
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setSort("newest");
            setStatusFilter("all");
            setSearch("");
          }}
        />
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
                {/* ── THE PSM NUMBER IS THE NAME ──────────────────
                    Two customers can be called Test Advertiser; only one
                    is PSM0005. It is what the owner searches by, what
                    the bank reference carries and what every other
                    screen leads with — this queue did not show it at
                    all, so an admin had to open Details to find out
                    whose request they were about to approve. */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-jakarta)",
                      fontWeight: 800,
                      fontSize: "1.05rem",
                      letterSpacing: "-.01em",
                    }}
                  >
                    {r.advertiser?.tenant_client_code || "No PSM number"}
                  </div>
                  <div
                    style={{
                      color: "var(--txt-2)",
                      fontSize: ".85rem",
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {advName(r)}
                  </div>
                </div>
                <span
                  className={`badge ${statusCls(r.status)}`}
                  style={{ marginLeft: "auto", textTransform: "capitalize" }}
                >
                  {(r.status ?? "pending").replace(/_/g, " ")}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                <PlatformMark platform={r.platform} />
                <span style={{ color: "var(--faint)", fontSize: ".8rem" }}>
                  {dayjs(r.created_at).format("D MMM")}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 4,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn sm"
                  onClick={() => setSelectedRequestId(r.id)}
                >
                  Review
                </button>
                {/* "in_progress" existed in the status list and in the filter
                    dropdown, but nothing could ever SET it — so a request an
                    admin had picked up looked identical to one nobody had
                    touched. This is that missing half. */}
                {(r.status ?? "pending") === "pending" && (
                  <button
                    className="btn ghost sm"
                    disabled={busyId === r.id}
                    onClick={() => markInProgress(r)}
                  >
                    <Clock /> I&apos;m on it
                  </button>
                )}
                {(r.status ?? "") === "in_progress" && (
                  <button
                    className="btn ghost sm"
                    disabled={busyId === r.id}
                    onClick={() => markPending(r)}
                  >
                    <Undo2 /> Back to pending
                  </button>
                )}
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
          {/* A failed read is not an empty queue. The hook has exposed
              isError all along; this screen simply never asked for it, so a
              dropped connection told an admin that nobody was waiting on
              them — on the one screen whose job is to say who is. */}
          <p
            className={isError ? "err" : "muted"}
            style={{ margin: 0 }}
          >
            {isError
              ? "Couldn't load the account requests — this is NOT an empty queue. Reload to retry."
              : debounced || statusFilter !== "all"
                ? /* A filter left on from earlier looks exactly like an
                     empty queue, and the way out of it is not on screen. */
                  debounced
                  ? `No account requests match “${debounced}”.`
                  : "No account requests match the filter you have set."
                : "No account requests to show."}
          </p>
          {!isError && (debounced || statusFilter !== "all") ? (
            <button
              className="btn ghost sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Clear the search and filters
            </button>
          ) : null}
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
