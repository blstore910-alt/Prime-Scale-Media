/**
 * RockAds — a supplier's read-only adapter.
 *
 * THERE ARE NO WRITE FUNCTIONS IN THIS FILE, AND THAT IS THE POINT.
 *
 * RockAds' API can move money: `POST /ad-accounts/:id/deposit` transfers
 * real credit from a supplier wallet onto a live ad account, and there is
 * a withdraw beside it. The owner's instruction about the other supplier
 * applies here word for word — nothing may be pushed live while we are
 * still testing, and it must be impossible for something to happen by
 * accident.
 *
 * A config flag is not that guarantee: a flag can be flipped, and a
 * forgotten environment variable is not a safety measure. So the deposit
 * and withdraw endpoints are simply not implemented. When the day comes
 * to wire them, that is a deliberate act of writing new code with the
 * owner watching, not a switch somebody finds.
 *
 * ── THE FIELD THAT MUST NEVER REACH A CUSTOMER ──────────────────────
 *
 * Every ad account RockAds returns carries `commission: { rate,
 * category_name }`. That is what WE pay THEM: our cost, and therefore our
 * margin once you put it beside what the customer pays.
 *
 * The owner's rule is absolute — a supplier fee is visible to admins and
 * super-admins and to nobody else. And per docs/adr and the note in
 * lib/types/account.ts, cost must never sit on a row a customer can read,
 * because `select("*")` on their own ad account would hand it to them in
 * the JSON behind the page.
 *
 * So `commission` is returned by this file — an admin screen may show it —
 * and NOTHING here writes it anywhere. If a future caller persists a
 * RockAds account, the commission goes in the admin-only costs table
 * (ad_accounts.supplier_fee_pct / ad_account_costs), never onto
 * ad_accounts itself.
 *
 * The supplier's NAME is the same kind of secret: it appears in admin
 * screens and in this file, never in an advertiser or affiliate surface,
 * an email or an invoice.
 *
 * ── Credentials ─────────────────────────────────────────────────────
 * ROCKADS_API_KEY and ROCKADS_API_SECRET, set in Vercel. Two plain
 * headers — no signing, no SCA. They are read from the environment here
 * and never logged, never returned, and never put in an error message.
 */

const BASE = "https://b2b-api.rockads.com/v2";

/** 1000 GET/min and 100 write/min, per their rate-limit page. */
export const ROCKADS_READ_LIMIT_PER_MIN = 1000;

export type RockadsWallet = {
  id: string;
  /** Their code for it — used as the reference on a bank transfer to them. */
  code: string;
  name: string;
  balance: number;
  currency: string;
  autoPayment: boolean;
  autoPaymentThreshold: number;
};

export type RockadsAdAccount = {
  id: string;
  /** The platform's own id (Meta/TikTok/Google), blank until provisioned. */
  platformAccountId: string;
  name: string;
  aliasName: string;
  walletId: string;
  balance: number;
  currency: string;
  /** pending | approved | banned | deleted | rejected */
  status: string;
  /** Whatever they send. Documented as 1/3/4; live it is a UUID. */
  platformId: string;
  /** Readable name, or null when their id is one we cannot name. */
  platform: string | null;
  timezone: string;
  createdAt: string;
  adsManagerUrl?: string;
  /**
   * OUR COST. Admin-only, always. See the note at the top of this file —
   * this must never be written onto a customer-readable row.
   */
  supplierCommission: { rate: number; category: string } | null;
};

/**
 * Their docs say platform_id is 1 (Meta), 3 (TikTok) or 4 (Google). The
 * live API returns a UUID. So the map is kept for the documented case and
 * an unrecognised id yields NOTHING rather than "Platform
 * c4ca4238-a0b9-…" — an internal identifier printed where a platform name
 * belongs is the same fault as the Wise composite key on a deposit card,
 * and it reads as information when it is noise.
 */
const PLATFORMS: Record<string, string> = {
  "1": "Meta",
  "3": "TikTok",
  "4": "Google",
};

/** A readable platform, or null when their id means nothing to us. */
function platformName(id: string): string | null {
  return PLATFORMS[id] ?? null;
}

function credentials(): { key: string; secret: string } | null {
  const key = process.env.ROCKADS_API_KEY;
  const secret = process.env.ROCKADS_API_SECRET;
  return key && secret ? { key, secret } : null;
}

