"use client";

import { DATE_FORMAT } from "@/lib/constants";
import PsmSortFilter from "@/components/psm/sort-filter";
import CustomerName from "@/components/psm/customer-name";
import { formatCurrency } from "@/lib/utils";
import dayjs from "dayjs";
import {
  Loader2,
  MinusCircle,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/context/app-provider";
import ChangeSubscriptionAmountDialog from "./change-subscription-amount-dialog";
import CreateSubscriptionDialog from "./create-subscription-dialog";
import { formatSubscriptionDate } from "./subscription-utils";
import { Subscription, SubscriptionStatus } from "./types";
import useSubscriptions from "./use-subscriptions";
import useUpdateSubscriptionStatus from "./use-update-subscription-status";

const PER_PAGE = 20;

const advName = (s: Subscription) => s.advertiser?.profile?.full_name || "—";
const initial = (s: Subscription) =>
  (s.advertiser?.profile?.full_name || "?").trim().charAt(0).toUpperCase() ||
  "?";

const statusCls = (s: SubscriptionStatus) => {
  if (s === "active") return "ok";
  if (s === "paused") return "pend";
  return "due"; // inactive
};

// Admin subscriptions queue, ported to the mockup look. Reuses the real
// data hook + the real create / change-amount dialogs and the
// setSubscriptionStatus mutation (activate/pause/disable/unpause) —
// presentation only, no new data writes.
export default function PsmSubscriptions() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus | "all">("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { isSuperAdmin } = useAppContext();
  const [amountEditSub, setAmountEditSub] = useState<Subscription | null>(null);

  useEffect(() => setPage(1), [status, date]);

  const { subscriptions, total, isLoading, isError, error } = useSubscriptions({
    status,
    date,
    page,
    perPage: PER_PAGE,
  });

  const {
    updateSubscriptionStatus,
    pendingSubscriptionId,
    isPending: isStatusUpdating,
  } = useUpdateSubscriptionStatus();

  const updateStatus = (
    subscriptionId: string,
    nextStatus: SubscriptionStatus,
    successMessage: string,
  ) => {
    updateSubscriptionStatus(
      { subscriptionId, status: nextStatus },
      {
        onSuccess: () => toast.success(successMessage),
        onError: (updateError) =>
          toast.error("Failed to update subscription", {
            description: updateError.message,
          }),
      },
    );
  };

  const q = search.trim().toLowerCase();
  const rows = subscriptions.filter((s) => {
    if (!q) return true;
    return (
      (s.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
      (s.advertiser?.profile?.email ?? "").toLowerCase().includes(q) ||
      (s.advertiser?.tenant_client_code ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Subscriptions</h1>
          <p>Recurring monthly plans.</p>
        </div>
        <div className="pacts">
          <button className="btn grad" onClick={() => setIsCreateOpen(true)}>
            <Plus /> <span className="blab">New Subscription</span>
          </button>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search advertiser…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: (v) => setStatus(v as SubscriptionStatus | "all"),
              options: [
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "paused", label: "Paused" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          extraActive={!!date}
          extra={
            <>
              <label className="flab" htmlFor="sub-start">
                Started on or after
              </label>
              <input
                id="sub-start"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Start date"
                className="fpanel-date"
              />
            </>
          }
          onReset={() => {
            setStatus("all");
            setDate("");
            setSearch("");
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load subscriptions.{" "}
            {(error as Error)?.message ?? String(error)}
          </p>
        </div>
      ) : rows.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th className="r">Amount</th>
                  <th>Start date</th>
                  <th>Next payment on</th>
                  <th>Status</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const pending =
                    isStatusUpdating && pendingSubscriptionId === s.id;
                  return (
                    <tr key={s.id}>
                      <td data-label="Advertiser" className="fullcell">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span
                            className="ci b"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 800,
                              flex: "0 0 auto",
                            }}
                          >
                            {initial(s)}
                          </span>
                          {/* Code first, name beneath — the desk works in
                              client codes, and this list was the other way
                              round. */}
                          <CustomerName
                            clientCode={s.advertiser?.tenant_client_code}
                            name={advName(s)}
                            full
                          />
                        </div>
                      </td>
                      <td data-label="Amount" className="r mono">
                        {formatCurrency(
                          Number(s.amount ?? 0),
                          s.currency || "EUR",
                        )}
                      </td>
                      <td data-label="Start date">{formatSubscriptionDate(s.start_date)}</td>
                      <td data-label="Next payment on">
                        {s.next_payment_date
                          ? dayjs(s.next_payment_date).format(DATE_FORMAT)
                          : "—"}
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${statusCls(s.status)}`}
                          style={{ textTransform: "capitalize" }}
                        >
                          {s.status}
                        </span>
                      </td>
                      {/* .actrow: equal widths on ONE line. flexWrap here
                          meant three buttons of three different widths broke
                          onto three separate rows on a phone — on every
                          subscription in the list. */}
                      <td data-label="Actions" className="r fullcell">
                        <div className="actrow">
                          {isSuperAdmin && (
                            <button
                              className="btn ghost sm"
                              onClick={() => setAmountEditSub(s)}
                              disabled={pending}
                              title="Change the monthly amount (super-admin)"
                            >
                              <Pencil /> <span className="alab">Amount</span>
                            </button>
                          )}

                          {s.status === "inactive" && (
                            <button
                              className="btn sm"
                              title="Activate"
                              aria-label="Activate"
                              onClick={() =>
                                updateStatus(
                                  s.id,
                                  "active",
                                  "Subscription activated successfully.",
                                )
                              }
                              disabled={pending}
                            >
                              {pending ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <PlayCircle />
                              )}
                              <span className="alab">Activate</span>
                            </button>
                          )}

                          {s.status === "active" && (
                            <>
                              {/* titled: .alab is display:none below 420px and
                                  then only the icon is left, so without this
                                  the button has no accessible name at all. */}
                              <button
                                className="btn ghost sm"
                                title="Pause"
                                aria-label="Pause"
                                onClick={() =>
                                  updateStatus(
                                    s.id,
                                    "paused",
                                    "Subscription paused successfully.",
                                  )
                                }
                                disabled={pending}
                              >
                                {pending ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <PauseCircle />
                                )}
                                <span className="alab">Pause</span>
                              </button>
                              <button
                                className="btn ghost sm"
                                title="Disable"
                                aria-label="Disable"
                                onClick={() =>
                                  updateStatus(
                                    s.id,
                                    "inactive",
                                    "Subscription disabled successfully.",
                                  )
                                }
                                disabled={pending}
                                style={{
                                  color: "var(--danger)",
                                  borderColor: "var(--danger)",
                                }}
                              >
                                {pending ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <MinusCircle />
                                )}
                                <span className="alab">Disable</span>
                              </button>
                            </>
                          )}

                          {s.status === "paused" && (
                            <button
                              className="btn sm"
                              onClick={() =>
                                updateStatus(
                                  s.id,
                                  "active",
                                  "Subscription resumed successfully.",
                                )
                              }
                              disabled={pending}
                            >
                              {pending ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <PlayCircle />
                              )}
                              Unpause
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No subscriptions found.
          </p>
        </div>
      )}

      {total > PER_PAGE && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <span className="muted" style={{ fontSize: ".85rem" }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn ghost sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <button
            className="btn ghost sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}

      <CreateSubscriptionDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <ChangeSubscriptionAmountDialog
        subscription={amountEditSub}
        open={!!amountEditSub}
        onOpenChange={(value) => {
          if (!value) setAmountEditSub(null);
        }}
      />
    </div>
  );
}
