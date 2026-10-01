"use client";

// ── HET HANDBOEK, OP HET SCHERM ─────────────────────────────────────
//
// De tekst staat in lib/staff-handbook.ts (Engels + Nederlands met de
// hand). Elke andere taal:
//   1. Chrome op de computer heeft een vertaler IN de browser
//      (Translator API) -- dan vertaalt het hele handboek ter plekke,
//      zonder dat er tekst de deur uit gaat;
//   2. anders per hoofdstuk een knop "Open in Google Translate";
//   3. en de pagina draagt lang="en", zodat elke browser zelf
//      "Vertaal deze pagina" aanbiedt.
// De gekozen taal onthoudt de browser (localStorage, mag mislukken).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Calendar,
  Coins,
  Download,
  FileText,
  HelpCircle,
  KeyRound,
  Landmark,
  Languages,
  List,
  Loader2,
  Mail,
  Receipt,
  Rocket,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAppContext } from "@/context/app-provider";
import { HB_CHAPTERS, HB_GLOSSARY, HB_HEAD, chapterText, type HbChapter, type HbLang } from "@/lib/staff-handbook";

const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  sun: Sun,
  list: List,
  upload: Upload,
  x: X,
  file: FileText,
  coins: Coins,
  download: Download,
  receipt: Receipt,
  users: Users,
  landmark: Landmark,
  calendar: Calendar,
  shield: ShieldCheck,
  help: HelpCircle,
  mail: Mail,
  settings: Settings,
  scale: Scale,
  key: KeyRound,
};

