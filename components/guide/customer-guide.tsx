"use client";

// ── HET HANDBOEK, BIJ DE KLANT ZELF ─────────────────────────────────
//
// De eigenaar, 30-09: "PSM app guide > affiliates > advertisers >
// admins > super admin, manuals en handleidingen."
//
// De handboeken bestonden al (components/admin/manual-content.ts) maar
// waren alleen voor de beheerkant te openen. Deze component laat een
// klant zijn EIGEN handboek lezen, in de stijl van zijn eigen app.
//
// ── UITKLAPPEN, GEEN MUUR ─────────────────────────────────────────
//
// Zeven hoofdstukken met elk een inleiding, stappen en notities zijn op
// een telefoon meerdere schermen tekst. Niemand leest een handleiding
// van boven naar beneden; je zoekt het ene ding dat je nu wilt weten.
// Dus: alleen de titels, en tik om er een te openen. Het eerste staat
// dicht -- een handboek dat bij openen al een hoofdstuk uitgevouwen
// heeft, heeft voor de lezer gekozen.
//
// ── EEN BRON ──────────────────────────────────────────────────────
//
// Geen tekst in dit bestand. Alles komt uit CUSTOMER_GUIDES, zodat wat
// een admin aan de telefoon voorleest en wat de klant hier leest
// hetzelfde is en hetzelfde blijft.

import { useState } from "react";
import { ChevronDown, Languages, Loader2 } from "lucide-react";
import {
  CUSTOMER_GUIDES,
  type Note,
  type Section,
} from "@/components/admin/manual-customer";
import { useT } from "@/hooks/use-t";
import { LANGUAGES, RTL_LANGUAGES, useBrowserTranslate } from "@/hooks/use-browser-translate";
import type { Locale } from "@/lib/i18n";
import { GUIDE_HEAD_NL, GUIDE_NL } from "./customer-guide-nl";

// ── DE TAAL ───────────────────────────────────────────────────────
//
// Het Engels blijft de bron (iconen, tonen, volgorde). In het Nederlands
// komt de TEKST uit customer-guide-nl.ts, per hoofdstuk-id. Een
// hoofdstuk zonder Nederlandse versie, of met een ander aantal stappen,
// blijft Engels in plaats van half vertaald -- en de test vangt het.
function inTaal(s: Section, locale: Locale): Section {
  if (locale !== "nl") return s;
  const nl = GUIDE_NL[s.id];
  if (!nl || nl.steps.length !== s.steps.length || (nl.notes?.length ?? 0) !== (s.notes?.length ?? 0)) return s;
  return {
    ...s,
    title: nl.title,
    path: nl.path,
    intro: nl.intro,
    steps: nl.steps,
    notes: s.notes?.map((n, i) => ({ ...n, label: nl.notes![i].label, text: nl.notes![i].text })),
  };
}

// Tinten per soort notitie. De variabelen bestaan in de adverteerder-
// en de affiliate-shell allebei, dus dit leest in beide als thuis.
const TONE: Record<Note["tone"], { bg: string; fg: string }> = {
  ok: { bg: "var(--win-soft, #e7f7ef)", fg: "var(--win, #178a55)" },
  pend: { bg: "var(--warn-soft, #fff4e0)", fg: "var(--warn, #a86a00)" },
  due: { bg: "var(--danger-soft, #fdeceb)", fg: "var(--danger, #c0392b)" },
  info: { bg: "var(--primary-tint, #eef3ff)", fg: "var(--primary-600, #3a63d8)" },
};

