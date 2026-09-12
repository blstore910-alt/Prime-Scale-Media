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
  testSupplier1Connection,
  testWiseConnection,
  type IntegrationPing,
} from "@/actions/integration-actions";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

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
        <IntegrationRow label="SeamX" test={testSupplier1Connection} />
        <IntegrationRow label="Wise" test={testWiseConnection} />
      </CardContent>
    </Card>
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
              Connected — mode <b>{result.mode}</b>, {result.count} record
              {result.count === 1 ? "" : "s"}.
            </div>
            {result.sample && (
              <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs text-foreground">
                {JSON.stringify(result.sample, null, 2)}
              </pre>
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
