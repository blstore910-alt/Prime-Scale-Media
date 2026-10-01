"use client";

// ── HET DAGSALDO BIJ EEN HANDMATIGE LEVERANCIER (Bestads) ───────────
//
// Het spreadsheet van de eigenaar, maar uitgerekend: per dag begin, wat
// wij stuurden, de klant-top-ups, fees, DST, verwacht eind, het echte
// eind uit het dashboard van de leverancier, en het verschil. Zie
// lib/pure-supplier-ledger.ts en plak 185.
//
// Klik op een dag: zijn regels, een regel toevoegen, het echte eind
// invullen. Top-ups uit de app komen er vanzelf bij (grijs, "app").

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ChevronDown } from "lucide-react";
import {
  addSupplierLine,
  decideSupplierLine,
  deleteSupplierLine,
  getSupplierLedger,
  setSupplierDayBalance,
} from "@/actions/supplier-ledger-actions";
import { buildLedgerDays, depositGap, latestBalance, type LedgerDay } from "@/lib/pure-supplier-ledger";
import { useUsdToEur } from "@/hooks/use-usd-to-eur";
import { amsterdamYmd } from "@/lib/pure-backup";

const SOORT_LABEL: Record<string, string> = {
  deposit: "+ We sent (deposit)",
  customer_topup: "− Customer top-up",
  fee: "− Fee",
  dst: "− DST",
  adjustment: "+ Correction (up)",
  adjustment_out: "− Correction (down)",
};

