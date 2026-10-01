"use client";

import { useT } from "@/hooks/use-t";
// ── DE PARTNERGIDS ──────────────────────────────────────────────────
//
// De eigenaar, 30-09: "PSM partner directory > partners met wow super
// mooie tiles of grids of cards met links naar onze website waar meer
// info staat."
//
// De klant leest `partners` rechtstreeks: RLS uit plak 174 laat alleen
// ACTIEVE partners van zijn EIGEN tenant door. Er valt dus niets te
// filteren in deze component, en niets te lekken.
//
// ── DRIE TOESTANDEN, EN ZE LIJKEN NIET OP ELKAAR ──────────────────
//
// Laden, leeg en mislukt zijn drie verschillende antwoorden. Een gids
// die bij een mislukte lees "no partners yet" zegt, vertelt de klant
// iets dat niet waar is. `isError` komt van een echte fout; nul rijen
// zonder fout is echt leeg.
//
// ── DE VIERDE RONDE: COMPACT, EN EEN TEGEL DIE VERKOOPT ───────────
//
// De eigenaar, 01-10, op de grote versie met een donkere kop: "nu is het
// extreem groot, iets meer description en miss verticale hoogte minder,
// en PSF heeft ook een Shopify app etc, iets meer info, denk slim na,
// high converting".
//
// Wat een tegel laat converteren is niet zijn hoogte maar wat er in een
// oogopslag staat. Dus:
//
//   * de kop is EEN regel: icoon of logo, naam (mag twee regels), het
//     domein, en een badge ("Live in 24h") -- geen lege kop meer;
//   * de beschrijving helemaal;
//   * tot vier HIGHLIGHTS als vinkjes: de redenen om te klikken
//     ("Shopify app", "100% QC", "No setup fees");
//   * TWEE knoppen: de hoofdactie in kleur ("Get a free quote") en een
//     tweede ("Shopify app"). Een klant die de app zoekt, hoeft niet
//     eerst door een homepage.
//
// Alles wat er staat komt uit de partnerrij en is in de admin in te
// vullen (plak 181). Zonder die plak valt de tegel terug op naam,
// categorie, beschrijving en een "Meer info"-knop.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, ArrowUpRight, Check, Handshake } from "lucide-react";
import { partnerIcon } from "@/lib/partner-icons";

export type Partner = {
  id: string;
  name: string;
  tagline: string | null;
  category: string | null;
  url: string | null;
  logo_url: string | null;
  accent: string | null;
  highlights?: string[] | null;
  icon?: string | null;
  badge?: string | null;
  cta_label?: string | null;
  cta2_label?: string | null;
  cta2_url?: string | null;
};

