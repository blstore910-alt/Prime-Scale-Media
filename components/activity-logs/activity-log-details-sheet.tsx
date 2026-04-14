"use client";

import * as React from "react";
import { ActivityLog } from "@/lib/types/activity-log";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import dayjs from "dayjs";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { XIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatActionLabel, getDbActionBadgeClass } from "./utils";

function formatSnapshot(snapshot: unknown) {
  if (snapshot === null || snapshot === undefined) return "";
  if (typeof snapshot === "string") {
    const trimmed = snapshot.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return trimmed;
    }
  }
  try {
    return JSON.stringify(snapshot, null, 2);
  } catch {
    return String(snapshot);
  }
}

const tokenRegex =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:))|("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")|(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)|\b(true|false|null)\b|[{}\[\],:]/g;

function highlightJsonLine(line: string) {
  const tokens: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(line.slice(lastIndex, match.index));
    }

    const [value, keyToken, stringToken, numberToken, literalToken] = match;
    let className = "text-slate-200";

    if (keyToken) className = "text-sky-300";
    else if (stringToken) className = "text-amber-200";
    else if (numberToken) className = "text-emerald-300";
    else if (literalToken) className = "text-fuchsia-300";
    else className = "text-slate-400";

    tokens.push(
      <span className={className} key={`${match.index}-${value}`}>
        {value}
      </span>,
    );
    lastIndex = match.index + value.length;
  }

  if (lastIndex < line.length) {
    tokens.push(line.slice(lastIndex));
  }

  tokenRegex.lastIndex = 0;
  return tokens;
}

export default function ActivityLogDetailsSheet({
  open,
  log,
  onOpenChange,
}: {
  open: boolean;
  log: ActivityLog | null;
  onOpenChange: (open: boolean) => void;
}) {
  const snapshotText = formatSnapshot(log?.data_snapshot);
  const snapshotLines = snapshotText ? snapshotText.split("\n") : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl w-full overflow-auto">
        <SheetHeader className="sticky top-0 bg-background">
          <div className="flex items-center justify-between">
            <SheetTitle>Activity Log Details</SheetTitle>
            <SheetClose>
              <XIcon size={24} />
            </SheetClose>
          </div>
        </SheetHeader>

        {!log && (
          <div className="p-4 text-sm text-muted-foreground">
            No activity log selected.
          </div>
        )}

        {log && (
          <div className="space-y-6 p-4">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground">Author</div>
                <div className="text-sm font-medium">
                  {log.author?.full_name || "Unknown"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {log.author?.email || "--"}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Action</div>
                <Badge
                  variant="outline"
                  className={cn(getDbActionBadgeClass(log.db_action))}
                >
                  {formatActionLabel(log.action)}
                </Badge>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Table</div>
                <div className="text-sm font-medium">
                  {log.table_name || "--"}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="text-sm font-medium">
                  {log.created_at
                    ? dayjs(log.created_at).format(DATE_TIME_FORMAT)
                    : "--"}
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground">
                  Reference Record
                </div>
                <div className="text-sm font-medium break-all">
                  {log.reference_record_id || "--"}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="text-xs text-muted-foreground mb-2">
                Data Snapshot
              </div>
              {snapshotText ? (
                <pre className="rounded-lg border bg-slate-950 p-4 text-xs leading-relaxed overflow-auto text-slate-200 shadow-inner">
                  <code className="block">
                    {snapshotLines.map((line, index) => (
                      <span
                        key={`line-${index}`}
                        className="flex gap-4 leading-relaxed"
                      >
                        <span className="w-6 shrink-0 text-right text-slate-500 select-none">
                          {index + 1}
                        </span>
                        <span className="whitespace-pre-wrap wrap-break-words">
                          {highlightJsonLine(line)}
                        </span>
                      </span>
                    ))}
                  </code>
                </pre>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No snapshot available.
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
