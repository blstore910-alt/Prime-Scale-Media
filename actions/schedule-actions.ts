"use server";

// ── HET ROOSTER VAN DE ADMINS, EN HUN UREN ──────────────────────────
//
// Plak 189. Zie lib/pure-schedule.ts voor de rekenregels.
//
// Wie mag wat:
//   lezen (rooster, voorkeuren)     elke admin
//   rooster wijzigen, vullen, slot  een eigenaar, of DE roostermaker die
//                                   een eigenaar aanwees
//   eigen voorkeuren                elke admin, alleen de eigen
//   roostermaker / urenkijker kiezen alleen een eigenaar
//   uren zien                       een eigenaar, of DE urenkijker
//   op een vastgezette dag          alleen een eigenaar
//
// Schrijven met de service-sleutel, NA resolveAdminContext (maintenance,
// read-only-schakelaar, rol), met de tenant uit de sessie.

import { resolveAdminContext } from "./_shared";
import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { amsterdamYmd } from "@/lib/pure-backup";
import { isTenantOwner } from "@/lib/auth/is-tenant-owner";
import { autoFill, addDays, weekDays, weekStart, type Block, type Pref } from "@/lib/pure-schedule";

type R<T> = { ok: true; data: T } | { ok: false; error: string };

const ontbreekt = (e: { message?: string } | null) => !!e && /does not exist|schema cache/i.test(String(e.message ?? ""));
const PLAK = "The schedule needs plak 189 first.";
const hm = (t: string | null | undefined) => String(t ?? "").slice(0, 5);
const geldigeTijd = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) || t === "24:00";
const geldigeDag = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

function vandaag(): string {
  const { y, m, day } = amsterdamYmd(new Date());
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function nuHm(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export type StaffMember = { id: string; name: string; email: string | null; isOwner: boolean };
export type ShiftRow = { id: string; profileId: string; day: string; start: string; end: string; note: string | null };
export type PrefRow = { profileId: string; days: number[]; block: Block; maxDays: number; note: string | null };
export type ScheduleSettings = {
  editorProfileId: string | null;
  hoursViewerProfileId: string | null;
  lockedUntil: string | null;
  coverageStart: string;
  coverageEnd: string;
};
export type ScheduleData = {
  monday: string;
  today: string;
  me: string;
  staff: StaffMember[];
  shifts: ShiftRow[];
  prefs: PrefRow[];
  settings: ScheduleSettings;
  isOwner: boolean;
  canEdit: boolean;
  canSeeHours: boolean;
  plakNodig: boolean;
};

async function context() {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false as const, error: res0.error };
  const tenantId = res0.ctx.profile.tenant_id as string;
  const me = res0.ctx.profile.id as string;
  const db = await createAdminClient();
  const isOwner = await isTenantOwner(db, tenantId, res0.ctx.profile.user_id, me);
  const { data: s, error } = await db.from("staff_schedule_settings").select("*").eq("tenant_id", tenantId).limit(1).maybeSingle();
  const plakNodig = !!error && ontbreekt(error);
  const row = (s ?? {}) as Record<string, string | null>;
  const settings: ScheduleSettings = {
    editorProfileId: row.editor_profile_id ?? null,
    hoursViewerProfileId: row.hours_viewer_profile_id ?? null,
    lockedUntil: row.locked_until ? String(row.locked_until).slice(0, 10) : null,
    coverageStart: hm(row.coverage_start) || "09:00",
    coverageEnd: hm(row.coverage_end) || "21:00",
  };
  return {
    ok: true as const,
    db,
    tenantId,
    me,
    isOwner,
    plakNodig,
    settings,
    canEdit: isOwner || settings.editorProfileId === me,
    canSeeHours: isOwner || settings.hoursViewerProfileId === me,
  };
}

async function staffOf(db: Awaited<ReturnType<typeof createAdminClient>>, tenantId: string): Promise<StaffMember[]> {
  const { data } = await db
    .from("user_profiles")
    .select("id, user_id, full_name, email, is_active, status")
    .eq("tenant_id", tenantId)
    .eq("role", "admin");
  const rijen = ((data ?? []) as { id: string; user_id: string; full_name: string | null; email: string | null; is_active: boolean | null; status: string | null }[])
    .filter((p) => p.is_active !== false && p.status !== "inactive");
  const uit: StaffMember[] = [];
  for (const p of rijen) {
    uit.push({
      id: p.id,
      name: (p.full_name ?? "").trim() || (p.email ?? "").split("@")[0],
      email: p.email,
      isOwner: await isTenantOwner(db, tenantId, p.user_id, p.id),
    });
  }
  return uit.sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || a.name.localeCompare(b.name));
}

