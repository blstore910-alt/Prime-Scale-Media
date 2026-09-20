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
  // isError, for the reason the hook's own comment gives: an empty
  // preference list reads as "nothing is disabled", so every toggle
  // rendered ON for an admin who had switched one off. They toggle it
  // again and write a preference that was already there.
  const { isLoading, isError, isEnabled, setPreference } =
    useNotificationPreferences();

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
                      {isError
                        ? "We couldn't read your settings just now."
                        : entry.description}
                    </p>
                  </div>
                  <Switch
                    id={`pref-${entry.type}`}
                    checked={isError ? false : checked}
                    disabled={setPreference.isPending || isError}
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