const CSS = `
.cguide{display:flex;flex-direction:column;gap:8px}
.cguide .cg-item{border:1px solid var(--line);border-radius:14px;
  background:var(--panel);overflow:hidden;transition:border-color .15s}
.cguide .cg-item.open{border-color:var(--primary-tint,#dbe5ff)}
.cguide .cg-head{display:flex;align-items:center;gap:11px;width:100%;
  padding:12px 13px;background:none;border:0;cursor:pointer;text-align:left;
  font:inherit;color:inherit}
.cguide .cg-ic{width:32px;height:32px;border-radius:10px;flex:0 0 auto;
  display:grid;place-items:center;background:var(--primary-tint,#eef3ff);
  color:var(--primary-600,#3a63d8)}
.cguide .cg-ic svg{width:16px;height:16px}
.cguide .cg-tt{min-width:0;flex:1 1 auto}
.cguide .cg-tt b{display:block;font-family:var(--hd);font-weight:800;
  font-size:.95rem;color:var(--ink);line-height:1.25}
.cguide .cg-tt span{display:block;font-size:.72rem;color:var(--faint);
  margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cguide .cg-chev{width:18px;height:18px;color:var(--faint);flex:0 0 auto;
  transition:transform .18s}
.cguide .cg-item.open .cg-chev{transform:rotate(180deg)}
.cguide .cg-body{padding:0 14px 14px 56px}
.cguide .cg-intro{margin:0 0 10px;font-size:.88rem;color:var(--txt-2);
  line-height:1.5}
.cguide ol{margin:0;padding:0;list-style:none;counter-reset:st;
  display:flex;flex-direction:column;gap:8px}
.cguide li{position:relative;padding-left:26px;font-size:.87rem;
  color:var(--ink);line-height:1.45;counter-increment:st}
.cguide li::before{content:counter(st);position:absolute;left:0;top:1px;
  width:18px;height:18px;border-radius:50%;display:grid;place-items:center;
  font-size:.66rem;font-weight:800;background:var(--panel-2);
  color:var(--txt-2)}
.cguide .cg-notes{display:flex;flex-direction:column;gap:6px;margin-top:12px}
.cguide .cg-note{border-radius:10px;padding:8px 10px;font-size:.8rem;
  line-height:1.45}
.cguide .cg-note b{display:block;font-size:.66rem;font-weight:800;
  letter-spacing:.06em;text-transform:uppercase;margin-bottom:2px}
@media (max-width:420px){
  .cguide .cg-body{padding-left:14px}
}
@media (prefers-reduced-motion:reduce){
  .cguide .cg-chev,.cguide .cg-item{transition:none}
}
/* De taalkaart: dezelfde donkere kaart als het handboek van de
   medewerkers (de eigenaar, 01-10: "bij admin was het 10x mooier"). */
.cguide .cg-lang{position:relative;overflow:hidden;display:grid;gap:10px;margin:0 0 14px;
  padding:14px 16px;border-radius:16px;color:#fff;
  background:linear-gradient(120deg,#0a0f2e,#1b2160);
  box-shadow:0 18px 36px -24px rgba(20,30,80,.7)}
.cguide .cg-lang::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.6;
  background:radial-gradient(60% 120% at 0% 0%,rgba(91,141,255,.55),transparent 60%),
    radial-gradient(50% 120% at 100% 0%,rgba(139,92,246,.5),transparent 60%)}
.cguide .cg-lang > *{position:relative}
.cguide .cg-lang-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cguide .cg-lang-row b{font-size:.92rem;font-weight:800}
.cguide .cg-lang-pick{display:inline-flex;align-items:center;gap:8px;border-radius:12px;
  padding:6px 12px;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
.cguide .cg-lang-pick svg{width:16px;height:16px}
.cguide .cg-lang select{background:transparent;color:#fff;border:0;outline:0;font-weight:800;
  font-size:.9rem;cursor:pointer}
.cguide .cg-lang select option{color:#0a0f2e}
.cguide .cg-lang-st{display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:600;
  color:rgba(255,255,255,.88)}
.cguide .cg-lang-st svg{width:14px;height:14px;animation:cgspin 1s linear infinite;flex:0 0 auto}
@keyframes cgspin{to{transform:rotate(360deg)}}
.cguide .cg-lang-btn{justify-self:start;display:inline-flex;align-items:center;gap:8px;height:38px;
  border-radius:12px;border:0;padding:0 16px;font-weight:800;font-size:.86rem;
  background:#fff;color:#0a0f2e;cursor:pointer}
.cguide .cg-lang-btn svg{width:16px;height:16px}
`;

