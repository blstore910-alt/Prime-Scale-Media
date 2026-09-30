// ── WELK PROFIEL KRIJGT DE ADVERTEERDER VAN ZIJN TEAM ───────────────
//
// De beslisregel uit lib/auth/session.ts, los en puur, zodat hij te
// testen is. Die lader ligt op het pad van ELKE login; de eigenschap
// waar alles om draait -- een gewone klant komt er onveranderd
// doorheen -- hoort in een test vast te staan, niet alleen in
// commentaar. Zie tests/lib/team-advertiser.test.ts.

export type ProfileLike = {
  role?: string | null;
  tenant_id?: string | null;
  advertiser?: unknown[] | null;
};

export type Membership = {
  subject_id: string;
  tenant_id: string;
  role: string;
};

export type AdvertiserLike = { id: string };

/** Een adverteerderprofiel zonder eigen adverteerder -- en alleen dat. */
export function lacksOwnAdvertiser(p: ProfileLike): boolean {
  return (
    String(p.role ?? "").toLowerCase() === "advertiser" &&
    (!Array.isArray(p.advertiser) || p.advertiser.length === 0)
  );
}

/**
 * Hangt de adverteerder van het team aan elk profiel dat er zelf geen
 * heeft. Een profiel dat er WEL een heeft, gaat als HETZELFDE object
 * terug -- geen kopie -- en dat toetst de test met een referentie-
 * vergelijking.
 */
export function attachTeamAdvertiser<P extends ProfileLike>(
  profiles: P[],
  leden: Membership[],
  advs: AdvertiserLike[],
): P[] {
  return profiles.map((p) => {
    if (!lacksOwnAdvertiser(p)) return p;
    const lid = leden.find((l) => String(l.tenant_id) === String(p.tenant_id));
    const adv = lid && advs.find((a) => String(a.id) === String(lid.subject_id));
    if (!lid || !adv) return p;
    return { ...p, advertiser: [adv], team_role: String(lid.role) };
  });
}
