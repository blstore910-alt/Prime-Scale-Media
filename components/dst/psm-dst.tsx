"use client";

/**
 * DST — what the supplier taxes us, recharged to the customer who caused it.
 *
 * The supplier debits DST from PSM's own balance, weekly. Nothing in the
 * app attributed it, so every week of spend accrued a cost that was paid
 * and never billed on. This screen is the manual path: an admin types a
 * period and the spend per country, the app works out the tax at that
 * country's rate, and the lines sit as RESERVED until they are turned
 * into one invoice the customer pays from their wallet.
 *
 * Reserved is not "pending payment" — it is money we already owe the
 * supplier and have not yet asked the customer for. The customer sees
 * the same lines on their own side, with the base and the rate, so the
 * figure can be checked rather than believed.
 */

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { formatCurrency } from "@/lib/utils";
import { recordDstCharges, invoiceDstCharges } from "@/actions/dst-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Receipt, Trash2 } from "lucide-react";

type DstRow = {
  id: string;
  advertiser_id: string;
  period_start: string;
  period_end: string;
  country_code: string;
  country_name: string | null;
  rate_pct: number | string;
  base_amount: number | string;
  currency: string;
  dst_amount: number | string;
  status: string;
  invoice_id: string | null;
  note: string | null;
  created_at: string;
  advertiser?: {
    tenant_client_code?: string | null;
    profile?: { full_name?: string | null } | null;
  } | null;
};

