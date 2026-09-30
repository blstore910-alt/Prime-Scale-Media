"use client";

// ── DE VERTAALHOOK ──────────────────────────────────────────────────
//
// Leest de taal uit het profiel dat de app al heeft. Bestaat de kolom
// nog niet (plak 177 niet gedraaid), dan is `profile.locale` undefined
// en wordt het Engels -- de app werkt dan precies zoals vandaag, in
// plaats van te breken. Dat is de regel uit CLAUDE.md over een kolom die
// een migratie nog niet heeft toegevoegd.
//
// Een lokale keuze (net omgezet, nog niet opnieuw ingelezen) wint van
// het profiel, zodat het scherm meteen omschakelt en niet pas na de
// volgende lees.

import { useCallback, useSyncExternalStore } from "react";
import { useAppContext } from "@/context/app-provider";
import { asLocale, t as vertaal, type Key, type Locale } from "@/lib/i18n";

// Een kleine gedeelde bron, zodat elke component die useT gebruikt
// tegelijk omschakelt. Zonder dit bleef een menu Engels terwijl de
// pagina ernaast al Nederlands was, tot de volgende render.
let lokaal: Locale | null = null;
const luisteraars = new Set<() => void>();

export function setLocalLocale(l: Locale) {
  lokaal = l;
  for (const f of luisteraars) f();
}

function abonneer(f: () => void) {
  luisteraars.add(f);
  return () => luisteraars.delete(f);
}

export function useLocale(): Locale {
  const { profile } = useAppContext();
  const override = useSyncExternalStore(
    abonneer,
    () => lokaal,
    () => null,
  );
  return override ?? asLocale((profile as { locale?: unknown } | null)?.locale);
}

export function useT() {
  const locale = useLocale();
  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) => vertaal(locale, key, vars),
    [locale],
  );
  return { t, locale };
}
