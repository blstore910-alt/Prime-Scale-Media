"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Result = {
  walletId: string;
  fromAudit: { USD: number; EUR: number };
  currentBalance: { usd: number; eur: number };
  diff: { usd: number; eur: number };
  eventCount: number;
};

/**
 * Super-admin recovery UI wrapper around /api/wallet-recovery.
 * Opens from the /wallets page action menu; the operator pastes
 * a wallet UUID (or it's pre-filled) and gets the audit-derived
 * balance next to the live value.
 *
 * Read-only — never triggers a reconciliation. Diff is displayed
 * with a warning icon when non-zero so operators know to open
 * wallet_admin_adjust separately.
 */
export default function WalletRecoveryDialog({
  walletId: initial = "",
  triggerLabel = "Reconstruct balance",
}: {
  walletId?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (!walletId.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/wallet-recovery?wallet=${encodeURIComponent(walletId.trim())}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as Result;
      setResult(data);
    } catch (err) {
      toast.error("Recovery check failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setResult(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ShieldCheck className="h-3 w-3 mr-1" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconstruct wallet balance</DialogTitle>
          <DialogDescription>
            Replays every completed wallet top-up for this wallet from
            <span className="font-mono"> audit_events</span> and reports the
            delta versus the live balance. Read-only — will not adjust
            anything.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={walletId}
            onChange={(e) => setWalletId(e.target.value)}
            placeholder="Wallet UUID"
            className="font-mono text-xs"
          />

          {result && (
            <div className="rounded-md border p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Events examined</span>
                <span className="font-mono">{result.eventCount}</span>
              </div>
              {(["usd", "eur"] as const).map((cur) => {
                const symbol =
                  CURRENCY_SYMBOLS[
                    cur.toUpperCase() as keyof typeof CURRENCY_SYMBOLS
                  ] ?? "";
                const audit =
                  cur === "usd" ? result.fromAudit.USD : result.fromAudit.EUR;
                const live =
                  cur === "usd"
                    ? result.currentBalance.usd
                    : result.currentBalance.eur;
                const diff =
                  cur === "usd" ? result.diff.usd : result.diff.eur;
                const drifted = Math.abs(diff) > 0.005;
                return (
                  <div
                    key={cur}
                    className="grid grid-cols-4 gap-2 items-center text-xs"
                  >
                    <span className="uppercase text-muted-foreground">
                      {cur}
                    </span>
                    <span className="font-mono text-right">
                      {symbol}
                      {audit.toFixed(2)}
                    </span>
                    <span className="font-mono text-right">
                      {symbol}
                      {live.toFixed(2)}
                    </span>
                    <span
                      className={
                        "font-mono text-right " +
                        (drifted
                          ? "text-destructive font-semibold"
                          : "text-muted-foreground")
                      }
                    >
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div className="grid grid-cols-4 gap-2 text-[10px] uppercase text-muted-foreground pt-1 border-t">
                <span></span>
                <span className="text-right">From audit</span>
                <span className="text-right">Live</span>
                <span className="text-right">Diff</span>
              </div>
              {(Math.abs(result.diff.usd) > 0.005 ||
                Math.abs(result.diff.eur) > 0.005) && (
                <div className="flex items-start gap-2 mt-2 text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span className="text-xs">
                    Balance drifted. Snapshot the DB, then reconcile via
                    the <span className="font-mono">wallet_admin_adjust</span>{" "}
                    RPC.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Close
          </Button>
          <Button onClick={run} disabled={busy || !walletId.trim()}>
            {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Run check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
