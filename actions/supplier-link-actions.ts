"use server";

// ── ONS AD-ACCOUNT AAN HET HUNNE KNOPEN ─────────────────────────────
//
// De eigenaar, 30-09: "stel het is een API ad account, dan dus alleen
// wat er live op dat ad acc staat als max refundable." En daarvoor
// moet je eerst WETEN welk account bij hen het onze is.
//
// ── WAT ER GEMETEN IS, EN WAAROM DIT BESTAAT ─────────────────────
//
// RockAds houdt vandaag 98 ad-accounts voor ons vast en geeft per
// account een saldo terug. Wij hebben er 13 in de database. En
// daartussen zit **geen enkele koppeling**:
//
//   supplier_ad_accounts   2 rijen, allebei provider 'supplier1',
//                          allebei mock, allebei aan geen enkel
//                          ad-account gekoppeld
//   ad_accounts.bm_id      13 gevuld, maar met testwaarden
//                          (1234567890, 1122334455667788) -- dat zijn
//                          geen echte Meta-id's en ze zijn bovendien
//                          niet uniek: PSM0016 en PSM0020 delen er een
//
// Er valt dus niets automatisch te matchen, en een "slimme" match op
// naam of bm_id zou het verkeerde account aan een klant hangen -- op
// het scherm waar besloten wordt of er geld terug mag. Dus: een mens
// kiest, één keer per account, en die keuze wordt vastgelegd.
//
// ── GEEN MIGRATIE NODIG ───────────────────────────────────────────
//
// `supplier_ad_accounts` heeft geen check-constraint op `provider`
// (gemeten: alleen pkey, de tenant-fkey en UNIQUE(tenant_id, provider,
// external_id)). 'rockads' mag er dus in zonder plak.
//
// ── DE NAAM VAN DE LEVERANCIER BLIJFT BINNEN ──────────────────────
//
// Allebei de handelingen hieronder zijn admin-gated. Een klant komt
// hier niet, en mag de naam RockAds nergens zien.

import { resolveAdminContext } from "./_shared";
import { safeErrorMessage } from "@/lib/pure-error";

export type SupplierChoice = {
  /** Hun id -- wat wij opslaan als external_id. */
  id: string;
  /** Hun naam voor het account, zoals de admin het in hun portaal ziet. */
  name: string;
  /** Het id van het advertentieplatform zelf (Meta/TikTok/Google). */
  platformAccountId: string;
  balance: number;
  currency: string;
  status: string;
  /** Hangt dit account al aan een van onze ad-accounts, en aan welke? */
  alreadyLinkedTo: string | null;
};

/**
 * Wat er bij de leverancier klaarstaat om aan te koppelen.
 *
 * Geeft ALLES terug, ook wat al gekoppeld is -- met de naam van ons
 * account erbij. Een lijst die het al-gekoppelde weglaat maakt van een
 * dubbele koppeling een onzichtbaar probleem; nu ziet de admin meteen
 * dat hij een account pakt dat al van iemand is.
 */
export async function listSupplierAdAccounts(): Promise<
  | { ok: true; data: { accounts: SupplierChoice[]; total: number } }
  | { ok: false; error: string }
> {
  // resolveAdminContext en NIET de leesvariant, ook al leest deze
  // alleen. Die variant slaat de onderhoudsvries en de read-only-knop
  // over, en tests/lib/readonly-admin.test.ts verbiedt terecht dat een
  // bestand dat OOK schrijft hem gebruikt. Deze lijst bestaat alleen om
  // een koppeling te maken, en dat is een schrijfhandeling -- tijdens
  // een incident hoeft hij dus niet te werken.
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const { supabase, profile } = res0.ctx;

  if (!process.env.ROCKADS_API_KEY || !process.env.ROCKADS_API_SECRET) {
    return {
      ok: false,
      error: "The supplier's API keys are not set on this deployment.",
    };
  }

  try {
    const { fetchRockadsAdAccounts } = await import(
      "@/lib/integrations/rockads-api"
    );
    const got = await fetchRockadsAdAccounts();
    if (got.error) return { ok: false, error: got.error };

    // Wat al vastligt, zodat de lijst het kan tonen. Op DEZE tenant --
    // een koppeling van een andere tenant gaat ons niet aan en de naam
    // van hun klant al helemaal niet.
    // ── TWEE LEESJES, GEEN EMBED ──────────────────────────────────
    //
    // Hier stond `ad_account:ad_accounts(name)`, en dat gaf op
    // productie letterlijk: "Could not find a relationship between
    // 'supplier_ad_accounts' and 'ad_accounts' in the schema cache".
    //
    // Terecht. PostgREST kan alleen joinen langs een FOREIGN KEY, en
    // die staat er niet: `supplier_ad_accounts` draagt alleen zijn
    // pkey, de tenant-fkey en UNIQUE(tenant_id, provider,
    // external_id). `ad_account_id` is een kale uuid-kolom.
    //
    // Dat is met twee leesjes op te lossen en dus niet met een plak.
    // Een foreign key toevoegen zou netter zijn, maar het is een
    // wijziging aan een levende tabel voor een naam in een keuzelijst
    // -- dat is de verhouding niet.
    const { data: links, error: linkError } = await supabase
      .from("supplier_ad_accounts")
      .select("external_id, ad_account_id")
      .eq("tenant_id", profile.tenant_id)
      .eq("provider", "rockads");
    if (linkError) return { ok: false, error: safeErrorMessage(linkError) };

    const ids = (links ?? [])
      .map((l) => l.ad_account_id)
      .filter((x): x is string => !!x);

    const namen = new Map<string, string>();
    if (ids.length) {
      const { data: accts, error: acctError } = await supabase
        .from("ad_accounts")
        .select("id, name")
        .in("id", ids);
      // Geen namen is geen ramp: de lijst werkt zonder, en zegt dan
      // "another ad account" in plaats van een naam. Een mislukte
      // naamlees mag de hele keuzelijst niet wegnemen.
      if (!acctError) {
        for (const a of accts ?? []) namen.set(String(a.id), String(a.name));
      }
    }

    const byExternal = new Map<string, string>();
    for (const l of links ?? []) {
      if (!l.external_id) continue;
      byExternal.set(
        String(l.external_id),
        namen.get(String(l.ad_account_id)) ?? "another ad account",
      );
    }

    return {
      ok: true,
      data: {
        total: got.total,
        accounts: got.accounts.map((a) => ({
          id: a.id,
          name: a.name || a.aliasName || a.id,
          platformAccountId: a.platformAccountId,
          balance: a.balance,
          currency: a.currency,
          status: a.status,
          alreadyLinkedTo: byExternal.get(a.id) ?? null,
        })),
      },
    };
  } catch (err) {
    return { ok: false, error: safeErrorMessage(err) };
  }
}

