"use server";

// ── DE PARTNERGIDS BEHEREN ──────────────────────────────────────────
//
// De eigenaar, 30-09: "PSM partner directory > partners met wow super
// mooie tiles of grids of cards met links naar onze website waar meer
// info staat."
//
// De tabel komt uit plak 174. Een klant LEEST hem rechtstreeks (RLS
// laat alleen actieve partners van zijn eigen tenant door); alles wat
// schrijft gaat hierlangs.
//
// ── DE VIER REGELS VOOR EEN MUTATIE, ALLEMAAL ─────────────────────
//
// 1. resolveAdminContext -- draagt maintenanceGuard() en de
//    read-only-schakelaar. De leesvariant wordt hier met opzet niet
//    gebruikt: dit bestand schrijft, en tests/lib/readonly-admin.test.ts
//    verbiedt terecht dat een schrijvend bestand hem gebruikt.
// 2. Een kolom-allowlist. Nooit een gespreide payload in .update().
// 3. De rij opnieuw ophalen en de tenant SERVER-SIDE vergelijken.
// 4. ifUpdatedAt via versionMatches, zodat twee admins die tegelijk
//    dezelfde partner bewerken elkaar niet blind overschrijven.
//
// ── UITZETTEN OF VERWIJDEREN ──────────────────────────────────────
//
// Eerst was er alleen "uit" (is_active = false): weg voor elke klant,
// met een klik terug. De eigenaar, 01-10: "admin moet ook easy en snel
// partners kunnen toevoegen of verwijderen". Dus nu ook verwijderen --
// met een bevestiging in het scherm, want dat is niet terug te draaien.
// Een partner is geen geld; er hangt niets aan vast.

import { resolveAdminContext, versionMatches } from "./_shared";
import { safeErrorMessage } from "@/lib/pure-error";
import { createAdminClient } from "@/lib/supabase/server";
import { PARTNER_ICON_KEYS } from "@/lib/partner-icons";

export type PartnerRow = {
  id: string;
  name: string;
  tagline: string | null;
  category: string | null;
  url: string | null;
  logo_url: string | null;
  accent: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
  // Plak 181. Afwezig tot die gedraaid is.
  highlights?: string[] | null;
  icon?: string | null;
  badge?: string | null;
  cta_label?: string | null;
  cta2_label?: string | null;
  cta2_url?: string | null;
};

const KOLOMMEN =
  "id, name, tagline, category, url, logo_url, accent, sort_order, is_active, updated_at";
const KOLOMMEN_181 = `${KOLOMMEN}, highlights, icon, badge, cta_label, cta2_label, cta2_url`;

/** Een kolom die plak 181 nog niet heeft toegevoegd. */
const kolomOntbreekt = (e: { message?: string } | null) =>
  !!e && /column .* does not exist|schema cache/i.test(String(e.message ?? ""));

/** Alles, ook wat uit staat -- dit is het beheerscherm. */
export async function listPartnersForAdmin(): Promise<
  { ok: true; data: PartnerRow[]; plakNodig: boolean } | { ok: false; error: string }
> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const { profile } = res0.ctx;

  // ── DE SERVICE-ROL, NA DE BEHEERTOETS ────────────────────────────
  //
  // De gewone client leest via RLS, en de policy uit plak 174 laat
  // alleen ACTIEVE partners door -- zo hoort het voor een klant. Maar
  // dan verdwijnt een uitgezette partner ook uit het beheerscherm, en
  // kan hij nooit meer terug aangezet worden. Dus: eerst bewijzen dat
  // dit een admin is (resolveAdminContext hierboven), dan pas de
  // service-rol, met de tenant uit de SESSIE als enige filter. Hetzelfde
  // patroon als ad-account-actions.ts.
  const db = await createAdminClient();
  const lees = (kol: string) =>
    db
      .from("partners")
      .select(kol)
      .eq("tenant_id", profile.tenant_id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
  let plakNodig = false;
  let { data, error } = await lees(KOLOMMEN_181);
  if (kolomOntbreekt(error)) {
    plakNodig = true;
    ({ data, error } = await lees(KOLOMMEN));
  }
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: (data ?? []) as unknown as PartnerRow[], plakNodig };
}