/**
 * One GET. Returns the status alongside the body so a caller can tell
 * "they said no" from "we could not reach them" — the distinction every
 * integration panel in this app is built around.
 */
async function get(
  path: string,
): Promise<{ status: number; body: unknown; error: string | null }> {
  const creds = credentials();
  if (!creds) {
    return {
      status: 0,
      body: null,
      error:
        "No RockAds credentials are set (ROCKADS_API_KEY / ROCKADS_API_SECRET).",
    };
  }
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "GET",
      headers: {
        "X-Api-Key": creds.key,
        "X-Api-Secret": creds.secret,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      // Their own words, trimmed. Never the headers, which hold the key.
      const said =
        (body as { error?: string; message?: string } | null)?.error ??
        (body as { message?: string } | null)?.message ??
        text.slice(0, 200);
      return { status: res.status, body, error: said || `HTTP ${res.status}` };
    }
    return { status: res.status, body, error: null };
  } catch (err) {
    return {
      status: 0,
      body: null,
      error: err instanceof Error ? err.message : "Could not reach RockAds.",
    };
  }
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function fetchRockadsWallets(): Promise<{
  wallets: RockadsWallet[];
  error: string | null;
}> {
  const { body, error } = await get("/wallets");
  if (error) return { wallets: [], error };
  const rows = (body as { data?: unknown[] } | null)?.data ?? [];
  return {
    wallets: rows.map((r) => {
      const w = r as Record<string, unknown>;
      return {
        id: String(w.id ?? ""),
        code: String(w.code ?? ""),
        name: String(w.name ?? ""),
        balance: num(w.balance),
        currency: String(w.currency_code ?? "").toUpperCase(),
        autoPayment: !!w.auto_payment,
        autoPaymentThreshold: num(w.auto_payment_threshold),
      };
    }),
    error: null,
  };
}

function toAdAccount(a: Record<string, unknown>): RockadsAdAccount {
  const commission = a.commission as
    | { rate?: unknown; category_name?: unknown }
    | undefined;
  const platformId = String(a.platform_id ?? "");
  return {
    id: String(a.id ?? ""),
    platformAccountId: String(a.account_id ?? ""),
    name: String(a.account_name ?? ""),
    aliasName: String(a.alias_name ?? ""),
    walletId: String(a.wallet_id ?? ""),
    balance: num(a.balance),
    currency: String(a.currency_code ?? "").toUpperCase(),
    status: String(a.status ?? ""),
    platformId,
    platform: platformName(platformId),
    timezone: String(a.timezone ?? ""),
    createdAt: String(a.created_at ?? ""),
    adsManagerUrl:
      typeof a.ads_manager_url === "string" ? a.ads_manager_url : undefined,
    supplierCommission: commission
      ? {
          rate: num(commission.rate),
          category: String(commission.category_name ?? ""),
        }
      : null,
  };
}

export async function fetchRockadsAdAccounts(): Promise<{
  accounts: RockadsAdAccount[];
  total: number;
  error: string | null;
}> {
  const { body, error } = await get("/ad-accounts");
  if (error) return { accounts: [], total: 0, error };
  const payload = body as { data?: unknown[]; total?: unknown } | null;
  const rows = payload?.data ?? [];
  return {
    accounts: rows.map((r) => toAdAccount(r as Record<string, unknown>)),
    total: num(payload?.total) || rows.length,
    error: null,
  };
}

export async function fetchRockadsAdAccount(
  id: string,
): Promise<{ account: RockadsAdAccount | null; error: string | null }> {
  if (!id) return { account: null, error: "No account id." };
  const { body, error } = await get(
    `/ad-accounts/${encodeURIComponent(id)}`,
  );
  if (error) return { account: null, error };
  const row = (body as { data?: unknown } | null)?.data;
  return {
    account: row ? toAdAccount(row as Record<string, unknown>) : null,
    error: null,
  };
}

/**
 * What can we actually see?
 *
 * The same shape as the Wise probe, and for the same reason: "nothing came
 * back" covers an unset key, a rejected key, a key for a different account
 * and an empty account, and those need opposite responses. Guessing
 * between them costs a day — it already did once.
 *
 * Returns no credential, no header and no raw body beyond a short excerpt
 * of what RockAds itself said.
 */
