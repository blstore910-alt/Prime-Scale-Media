"use client";

import { copyText } from "@/lib/copy-text";
import { useMemo, useState, useEffect } from "react";
import PsmSortFilter from "@/components/psm/sort-filter";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetClose,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import TablePagination from "@/components/ui/table-pagination";
import { Copy, Download, Eye, RefreshCw, Search, XIcon } from "lucide-react";
import { toast } from "sonner";
import useAuditEvents, { type AuditEvent } from "./use-audit-events";
import { userFacingErrorMessage } from "@/lib/pure-error";

// ── A HAND-KEPT LIST ALWAYS FALLS BEHIND ─────────────────────────────
//
// This was the whole Table filter: seventeen names, typed out. The
// database has events on THIRTY-FIVE tables, and the biggest one missing
// is `wise_incoming_transfers` with 1,756 rows -- impossible to filter
// to, and just as impossible to filter away while looking for something
// else. `plans`, `commission_rules`, `bank_accounts`, `affiliate_payouts`
// and the four wallet_* tables were all invisible to it too.
//
// The names now come from the data (plak 89 adds `audit_table_names()`,
// SECURITY INVOKER so RLS still decides what you may see). This list
// stays as the fallback for the window between this deploy and that
// paste, and for any read that fails -- an empty filter would be worse
// than an incomplete one.
const AUDITED_TABLES = [
  "wallets",
  "wallet_topups",
  "top_ups",
  "invoices",
  "companies",
  "billings",
  "subscriptions",
  "exchange_rates",
  "referral_commissions",
  "referral_links",
  "ad_accounts",
  "ad_account_requests",
  "advertisers",
  "affiliates",
  "user_profiles",
  "tenants",
  "invitations",
] as const;

/** Every table that has audit events, from the database; the static list
 *  above until the migration lands. */
function useAuditTableNames(): string[] {
  const { data } = useQuery({
    queryKey: ["audit-table-names"],
    // The set of tables changes when a trigger is added, not minute to
    // minute.
    staleTime: 10 * 60_000,
    // Its failure is not something the reader can act on, and the filter
    // still works off the fallback.
    meta: { silent: true },
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("audit_table_names");
      if (error) throw error;
      const names: string[] = ((data ?? []) as unknown[])
        .map((r: unknown) =>
          typeof r === "string"
            ? r
            : String((r as { table_name?: string })?.table_name ?? ""),
        )
        .filter((v: string) => !!v);
      return Array.from(new Set(names)).sort();
    },
  });
  if (data && data.length > 0) return data;
  return [...AUDITED_TABLES];
}

/** Who did it, for the actors on the page in front of you.
 *
 *  WHY. The Actor column printed `actor_profile_id` -- a raw uuid, on
 *  every row, on the screen whose entire purpose is "who changed this".
 *  Reading it meant copying a uuid out and looking it up somewhere else,
 *  and the two ids that fill most of the log look identical at a glance
 *  until the fourth character.
 *
 *  One extra read, only for the ids actually on screen, and never
 *  blocking: a name that will not load leaves the uuid, which is what
 *  was there before.
 */
function useActorNames(ids: string[]): Record<string, string> {
  const key = ids.join(",");
  const { data } = useQuery({
    queryKey: ["audit-actor-names", key],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    meta: { silent: true },
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const row of data ?? []) {
        const r = row as {
          id?: string;
          full_name?: string | null;
          email?: string | null;
        };
        if (!r.id) continue;
        const name = (r.full_name ?? "").trim() || (r.email ?? "").trim();
        if (name) out[r.id] = name;
      }
      return out;
    },
  });
  return data ?? {};
}

// Maps an audit action to one of the mockup's scoped `.badge` variants.
function actionBadge(action: AuditEvent["action"]) {
  switch (action) {
    case "INSERT":
      return "ok";
    case "UPDATE":
      return "info";
    case "DELETE":
      return "due";
    default:
      return "info";
  }
}

