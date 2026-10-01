"use client";

// ── DE TAAL WAARIN IEMAND ZICH AANMELDT, BLIJFT ─────────────────────
//
// De eigenaar, 01-10: "hoe wordt bepaald of die aanmelding in Engels of
// Nederlands is?" Voor het inloggen volgt de app de browser. Maar een
// nieuw profiel krijgt in de database 'en' (de standaard van de kolom),
// dus wie zich in het Nederlands aanmeldde, zag na het inloggen alles in
// het Engels.
//
// Twee aanmeldwegen maken op twee plekken een profiel (de
// uitnodigingsroute en de referral-aanmelding via Supabase), en het
// profiel bestaat pas na de aanmelding. Dus een mechanisme voor allebei:
// het formulier onthoudt de taal in deze browser, en bij de eerste keer
// in de app zet useApplySignupLocale die taal in het profiel -- dan is
// er een sessie, en mag set_own_locale het doen. Daarna is het weg.

import { useEffect } from "react";
import { setOwnLocale } from "@/actions/locale-actions";
import { setLocalLocale } from "@/hooks/use-t";
import type { Locale } from "@/lib/i18n";

const SLEUTEL = "psm-signup-locale";

export function rememberSignupLocale(l: Locale) {
  try {
    localStorage.setItem(SLEUTEL, l);
  } catch {
    // privé venster of geblokkeerde opslag: dan blijft het Engels, en
    // kan de klant zelf omzetten -- geen reden om de aanmelding te breken.
  }
}

/** Eenmalig, in de klant-app: zet de aanmeldtaal in het profiel. */
export function useApplySignupLocale(huidig: Locale, metProfiel: boolean) {
  useEffect(() => {
    if (!metProfiel) return;
    let l: string | null = null;
    try {
      l = localStorage.getItem(SLEUTEL);
      localStorage.removeItem(SLEUTEL);
    } catch {
      return;
    }
    if (l !== "nl" && l !== "en") return;
    if (l === huidig) return;
    setLocalLocale(l);
    void setOwnLocale(l);
    // Alleen bij binnenkomst: een latere keuze van de klant wint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metProfiel]);
}