/**
 * Leg vast dat DIT ad-account van ons dat ene bij de leverancier is.
 *
 * `externalId` leeg maakt de koppeling juist los -- dezelfde handeling,
 * zodat een verkeerde keuze te herstellen is zonder de database in.
 */
export async function linkAdAccountToSupplier(input: {
  adAccountId: string;
  externalId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // De MUTERENDE variant: die draagt maintenanceGuard(), zodat een
  // incident ook deze schrijfactie bevriest.
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const { supabase, profile } = res0.ctx;

  const adAccountId = String(input?.adAccountId ?? "").trim();
  if (!adAccountId) return { ok: false, error: "No ad account given." };
  const externalId = String(input?.externalId ?? "").trim() || null;

  // De rij opnieuw ophalen en de tenant SERVER-SIDE vergelijken. Niet
  // vertrouwen op wat het scherm meestuurde -- dat is de huisregel voor
  // elke mutatie, en hij ontbrak in de buurfuncties van dit bestand.
  const { data: acct, error: acctError } = await supabase
    .from("ad_accounts")
    .select("id, tenant_id, name")
    .eq("id", adAccountId)
    .maybeSingle();
  if (acctError) return { ok: false, error: safeErrorMessage(acctError) };
  if (!acct) return { ok: false, error: "That ad account was not found." };
  if (acct.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // Losmaken.
  if (!externalId) {
    const { error } = await supabase
      .from("supplier_ad_accounts")
      .delete()
      .eq("ad_account_id", adAccountId)
      .eq("provider", "rockads")
      .eq("tenant_id", profile.tenant_id);
    if (error) return { ok: false, error: safeErrorMessage(error) };
    return { ok: true };
  }

  // ── TWEE KANTEN VAN DEZELFDE VERGISSING ────────────────────────
  //
  // Eén account bij hen mag niet aan twee van ons hangen, en andersom
  // ook niet. De UNIQUE(tenant_id, provider, external_id) dekt de
  // eerste; de tweede is een gewone update op ad_account_id. Allebei
  // hier expliciet, met een zin die zegt WAT er al vastligt -- een
  // constraint-fout uit Postgres zegt dat niet.
  // Zonder embed, om dezelfde reden als hierboven: er is geen foreign
  // key van deze tabel naar ad_accounts, dus PostgREST weigert de join.
  const { data: bezet, error: bezetError } = await supabase
    .from("supplier_ad_accounts")
    .select("ad_account_id")
    .eq("tenant_id", profile.tenant_id)
    .eq("provider", "rockads")
    .eq("external_id", externalId)
    // limit(1) en geen maybeSingle: de unieke sleutel van deze tabel
    // staat op (tenant, provider, external_id) EN op niets anders, dus
    // in theorie is dit er een -- maar maybeSingle GOOIT bij twee
    // rijen, en dat zou de koppeling laten klappen op precies het
    // moment dat je hem nodig hebt om de rommel op te ruimen.
    .limit(1);
  if (bezetError) return { ok: false, error: safeErrorMessage(bezetError) };
  const bezetRij = (bezet ?? [])[0] ?? null;
  if (
    bezetRij &&
    bezetRij.ad_account_id &&
    bezetRij.ad_account_id !== adAccountId
  ) {
    // De naam apart ophalen -- zie hierboven waarom er geen embed is.
    const { data: andere } = await supabase
      .from("ad_accounts")
      .select("name")
      .eq("id", bezetRij.ad_account_id)
      .limit(1);
    const naam = (andere ?? [])[0]?.name ?? "another ad account";
    return {
      ok: false,
      error: `That supplier account is already linked to ${naam}. Unlink it there first.`,
    };
  }

  // Eerst een bestaande koppeling van DIT account weg, dan de nieuwe.
  // Twee stappen en geen upsert, omdat de unieke sleutel op
  // (tenant, provider, external_id) staat en niet op ad_account_id --
  // een upsert zou een tweede rij voor hetzelfde ad-account maken.
  const { error: delError } = await supabase
    .from("supplier_ad_accounts")
    .delete()
    .eq("ad_account_id", adAccountId)
    .eq("provider", "rockads")
    .eq("tenant_id", profile.tenant_id);
  if (delError) return { ok: false, error: safeErrorMessage(delError) };

  // Kolom-allowlist: precies deze vier, nooit een gespreide payload.
  const { error: insError } = await supabase
    .from("supplier_ad_accounts")
    .insert({
      tenant_id: profile.tenant_id,
      provider: "rockads",
      external_id: externalId,
      ad_account_id: adAccountId,
    });
  if (insError) return { ok: false, error: safeErrorMessage(insError) };

  return { ok: true };
}
