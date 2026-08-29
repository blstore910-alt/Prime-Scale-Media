"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string | null;
};

/**
 * Root-level React error boundary. Renders a recovery UI instead of
 * a blank white screen and ships the error to /api/log/client-error
 * so we know it happened without waiting for a user report.
 *
 * Mount this once near the top of the (app) layout; per-page
 * boundaries can still wrap individual routes for finer isolation.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Report to server, best-effort.
    try {
      const body = JSON.stringify({
        message: error?.message ?? "Unknown error",
        stack: error?.stack ?? "",
        componentStack: info?.componentStack ?? "",
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      });
      // fire-and-forget; navigator.sendBeacon survives page unload.
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon(
          "/api/log/client-error",
          new Blob([body], { type: "application/json" }),
        );
      } else {
        void fetch("/api/log/client-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      // Report failing is not fatal for the recovery UI.
    }
  }

  reset = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  reload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="mx-auto max-w-lg py-16 px-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-1">
          The page couldn&apos;t render. We&apos;ve been notified.
        </p>
        {this.state.errorMessage && (
          <p className="text-xs text-muted-foreground font-mono mt-2 break-all">
            {this.state.errorMessage}
          </p>
        )}
        <div className="mt-6 flex gap-2 justify-center">
          <Button onClick={this.reset}>Try again</Button>
          <Button variant="outline" onClick={this.reload}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