export async function getSchedule(day?: string | null): Promise<R<ScheduleData>> {
  const c = await context();
  if (!c.ok) return c;
  const today = vandaag();
  const monday = weekStart(day && geldigeDag(day) ? day : today);
  const staff = await staffOf(c.db, c.tenantId);
  const base = {
    monday,
    today,
    me: c.me,
    staff,
    settings: c.settings,
    isOwner: c.isOwner,
    canEdit: c.canEdit,
    canSeeHours: c.canSeeHours,
  };
  if (c.plakNodig) return { ok: true, data: { ...base, shifts: [], prefs: [], plakNodig: true } };

  const { data: sh, error } = await c.db
    .from("staff_shifts")
    .select("id, profile_id, day, start_time, end_time, note")
    .eq("tenant_id", c.tenantId)
    .gte("day", monday)
    .lte("day", addDays(monday, 6))
    .order("start_time");
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const { data: pr, error: pErr } = await c.db
    .from("staff_preferences")
    .select("profile_id, days, block, max_days, note")
    .eq("tenant_id", c.tenantId);
  if (pErr) return { ok: false, error: safeErrorMessage(pErr) };

  return {
    ok: true,
    data: {
      ...base,
      plakNodig: false,
      shifts: ((sh ?? []) as { id: string; profile_id: string; day: string; start_time: string; end_time: string; note: string | null }[]).map((s) => ({
        id: s.id,
        profileId: s.profile_id,
        day: String(s.day).slice(0, 10),
        start: hm(s.start_time),
        end: hm(s.end_time),
        note: s.note,
      })),
      prefs: ((pr ?? []) as { profile_id: string; days: number[]; block: Block; max_days: number; note: string | null }[]).map((p) => ({
        profileId: p.profile_id,
        days: p.days ?? [],
        block: p.block,
        maxDays: p.max_days,
        note: p.note,
      })),
    },
  };
}

function magDag(c: { isOwner: boolean; settings: ScheduleSettings }, day: string): string | null {
  if (!c.isOwner && c.settings.lockedUntil && day <= c.settings.lockedUntil) {
    return `The schedule is locked until ${c.settings.lockedUntil}. Only an owner can change it.`;
  }
  return null;
}

