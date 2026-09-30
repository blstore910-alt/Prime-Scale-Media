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
