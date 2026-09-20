"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { customerLabel } from "@/lib/display-name";
import PsmSortFilter from "@/components/psm/sort-filter";
import { Eye, Search } from "lucide-react";
import { ACTIVITY_LOG_ACTIONS } from "@/lib/activity-log-actions";
// TODO(activity-logs): re-add ACTIVITY_LOG_DB_ACTIONS + setDbAction wiring
// when the DB-action filter UI is enabled.
import useActivityLogs from "./use-activity-logs";
import ActivityLogDetailsSheet from "./activity-log-details-sheet";
import TablePagination from "@/components/ui/table-pagination";
import { ActivityLog } from "@/lib/types/activity-log";
import { formatActionLabel } from "./utils";
import { userFacingErrorMessage } from "@/lib/pure-error";

const actionOptions = [
  { label: "All Actions", value: "all" },
  ...ACTIVITY_LOG_ACTIONS.map((item) => ({
    label: formatActionLabel(item),
    value: item,
  })),
];

// ── THE COLOUR AND THE WORD CAME FROM DIFFERENT COLUMNS ─────────────
//
// `db_action` gave the colour and `action` gave the text, with no
// constraint tying them together -- so a TOPUP_DELETED entry whose
// db_action happened to be INSERT rendered as a green "ok" badge. On
// the screen somebody opens when money is missing.
//
// The word decides. db_action is only a hint, and only when the word
// itself says nothing.
function actionBadge(action?: string | null, dbAction?: string | null) {
  const a = String(action ?? "").toLowerCase();
  if (/delete|remove|revoke|reject|cancel|fail/.test(a)) return "due";
  if (/create|add|approve|verify|complete|grant/.test(a)) return "ok";
  if (/update|change|edit|set/.test(a)) return "pend";
  switch (dbAction) {
    case "INSERT":
      return "ok";
    case "UPDATE":
      return "pend";
    case "DELETE":
      return "due";
    default:
      return "info";
  }
}

// Activity logs list, ported to the mockup look. Reuses the real
// useActivityLogs data hook + the real details sheet — presentation only.
/**
 * What the entry is ABOUT: the record, and the customer it belongs to.
 *
 * The row said who did it and what kind of thing they did — "Bart · Ad
 * Account Created" — and then stopped. Which ad account? Whose subscription?
 * data_snapshot, table_name and reference_record_id were all being fetched
 * and none of them shown, so the only way to find out was to open every entry
 * one at a time.
 *
 * Two parts, because they answer two different questions:
 *   record   — the thing itself, when it has a name of its own
 *   customer — "PSM0002 · john doe", resolved from the snapshot's
 *              advertiser_id, which is the only identity most snapshots carry
 *
 * A subscription has no name, so its subject IS the customer — showing
 * "€150.00" there answered the wrong question entirely.
 */
