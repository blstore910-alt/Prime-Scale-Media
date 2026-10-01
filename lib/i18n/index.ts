// ── DE VERTAALFUNCTIE ───────────────────────────────────────────────
//
// Puur: geen React, geen browser. Dus bruikbaar in een component, in
// een server action, in een e-mail en in de factuur-PDF -- de laatste
// twee draaien op de server en moeten de taal van de KLANT kennen, niet
// die van de browser. Daarom woont de keuze in user_profiles.locale.

import { en, type Key } from "./en";
import { nl } from "./nl";

export type Locale = "en" | "nl";
export type { Key };

const WOORDENBOEKEN: Record<Locale, Record<Key, string>> = { en, nl };

/** Alles wat geen 'nl' is, wordt 'en'. Een onbekende of lege waarde --
 *  een kolom die nog niet bestaat, een oude sessie -- valt terug op de
 *  taal waarin de app al werkte, en nooit op een lege string. */
export function asLocale(v: unknown): Locale {
  return v === "nl" ? "nl" : "en";
}

/**
 * De zin in de gevraagde taal, met {variabelen} ingevuld.
 *
 * Een ONTBREKENDE variabele blijft als {naam} staan in plaats van te
 * verdwijnen. Dat is lelijk, en met opzet: een bedrag dat stil van het
 * scherm valt leest als een zin die klopt, en {amount} valt op.
 */
export function t(
  locale: Locale,
  key: Key,
  vars?: Record<string, string | number>,
): string {
  const tekst = WOORDENBOEKEN[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return tekst;
  return tekst.replace(/\{(\w+)\}/g, (heel, naam: string) =>
    Object.prototype.hasOwnProperty.call(vars, naam)
      ? String(vars[naam])
      : heel,
  );
}

// ── TERUGVERTALEN ───────────────────────────────────────────────────
//
// Helpers in lib/ (factuurstatus, factuursoort, aanvraagstatus) geven
// Engelse woorden terug en worden ook door de admin en de tests gelezen.
// In plaats van elk van die helpers een taal te geven, zoekt tx() de
// Engelse tekst op in en.ts en geeft de vertaling van die sleutel. Een
// tekst die er niet in staat, komt ongewijzigd terug -- nooit leeg.
let omgekeerd: Map<string, Key> | null = null;
export function tx(locale: Locale, tekst: string): string {
  if (locale === "en" || !tekst) return tekst;
  if (!omgekeerd) {
    omgekeerd = new Map();
    for (const k of Object.keys(en) as Key[]) if (!omgekeerd.has(en[k])) omgekeerd.set(en[k], k);
  }
  const k = omgekeerd.get(tekst);
  return k ? WOORDENBOEKEN[locale][k] : tekst;
}
