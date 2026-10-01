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
  create: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<Vertaler>;
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
    const t = api();
    if (!t) return;
    try {
      setStand("busy");
      setVoortgang(0);
      const v = await t.create({ sourceLanguage: "en", targetLanguage: code });
      const teksten = Array.from(new Set(tekstenRef.current.filter(Boolean)));
      const uit: Record<string, string> = {};
      for (let i = 0; i < teksten.length; i++) {
        if (ik !== loop.current) return;
        uit[teksten[i]] = await v.translate(teksten[i]);
        if (i % 8 === 0) {
          setVoortgang(Math.max(1, Math.round(((i + 1) / teksten.length) * 100)));
          setVertaald({ ...uit });
        }
      }
      if (ik === loop.current) {
        setVertaald(uit);
        setStand("done");
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
    const t = api();
    if (!t) {
      setStand("unsupported");
      return;
    }
    (async () => {
      try {
        const kan = await t.availability({ sourceLanguage: "en", targetLanguage: lang });
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

  return { lang, kies, tt, stand, voortgang, opnieuw, label };
}
