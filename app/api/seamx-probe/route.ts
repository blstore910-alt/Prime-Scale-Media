// ── WAAROM ZEGT SEAMX "NOT CONNECTED"? ──────────────────────────────
//
// De eigenaar, 30-09: "connect seamx ook een keer vooral het readen,
// wat moeten we doen, ik wil balance zien, api is er."
//
// Het paneel "What we hold" zegt vandaag `not connected` bij SeamX, en
// dat ene woord dekt vier verschillende oorzaken met vier verschillende
// oplossingen:
//
//     SUPPLIER1_BASE_URL ontbreekt
//     SUPPLIER1_AUTH_TOKEN ontbreekt
//     allebei gezet, maar op de verkeerde Vercel-omgeving
//     allebei goed, maar SeamX wijst de sleutel af
//
// Precies dezelfde redenering staat bij de RockAds-probe in
// lib/integrations/rockads-api.ts: "Saying only 'not connected' is how
// an afternoon goes." Deze route zegt welke van de vier het is.
//
// ── WAT HIJ NIET TERUGGEEFT ───────────────────────────────────────
//
// Geen sleutel, geen token, geen begin van een token, en geen header.
// Alleen of de variabele GEZET is (ja/nee), de host van de basis-URL
// (niet het pad, niet de query), en wat SeamX zelf antwoordde.
//
// ── EEN SALDO LEZEN VRAAGT GEEN LIVE MODE ─────────────────────────
//
// `SUPPLIER1_MODE=live` hoeft NIET aan. Die vlag is een
// SCHRIJFbeveiliging -- hij bepaalt of er geld naar SeamX geduwd mag
// worden -- en lezen valt daar niet onder. `readLiveSupplier1Balance()`
// kijkt alleen naar de twee variabelen hieronder. Met andere woorden:
// het saldo kan zichtbaar worden zonder dat de schrijfweg opengaat, en
// dat is precies de volgorde die je wilt.

import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { NextResponse } from "next/server";
import { readLiveSupplier1Balance } from "@/lib/integrations/supplier1";
import { safeErrorMessage } from "@/lib/pure-error";

export const dynamic = "force-dynamic";

/** Alleen de host, zodat een typefout in het domein zichtbaar is
 *  zonder dat er een pad of een query meelekt. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "GEEN GELDIGE URL";
  }
}

export async function GET() {
  const { error } = await apiRequireAdmin();
  if (error) return error;

  const urlSet = !!process.env.SUPPLIER1_BASE_URL;
  const tokenSet = !!process.env.SUPPLIER1_AUTH_TOKEN;
  const mode = (process.env.SUPPLIER1_MODE ?? "mock").trim().toLowerCase();

  const watNu = !urlSet && !tokenSet
    ? "Geen van beide variabelen bereikt deze deployment."
    : !urlSet
      ? "SUPPLIER1_AUTH_TOKEN staat er wel, SUPPLIER1_BASE_URL niet."
      : !tokenSet
        ? "SUPPLIER1_BASE_URL staat er wel, SUPPLIER1_AUTH_TOKEN niet."
        : "Allebei gezet -- dan ligt het aan wat SeamX antwoordt.";

  if (!urlSet || !tokenSet) {
    return NextResponse.json({
      ok: false,
      urlSet,
      tokenSet,
      host: hostOf(process.env.SUPPLIER1_BASE_URL),
      mode,
      watNu,
      // Zeg er meteen bij dat de derde vlag hier niet in de weg zit.
      leesModeNodig: false,
    });
  }

  try {
    const res = await readLiveSupplier1Balance();
    return NextResponse.json({
      ok: res.ok,
      urlSet,
      tokenSet,
      host: hostOf(process.env.SUPPLIER1_BASE_URL),
      mode,
      watNu: res.ok
        ? "SeamX antwoordt. Het saldo hoort nu in 'What we hold' te staan."
        : "SeamX is bereikt maar gaf geen saldo terug -- hun woorden staan hieronder.",
      leesModeNodig: false,
      // Hun eigen foutmelding, zonder onze header of sleutel.
      seamxZei: res.ok ? null : res.error,
      saldo: res.ok ? res.data : null,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      urlSet,
      tokenSet,
      host: hostOf(process.env.SUPPLIER1_BASE_URL),
      mode,
      watNu: "De aanroep zelf liep stuk voor SeamX kon antwoorden.",
      leesModeNodig: false,
      seamxZei: safeErrorMessage(err),
    });
  }
}
