"use client";

// ── VERTALEN IN DE BROWSER (Chrome's ingebouwde vertaler) ───────────
//
// Gedeeld door het handboek voor medewerkers en de hulp voor klanten.
// Engels is de bron. Een nieuwe taal downloadt Chrome één keer, en dat
// mag alleen IN een klik -- daarom start `kies()` het meteen (de keuze in
// de lijst is die klik). Zonder vertaler in de browser: stand
// "unsupported", en de pagina draagt lang= zodat "Vertaal deze pagina"
// van de browser zelf ook werkt. Er gaat geen tekst de deur uit.

import { useEffect, useRef, useState } from "react";

export type TranslateState = "idle" | "busy" | "done" | "unsupported" | "needsClick";

type Vertaler = { translate: (s: string) => Promise<string> };
type TranslatorApi = {
  availability: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
  create: (o: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: EventTarget) => void;
  }) => Promise<Vertaler>;
};

export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "nl", label: "Nederlands" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "pl", label: "Polski" },
  { code: "ro", label: "Română" },
  { code: "tr", label: "Türkçe" },
  { code: "uk", label: "Українська" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
  { code: "fa", label: "فارسی" },
  { code: "he", label: "עברית" },
  { code: "hi", label: "हिन्दी" },
  { code: "ur", label: "اردو" },
  { code: "bn", label: "বাংলা" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "th", label: "ไทย" },
  { code: "fil", label: "Filipino" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "no", label: "Norsk" },
  { code: "fi", label: "Suomi" },
  { code: "cs", label: "Čeština" },
  { code: "sk", label: "Slovenčina" },
  { code: "hu", label: "Magyar" },
  { code: "el", label: "Ελληνικά" },
  { code: "bg", label: "Български" },
  { code: "hr", label: "Hrvatski" },
  { code: "sr", label: "Srpski" },
  { code: "lt", label: "Lietuvių" },
  { code: "sw", label: "Kiswahili" },
  { code: "so", label: "Soomaali" },
  { code: "am", label: "አማርኛ" },
];
export const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

const api = () => (globalThis as unknown as { Translator?: TranslatorApi }).Translator;

// ── SNELLER (de eigenaar, 01-10: "het is maar een klein beetje tekst,
// moet 10x sneller") ──
//   * onthouden per taal in de browser: de tweede keer direct, zonder
//     download en zonder opnieuw vertalen;
//   * zes zinnen tegelijk in plaats van één voor één;
//   * de volgorde van de aanroeper: de titels eerst.
const CACHE = (key: string, code: string) => `${key}.v1.${code}`;
function leesCache(key: string, code: string): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE(key, code)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function schrijfCache(key: string, code: string, m: Record<string, string>) {
  try {
    window.localStorage.setItem(CACHE(key, code), JSON.stringify(m));
  } catch {
    /* vol of geblokkeerd: dan de volgende keer opnieuw */
  }
}

/**
 * @param texts   alle Engelse zinnen die vertaald moeten worden
 * @param handmatig talen die de pagina zelf heeft (bv. "en", "nl") -- die
 *                  worden niet door de browser vertaald
 */
