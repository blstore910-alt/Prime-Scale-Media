"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { catalogForRole } from "@/lib/notification-catalog";
import useNotificationPreferences from "@/hooks/use-notification-preferences";
import { useAppContext } from "@/context/app-provider";
import { Loader2 } from "lucide-react";

export default function NotificationPreferencesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { profile } = useAppContext();
  const entries = catalogForRole(profile?.role);
  const { isLoading, isEnabled, setPreference } = useNotificationPreferences();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notification preferences</DialogTitle>
          <DialogDescription>
            Choose which notifications ping your device. You&apos;ll still see
            everything in this list — this only controls push alerts.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {entries.map((entry) => {
              const checked = isEnabled(entry.type);
              return (
                <div
                  key={entry.type}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <Label
                      htmlFor={`pref-${entry.type}`}
                      className="text-sm font-medium"
                    >
                      {entry.label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {entry.description}
                    </p>
                  </div>
                  <Switch
                    id={`pref-${entry.type}`}
                    checked={checked}
                    disabled={setPreference.isPending}
                    onCheckedChange={(value) =>
                      setPreference.mutate({ type: entry.type, enabled: value })
                    }
                  />
                </div>
              );
            })}
            {entries.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No notification types available for your account.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
