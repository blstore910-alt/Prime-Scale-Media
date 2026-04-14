import { ActivityLog } from "@/lib/types/activity-log";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatActionLabel, getDbActionBadgeClass } from "./utils";

export default function ActivityLogRow({
  log,
  onViewDetails,
}: {
  log: ActivityLog;
  onViewDetails: () => void;
}) {
  const authorName = log.author?.full_name || "Unknown";
  const authorEmail = log.author?.email || "--";

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{authorName}</span>
          <span className="text-xs text-muted-foreground">{authorEmail}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(getDbActionBadgeClass(log.db_action))}
        >
          {formatActionLabel(log.action)}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onViewDetails}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </Button>
      </TableCell>
    </TableRow>
  );
}
