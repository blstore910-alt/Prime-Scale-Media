// ── WHAT WE HOLD AT THE SUPPLIERS, RIGHT NOW ────────────────────────
//
// The owner, 29-09: "kunnen we in ons dashboard ook easy on balance
// zien wat we momenteel usd en eur hebben bij rockads en bij seamx."
//
// ADMIN-GATED, and it stays that way. A supplier balance is cost data:
// it names the suppliers, and the SeamX line exposes the tax they hold
// back from us. Neither belongs anywhere a customer or an affiliate can
// reach — not in the UI, not in the JSON behind it. This route is the
// JSON behind it, so the guard is the whole point.
//
// An employee admin DOES see it, deliberately. It is not profit — it is
// whether a top-up they are about to verify can actually be pushed
// today. An admin who cannot see the credit behind the queue is an
// admin verifying blind.
//
// WHY BOTH SUPPLIERS IN ONE ROUTE, AND WHY NEITHER CAN HIDE THE OTHER.
// Two fetches to two third parties, and each can be slow, off or down
// independently. `allSettled`, not `all`: with `all` a RockAds timeout
// takes the SeamX figure down with it, and the screen would say nothing
// is known when half of it is.

import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { NextResponse } from "next/server";
import { fetchRockadsWallets } from "@/lib/integrations/rockads-api";
import { fetchWiseBalances } from "@/lib/integrations/wise-api";
import {
  getSupplier1Adapter,
  readLiveSupplier1Balance,
} from "@/lib/integrations/supplier1";
import { safeErrorMessage } from "@/lib/pure-error";
import {
  grandTotal,
  rockadsHoldings,
  seamxHoldings,
  totalHoldings,
  type SupplierHolding,
} from "@/lib/pure-supplier-holdings";
import { createClient } from "@/lib/supabase/server";

// Live figures. A cached supplier balance is worse than none: it is the
// number somebody funds against, and it would be stale by exactly as
// long as the cache.
export const dynamic = "force-dynamic";

const rockadsOn = () =>
  !!process.env.ROCKADS_API_KEY && !!process.env.ROCKADS_API_SECRET;
const seamxOn = () =>
  !!process.env.SUPPLIER1_BASE_URL && !!process.env.SUPPLIER1_AUTH_TOKEN;

async function rockads(): Promise<SupplierHolding> {
  const base = { supplier: "RockAds" } as const;
  if (!rockadsOn()) {
    return { ...base, status: "off", error: null, readAt: null, lines: [] };
  }
  try {
    const { wallets, error } = await fetchRockadsWallets();
    if (error) return { ...base, status: "error", error, lines: [] };
    const { lines, skipped } = rockadsHoldings(wallets);
    return {
      ...base,
      status: "ok",
      readAt: new Date().toISOString(),
      // Not an error — the read worked. But a wallet we could not place
      // on a currency line is money missing from the figure, and saying
      // so is the difference between a total and a total-ish.
      error: skipped
        ? `${skipped} wallet${skipped === 1 ? "" : "s"} had no currency and are not in these figures.`
        : null,
      lines,
    };
  } catch (err) {
    return { ...base, status: "error", error: safeErrorMessage(err), readAt: new Date().toISOString(), lines: [] };
  }
}

// ── THE MOCK ANSWERS `ok: true` WITH FIVE THOUSAND DOLLARS ─────────
//
// getSupplier1Adapter() hands back the MOCK unless SUPPLIER1_MODE is
// exactly "live", and the default is mock. The mock's getWalletBalance
// returns USD 5,000 / EUR 2,000 with a 3% reserve and no indication
// whatsoever that it is invented. Reported as "ok" this would put fake
// supplier credit on the dashboard of the one person who decides
// whether a top-up can be funded — the exact fault class this app has
// spent the week closing, and the most expensive version of it.
//
// So the mode is read here, and mock figures come back as `demo`. They
// are still shown, because knowing the mock is on is worth more than a
// blank panel, but they are labelled and they are kept out of the
// total.
async function seamx(): Promise<SupplierHolding> {
  const base = { supplier: "SeamX" } as const;
  try {
    // ── HET ECHTE SALDO EERST ──────────────────────────────────
    //
    // SUPPLIER1_MODE is een schrijfbeveiliging: hij houdt tegen dat
    // er geld naar SeamX wordt geduwd. Een saldo lezen valt daar
    // niet onder, en de mock teruggeven op die vraag is een verzonnen
    // antwoord (USD 5.000 / EUR 2.000) op precies het cijfer waar
    // iemand op beslist of de mode aan mag.
    const live = await readLiveSupplier1Balance();
    if (live.ok) {
      return {
        ...base,
        status: "ok",
        error: null,
        readAt: new Date().toISOString(),
        lines: seamxHoldings(live.data),
      };
    }

    // Sleutels staan er niet: dan valt er niets te lezen. De mock
    // wordt WEL getoond, want weten dat de mock aanstaat is meer
    // waard dan een leeg vak -- maar gelabeld en buiten elk totaal.
    if (!seamxOn()) {
      const mock = await getSupplier1Adapter().getWalletBalance();
      if (!mock.ok) {
        return {
          ...base,
          status: "off",
          error: null,
          readAt: null,
          lines: [],
        };
      }
      return {
        ...base,
        status: "demo",
        error:
          "No SeamX credentials are set, so these are the mock adapter's figures — not money.",
        readAt: new Date().toISOString(),
        lines: seamxHoldings(mock.data),
      };
    }

    // Sleutels staan er wel en SeamX antwoordde niet. Dat is een
    // storing en moet als storing lezen, niet als mockcijfers.
    return {
      ...base,
      status: "error",
      error: live.error,
      readAt: new Date().toISOString(),
      lines: [],
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      error: safeErrorMessage(err),
      readAt: new Date().toISOString(),
      lines: [],
    };
  }
}

