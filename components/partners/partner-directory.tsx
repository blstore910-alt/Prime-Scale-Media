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
/* ── DE DERDE RONDE ─────────────────────────────────────────────────
   De eigenaar, 01-10, op een tegel van 170px breed met "Prime Scale
   Fulfill..." en een afgekapte zin: "moet volledig leesbaar en meer
   description en nog steeds geen super wow effect".

   Dus: op een telefoon EEN tegel per rij (twee naast elkaar liet de
   naam nooit heel), de naam mag twee regels, de beschrijving staat er
   helemaal. En het wow zit in een kop met een zachte kleurwolk in de
   kleur van de partner, een zwevend glazen icoon, en een rand die bij
   hover in kleur oplicht. */
.pdir{display:grid;grid-template-columns:1fr;gap:14px}
@media (min-width:640px){.pdir{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}}
@media (min-width:1100px){.pdir{grid-template-columns:repeat(3,minmax(0,1fr))}}

.pdir .pt{position:relative;display:flex;flex-direction:column;min-width:0;
  border-radius:22px;text-decoration:none;color:inherit;overflow:hidden;isolation:isolate;
  border:1px solid transparent;
  background:
    linear-gradient(var(--panel),var(--panel)) padding-box,
    linear-gradient(135deg,color-mix(in srgb,var(--acc) 30%,var(--line)),var(--line) 45%,var(--line) 60%,color-mix(in srgb,#8B5CF6 26%,var(--line))) border-box;
  box-shadow:0 1px 2px rgba(15,23,60,.05),0 18px 40px -26px color-mix(in srgb,var(--acc) 45%,rgba(15,23,60,.35));
  transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s}
.pdir a.pt:hover{transform:translateY(-4px);
  background:
    linear-gradient(var(--panel),var(--panel)) padding-box,
    linear-gradient(135deg,var(--acc),#8B5CF6) border-box;
  box-shadow:0 1px 2px rgba(15,23,60,.05),0 30px 60px -28px color-mix(in srgb,var(--acc) 70%,rgba(15,23,60,.45))}
.pdir a.pt:focus-visible{outline:2px solid var(--primary);outline-offset:3px}

/* De kop: een kleurwolk, een fijn stippenraster, en een glans die bij
   hover een keer overheen trekt. */
/* Donker, in de huisstijl van het logo: navy met een gloed in de kleur
   van de partner en paars. Een bleke kop las als een lege tegel. */
.pdir .pt-hero{position:relative;height:112px;overflow:hidden;
  background:
    radial-gradient(90% 130% at 12% 0%,color-mix(in srgb,var(--acc) 80%,transparent),transparent 62%),
    radial-gradient(90% 130% at 100% 20%,rgba(139,92,246,.75),transparent 60%),
    linear-gradient(135deg,#070a1f,#141a46)}
.pdir .pt-hero::before{content:"";position:absolute;inset:0;opacity:.5;
  background-image:radial-gradient(rgba(255,255,255,.35) 1px,transparent 1.3px);
  background-size:14px 14px;
  -webkit-mask-image:radial-gradient(120% 100% at 80% 0%,#000,transparent 75%);
  mask-image:radial-gradient(120% 100% at 80% 0%,#000,transparent 75%)}
.pdir .pt-hero::after{content:"";position:absolute;top:0;bottom:0;width:45%;left:-60%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);
  transform:skewX(-18deg);transition:left .7s cubic-bezier(.2,.8,.2,1)}
.pdir a.pt:hover .pt-hero::after{left:120%}
.pdir .pt-cat{position:absolute;top:14px;left:16px;max-width:calc(100% - 32px);
  font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;
  padding:5px 10px;border-radius:99px;color:#fff;
  background:rgba(255,255,255,.12);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* Het icoon zweeft op de rand tussen kop en tekst. */
.pdir .pt-ic{position:absolute;left:16px;top:84px;z-index:1;width:56px;height:56px;border-radius:18px;
  display:grid;place-items:center;overflow:hidden;color:#fff;
  background:linear-gradient(135deg,var(--acc),#8B5CF6);
  box-shadow:0 0 0 4px var(--panel),0 12px 26px -10px color-mix(in srgb,var(--acc) 85%,transparent);
  transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.pdir a.pt:hover .pt-ic{transform:translateY(-3px) rotate(-4deg)}
.pdir .pt-ic svg{width:26px;height:26px}
.pdir .pt-ic.logo{background:#fff}
.pdir .pt-ic img{width:100%;height:100%;object-fit:contain;padding:8px}

.pdir .pt-body{display:flex;flex-direction:column;flex:1 1 auto;padding:40px 18px 18px}
/* De naam HEEL: tot twee regels, nooit afgekapt midden in een woord. */
.pdir .pt-name{font-family:var(--hd);font-weight:800;font-size:1.18rem;line-height:1.2;
  letter-spacing:-.02em;color:var(--ink);overflow-wrap:anywhere}
.pdir .pt-host{margin-top:3px;font-size:.74rem;font-weight:600;color:var(--faint)}
.pdir .pt-tag{margin-top:10px;font-size:.88rem;line-height:1.55;color:var(--txt-2);
  white-space:pre-line}

.pdir .pt-foot{margin-top:auto;padding-top:16px}
.pdir .pt-cta{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:11px 12px 11px 16px;border-radius:14px;font-size:.86rem;font-weight:800;color:var(--ink);
  background:color-mix(in srgb,var(--acc) 8%,var(--panel-2));
  box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--acc) 16%,transparent);
  transition:background .25s,color .25s,box-shadow .25s}
.pdir .pt-arrow{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;
  background:var(--panel);color:var(--ink);transition:transform .25s,background .25s,color .25s}
.pdir .pt-arrow svg{width:16px;height:16px}
.pdir a.pt:hover .pt-cta{color:#fff;background:linear-gradient(135deg,var(--acc),#8B5CF6);box-shadow:none}
.pdir a.pt:hover .pt-arrow{background:rgba(255,255,255,.2);color:#fff;transform:translate(2px,-2px)}

.pdir .skel{border-radius:22px;height:280px;background:var(--panel-2)}

.pdir-note{display:flex;gap:10px;align-items:flex-start;padding:14px;
  border-radius:14px;border:1px solid var(--line);background:var(--panel);
  font-size:.86rem;color:var(--txt-2)}
.pdir-note svg{width:18px;height:18px;flex:0 0 auto;color:var(--faint)}
.pdir-note b{display:block;color:var(--ink);font-family:var(--hd);margin-bottom:2px}

@media (prefers-reduced-motion:reduce){
  .pdir .pt,.pdir .pt-ic,.pdir .pt-cta,.pdir .pt-arrow,.pdir .pt-hero::after{transition:none}
  .pdir a.pt:hover{transform:none}
  .pdir a.pt:hover .pt-ic{transform:none}
}
`;

function Tegel({ p }: { p: Partner }) {
  const { t: tr } = useT();
  const acc = p.accent && /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : "#5B8DFF";
  const Icon = icoonVoor(p.category);
  // Het domein onder de naam: zo ziet een klant waar de link heen gaat
  // voordat hij drukt.
  let host: string | null = null;
  try {
    host = p.url ? new URL(p.url).hostname.replace(/^www[.]/, "") : null;
  } catch {
    host = null;
  }
  const inhoud = (
    <>
      <div className="pt-hero" aria-hidden>
        {p.category ? <span className="pt-cat">{p.category}</span> : null}
      </div>
      <span className={`pt-ic${p.logo_url ? " logo" : ""}`}>
        {p.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo_url} alt="" loading="lazy" />
        ) : (
          <Icon />
        )}
      </span>
      <div className="pt-body">
        <div className="pt-name">{p.name}</div>
        {host ? <div className="pt-host">{host}</div> : null}
        {p.tagline ? <div className="pt-tag">{p.tagline}</div> : null}
        {p.url ? (
          <div className="pt-foot">
            <span className="pt-cta">
              {tr("label.onb.learnMore")}
              <span className="pt-arrow">
                <ArrowUpRight />
              </span>
            </span>
          </div>
        ) : null}
      </div>
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
