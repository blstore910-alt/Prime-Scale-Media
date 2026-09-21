"use client";

import { PLATFORMS } from "@/lib/constants";
import { CopyText } from "@/components/ui/copy-text";
import { platformFamily, platformLabel } from "@/lib/pure-platform-badge";
import PsmSortFilter from "@/components/psm/sort-filter";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useAdAccountRequests from "./use-ad-account-requests";
import AdAccountRequestReviewDialog from "./ad-account-request-review-dialog";
import AdAccountRequestRejectDialog from "./ad-account-request-reject-dialog";
import AdAccountRequestDetailsSheet from "./ad-account-request-details-sheet";
import CreateAdAccountFromRequestDialog from "./create-ad-account-from-request-dialog";
import CreateAdAccountRequestInvoiceDialog from "./create-ad-account-request-invoice-dialog";
import TablePagination from "../ui/table-pagination";
import { currencySymbol } from "@/lib/pure-invoice-currency";
import { createClient } from "@/lib/supabase/client";

// The request's own `platform` is a family choice the CUSTOMER made, in
// whichever vocabulary their form used — "meta-ads" on the rows this
// screen was printing raw. PLATFORMS still wins when the slug is one of
// ours, because the owner named those; otherwise the family name.
// ── THE IDENTIFIERS AN ADMIN ACTUALLY RETYPES ────────────────────────
//
// A REQUEST has no ad account yet -- that is what it is asking for --
// so there is no account name or account id to show. What it does
// carry, in metadata, is the identifier the customer gave us: the
// Business Manager id for Meta, the Business Center id for TikTok, the
// account email for Google. That is the value an admin copies into a
// supplier's dashboard to set the account up, and it was two clicks
// away in a details sheet.
//
// Per platform, because the three are different fields with different
// names and showing "BM" over a Google email would be worse than
// showing nothing.
function requestIdentity(
  platform: string | null,
  metadata: unknown,
): { label: string; value: string } | null {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const pick = (k: string) => {
    const v = m[k];
    const t = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
    return t.length > 0 ? t : "";
  };
  const fam = platformFamily(platform);
  if (fam === "meta") {
    const bm = pick("facebook_business_manager_id");
    return bm ? { label: "BM", value: bm } : null;
  }
  if (fam === "tiktok") {
    const bc = pick("tiktok_business_center_id");
    return bc ? { label: "BC", value: bc } : null;
  }
  if (fam === "google") {
    const email = pick("google_email");
    return email ? { label: "Account", value: email } : null;
  }
  return null;
}

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
  const rows = useMemo(() => requests ?? [], [requests]);

  // ── THE ACCOUNT THIS REQUEST BECAME ──────────────────────────────
  //
  // A request has no ad account: that is what it is asking for. Once it
  // is completed one exists, and the account NAME is what an admin
  // actually wants on the tile -- it is what they type into a
  // supplier's dashboard and what the customer refers to on the phone.
  //
  // There is no foreign key from a request to the account it produced,
  // so this matches on the pair that cannot collide in practice: the
  // customer, and the platform family they asked for. Where a customer
  // has more than one account of the same family the newest is shown,
  // because that is the one this request created.
  //
  // Read separately and allowed to fail on its own -- a tile without an
  // account name is fine; a queue that will not render is not.
  const advertiserIds = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((r) => (r.advertiser as { id?: string } | undefined)?.id)
            .filter((v): v is string => typeof v === "string" && !!v),
        ),
      ).slice(0, 120),
    [rows],
  );

  const { data: accountsByAdvertiser } = useQuery({
    queryKey: ["request-accounts", advertiserIds.join(",")],
    enabled: advertiserIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("id, name, bm_id, platform, currency, advertiser_id, created_at")
        .in("advertiser_id", advertiserIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const out: Record<string, { name: string; bm_id: string | null }[]> = {};
      for (const raw of data ?? []) {
        const a = raw as {
          advertiser_id?: string;
          name?: string | null;
          bm_id?: string | number | null;
          platform?: string | null;
        };
        const key = `${a.advertiser_id ?? ""}|${platformFamily(a.platform ?? null) ?? ""}`;
        if (!key.startsWith("|")) {
          (out[key] ??= []).push({
            name: String(a.name ?? "").trim(),
            bm_id: a.bm_id == null ? null : String(a.bm_id).trim() || null,
          });
        }
      }
      return out;
    },
  });

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
      // The third argument is ifUpdatedAt, and it was dropped on the ONE
      // action here that moves money: rejecting a paid request refunds
      // the EUR 50. The claim/un-claim path two functions up passes it
      // correctly. Two admins on the same row still cannot double-refund
      // — the RPC refuses an already-rejected request — but a guard the
      // action offers on a money path is not one to leave on the floor.
      const result = await rejectAdAccountRequest(
        requestToReject.id,
        reason,
        requestToReject.updated_at ?? undefined,
      );
      if (!result.ok) throw new Error(result.error);
      // SAY WHAT HAPPENED TO THE MONEY. The customer paid 50 for this and
      // is getting it back; an admin who does not know that will field the
      // "where is my fee" email without an answer.
      const back = result.data?.refunded ?? 0;
      toast.success("Ad account request rejected.", {
        description:
          back > 0
            ? `${currencySymbol(result.data?.currency)}${back.toFixed(
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
        /* The platform mark sat a size up from the currency badge
           beside it, so two pills on one row read as two ranks. Same
           height, same type size, same radius; only the icon and the
           colour tell them apart. */
        .pmark,.rpill{display:inline-flex;align-items:center;gap:6px;
          min-height:24px;padding:0 10px;border-radius:999px;
          border:1px solid var(--line);background:var(--panel-2);
          font-weight:700;font-size:.72rem;line-height:1;color:var(--ink)}
        .pmark{padding-left:7px}
        .pmark svg{width:13px;height:13px}
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
                    <CopyText
                      value={r.advertiser?.tenant_client_code}
                      label={r.advertiser?.tenant_client_code || "No PSM number"}
                      what="PSM number"
                    />
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
                {/* THE CURRENCY THE ACCOUNT WILL BE IN. It is chosen on
                    the request and cannot be changed afterwards, and it
                    decides which beneficiary bank the customer is given
                    for every top-up on that account -- so it belongs on
                    the card an admin approves from, not only in the
                    sheet behind it. */}
                {r.currency ? (
                  <span className="rpill">
                    {String(r.currency).toUpperCase()}
                  </span>
                ) : null}
                <span style={{ color: "var(--faint)", fontSize: ".8rem" }}>
                  {dayjs(r.created_at).format("D MMM")}
                </span>
              </div>

              {/* The identifier and the site, both copy-on-click. These
                  are the two values that get retyped into somebody
                  else's dashboard to set the account up. */}
              {(() => {
                const ident = requestIdentity(r.platform, r.metadata);
                const advId = (r.advertiser as { id?: string } | undefined)?.id;
                const fam = platformFamily(r.platform) ?? "";
                const made = advId
                  ? (accountsByAdvertiser?.[`${advId}|${fam}`] ?? [])[0]
                  : undefined;
                const acctName = made?.name || "";
                // ── AND `made` IS A GUESS, NOT A LINK ───────────────
                //
                // There is no FK from a request to the account it
                // produced, so `made` is "the newest ad_accounts row
                // with the same advertiser and platform family", out of
                // a .limit(500) lookup. For a customer asking for a
                // SECOND account that is their EXISTING one.
                //
                // Preferring it therefore printed the wrong Business
                // Manager on a copy-on-click field: PSM0005 asks for a
                // new Meta account quoting BM 1112223334 and the card
                // showed 9998887776. The admin provisions and funds the
                // wrong BM.
                //
                // What the customer typed on THIS request is the thing
                // this request is about. The guess is still shown when
                // they typed nothing, and it is labelled as belonging
                // to an existing account so nobody retypes it blind.
                const bm = ident?.value || made?.bm_id || "";
                const bmLabel = ident?.value
                  ? (ident?.label ?? "BM ID")
                  : made?.bm_id
                    ? "BM ID (their existing account)"
                    : "BM ID";
                // ── AND THE NAME NEEDS THE SAME HONESTY ─────────────
                //
                // `acctName` is the SAME guess as the BM above -- the
                // newest ad_accounts row for this advertiser and
                // platform family. The BM line was given a label saying
                // so; the name was printed bare. On a PENDING request
                // for a second account that is the customer's EXISTING
                // account code, sitting on the card with nothing
                // explaining it, directly above a copy button.
                //
                // Once the request is completed the guess IS this
                // request's account, so then the plain label is true.
                // The owner asked for one label. The status badge two
                // rows up already says whether this request is done, so
                // the label does not have to carry that too — and "Acc
                // name" is what the field is called on every other
                // screen.
                const acctLabel = "Acc name";
                if (!acctName && !bm) return null;
                return (
                  <div
                    style={{
                      display: "grid",
                      gap: 3,
                      marginBottom: 12,
                      fontSize: ".78rem",
                      color: "var(--txt-2)",
                      minWidth: 0,
                    }}
                  >
                    {acctName ? (
                      <div style={{ minWidth: 0, fontWeight: 600 }}>
                        <span style={{ color: "var(--faint)", fontWeight: 500 }}>
                          {acctLabel}{" "}
                        </span>
                        <CopyText value={acctName} what="account name" />
                      </div>
                    ) : null}
                    {bm ? (
                      <div style={{ minWidth: 0 }}>
                        <span style={{ color: "var(--faint)" }}>
                          {bmLabel}{" "}
                        </span>
                        <CopyText value={bm} what={bmLabel} mono />
                      </div>
                    ) : null}
                  </div>
                );
              })()}

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