export function useBrowserTranslate(texts: string[], storageKey: string, handmatig: string[] = ["en"]) {
  const [lang, setLang] = useState("en");
  const [vertaald, setVertaald] = useState<Record<string, string>>({});
  const [stand, setStand] = useState<TranslateState>("idle");
  const [voortgang, setVoortgang] = useState(0);
  // Het downloaden van een taalpakket, 0-100 (Chrome meldt het via monitor).
  const [download, setDownload] = useState(0);
  const loop = useRef(0);
  const gestart = useRef<string | null>(null);
  const tekstenRef = useRef(texts);
  tekstenRef.current = texts;

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(storageKey);
      if (s && LANGUAGES.some((t) => t.code === s)) setLang(s);
    } catch {
      /* geen opslag: Engels */
    }
  }, [storageKey]);

  const vertaal = async (ik: number, code: string) => {
    const teksten = Array.from(new Set(tekstenRef.current.filter(Boolean)));
    const uit: Record<string, string> = leesCache(storageKey, code);
    const nodig = teksten.filter((x) => !(x in uit));
    if (!nodig.length) {
      // Alles al eens vertaald: meteen, zonder download.
      setVertaald(uit);
      setStand("done");
      return;
    }
    if (Object.keys(uit).length) setVertaald({ ...uit });
    const t = api();
    if (!t) return;
    try {
      setStand("busy");
      setVoortgang(0);
      setDownload(0);
      // De eigenaar, 01-10: "na 1 min nog steeds downloading -- ik wil een
      // percentage zien". Chrome meldt de download; zonder voortgang en
      // zonder klaar binnen 90 s is het "kan niet", niet eeuwig wachten.
      let laatste = Date.now();
      const v = await Promise.race([
        t.create({
          sourceLanguage: "en",
          targetLanguage: code,
          monitor(m) {
            m.addEventListener("downloadprogress", (e) => {
              laatste = Date.now();
              const geladen = Number((e as unknown as { loaded?: number }).loaded ?? 0);
              setDownload(Math.min(100, Math.round(geladen * 100)));
            });
          },
        }),
        new Promise<never>((_, nee) => {
          const tik = setInterval(() => {
            if (Date.now() - laatste > 90_000) {
              clearInterval(tik);
              nee(new Error("download hangt"));
            }
          }, 2000);
        }),
      ]);
      setDownload(100);
      const TEGELIJK = 6;
      for (let i = 0; i < nodig.length; i += TEGELIJK) {
        if (ik !== loop.current) return;
        const stuk = nodig.slice(i, i + TEGELIJK);
        const klaar = await Promise.all(stuk.map((x) => v.translate(x).catch(() => x)));
        stuk.forEach((x, j) => (uit[x] = klaar[j]));
        setVoortgang(Math.max(1, Math.round((Math.min(i + TEGELIJK, nodig.length) / nodig.length) * 100)));
        setVertaald({ ...uit });
      }
      if (ik === loop.current) {
        setVertaald(uit);
        setStand("done");
        schrijfCache(storageKey, code, uit);
      }
    } catch {
      if (ik === loop.current) setStand("unsupported");
    }
  };

  useEffect(() => {
    if (gestart.current === lang) return;
    const ik = ++loop.current;
    setVertaald({});
    if (handmatig.includes(lang)) {
      setStand("idle");
      return;
    }
    {
      const bekend = leesCache(storageKey, lang);
      const alles = tekstenRef.current.filter(Boolean);
      if (alles.length && alles.every((x) => x in bekend)) {
        setVertaald(bekend);
        setStand("done");
        return;
      }
    }
    const t = api();
    if (!t) {
      setStand("unsupported");
      return;
    }
    (async () => {
      try {
        // Sommige browsers antwoorden nooit (gezien in een ingebouwde browser):
        // na 4 seconden zonder antwoord is het "kan niet", niet eeuwig wachten.
        const kan = await Promise.race([
          t.availability({ sourceLanguage: "en", targetLanguage: lang }),
          new Promise<string>((ok) => setTimeout(() => ok("unavailable"), 4000)),
        ]);
        if (ik !== loop.current) return;
        if (kan === "unavailable") setStand("unsupported");
        else if (kan === "available") void vertaal(ik, lang);
        else setStand("needsClick");
      } catch {
        if (ik === loop.current) setStand("unsupported");
      }
    })();
    // vertaal leest de teksten via een ref; alleen de taal telt hier
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const kies = (code: string) => {
    setLang(code);
    try {
      window.localStorage.setItem(storageKey, code);
    } catch {
      /* niet onthouden is ook goed */
    }
    if (!handmatig.includes(code) && api()) {
      gestart.current = code;
      setVertaald({});
      void vertaal(++loop.current, code);
    } else {
      gestart.current = null;
    }
  };

  const opnieuw = () => {
    gestart.current = lang;
    void vertaal(++loop.current, lang);
  };

  /** De vertaling van een Engelse zin, of de zin zelf. */
  const tt = (s: string) => vertaald[s] ?? s;
  const label = LANGUAGES.find((t) => t.code === lang)?.label ?? lang;

  return { lang, kies, tt, stand, voortgang, download, opnieuw, label };
}
