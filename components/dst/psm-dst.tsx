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
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { dstBehind } from "@/lib/pure-dst-behind";
import { formatCurrency } from "@/lib/utils";
import {
  recordDstCharges,
  recordDstChargesBulk,
  invoiceDstCharges,
} from "@/actions/dst-actions";
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
  // What the overdue card hands the dialog: one customer and the exact
  // week that is missing. Null when the dialog is opened the normal way.
  const [prefill, setPrefill] = useState<{
    advertiserId: string;
    periodStart: string;
    periodEnd: string;
  } | null>(null);

  // ── WHO IS BEHIND ─────────────────────────────────────────────────
  //
  // The owner, 27-09: "we moeten zien bijv welke klanten al 7+ dagen
  // achterlopen met dit, dan moet weer aangevuld worden."
  //
  // Its own read, deliberately: `charges` below is filtered by the
  // status chips, and whether somebody is up to date has nothing to do
  // with whether their last week happens to be invoiced yet. Asking the
  // filtered list would make the answer change when you press a chip.
  const behindRows = useQuery({
    queryKey: ["dst-behind", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dst_charges")
        .select(
          "advertiser_id, period_start, period_end, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name))",
        )
        .eq("tenant_id", tenantId!)
        .order("period_end", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

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
  // Worst first, threshold 7 -- one whole week missed. See
  // lib/pure-dst-behind.ts for why a customer with no line at all is not
  // on this list.
  const behind = useMemo(
    () =>
      dstBehind(
        (behindRows.data ?? []) as unknown as Parameters<typeof dstBehind>[0],
      ),
    [behindRows.data],
  );
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of (behindRows.data ?? []) as Array<{
      advertiser_id: string;
      advertiser?: {
        tenant_client_code?: string | null;
        profile?: { full_name?: string | null } | null;
      } | null;
    }>) {
      if (m.has(r.advertiser_id)) continue;
      const a = r.advertiser;
      const code = a?.tenant_client_code ?? "";
      const nm = a?.profile?.full_name ?? "";
      m.set(r.advertiser_id, [code, nm].filter(Boolean).join(" · ") || r.advertiser_id);
    }
    return m;
  }, [behindRows.data]);

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

      {/* ── WHO NEEDS A WEEK TYPING ─────────────────────────────────
          The owner, 27-09: "we moeten zien bijv welke klanten al 7+
          dagen achterlopen met dit, dan moet weer aangevuld worden,
          moet fijne auto systeem en easy voor alle medewerkers."

          Nothing schedules DST and nothing chased it, so a week nobody
          typed was a week nobody saw. This is the chase: who, how far
          behind, which week is missing, and a button that opens the
          entry already filled in for exactly that customer and exactly
          that week. The person does not have to work out the dates.

          Only when there IS somebody. An empty reminder card every day
          teaches people to skip the top of the screen. */}
      {behind.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-500/25 dark:bg-amber-500/5">
          <p className="m-0 text-sm font-semibold">
            {behind.length === 1
              ? "One customer is behind on DST"
              : `${behind.length} customers are behind on DST`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Their last week ended more than seven days ago. Enter the missing
            week so it can be charged on.
          </p>
          <div className="mt-2.5 grid gap-1.5">
            {behind.map((b) => (
              <div
                key={b.advertiserId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background px-2.5 py-2 text-sm"
              >
                <span className="font-medium">
                  {nameOf.get(b.advertiserId) ?? b.advertiserId}
                </span>
                <span className="text-xs text-muted-foreground">
                  {b.daysBehind} days behind · last week ended{" "}
                  {b.lastPeriodEnd}
                  {b.weeksMissing > 1
                    ? ` · ${b.weeksMissing} weeks to catch up`
                    : ""}
                </span>
                <button
                  type="button"
                  className="btn ghost sm ml-auto"
                  onClick={() => {
                    // Prefilled: the customer picked and the week set to
                    // the first one nobody has entered. The desk types a
                    // base and saves; nobody works out the dates.
                    setPrefill({
                      advertiserId: b.advertiserId,
                      periodStart: b.nextPeriodStart,
                      periodEnd: b.nextPeriodEnd,
                    });
                    setAddOpen(true);
                  }}
                >
                  Enter {b.nextPeriodStart} – {b.nextPeriodEnd}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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

      {/* ── THE FILTER IS NOT AN ACTION ────────────────────────────
          The owner, 27-09: "buttons beter plaatsen." Three filter chips
          and the one button that raises a real invoice were on the same
          wrapping row, with the invoice button pushed right by ml-auto
          -- so on a phone it wrapped onto its own line underneath and
          read as a fourth chip. A control that bills a customer should
          not sit in a row of view switches.

          The chips stay where they are. The invoice button moves into
          the selection bar below, where it appears only once something
          is picked -- which is also the only time it can do anything. */}
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
      </div>

      {/* Appears with the selection, and says what it will do. A title
          attribute is invisible on a phone, so the reason it is greyed
          out is a sentence, not a tooltip. */}
      {chosen.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5">
          <span className="text-sm">
            <b>{chosen.length}</b>{" "}
            {chosen.length === 1 ? "line" : "lines"} picked ·{" "}
            <b>{formatCurrency(chosenTotal, chosen[0].currency)}</b>
          </span>
          <Button
            className="ml-auto"
            disabled={!chosenOk || invoicing}
            onClick={() => makeInvoice()}
          >
            {invoicing ? <Loader2 className="animate-spin" /> : <Receipt />}
            Raise the invoice
          </Button>
          {!chosenOk ? (
            <span className="basis-full text-xs text-muted-foreground">
              Every picked line has to be the same customer and the same
              currency.
            </span>
          ) : null}
        </div>
      ) : null}

      {/* isPending, not isLoading: react-query v5 reports isLoading FALSE
          for a query that never ran, and this one is `enabled:
          !!tenantId`. Without a tenant the screen walked past the
          spinner into "Nothing reserved" -- a claim about the books,
          over a read nobody made. */}
      {charges.isPending ? (
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
        onOpenChange={(v) => {
          setAddOpen(v);
          // Cleared on close, so the next plain "Enter a week" opens
          // empty rather than on somebody else's overdue week.
          if (!v) setPrefill(null);
        }}
        tenantId={tenantId ?? null}
        prefill={prefill}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: ["dst-charges"], exact: false });
          queryClient.invalidateQueries({ queryKey: ["dst-behind"], exact: false });
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
  prefill,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  /** One customer and the week they are missing, from the overdue card. */
  prefill?: {
    advertiserId: string;
    periodStart: string;
    periodEnd: string;
  } | null;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const week = useMemo(lastWeek, []);
  // ONE CUSTOMER, OR THE WHOLE BOOK. The supplier bills us per week for
  // everyone at once, so typing it in one customer at a time is twelve
  // dialogs for one debit. The axis of the bulk mode is the COUNTRY,
  // because DST follows where the money was SPENT -- a customer with a
  // Dutch ad account can spend in Turkey and France in the same week,
  // and those are separate lines at separate rates.
  const [mode, setMode] = useState<"one" | "all">("one");
  // WHO, AND THEN WHAT PER PERSON. Pick the customers that had spend this
  // week, and give each of them their own country lines -- one customer
  // can have spent in three countries at three rates.
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkPicked, setBulkPicked] = useState<string[]>([]);
  const [bulkLines, setBulkLines] = useState<
    Record<string, { country: string; base: string }[]>
  >({});
  const [advertiserId, setAdvertiserId] = useState("");
  const [periodStart, setPeriodStart] = useState(week.start);
  const [periodEnd, setPeriodEnd] = useState(week.end);

  // ── WHAT THE OVERDUE CARD HANDED US ──────────────────────────────
  //
  // Applied when the dialog OPENS, not on every render: somebody who
  // opens it prefilled and then changes the week must keep their change.
  // Keyed on `open` plus the prefill itself, so a second customer from
  // the same card also lands.
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    if (!prefill) return;
    const key = `${prefill.advertiserId}|${prefill.periodStart}`;
    if (seeded.current === key) return;
    seeded.current = key;
    setPeriodStart(prefill.periodStart);
    setPeriodEnd(prefill.periodEnd);
    // ── THE CUSTOMER TOO, ON THE TAB THAT IS OPEN ─────────────────
    //
    // The first version set only the BULK selection, and the dialog
    // opens on "One customer" -- which has its own `advertiserId`. So
    // pressing "Enter 21-09 - 26-09" on somebody's row gave you the
    // right dates over "Pick a customer…", which is the one thing the
    // button was supposed to save you. The owner saw it immediately.
    //
    // Both are set: the mode is forced to "one" because the card names
    // exactly one customer, and the bulk side is seeded too so that
    // switching tabs keeps the choice instead of losing it.
    setMode("one");
    setAdvertiserId(prefill.advertiserId);
    setBulkPicked([prefill.advertiserId]);
    setBulkLines({ [prefill.advertiserId]: [{ country: "", base: "" }] });
  }, [open, prefill]);
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

  // Every (customer, country, spend) that has something in it.
  const bulkRows = bulkPicked.flatMap((id) =>
    (bulkLines[id] ?? [])
      .filter((l) => l.country.trim() && n(l.base) > 0)
      .map((l) => ({
        advertiserId: id,
        countryCode: l.country.trim().toUpperCase(),
        baseAmount: n(l.base),
        dst: Math.round(n(l.base) * n(rateFor(l.country)?.rate_pct)) / 100,
      })),
  );
  const bulkTotal =
    Math.round(bulkRows.reduce((t, r) => t + r.dst, 0) * 100) / 100;
  const bulkCustomers = new Set(bulkRows.map((r) => r.advertiserId)).size;
  const pickable = (advertisers.data ?? []).filter((a) => {
    const q = bulkSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(a.tenant_client_code ?? "").toLowerCase().includes(q) ||
      String(a.profile?.full_name ?? "").toLowerCase().includes(q)
    );
  });
  const addLine = (id: string) =>
    setBulkLines((p) => ({
      ...p,
      [id]: [...(p[id] ?? []), { country: "", base: "" }],
    }));
  const togglePicked = (id: string) => {
    setBulkPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );
    setBulkLines((l) =>
      l[id]?.length ? l : { ...l, [id]: [{ country: "", base: "" }] },
    );
  };

  const { mutate: mutateBulk, isPending: bulkPending } = useMutation({
    mutationFn: async () => {
      const res = await recordDstChargesBulk({
        periodStart,
        periodEnd,
        currency,
        note: note.trim() || null,
        rows: bulkRows.map((r) => ({
          advertiserId: r.advertiserId,
          countryCode: r.countryCode,
          baseAmount: r.baseAmount,
        })),
      });
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      toast.success(
        `${d.recorded} ${d.recorded === 1 ? "line" : "lines"} recorded — ${formatCurrency(d.total, currency)}`,
        {
          description: d.failed.length
            ? `${d.failed.length} could not be written — check the list.`
            : "They sit as reserved until you raise the invoice.",
        },
      );
      setBulkPicked([]);
      setBulkLines({});
      onDone();
    },
    onError: (e: Error) =>
      toast.error("Couldn't record the week", { description: e.message }),
  });

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

  const periodOk = !!periodStart && !!periodEnd && periodEnd >= periodStart;
  const valid =
    !!advertiserId &&
    periodOk &&
    lines.some((l) => l.country.trim() && n(l.base) > 0);
  const bulkValid = periodOk && bulkRows.length > 0;
  const busy = isPending || bulkPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
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
          {/* WHICH SHAPE OF WEEK. One customer with several countries, or
              one country across every customer -- the supplier bills the
              whole book at once, so the second is the normal case. */}
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-1">
            {(["one", "all"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={
                  "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                  (mode === m
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
                onClick={() => setMode(m)}
              >
                {m === "one" ? "One customer" : "All customers"}
              </button>
            ))}
          </div>

          {mode === "one" ? (
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
          ) : null}

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

          {mode === "all" ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="dst-search">Customers</Label>
                <Input
                  id="dst-search"
                  className="mt-1"
                  placeholder="Search a code or a name…"
                  value={bulkSearch}
                  onChange={(e) => setBulkSearch(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Tick everyone who had spend this week, then give each of
                  them their own countries. DST follows where the money was
                  SPENT, not where the ad account sits — one customer can
                  carry NL, TR and FR in the same week at three rates.
                </p>
              </div>

              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>
                    {bulkPicked.length
                      ? `${bulkPicked.length} picked`
                      : "Pick a customer"}
                  </span>
                  {bulkPicked.length ? (
                    <button
                      type="button"
                      className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => {
                        setBulkPicked([]);
                        setBulkLines({});
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                {advertisers.isLoading ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    Loading customers…
                  </p>
                ) : advertisers.isError ? (
                  <p className="px-3 py-4 text-sm text-destructive">
                    The customer list couldn&apos;t be read — this is not an
                    empty list.
                  </p>
                ) : !pickable.length ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    Nobody matches that search.
                  </p>
                ) : (
                  <div className="max-h-[22rem] overflow-auto">
                    {pickable.map((a) => {
                      const on = bulkPicked.includes(a.id);
                      const mine = bulkLines[a.id] ?? [];
                      const sub =
                        Math.round(
                          mine.reduce(
                            (t, l) =>
                              t +
                              (n(l.base) * n(rateFor(l.country)?.rate_pct)) /
                                100,
                            0,
                          ) * 100,
                        ) / 100;
                      return (
                        <div key={a.id} className="border-b last:border-b-0">
                          <label className="flex cursor-pointer items-center gap-2 px-3 py-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 accent-primary"
                              checked={on}
                              onChange={() => togglePicked(a.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {a.tenant_client_code}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {a.profile?.full_name ?? ""}
                              </span>
                            </span>
                            {on && sub > 0 ? (
                              <span className="shrink-0 text-sm font-semibold tabular-nums">
                                {formatCurrency(sub, currency)}
                              </span>
                            ) : null}
                          </label>

                          {on ? (
                            <div className="space-y-2 bg-muted/40 px-3 pb-3 pt-1">
                              {mine.map((l, i) => {
                                const rate = rateFor(l.country);
                                const base = n(l.base);
                                const dst =
                                  Math.round(base * n(rate?.rate_pct)) / 100;
                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <select
                                      aria-label="Country the money was spent in"
                                      className="h-8 w-28 shrink-0 rounded-md border bg-background px-2 text-sm"
                                      value={l.country}
                                      onChange={(e) =>
                                        setBulkLines((p) => ({
                                          ...p,
                                          [a.id]: (p[a.id] ?? []).map((x, j) =>
                                            j === i
                                              ? { ...x, country: e.target.value }
                                              : x,
                                          ),
                                        }))
                                      }
                                    >
                                      <option value="">Country…</option>
                                      {(rates.data ?? []).map((r) => (
                                        <option
                                          key={r.country_code}
                                          value={r.country_code}
                                        >
                                          {r.country_code} · {n(r.rate_pct)}%
                                        </option>
                                      ))}
                                    </select>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      aria-label="Spend in that country"
                                      placeholder="spend"
                                      className="h-8 min-w-0 flex-1 text-right tabular-nums"
                                      value={l.base}
                                      onFocus={(e) => e.currentTarget.select()}
                                      onChange={(e) =>
                                        setBulkLines((p) => ({
                                          ...p,
                                          [a.id]: (p[a.id] ?? []).map((x, j) =>
                                            j === i
                                              ? { ...x, base: e.target.value }
                                              : x,
                                          ),
                                        }))
                                      }
                                    />
                                    <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                                      {base > 0 && rate
                                        ? formatCurrency(dst, currency)
                                        : ""}
                                    </span>
                                    <button
                                      type="button"
                                      className="shrink-0 text-muted-foreground hover:text-destructive"
                                      aria-label="Remove this country"
                                      onClick={() =>
                                        setBulkLines((p) => ({
                                          ...p,
                                          [a.id]:
                                            (p[a.id] ?? []).length <= 1
                                              ? [{ country: "", base: "" }]
                                              : (p[a.id] ?? []).filter(
                                                  (_, j) => j !== i,
                                                ),
                                        }))
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
                                onClick={() => addLine(a.id)}
                              >
                                <Plus className="h-4 w-4" /> Another country
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
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
          )}

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
                {mode === "all"
                  ? `To charge back — ${bulkRows.length} ${bulkRows.length === 1 ? "line" : "lines"} across ${bulkCustomers} ${bulkCustomers === 1 ? "customer" : "customers"}`
                  : "To charge back, together"}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {formatCurrency(mode === "all" ? bulkTotal : total, currency)}
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
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => (mode === "all" ? mutateBulk() : mutate())}
            disabled={(mode === "all" ? !bulkValid : !valid) || busy}
          >
            {busy && <Loader2 className="animate-spin" />}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
