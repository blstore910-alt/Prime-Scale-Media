"use client";

import { DATE_FORMAT } from "@/lib/constants";
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
const clientCode = (s: Subscription) => s.advertiser?.tenant_client_code || "—";
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

  const hasFilters = status !== "all" || Boolean(date) || Boolean(q);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Subscriptions</h1>
          <p>Recurring monthly plans — change the amount, pause, or disable.</p>
        </div>
        <button className="btn grad" onClick={() => setIsCreateOpen(true)}>
          <Plus /> New Subscription
        </button>
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
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as SubscriptionStatus | "all")
          }
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="paused">Paused</option>
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Start date"
          style={{
            fontFamily: "var(--bd)",
            fontWeight: 600,
            fontSize: ".84rem",
            border: "1px solid var(--line-2)",
            borderRadius: 11,
            padding: "9px 13px",
            background: "var(--panel)",
            color: "var(--ink)",
            cursor: "pointer",
          }}
        />
        {hasFilters && (
          <button
            className="btn ghost sm"
            onClick={() => {
              setStatus("all");
              setDate("");
              setSearch("");
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
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
        <div className="card" style={{ padding: "16px 8px 8px" }}>
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
                      <td>
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
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700 }}>{advName(s)}</div>
                            <div
                              className="mono"
                              style={{
                                color: "var(--faint)",
                                fontSize: ".8rem",
                              }}
                            >
                              {clientCode(s)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="r mono">
                        {formatCurrency(
                          Number(s.amount ?? 0),
                          s.currency || "EUR",
                        )}
                      </td>
                      <td>{formatSubscriptionDate(s.start_date)}</td>
                      <td>
                        {s.next_payment_date
                          ? dayjs(s.next_payment_date).format(DATE_FORMAT)
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`badge ${statusCls(s.status)}`}
                          style={{ textTransform: "capitalize" }}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="r">
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "flex-end",
                            flexWrap: "wrap",
                          }}
                        >
                          {isSuperAdmin && (
                            <button
                              className="btn ghost sm"
                              onClick={() => setAmountEditSub(s)}
                              disabled={pending}
                              title="Change the monthly amount (super-admin)"
                            >
                              <Pencil /> Amount
                            </button>
                          )}

                          {s.status === "inactive" && (
                            <button
                              className="btn sm"
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
                              Activate
                            </button>
                          )}

                          {s.status === "active" && (
                            <>
                              <button
                                className="btn ghost sm"
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
                                Pause
                              </button>
                              <button
                                className="btn ghost sm"
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
                                Disable
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
