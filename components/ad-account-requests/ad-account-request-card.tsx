import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import dayjs from "dayjs";
import { Eye, PlusCircle, XCircle } from "lucide-react";

function getStatusClassName(status: string | null) {
  if (!status) return "border-slate-300 text-slate-700";

  switch (status.toLowerCase()) {
    case "approved":
    case "completed":
      return "border-green-200 text-green-700";
    case "rejected":
    case "failed":
      return "border-red-200 text-red-700";
    case "pending":
    default:
      return "border-amber-200 text-amber-700";
  }
}

export default function AdAccountRequestCard({
  request,
  onView,
  onCreateAdAccount,
  onReject,
}: {
  request: AdAccountRequest;
  onView?: (requestId: string) => void;
  onCreateAdAccount?: (request: AdAccountRequest) => void;
  onReject?: (request: AdAccountRequest) => void;
}) {
  const statusValue = (request.status || "").toLowerCase();
  const isAlreadyCompleted = ["completed", "approved", "rejected"].includes(
    statusValue,
  );
  const canReject = !["completed", "approved", "rejected"].includes(
    statusValue,
  );
  const hasAdvertiser = !!request.advertiser_id;
  const canCreateAdAccount = !isAlreadyCompleted && hasAdvertiser;

  return (
    <Card className="p-2">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground break-words">
              {request.advertiser?.tenant_client_code || "-"} &middot;{" "}
              {request.advertiser?.profile?.full_name || "-"}
            </p>
            <CardTitle className="text-sm break-all">
              {request.email || "-"}
            </CardTitle>
          </div>
          <Badge
            variant="outline"
            className={`capitalize ${getStatusClassName(request.status)}`}
          >
            {request.status || "unknown"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-4">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Platform</span>
            <span className="font-medium">{request.platform || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Currency</span>
            <span className="font-medium uppercase">
              {request.currency || "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Timezone</span>
            <span className="font-medium">{request.timezone || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Requested At</span>
            <span className="font-medium">
              {request.created_at
                ? dayjs(request.created_at).format(DATE_TIME_FORMAT)
                : "-"}
            </span>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-muted-foreground">Website</span>
            {request.website_url ? (
              <a
                href={request.website_url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline break-all"
              >
                {request.website_url}
              </a>
            ) : (
              <span className="font-medium">-</span>
            )}
          </div>
        </div>

        {(onView || canCreateAdAccount || canReject) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 pt-4 border-t">
            {onView && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onView(request.id);
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                View
              </Button>
            )}
            {onCreateAdAccount && canCreateAdAccount && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateAdAccount(request);
                }}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Ad Account
              </Button>
            )}
            {onReject && canReject && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(request);
                }}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