export type PartnerInput = {
  id?: string | null;
  name: string;
  tagline?: string | null;
  category?: string | null;
  url?: string | null;
  logo_url?: string | null;
  accent?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  highlights?: string[] | null;
  icon?: string | null;
  badge?: string | null;
  cta_label?: string | null;
  cta2_label?: string | null;
  cta2_url?: string | null;
  ifUpdatedAt?: string | null;
};

/** Leeg wordt null; anders ingekort en getrimd. */
function tekst(v: unknown, max: number): string | null {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

/** Alleen https, en alleen een echte URL -- de database toetst het ook,
 *  maar een klant die een kapotte link te zien krijgt heeft er niets aan
 *  dat Postgres hem had geweigerd. Beter hier met een zin. */
function link(v: unknown): { ok: true; value: string | null } | { ok: false } {
  const s = String(v ?? "").trim();
  if (!s) return { ok: true, value: null };
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return { ok: false };
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false };
  }
}

export async function savePartner(
  input: PartnerInput,
): Promise<
  | { ok: true; data: { id: string; ingekort?: boolean; plakNodig?: boolean } }
  | { ok: false; error: string }
> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const { profile } = res0.ctx;

  // ── WAAROM DE SERVICE-ROL ────────────────────────────────────────
  //
  // Plak 174 geeft `authenticated` op deze tabel ALLEEN select -- de
  // huisregel voor een nieuwe tabel, zodat RLS nooit de enige muur is.
  // Een schrijfactie met de gewone client wordt dus door Postgres zelf
  // geweigerd. De grens zit hier: resolveAdminContext hierboven, de
  // tenant uit de sessie, en de allowlist hieronder. Pas daarna de
  // service-rol, die alleen nog uitvoert wat al is toegestaan.
  const supabase = await createAdminClient();

  const name = tekst(input?.name, 80);
  if (!name) return { ok: false, error: "Give the partner a name." };

  const url = link(input?.url);
  if (!url.ok) {
    return {
      ok: false,
      error: "The link has to start with https:// — it opens on a customer's phone.",
    };
  }
  const logo = link(input?.logo_url);
  if (!logo.ok) {
    return { ok: false, error: "The logo link has to start with https://." };
  }

  const cta2 = link(input?.cta2_url);
  if (!cta2.ok) {
    return { ok: false, error: "The second button's link has to start with https://." };
  }

  const accentRaw = String(input?.accent ?? "").trim();
  const accent = /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw : null;

  // ── DE ALLOWLIST ─────────────────────────────────────────────────
  // Precies deze kolommen. tenant_id komt van de SESSIE, nooit van de
  // aanroeper; id en de tijden van de database.
  const rij = {
    name,
    // 400 sinds plak 181. Tot die gedraaid is, weigert de database alles
    // boven de 120 -- zie inkorten() hieronder.
    tagline: tekst(input?.tagline, 400),
    category: tekst(input?.category, 40),
    url: url.value,
    logo_url: logo.value,
    accent,
    sort_order: Number.isFinite(Number(input?.sort_order))
      ? Math.round(Number(input?.sort_order))
      : 100,
    is_active: input?.is_active !== false,
  };

  // De velden van plak 181, ook allowlisted en begrensd.
  const highlights = (Array.isArray(input?.highlights) ? input.highlights : [])
    .map((h) => String(h ?? "").trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 4);
  const iconRaw = String(input?.icon ?? "").trim();
  const extra = {
    highlights: highlights.length ? highlights : null,
    icon: PARTNER_ICON_KEYS.includes(iconRaw) ? iconRaw : null,
    badge: tekst(input?.badge, 30),
    cta_label: tekst(input?.cta_label, 30),
    cta2_label: cta2.value ? tekst(input?.cta2_label, 30) : null,
    cta2_url: cta2.value,
  };

  const id = String(input?.id ?? "").trim();

  // ── KOLOMMEN DIE DE MIGRATIE NOG NIET HEEFT ─────────────────────
  // Zonder plak 181 bestaan de nieuwe kolommen niet en weigert
  // partners_tagline_check alles boven de 120 tekens. Dan niet het hele
  // opslaan laten mislukken: zonder de nieuwe velden, ingekort, nog een
  // keer -- en zeggen wat er gebeurde.
  const teLang = (e: { message?: string } | null) =>
    !!e && /partners_tagline_check/.test(String(e.message ?? ""));
  let plakNodig = false;
  let ingekort = false;
  const payload = (): Record<string, unknown> => ({
    ...rij,
    ...(plakNodig ? {} : extra),
    tagline: ingekort && rij.tagline ? rij.tagline.slice(0, 120) : rij.tagline,
  });
  /** Probeert, en past bij een bekende weigering het payload aan. */
  async function probeer<T extends { error: { message?: string } | null }>(
    doe: () => PromiseLike<T>,
  ): Promise<T> {
    let res = await doe();
    for (let i = 0; i < 2 && res.error; i++) {
      if (!plakNodig && kolomOntbreekt(res.error)) plakNodig = true;
      else if (!ingekort && teLang(res.error)) ingekort = true;
      else break;
      res = await doe();
    }
    return res;
  }

  if (!id) {
    const { data, error } = await probeer(() =>
      supabase
        .from("partners")
        .insert({ ...payload(), tenant_id: profile.tenant_id })
        .select("id")
        .limit(1),
    );
    if (error) return { ok: false, error: safeErrorMessage(error) };
    const nieuw = (data ?? [])[0];
    // Nul rijen terug is geen succes: RLS geeft geen fout maar een lege
    // lijst, en "Opgeslagen" boven niets is de fout waar deze app voor
    // is doorgelicht.
    if (!nieuw?.id) {
      return {
        ok: false,
        error: "The partner was not saved. Run plak 174 first, or tell us.",
      };
    }
    return { ok: true, data: { id: String(nieuw.id), ingekort, plakNodig } };
  }

  // ── BESTAANDE RIJ: TENANT EN VERSIE TOETSEN ─────────────────────
  const { data: bestaand, error: leesFout } = await supabase
    .from("partners")
    .select("id, tenant_id, updated_at")
    .eq("id", id)
    .limit(1);
  if (leesFout) return { ok: false, error: safeErrorMessage(leesFout) };
  const oud = (bestaand ?? [])[0];
  if (!oud) return { ok: false, error: "That partner was not found." };
  if (oud.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (!versionMatches(oud.updated_at, input?.ifUpdatedAt)) {
    return {
      ok: false,
      error: "Somebody else changed this partner while you were editing. Reload and try again.",
    };
  }

  const { data: bijgewerkt, error: schrijfFout } = await probeer(() =>
    supabase
      .from("partners")
      .update(payload())
      .eq("id", id)
      .eq("tenant_id", profile.tenant_id)
      .select("id"),
  );
  if (schrijfFout) return { ok: false, error: safeErrorMessage(schrijfFout) };
  if (!(bijgewerkt ?? []).length) {
    return { ok: false, error: "Nothing was changed — the partner may have been removed." };
  }
  return { ok: true, data: { id, ingekort, plakNodig } };
}

/** Een partner echt weghalen. Het scherm vraagt eerst om bevestiging. */
export async function deletePartner(input: {
  id: string;
  ifUpdatedAt?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const { profile } = res0.ctx;
  const supabase = await createAdminClient();

  const id = String(input?.id ?? "").trim();
  if (!id) return { ok: false, error: "Which partner?" };
  const { data: bestaand, error: leesFout } = await supabase
    .from("partners")
    .select("id, tenant_id, updated_at")
    .eq("id", id)
    .limit(1);
  if (leesFout) return { ok: false, error: safeErrorMessage(leesFout) };
  const oud = (bestaand ?? [])[0];
  if (!oud) return { ok: false, error: "That partner was already removed." };
  if (oud.tenant_id !== profile.tenant_id) return { ok: false, error: "Forbidden" };
  if (!versionMatches(oud.updated_at, input?.ifUpdatedAt)) {
    return { ok: false, error: "Somebody changed this partner a moment ago. Reload and try again." };
  }
  const { data, error } = await supabase
    .from("partners")
    .delete()
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: safeErrorMessage(error) };
  if (!(data ?? []).length) return { ok: false, error: "Nothing was removed." };
  return { ok: true };
}