export const PARTNER_CSS = `
/* Ronde vijf (01-10): de blauwe banner terug, maar slank; de website op
   een eigen regel en helemaal; de vier USP's in een strak raster van
   twee bij twee, allemaal even groot; minder hoogte -- de beschrijving
   op drie regels met "Lees meer". */
.pdir{display:grid;grid-template-columns:1fr;gap:14px}
@media (min-width:760px){.pdir{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:1180px){.pdir{grid-template-columns:repeat(3,minmax(0,1fr))}}

.ptile{position:relative;display:flex;flex-direction:column;min-width:0;
  border-radius:20px;color:inherit;overflow:hidden;isolation:isolate;
  border:1px solid transparent;
  background:
    linear-gradient(var(--panel),var(--panel)) padding-box,
    linear-gradient(135deg,color-mix(in srgb,var(--acc) 45%,var(--line)),var(--line) 40%,var(--line) 65%,color-mix(in srgb,#8B5CF6 40%,var(--line))) border-box;
  box-shadow:0 1px 2px rgba(15,23,60,.05),0 16px 36px -24px color-mix(in srgb,var(--acc) 55%,rgba(15,23,60,.35));
  transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s}
.ptile:hover{transform:translateY(-3px);
  background:
    linear-gradient(var(--panel),var(--panel)) padding-box,
    linear-gradient(135deg,var(--acc),#8B5CF6) border-box;
  box-shadow:0 1px 2px rgba(15,23,60,.05),0 26px 50px -26px color-mix(in srgb,var(--acc) 75%,rgba(15,23,60,.45))}

/* De banner: blauw naar paars, een stippenraster en een glans. 58px --
   genoeg voor kleur, niet genoeg om hoogte te kosten. */
.ptile .pt-hero{position:relative;height:68px;overflow:hidden;
  display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px 0 14px;
  background:
    radial-gradient(70% 160% at 0% 0%,color-mix(in srgb,var(--acc) 75%,transparent),transparent 65%),
    radial-gradient(60% 160% at 100% 0%,rgba(139,92,246,.6),transparent 65%),
    linear-gradient(120deg,#0a0f2e,#151b4d)}
.ptile .pt-hero::before{content:"";position:absolute;inset:0;opacity:.35;pointer-events:none;
  background-image:radial-gradient(rgba(255,255,255,.5) 1px,transparent 1.3px);background-size:13px 13px;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 60%);mask-image:linear-gradient(90deg,transparent,#000 60%)}
.ptile .pt-hero::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-60%;pointer-events:none;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);
  transform:skewX(-18deg);transition:left .7s cubic-bezier(.2,.8,.2,1)}
.ptile:hover .pt-hero::after{left:125%}
.ptile .pt-cat,.ptile .pt-badge{position:relative;font-size:.6rem;font-weight:800;letter-spacing:.08em;
  text-transform:uppercase;padding:4px 9px;border-radius:99px;color:#fff;white-space:nowrap;
  background:rgba(10,15,46,.55);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);
  text-shadow:0 1px 1px rgba(0,0,0,.35);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.ptile .pt-badge{text-transform:none;letter-spacing:.01em;font-size:.68rem;background:rgba(255,255,255,.95);
  color:color-mix(in srgb,var(--acc) 75%,#1b1f4a);box-shadow:0 6px 14px -8px rgba(0,0,0,.35)}

.ptile .pt-body{padding:0 14px 14px}
/* Het icoon steekt half in de banner; naam en website staan ernaast. */
.ptile .pt-top{display:flex;align-items:flex-start;gap:11px;min-width:0}
.ptile .pt-ic{position:relative;z-index:1;width:50px;height:50px;border-radius:15px;flex:0 0 auto;margin-top:-22px;
  display:grid;place-items:center;overflow:hidden;color:#fff;
  background:linear-gradient(135deg,var(--acc),#8B5CF6);
  box-shadow:0 0 0 3px var(--panel),0 10px 22px -10px color-mix(in srgb,var(--acc) 90%,transparent);
  transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.ptile:hover .pt-ic{transform:rotate(-5deg) scale(1.04)}
.ptile .pt-ic svg{width:23px;height:23px}
.ptile .pt-ic.logo{background:#fff}
.ptile .pt-ic img{width:100%;height:100%;object-fit:contain;padding:7px}
.ptile .pt-head{min-width:0;flex:1 1 auto;padding-top:7px}
.ptile .pt-name{font-family:var(--hd);font-weight:800;font-size:1.04rem;line-height:1.2;
  letter-spacing:-.02em;color:var(--ink);overflow-wrap:anywhere}
/* De website HEEL: een eigen regel, mag afbreken op een punt, nooit
   afgekapt met een puntje. */
.ptile .pt-host{display:block;margin-top:2px;font-size:.74rem;font-weight:700;
  color:color-mix(in srgb,var(--acc) 70%,var(--ink));text-decoration:none;overflow-wrap:anywhere}

.ptile .pt-tag{margin-top:10px;font-size:.84rem;line-height:1.45;color:var(--txt-2);
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ptile .pt-tag.open{display:block;-webkit-line-clamp:unset}
.ptile .pt-more{margin-top:2px;padding:0;border:0;background:none;font:inherit;font-size:.76rem;
  font-weight:800;color:color-mix(in srgb,var(--acc) 75%,var(--ink));cursor:pointer}

/* De USP's: twee bij twee, elke pil even breed en even hoog. */
.ptile .pt-hl{margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ptile .pt-hl span{display:flex;align-items:center;gap:6px;min-width:0;min-height:32px;box-sizing:border-box;
  font-size:.74rem;font-weight:700;line-height:1.2;padding:6px 9px 6px 7px;border-radius:10px;color:var(--ink);
  background:color-mix(in srgb,var(--acc) 8%,var(--panel));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--acc) 18%,transparent)}
.ptile .pt-hl svg{width:15px;height:15px;flex:0 0 auto;padding:2.5px;box-sizing:border-box;border-radius:99px;color:#fff;
  background:linear-gradient(135deg,var(--acc),#8B5CF6)}

.ptile .pt-cta{margin-top:12px;display:flex;gap:8px}
.ptile .pt-btn{flex:1 1 0;min-width:0;display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:6px;
  padding:9px 10px;border-radius:12px;font-size:.82rem;font-weight:800;text-decoration:none;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:transform .2s,box-shadow .2s}
.ptile .pt-btn svg{width:15px;height:15px;flex:0 0 auto;display:inline-block}
.ptile .pt-btn.main{color:#fff;background:linear-gradient(135deg,var(--acc),#8B5CF6);
  box-shadow:0 10px 20px -12px color-mix(in srgb,var(--acc) 95%,transparent)}
.ptile .pt-btn.main:hover{transform:translateY(-1px)}
.ptile .pt-btn.alt{color:var(--ink);background:var(--panel);box-shadow:inset 0 0 0 1px var(--line-2)}
.ptile .pt-btn.alt:hover{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--acc) 60%,var(--line-2))}
.ptile .pt-btn:focus-visible{outline:2px solid var(--primary);outline-offset:2px}

.pdir .skel{border-radius:20px;height:250px;background:var(--panel-2)}
.pdir-note{display:flex;gap:10px;align-items:flex-start;padding:14px;
  border-radius:14px;border:1px solid var(--line);background:var(--panel);
  font-size:.86rem;color:var(--txt-2)}
.pdir-note svg{width:18px;height:18px;flex:0 0 auto;color:var(--faint)}
.pdir-note b{display:block;color:var(--ink);font-family:var(--hd);margin-bottom:2px}

@media (prefers-reduced-motion:reduce){
  .ptile,.ptile .pt-ic,.ptile .pt-btn,.ptile .pt-hero::after{transition:none}
  .ptile:hover,.ptile:hover .pt-ic,.ptile .pt-btn.main:hover{transform:none}
}
`;

