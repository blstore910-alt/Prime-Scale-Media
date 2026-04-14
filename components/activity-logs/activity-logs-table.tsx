"use client";

import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import {
  ACTIVITY_LOG_ACTIONS,
  ACTIVITY_LOG_DB_ACTIONS,
} from "@/lib/activity-log-actions";
import useActivityLogs from "./use-activity-logs";
import ActivityLogRow from "./activity-log-row";
import ActivityLogCard from "./activity-log-card";
import ActivityLogDetailsSheet from "./activity-log-details-sheet";
import { ActivityLog } from "@/lib/types/activity-log";
import { formatActionLabel } from "./utils";

const actionOptions = [
  { label: "All Actions", value: "all" },
  ...ACTIVITY_LOG_ACTIONS.map((item) => ({
    label: formatActionLabel(item),
    value: item,
  })),
];

export default function ActivityLogsTable() {
  const [action, setAction] = useState("all");
  const [dbAction, setDbAction] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const isTabletScreen = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    setPage(1);
  }, [action, dbAction]);

  const { logs, total, isLoading, isError, error } = useActivityLogs({
    action,
    dbAction,
    page,
    perPage,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Activity Logs
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitor system activity and review audit events.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isTabletScreen ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Author</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">View Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: 3 }).map((__, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">
                        Failed to load activity logs.
                      </p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : logs.length ? (
                logs.map((log) => (
                  <ActivityLogRow
                    key={log.id}
                    log={log}
                    onViewDetails={() => setSelectedLog(log)}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No activity logs found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 rounded-md bg-muted animate-pulse"
              />
            ))
          ) : isError ? (
            <div className="text-center text-destructive py-8">
              <p className="font-medium">Failed to load activity logs.</p>
              <p className="mt-2 text-sm">
                {(error as Error)?.message ?? String(error)}
              </p>
            </div>
          ) : logs.length ? (
            logs.map((log) => (
              <ActivityLogCard
                key={log.id}
                log={log}
                onViewDetails={() => setSelectedLog(log)}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No activity logs found.
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      </div>

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

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
