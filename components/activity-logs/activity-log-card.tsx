import { ActivityLog } from "@/lib/types/activity-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatActionLabel, getDbActionBadgeClass } from "./utils";

export default function ActivityLogCard({
  log,
  onViewDetails,
}: {
  log: ActivityLog;
  onViewDetails: () => void;
}) {
  const authorName = log.author?.full_name || "Unknown";
  const authorEmail = log.author?.email || "--";

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{authorName}</div>
            <div className="text-xs text-muted-foreground">{authorEmail}</div>
          </div>
          <Badge variant="outline" className={cn(getDbActionBadgeClass(log.db_action))}>
            {formatActionLabel(log.action)}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onViewDetails}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}
