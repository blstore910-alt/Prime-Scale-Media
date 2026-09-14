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
  probeSupplierAdAccount,
  testSupplier1Connection,
  testWiseConnection,
  type AutoPushStatus,
  type IntegrationPing,
  type SupplierAccountProbe,
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
        <AccountProbeRow />
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

// Read-only probe of one supplier ad account. Answers the question the docs
// do not: the wallet balance splits gross from spendable-after-tax-reserve,
// but the per-account balance has no such split, so we cannot yet tell whether
// it is before or after DST. Until that is settled the figure is not shown to
// advertisers — a gross number would tell them they can spend money they can't.
function AccountProbeRow() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<SupplierAccountProbe | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      setRes(await probeSupplierAdAccount(id));
    } catch (err) {
      setRes({
        ok: false,
        mode: "?",
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const money = (n: number) =>
    n.toLocaleString("nl-NL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="rounded-lg border p-3">
      <div className="font-medium">Inspect an ad account</div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Reads one account&apos;s balance straight from the supplier, next to the
        wallet figures. Nothing is written.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Supplier ad account id (e.g. 70093)"
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-base sm:text-sm"
          aria-label="Supplier ad account id"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={run}
          disabled={loading || !id.trim()}
          type="button"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inspect"}
        </Button>
      </div>

      {res && !res.ok && (
        <div className="mt-2 flex items-start gap-2 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 break-words">
            Failed (mode {res.mode}): {res.error}
          </div>
        </div>
      )}

      {res && res.ok && (
        <div className="mt-2 space-y-2 text-sm">
          <div className="text-muted-foreground">
            mode <b>{res.mode}</b> · account <b>{res.externalId}</b>
          </div>

          {res.accountBalance ? (
            <div>
              Account balance:{" "}
              <b>
                {res.accountBalance.currency}{" "}
                {money(res.accountBalance.balance_cents / 100)}
              </b>
            </div>
          ) : (
            <div className="text-amber-600">
              Account balance unavailable: {res.accountBalanceError}
            </div>
          )}

          {res.wallet ? (
            <div className="rounded bg-muted p-2 font-mono text-xs text-foreground">
              USD gross {money(res.wallet.usd_balance)} · spendable{" "}
              {money(res.wallet.available_usd)}
              <br />
              EUR gross {money(res.wallet.eur_balance)} · spendable{" "}
              {money(res.wallet.available_eur)}
            </div>
          ) : (
            <div className="text-amber-600">
              Wallet balance unavailable: {res.walletError}
            </div>
          )}

          <p className="text-muted-foreground">{res.note}</p>
        </div>
      )}
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