export type RockadsProbe = {
  credentialsSet: boolean;
  /**
   * WHICH of the two is missing, never their values. "Not connected"
   * covers a missing key, a missing secret, a typo in either name and a
   * variable set on the wrong Vercel environment — and those are four
   * different fixes. Saying only "not connected" is how an afternoon
   * goes.
   */
  keySet: boolean;
  secretSet: boolean;
  walletsStatus: number | null;
  walletCount: number;
  accountsStatus: number | null;
  accountCount: number;
  /** Currencies they hold credit in, so a mismatch with ours is visible. */
  currencies: string[];
  /** Per platform, how many accounts — a quick shape check. */
  byPlatform: Record<string, number>;
  said: string | null;
};

export async function probeRockads(): Promise<RockadsProbe> {
  const keySet = !!process.env.ROCKADS_API_KEY;
  const secretSet = !!process.env.ROCKADS_API_SECRET;
  const creds = credentials();
  if (!creds) {
    return {
      credentialsSet: false,
      keySet,
      secretSet,
      walletsStatus: null,
      walletCount: 0,
      accountsStatus: null,
      accountCount: 0,
      currencies: [],
      byPlatform: {},
      said:
        keySet && !secretSet
          ? "ROCKADS_API_KEY is set but ROCKADS_API_SECRET is not."
          : secretSet && !keySet
            ? "ROCKADS_API_SECRET is set but ROCKADS_API_KEY is not."
            : "Neither ROCKADS_API_KEY nor ROCKADS_API_SECRET reached this deployment.",
    };
  }

  const w = await get("/wallets");
  const a = await get("/ad-accounts");

  const wallets = ((w.body as { data?: unknown[] } | null)?.data ?? []) as
    Record<string, unknown>[];
  const accounts = ((a.body as { data?: unknown[] } | null)?.data ?? []) as
    Record<string, unknown>[];

  const byPlatform: Record<string, number> = {};
  for (const acc of accounts) {
    const key = platformName(String(acc.platform_id ?? "")) ?? "Unnamed platform";
    byPlatform[key] = (byPlatform[key] ?? 0) + 1;
  }

  return {
    credentialsSet: true,
    keySet,
    secretSet,
    walletsStatus: w.status || null,
    walletCount: wallets.length,
    accountsStatus: a.status || null,
    accountCount: accounts.length,
    currencies: Array.from(
      new Set(
        wallets
          .map((x) => String(x.currency_code ?? "").toUpperCase())
          .filter(Boolean),
      ),
    ),
    byPlatform,
    said: w.error ?? a.error ?? null,
  };
}

// ── DE DRIE ROUTES DIE WE NOOIT HEBBEN AANGEROEPEN ──────────────────
//
// De eigenaar, 30-09: "kun jij ook in api zien hoeveel we transferen
// naar rockads hoeveel we topuppen en hoeveel dst en of dat samen
// allemaal klopt bij rockads dat we daar niks verliezen en 2% etc."
//
// Tot nu toe las dit bestand exact twee dingen: het SALDO per wallet en
// de LIJST ad-accounts. Een saldo is een foto, en met een foto kun je
// niet nakijken of er onderweg iets is blijven hangen. Daarvoor heb je
// de mutaties nodig.
//
// GEMETEN, NIET GEGOKT. Hun documentatie staat niet publiek, dus de
// routes zijn aan de API zelf gevraagd, zonder sleutel — 401 betekent
// "bestaat, log in", 404 "bestaat niet". Een onzin-subpad geeft
// netjes 404, dus het onderscheid zegt echt iets:
//
//     /wallets/{id}/transactions        401  bestaat
//     /ad-accounts/{id}/transactions    401  bestaat
//     /ad-accounts/{id}/insights        401  bestaat
//     /ad-accounts/{id}/zzzz            404  bestaat niet
//     /transactions  /statements  /deposits  /payments  404
//
// WAT ER NIET BIJ KOMT. `/ad-accounts/{id}/deposit` en `/withdraw`
// geven 404 op GET omdat ze POST-only zijn — ze bestaan dus wél. Ze
// blijven ongeschreven, om precies de reden die bovenaan dit bestand
// staat. Alles hieronder is een GET.
//
// WAT DIT NOG STEEDS NIET KAN. RockAds weet wat er BIJ HEN binnenkomt,
// niet wat wij vanaf onze bank hebben verstuurd. Die ene kant van de
// som staat in `bank_ledger_entries` en die tabel is leeg. Zie
// docs/RECONCILIATIE_ROCKADS.md.