type Rate = {
  country_code: string;
  country_name: string | null;
  rate_pct: number | string;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Monday of the week that just finished — the period an admin types in. */
function lastWeek() {
  const end = dayjs().startOf("week");
  return {
    start: end.subtract(6, "day").format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
  };
}

export default function PsmDst() {
  const supabase = useMemo(() => createClient(), []);
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id;
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<"reserved" | "charged" | "all">(
    "reserved",
  );
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);

  const charges = useQuery({
    queryKey: ["dst-charges", tenantId, statusFilter],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("dst_charges")
        .select(
          "id, advertiser_id, period_start, period_end, country_code, country_name, rate_pct, base_amount, currency, dst_amount, status, invoice_id, note, created_at, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name))",
        )
        .eq("tenant_id", tenantId as string)
        .order("period_end", { ascending: false })
        .order("country_code", { ascending: true })
        .limit(500);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DstRow[];
    },
  });

  const rows = charges.data ?? [];
  const chosen = rows.filter((r) => picked[r.id] && r.status === "reserved");
  /** One invoice is one customer in one currency — the RPC refuses the rest. */
  const chosenOk =
    chosen.length > 0 &&
    chosen.every(
      (r) =>
        r.advertiser_id === chosen[0].advertiser_id &&
        r.currency === chosen[0].currency,
    );
  const chosenTotal = chosen.reduce((t, r) => t + n(r.dst_amount), 0);

  const reservedTotals = rows
    .filter((r) => r.status === "reserved")
    .reduce<Record<string, number>>((acc, r) => {
      const c = String(r.currency ?? "EUR").toUpperCase();
      acc[c] = Math.round((n(acc[c]) + n(r.dst_amount)) * 100) / 100;
      return acc;
    }, {});

  const { mutate: makeInvoice, isPending: invoicing } = useMutation({
    mutationFn: async () => {
      const res = await invoiceDstCharges(chosen.map((r) => r.id));
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      toast.success(
        `Invoice raised — ${formatCurrency(d.total, d.currency)}`,
        { description: "The customer can pay it from their wallet." },
      );
      setPicked({});
      queryClient.invalidateQueries({ queryKey: ["dst-charges"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
    },
    onError: (e: Error) =>
      toast.error("Couldn't raise the invoice", { description: e.message }),
  });

  return (
    <div className="psmview">
      <div className="phead">
        <div>
          <h1>DST</h1>
          <p className="muted">
            What we are taxed on customer spend, charged back to the customer who
            caused it.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus /> Enter a week
        </Button>
      </div>

      {/* What is standing open, before the list. Reserved is money we have
          already paid and not yet billed on. */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border bg-gradient-to-b from-amber-50 to-transparent p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Reserved, not yet invoiced
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {charges.isError
              ? "—"
              : Object.keys(reservedTotals).length
                ? Object.entries(reservedTotals)
                    .map(([c, v]) => formatCurrency(v, c))
                    .join(" · ")
                : formatCurrency(0, "EUR")}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Lines in view
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {charges.isError ? "—" : rows.length}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Picked to invoice
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {chosen.length
              ? `${chosen.length} · ${formatCurrency(chosenTotal, chosen[0].currency)}`
              : "—"}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["reserved", "charged", "all"] as const).map((s) => (
          <button
            key={s}
            className={"btn ghost sm" + (statusFilter === s ? " active" : "")}
            onClick={() => {
              setStatusFilter(s);
              setPicked({});
            }}
          >
            {s === "reserved"
              ? "Reserved"
              : s === "charged"
                ? "Invoiced"
                : "All"}
          </button>
        ))}
        <span className="ml-auto" />
        <Button
          disabled={!chosenOk || invoicing}
          onClick={() => makeInvoice()}
          title={
            !chosen.length
              ? "Pick some lines first"
              : !chosenOk
                ? "Every picked line has to be the same customer and the same currency."
                : undefined
          }
        >
          {invoicing ? <Loader2 className="animate-spin" /> : <Receipt />}
          Raise the invoice
        </Button>
      </div>

      {charges.isLoading ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Loading…
          </p>
        </div>
      ) : charges.isError ? (
        <div className="card">
          <p style={{ margin: 0, fontWeight: 600 }}>
            The DST lines couldn&apos;t be read.
          </p>
          <p className="muted" style={{ margin: "6px 0 12px" }}>
            This is NOT an empty list — do not conclude that nothing is
            outstanding.
          </p>
          <button className="btn ghost sm" onClick={() => charges.refetch()}>
            Retry
          </button>
        </div>
      ) : !rows.length ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {statusFilter === "reserved"
              ? "Nothing reserved. Enter a week as soon as the supplier has debited us."
              : statusFilter === "charged"
                ? "Nothing invoiced yet."
                : "No DST recorded yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const reserved = r.status === "reserved";
            return (
              <label
                key={r.id}
                className={
                  "flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm" +
                  (picked[r.id] ? " ring-2 ring-primary/40" : "")
                }
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  disabled={!reserved}
                  checked={!!picked[r.id]}
                  onChange={(e) =>
                    setPicked((p) => ({ ...p, [r.id]: e.target.checked }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-semibold">
                      {r.advertiser?.tenant_client_code ?? "—"}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      {r.advertiser?.profile?.full_name ?? ""}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.country_name || r.country_code} · {n(r.rate_pct)}% of{" "}
                    {formatCurrency(n(r.base_amount), r.currency)} ·{" "}
                    {dayjs(r.period_start).format("D MMM")} –{" "}
                    {dayjs(r.period_end).format("D MMM YYYY")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(n(r.dst_amount), r.currency)}
                  </p>
                  <span
                    className={
                      "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide " +
                      (reserved
                        ? "bg-amber-500/10 text-amber-700"
                        : r.status === "charged"
                          ? "bg-emerald-500/10 text-emerald-700"
                          : "bg-muted text-muted-foreground")
                    }
                  >
                    {reserved
                      ? "reserved"
                      : r.status === "charged"
                        ? "invoiced"
                        : r.status}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}

      <AddDstDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tenantId={tenantId ?? null}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ["dst-charges"], exact: false });
        }}
      />
    </div>
  );
}