export async function saveShift(input: {
  id?: string | null;
  profileId: string;
  day: string;
  start: string;
  end: string;
  note?: string | null;
}): Promise<R<{ id: string }>> {
  const c = await context();
  if (!c.ok) return c;
  if (c.plakNodig) return { ok: false, error: PLAK };
  if (!c.canEdit) return { ok: false, error: "Only the owner or the schedule maker can change the schedule." };
  const day = String(input?.day ?? "");
  const start = String(input?.start ?? "");
  const end = String(input?.end ?? "");
  if (!geldigeDag(day)) return { ok: false, error: "Pick a day." };
  if (!geldigeTijd(start) || !geldigeTijd(end)) return { ok: false, error: "Use times like 09:00." };
  if (end <= start) return { ok: false, error: "The end has to be after the start." };
  const slot = magDag(c, day);
  if (slot) return { ok: false, error: slot };
  const staff = await staffOf(c.db, c.tenantId);
  if (!staff.some((s) => s.id === input.profileId)) return { ok: false, error: "That person is not an admin here." };
  const rij = {
    tenant_id: c.tenantId,
    profile_id: input.profileId,
    day,
    start_time: start === "24:00" ? "23:59" : start,
    end_time: end === "24:00" ? "23:59" : end,
    note: String(input?.note ?? "").trim().slice(0, 200) || null,
    created_by: c.me,
  };
  if (input.id) {
    const { data: oud } = await c.db.from("staff_shifts").select("day").eq("id", input.id).eq("tenant_id", c.tenantId).maybeSingle();
    if (!oud) return { ok: false, error: "That shift was not found." };
    const slot2 = magDag(c, String((oud as { day: string }).day).slice(0, 10));
    if (slot2) return { ok: false, error: slot2 };
    const { data, error } = await c.db.from("staff_shifts").update(rij).eq("id", input.id).eq("tenant_id", c.tenantId).select("id");
    if (error) return { ok: false, error: safeErrorMessage(error) };
    if (!(data ?? []).length) return { ok: false, error: "Nothing was saved." };
    return { ok: true, data: { id: input.id } };
  }
  const { data, error } = await c.db.from("staff_shifts").insert(rij).select("id").single();
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deleteShift(id: string): Promise<R<null>> {
  const c = await context();
  if (!c.ok) return c;
  if (!c.canEdit) return { ok: false, error: "Only the owner or the schedule maker can change the schedule." };
  const { data: oud } = await c.db.from("staff_shifts").select("day").eq("id", String(id ?? "")).eq("tenant_id", c.tenantId).maybeSingle();
  if (!oud) return { ok: false, error: "That shift was not found." };
  const slot = magDag(c, String((oud as { day: string }).day).slice(0, 10));
  if (slot) return { ok: false, error: slot };
  const { error } = await c.db.from("staff_shifts").delete().eq("id", String(id)).eq("tenant_id", c.tenantId);
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

/** Vorige week overnemen in de gekozen week, op dagen die nog leeg zijn. */
export async function copyPreviousWeek(monday: string): Promise<R<{ added: number }>> {
  const c = await context();
  if (!c.ok) return c;
  if (c.plakNodig) return { ok: false, error: PLAK };
  if (!c.canEdit) return { ok: false, error: "Only the owner or the schedule maker can change the schedule." };
  if (!geldigeDag(monday)) return { ok: false, error: "Pick a week." };
  const m = weekStart(monday);
  const vorige = addDays(m, -7);
  const { data: oud } = await c.db
    .from("staff_shifts")
    .select("profile_id, day, start_time, end_time, note")
    .eq("tenant_id", c.tenantId)
    .gte("day", vorige)
    .lte("day", addDays(vorige, 6));
  const { data: nu } = await c.db.from("staff_shifts").select("day").eq("tenant_id", c.tenantId).gte("day", m).lte("day", addDays(m, 6));
  const bezet = new Set(((nu ?? []) as { day: string }[]).map((x) => String(x.day).slice(0, 10)));
  const rijen = ((oud ?? []) as { profile_id: string; day: string; start_time: string; end_time: string; note: string | null }[])
    .map((s) => ({ ...s, day: addDays(String(s.day).slice(0, 10), 7) }))
    .filter((s) => !bezet.has(s.day) && !magDag(c, s.day))
    .map((s) => ({ tenant_id: c.tenantId, profile_id: s.profile_id, day: s.day, start_time: s.start_time, end_time: s.end_time, note: s.note, created_by: c.me }));
  if (!rijen.length) return { ok: true, data: { added: 0 } };
  const { error } = await c.db.from("staff_shifts").insert(rijen);
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: { added: rijen.length } };
}

/** Vul de lege dagen van de week uit de voorkeuren. */
export async function autoFillWeek(monday: string): Promise<R<{ added: number; gaps: { day: string; block: string }[] }>> {
  const c = await context();
  if (!c.ok) return c;
  if (c.plakNodig) return { ok: false, error: PLAK };
  if (!c.canEdit) return { ok: false, error: "Only the owner or the schedule maker can change the schedule." };
  const m = weekStart(geldigeDag(monday) ? monday : vandaag());
  const staff = await staffOf(c.db, c.tenantId);
  const { data: pr } = await c.db.from("staff_preferences").select("profile_id, days, block, max_days").eq("tenant_id", c.tenantId);
  const per = new Map(((pr ?? []) as { profile_id: string; days: number[]; block: Block; max_days: number }[]).map((p) => [p.profile_id, p]));
  // Wie geen voorkeuren invulde: werkdagen, elk blok, vijf dagen.
  const prefs: Pref[] = staff.map((s) => {
    const p = per.get(s.id);
    return p
      ? { profileId: s.id, days: p.days ?? [], block: p.block, maxDays: p.max_days }
      : { profileId: s.id, days: [1, 2, 3, 4, 5], block: "any", maxDays: 5 };
  });
  const { data: nu } = await c.db
    .from("staff_shifts")
    .select("profile_id, day, start_time, end_time")
    .eq("tenant_id", c.tenantId)
    .gte("day", m)
    .lte("day", addDays(m, 6));
  // Een niet-eigenaar mag vastgezette dagen niet raken; een eigenaar
  // vult ook dan alleen lege dagen, dus het slot geldt hier voor iedereen.
  const r = autoFill({
    monday: m,
    prefs,
    existing: ((nu ?? []) as { profile_id: string; day: string; start_time: string; end_time: string }[]).map((s) => ({
      profileId: s.profile_id,
      day: String(s.day).slice(0, 10),
      start: hm(s.start_time),
      end: hm(s.end_time),
    })),
    coverageStart: c.settings.coverageStart,
    coverageEnd: c.settings.coverageEnd,
    lockedUntil: c.settings.lockedUntil,
  });
  if (r.shifts.length) {
    const { error } = await c.db.from("staff_shifts").insert(
      r.shifts.map((s) => ({
        tenant_id: c.tenantId,
        profile_id: s.profileId,
        day: s.day,
        start_time: s.start,
        end_time: s.end,
        note: "auto-filled",
        created_by: c.me,
      })),
    );
    if (error) return { ok: false, error: safeErrorMessage(error) };
  }
  return { ok: true, data: { added: r.shifts.length, gaps: r.gaps } };
}

export async function saveMyPreferences(input: {
  days: number[];
  block: Block;
  maxDays: number;
  note?: string | null;
}): Promise<R<null>> {
  const c = await context();
  if (!c.ok) return c;
  if (c.plakNodig) return { ok: false, error: PLAK };
  const days = Array.from(new Set((input?.days ?? []).map(Number).filter((d) => d >= 1 && d <= 7))).sort();
  const block = (["morning", "late", "full", "any"] as Block[]).includes(input?.block) ? input.block : "any";
  const maxDays = Math.max(0, Math.min(7, Math.round(Number(input?.maxDays ?? 5))));
  const { error } = await c.db.from("staff_preferences").upsert(
    {
      tenant_id: c.tenantId,
      profile_id: c.me,
      days,
      block,
      max_days: maxDays,
      note: String(input?.note ?? "").trim().slice(0, 300) || null,
    },
    { onConflict: "profile_id" },
  );
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

export async function saveScheduleSettings(input: {
  editorProfileId?: string | null;
  hoursViewerProfileId?: string | null;
  lockedUntil?: string | null;
  coverageStart?: string;
  coverageEnd?: string;
}): Promise<R<null>> {
  const c = await context();
  if (!c.ok) return c;
  if (c.plakNodig) return { ok: false, error: PLAK };
  if (!c.canEdit) return { ok: false, error: "Only the owner or the schedule maker can change this." };
  const patch: Record<string, unknown> = { tenant_id: c.tenantId };
  const staff = await staffOf(c.db, c.tenantId);
  const isStaff = (id: string | null | undefined) => !id || staff.some((s) => s.id === id);
  // Wie het rooster maakt en wie de uren ziet: alleen een eigenaar.
  if (input.editorProfileId !== undefined || input.hoursViewerProfileId !== undefined) {
    if (!c.isOwner) return { ok: false, error: "Only an owner chooses the schedule maker and who sees the hours." };
    if (!isStaff(input.editorProfileId) || !isStaff(input.hoursViewerProfileId)) return { ok: false, error: "Pick an admin." };
    if (input.editorProfileId !== undefined) patch.editor_profile_id = input.editorProfileId || null;
    if (input.hoursViewerProfileId !== undefined) patch.hours_viewer_profile_id = input.hoursViewerProfileId || null;
  }
  if (input.lockedUntil !== undefined) {
    if (input.lockedUntil && !geldigeDag(input.lockedUntil)) return { ok: false, error: "Pick a date to lock until." };
    // Een roostermaker mag het slot verder zetten, niet terughalen.
    if (!c.isOwner && c.settings.lockedUntil && (!input.lockedUntil || input.lockedUntil < c.settings.lockedUntil)) {
      return { ok: false, error: "Only an owner can unlock days that are already locked." };
    }
    patch.locked_until = input.lockedUntil || null;
  }
  if (input.coverageStart !== undefined || input.coverageEnd !== undefined) {
    const s = input.coverageStart ?? c.settings.coverageStart;
    const e = input.coverageEnd ?? c.settings.coverageEnd;
    if (!geldigeTijd(s) || !geldigeTijd(e) || e <= s) return { ok: false, error: "Coverage needs a start before the end, like 09:00–21:00." };
    patch.coverage_start = s;
    patch.coverage_end = e;
  }
  const { error } = await c.db.from("staff_schedule_settings").upsert(patch, { onConflict: "tenant_id" });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

// ── WIE IS ER NU ─────────────────────────────────────────────────────
export type LiveNow = {
  plakNodig: boolean;
  onShift: { name: string; until: string; online: boolean }[];
  next: { name: string; start: string } | null;
};

export async function getLiveNow(): Promise<R<LiveNow>> {
  const c = await context();
  if (!c.ok) return c;
  if (c.plakNodig) return { ok: true, data: { plakNodig: true, onShift: [], next: null } };
  const today = vandaag();
  const nu = nuHm();
  const { data } = await c.db
    .from("staff_shifts")
    .select("profile_id, start_time, end_time")
    .eq("tenant_id", c.tenantId)
    .eq("day", today)
    .order("start_time");
  const staff = await staffOf(c.db, c.tenantId);
  const naam = new Map(staff.map((s) => [s.id, s.name]));
  // Online = de hartslag van de laatste vijf minuten. Alleen ja/nee; de
  // uren zelf blijven voor wie ze mag zien.
  const { data: act } = await c.db
    .from("staff_activity_days")
    .select("profile_id, last_seen")
    .eq("tenant_id", c.tenantId)
    .eq("day", today);
  const online = new Set(
    ((act ?? []) as { profile_id: string; last_seen: string }[])
      .filter((a) => Date.now() - new Date(a.last_seen).getTime() < 5 * 60_000)
      .map((a) => a.profile_id),
  );
  const rijen = ((data ?? []) as { profile_id: string; start_time: string; end_time: string }[]).map((s) => ({
    id: s.profile_id,
    start: hm(s.start_time),
    end: hm(s.end_time),
  }));
  const onShift = rijen
    .filter((s) => s.start <= nu && nu < s.end)
    .map((s) => ({ name: naam.get(s.id) ?? "Admin", until: s.end, online: online.has(s.id) }));
  const volgende = rijen.find((s) => s.start > nu);
  return {
    ok: true,
    data: { plakNodig: false, onShift, next: volgende ? { name: naam.get(volgende.id) ?? "Admin", start: volgende.start } : null },
  };
}

// ── DE UREN (eigenaar + de urenkijker) ───────────────────────────────
export type HoursRow = {
  profileId: string;
  name: string;
  days: { day: string; firstSeen: string | null; lastSeen: string | null; activeMinutes: number; scheduledMinutes: number; actions: number }[];
  totalActive: number;
  totalScheduled: number;
  totalActions: number;
};

export async function getHours(monday: string): Promise<R<HoursRow[]>> {
  const c = await context();
  if (!c.ok) return c;
  if (!c.canSeeHours) return { ok: false, error: "Only an owner, or the admin they chose, can see hours." };
  if (c.plakNodig) return { ok: true, data: [] };
  const m = weekStart(geldigeDag(monday) ? monday : vandaag());
  const eind = addDays(m, 6);
  const staff = await staffOf(c.db, c.tenantId);
  const [{ data: act, error: aErr }, { data: sh }] = await Promise.all([
    c.db
      .from("staff_activity_days")
      .select("profile_id, day, first_seen, last_seen, active_minutes")
      .eq("tenant_id", c.tenantId)
      .gte("day", m)
      .lte("day", eind),
    c.db.from("staff_shifts").select("profile_id, day, start_time, end_time").eq("tenant_id", c.tenantId).gte("day", m).lte("day", eind),
  ]);
  if (aErr) return { ok: false, error: safeErrorMessage(aErr) };

  // Acties: wat ze in de app VERANDERDEN, uit de auditregel.
  // Ruim genomen (een dag eromheen) en daarna per Amsterdamse dag geteld:
  // zo maakt de zomer- of wintertijd geen verschil.
  const van = `${addDays(m, -1)}T00:00:00Z`;
  const tot = `${addDays(m, 8)}T00:00:00Z`;
  const { data: ev } = await c.db
    .from("audit_events")
    .select("actor_profile_id, occurred_at")
    .eq("tenant_id", c.tenantId)
    .in("actor_profile_id", staff.map((s) => s.id))
    .gte("occurred_at", van)
    .lt("occurred_at", tot)
    .limit(20000);
  const acties = new Map<string, number>();
  for (const e of (ev ?? []) as { actor_profile_id: string; occurred_at: string }[]) {
    const { y, m: mm, day } = amsterdamYmd(new Date(e.occurred_at));
    const k = `${e.actor_profile_id}|${y}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    acties.set(k, (acties.get(k) ?? 0) + 1);
  }

  const actPer = new Map(
    ((act ?? []) as { profile_id: string; day: string; first_seen: string; last_seen: string; active_minutes: number }[]).map((a) => [
      `${a.profile_id}|${String(a.day).slice(0, 10)}`,
      a,
    ]),
  );
  const rooster = new Map<string, number>();
  for (const s of (sh ?? []) as { profile_id: string; day: string; start_time: string; end_time: string }[]) {
    const k = `${s.profile_id}|${String(s.day).slice(0, 10)}`;
    const [h1, m1] = hm(s.start_time).split(":").map(Number);
    const [h2, m2] = hm(s.end_time).split(":").map(Number);
    rooster.set(k, (rooster.get(k) ?? 0) + Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1)));
  }

  return {
    ok: true,
    data: staff.map((s) => {
      const days = weekDays(m).map((d) => {
        const k = `${s.id}|${d}`;
        const a = actPer.get(k);
        return {
          day: d,
          firstSeen: a?.first_seen ?? null,
          lastSeen: a?.last_seen ?? null,
          activeMinutes: a?.active_minutes ?? 0,
          scheduledMinutes: rooster.get(k) ?? 0,
          actions: acties.get(k) ?? 0,
        };
      });
      return {
        profileId: s.id,
        name: s.name,
        days,
        totalActive: days.reduce((x, d) => x + d.activeMinutes, 0),
        totalScheduled: days.reduce((x, d) => x + d.scheduledMinutes, 0),
        totalActions: days.reduce((x, d) => x + d.actions, 0),
      };
    }),
  };
}
