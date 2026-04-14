"use client";

import { subscribeUser } from "@/actions/push-actions";
import { urlBase64ToUint8Array } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    ) {
      setIsSupported(true);
      registerServiceWorker();
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const checkStatus = async () => {
      if (!isSupported) return;

      const dismissed = localStorage.getItem("push-notification-dismissed");
      if (dismissed) {
        setIsVisible(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setSubscription(sub);

        if (!sub && Notification.permission !== "denied") {
          timer = setTimeout(() => setIsVisible(true), 1200);
        } else {
          setIsVisible(false);
        }
      } catch (error) {
        console.error("Error checking push status:", error);
      }
    };

    checkStatus();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isSupported]);

  async function registerServiceWorker() {
    try {
      await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
    } catch (error) {
      console.error("Service worker registration failed:", error);
    }
  }

  async function subscribeToPush() {
    setIsLoading(true);
    try {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
      }

      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });
      setSubscription(sub);
      const serializedSub = JSON.parse(JSON.stringify(sub));
      await subscribeUser(serializedSub);
      setIsVisible(false);
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
    } finally {
      setIsLoading(false);
    }
  }

  const dismissBanner = () => {
    setIsVisible(false);
    localStorage.setItem("push-notification-dismissed", "true");
  };

  if (!isSupported || !isVisible || subscription) {
    return null;
  }

  return (
    <div className="w-full px-4 py-2">
      <div className="relative rounded-xl border bg-card text-card-foreground shadow-sm">
        <button
          type="button"
          onClick={dismissBanner}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss notification prompt"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-4 p-4 pr-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Bell className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                Enable push notifications
              </h3>
              <p className="text-sm text-muted-foreground">
                Receive updates about campaigns, requests, and account activity.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={subscribeToPush} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enabling...
                </>
              ) : (
                "Enable"
              )}
            </Button>
            <Button variant="ghost" onClick={dismissBanner}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