/** One customer, one week, a line per country. */
function AddDstDialog({
  open,
  onOpenChange,
  tenantId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const week = useMemo(lastWeek, []);
  const [advertiserId, setAdvertiserId] = useState("");
  const [periodStart, setPeriodStart] = useState(week.start);
  const [periodEnd, setPeriodEnd] = useState(week.end);
  const [currency, setCurrency] = useState("EUR");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ country: string; base: string }[]>([
    { country: "", base: "" },
  ]);

  const advertisers = useQuery({
    queryKey: ["dst-advertisers", tenantId],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name)")
        .eq("tenant_id", tenantId as string)
        .order("tenant_client_code", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        tenant_client_code: string | null;
        profile?: { full_name?: string | null } | null;
      }[];
    },
  });

  const rates = useQuery({
    queryKey: ["dst-rates", tenantId],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("country_code, country_name, rate_pct")
        .eq("tenant_id", tenantId as string)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Rate[];
    },
  });

  const rateFor = (code: string) =>
    rates.data?.find(
      (r) => String(r.country_code).toUpperCase() === code.toUpperCase(),
    ) ?? null;

  const preview = lines.map((l) => {
    const rate = rateFor(l.country);
    const base = n(l.base);
    const pct = n(rate?.rate_pct);
    return { pct, base, dst: Math.round(base * pct) / 100 };
  });
  const total = Math.round(preview.reduce((t, p) => t + p.dst, 0) * 100) / 100;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await recordDstCharges({
        advertiserId,
        periodStart,
        periodEnd,
        currency,
        note: note.trim() || null,
        lines: lines
          .filter((l) => l.country.trim() && n(l.base) > 0)
          .map((l) => ({
            countryCode: l.country.trim().toUpperCase(),
            baseAmount: n(l.base),
          })),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      toast.success(
        `${d.recorded} ${d.recorded === 1 ? "line" : "lines"} recorded — ${formatCurrency(d.total, currency)}`,
        { description: "They sit as reserved until you raise the invoice." },
      );
      setLines([{ country: "", base: "" }]);
      setNote("");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) =>
      toast.error("Couldn't record it", { description: e.message }),
  });

  const valid =
    !!advertiserId &&
    !!periodStart &&
    !!periodEnd &&
    periodEnd >= periodStart &&
    lines.some((l) => l.country.trim() && n(l.base) > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a week of DST</DialogTitle>
          <DialogDescription>
            One customer, one period, a line per country. The rate comes from
            your own country list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="dst-adv">Customer</Label>
            <select
              id="dst-adv"
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={advertiserId}
              onChange={(e) => setAdvertiserId(e.target.value)}
            >
              <option value="">Pick a customer…</option>
              {(advertisers.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tenant_client_code} — {a.profile?.full_name ?? ""}
                </option>
              ))}
            </select>
            {advertisers.isError && (
              <p className="mt-1 text-xs text-destructive">
                The customer list couldn&apos;t be read — this is not an
                empty list.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="dst-from">From</Label>
              <Input
                id="dst-from"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dst-to">To and including</Label>
              <Input
                id="dst-to"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
          {periodEnd < periodStart && (
            <p className="text-xs text-destructive">
              The end date is before the start date.
            </p>
          )}

          <div>
            <Label htmlFor="dst-cur">Currency</Label>
            <select
              id="dst-cur"
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Spend per country</Label>
            {lines.map((l, i) => {
              const rate = rateFor(l.country);
              return (
                <div key={i} className="flex items-start gap-2">
                  <select
                    className="h-9 w-32 shrink-0 rounded-md border bg-background px-2 text-sm"
                    value={l.country}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x, j) =>
                          j === i ? { ...x, country: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="">Country…</option>
                    {(rates.data ?? []).map((r) => (
                      <option key={r.country_code} value={r.country_code}>
                        {r.country_code} · {n(r.rate_pct)}%
                      </option>
                    ))}
                  </select>
                  <div className="min-w-0 flex-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={l.base}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, base: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    {l.country && n(l.base) > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {n(rate?.rate_pct)}% ={" "}
                        <span className="font-medium text-foreground">
                          {formatCurrency(preview[i].dst, currency)}
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="mt-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remove this line"
                    onClick={() =>
                      setLines((p) =>
                        p.length === 1
                          ? [{ country: "", base: "" }]
                          : p.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setLines((p) => [...p, { country: "", base: "" }])}
            >
              <Plus className="h-4 w-4" /> Add a country
            </button>
          </div>

          <div>
            <Label htmlFor="dst-note">Note (optional)</Label>
            <Input
              id="dst-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. week 38 debit"
            />
          </div>

          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                To charge back, together
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatCurrency(total, currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              This is recorded as reserved. The customer can see it, and pays
              only once you raise the invoice.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
