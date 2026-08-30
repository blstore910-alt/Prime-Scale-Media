"use client";

import { useState, useEffect } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { cn } from "@/lib/utils";
import { Copy, Download, Eye } from "lucide-react";
import { toast } from "sonner";
import useAuditEvents, { type AuditEvent } from "./use-audit-events";

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
  const [action, setAction] = useState("all");
  const [rowIdInput, setRowIdInput] = useState(rowIdFromUrl);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const { events, total, isLoading, isError, error } = useAuditEvents({
    table,
    action,
    rowId: rowIdFromUrl || undefined,
    page,
    perPage,
  });

  async function downloadCsv() {
    setExporting(true);
    try {
      // Last 30 days by default; matches the "recent activity" mental model.
      const to = new Date().toISOString();
      const from = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
      const params = new URLSearchParams({
        from,
        to,
        ...(table !== "all" ? { table } : {}),
        ...(action !== "all" ? { action } : {}),
      });
      const res = await fetch(`/api/audit/export?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Audit CSV downloaded");
    } catch (err) {
      toast.error("CSV export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Audit log</h2>
          <p className="text-sm text-muted-foreground">
            Every insert / update / delete on the audited tables. Append-only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={table}
            onValueChange={(v) => {
              setTable(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Table" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tables</SelectItem>
              {AUDITED_TABLES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="INSERT">INSERT</SelectItem>
              <SelectItem value="UPDATE">UPDATE</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCsv}
            disabled={exporting}
          >
            <Download className="h-3 w-3 mr-1" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={rowIdInput}
          onChange={(e) => setRowIdInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyRowId();
          }}
          placeholder="Filter by row id (paste a uuid) and press Enter"
          className="font-mono text-xs max-w-lg"
        />
        {rowIdFromUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRowIdInput("");
              const params = new URLSearchParams(searchParams?.toString());
              params.delete("row");
              router.replace(`${pathname}?${params.toString()}`);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Row</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-24 bg-muted rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-destructive py-8">
                  {(error as Error)?.message ?? "Failed to load audit events."}
                </TableCell>
              </TableRow>
            ) : events.length ? (
              events.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {new Date(ev.occurred_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {ev.table_name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        ev.action === "INSERT" &&
                          "bg-green-600 hover:bg-green-700 text-white",
                        ev.action === "UPDATE" &&
                          "bg-blue-600 hover:bg-blue-700 text-white",
                        ev.action === "DELETE" && "",
                      )}
                      variant={ev.action === "DELETE" ? "destructive" : "default"}
                    >
                      {ev.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {ev.row_id ? (
                      <span className="inline-flex items-center gap-1 max-w-[10rem]">
                        <span className="truncate">{ev.row_id}</span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Copy row id"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(ev.row_id!);
                              toast.success("Copied");
                            } catch {
                              toast.error("Clipboard blocked");
                            }
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[10rem]">
                    {ev.actor_profile_id ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected(ev)}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center py-8 text-muted-foreground"
                >
                  No audit events found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="p-4">
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={setPage}
        />
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Audit event details</SheetTitle>
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
                  <p className="font-mono">{selected.actor_profile_id ?? "-"}</p>
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
