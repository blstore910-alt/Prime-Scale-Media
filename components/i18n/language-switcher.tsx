"use client";

// ── DE TAALSCHAKELAAR ───────────────────────────────────────────────
//
// De eigenaar, 30-09: "veel NSA-klanten zijn Nederlands." Zie
// docs/NL_EN.md.
//
// Twee knoppen, elke taal in haar EIGEN naam: "English" en
// "Nederlands", in welke taal de app ook staat. Wie de app per ongeluk
// omzet naar een taal die hij niet leest, moet de weg terug nog kunnen
// herkennen -- "Engels" in het Nederlands helpt een Engelse lezer niet.
//
// Het scherm schakelt METEEN om (setLocalLocale), en de keuze wordt
// daarna bewaard. Mislukt dat, dan springt hij terug en zegt hij het;
// een taal die omschakelt en bij de volgende keer inloggen weer terug
// staat, is een schakelaar die liegt.

import { useState } from "react";
import { toast } from "sonner";
import { setOwnLocale } from "@/actions/locale-actions";
import { setLocalLocale, useT } from "@/hooks/use-t";
import { t as vertaal, type Locale } from "@/lib/i18n";

const CSS = `
.lsw{display:inline-flex;padding:3px;gap:2px;border-radius:12px;
  background:var(--panel-2);border:1px solid var(--line)}
.lsw button{font:inherit;font-size:.84rem;font-weight:700;padding:7px 14px;
  border:0;border-radius:9px;background:none;color:var(--txt-2);cursor:pointer;
  transition:background .15s,color .15s,box-shadow .15s}
.lsw button[aria-pressed="true"]{background:var(--panel);color:var(--ink);
  box-shadow:0 1px 3px rgba(20,30,80,.14)}
.lsw button:disabled{cursor:default}
.lsw-hint{display:block;margin-top:6px;font-size:.76rem;color:var(--faint)}
/* Compact, voor het avatarmenu: EN | NL, geen uitlegregel. Klein genoeg
   om tussen Profile en Sign out te staan zonder er een knop van te maken
   die net zo zwaar weegt als uitloggen. */
.lsw.compact{padding:2px;border-radius:9px}
.lsw.compact button{font-size:.72rem;padding:4px 9px;border-radius:7px;letter-spacing:.04em}
`;

const TALEN: { value: Locale; key: "lang.en" | "lang.nl" }[] = [
  { value: "en", key: "lang.en" },
  { value: "nl", key: "lang.nl" },
];

export default function LanguageSwitcher({
  compact = false,
}: {
  /** EN | NL zonder uitleg -- voor het avatarmenu. */
  compact?: boolean;
} = {}) {
  const { t, locale } = useT();
  const [bezig, setBezig] = useState(false);

  const kies = async (l: Locale) => {
    if (l === locale || bezig) return;
    const vorige = locale;
    setLocalLocale(l); // meteen omschakelen
    setBezig(true);
    try {
      const res = await setOwnLocale(l);
      if (!res.ok) {
        setLocalLocale(vorige); // terug, en zeggen waarom
        toast.error(res.error);
        return;
      }
      // In de NIEUWE taal: `t` hierboven komt uit de render van voor de
      // wissel, en "Language saved" onder een net Nederlands scherm
      // leest als een schakelaar die het niet deed.
      toast.success(vertaal(l, "language.saved"));
    } finally {
      setBezig(false);
    }
  };

  return (
    <div>
      <style>{CSS}</style>
      <div
        className={compact ? "lsw compact" : "lsw"}
        role="group"
        aria-label={t("label.language")}
      >
        {TALEN.map(({ value, key }) => (
          <button
            key={value}
            type="button"
            aria-pressed={locale === value}
            disabled={bezig}
            onClick={() => void kies(value)}
            lang={value}
          >
            {compact ? value.toUpperCase() : t(key)}
          </button>
        ))}
      </div>
      {compact ? null : <span className="lsw-hint">{t("language.hint")}</span>}
    </div>
  );
}
