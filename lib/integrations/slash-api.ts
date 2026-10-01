// ── SLASH — DE BANK ACHTER ZANEL ────────────────────────────────────
//
// De eigenaar, 29-09: "slash bank er ook bij doen." Sleutel staat sinds
// 30-09 in Vercel.
//
// ALLEEN LEZEN. Er zit geen enkele schrijffunctie in dit bestand en
// dat is opzet: de sleutel is read-only aangemaakt, en geld overmaken
// via Slash gebeurt pas als de eigenaar dat apart zegt -- dezelfde
// regel als bij de RockAds-storting.
//
// ── DE JUISTE PADEN (01-10, van Slash zelf) ───────────────────────
//
// Slash support, 01-10: "GET /account -- list accounts", "GET
// /account/{accountId}", en de saldo-endpoint. Gecontroleerd in hun
// API-referentie: ENKELVOUD, en het saldo heet /balance:
//
//   GET /account                      -> { items: [{ id, type, status, balances: [...] }] }
//   GET /account/{accountId}/balance  -> { balances: [{ type, available: { amountCents }, posted }] }
//
// Dit bestand riep /accounts en /accounts/{id}/balances aan -- twee keer
// meervoud -- en eiste een valuta op de rekening. Die heeft Slash niet:
// geen enkel veld. Dus werd elke rekening weggefilterd en zei het paneel
// "Slash returned no accounts". De oude paden blijven als terugval.
//
// ── WELK SALDO IS VAN ONS ─────────────────────────────────────────
//
// Een debit-rekening geeft "debit". Een charge card geeft er twee,
// "cash" en "credit". De eerste versie telde "credit" niet mee, omdat dat
// bij een gewone charge card de kredietruimte is. Gemeten op productie
// 01-10 (/api/slash-probe): bij ZANEL staat "cash" op 0 en "credit" op
// precies $2,669.95 -- het bedrag dat Slash zelf als Cash Balance toont.
// Dus per rekening het HOOGSTE beschikbare saldo van zijn typen: dat is
// wat Slash laat zien, en twee typen van een rekening tellen nooit op.
//
// ── DE VALUTA ─────────────────────────────────────────────────────
//
// Slash is een Amerikaanse bank en zet geen valuta op een rekening.
// Staat er toch een, dan wint die; anders USD (SLASH_CURRENCY
// overschrijft dat als het ooit anders blijkt).
//
// ── TWEE VERZOEKEN, EN WAAROM DAT MOET ────────────────────────────
//
// De saldo-endpoint geeft GEEN valuta terug:
//
//   GET /accounts/{id}/balances
//   -> { balances: [ { available: { amountCents }, posted: {...} } ] }
//
// Er staat een bedrag in centen en verder niets. De valuta staat op de
// REKENING (`GET /accounts` -> items[].currency). Dus eerst de
// rekeningen, dan per rekening het saldo, en de valuta erbij zoeken.
//
// Dat is één verzoek meer, en het alternatief is een dollarbedrag als
// euro's in de matrix zetten -- precies de fout die dat paneel moet
// voorkomen.

const BASE = process.env.SLASH_API_URL ?? "https://api.slash.com";

export type SlashBalance = { currency: string; amount: number };