export default function AuditEventsTable() {
  // Deep-linkable filter: /audit?row=<uuid> shows every event for
  // that one row. Handy when investigating a specific incident —
  // paste the wallet_topup id into the URL and get its full
  // history in one page.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const rowIdFromUrl = searchParams?.get("row") ?? "";

  const [table, setTable] = useState("all");
  const tableNames = useAuditTableNames();
  const [action, setAction] = useState("all");
  const [sinceMinutes, setSinceMinutes] = useState<number>(0);
  const [rowIdInput, setRowIdInput] = useState(rowIdFromUrl);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setRowIdInput(rowIdFromUrl);
    setPage(1);
  }, [rowIdFromUrl]);

  const applyRowId = () => {
    const params = new URLSearchParams(searchParams?.toString());
    const trimmed = rowIdInput.trim();
    if (trimmed) params.set("row", trimmed);
    else params.delete("row");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const clearRowId = () => {
    setRowIdInput("");
    const params = new URLSearchParams(searchParams?.toString());
    params.delete("row");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const { events, total, isLoading, isError, error } = useAuditEvents({
    table,
    action,
    rowId: rowIdFromUrl || undefined,
    sinceMinutes: sinceMinutes > 0 ? sinceMinutes : undefined,
    page,
    perPage,
  });

  // Only the actors on THIS page, so the lookup is a handful of ids.
  const actorIds = useMemo(
    () =>
      Array.from(
        new Set(
          (events ?? [])
            .map((e) => e.actor_profile_id)
            .filter((v): v is string => !!v),
        ),
      ),
    [events],
  );
  const actorNames = useActorNames(actorIds);

  async function downloadCsv() {
    setExporting(true);
    try {
      // ── THE FILTERS THE SCREEN IS ACTUALLY SHOWING ──────────────
      //
      // This hardcoded a rolling 30 days while the table defaults to
      // All time, and sent neither the ?row= id nor the "last N
      // minutes" control. Paste a wallet_topups row id, narrow to the
      // six events spanning March to September, press Export: the file
      // held every audited write of the last 30 days and none of the
      // six, under a toast reading "Audit CSV downloaded".
      const to = new Date().toISOString();
      const windowMs =
        sinceMinutes > 0 ? sinceMinutes * 60 * 1000 : 366 * 86400 * 1000;
      // 366 days is the action's own ceiling; All time asks for as much
      // of it as the server will give and says so if it is short.
      const from = new Date(Date.now() - windowMs + 1000).toISOString();
      const params = new URLSearchParams({
        from,
        to,
        ...(table !== "all" ? { table } : {}),
        ...(action !== "all" ? { action } : {}),
        ...(rowIdFromUrl ? { row: rowIdFromUrl } : {}),
      });
      const res = await fetch(`/api/audit/export?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      // ── AND READ WHAT THE SERVER SAID ABOUT IT ──────────────────
      //
      // The route names a short file "audit-<date>-PARTIAL.csv" and
      // sets X-Export-Rows and X-Export-Truncated. `a.download`
      // OVERRIDES Content-Disposition, so the warning in the filename
      // was thrown away and the toast was unconditional -- a file that
      // stopped at the ceiling landed looking complete. Fixed on the
      // server, re-introduced one function away.
      const wasTruncated =
        res.headers.get("X-Export-Truncated") === "true";
      const rowCount = res.headers.get("X-Export-Rows");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${new Date().toISOString().slice(0, 10)}${
        wasTruncated ? "-PARTIAL" : ""
      }.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (wasTruncated) {
        toast.warning("Audit CSV downloaded — but it is INCOMPLETE", {
          description: `It stopped at the export ceiling${
            rowCount ? ` (${rowCount} rows)` : ""
          }. Narrow the range or the table and export again.`,
          duration: 12000,
        });
      } else {
        toast.success(
          `Audit CSV downloaded${rowCount ? ` — ${rowCount} rows` : ""}`,
        );
      }
    } catch (err) {
      toast.error("CSV export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Audit log</h1>
          <p>
            Append-only. Every audited write.
          </p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={rowIdInput}
            onChange={(e) => setRowIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyRowId();
            }}
            placeholder="Paste a row id, press Enter"
            style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "table",
              label: "Table",
              value: table,
              onChange: (v) => {
                setTable(v);
                setPage(1);
              },
              options: [
                { value: "all", label: "All tables" },
                ...tableNames.map((t) => ({ value: t, label: t })),
                // A filter the URL or an older session asks for that is
                // not in the list would otherwise show as blank.
                ...(table !== "all" && !tableNames.includes(table)
                  ? [{ value: table, label: table }]
                  : []),
              ],
            },
            {
              id: "since",
              label: "Time range",
              value: String(sinceMinutes),
              allValue: "0",
              onChange: (v) => {
                setSinceMinutes(Number(v));
                setPage(1);
              },
              options: [
                { value: "0", label: "All time" },
                { value: "15", label: "Last 15 min" },
                { value: "60", label: "Last hour" },
                { value: "1440", label: "Last 24 h" },
                { value: "10080", label: "Last 7 days" },
              ],
            },
            {
              id: "action",
              label: "Database action",
              value: action,
              onChange: (v) => {
                setAction(v);
                setPage(1);
              },
              options: [
                { value: "all", label: "All actions" },
                { value: "INSERT", label: "INSERT" },
                { value: "UPDATE", label: "UPDATE" },
                { value: "DELETE", label: "DELETE" },
              ],
            },
          ]}
          searchActive={!!rowIdFromUrl}
          onReset={() => {
            setTable("all");
            setAction("all");
            setSinceMinutes(0);
            clearRowId();
            setPage(1);
          }}
        />
        <button
          className="btn ghost sm"
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ["audit-events"] })
          }
          disabled={isLoading}
          aria-label="Refresh"
        >
          <RefreshCw
            className={isLoading ? "animate-spin" : ""}
            style={{ width: 15, height: 15 }}
          />
        </button>
        <button className="fexp" onClick={downloadCsv} disabled={exporting}>
          <Download />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {/* ?? catches only null and undefined, so an empty message
                rendered NOTHING, and a bare "JWT expired" rendered alone
                in a card the same shape as "No audit events found." --
                the failure and the empty state looked identical on the
                screen you open when money is missing. Always lead with
                the sentence; append the reason when there is one. */}
            Failed to load audit events. {/* userFacingErrorMessage, per CLAUDE.md. make-query-client already
                routes the TOAST for this same query through it; the card
                underneath printed the unsanitised original, so one
                failure gave two different messages and the raw one
                carried PostgREST's details/hint. */}
            {" "}
            {userFacingErrorMessage(error, "Give it a reload.")}
          </p>
        </div>
      ) : events.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Table</th>
                  <th>Action</th>
                  <th>Row</th>
                  <th>Actor</th>
                  <th className="r">Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td data-label="When" className="mono" style={{ whiteSpace: "nowrap" }}>
                      {new Date(ev.occurred_at).toLocaleString()}
                    </td>
                    <td data-label="Table" className="mono">{ev.table_name}</td>
                    <td data-label="Action">
                      <span className={`badge ${actionBadge(ev.action)}`}>
                        {ev.action}
                      </span>
                    </td>
                    <td data-label="Row" className="mono">
                      {ev.row_id ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            maxWidth: "10rem",
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ev.row_id}
                          </span>
                          <button
                            type="button"
                            aria-label="Copy row id"
                            onClick={async () => {
                              try {
                                if (!(await copyText(ev.row_id!))) throw new Error("copy refused");
                                toast.success("Copied");
                              } catch {
                                toast.error("Clipboard blocked");
                              }
                            }}
                            style={{
                              display: "grid",
                              placeItems: "center",
                              flex: "0 0 auto",
                              border: 0,
                              background: "none",
                              padding: 0,
                              cursor: "pointer",
                              color: "var(--faint)",
                            }}
                          >
                            <Copy style={{ width: 14, height: 14 }} />
                          </button>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      data-label="Actor"
                      className={
                        ev.actor_profile_id && actorNames[ev.actor_profile_id]
                          ? undefined
                          : "mono"
                      }
                      style={{
                        color: "var(--txt-2)",
                        maxWidth: "10rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={ev.actor_profile_id ?? undefined}
                    >
                      {ev.actor_profile_id
                        ? (actorNames[ev.actor_profile_id] ??
                          ev.actor_profile_id)
                        : // No actor at all is the system itself -- a cron,
                          // the deposit feed, a trigger firing without a
                          // signed-in user. Say so instead of a dash.
                          "System"}
                    </td>
                    <td data-label="Details" className="r">
                      <button
                        className="btn ghost sm"
                        onClick={() => setSelected(ev)}
                      >
                        <Eye /> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No audit events found.
          </p>
        </div>
      )}

      <TablePagination
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
      />

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            {/* The base sheet's own Close is `hidden`, so a sheet has an X
                only if it draws one. This one did not, and it is the only
                way to read an audit event in full — on a phone it covers
                the row it came from with no visible way back. */}
            <div className="flex items-center justify-between gap-3">
              <SheetTitle>Audit event details</SheetTitle>
              <SheetClose
                aria-label="Close"
                className="rounded-sm opacity-70 transition hover:opacity-100"
              >
                <XIcon size={22} />
              </SheetClose>
            </div>
            <SheetDescription>
              {selected && (
                <>
                  {selected.action} on {selected.table_name} at{" "}
                  {new Date(selected.occurred_at).toLocaleString()}
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Actor profile</p>
                  <p className="font-mono">
                    {selected.actor_profile_id
                      ? (actorNames[selected.actor_profile_id] ??
                        selected.actor_profile_id)
                      : "System"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Actor user</p>
                  <p className="font-mono">{selected.actor_user_id ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tenant</p>
                  <p className="font-mono">{selected.tenant_id ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Row</p>
                  <p className="font-mono">{selected.row_id ?? "-"}</p>
                </div>
              </div>
              {selected.action !== "INSERT" && (
                <div>
                  <p className="text-sm font-semibold mb-1">Before</p>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(selected.before_data, null, 2)}
                  </pre>
                </div>
              )}
              {selected.action !== "DELETE" && (
                <div>
                  <p className="text-sm font-semibold mb-1">After</p>
                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(selected.after_data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
