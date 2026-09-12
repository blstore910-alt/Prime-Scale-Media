"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
import { ACTIVITY_LOG_ACTIONS } from "@/lib/activity-log-actions";
// TODO(activity-logs): re-add ACTIVITY_LOG_DB_ACTIONS + setDbAction wiring
// when the DB-action filter UI is enabled.
import useActivityLogs from "./use-activity-logs";
import ActivityLogDetailsSheet from "./activity-log-details-sheet";
import TablePagination from "@/components/ui/table-pagination";
import { ActivityLog } from "@/lib/types/activity-log";
import { formatActionLabel } from "./utils";

const actionOptions = [
  { label: "All Actions", value: "all" },
  ...ACTIVITY_LOG_ACTIONS.map((item) => ({
    label: formatActionLabel(item),
    value: item,
  })),
];

// Maps a db_action to one of the mockup's scoped `.badge` variants.
function dbActionBadge(dbAction?: string | null) {
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
          <p>Monitor system activity and review audit events.</p>
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
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label="Action"
        >
          {actionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <div role="alert" aria-live="assertive">
            <p className="muted" style={{ margin: 0 }}>
              Failed to load activity logs.{" "}
              {(error as Error)?.message ?? String(error)}
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
                  <th className="r">View Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const authorName = log.author?.full_name || "Unknown";
                  const authorEmail = log.author?.email || "--";
                  return (
                    <tr key={log.id}>
                      <td>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{authorName}</div>
                          <div
                            style={{
                              color: "var(--faint)",
                              fontSize: ".8rem",
                            }}
                          >
                            {authorEmail}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${dbActionBadge(log.db_action)}`}>
                          {formatActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="r">
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
