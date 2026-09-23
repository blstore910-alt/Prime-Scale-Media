"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  createWalletPrecharge,
  settleWalletPrecharge,
} from "@/actions/precharge-actions";
import { formatCurrency } from "@/lib/utils";

type AdvertiserOption = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null; email: string | null } | null;
};

type PrechargeRow = {
  id: string;
  reference: string | null;
  amount: number;
  outstanding: number;
  currency: "USD" | "EUR";
  status: string;
  reason: string | null;
  created_at: string;
  advertiser: AdvertiserOption | null;
};

export default function PrechargePanel() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settling, setSettling] = useState<{
    id: string;
    amount: number;
    currency: string;
    who: string | null;
  } | null>(null);

  const { data: rows, isLoading, isError, refetch } = useQuery({
    queryKey: ["wallet-precharges", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_precharges")
        .select(
          "id, reference, amount, outstanding, currency, status, reason, created_at, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PrechargeRow[];
    },
  });

  // TAKE IT BACK, when the payment is not coming.
  //
  // The panel offered only "Settle", which means *the money arrived*. So
  // a precharged top-up that turned out to be wrong left the desk
  // choosing between recording something untrue and leaving a customer
  // holding money for a payment we refused. The RPC has existed since
  // 20260918290000 and had no caller anywhere in the app.
  const [cancelling, setCancelling] = useState<{
    id: string;
    amount: number;
    currency: string;
    who: string | null;
  } | null>(null);

  const cancelAdvance = useMutation({
    mutationFn: async (id: string) => {
      const { cancelWalletPrecharge } = await import(
        "@/actions/precharge-actions"
      );
      const res = await cancelWalletPrecharge(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Advance cancelled — the credit is back out");
      setCancelling(null);
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      // ["outstanding-precharges"] TOO. The verify dialog caches whether
      // this top-up carries an advance, and it never remounts — `selected`
      // is not reset to null and the query has no refetch interval. So
      // after settling or cancelling here, Verify one tab across still
      // says "the balance will NOT go up again — it is already there"
      // and prints "Wallet changes by 0.00". It goes up by the full
      // amount, and an admin who then corrects the missing movement by
      // hand leaves the customer a whole top-up ahead.
      queryClient.invalidateQueries({ queryKey: ["outstanding-precharges"] });
      // AND THE BADGE ON THE TAB THIS PANEL SITS IN. ["money-in-counts"]
      // has a 30s staleTime, no refetch interval, and refetchOnWindowFocus
      // is off -- so while /wallet-topups stays open there is no trigger
      // at all. Advance credit from here and the Precharge tab keeps
      // saying 0: "no credit is out the door", with credit out the door.
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't cancel that advance", { description: e.message }),
  });

  const settle = useMutation({
    mutationFn: async (id: string) => {
      setSettlingId(id);
      const res = await settleWalletPrecharge(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Precharge settled");
      setSettling(null);
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-precharges"] });
      // AND THE BADGE ON THE TAB THIS PANEL SITS IN. ["money-in-counts"]
      // has a 30s staleTime, no refetch interval, and refetchOnWindowFocus
      // is off -- so while /wallet-topups stays open there is no trigger
      // at all. Advance credit from here and the Precharge tab keeps
      // saying 0: "no credit is out the door", with credit out the door.
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
    },
    onError: (e: Error) =>
      toast.error("Settle failed", { description: e.message }),
    onSettled: () => setSettlingId(null),
  });

  const list = rows ?? [];
  // PER CURRENCY. This added them together: one $1,000 advance and one
  // €500 advance printed "1500.00" with no symbol at all, captioned
  // "outstanding advances across all customers" — a figure that is neither
  // €1,360 nor $1,581.40, on the banner that tells you how much credit is
  // out the door.
  const outstandingByCurrency = list
    .filter((r) => r.status === "outstanding")
    .reduce<Record<string, number>>((acc, r) => {
      const cur = String(r.currency ?? "USD").toUpperCase();
      acc[cur] = (acc[cur] ?? 0) + Number(r.outstanding);
      return acc;
    }, {});
  const outstandingEntries = Object.entries(outstandingByCurrency).filter(
    ([, v]) => v > 0,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* The title and the sentence under it moved to the tab bar, which
          already named this panel. */}
      <div className="flex items-start justify-end gap-4">
        <Button onClick={() => setCreateOpen(true)}>New precharge</Button>
      </div>

      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          The outstanding total is unknown right now — the read failed.
        </div>
      )}
      {!isError && outstandingEntries.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Outstanding advances across all customers:{" "}
          {outstandingEntries.map(([cur, total], i) => (
            <span key={cur}>
              {i > 0 ? " · " : ""}
              <span className="font-semibold tabular-nums">
                {formatCurrency(total, cur)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Below sm each advance is a card: the head row is hidden, every cell
          carries its own label from data-label, and nothing has to be dragged
          sideways. Six columns of money do not fit 400px and the user has
          asked for no horizontal scrolling anywhere. */}
      <div className="rounded-lg border sm:overflow-x-auto">
        <Table className="[&_td]:block [&_td]:before:mr-2 [&_td]:before:font-medium [&_td]:before:text-muted-foreground [&_td]:before:content-[attr(data-label)] [&_tr]:block [&_tr]:border-b [&_tr]:p-3 sm:[&_td]:table-cell sm:[&_td]:before:content-none sm:[&_tr]:table-row sm:[&_tr]:p-0">
          <TableHeader className="hidden sm:table-header-group sm:sticky sm:top-0 sm:z-10 sm:bg-background">
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Advertiser</TableHead>
              <TableHead>Advanced</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              // NOT "no precharges yet". A failed read emptied the list and
              // removed the outstanding banner with it, on the screen that
              // tells you how much credit is out the door before a payment
              // has cleared.
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <p className="text-sm font-medium text-destructive">
                    We couldn&apos;t load the advances — this is NOT an empty
                    list.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => refetch()}
                  >
                    Try again
                  </Button>
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  No precharges yet.
                </TableCell>
              </TableRow>
            ) : (
              list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs" data-label="Ref:">
                    {r.reference ?? "—"}
                  </TableCell>
                  {/* Code first, name beneath — the same identity block every
                      other admin list uses. data-label like its five
                      siblings: without it this rendered as a bare client
                      code between two money columns in card mode, on the
                      screen where you decide whether somebody still owes
                      an advance. */}
                  <TableCell data-label="Advertiser:">
                    <div className="text-sm font-semibold">
                      {r.advertiser?.tenant_client_code ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.advertiser?.profile?.full_name ?? ""}
                    </div>
                  </TableCell>
                  <TableCell
                    className="font-mono tabular-nums"
                    data-label="Advanced:"
                  >
                    {formatCurrency(Number(r.amount), r.currency)}
                  </TableCell>
                  <TableCell
                    className="font-mono font-semibold tabular-nums"
                    data-label="Outstanding:"
                  >
                    {formatCurrency(Number(r.outstanding), r.currency)}
                  </TableCell>
                  <TableCell data-label="Status:">
                    {/* THE LABEL WAS FIXED AND THE BADGE WAS NOT. This
                        was a two-way branch — outstanding is amber,
                        EVERYTHING ELSE is the green of a settled advance
                        — so a CANCELLED one, where the payment never
                        arrived and the credit was taken back out, wore
                        the same success colour as one that was paid.
                        Colour reads faster than the word next to it. */}
                    <Badge
                      className={`border-transparent capitalize ${
                        r.status === "outstanding"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : r.status === "cancelled"
                            ? "bg-muted text-muted-foreground line-through"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      }`}
                      title={
                        r.status === "cancelled"
                          ? "The payment never arrived — the credit was taken back out"
                          : undefined
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="sm:text-right" data-label="">
                    {r.status === "outstanding" ? (
                      /* SETTLING TAKES THE ADVANCE BACK OUT OF THE
                         CUSTOMER'S WALLET, immediately and with no
                         un-settle — the RPC refuses any status that is not
                         'outstanding'. Every comparable button in this app
                         asks first: verify, precharge, approve a
                         withdrawal, pay, deactivate, mark paid. This one
                         was the exception, in a list of rows, one misclick
                         from real money. */
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={settlingId === r.id}
                        onClick={() =>
                          setSettling({
                            id: r.id,
                            amount: Number(r.outstanding),
                            currency: r.currency ?? "EUR",
                            who:
                              r.advertiser?.profile?.full_name ??
                              r.advertiser?.tenant_client_code ??
                              null,
                          })
                        }
                      >
                        {settlingId === r.id ? "…" : "Settle"}
                      </Button>
                    ) : null}
                    {r.status === "outstanding" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={cancelAdvance.isPending}
                        title="The payment is not coming — take the credit back out"
                        onClick={() =>
                          setCancelling({
                            id: r.id,
                            amount: Number(r.outstanding),
                            currency: r.currency ?? "EUR",
                            who:
                              r.advertiser?.profile?.full_name ??
                              r.advertiser?.tenant_client_code ??
                              null,
                          })
                        }
                      >
                        Cancel
                      </Button>
                    ) : (
                      // NOT "settled" FOR EVERYTHING THAT IS NOT
                      // OUTSTANDING. There are three statuses, and this
                      // printed the same word for two of them — so an
                      // advance the admin had just CANCELLED came back
                      // reading "settled", which is the one thing the
                      // cancel dialog on this very screen says it must
                      // not: "the advance is closed as cancelled rather
                      // than settled — settled would record that the
                      // money arrived." The money did not arrive; that
                      // is why it was cancelled. Reading the row later,
                      // the table said the payment cleared.
                      <span
                        className={
                          r.status === "cancelled"
                            ? "text-xs text-muted-foreground line-through"
                            : "text-xs text-muted-foreground"
                        }
                        title={
                          r.status === "cancelled"
                            ? "The payment never arrived — the credit was taken back out"
                            : "The payment arrived and the advance was closed"
                        }
                      >
                        {r.status === "cancelled" ? "cancelled" : "settled"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PrechargeCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
      />

      {/* Cancelling is the verb that was missing. The RPC refuses to push
          a wallet below zero and names the shortfall when it cannot
          proceed, so a customer who has already spent part of the advance
          produces a sentence an admin can act on rather than a negative
          balance nobody chose. */}
      <ConfirmModal
        open={!!cancelling}
        onOpenChange={(next) => {
          if (!next && !cancelAdvance.isPending) setCancelling(null);
        }}
        title="Cancel this advance?"
        lead="Use this when the payment is not coming. The credit comes back out of their wallet, and the advance is closed as cancelled rather than settled — settled would record that the money arrived."
        cta="Yes, cancel it"
        tone="danger"
        busy={cancelAdvance.isPending}
        busyLabel="Cancelling…"
        onConfirm={() => {
          if (cancelling) cancelAdvance.mutate(cancelling.id);
        }}
      >
        <ConfirmFact label="Customer" value={cancelling?.who ?? "—"} />
        <ConfirmFact
          label="Comes back out"
          value={
            cancelling
              ? formatCurrency(cancelling.amount, cancelling.currency)
              : "—"
          }
        />
      </ConfirmModal>

      {/* Settling takes the advance back out of the customer's wallet and
          cannot be undone — the RPC refuses anything that is not still
          outstanding. So it asks, with the three facts that decide it. */}
      <ConfirmModal
        open={!!settling}
        onOpenChange={(next) => {
          if (!next && !settle.isPending) setSettling(null);
        }}
        title="Settle this advance?"
        lead="The money comes straight back out of their wallet. There is no un-settle — only a new advance."
        cta="Yes, settle it"
        tone="danger"
        busy={settle.isPending}
        busyLabel="Settling…"
        onConfirm={() => {
          if (settling) settle.mutate(settling.id);
        }}
      >
        <ConfirmFact label="Customer" value={settling?.who ?? "—"} />
        <ConfirmFact
          label="Comes out of their wallet"
          value={
            settling
              ? formatCurrency(settling.amount, settling.currency)
              : "—"
          }
        />
      </ConfirmModal>
    </div>
  );
}

function PrechargeCreateDialog({
  open,
  onOpenChange,
  tenantId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string | null;
}) {
  const queryClient = useQueryClient();
  const [advertiserId, setAdvertiserId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
  const [reason, setReason] = useState("");

  // ── AN ADVANCE IN THE WRONG CURRENCY IS OUR MONEY ───────────────────
  //
  // The reset left `currency` where the last advance put it. Advance EUR
  // 2,000 to one customer; later a different customer wires $5,000, the
  // admin types 5000 and the field still reads EUR — so eur_balance is
  // credited 5,000, about $5,814 of spendable credit against a $5,000
  // payment. The customer can spend it before the top-up is verified,
  // and settling then tries to take EUR 5,000 back out of a wallet whose
  // euros have gone, so the advance cannot be closed at all.
  const [primedFor, setPrimedFor] = useState(false);
  if (open && !primedFor) {
    setPrimedFor(true);
    setAdvertiserId("");
    setAmount("");
    setCurrency("USD");
    setReason("");
  }
  if (!open && primedFor) setPrimedFor(false);

  // ── AN EMPTY DROPDOWN IS NOT "NO CUSTOMERS" ──────────────────────
  //
  // isError was not destructured, so a refused read gave an empty list
  // and a permanently disabled button with no explanation -- on the
  // control that moves money back to a customer. And .limit(200) is a
  // silent cap: customer 201 simply could not be chosen, with nothing
  // saying why.
  const { data: advertisers, isError: advertisersError } = useQuery({
    queryKey: ["precharge-advertisers", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select(
          "id, tenant_client_code, profile:user_profiles(full_name, email)",
        )
        .eq("tenant_id", tenantId)
        .order("tenant_client_code", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as AdvertiserOption[];
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await createWalletPrecharge({
        advertiser_id: advertiserId,
        amount: Number(amount),
        currency,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Precharge created — wallet credited");
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      // The two lists and the badge the other two mutations refresh. An
      // advance that does not show up on the Precharge tab is credit
      // out the door under a count that still reads 0.
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-precharges"] });
      queryClient.invalidateQueries({ queryKey: ["money-in-counts"] });
      setAdvertiserId("");
      setAmount("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't create precharge", { description: e.message }),
  });

  // ── DOES THIS CUSTOMER ALREADY HAVE A TOP-UP WAITING? ───────────────
  // A precharge made HERE carries no source_wallet_topup_id, and the
  // balance trigger settles only advances that name the top-up they
  // belong to. So: advance credit from this dialog, then verify the
  // customer's pending top-up on the tab next door, and the wallet is
  // credited TWICE — the advance is still outstanding and nothing links
  // them. The two buttons sit a few centimetres apart and look
  // interchangeable; only the per-top-up one settles itself.
  const {
    data: pendingForAdvertiser,
    isLoading: pendingLoading,
    isError: pendingError,
  } = useQuery({
    queryKey: ["precharge-pending-topups", advertiserId],
    enabled: !!advertiserId && open,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("id, amount, currency")
        .eq("advertiser_id", advertiserId)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        amount: number | string;
        currency: string | null;
      }>;
    },
  });
  const hasPending = (pendingForAdvertiser ?? []).length > 0;
  // UNKNOWN IS NOT "NO". `?? []` turns a failed or still-running query
  // into an empty list, which reads as "they have nothing pending" — so
  // an RLS hiccup, an offline blip, or simply clicking Create before the
  // query resolved took the only control off this money path and let the
  // double credit through. The guard has to hold when it cannot see.
  const guardBlind = pendingLoading || pendingError;

  const numeric = Number(amount);
  // REFUSED, not merely warned. A free-form advance carries no
  // source_wallet_topup_id, so the balance trigger cannot settle it — and
  // verifying the customer's pending top-up then credits the wallet a
  // SECOND time with the advance still outstanding. A warning is fine for
  // something inconvenient; this is money leaving twice, and the correct
  // control is a few centimetres away on the top-up itself, where it
  // settles by itself.
  //
  // Advancing credit to somebody with NO pending top-up is still allowed:
  // that is the case this dialog exists for, and there is nothing for it
  // to double against.
  const valid =
    !!advertiserId &&
    Number.isFinite(numeric) &&
    numeric > 0 &&
    !hasPending &&
    !guardBlind;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New precharge</DialogTitle>
          <DialogDescription>
            Advance credit to a customer before their payment clears. Their
            wallet is credited immediately; settle it when the money arrives.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hasPending ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <p className="font-semibold text-destructive">
                This customer already has{" "}
                {(pendingForAdvertiser ?? []).length === 1
                  ? "a top-up"
                  : `${(pendingForAdvertiser ?? []).length} top-ups`}{" "}
                waiting to be verified.
              </p>
              <p className="mt-1 text-muted-foreground">
                An advance made here cannot attach to it, so verifying that
                top-up would credit the wallet a second time. Use the
                <strong> Precharge</strong> button on the top-up itself —
                that one settles when you verify it. This form stays
                disabled until they have none waiting.
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Advertiser</Label>
            {/* Say it, rather than showing an empty list that reads as
                "there are no customers". */}
            {advertisersError ? (
              <p className="text-sm text-destructive" role="alert">
                We couldn&apos;t load your customers, so none can be picked
                here. Reload and try again.
              </p>
            ) : null}
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    advertisersError
                      ? "Couldn't load customers"
                      : "Select advertiser"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(advertisers ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.profile?.full_name ?? a.profile?.email ?? a.id}
                    {a.tenant_client_code ? ` · ${a.tenant_client_code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="pc-amount">Amount</Label>
              <Input
                id="pc-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pc-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="pc-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pc-reason">Note (optional)</Label>
            <Input
              id="pc-reason"
              placeholder="e.g. transfer in progress"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? "Creating…" : "Credit wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
