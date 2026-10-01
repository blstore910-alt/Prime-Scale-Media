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
// iets dat niet waar is -- en omdat RLS nul rijen geeft in plaats van
// een fout, is dat onderscheid hier niet vanzelfsprekend. `isError`
// komt van een echte fout; nul rijen zonder fout is echt leeg.
//
// ── DE TWEEDE RONDE, NA HET ZIEN ──────────────────────────────────
//
// De eigenaar, 30-09, op de eerste versie: "partners page tiles grids
// alles moet meer pro en wow, en brand name proberen op 1 line tekst,
// en avatar lelijk nu, misschien weg en icon ofzo."
//
// Hij had gelijk over de avatar. Een losse beginletter in een gekleurd
// vlak -- wat de eerste versie liet zien zolang er geen logo is, dus
// vandaag bij elke partner -- leest als een placeholder, niet als een
// merk. Nu:
//
//   * een ICOON dat bij de categorie past, in een getint vlakje. Dat
//     zegt meteen iets (verzending, creatie, betalen) in plaats van een
//     letter die niets zegt;
//   * een echt LOGO zodra er een logo-link is ingevuld -- dat wint
//     altijd van een icoon;
//   * de NAAM op een regel, afgekapt met een puntje in plaats van
//     afgebroken. Twee regels voor een merknaam maakt van een rij tegels
//     een rij ongelijke tegels;
//   * geen gekleurde band meer bovenin. Die maakte elke tegel luid, en
//     negen luide tegels naast elkaar zijn samen niet "wow" maar druk.
//     De kleur zit nu in het icoon en in een dunne lijn die pas bij
//     hover oplicht.

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Camera,
  CreditCard,
  GraduationCap,
  Handshake,
  Megaphone,
  Package,
  Palette,
  Scale,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type Partner = {
  id: string;
  name: string;
  tagline: string | null;
  category: string | null;
  url: string | null;
  logo_url: string | null;
  accent: string | null;
};

/** Een icoon bij een categorie, op sleutelwoord. Een categorie die
 *  niets raakt krijgt een gebouw -- "een bedrijf" -- en geen verzonnen
 *  betekenis. */
const ICONEN: [RegExp, LucideIcon][] = [
  [/fulfil|warehouse|opslag|3pl/i, Package],
  [/ship|verzend|logist|deliver/i, Truck],
  [/creat|design|ontwerp|brand/i, Palette],
  [/content|video|foto|photo|ugc/i, Camera],
  [/ads|agency|bureau|market|media/i, Megaphone],
  [/pay|betaal|bank|finance|psp/i, CreditCard],
  [/legal|juridi|tax|belasting|account/i, Scale],
  [/tool|software|saas|app|tech/i, Wrench],
  [/course|coach|academ|train|leer|educ/i, GraduationCap],
];

function icoonVoor(categorie: string | null): LucideIcon {
  const c = categorie ?? "";
  for (const [re, Icon] of ICONEN) if (re.test(c)) return Icon;
  return Building2;
}