function domein(url: string | null | undefined): string | null {
  try {
    return url ? new URL(url).hostname.replace(/^www[.]/, "") : null;
  } catch {
    return null;
  }
}

/** Een tegel. Ook gebruikt als live voorbeeld in de admin. */
export function PartnerTile({ p }: { p: Partner }) {
  const { t: tr } = useT();
  const [open, setOpen] = useState(false);
  const acc = p.accent && /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : "#5B8DFF";
  const Icon = partnerIcon(p.icon, p.category);
  const host = domein(p.url);
  const hl = (p.highlights ?? []).filter(Boolean).slice(0, 4);
  const stijl = { ["--acc" as string]: acc } as React.CSSProperties;
  // Drie regels is ongeveer 150 tekens op een telefoon. Korter: geen knop.
  const lang = (p.tagline ?? "").length > 150;

  return (
    <div className="ptile" style={stijl}>
      <div className="pt-hero">
        {p.category ? <span className="pt-cat">{p.category}</span> : <span />}
        {p.badge ? <span className="pt-badge">{p.badge}</span> : null}
      </div>
      <div className="pt-body">
        <div className="pt-top">
          <span className={`pt-ic${p.logo_url ? " logo" : ""}`}>
            {p.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logo_url} alt="" loading="lazy" />
            ) : (
              <Icon />
            )}
          </span>
          <div className="pt-head">
            <div className="pt-name">{p.name}</div>
            {host && p.url ? (
              <a className="pt-host" href={p.url} target="_blank" rel="noopener noreferrer">
                {host}
              </a>
            ) : null}
          </div>
        </div>

        {p.tagline ? (
          <>
            <div className={`pt-tag${open ? " open" : ""}`}>{p.tagline}</div>
            {lang ? (
              <button type="button" className="pt-more" onClick={() => setOpen((o) => !o)}>
                {open ? tr("label.partners.less") : tr("label.partners.more")}
              </button>
            ) : null}
          </>
        ) : null}

        {hl.length ? (
          <div className="pt-hl">
            {hl.map((h, i) => (
              <span key={i}>
                <Check strokeWidth={3} />
                {h}
              </span>
            ))}
          </div>
        ) : null}

        {/* Zonder link geen knop: een knop die nergens heen gaat is een
            knop die niets doet. */}
        {p.url || p.cta2_url ? (
          <div className="pt-cta">
            {p.url ? (
              <a
                className="pt-btn main"
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={tr("partners.opensInANewTab", { name: String(p.name) })}
              >
                {p.cta_label || tr("label.onb.learnMore")}
                <ArrowUpRight />
              </a>
            ) : null}
            {p.cta2_url ? (
              <a className="pt-btn alt" href={p.cta2_url} target="_blank" rel="noopener noreferrer">
                {p.cta2_label || tr("label.onb.learnMore")}
                <ArrowUpRight />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const BASIS = "id, name, tagline, category, url, logo_url, accent";

export default function PartnerDirectory() {
  const { t: tr } = useT();
  const q = useQuery({
    queryKey: ["partners-directory"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const lees = (kol: string) =>
        supabase
          .from("partners")
          .select(kol)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });
      // De velden van plak 181 eerst; bestaan ze nog niet, dan zonder.
      let { data, error } = await lees(
        `${BASIS}, highlights, icon, badge, cta_label, cta2_label, cta2_url`,
      );
      if (error && /column .* does not exist|schema cache/i.test(error.message)) {
        ({ data, error } = await lees(BASIS));
      }
      if (error) throw error;
      return (data ?? []) as unknown as Partner[];
    },
  });

  return (
    <div>
      <style>{PARTNER_CSS}</style>
      {q.isPending ? (
        <div className="pdir" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="pdir-note">
          <AlertTriangle />
          <span>
            <b>{tr("partners.weCouldnTLoadOur")}</b>
            {tr("partners.thatIsNotTheSame")}
          </span>
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="pdir-note">
          <Handshake />
          <span>
            <b>{tr("partners.noPartnersListedYet")}</b>
            {tr("partners.theCompaniesWeWorkWith")}
          </span>
        </div>
      ) : (
        <div className="pdir">
          {q.data!.map((p) => (
            <PartnerTile key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
