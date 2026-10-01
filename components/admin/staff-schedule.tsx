"use client";

// ── HET ROOSTER ─────────────────────────────────────────────────────
//
// De eigenaar, 01-10: "tijdenschema met tijdsblokken, dagen en
// voorkeuren; vullen en aanpassen; vastzetten voor weken of maanden; een
// admin maakt het. En de uren -- alleen super admin (en een admin)."
//
// Van boven naar beneden: de week (wie wanneer), mijn voorkeuren, de
// instellingen (roostermaker, urenkijker, dekking, slot), en de uren.
// Zie actions/schedule-actions.ts voor wie wat mag; dit scherm toont
// alleen wat de server toestaat.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Loader2, Lock, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  autoFillWeek,
  copyPreviousWeek,
  deleteShift,
  getHours,
  getSchedule,
  saveMyPreferences,
  saveScheduleSettings,
  saveShift,
  type ScheduleData,
} from "@/actions/schedule-actions";
import { addDays, blocks, toMin, type Block } from "@/lib/pure-schedule";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const DAGEN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BLOK_LABEL: Record<Block, string> = { morning: "Morning", late: "Late", full: "Full day", any: "Any" };
const veld = "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

const kort = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
};
const uren = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

function soortVan(s: { start: string; end: string }, cov: { start: string; end: string }) {
  const b = blocks(cov.start, cov.end);
  if (s.start === b.full.start && s.end === b.full.end) return "full";
  if (s.start === b.morning.start && s.end === b.morning.end) return "morning";
  if (s.start === b.late.start && s.end === b.late.end) return "late";
  return "custom";
}
const KLEUR: Record<string, string> = {
  morning: "bg-amber-100 text-amber-900 border-amber-200",
  late: "bg-indigo-100 text-indigo-900 border-indigo-200",
  full: "bg-emerald-100 text-emerald-900 border-emerald-200",
  custom: "bg-slate-100 text-slate-800 border-slate-200",
};

type Bewerk = { id?: string; profileId: string; day: string; start: string; end: string; note: string };

