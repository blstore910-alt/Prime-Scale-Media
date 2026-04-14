import { Notification } from "@/lib/types/notification";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  CreditCard,
  Info,
  UserPlus,
  WalletCards,
} from "lucide-react";
import { getNotificationCopy } from "./notification-utils";

interface NotificationItemProps {
  notification: Notification;
  onClick: (notification: Notification) => void;
}

export default function NotificationItem({
  notification,
  onClick,
}: NotificationItemProps) {
  const isRead = notification.is_read;
  const { title, description } = getNotificationCopy(notification);

  const icon =
    notification.type === "topup_completed" ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : notification.type === "topup_created" ? (
      <CreditCard className="h-4 w-4 text-amber-600" />
    ) : notification.type === "ad_account_request_created" ? (
      <Info className="h-4 w-4 text-blue-600" />
    ) : notification.type === "user_profile_created" ? (
      <UserPlus className="h-4 w-4 text-indigo-600" />
    ) : notification.type === "wallet_topup_created" ? (
      <WalletCards className="h-4 w-4 text-emerald-600" />
    ) : (
      <Info className="h-4 w-4 text-primary" />
    );

  return (
    <div
      onClick={() => onClick(notification)}
      className={cn(
        "flex items-start gap-3 p-3 text-sm transition-colors hover:bg-accent cursor-pointer border-b last:border-0",
        !isRead && "bg-muted/40",
      )}
    >
      <div className="mt-1">
        {icon}
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-medium leading-none">{title}</p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {description}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(notification.created_at), {
            addSuffix: true,
          })}
        </p>
      </div>
      {!isRead && (
        <div className="mt-1 h-2 w-2 rounded-full bg-blue-600 shrink-0" />
      )}
    </div>
  );
}