function creds(): string | null {
  const key = process.env.SLASH_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

/**
 * `X-API-Key` is de header die Slash documenteert. `x-legal-entity`
 * gaat alleen mee als hij gezet is: die is verplicht bij een
 * user-scoped sleutel en verboden bij een legal-entity-scoped. Wij
 * adviseerden de tweede, dus normaal blijft hij leeg.
 */
async function get(
  path: string,
  key: string,
): Promise<{ body: unknown; error: string | null }> {
  try {
    const headers: Record<string, string> = {
      "X-API-Key": key,
      Accept: "application/json",
    };
    const entity = process.env.SLASH_LEGAL_ENTITY;
    if (entity && entity.trim()) headers["x-legal-entity"] = entity.trim();

    const res = await fetch(`${BASE}${path}`, {
      headers,
      cache: "no-store",
      // Zonder dit blijft een hangende verbinding staan tot de
      // serverless functie wordt afgeknepen, en dan valt het hele
      // paneel stil op een bank die toevallig traag is.
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* geen JSON -- val terug op de status */
    }
    if (!res.ok) {
      const msg =
        (json as { error?: string; message?: string } | null)?.error ??
        (json as { message?: string } | null)?.message ??
        `${res.status} ${res.statusText}`;
      // Nooit de sleutel in een foutmelding, ook niet indirect.
      return { body: null, error: `Slash: ${String(msg).slice(0, 160)}` };
    }
    return { body: json, error: null };
  } catch (err) {
    return {
      body: null,
      error: err instanceof Error ? `Slash: ${err.message}` : "Slash did not answer.",
    };
  }
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** De rekeningen, met hun valuta. Eerst het pad uit de docs (/account),
 *  dan de oude gokken als terugval. */
async function accounts(
  key: string,
): Promise<{ rows: { id: string; currency: string }[]; error: string | null }> {
  let lastError: string | null = null;
  for (const path of ["/account", "/accounts", "/v2/accounts"]) {
    const { body, error } = await get(path, key);
    if (error) {
      lastError = error;
      continue;
    }
    const items =
      (body as { items?: unknown[] } | null)?.items ??
      (Array.isArray(body) ? body : null);
    if (!Array.isArray(items)) continue;
    const rows = items
      .map((r) => {
        const a = r as { id?: unknown; currency?: unknown; status?: unknown };
        return {
          id: String(a.id ?? ""),
          currency: String(a.currency ?? process.env.SLASH_CURRENCY ?? "USD").toUpperCase(),
          status: String(a.status ?? ""),
        };
      })
      .filter((a) => a.id && a.currency)
      // Een gesloten rekening telt niet mee in "wat kunnen we vandaag
      // uitgeven". Onbekende status laten we staan: liever te veel
      // tonen dan stilletjes geld weglaten.
      .filter((a) => !/closed|terminated/i.test(a.status))
      .map(({ id, currency }) => ({ id, currency }));
    if (rows.length) return { rows, error: null };
  }
  return { rows: [], error: lastError ?? "Slash returned no accounts." };
}

/**
 * Wat er bij Slash staat, per valuta.
 *
 * `available` is wat besteedbaar is; `posted` is wat geboekt is. Het
 * paneel vraagt "wat kunnen we vandaag uitgeven", dus available wint,
 * met posted als terugval wanneer available ontbreekt.
 */
export async function fetchSlashBalances(): Promise<{
  balances: SlashBalance[];
  error: string | null;
}> {
  const key = creds();
  if (!key) return { balances: [], error: "No Slash key is set." };

  const { rows, error } = await accounts(key);
  if (error) return { balances: [], error };

  const byCur = new Map<string, number>();
  const failed: string[] = [];
  let gelezen = 0;
  for (const acc of rows) {
    const id = encodeURIComponent(acc.id);
    let { body, error: bErr } = await get(`/account/${id}/balance`, key);
    if (bErr) ({ body, error: bErr } = await get(`/accounts/${id}/balances`, key));
    if (bErr) {
      failed.push(acc.currency);
      continue;
    }
    const list = (body as { balances?: unknown[] } | null)?.balances;
    if (!Array.isArray(list)) continue;
    let hoogste: number | null = null;
    for (const b of list) {
      const x = b as {
        type?: unknown;
        available?: { amountCents?: unknown };
        posted?: { amountCents?: unknown };
      };
      const cents = num(x.available?.amountCents) ?? num(x.posted?.amountCents);
      if (cents === null) continue;
      if (hoogste === null || cents > hoogste) hoogste = cents;
    }
    if (hoogste !== null) {
      gelezen++;
      byCur.set(acc.currency, (byCur.get(acc.currency) ?? 0) + hoogste / 100);
    }
  }

  // Een rekening die niet antwoordde is GEEN nul. Kon er geen enkele
  // gelezen worden, dan is dat een storing en geen leeg saldo.
  void gelezen;
  if (!byCur.size) {
    return {
      balances: [],
      error: failed.length
        ? `Slash did not return a balance for ${failed.join(", ")}.`
        : "Slash returned no balances.",
    };
  }
  return {
    balances: [...byCur.entries()]
      .map(([currency, amount]) => ({
        currency,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    // Deels gelukt is niet stil gelukt: het paneel hoort te zeggen dat
    // er een rekening ontbreekt in dit cijfer.
    error: failed.length
      ? `One or more Slash accounts did not answer (${failed.join(", ")}), so this is not everything.`
      : null,
  };
}

/**
 * Wat Slash per rekening teruggeeft, voor /api/slash-probe. De eigenaar,
 * 01-10: het paneel zei $0.00 terwijl Business Checking $2,669.95 heeft.
 * Dit laat zien welke rekeningen er zijn en welke saldotypes, zonder
 * sleutel en zonder volledig id (alleen de laatste vier tekens).
 */
export async function probeSlash(): Promise<unknown> {
  const key = creds();
  if (!key) return { error: "No Slash key is set." };
  const out: Record<string, unknown> = {};
  for (const path of ["/account", "/accounts"]) {
    const { body, error } = await get(path, key);
    if (error) {
      out[path] = { error };
      continue;
    }
    const items = ((body as { items?: unknown[] } | null)?.items ?? (Array.isArray(body) ? body : [])) as Record<string, unknown>[];
    const rekeningen = [];
    for (const a of items.slice(0, 10)) {
      const id = String(a.id ?? "");
      const ruw = Object.fromEntries(
        Object.entries(a).filter(([k]) => !/number|routing|id$/i.test(k)),
      );
      const saldo: Record<string, unknown> = {};
      for (const bp of [`/account/${encodeURIComponent(id)}/balance`, `/accounts/${encodeURIComponent(id)}/balances`]) {
        const { body: b, error: be } = await get(bp, key);
        saldo[bp.replace(id, "{id}")] = be ? { error: be } : b;
      }
      rekeningen.push({ idEind: id.slice(-4), velden: ruw, saldo });
    }
    out[path] = { aantal: items.length, rekeningen };
    break;
  }
  return out;
}
