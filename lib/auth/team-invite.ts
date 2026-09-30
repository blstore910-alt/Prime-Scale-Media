// ── EEN COLLEGA DIE EEN UITNODIGING ACCEPTEERT ──────────────────────
//
// Multi-user fase 3. Zie docs/TEAM_ACCOUNTS.md.
//
// Een gewone uitnodiging maakt bij acceptatie een NIEUWE klant: een
// profiel, een adverteerder, een wallet, een abonnement. Een
// teamuitnodiging moet dat juist NIET doen -- anders is de collega een
// tweede klant met een lege wallet, in plaats van iemand die meekijkt
// bij de eerste. Hij krijgt het profiel, en in plaats van de rest een
// rij in `subject_members` naar de adverteerder van zijn team.
//
// Beide acceptatieroutes (bestaande gebruiker, en nieuwe aanmelding)
// roepen deze twee functies aan, zodat ze niet uit elkaar kunnen lopen.
//
// ── WAAROM DE TEAMKOLOMMEN APART GELEZEN WORDEN ───────────────────
//
// `team_advertiser_id` en `member_role` komen met een plak, en code
// staat live voordat een plak gedraaid is. Een select die een kolom
// noemt die nog niet bestaat, degradeert niet -- hij GOOIT. Zou de
// bestaande uitnodigingslees deze kolommen noemen, dan faalde de
// acceptatie voor IEDEREEN tot de plak er is: geen enkele nieuwe klant
// kwam nog binnen.
//
// Dus: een eigen, losse lees. Mislukt die, dan is het geen
// teamuitnodiging, en loopt alles precies zoals vandaag. Zie de regel
// in CLAUDE.md over een kolom die een migratie nog niet heeft
// toegevoegd.

import { safeErrorMessage } from "@/lib/pure-error";

// Het gedeelde type van een Supabase-client, zonder het hele pakket te
// importeren: alleen wat hier gebruikt wordt.
type Db = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (k: string, v: unknown) => {
        limit: (n: number) => PromiseLike<{
          data: Record<string, unknown>[] | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
    insert: (row: Record<string, unknown>) => PromiseLike<{
      error: { message: string; code?: string } | null;
    }>;
  };
};

export type TeamInvite = { advertiserId: string; role: "manager" | "viewer" };

/**
 * Is dit een teamuitnodiging? Zo ja: voor welke adverteerder en in
 * welke rol. Zo nee -- of de kolommen bestaan nog niet -- null.
 */
export async function readTeamInvite(
  admin: unknown,
  inviteId: string,
): Promise<TeamInvite | null> {
  const db = admin as Db;
  try {
    const { data, error } = await db
      .from("invitations")
      .select("team_advertiser_id, member_role")
      .eq("id", inviteId)
      .limit(1);
    // Een fout is hier bijna altijd "kolom bestaat niet" -- plak 179
    // nog niet gedraaid. Dan is het een gewone uitnodiging.
    if (error) return null;
    const rij = (data ?? [])[0];
    const adv = rij?.team_advertiser_id;
    if (!adv) return null;
    const rol = rij?.member_role === "manager" ? "manager" : "viewer";
    return { advertiserId: String(adv), role: rol };
  } catch {
    return null;
  }
}

/**
 * Zet de collega in het team.
 *
 * Toetst eerst dat de adverteerder van het team in DEZELFDE tenant zit
 * als de uitnodiging. Een uitnodiging wordt gemaakt door onze eigen
 * server action met een tenanttoets, dus dit hoort altijd te kloppen --
 * maar dit is de plek waar iemand toegang krijgt tot andermans geld, en
 * daar hoort de toets twee keer te staan, niet een keer.
 */
export async function joinTeam(
  admin: unknown,
  p: { team: TeamInvite; tenantId: string; userId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = admin as Db;

  const { data: advRows, error: advError } = await db
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", p.team.advertiserId)
    .limit(1);
  if (advError) return { ok: false, error: safeErrorMessage(advError) };
  const adv = (advRows ?? [])[0];
  if (!adv) return { ok: false, error: "The team this invitation is for no longer exists." };
  if (String(adv.tenant_id) !== String(p.tenantId)) {
    return { ok: false, error: "This invitation does not belong to this organisation." };
  }

  const { error } = await db.from("subject_members").insert({
    subject_kind: "advertiser",
    subject_id: p.team.advertiserId,
    tenant_id: p.tenantId,
    user_id: p.userId,
    role: p.team.role,
  });
  // 23505: hij was al lid. Opnieuw accepteren is dan geen fout.
  if (error && error.code !== "23505") {
    return { ok: false, error: safeErrorMessage(error) };
  }
  return { ok: true };
}