// ── EN ONZE EIGEN BANK ────────────────────────────────────────────
//
// De eigenaar, 29-09: "ook wise api balance, ons huidige usd en eur
// balance." Wise is geen LEVERANCIER -- het is ons eigen geld -- maar
// het is dezelfde vraag: wat kunnen we vandaag uitgeven. Daarom staat
// het in hetzelfde paneel en heet dat paneel niet langer naar de
// leveranciers alleen.
//
// Het staat apart van de twee erboven omdat het iets anders IS: bij
// RockAds en SeamX hebben we krediet staan dat alleen daar besteed
// kan worden; bij Wise staat geld dat overal heen kan.
async function wise(): Promise<SupplierHolding> {
  const base = { supplier: "Wise", kind: "bank" } as const;
  if (!process.env.WISE_API_TOKEN) {
    return { ...base, status: "off", error: null, readAt: null, lines: [] };
  }
  try {
    const { balances, error } = await fetchWiseBalances();
    if (error) return { ...base, status: "error", error, lines: [] };
    return {
      ...base,
      status: "ok",
      error: null,
      readAt: new Date().toISOString(),
      // LEGE VALUTA ERUIT. Wise geeft elke rekening die bestaat terug,
      // ook de GBP- en HKD-rekening waar niets op staat. Op een paneel
      // dat de vraag "wat kunnen we vandaag uitgeven" beantwoordt zijn
      // dat twee regels die niets zeggen.
      //
      // Maar alleen als er iets ANDERS is: staat alles op nul, dan is
      // nul het antwoord en hoort het er te staan. Anders zou een lege
      // bank lezen als een bank die niet antwoordde.
      lines: (balances.some((b) => Math.abs(b.amount) > 0.004)
        ? balances.filter((b) => Math.abs(b.amount) > 0.004)
        : balances)
        .map((b) => ({
          currency: b.currency,
          total: b.amount,
          available: null,
          heldBack: null,
          parts: [],
        }))
        .sort((a, b) =>
          (a.currency === "EUR" ? 0 : a.currency === "USD" ? 1 : 2) -
          (b.currency === "EUR" ? 0 : b.currency === "USD" ? 1 : 2),
        ),
    };
  } catch (err) {
    return { ...base, status: "error", error: safeErrorMessage(err), readAt: new Date().toISOString(), lines: [] };
  }
}

export async function GET() {
  const { error, profile } = await apiRequireAdmin();
  if (error) return error;

  // ── DE KOERS, VOOR HET SAMENGETELDE BEDRAG ────────────────────
  //
  // `.limit(1)` en niet maybeSingle(): er staan vandaag TWEE actieve
  // USD-rijen op deze tenant (gemeten), en maybeSingle() geeft dan
  // geen eerste rij terug maar een fout -- waarna het omgerekende
  // bedrag stilletjes zou verdwijnen. Nieuwste wint.
  //
  // Geen koers is geen koers: dan blijft het omgerekende getal leeg
  // in plaats van dat er een uit de lucht wordt gegrepen.
  let usdToEur: number | null = null;
  try {
    const supabase = await createClient();
    const { data: rates } = await supabase
      .from("exchange_rates")
      .select("eur, updated_at")
      .eq("tenant_id", profile!.tenant_id)
      .eq("is_active", true)
      .eq("currency", "USD")
      .order("updated_at", { ascending: false })
      .limit(1);
    const r = Number((rates ?? [])[0]?.eur);
    if (Number.isFinite(r) && r > 0) usdToEur = r;
  } catch {
    /* geen koers is geen ramp -- het samengetelde bedrag blijft leeg */
  }

  // Neither of these rejects — both resolve to a status — but allSettled
  // guarantees that even a throw inside the guard clauses cannot turn
  // one slow supplier into a 500 for both.
  const names = ["RockAds", "SeamX", "Wise"];
  const settled = await Promise.allSettled([rockads(), seamx(), wise()]);
  const suppliers: SupplierHolding[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          supplier: names[i],
          status: "error",
          error: safeErrorMessage(s.reason),
          lines: [],
        },
  );

  // Het totaal gaat over het LEVERANCIERSKREDIET. Wise erbij optellen
  // zou twee verschillende soorten geld tot een getal maken: krediet
  // dat alleen bij die leverancier besteed kan worden, en geld op de
  // bank dat overal heen kan. Een som daarvan beantwoordt geen enkele
  // vraag die iemand heeft.
  const total = totalHoldings(suppliers.filter((s) => s.kind !== "bank"));
  return NextResponse.json({
    suppliers,
    grand: grandTotal(suppliers, usdToEur),
    total: total.lines,
    // False means one supplier did not answer, so the sum below is not
    // everything we hold. The panel prints "at least" rather than a
    // figure that reads as complete.
    totalComplete: total.complete,
    readAt: new Date().toISOString(),
  });
}
