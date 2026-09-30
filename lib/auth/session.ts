import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  attachTeamAdvertiser,
  lacksOwnAdvertiser,
  type ProfileLike,
} from "@/lib/auth/pure-team-advertiser";

// Per-request deduplication of the two calls every authenticated page makes.
//
// Measured on the live app: a route change spent ~700ms in the server render,
// ~475ms of which was waiting on Supabase — because the work ran TWICE. The
// (app) layout calls auth.getUser() and fetches the profile, and then the page
// underneath calls requireAdmin() which does exactly the same two calls again.
// Four sequential round trips for one navigation, each ~100-120ms.
//
// React's cache() memoises per render pass, so the layout and the page that
// renders inside it share one result. Two round trips instead of four, with no
// change to behaviour: the same queries, the same freshness — a render pass is
// a single point in time, so there is nothing to go stale within it.
//
// Not a cross-request cache. Every new navigation still revalidates the
// session from Supabase; nothing here weakens the auth check.

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});

// One shape for both callers. The layout needs the joins for AppProvider;
// requireAdmin only needs id/role/is_active/status, and reading four fields
// off a row that has already been fetched is free — whereas asking for a
// narrower row separately costs another round trip, which is the whole
// problem this exists to solve.
const ADVERTISER_COLUMNS =
  "id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at";

export const getSessionProfiles = cache(async (userId: string) => {
  const supabase = await createClient();
  const res = await supabase
    .from("user_profiles")
    .select(
      // Explicit columns, NOT advertisers(*) — see
      // lib/types/advertiser-columns.ts for what that leaked and why a
      // literal list is the only thing PostgREST type inference accepts.
      "*, tenant:tenants(*), advertiser:advertisers(id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at)",
    )
    .eq("user_id", userId);
  return withTeamAdvertiser(supabase, res, userId);
});

// ── EEN TEAMLID KRIJGT DE ADVERTEERDER VAN ZIJN TEAM ───────────────
//
// Multi-user fase 3 (docs/TEAM_ACCOUNTS.md). Hierboven wordt de
// adverteerder ingebed via `profile_id`. Een teamlid heeft geen
// adverteerder met zijn EIGEN profile_id -- hij kijkt mee bij die van
// een ander -- dus die lijst is leeg, en de hele klantapp denkt dan
// "geen account".
//
// ── DIT LIGT OP HET PAD VAN ELKE LOGIN ────────────────────────────
//
// Een fout hier betekent dat niemand meer binnenkomt. Daarom drie
// dingen, en ze zijn geen voorzichtigheid maar de constructie:
//
//   1. ELKE GEBRUIKER VAN VANDAAG GAAT BIJ DE EERSTE TOETS ERUIT. Hij
//      heeft een eigen adverteerder, dus er is geen profiel zonder, en
//      `res` gaat ONGEWIJZIGD terug -- hetzelfde object, niet een kopie.
//   2. ALLES WAT MISLUKT GEEFT `res` ONGEWIJZIGD TERUG. Een lidmaatschap
//      dat niet te lezen is, een tabel die nog niet bestaat, een
//      exception: het teamlid ziet dan "geen account" -- precies wat hij
//      zonder deze functie zag. Nooit een fout die de login breekt.
//   3. DE EIGEN ADVERTEERDER WINT ALTIJD. Een profiel dat er een heeft
//      wordt niet aangeraakt, ook niet als die gebruiker ook ergens lid
//      is. `profile.advertiser[0]` blijft voor een gewone klant precies
//      wat het is.
//
// Leest via de gewone client: het lidmaatschap via de policy uit plak
// 175 (je eigen rij), de adverteerder via `advertisers_team_read` uit
// plak 179. Geen service-rol op het pad van een login.
async function withTeamAdvertiser<
  R extends { data: ProfileLike[] | null; error: unknown },
>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  res: R,
  userId: string,
): Promise<R> {
  if (res.error || !res.data) return res;

  // (1) -- hier gaat iedereen van vandaag eruit.
  if (!res.data.some(lacksOwnAdvertiser)) return res;

  try {
    const { data: leden, error: ledenFout } = await supabase
      .from("subject_members")
      .select("subject_id, tenant_id, role")
      .eq("user_id", userId)
      .eq("subject_kind", "advertiser")
      .order("created_at", { ascending: true });
    if (ledenFout || !leden?.length) return res;

    const ids = leden.map((l) => String(l.subject_id));
    const { data: advs, error: advFout } = await supabase
      .from("advertisers")
      .select(ADVERTISER_COLUMNS)
      .in("id", ids);
    if (advFout || !advs?.length) return res;

    // (3) en de tenantregel zitten in de pure functie, met hun tests.
    // Het lidmaatschap moet in DEZELFDE tenant zitten als het profiel:
    // een persoon kan in twee organisaties een profiel hebben, en het
    // team van de ene hoort niet onder het profiel van de andere.
    const data = attachTeamAdvertiser(
      res.data,
      leden.map((l) => ({
        subject_id: String(l.subject_id),
        tenant_id: String(l.tenant_id),
        role: String(l.role),
      })),
      advs.map((a) => ({ ...a, id: String(a.id) })),
    );
    return { ...res, data: data as R["data"] };
  } catch {
    return res; // (2)
  }
}