/** Een mutatie zoals RockAds hem teruggeeft. Losjes getypt met opzet:
 *  de veldnamen zijn nog niet nagekeken op een echt antwoord, en een
 *  strak type dat op de verkeerde naam zit geeft stilletjes 0. */
export type RockadsTxn = {
  id: string;
  /** Hun eigen woord ervoor — deposit, transfer, commission, refund… */
  type: string;
  amount: number;
  currency: string;
  /** Negatief = eraf, positief = erbij, zoals wij het lezen. */
  direction: "in" | "out" | "unknown";
  createdAt: string;
  note: string;
  /** Het hele veld, zodat een naam die wij missen niet verdwijnt. */
  raw: Record<string, unknown>;
};

/** Hun bedragen komen als string of number; en een min-teken kan in
 *  het BEDRAG zitten of in een apart type-veld. Allebei gelezen. */
function toTxn(r: Record<string, unknown>): RockadsTxn {
  const amount = num(r.amount ?? r.value ?? r.sum);
  const type = String(r.type ?? r.transaction_type ?? r.kind ?? "");
  const dirField = String(r.direction ?? r.flow ?? "").toLowerCase();
  const direction: RockadsTxn["direction"] =
    dirField === "in" || dirField === "credit" || dirField === "incoming"
      ? "in"
      : dirField === "out" || dirField === "debit" || dirField === "outgoing"
        ? "out"
        : amount > 0
          ? "in"
          : amount < 0
            ? "out"
            : "unknown";
  return {
    id: String(r.id ?? ""),
    type,
    amount,
    currency: String(r.currency_code ?? r.currency ?? "").toUpperCase(),
    direction,
    createdAt: String(r.created_at ?? r.date ?? r.createdAt ?? ""),
    note: String(r.note ?? r.description ?? r.comment ?? ""),
    raw: r,
  };
}

function rowsOf(body: unknown): Record<string, unknown>[] {
  const b = body as { data?: unknown; items?: unknown } | null;
  const d = b?.data ?? b?.items ?? null;
  if (Array.isArray(d)) return d as Record<string, unknown>[];
  // Sommige API's stoppen de lijst nog een laag dieper.
  const nested = (d as { data?: unknown } | null)?.data;
  return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : [];
}

/** Alles wat er op ÉÉN wallet van hen is gebeurd: onze stortingen erin
 *  en elke doorzetting naar een ad-account eruit. */
export async function fetchRockadsWalletTxns(
  walletId: string,
): Promise<{ txns: RockadsTxn[]; error: string | null }> {
  if (!walletId) return { txns: [], error: "No wallet id." };
  const { body, error } = await get(
    `/wallets/${encodeURIComponent(walletId)}/transactions`,
  );
  if (error) return { txns: [], error };
  return { txns: rowsOf(body).map(toTxn), error: null };
}

/** Wat er op één ad-account is bij- en afgeschreven. Hier hoort onze
 *  netto-topup terug te komen, en hier zit ook hun commissie. */
export async function fetchRockadsAdAccountTxns(
  accountId: string,
): Promise<{ txns: RockadsTxn[]; error: string | null }> {
  if (!accountId) return { txns: [], error: "No account id." };
  const { body, error } = await get(
    `/ad-accounts/${encodeURIComponent(accountId)}/transactions`,
  );
  if (error) return { txns: [], error };
  return { txns: rowsOf(body).map(toTxn), error: null };
}

/** De BESTEDING op een ad-account. Dat is de grondslag waar de DST over
 *  gaat — vandaag met de hand per klant per week ingevoerd in
 *  `dst_charges.base_amount`. */
export async function fetchRockadsInsights(
  accountId: string,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  if (!accountId) return { rows: [], error: "No account id." };
  const { body, error } = await get(
    `/ad-accounts/${encodeURIComponent(accountId)}/insights`,
  );
  if (error) return { rows: [], error };
  return { rows: rowsOf(body), error: null };
}
