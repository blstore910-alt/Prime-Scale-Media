"use client";

// ── HET SALDO BIJ EEN HANDMATIGE LEVERANCIER (Bestads) ──────────────
//
// Het spreadsheet van de eigenaar, maar uitgerekend. Zie
// lib/pure-supplier-ledger.ts en plakken 185/186.
//
// De eigenaar, 01-10: "ik moet alle entries easy zien en namen, en de +
// button moet easier -- nu moet ik op de dag klikken". Dus:
//   1. bovenaan het saldo met twee grote knoppen: + Add entry en
//      End balance;
//   2. correcties die op een super admin wachten, meteen eronder;
//   3. ALLE regels in een lijst, nieuwste eerst, met klant en wie;
//   4. de dagcontrole (begin, erbij, eraf, verwacht, echt, verschil).
// Top-ups uit de app op Bestads-accounts komen er vanzelf bij ("App");
// de fee die de klant ons betaalde staat erbij als winst en gaat NIET
// van het saldo af.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Check, Landmark, Loader2, Percent, Plus, Scale, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import {
  addSupplierLine,
  decideSupplierLine,
  deleteSupplierLine,
  getSupplierLedger,
  setSupplierDayBalance,
  confirmSupplierUsd,
  syncSupplierFromWise,
} from "@/actions/supplier-ledger-actions";
import { buildLedgerDays, depositGap, latestBalance, type LedgerDay, type LedgerLine, type LineKind } from "@/lib/pure-supplier-ledger";
import { useUsdToEur } from "@/hooks/use-usd-to-eur";
import { amsterdamYmd } from "@/lib/pure-backup";

// In de typetabel heet hij Muxue; de eigenaar noemt hem Bestads.
const DISPLAY: Record<string, string> = { Muxue: "Bestads" };
const toon = (s: string) => DISPLAY[s] ?? s;

