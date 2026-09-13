"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAutoPushStatus,
  testSupplier1Connection,
  testWiseConnection,
  type AutoPushStatus,
  type IntegrationPing,
} from "@/actions/integration-actions";
import { CheckCircle2, Loader2, Lock, XCircle, Zap } from "lucide-react";
import { useEffect, useState } from "react";

// Super-admin connectivity check for the external integrations. Shows the
// adapter mode (mock/live), a record count, and one redacted sample row —
// never tokens or full data. Handy for verifying the SUPPLIER1_* / WISE_*
// env vars on a preview or prod deployment.
export default function IntegrationStatusCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Check connectivity to SeamX (ad accounts) and Wise (incoming
          transfers). Uses the live credentials when the mode is set to
          &ldquo;live&rdquo;; tokens are never shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <AutoPushRow />
        <IntegrationRow label="SeamX" test={testSupplier1Connection} />
        <IntegrationRow label="Wise" test={testWiseConnection} />
      </CardContent>
    </Card>
  );
}

// The money switch, stated plainly. "Connected" and "allowed to spend" are
// two different things and an owner should never have to guess which one a
// deployment is in — especially while testing against a live supplier.
function AutoPushRow() {
  const [status, setStatus] = useState<AutoPushStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getAutoPushStatus()
      .then((res) => {
        if (!alive) return;
        if ("error" in res) setError(res.error);
        else setStatus(res);
      })
      .catch(() => alive && setError("Could not read auto-push status"));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
        Auto-push status unavailable: {error}
      </div>
    );
  }
  if (!status) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking auto-push…
      </div>
    );
  }

  return (
    <div
      className={
        status.armed
          ? "rounded-lg border border-amber-400 bg-amber-50 p-3 dark:bg-amber-950/30"
          : "rounded-lg border p-3"
      }
    >
      <div className="flex items-start gap-2">
        {status.armed ? (
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        ) : (
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 text-sm">
          <div className="font-medium">
            {status.armed
              ? "Auto-push is ARMED — paid top-ups fund ad accounts automatically"
              : "Auto-push is OFF — top-ups are funded by hand"}
          </div>
          <div className="mt-0.5 text-muted-foreground">{status.reason}</div>
          {status.held > 0 && (
            <div className="mt-1 text-muted-foreground">
              {status.held} push job{status.held === 1 ? "" : "s"} waiting.
              {status.armed
                ? " These will run on the next cron pass."
                : " Held — nothing is sent while auto-push is off."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrationRow({
  label,
  test,
}: {
  label: string;
  test: () => Promise<IntegrationPing>;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntegrationPing | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await test());
    } catch (err) {
      setResult({
        ok: false,
        mode: "?",
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{label}</div>
        <Button
          size="sm"
          variant="outline"
          onClick={run}
          disabled={loading}
          type="button"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Test connection"
          )}
        </Button>
      </div>

      {result && result.ok && (
        <div className="mt-2 flex items-start gap-2 text-sm text-green-600">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <div>
              Connected — mode <b>{result.mode}</b>
              {result.note
                ? "."
                : `, ${result.count} record${result.count === 1 ? "" : "s"}.`}
            </div>
            {result.sample && (
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs text-foreground">
                {JSON.stringify(result.sample, null, 2)}
              </pre>
            )}
            {result.note && (
              <div
                className={
                  result.note.includes("FAILED")
                    ? "mt-1 text-amber-600"
                    : "mt-1 text-muted-foreground"
                }
              >
                {result.note}
              </div>
            )}
          </div>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-2 flex items-start gap-2 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 break-words">
            Failed (mode {result.mode}): {result.error}
          </div>
        </div>
      )}
    </div>
  );
}