function recordLabel(snap: Record<string, unknown>): string | null {
  for (const k of ["name", "account_name", "title", "invoice_no", "reference"]) {
    const v = snap[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function amountLabel(snap: Record<string, unknown>): string | null {
  const amount = snap.amount ?? snap.total ?? snap.topup_amount;
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const currency = typeof snap.currency === "string" ? snap.currency : "";
  return `${currency} ${Number(amount).toFixed(2)}`.trim();
}

function advertiserIdOf(snap: Record<string, unknown>): string | null {
  const v = snap.advertiser_id;
  return typeof v === "string" && v ? v : null;
}

export default function ActivityLogsTable() {
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("");
  const [dbAction] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    setPage(1);
  }, [action, dbAction]);

  const { logs, total, isLoading, isError, error } = useActivityLogs({
    action,
    dbAction,
    page,
    perPage,
  });

  // Resolve the advertiser_id most snapshots carry into something a person
  // can read. One query for the ids on THIS page only — the page is at most
  // a few dozen rows, and doing it per row would be a request per record.
  const advertiserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const l of (logs ?? []) as ActivityLog[]) {
      const id = advertiserIdOf((l.data_snapshot ?? {}) as Record<string, unknown>);
      if (id) ids.add(id);
    }
    return [...ids];
  }, [logs]);

  const { data: customerById } = useQuery({
    queryKey: ["activity-log-customers", advertiserIds],
    enabled: advertiserIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name)")
        .in("id", advertiserIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{
        id: string;
        tenant_client_code: string | null;
        profile: { full_name: string | null } | { full_name: string | null }[] | null;
      }>) {
        const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile;
        map[row.id] = customerLabel(row.tenant_client_code, prof?.full_name);
      }
      return map;
    },
  });

  // Narrow the already-fetched page of logs by the actor (author) who
  // performed the action. `useActivityLogs` has no server-side actor param,
  // so this is a client-side filter over the current page's rows — the
  // action filter, pagination and detail sheet are untouched.
  const filteredLogs = useMemo(() => {
    const term = actor.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) => {
      const name = (log.author?.full_name ?? "").toLowerCase();
      const email = (log.author?.email ?? "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [logs, actor]);

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Activity Logs</h1>
          <p>System activity and audit events.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Filter by user name or email…"
            aria-label="Filter by user"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "action",
              label: "Action",
              value: action,
              onChange: setAction,
              options: actionOptions.map((o) => ({
                value: o.value,
                label: o.label,
              })),
            },
          ]}
          searchActive={!!actor.trim()}
          onReset={() => {
            setAction("all");
            setActor("");
          }}
        />
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <div role="alert" aria-live="assertive">
            <p className="muted" style={{ margin: 0 }}>
              Failed to load activity logs.{" "}
              {/* userFacingErrorMessage, per CLAUDE.md. make-query-client already
                routes the TOAST for this same query through it; the card
                underneath printed the unsanitised original, so one
                failure gave two different messages and the raw one
                carried PostgREST's details/hint. */}
              {userFacingErrorMessage(error, "Give it a reload.")}
            </p>
          </div>
        </div>
      ) : logs.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Author</th>
                  <th>Action</th>
                  <th>Subject</th>
                  <th className="r">View Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const authorName = log.author?.full_name || "Unknown";
                  const authorEmail = log.author?.email || "--";
                  return (
                    <tr key={log.id}>
                      {/* Name only. The email measured 154px of text in a
                          141px cell and simply cut off mid-address — and an
                          email does not identify a colleague better than
                          their name does. It is in the detail sheet, which
                          is where you go when the name is not enough. */}
                      <td data-label="Author">
                        <div className="oneline" title={authorEmail}>
                          {authorName}
                        </div>
                      </td>
                      <td data-label="Action">
                        <span
                          className={`badge ${actionBadge(log.action, log.db_action)}`}
                        >
                          {formatActionLabel(log.action)}
                        </span>
                      </td>
                      <td data-label="Subject">
                        {(() => {
                          const snap = (log.data_snapshot ?? {}) as Record<
                            string,
                            unknown
                          >;
                          const advId = advertiserIdOf(snap);
                          const customer = advId
                            ? (customerById?.[advId] ?? "")
                            : "";
                          const record = recordLabel(snap);
                          // A record with a name of its own leads; otherwise
                          // the customer IS the subject (a subscription has no
                          // name — showing its amount answered the wrong
                          // question). The second line carries whichever of
                          // the two did not lead.
                          const main =
                            record || customer || amountLabel(snap) ||
                            `${(log.table_name ?? "record").replace(/_/g, " ")} ${(log.reference_record_id ?? "").slice(0, 8)}`.trim();
                          const sub =
                            record && customer
                              ? customer
                              : record
                                ? amountLabel(snap)
                                : customer
                                  ? amountLabel(snap)
                                  : null;
                          return (
                            <div style={{ minWidth: 0 }}>
                              <div className="oneline" title={main}>
                                {main}
                              </div>
                              {sub && (
                                <div
                                  className="oneline"
                                  style={{
                                    color: "var(--faint)",
                                    fontSize: ".8rem",
                                  }}
                                  title={sub}
                                >
                                  {sub}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td data-label="View Details" className="r fullcell">
                        <button
                          className="btn ghost sm"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye /> View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredLogs.length === 0 && (
            <p
              className="muted"
              style={{ margin: 0, padding: 16, fontSize: ".88rem" }}
            >
              No activity by a user matching “{actor.trim()}” on this page.
            </p>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No activity logs found.
          </p>
        </div>
      )}

      <TablePagination
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={(p) => setPage(p)}
      />

      <ActivityLogDetailsSheet
        open={selectedLog !== null}
        log={selectedLog}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null);
        }}
      />
    </div>
  );
}
