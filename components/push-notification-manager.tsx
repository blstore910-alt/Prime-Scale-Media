"use client";

import { urlBase64ToUint8Array } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  // Read synchronously, before the first paint. It used to be checked
  // inside the effect, so somebody who had already dismissed this still
  // got a render pass with it mounted — one more thing appearing and
  // disappearing while the page settles.
  const [isVisible, setIsVisible] = useState(false);
  const [dismissedBefore] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("push-notification-dismissed") === "true";
    } catch {
      return false;
    }
  });
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

      if (dismissedBefore) {
        setIsVisible(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setSubscription(sub);

        if (!sub && Notification.permission !== "denied") {
          // Late enough that the dashboard has finished settling. It no
          // longer reflows anything, so there is no cost to waiting, and
          // arriving in the middle of the first paint is what made it
          // feel like part of the loading.
          timer = setTimeout(() => setIsVisible(true), 3500);
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
  }, [isSupported, dismissedBefore]);

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
        throw new Error("Push notifications aren't configured on the server.");
      }

      // Ask for permission explicitly so we can give a clear message when
      // it's blocked — private/incognito windows deny push outright.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications are blocked", {
          description:
            "Allow notifications for this site. Note: private/incognito windows block push — use a normal window.",
        });
        return;
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
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializedSub),
      });
      if (!res.ok) {
        throw new Error("Failed to register push subscription");
      }
      toast.success("Push notifications enabled.");
      setIsVisible(false);
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
      toast.error("Couldn't enable push notifications", {
        description:
          "Private/incognito windows block push. Open the app in a normal window and try again. On iPhone, add the app to your Home Screen first.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const dismissBanner = () => {
    setIsVisible(false);
    localStorage.setItem("push-notification-dismissed", "true");
  };

  if (!isSupported || !isVisible || subscription || dismissedBefore) {
    return null;
  }

  return (
    // ── IT NO LONGER PUSHES THE PAGE DOWN ───────────────────────────
    //
    // This rendered ABOVE the whole app, in the layout's normal flow, and
    // appeared 1.2 seconds after load — so the first thing an advertiser
    // saw was the dashboard jumping down by the height of a card they had
    // not asked for. It was also a bare shadcn card in the middle of a
    // shell that looks nothing like one.
    //
    // Fixed to the bottom instead: it floats over the content, above the
    // mobile thumb bar and inside the safe area, and moves nothing when
    // it arrives or leaves. Narrow, so on a desktop it reads as a prompt
    // rather than a banner.
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "calc(84px + env(safe-area-inset-bottom))" }}
    >
      <div className="pointer-events-auto relative w-full max-w-md rounded-2xl border bg-card text-card-foreground shadow-lg">
        <button
          type="button"
          onClick={dismissBanner}
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Dismiss notification prompt"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-3 p-4 pr-10">
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