export default function StaffSchedule() {
  const qc = useQueryClient();
  const [dag, setDag] = useState<string | null>(null);
  const [bewerk, setBewerk] = useState<Bewerk | null>(null);

  const q = useQuery({
    queryKey: ["staff-schedule", dag],
    queryFn: async () => {
      const r = await getSchedule(dag);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const d = q.data;
  const vernieuw = () => {
    void qc.invalidateQueries({ queryKey: ["staff-schedule"] });
    void qc.invalidateQueries({ queryKey: ["staff-hours"] });
    void qc.invalidateQueries({ queryKey: ["live-now"] });
  };

  const vul = useMutation({
    mutationFn: async () => {
      const r = await autoFillWeek(d!.monday);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    onSuccess: (r) => {
      toast.success(
        r.added ? `${r.added} shift${r.added > 1 ? "s" : ""} filled in from the preferences` : "Nothing to fill — every open day already has someone",
        r.gaps.length ? { description: `${r.gaps.length} block(s) could not be covered — nobody is available. They show as gaps.` } : undefined,
      );
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const kopieer = useMutation({
    mutationFn: async () => {
      const r = await copyPreviousWeek(d!.monday);
      if (!r.ok) throw new Error(r.error);
      return r.data.added;
    },
    onSuccess: (n) => {
      toast.success(n ? `${n} shift${n > 1 ? "s" : ""} copied from last week` : "Nothing to copy onto empty days");
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isPending) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (q.isError || !d) return <p className="text-destructive">{(q.error as Error)?.message} — this is not an empty schedule.</p>;

  const dagen = Array.from({ length: 7 }, (_, i) => addDays(d.monday, i));
  const cov = { start: d.settings.coverageStart, end: d.settings.coverageEnd };
  const b = blocks(cov.start, cov.end);
  const vast = (day: string) => !!d.settings.lockedUntil && day <= d.settings.lockedUntil;
  const magBewerken = (day: string) => d.canEdit && (!vast(day) || d.isOwner);
  const gat = (day: string) => {
    const s = d.shifts.filter((x) => x.day === day);
    const dekt = (van: string, tot: string) => s.some((x) => toMin(x.start) <= toMin(van) && toMin(x.end) >= toMin(tot));
    return { ochtend: !dekt(b.morning.start, b.morning.end), laat: !dekt(b.late.start, b.late.end) };
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <CalendarDays className="h-6 w-6" /> Team schedule
          </h1>
          <p className="text-sm text-muted-foreground">
            Who is on, when. Coverage {cov.start}–{cov.end}: morning {b.morning.start}–{b.morning.end}, late {b.late.start}–{b.late.end}.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
          <button aria-label="Previous week" onClick={() => setDag(addDays(d.monday, -7))} className="rounded-lg p-2 hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setDag(null)} className="rounded-lg px-3 py-1.5 text-sm font-bold hover:bg-muted">
            {kort(d.monday)} – {kort(addDays(d.monday, 6))}
          </button>
          <button aria-label="Next week" onClick={() => setDag(addDays(d.monday, 7))} className="rounded-lg p-2 hover:bg-muted">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {d.plakNodig ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          A database update (plak 189) has not run yet — the schedule cannot be saved until it has.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {d.canEdit ? (
          <>
            <button
              disabled={vul.isPending || d.plakNodig}
              onClick={() => vul.mutate()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {vul.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Auto-fill this week
            </button>
            <button
              disabled={kopieer.isPending || d.plakNodig}
              onClick={() => kopieer.mutate()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-bold disabled:opacity-50"
            >
              <Copy className="h-4 w-4" /> Copy last week
            </button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">
            {d.settings.editorProfileId
              ? `${d.staff.find((s) => s.id === d.settings.editorProfileId)?.name ?? "The schedule maker"} makes the schedule.`
              : "An owner makes the schedule."}
          </span>
        )}
        {d.settings.lockedUntil ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
            <Lock className="h-3.5 w-3.5" /> Locked until {kort(d.settings.lockedUntil)}
          </span>
        ) : null}
        <span className="ml-auto hidden gap-2 text-[11px] font-semibold md:flex">
          <span className={`rounded border px-2 py-0.5 ${KLEUR.morning}`}>Morning</span>
          <span className={`rounded border px-2 py-0.5 ${KLEUR.late}`}>Late</span>
          <span className={`rounded border px-2 py-0.5 ${KLEUR.full}`}>Full day</span>
          <span className={`rounded border px-2 py-0.5 ${KLEUR.custom}`}>Other</span>
        </span>
      </div>

      {/* ── DE WEEK ─────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[880px] table-fixed text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th className="w-44 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Admin</th>
              {dagen.map((day, i) => (
                <th key={day} className={`px-2 py-2 text-left ${day === d.today ? "bg-primary/10" : ""}`}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {DAGEN[i]} {vast(day) ? <Lock className="inline h-3 w-3" /> : null}
                  </div>
                  <div className={`text-sm font-extrabold ${day === d.today ? "text-primary" : ""}`}>{kort(day)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.staff.map((s) => {
              const pref = d.prefs.find((p) => p.profileId === s.id);
              return (
                <tr key={s.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-bold">
                      {s.name}
                      {s.id === d.me ? <span className="ml-1 text-[10px] font-bold text-muted-foreground">(you)</span> : null}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {pref
                        ? `${BLOK_LABEL[pref.block]} · ${pref.days.map((x) => DAGEN[x - 1]).join(" ")} · max ${pref.maxDays}`
                        : "No preferences yet"}
                    </div>
                  </td>
                  {dagen.map((day) => {
                    const hier = d.shifts.filter((x) => x.profileId === s.id && x.day === day);
                    return (
                      <td key={day} className={`px-1.5 py-1.5 ${day === d.today ? "bg-primary/5" : ""}`}>
                        <div className="grid gap-1">
                          {hier.map((x) => (
                            <button
                              key={x.id}
                              disabled={!magBewerken(day)}
                              onClick={() => setBewerk({ id: x.id, profileId: s.id, day, start: x.start, end: x.end, note: x.note ?? "" })}
                              title={x.note ?? ""}
                              className={`rounded-lg border px-2 py-1 text-left text-xs font-bold ${KLEUR[soortVan(x, cov)]} disabled:cursor-default`}
                            >
                              {x.start}–{x.end}
                            </button>
                          ))}
                          {magBewerken(day) ? (
                            <button
                              aria-label={`Add a shift for ${s.name} on ${day}`}
                              onClick={() => setBewerk({ profileId: s.id, day, start: b.morning.start, end: b.morning.end, note: "" })}
                              className="flex h-7 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="border-t bg-muted/30">
              <td className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Coverage</td>
              {dagen.map((day) => {
                const g = gat(day);
                return (
                  <td key={day} className="px-2 py-2 text-[11px] font-bold">
                    {!g.ochtend && !g.laat ? (
                      <span className="text-emerald-700">✓ covered</span>
                    ) : (
                      <span className="text-red-600">
                        Gap: {[g.ochtend ? "morning" : null, g.laat ? "late" : null].filter(Boolean).join(" + ")}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MijnVoorkeuren d={d} onDone={vernieuw} />
        <Instellingen d={d} onDone={vernieuw} />
      </div>

      {d.canSeeHours ? <Uren monday={d.monday} /> : null}

      <ShiftDialog bewerk={bewerk} setBewerk={setBewerk} d={d} onDone={vernieuw} />
    </div>
  );
}

function ShiftDialog({
  bewerk,
  setBewerk,
  d,
  onDone,
}: {
  bewerk: Bewerk | null;
  setBewerk: (b: Bewerk | null) => void;
  d: ScheduleData;
  onDone: () => void;
}) {
  const b = blocks(d.settings.coverageStart, d.settings.coverageEnd);
  const opslaan = useMutation({
    mutationFn: async () => {
      const r = await saveShift({ id: bewerk!.id, profileId: bewerk!.profileId, day: bewerk!.day, start: bewerk!.start, end: bewerk!.end, note: bewerk!.note });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Shift saved");
      setBewerk(null);
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const weg = useMutation({
    mutationFn: async () => {
      const r = await deleteShift(bewerk!.id!);
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Shift removed");
      setBewerk(null);
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const naam = bewerk ? d.staff.find((s) => s.id === bewerk.profileId)?.name : "";
  return (
    <Dialog open={!!bewerk} onOpenChange={(o) => (o ? null : setBewerk(null))}>
      <DialogContent className="sm:max-w-md">
        {bewerk ? (
          <>
            <DialogHeader>
              <DialogTitle>{bewerk.id ? "Change shift" : "New shift"}</DialogTitle>
              <DialogDescription>
                {naam} · {kort(bewerk.day)}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2">
                {(["morning", "late", "full"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setBewerk({ ...bewerk, start: b[k].start, end: b[k].end })}
                    className={`rounded-xl border px-2 py-2 text-xs font-bold ${KLEUR[k]} ${bewerk.start === b[k].start && bewerk.end === b[k].end ? "ring-2 ring-primary/50" : ""}`}
                  >
                    {BLOK_LABEL[k]}
                    <span className="block font-semibold opacity-80">
                      {b[k].start}–{b[k].end}
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold">From</span>
                  <input type="time" value={bewerk.start} onChange={(e) => setBewerk({ ...bewerk, start: e.target.value })} className={veld} />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold">Until</span>
                  <input type="time" value={bewerk.end} onChange={(e) => setBewerk({ ...bewerk, end: e.target.value })} className={veld} />
                </label>
              </div>
              <input value={bewerk.note} onChange={(e) => setBewerk({ ...bewerk, note: e.target.value })} placeholder="Note (optional)" className={veld} />
              <div className="flex items-center justify-between gap-2">
                {bewerk.id ? (
                  <button
                    disabled={weg.isPending}
                    onClick={() => weg.mutate()}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-sm font-bold text-red-600"
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </button>
                ) : (
                  <span />
                )}
                <button
                  disabled={opslaan.isPending}
                  onClick={() => opslaan.mutate()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
                >
                  {opslaan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
                </button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MijnVoorkeuren({ d, onDone }: { d: ScheduleData; onDone: () => void }) {
  const mijn = d.prefs.find((p) => p.profileId === d.me);
  const [days, setDays] = useState<number[]>(mijn?.days ?? [1, 2, 3, 4, 5]);
  const [block, setBlock] = useState<Block>(mijn?.block ?? "any");
  const [maxDays, setMax] = useState(String(mijn?.maxDays ?? 5));
  const [note, setNote] = useState(mijn?.note ?? "");
  const opslaan = useMutation({
    mutationFn: async () => {
      const r = await saveMyPreferences({ days, block, maxDays: Number(maxDays), note });
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Your preferences are saved — auto-fill uses them");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="grid content-start gap-3 rounded-2xl border bg-card p-4">
      <div>
        <div className="text-base font-extrabold">My preferences</div>
        <p className="text-xs text-muted-foreground">When you can work. Auto-fill never puts you on a day you did not tick.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DAGEN.map((n, i) => {
          const on = days.includes(i + 1);
          return (
            <button
              key={n}
              onClick={() => setDays(on ? days.filter((x) => x !== i + 1) : [...days, i + 1])}
              className={`h-9 w-12 rounded-lg text-xs font-bold ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
        {(["morning", "late", "full", "any"] as Block[]).map((k) => (
          <button
            key={k}
            onClick={() => setBlock(k)}
            className={`rounded-lg px-2 py-1.5 text-xs font-bold ${block === k ? "bg-background shadow" : "text-muted-foreground"}`}
          >
            {BLOK_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Max days / week</span>
          <input type="number" min={0} max={7} value={maxDays} onChange={(e) => setMax(e.target.value)} className={veld} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. not on 14 Oct, prefer Fridays off" className={veld} />
        </label>
      </div>
      <button
        disabled={opslaan.isPending || d.plakNodig}
        onClick={() => opslaan.mutate()}
        className="inline-flex h-10 w-fit items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
      >
        Save my preferences
      </button>
    </div>
  );
}

function Instellingen({ d, onDone }: { d: ScheduleData; onDone: () => void }) {
  const [editor, setEditor] = useState(d.settings.editorProfileId ?? "");
  const [viewer, setViewer] = useState(d.settings.hoursViewerProfileId ?? "");
  const [covS, setCovS] = useState(d.settings.coverageStart);
  const [covE, setCovE] = useState(d.settings.coverageEnd);
  const [slot, setSlot] = useState(d.settings.lockedUntil ?? "");
  const opslaan = useMutation({
    mutationFn: async (patch: Parameters<typeof saveScheduleSettings>[0]) => {
      const r = await saveScheduleSettings(patch);
      if (!r.ok) throw new Error(r.error);
    },
    onSuccess: () => {
      toast.success("Saved");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!d.canEdit) return null;
  return (
    <div className="grid content-start gap-3 rounded-2xl border bg-card p-4">
      <div className="text-base font-extrabold">Schedule settings</div>

      <div className="grid gap-1">
        <span className="text-xs font-semibold">Lock the schedule until (nobody but an owner can change it)</span>
        <div className="flex gap-2">
          <input type="date" value={slot} onChange={(e) => setSlot(e.target.value)} className={veld} />
          <button
            disabled={opslaan.isPending}
            onClick={() => opslaan.mutate({ lockedUntil: slot || null })}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white"
          >
            <Lock className="h-4 w-4" /> {slot ? "Lock" : "Unlock"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            ["End of this week", addDays(d.monday, 6)],
            ["+ 4 weeks", addDays(d.monday, 27)],
            ["+ 3 months", addDays(d.monday, 90)],
          ].map(([l, v]) => (
            <button key={l} onClick={() => setSlot(v)} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold">
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">Coverage from</span>
          <input type="time" value={covS} onChange={(e) => setCovS(e.target.value)} className={veld} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold">until</span>
          <input type="time" value={covE} onChange={(e) => setCovE(e.target.value)} className={veld} />
        </label>
        <button
          disabled={opslaan.isPending}
          onClick={() => opslaan.mutate({ coverageStart: covS, coverageEnd: covE })}
          className="h-10 rounded-xl border px-4 text-sm font-bold"
        >
          Save
        </button>
      </div>

      {d.isOwner ? (
        <div className="grid gap-2 rounded-xl bg-muted/50 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Owner only</div>
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Who makes the schedule (besides the owners)</span>
            <select value={editor} onChange={(e) => setEditor(e.target.value)} className={veld}>
              <option value="">— only the owners —</option>
              {d.staff.filter((s) => !s.isOwner).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold">Who may see everyone&apos;s hours (besides the owners)</span>
            <select value={viewer} onChange={(e) => setViewer(e.target.value)} className={veld}>
              <option value="">— only the owners —</option>
              {d.staff.filter((s) => !s.isOwner).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={opslaan.isPending}
            onClick={() => opslaan.mutate({ editorProfileId: editor || null, hoursViewerProfileId: viewer || null })}
            className="h-10 w-fit rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground"
          >
            Save who does what
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Uren({ monday }: { monday: string }) {
  const q = useQuery({
    queryKey: ["staff-hours", monday],
    queryFn: async () => {
      const r = await getHours(monday);
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
  const tijd = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "";
  const rijen = useMemo(() => q.data ?? [], [q.data]);
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <div className="text-base font-extrabold">Hours this week</div>
        <div className="text-xs text-muted-foreground">
          Active = time the app was open and in view. Planned = the schedule. Actions = changes they made. Only you see this.
        </div>
      </div>
      {q.isPending ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="animate-spin" />
        </div>
      ) : q.isError ? (
        <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>
      ) : (
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 text-left">Admin</th>
              {DAGEN.map((n) => (
                <th key={n} className="px-2 py-2 text-left">
                  {n}
                </th>
              ))}
              <th className="px-4 py-2 text-right">Week</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((r) => (
              <tr key={r.profileId} className="border-t align-top">
                <td className="px-4 py-2 font-bold">{r.name}</td>
                {r.days.map((x) => (
                  <td key={x.day} className="px-2 py-2 text-xs" title={x.firstSeen ? `First seen ${tijd(x.firstSeen)}, last seen ${tijd(x.lastSeen)}` : ""}>
                    {x.activeMinutes || x.scheduledMinutes || x.actions ? (
                      <>
                        <div className="font-bold">{uren(x.activeMinutes)}</div>
                        <div className="text-muted-foreground">of {uren(x.scheduledMinutes)}</div>
                        {x.actions ? <div className="text-muted-foreground">{x.actions} actions</div> : null}
                        {x.firstSeen ? (
                          <div className="text-muted-foreground">
                            {tijd(x.firstSeen)}–{tijd(x.lastSeen)}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 text-right text-xs">
                  <div className="font-extrabold">{uren(r.totalActive)}</div>
                  <div className="text-muted-foreground">of {uren(r.totalScheduled)} planned</div>
                  <div className="text-muted-foreground">{r.totalActions} actions</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

