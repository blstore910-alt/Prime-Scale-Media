// ── HET ROOSTER, UITGEREKEND ────────────────────────────────────────
//
// Plak 189. Puur: weken, blokken, automatisch vullen, en wie er nu
// dienst heeft. Tijden als "HH:MM" en dagen als "YYYY-MM-DD", in
// Amsterdamse tijd -- zo leest de eigenaar het rooster.
//
// AUTOMATISCH VULLEN, de regels:
//   * de dekking (bv. 09:00-21:00) valt in twee blokken: ochtend tot het
//     midden, laat vanaf het midden ("full" = beide);
//   * per dag eerst de ochtend, dan laat; voorkeur voor wie dat blok wil
//     (of "any"/"full"), dan wie deze week het minst heeft;
//   * nooit op een dag die niet in iemands voorkeursdagen staat, en nooit
//     meer dagen dan zijn max_days;
//   * dagen t/m locked_until en dagen waar al iemand staat, blijven af;
//   * lukt een blok niet, dan blijft het leeg en zegt het resultaat het.

export type Block = "morning" | "late" | "full" | "any";

export type Pref = {
  profileId: string;
  days: number[]; // ISO: 1 = maandag ... 7 = zondag
  block: Block;
  maxDays: number;
};

export type Shift = { profileId: string; day: string; start: string; end: string };

export const toMin = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const toTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Maandag van de week van `day`. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const iso = ((d.getUTCDay() + 6) % 7) + 1;
  d.setUTCDate(d.getUTCDate() - (iso - 1));
  return d.toISOString().slice(0, 10);
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function isoWeekday(day: string): number {
  return ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** De blokken bij een dekking. Het midden valt op een heel uur. */
export function blocks(coverageStart: string, coverageEnd: string) {
  const s = toMin(coverageStart);
  const e = toMin(coverageEnd);
  const mid = Math.round((s + e) / 2 / 60) * 60;
  return {
    morning: { start: toTime(s), end: toTime(mid) },
    late: { start: toTime(mid), end: toTime(e) },
    full: { start: toTime(s), end: toTime(e) },
  };
}

export function autoFill(input: {
  monday: string;
  prefs: Pref[];
  existing: Shift[];
  coverageStart: string;
  coverageEnd: string;
  lockedUntil?: string | null;
}): { shifts: Shift[]; gaps: { day: string; block: "morning" | "late" }[] } {
  const b = blocks(input.coverageStart, input.coverageEnd);
  const uit: Shift[] = [];
  const gaps: { day: string; block: "morning" | "late" }[] = [];
  const dagenPer = new Map<string, number>();
  for (const s of input.existing) {
    if (weekDays(input.monday).includes(s.day)) dagenPer.set(s.profileId, (dagenPer.get(s.profileId) ?? 0) + 1);
  }

  for (const day of weekDays(input.monday)) {
    if (input.lockedUntil && day <= input.lockedUntil) continue;
    if (input.existing.some((s) => s.day === day)) continue;
    const wd = isoWeekday(day);
    const kan = input.prefs.filter((p) => p.days.includes(wd) && (dagenPer.get(p.profileId) ?? 0) < p.maxDays);
    const kies = (want: "morning" | "late", nietDeze?: string) => {
      const pool = kan.filter((p) => p.profileId !== nietDeze);
      const rang = (p: Pref) => (p.block === want ? 0 : p.block === "full" ? 1 : p.block === "any" ? 2 : 3);
      return [...pool].sort(
        (x, y) =>
          rang(x) - rang(y) ||
          (dagenPer.get(x.profileId) ?? 0) - (dagenPer.get(y.profileId) ?? 0) ||
          x.profileId.localeCompare(y.profileId),
      )[0];
    };

    const ochtend = kies("morning");
    if (ochtend && ochtend.block === "full") {
      uit.push({ profileId: ochtend.profileId, day, ...b.full });
      dagenPer.set(ochtend.profileId, (dagenPer.get(ochtend.profileId) ?? 0) + 1);
      continue;
    }
    const laat = kies("late", ochtend?.profileId);
    if (ochtend && ochtend.block !== "late") {
      uit.push({ profileId: ochtend.profileId, day, ...b.morning });
      dagenPer.set(ochtend.profileId, (dagenPer.get(ochtend.profileId) ?? 0) + 1);
    } else if (!ochtend) gaps.push({ day, block: "morning" });
    if (laat && laat.block !== "morning") {
      uit.push({ profileId: laat.profileId, day, ...b.late });
      dagenPer.set(laat.profileId, (dagenPer.get(laat.profileId) ?? 0) + 1);
    } else if (ochtend && ochtend.block === "late") {
      // De enige die kon, wil laat: geef hem laat, de ochtend blijft open.
      uit.push({ profileId: ochtend.profileId, day, ...b.late });
      dagenPer.set(ochtend.profileId, (dagenPer.get(ochtend.profileId) ?? 0) + 1);
      gaps.push({ day, block: "morning" });
    } else gaps.push({ day, block: "late" });
  }
  return { shifts: uit, gaps };
}

/** Wie heeft er nu dienst: diensten van vandaag waar `nowHm` binnen valt. */
export function onNow<T extends { day: string; start: string; end: string }>(shifts: T[], today: string, nowHm: string): T[] {
  const n = toMin(nowHm);
  return shifts.filter((s) => s.day === today && toMin(s.start) <= n && n < toMin(s.end));
}

/** Minuten van een dienst. */
export const shiftMinutes = (s: { start: string; end: string }) => Math.max(0, toMin(s.end) - toMin(s.start));
