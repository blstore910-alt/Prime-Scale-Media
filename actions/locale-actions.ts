"use server";

// ── DE TAAL KIEZEN ──────────────────────────────────────────────────
//
// Zelfbediening: de klant zet zijn eigen taal. Gaat via de functie uit
// plak 177, die precies een ding mag -- `locale` op de eigen rij, alleen
// 'en' of 'nl'. Zie de uitleg daar over waarom geen gewone UPDATE.
//
// Geen maintenanceGuard, net als de notificatievoorkeuren: een taalkeuze
// raakt geen geld, en tijdens een storing je taal wisselen is
// onschadelijk.

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { asLocale, type Locale } from "@/lib/i18n";

export async function setOwnLocale(
  value: string,
): Promise<{ ok: true; data: { locale: Locale } } | { ok: false; error: string }> {
  // Alleen deze twee. asLocale maakt van alles wat geen 'nl' is een
  // 'en' -- hier juist niet gewenst: een onbekende waarde is een fout,
  // geen stille keuze voor Engels.
  if (value !== "en" && value !== "nl") {
    return { ok: false, error: "Unknown language." };
  }

  const supabase = await createClient();
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData.user) return { ok: false, error: "Unauthorized" };

  const { data, error } = await supabase.rpc("set_own_locale", {
    p_locale: value,
  });
  if (error) {
    // 42883: de functie bestaat nog niet -- plak 177 is niet gedraaid.
    // Zeg dat, in plaats van PostgREST's zin over een signatuur.
    if ((error as { code?: string }).code === "42883") {
      return { ok: false, error: "Languages are not switched on yet." };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }
  // Nul rijen is geen succes. Een taal die "opgeslagen" zegt en niets
  // schreef, springt bij de volgende keer inloggen terug.
  if (!Number(data)) {
    return { ok: false, error: "Your language was not saved. Try again." };
  }
  return { ok: true, data: { locale: asLocale(value) } };
}