const usd = (n: number | null) =>
  n === null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function vandaag(): string {
  const { y, m, day } = amsterdamYmd(new Date());
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const STATUS: Record<LedgerDay["status"], { label: string; cls: string }> = {
  ok: { label: "Matches", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  off: { label: "Check", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  open: { label: "No end balance", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

export default function SupplierLedger() {
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["supplier-ledger", supplier],
    queryFn: async () => {
      const r = await getSupplierLedger(supplier);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });

  const days = useMemo(() => (q.data ? buildLedgerDays(q.data.lines, q.data.balances) : []), [q.data]);
  const latest = latestBalance(days);
  // EUR per USD; voor het wisselgat van een storting in euro's.
  const { rate: usdToEur } = useUsdToEur();
  const eurToUsd = usdToEur && usdToEur > 0 ? 1 / usdToEur : null;
  const naam = q.data?.supplier ?? "";
  const vernieuw = () => void qc.invalidateQueries({ queryKey: ["supplier-ledger"] });

  // "Vandaag" staat er altijd, ook zonder regels: daar begin je.
  const metVandaag = useMemo(() => {
    const t = vandaag();
    if (days.some((d) => d.day === t)) return days;
    const vorige = days[days.length - 1];
    const start = vorige ? (vorige.actualEnd ?? vorige.expectedEnd) : 0;
    return [
      ...days,
      {
        day: t,
        start,
        deposits: 0,
        topups: 0,
        fees: 0,
        dst: 0,
        adjustments: 0,
        expectedEnd: start,
        actualEnd: null,
        difference: null,
        status: "open" as const,
        lines: [],
        note: null,
      },
    ];
  }, [days]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Supplier balance</h1>
          <p className="text-sm text-muted-foreground">
            Day by day: what we sent, what customers topped up, fees and DST — against what their dashboard shows.
          </p>
        </div>
        {q.data && q.data.suppliers.length > 1 ? (
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {q.data.suppliers.map((s) => (
              <button
                key={s}
                onClick={() => setSupplier(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${s === naam ? "bg-background shadow" : "text-muted-foreground"}`}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {q.isPending ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : q.isError ? (
        <p className="text-destructive">{(q.error as Error).message} — this is not an empty ledger.</p>
      ) : !naam ? (
        <p className="text-sm text-muted-foreground">
          No manual supplier yet. Set a supplier name on an ad-account type (Settings → Ad account types) and it appears here.
        </p>
      ) : (
        <>
          {q.data!.plakNodig ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Plak 185 has not run yet — nothing can be saved until it has.
            </p>
          ) : null}

          <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg" style={{ background: "linear-gradient(120deg,#0a0f2e,#1b2160)" }}>
            <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60% 120% at 0% 0%,rgba(91,141,255,.55),transparent 60%),radial-gradient(50% 120% at 100% 0%,rgba(139,92,246,.5),transparent 60%)" }} />
            <div className="relative flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest opacity-80">{naam} · balance</div>
                <div className="mt-1 text-3xl font-extrabold">{latest ? usd(latest.amount) : "—"}</div>
                <div className="mt-1 text-xs opacity-80">
                  {latest ? `${latest.actual ? "From their dashboard" : "Expected (no end balance entered)"} · ${latest.day}` : "Nothing entered yet"}
                </div>
              </div>
              {days.length ? (
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[days[days.length - 1].status].cls}`}>
                  {STATUS[days[days.length - 1].status].label}
                  {days[days.length - 1].difference !== null && days[days.length - 1].status === "off"
                    ? ` · ${usd(days[days.length - 1].difference)}`
                    : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="hidden grid-cols-[110px_repeat(7,minmax(0,1fr))_110px] gap-2 border-b bg-muted/50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
              <span>Day</span>
              <span className="text-right">Start</span>
              <span className="text-right">+ Sent</span>
              <span className="text-right">− Top-ups</span>
              <span className="text-right">− Fees</span>
              <span className="text-right">− DST</span>
              <span className="text-right">Expected</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Status</span>
            </div>
            {[...metVandaag].reverse().map((d) => (
              <Dag
                key={d.day}
                d={d}
                supplier={naam}
                open={open === d.day}
                onToggle={() => setOpen(open === d.day ? null : d.day)}
                onChanged={vernieuw}
                canDecide={!!q.data?.canDecide}
                eurToUsd={eurToUsd}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Dag({
  d,
  supplier,
  open,
  onToggle,
  onChanged,
  canDecide,
  eurToUsd,
}: {
  d: LedgerDay;
  supplier: string;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
  canDecide: boolean;
  eurToUsd: number | null;
}) {
  const [sent, setSent] = useState("");
  const [sentCur, setSentCur] = useState("EUR");
  const [kind, setKind] = useState("customer_topup");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [actual, setActual] = useState(d.actualEnd === null ? "" : String(d.actualEnd));

  const add = useMutation({
    mutationFn: async () => {
      const r = await addSupplierLine({
        supplier,
        day: d.day,
        kind,
        amount,
        clientRef: ref,
        note,
        sentAmount: kind === "deposit" ? sent : null,
        sentCurrency: kind === "deposit" ? sentCur : null,
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (data) => {
      setAmount("");
      setRef("");
      setNote("");
      setSent("");
      toast.success(data.pending ? "Correction sent to an owner for approval" : "Line added");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await deleteSupplierLine(id);
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => onChanged(),
    onError: (e) => toast.error((e as Error).message),
  });
  const beslis = useMutation({
    mutationFn: async (v: { id: string; approve: boolean }) => {
      let reason: string | null = null;
      if (!v.approve) {
        reason = window.prompt("Why is this correction rejected?") ?? "";
        if (!reason.trim()) throw new Error("A rejection needs a reason.");
      }
      const r = await decideSupplierLine({ id: v.id, approve: v.approve, reason });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Decided");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bal = useMutation({
    mutationFn: async () => {
      const r = await setSupplierDayBalance({ supplier, day: d.day, actualEnd: actual });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("End balance saved");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const st = STATUS[d.status];
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-2 gap-2 px-4 py-3 text-left text-sm hover:bg-muted/40 md:grid-cols-[110px_repeat(7,minmax(0,1fr))_110px] md:items-center"
      >
        <span className="flex items-center gap-1 font-bold">
          <ChevronDown className={`h-4 w-4 transition ${open ? "" : "-rotate-90"}`} />
          {d.day}
        </span>
        <span className="text-right md:block hidden">{usd(d.start)}</span>
        <span className="text-right text-emerald-600 md:block hidden">{d.deposits ? usd(d.deposits) : ""}</span>
        <span className="text-right md:block hidden">{d.topups ? usd(d.topups) : ""}</span>
        <span className="text-right md:block hidden">{d.fees ? usd(d.fees) : ""}</span>
        <span className="text-right md:block hidden">{d.dst ? usd(d.dst) : ""}</span>
        <span className="text-right font-semibold md:block hidden">{usd(d.expectedEnd)}</span>
        <span className="text-right font-semibold md:block hidden">{usd(d.actualEnd)}</span>
        <span className="flex justify-end">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>
            {st.label}
            {d.status === "off" && d.difference !== null ? ` ${d.difference > 0 ? "+" : ""}${usd(d.difference)}` : ""}
          </span>
        </span>
        <span className="col-span-2 text-xs text-muted-foreground md:hidden">
          Start {usd(d.start)} · expected {usd(d.expectedEnd)} · actual {usd(d.actualEnd)}
        </span>
      </button>

      {open ? (
        <div className="grid gap-4 bg-muted/30 px-4 py-4 md:grid-cols-2">
          <div className="grid gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Lines</div>
            {d.lines.length ? (
              d.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <b>{SOORT_LABEL[l.kind]}</b>
                    {l.clientRef ? <span className="ml-1 font-mono text-xs">{l.clientRef}</span> : null}
                    {l.note ? <span className="ml-1 text-xs text-muted-foreground">{l.note}</span> : null}
                    {l.source === "app" ? (
                      <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] font-bold dark:bg-slate-700">app</span>
                    ) : null}
                    {l.status === "pending" ? (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">waiting for owner</span>
                    ) : null}
                    {l.status === "rejected" ? (
                      <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-bold text-red-700" title={l.rejectReason ?? ""}>
                        rejected{l.rejectReason ? `: ${l.rejectReason}` : ""}
                      </span>
                    ) : null}
                    {(() => {
                      const g = depositGap(l, eurToUsd);
                      if (!g) return null;
                      return (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          Sent €{l.sentAmount?.toLocaleString("en-US", { minimumFractionDigits: 2 })} · their rate {g.theirRate}
                          {g.gapUsd !== null ? (
                            <b className={g.gapUsd < 0 ? "text-red-600" : "text-emerald-600"}>
                              {" "}· gap {g.gapUsd > 0 ? "+" : ""}{usd(g.gapUsd)} vs our rate
                            </b>
                          ) : null}
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex items-center gap-2">
                    <b>{usd(l.amount)}</b>
                    {canDecide && l.status === "pending" ? (
                      <>
                        <button
                          disabled={beslis.isPending}
                          onClick={() => beslis.mutate({ id: l.id, approve: true })}
                          className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white"
                        >
                          Approve
                        </button>
                        <button
                          disabled={beslis.isPending}
                          onClick={() => beslis.mutate({ id: l.id, approve: false })}
                          className="rounded border px-2 py-0.5 text-[11px] font-bold text-red-600"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    {l.source !== "app" ? (
                      <button
                        aria-label="Remove line"
                        disabled={del.isPending}
                        onClick={() => del.mutate(l.id)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No lines this day yet.</p>
            )}
          </div>

          <div className="grid content-start gap-3">
            <div className="grid gap-2 rounded-xl border bg-card p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Add a line</div>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
                {Object.entries(SOORT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="Amount $"
                  className="h-9 rounded-md border bg-transparent px-2 text-sm"
                />
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Client code (PSM…)"
                  className="h-9 rounded-md border bg-transparent px-2 text-sm"
                />
              </div>
              {kind === "deposit" ? (
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <input
                    value={sent}
                    onChange={(e) => setSent(e.target.value)}
                    inputMode="decimal"
                    placeholder="What we sent (optional)"
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                  />
                  <select value={sentCur} onChange={(e) => setSentCur(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              ) : null}
              {kind === "deposit" ? (
                <p className="text-[11px] text-muted-foreground">
                  Amount $ = what they credited. Fill what we sent in euros to see their rate and the gap.
                </p>
              ) : null}
              {kind === "adjustment" || kind === "adjustment_out" ? (
                <p className="text-[11px] text-muted-foreground">
                  A correction needs a reason. From an admin it waits for an owner before it counts.
                </p>
              ) : null}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (e.g. sent to Turlit, added by Bart)"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              />
              <button
                disabled={add.isPending || !amount}
                onClick={() => add.mutate()}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add line
              </button>
            </div>
            <div className="grid gap-2 rounded-xl border bg-card p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                End balance on their dashboard
              </div>
              <div className="flex gap-2">
                <input
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  inputMode="decimal"
                  placeholder="$"
                  className="h-9 flex-1 rounded-md border bg-transparent px-2 text-sm"
                />
                <button
                  disabled={bal.isPending || actual.trim() === ""}
                  onClick={() => bal.mutate()}
                  className="h-9 rounded-md border px-3 text-sm font-semibold disabled:opacity-50"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Expected {usd(d.expectedEnd)}. Saving the real figure shows the difference straight away.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