function Hoofdstuk({
  s,
  open,
  onToggle,
  tt = (x: string) => x,
}: {
  s: Section;
  open: boolean;
  onToggle: () => void;
  tt?: (x: string) => string;
}) {
  const Icon = s.icon;
  return (
    <div className={`cg-item${open ? " open" : ""}`}>
      <button
        type="button"
        className="cg-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="cg-ic">
          <Icon />
        </span>
        <span className="cg-tt">
          <b>{tt(s.title)}</b>
          {/* Het PAD, zodat de lezer weet waar hij moet drukken zonder
              het hele hoofdstuk te lezen. */}
          <span>{s.path}</span>
        </span>
        <ChevronDown className="cg-chev" />
      </button>
      {open ? (
        <div className="cg-body">
          <p className="cg-intro">{tt(s.intro)}</p>
          <ol>
            {s.steps.map((st, i) => (
              <li key={i}>{tt(st)}</li>
            ))}
          </ol>
          {s.notes && s.notes.length > 0 ? (
            <div className="cg-notes">
              {s.notes.map((n, i) => (
                <div
                  key={i}
                  className="cg-note"
                  style={{ background: TONE[n.tone].bg, color: TONE[n.tone].fg }}
                >
                  <b>{tt(n.label)}</b>
                  {tt(n.text)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function CustomerGuideView({
  audience,
}: {
  audience: "advertiser" | "affiliate";
}) {
  const { locale } = useT();
  const guide = CUSTOMER_GUIDES[audience];
  // Eén tegelijk open. Twee uitgeklapte hoofdstukken onder elkaar zijn
  // op een telefoon weer de muur tekst die dit moest vermijden.
  const [open, setOpen] = useState<string | null>(null);

  // ── EEN TAALKIEZER, ZOALS IN HET HANDBOEK VAN DE MEDEWERKERS ──────
  // De eigenaar, 01-10: "bij customer moet er ook zo'n language selector
  // bij get help". Engels en Nederlands staan erin (NL volgt de taal van
  // de app); elke andere taal vertaalt de browser.
  // De titels eerst: die staan dicht op het scherm, dus die ziet de lezer
  // meteen in zijn taal.
  const teksten = [
    ...guide.sections.map((x) => x.title),
    ...guide.sections.flatMap((x) => [x.intro, ...x.steps, ...(x.notes ?? []).flatMap((n) => [n.label, n.text])]),
  ];
  const vt = useBrowserTranslate(teksten, "psm.help.lang", ["en", "nl"]);
  const keuze = vt.lang === "en" && locale === "nl" ? "nl" : vt.lang;
  const bronTaal: Locale = keuze === "nl" ? "nl" : "en";
  const tt = keuze === "en" || keuze === "nl" ? (x: string) => x : vt.tt;

  return (
    <div className="cguide" lang={keuze} dir={RTL_LANGUAGES.has(keuze) ? "rtl" : "ltr"}>
      <style>{CSS}</style>
      <div className="cg-lang">
        <div className="cg-lang-row">
          <label className="cg-lang-pick">
            <Languages aria-hidden="true" />
            <select value={keuze} onChange={(e) => vt.kies(e.target.value)} aria-label="Language">
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {vt.stand === "busy" ? (
          <span className="cg-lang-st">
            <Loader2 aria-hidden="true" />
            {vt.voortgang === 0
              ? `Downloading ${vt.label} (only the first time)… ${vt.download}%`
              : `Translating to ${vt.label}… ${vt.voortgang}%`}
          </span>
        ) : vt.stand === "needsClick" && keuze !== "en" && keuze !== "nl" ? (
          <button type="button" className="cg-lang-btn" onClick={vt.opnieuw}>
            <Languages aria-hidden="true" /> Translate into {vt.label}
          </button>
        ) : vt.stand === "unsupported" && keuze !== "en" && keuze !== "nl" ? (
          <span className="cg-lang-st">{"Your browser can't translate this itself — right-click and choose Translate."}</span>
        ) : null}
      </div>
      {guide.sections.map((s) => (
        <Hoofdstuk
          key={s.id}
          s={inTaal(s, bronTaal)}
          tt={tt}
          open={open === s.id}
          onToggle={() => setOpen((cur) => (cur === s.id ? null : s.id))}
        />
      ))}
    </div>
  );
}

/** De kop en inleiding, los, zodat elke app hem in zijn eigen kaartkop
 *  kan zetten in plaats van dat deze component hem opdringt. */
export function customerGuideHeading(
  audience: "advertiser" | "affiliate",
  locale: Locale = "en",
) {
  if (locale === "nl") return GUIDE_HEAD_NL[audience];
  const g = CUSTOMER_GUIDES[audience];
  return { heading: g.heading, lead: g.lead };
}