// De talen. en en nl staan erin; de rest vertaalt de browser.
const TALEN: { code: string; label: string }[] = [
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
const RTL = new Set(["ar", "fa", "he", "ur"]);
const OPSLAG = "psm.handbook.lang";

type Vertaler = { translate: (s: string) => Promise<string> };
type TranslatorApi = {
  availability: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
  create: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<Vertaler>;
};

export default function StaffHandbook() {
  const { isSuperAdmin } = useAppContext();
  const [lang, setLang] = useState("en");
  const [zoek, setZoek] = useState("");
  const [vertaald, setVertaald] = useState<Record<string, string>>({});
  const [stand, setStand] = useState<"idle" | "busy" | "done" | "unsupported">("idle");
  const [voortgang, setVoortgang] = useState(0);
  const loop = useRef(0);

  // De bron: Nederlands als dat gekozen is, anders Engels.
  const bron: HbLang = lang === "nl" ? "nl" : "en";
  const head = HB_HEAD[bron];
  const hoofdstukken = useMemo(() => HB_CHAPTERS.filter((c) => !c.owner || isSuperAdmin), [isSuperAdmin]);

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(OPSLAG);
      if (s && TALEN.some((t) => t.code === s)) setLang(s);
    } catch {
      /* geen opslag: Engels */
    }
  }, []);

  // ── VERTALEN IN DE BROWSER ───────────────────────────────────────
  useEffect(() => {
    const ik = ++loop.current;
    setVertaald({});
    if (lang === "en" || lang === "nl") {
      setStand("idle");
      return;
    }
    const api = (globalThis as unknown as { Translator?: TranslatorApi }).Translator;
    if (!api) {
      setStand("unsupported");
      return;
    }
    (async () => {
      try {
        const opt = { sourceLanguage: "en", targetLanguage: lang };
        const kan = await api.availability(opt);
        if (kan === "unavailable") {
          if (ik === loop.current) setStand("unsupported");
          return;
        }
        setStand("busy");
        setVoortgang(0);
        const v = await api.create(opt);
        const teksten = Array.from(
          new Set([
            ...Object.values(HB_HEAD.en),
            ...hoofdstukken.flatMap((c) => chapterText(c, "en")),
            ...HB_GLOSSARY.map((g) => g.def.en),
          ]),
        );
        const uit: Record<string, string> = {};
        for (let i = 0; i < teksten.length; i++) {
          if (ik !== loop.current) return;
          uit[teksten[i]] = await v.translate(teksten[i]);
          if (i % 8 === 0) {
            setVoortgang(Math.round(((i + 1) / teksten.length) * 100));
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
    })();
  }, [lang, hoofdstukken]);

  const tt = (s: string) => (bron === "en" ? (vertaald[s] ?? s) : s);
  const kies = (code: string) => {
    setLang(code);
    try {
      window.localStorage.setItem(OPSLAG, code);
    } catch {
      /* niet onthouden is ook goed */
    }
  };

  const z = zoek.trim().toLowerCase();
  const zichtbaar = hoofdstukken.filter((c) => !z || chapterText(c, bron).some((s) => tt(s).toLowerCase().includes(z)));
  const taalLabel = TALEN.find((t) => t.code === lang)?.label ?? lang;
  const googleLink = (c: HbChapter) =>
    `https://translate.google.com/?sl=en&tl=${lang === "fil" ? "tl" : lang}&op=translate&text=${encodeURIComponent(chapterText(c, "en").join("\n\n").slice(0, 4500))}`;

  return (
    <div lang={lang} dir={RTL.has(lang) ? "rtl" : "ltr"} className="mx-auto grid w-full max-w-4xl gap-4 p-4 md:p-6">
      {/* ── KOP MET TAALKIEZER ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg" style={{ background: "linear-gradient(120deg,#0a0f2e,#1b2160)" }}>
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60% 120% at 0% 0%,rgba(91,141,255,.55),transparent 60%),radial-gradient(50% 120% at 100% 0%,rgba(139,92,246,.5),transparent 60%)" }} />
        <div className="relative grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              <BookOpen className="h-6 w-6" /> {tt(head.title)}
            </h1>
            <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 ring-1 ring-white/25">
              <Languages className="h-4 w-4" />
              <select
                value={lang}
                onChange={(e) => kies(e.target.value)}
                className="bg-transparent text-sm font-bold text-white outline-none [&>option]:text-black"
                aria-label="Language"
              >
                {TALEN.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="max-w-2xl text-sm text-white/85">{tt(head.lead)}</p>
          {stand === "busy" ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-white/80">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Translating to {taalLabel} in your browser… {voortgang}%
            </p>
          ) : null}
          {stand === "unsupported" ? (
            <p className="rounded-lg bg-amber-300/20 px-3 py-2 text-xs font-semibold text-amber-50 ring-1 ring-amber-200/40">
              This browser cannot translate on its own into {taalLabel}. Right-click the page and choose “Translate to {taalLabel}”, or
              use the “Google Translate” button on each chapter.
            </p>
          ) : null}
        </div>
      </div>

      {/* ── INHOUD + ZOEKEN ─────────────────────────────────────── */}
      <div className="grid gap-3 rounded-2xl border bg-card p-4">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder={tt(head.search)}
            className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"
          />
        </label>
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tt(head.contents)}</div>
        <div className="flex flex-wrap gap-1.5">
          {zichtbaar.map((c) => (
            <a
              key={c.id}
              href={`#hb-${c.id}`}
              className={`rounded-full px-3 py-1 text-xs font-bold ${c.owner ? "bg-violet-100 text-violet-800" : "bg-muted text-foreground"} hover:bg-primary hover:text-primary-foreground`}
            >
              {tt(c.title[bron])}
            </a>
          ))}
          <a href="#hb-glossary" className="rounded-full bg-muted px-3 py-1 text-xs font-bold hover:bg-primary hover:text-primary-foreground">
            {tt(head.glossary)}
          </a>
        </div>
      </div>

      {/* ── DE HOOFDSTUKKEN ─────────────────────────────────────── */}
      {zichtbaar.map((c) => {
        const Icon = ICONS[c.icon] ?? BookOpen;
        return (
          <section key={c.id} id={`hb-${c.id}`} className="scroll-mt-20 overflow-hidden rounded-2xl border bg-card">
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 ${c.owner ? "bg-violet-50 dark:bg-violet-950/30" : "bg-muted/40"}`}>
              <h2 className="flex items-center gap-2 text-lg font-extrabold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                {tt(c.title[bron])}
              </h2>
              <span className="flex flex-wrap items-center gap-2">
                {c.owner ? <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">{tt(head.ownerOnly)}</span> : null}
                {c.where ? (
                  <span className="rounded-full bg-background px-2.5 py-0.5 font-mono text-[11px] font-semibold ring-1 ring-border" dir="ltr">
                    {c.where}
                  </span>
                ) : null}
                {stand === "unsupported" ? (
                  <a href={googleLink(c)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
                    Google Translate
                  </a>
                ) : null}
              </span>
            </div>
            <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">{tt(head.what)}</div>
                <p className="text-sm leading-6">{tt(c.what[bron])}</p>
              </div>
              <div>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">{tt(head.why)}</div>
                <p className="text-sm leading-6">{tt(c.why[bron])}</p>
              </div>
            </div>
            <div className="px-5 pb-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">{tt(head.how)}</div>
              <ol className="grid gap-2">
                {c.how[bron].map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-6">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
                      {i + 1}
                    </span>
                    <span>{tt(s)}</span>
                  </li>
                ))}
              </ol>
            </div>
            {c.watch?.[bron]?.length ? (
              <div className="mx-5 mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:bg-amber-950/30">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">⚠ {tt(head.watch)}</div>
                {c.watch[bron].map((s, i) => (
                  <p key={i} className="text-sm leading-6 text-amber-950 dark:text-amber-100">
                    {tt(s)}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}

      {/* ── WOORDENLIJST ────────────────────────────────────────── */}
      <section id="hb-glossary" className="scroll-mt-20 rounded-2xl border bg-card p-5">
        <h2 className="mb-3 text-lg font-extrabold">{tt(head.glossary)}</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          {HB_GLOSSARY.map((g) => (
            <div key={g.term} className="rounded-xl bg-muted/50 px-3 py-2">
              <dt className="text-sm font-extrabold" dir="ltr">
                {g.term}
              </dt>
              <dd className="text-sm text-muted-foreground">{tt(g.def[bron])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