type Soort = { kind: LineKind; label: string; sign: 1 | -1; cls: string; dot: string };
const SOORTEN: Soort[] = [
  { kind: "deposit", label: "We sent", sign: 1, cls: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  { kind: "customer_topup", label: "Client top-up", sign: -1, cls: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  { kind: "fee", label: "Fee", sign: -1, cls: "bg-slate-200 text-slate-700", dot: "bg-slate-500" },
  { kind: "dst", label: "DST", sign: -1, cls: "bg-violet-100 text-violet-800", dot: "bg-violet-500" },
  { kind: "adjustment", label: "Correction +", sign: 1, cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  { kind: "adjustment_out", label: "Correction −", sign: -1, cls: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
];
const SOORT = Object.fromEntries(SOORTEN.map((s) => [s.kind, s])) as Record<LineKind, Soort>;
/** The icon on a row on the phone: money in, money out, a fee, a tax, a correction. */
const SOORT_ICON: Record<LineKind, typeof Plus> = {
  deposit: ArrowDownLeft,
  customer_topup: ArrowUpRight,
  fee: Percent,
  dst: Landmark,
  adjustment: SlidersHorizontal,
  adjustment_out: SlidersHorizontal,
};

const FILTERS: { key: string; label: string; kinds: LineKind[] | null }[] = [
  { key: "all", label: "All", kinds: null },
  { key: "sent", label: "We sent", kinds: ["deposit"] },
  { key: "top", label: "Top-ups", kinds: ["customer_topup"] },
  { key: "cost", label: "Fees & DST", kinds: ["fee", "dst"] },
  { key: "corr", label: "Corrections", kinds: ["adjustment", "adjustment_out"] },
];

const usd = (n: number | null) =>
  n === null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number) => `${n < 0 ? "−" : "+"}${usd(Math.abs(n))}`;

function vandaag(): string {
  const { y, m, day } = amsterdamYmd(new Date());
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
const kortDag = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};

const STATUS: Record<LedgerDay["status"], { label: string; cls: string }> = {
  ok: { label: "Matches", cls: "bg-emerald-100 text-emerald-700" },
  off: { label: "Check", cls: "bg-amber-100 text-amber-800" },
  open: { label: "No end balance yet", cls: "bg-slate-100 text-slate-600" },
};

const veld = "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export default function SupplierLedger() {
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState<string | null>(null);
  const [paneel, setPaneel] = useState<"add" | "end" | null>(null);
  const [filter, setFilter] = useState("all");
  const [zoek, setZoek] = useState("");

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
  const { rate: usdToEur } = useUsdToEur();
  const eurToUsd = usdToEur && usdToEur > 0 ? 1 / usdToEur : null;
  const naam = q.data?.supplier ?? "";
  const canDecide = !!q.data?.canDecide;
  const vernieuw = () => void qc.invalidateQueries({ queryKey: ["supplier-ledger"] });

  const alle = useMemo(() => {
    const l = [...(q.data?.lines ?? [])];
    l.sort((a, b) => (a.day === b.day ? String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) : b.day.localeCompare(a.day)));
    return l;
  }, [q.data]);
  const wachtend = alle.filter((l) => l.status === "pending");
  const zichtbaar = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)?.kinds ?? null;
    const z = zoek.trim().toLowerCase();
    return alle.filter(
      (l) =>
        (!f || f.includes(l.kind)) &&
        (!z || [l.clientRef, l.clientName, l.note, l.addedBy].some((v) => String(v ?? "").toLowerCase().includes(z))),
    );
  }, [alle, filter, zoek]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const r = await deleteSupplierLine(id);
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Entry removed");
      vernieuw();
    },
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
      return v.approve;
    },
    onSuccess: (ok) => {
      toast.success(ok ? "Correction approved — it counts now" : "Correction rejected");
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // ── WISE PAYMENTS TO MUXUE (plak 202) ─────────────────────────────
  // They arrive by themselves every 15 minutes; this is for "now".
  const sync = useMutation({
    mutationFn: async () => {
      const r = await syncSupplierFromWise();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (d) => {
      toast.success(d.imported ? `${d.imported} Wise payment${d.imported > 1 ? "s" : ""} booked` : "No new Wise payments", {
        description: d.skipped,
      });
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const bevestig = useMutation({
    mutationFn: async (v: { id: string; usd: string }) => {
      const r = await confirmSupplierUsd(v);
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Confirmed — the gap against our rate shows on the line");
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const openWise = alle.filter((l) => l.wise && l.usdConfirmed === false).length;

  const laatsteDag = days[days.length - 1];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{naam ? `${toon(naam)} balance` : "Supplier balance"}</h1>
          <p className="text-sm text-muted-foreground">
            Every entry, who added it, and whether their dashboard agrees.
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
                {toon(s)}
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
              A database update (plak 186) has not run yet — corrections cannot be saved until it has.
            </p>
          ) : null}

          {/* ── HET SALDO, MET DE TWEE KNOPPEN ─────────────────────── */}
          <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg" style={{ background: "linear-gradient(120deg,#0a0f2e,#1b2160)" }}>
            <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60% 120% at 0% 0%,rgba(91,141,255,.55),transparent 60%),radial-gradient(50% 120% at 100% 0%,rgba(139,92,246,.5),transparent 60%)" }} />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest opacity-80">{toon(naam)} · balance now</div>
                <div className="mt-1 text-4xl font-extrabold tracking-tight">{latest ? usd(latest.amount) : "$0.00"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-90">
                  <span>
                    {latest
                      ? latest.actual
                        ? `From their dashboard · ${kortDag(latest.day)}`
                        : `Calculated from the entries · ${kortDag(latest.day)}`
                      : "Nothing entered yet"}
                  </span>
                  {laatsteDag ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[laatsteDag.status].cls}`}>
                      {STATUS[laatsteDag.status].label}
                      {laatsteDag.status === "off" && laatsteDag.difference !== null ? ` · ${signed(laatsteDag.difference)}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
              {/* One row on the phone too (eigenaar 03-10). */}
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  onClick={() => setPaneel(paneel === "add" ? null : "add")}
                  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 text-sm font-extrabold text-[#0a0f2e] shadow-md hover:bg-white/90 sm:px-5"
                >
                  <Plus className="h-4 w-4" /> Add entry
                </button>
                <button
                  onClick={() => setPaneel(paneel === "end" ? null : "end")}
                  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/40 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20"
                >
                  <Scale className="h-4 w-4" /> End balance
                </button>
              </div>
            </div>
          </div>

          {paneel === "add" ? (
            <NieuweRegel
              supplier={naam}
              clients={q.data!.clients}
              canDecide={canDecide}
              onClose={() => setPaneel(null)}
              onDone={vernieuw}
            />
          ) : null}
          {paneel === "end" ? (
            <Eindsaldo supplier={naam} days={days} onClose={() => setPaneel(null)} onDone={vernieuw} />
          ) : null}

          {/* ── CORRECTIES DIE WACHTEN ─────────────────────────────── */}
          {wachtend.length ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
              <div className="mb-2 text-sm font-extrabold text-amber-900 dark:text-amber-200">
                {wachtend.length} correction{wachtend.length > 1 ? "s" : ""} waiting for a super admin
              </div>
              <div className="grid gap-2">
                {wachtend.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm dark:bg-card">
                    <span>
                      <b>{signed(SOORT[l.kind].sign * l.amount)}</b> · {kortDag(l.day)} · {l.note}
                      <span className="text-muted-foreground"> — asked by {l.addedBy ?? "an admin"}</span>
                    </span>
                    {canDecide ? (
                      <span className="flex gap-2">
                        <button
                          disabled={beslis.isPending}
                          onClick={() => beslis.mutate({ id: l.id, approve: true })}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          disabled={beslis.isPending}
                          onClick={() => beslis.mutate({ id: l.id, approve: false })}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-300 bg-white px-3 text-xs font-bold text-red-600"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-800">Not counted until approved</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── ALLE REGELS ────────────────────────────────────────── */}
          {/* Wise payments to Muxue book themselves; say so, and say when
              one still needs its dollars typed in. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              Wise payments to Muxue are booked automatically.
              {openWise ? (
                <b className="ml-1 text-amber-700">
                  {openWise} in EUR {openWise > 1 ? "need" : "needs"} the USD Bestads credited.
                </b>
              ) : null}
            </span>
            <button
              type="button"
              disabled={sync.isPending}
              onClick={() => sync.mutate()}
              className="inline-flex items-center gap-1 font-bold text-primary disabled:opacity-50"
            >
              {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Sync now
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              {/* One row of chips, scrolling sideways on a phone rather than
                  wrapping "Corrections" onto a line of its own. */}
              <div className="-mx-1 flex w-full gap-1 overflow-x-auto px-1 sm:w-auto [scrollbar-width:none]">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="relative w-full sm:w-auto">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={zoek}
                  onChange={(e) => setZoek(e.target.value)}
                  placeholder="Search client, note, name"
                  className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm sm:w-56"
                />
              </label>
            </div>
            <div className="hidden grid-cols-[80px_130px_minmax(0,1.3fr)_minmax(0,1.5fr)_110px_120px_32px] gap-3 border-b bg-muted/40 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
              <span>Date</span>
              <span>Type</span>
              <span>Client</span>
              <span>Note</span>
              <span>Added by</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            {zichtbaar.length ? (
              zichtbaar.map((l) => (
                <Regel
                  key={l.id}
                  l={l}
                  eurToUsd={eurToUsd}
                  onDelete={() => {
                    if (window.confirm("Remove this entry?")) del.mutate(l.id);
                  }}
                  deleting={del.isPending}
                  onConfirmUsd={(usd) => bevestig.mutate({ id: l.id, usd })}
                  confirming={bevestig.isPending}
                />
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {alle.length ? "Nothing matches this filter." : "No entries yet. Press “Add entry” to start."}
              </div>
            )}
          </div>

          {/* ── DE DAGCONTROLE ─────────────────────────────────────── */}
          {days.length ? (
            <div className="rounded-2xl border bg-card">
              <div className="border-b px-4 py-3 text-sm font-extrabold">Daily check</div>
              {/* ── OP DE TELEFOON: EEN KAART PER DAG ─────────────────────
                  De eigenaar, 02-10: "daily check view niet handig op
                  mobiel". Tien kolommen passen niet op 390 px; de tabel
                  scrolde zijwaarts en Expected / Actual / Status -- waar
                  het om gaat -- stonden buiten beeld. Per dag: de status
                  bovenaan, begin -> verwacht -> echt, en alleen de
                  bewegingen die er die dag waren. */}
              <div className="divide-y md:hidden">
                {[...days].reverse().map((d) => {
                  const moves: [string, string, string][] = [
                    ...(d.deposits ? [["+ Sent", usd(d.deposits), "text-emerald-600"] as [string, string, string]] : []),
                    ...(d.topups ? [["− Top-ups", usd(d.topups), ""] as [string, string, string]] : []),
                    ...(d.fees ? [["− Fees", usd(d.fees), ""] as [string, string, string]] : []),
                    ...(d.dst ? [["− DST", usd(d.dst), ""] as [string, string, string]] : []),
                    ...(d.adjustments ? [["± Correction", signed(d.adjustments), ""] as [string, string, string]] : []),
                  ];
                  return (
                    <div key={d.day} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <b>{kortDag(d.day)}</b>
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[d.status].cls}`}>
                          {d.status === "open" ? "Open" : STATUS[d.status].label}
                          {d.status === "off" && d.difference !== null ? ` ${signed(d.difference)}` : ""}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 rounded-xl bg-muted/40 px-3 py-2 tabular-nums">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Start</div>
                          <div className="font-semibold">{usd(d.start)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expected</div>
                          <div className="font-extrabold">{usd(d.expectedEnd)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actual</div>
                          <div className="font-extrabold">{d.actualEnd !== null ? usd(d.actualEnd) : "—"}</div>
                        </div>
                      </div>
                      {moves.length ? (
                        <div className="mt-2 space-y-0.5 text-xs tabular-nums">
                          {moves.map(([k, v, cls]) => (
                            <div key={k} className="flex justify-between gap-3">
                              <span className="text-muted-foreground">{k}</span>
                              <span className={`font-semibold ${cls}`}>{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left">Day</th>
                    <th className="px-2 py-2 text-right">Start</th>
                    <th className="px-2 py-2 text-right">+ Sent</th>
                    <th className="px-2 py-2 text-right">− Top-ups</th>
                    <th className="px-2 py-2 text-right">− Fees</th>
                    <th className="px-2 py-2 text-right">− DST</th>
                    <th className="px-2 py-2 text-right">± Corr.</th>
                    <th className="px-2 py-2 text-right">Expected</th>
                    <th className="px-2 py-2 text-right">Actual</th>
                    <th className="px-4 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((d) => (
                    <tr key={d.day} className="border-t">
                      <td className="px-4 py-2 font-bold">{kortDag(d.day)}</td>
                      <td className="px-2 py-2 text-right">{usd(d.start)}</td>
                      <td className="px-2 py-2 text-right text-emerald-600">{d.deposits ? usd(d.deposits) : ""}</td>
                      <td className="px-2 py-2 text-right">{d.topups ? usd(d.topups) : ""}</td>
                      <td className="px-2 py-2 text-right">{d.fees ? usd(d.fees) : ""}</td>
                      <td className="px-2 py-2 text-right">{d.dst ? usd(d.dst) : ""}</td>
                      <td className="px-2 py-2 text-right">{d.adjustments ? signed(d.adjustments) : ""}</td>
                      <td className="px-2 py-2 text-right font-semibold">{usd(d.expectedEnd)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{usd(d.actualEnd)}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[d.status].cls}`}>
                          {d.status === "open" ? "Open" : STATUS[d.status].label}
                          {d.status === "off" && d.difference !== null ? ` ${signed(d.difference)}` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function Regel({
  l,
  eurToUsd,
  onDelete,
  deleting,
  onConfirmUsd,
  confirming,
}: {
  l: LedgerLine;
  eurToUsd: number | null;
  onDelete: () => void;
  deleting: boolean;
  onConfirmUsd: (usd: string) => void;
  confirming: boolean;
}) {
  const [usd, setUsd] = useState("");
  const s = SOORT[l.kind];
  const telt = (l.status ?? "approved") === "approved";
  const g = depositGap(l, eurToUsd);
  const Icon = SOORT_ICON[l.kind];
  const wie = l.source === "app" ? "App" : l.wise ? "Wise" : l.addedBy ?? null;
  // A payment that arrived in EUR: our estimate until somebody types what
  // Bestads actually credited.
  const teBevestigen = l.wise && l.usdConfirmed === false;
  const bevestigVak = teBevestigen ? (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-amber-900">
      <b className="text-[11px]">Estimate · Bestads credited $</b>
      <input
        value={usd}
        onChange={(e) => setUsd(e.target.value)}
        inputMode="decimal"
        placeholder={l.amount ? l.amount.toFixed(2) : "0.00"}
        aria-label="What Bestads credited in USD"
        className="h-7 w-24 rounded-md border border-amber-300 bg-white px-2 text-xs text-foreground"
      />
      <button
        type="button"
        disabled={confirming || !(Number(usd) > 0)}
        onClick={() => onConfirmUsd(usd)}
        className="h-7 rounded-md bg-amber-500 px-2.5 text-[11px] font-bold text-white disabled:opacity-50"
      >
        Confirm
      </button>
    </span>
  ) : null;
  const status =
    l.status === "pending" ? (
      <span className="rounded bg-amber-100 px-1.5 font-bold text-amber-800">waiting for approval</span>
    ) : l.status === "rejected" ? (
      <span className="rounded bg-red-100 px-1.5 font-bold text-red-700">rejected{l.rejectReason ? `: ${l.rejectReason}` : ""}</span>
    ) : null;
  const gap = g ? (
    <span className="block">
      Sent €{l.sentAmount?.toLocaleString("en-US", { minimumFractionDigits: 2 })} · their rate {g.theirRate}
      {g.gapUsd !== null ? (
        <b className={g.gapUsd < 0 ? "text-red-600" : "text-emerald-600"}> · gap {signed(g.gapUsd)} vs our rate</b>
      ) : null}
    </span>
  ) : null;
  // Not on a Wise line: it would only come back on the next sync -- the
  // payment did go out. Its dollars are corrected with Confirm instead.
  const weg =
    l.source !== "app" && !l.wise ? (
      <button
        aria-label="Remove entry"
        disabled={deleting}
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    ) : null;
  return (
    <>
      {/* ── THE PHONE: ONE TIDY CARD PER ENTRY ──────────────────────
          De eigenaar, 03-10: "10x beter design, geordend, netjes". The
          old row put date, pill, client, note and who on five loose
          lines with a dash for every blank. Now: the kind as a coloured
          icon, one title (the client, or what it is), one grey line
          under it, the amount on the right. And a delete button -- the
          phone had none. */}
      <div className={`flex items-start gap-3 border-b px-4 py-3 text-sm last:border-b-0 md:hidden ${telt ? "" : "opacity-60"}`}>
        <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${s.cls}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-bold">
              {l.clientRef ? <b className="font-mono text-xs">{l.clientRef}</b> : s.label}
              {l.clientRef && l.clientName ? <span className="ml-1.5 font-semibold">{l.clientName}</span> : null}
            </span>
            <span className={`shrink-0 font-extrabold tabular-nums ${s.sign > 0 ? "text-emerald-600" : ""}`}>
              {signed(s.sign * l.amount)}
            </span>
          </div>
          <div className="mt-0.5 flex items-start justify-between gap-2 text-xs text-muted-foreground">
            <span className="min-w-0">
              {kortDag(l.day)}
              {l.clientRef ? <> · {s.label}</> : null}
              {wie ? <> · {wie}</> : null}
              {l.note ? <> · {l.note}</> : null}
              {l.ourFee ? <span className="font-semibold text-emerald-700"> · our fee {l.ourFee}</span> : null}
              {status ? <> {status}</> : null}
              {gap}
              {bevestigVak}
            </span>
            {weg ? <span className="-mr-1 -mt-0.5 shrink-0">{weg}</span> : null}
          </div>
        </div>
      </div>

      {/* ── THE DESKTOP: THE COLUMNS AS BEFORE ─────────────────────── */}
      <div className={`hidden border-b px-4 py-3 text-sm last:border-b-0 md:grid md:grid-cols-[80px_130px_minmax(0,1.3fr)_minmax(0,1.5fr)_110px_120px_32px] md:items-center md:gap-x-3 ${telt ? "" : "opacity-60"}`}>
        <span className="font-semibold">{kortDag(l.day)}</span>
        <span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        </span>
        <span className="min-w-0 truncate">
          {l.clientRef ? (
            <>
              <b className="font-mono text-xs">{l.clientRef}</b>
              {l.clientName ? <span className="ml-1.5">{l.clientName}</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
        <span className="min-w-0 text-xs text-muted-foreground">
          {l.note || ""}
          {l.ourFee ? <span className="ml-1 font-semibold text-emerald-700">· our fee {l.ourFee}</span> : null}
          {status ? <span className="ml-1">{status}</span> : null}
          {gap}
          {bevestigVak}
        </span>
        <span className="text-xs">
          {l.source === "app" || l.wise ? (
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{l.wise ? "Wise" : "App"}</span>
          ) : (
            l.addedBy ?? "—"
          )}
        </span>
        <span className={`justify-self-end text-right font-extrabold tabular-nums ${s.sign > 0 ? "text-emerald-600" : ""}`}>
          {signed(s.sign * l.amount)}
        </span>
        <span className="justify-self-end">{weg}</span>
      </div>
    </>
  );
}

function NieuweRegel({
  supplier,
  clients,
  canDecide,
  onClose,
  onDone,
}: {
  supplier: string;
  clients: { code: string; name: string }[];
  canDecide: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<LineKind>("customer_topup");
  const [day, setDay] = useState(vandaag());
  const [amount, setAmount] = useState("");
  const [client, setClient] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");
  const [sentCur, setSentCur] = useState("EUR");
  const correctie = kind === "adjustment" || kind === "adjustment_out";
  const klantNodig = kind === "customer_topup";

  const add = useMutation({
    mutationFn: async () => {
      if (klantNodig && !client) throw new Error("Pick the client.");
      if (correctie && !note.trim()) throw new Error("A correction needs a reason in the note.");
      const r = await addSupplierLine({
        supplier,
        day,
        kind,
        amount,
        clientRef: client || null,
        note,
        sentAmount: kind === "deposit" ? sent : null,
        sentCurrency: kind === "deposit" ? sentCur : null,
      });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (data) => {
      setAmount("");
      setNote("");
      setSent("");
      toast.success(data.pending ? "Correction sent to a super admin for approval" : "Entry added");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="grid gap-4 rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-base font-extrabold">New entry</div>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">What is it?</span>
        <div className="flex flex-wrap gap-2">
          {SOORTEN.map((s) => (
            <button
              key={s.kind}
              onClick={() => setKind(s.kind)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition ${kind === s.kind ? `${s.cls} border-transparent ring-2 ring-primary/40` : "bg-background text-muted-foreground hover:text-foreground"}`}
            >
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              {s.sign > 0 ? "+" : "−"} {s.label.replace(/ [+−]$/, "")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Day</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={veld} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Amount in $ {kind === "deposit" ? "(what they credited)" : ""}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={veld} />
        </label>
        {kind !== "deposit" ? (
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Client {klantNodig ? "" : "(optional)"}</span>
            <select value={client} onChange={(e) => setClient(e.target.value)} className={veld}>
              <option value="">{klantNodig ? "Pick a client…" : "— none —"}</option>
              {clients.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                  {c.name ? ` · ${c.name}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="grid gap-1">
            <span className="text-xs font-semibold">What we sent (optional)</span>
            <span className="grid grid-cols-[1fr_80px] gap-2">
              <input value={sent} onChange={(e) => setSent(e.target.value)} inputMode="decimal" placeholder="e.g. 4000" className={veld} />
              <select value={sentCur} onChange={(e) => setSentCur(e.target.value)} className={veld}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </span>
          </label>
        )}
      </div>

      <label className="grid gap-1">
        <span className="text-xs font-semibold">Note {correctie ? "(required — why?)" : "(optional)"}</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={correctie ? "e.g. their dashboard shows $12 less — refund not booked" : "e.g. via Turlit, ref 1234"}
          className={veld}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {kind === "deposit"
            ? "Fill what we sent in euros to see their exchange rate and the gap against ours."
            : kind === "customer_topup"
              ? "Top-ups done in the app on Bestads accounts are added automatically — only add the ones done outside the app."
              : correctie
                ? canDecide
                  ? "You are a super admin: your correction counts straight away."
                  : "A correction only counts after a super admin approves it."
                : "Goes off the balance on the day you pick."}
        </p>
        <button
          disabled={add.isPending || !amount}
          onClick={() => add.mutate()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
        >
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {correctie && !canDecide ? "Ask for approval" : "Add entry"}
        </button>
      </div>
    </div>
  );
}

function Eindsaldo({
  supplier,
  days,
  onClose,
  onDone,
}: {
  supplier: string;
  days: LedgerDay[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [day, setDay] = useState(vandaag());
  const [actual, setActual] = useState("");
  const d = days.find((x) => x.day === day);
  // Zonder regels die dag: het verwachte eind is het eind van de dag ervoor.
  const verwacht = d ? d.expectedEnd : (() => {
    const v = [...days].filter((x) => x.day < day).pop();
    return v ? (v.actualEnd ?? v.expectedEnd) : 0;
  })();
  const bal = useMutation({
    mutationFn: async () => {
      const r = await setSupplierDayBalance({ supplier, day, actualEnd: actual });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("End balance saved");
      setActual("");
      onDone();
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const n = Number(actual);
  const verschil = actual.trim() !== "" && Number.isFinite(n) ? Math.round((n - verwacht) * 100) / 100 : null;
  return (
    <div className="grid gap-3 rounded-2xl border-2 border-primary/30 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-base font-extrabold">End balance from their dashboard</div>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Day</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={veld} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Balance they show, in $</span>
          <input value={actual} onChange={(e) => setActual(e.target.value)} inputMode="decimal" placeholder="0.00" className={veld} />
        </label>
        <button
          disabled={bal.isPending || actual.trim() === ""}
          onClick={() => bal.mutate()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
      </div>
      <p className="text-sm">
        Expected by our entries: <b>{usd(verwacht)}</b>
        {verschil !== null ? (
          <span className={Math.abs(verschil) < 0.01 ? "font-bold text-emerald-600" : "font-bold text-amber-700"}>
            {" "}· {Math.abs(verschil) < 0.01 ? "matches" : `difference ${signed(verschil)}`}
          </span>
        ) : null}
      </p>
    </div>
  );
}