const CSS = `
.pdir{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media (min-width:900px){.pdir{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}}
@media (max-width:360px){.pdir{grid-template-columns:1fr}}

.pdir .pt{position:relative;display:flex;flex-direction:column;min-width:0;
  padding:16px 16px 14px;border-radius:18px;text-decoration:none;color:inherit;
  background:var(--panel);border:1px solid var(--line);
  box-shadow:0 1px 2px rgba(15,23,60,.04),0 8px 24px -18px rgba(15,23,60,.25);
  transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .2s,border-color .2s;
  overflow:hidden;isolation:isolate}

/* Een zachte gloed in de hoek, in de eigen kleur van de partner. Bijna
   niet te zien in rust -- hij maakt de tegel af zonder hem luid te maken.
   Bij hover wordt hij sterker, en dat is het moment waarop de tegel
   laat merken dat hij een knop is. */
.pdir .pt::before{content:"";position:absolute;inset:auto -40% -60% auto;
  width:180px;height:180px;border-radius:50%;z-index:-1;
  background:radial-gradient(circle,color-mix(in srgb,var(--acc) 22%,transparent),transparent 70%);
  opacity:.55;transition:opacity .25s}
/* De dunne lijn bovenin: de kleur van de partner, alleen als je hem
   aanwijst. */
.pdir .pt::after{content:"";position:absolute;left:16px;right:16px;top:0;height:2px;
  border-radius:0 0 2px 2px;background:linear-gradient(90deg,var(--acc),#8B5CF6);
  transform:scaleX(0);transform-origin:left;transition:transform .28s cubic-bezier(.2,.8,.2,1)}

.pdir a.pt:hover{transform:translateY(-3px);
  border-color:color-mix(in srgb,var(--acc) 35%,var(--line));
  box-shadow:0 1px 2px rgba(15,23,60,.04),0 22px 40px -22px color-mix(in srgb,var(--acc) 55%,rgba(15,23,60,.4))}
.pdir a.pt:hover::before{opacity:1}
.pdir a.pt:hover::after{transform:scaleX(1)}
.pdir a.pt:focus-visible{outline:2px solid var(--primary);outline-offset:3px}

.pdir .pt-top{display:flex;align-items:center;gap:10px;min-width:0}
.pdir .pt-ic{width:40px;height:40px;border-radius:12px;flex:0 0 auto;
  display:grid;place-items:center;overflow:hidden;
  color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,var(--panel));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--acc) 18%,transparent)}
.pdir .pt-ic svg{width:19px;height:19px}
/* Een logo krijgt een wit vlak, want de meeste logo's zijn voor een
   witte achtergrond gemaakt. */
.pdir .pt-ic.logo{background:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.pdir .pt-ic img{width:100%;height:100%;object-fit:contain;padding:6px}
.pdir .pt-cat{font-size:.62rem;font-weight:800;letter-spacing:.09em;
  text-transform:uppercase;color:var(--faint);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;min-width:0}

/* De naam: EEN regel. Afgekapt met een puntje, nooit afgebroken. */
.pdir .pt-name{margin-top:12px;font-family:var(--hd);font-weight:800;
  font-size:1.02rem;line-height:1.2;letter-spacing:-.015em;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pdir .pt-tag{margin-top:5px;font-size:.8rem;line-height:1.45;color:var(--txt-2);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  min-height:2.9em}

.pdir .pt-foot{margin-top:14px;padding-top:11px;display:flex;align-items:center;
  justify-content:space-between;gap:8px;border-top:1px solid var(--line)}
.pdir .pt-more{display:inline-flex;align-items:center;gap:4px;font-size:.78rem;
  font-weight:700;color:var(--ink)}
.pdir .pt-arrow{width:26px;height:26px;border-radius:9px;display:grid;place-items:center;
  background:var(--panel-2);color:var(--ink);transition:background .2s,color .2s,transform .2s}
.pdir .pt-arrow svg{width:14px;height:14px}
.pdir a.pt:hover .pt-arrow{background:var(--acc);color:#fff;transform:translate(1px,-1px)}

.pdir .skel{border-radius:18px;height:184px;background:var(--panel-2)}

.pdir-note{display:flex;gap:10px;align-items:flex-start;padding:14px;
  border-radius:14px;border:1px solid var(--line);background:var(--panel);
  font-size:.86rem;color:var(--txt-2)}
.pdir-note svg{width:18px;height:18px;flex:0 0 auto;color:var(--faint)}
.pdir-note b{display:block;color:var(--ink);font-family:var(--hd);margin-bottom:2px}

@media (max-width:420px){
  .pdir .pt{padding:14px 13px 12px}
  .pdir .pt-name{font-size:.95rem}
  .pdir .pt-ic{width:36px;height:36px}
}
@media (prefers-reduced-motion:reduce){
  .pdir .pt,.pdir .pt::before,.pdir .pt::after,.pdir .pt-arrow{transition:none}
  .pdir a.pt:hover{transform:none}
}
`;

function Tegel({ p }: { p: Partner }) {
  const { t: tr } = useT();
  const acc = p.accent && /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : "#5B8DFF";
  const Icon = icoonVoor(p.category);
  const inhoud = (
    <>
      <div className="pt-top">
        <span className={`pt-ic${p.logo_url ? " logo" : ""}`}>
          {p.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo_url} alt="" loading="lazy" />
          ) : (
            <Icon />
          )}
        </span>
        {p.category ? <span className="pt-cat">{p.category}</span> : null}
      </div>
      {/* De volledige naam in de title, zodat een afgekapte naam met de
          muis alsnog helemaal te lezen is. */}
      <div className="pt-name" title={p.name}>
        {p.name}
      </div>
      <div className="pt-tag">{p.tagline ?? ""}</div>
      {p.url ? (
        <div className="pt-foot">
          <span className="pt-more">{tr("label.onb.learnMore")}</span>
          <span className="pt-arrow">
            <ArrowUpRight />
          </span>
        </div>
      ) : null}
    </>
  );

  const stijl = { ["--acc" as string]: acc } as React.CSSProperties;

  // Zonder link is het een tegel en geen knop. Een kaart die er
  // klikbaar uitziet en niets doet, is een knop die niets doet.
  return p.url ? (
    <a
      className="pt"
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      style={stijl}
      aria-label={tr("partners.opensInANewTab", { name: String(p.name) })}
    >
      {inhoud}
    </a>
  ) : (
    <div className="pt" style={stijl}>
      {inhoud}
    </div>
  );
}

export default function PartnerDirectory() {
  const { t: tr } = useT();
  const q = useQuery({
    queryKey: ["partners-directory"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("partners")
        .select("id, name, tagline, category, url, logo_url, accent")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Partner[];
    },
  });

  return (
    <div>
      <style>{CSS}</style>
      {q.isPending ? (
        // Dezelfde vorm als wat eraan komt, zodat niets verspringt.
        <div className="pdir" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="pdir-note">
          <AlertTriangle />
          <span>
            <b>{tr("partners.weCouldnTLoadOur")}</b>
            {tr("partners.thatIsNotTheSame")}</span>
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="pdir-note">
          <Handshake />
          <span>
            <b>{tr("partners.noPartnersListedYet")}</b>
            {tr("partners.theCompaniesWeWorkWith")}</span>
        </div>
      ) : (
        <div className="pdir">
          {q.data!.map((p) => (
            <Tegel key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
