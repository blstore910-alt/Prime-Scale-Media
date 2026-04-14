import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { UserInvitation } from "@/lib/types/invite";
import dayjs from "dayjs";
import { X } from "lucide-react";
import { InvitationStatusBadge } from "./invites-table";

export default function InviteCard({
  invite,
  onCancel,
}: {
  invite: UserInvitation;
  onCancel?: (id?: string) => void;
}) {
  const canCancel = !["accepted", "cancelled"].includes(invite.status);

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow p-2">
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <CardTitle className="text-sm">{invite?.email || "—"}</CardTitle>
          </div>
          <div className="text-end">
            <InvitationStatusBadge status={invite?.status} />
            <p className="text-muted-foreground text-sm mt-1">
              {invite?.created_at
                ? dayjs(invite.created_at).format("MMM D, YYYY")
                : "—"}
            </p>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">From:</p>
          <p className="text-sm">
            {invite?.sender?.full_name || "—"}
            <br />
            <span>{invite?.sender?.email || "—"}</span>
          </p>
        </div>

        <div className="flex gap-2 mt-3">
          {canCancel && onCancel && (
            <Button
              variant="outline"
              className="flex-1"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(invite?.id);
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
