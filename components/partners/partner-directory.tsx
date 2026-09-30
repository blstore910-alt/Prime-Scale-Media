"use client";

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
// ── WAAROM EEN MONOGRAM ALS ER GEEN LOGO IS ───────────────────────
//
// Een lege tegel met alleen een naam leest als een tegel die niet
// laadde. Een vlak in de eigen kleur van de partner met zijn
// beginletter is af, ook zonder logo -- en de meeste partners zullen
// in het begin geen logo-URL hebben.

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, ArrowUpRight, Handshake } from "lucide-react";

type Partner = {
  id: string;
  name: string;
  tagline: string | null;
  category: string | null;
  url: string | null;
  logo_url: string | null;
  accent: string | null;
};

const CSS = `
.pdir{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media (min-width:900px){.pdir{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:360px){.pdir{grid-template-columns:1fr}}

.pdir .pt{position:relative;display:flex;flex-direction:column;
  min-width:0;border-radius:18px;overflow:hidden;text-decoration:none;
  color:inherit;background:var(--panel);border:1px solid var(--line);
  box-shadow:0 1px 2px rgba(20,30,80,.05);
  transition:transform .18s ease,box-shadow .18s ease,border-color .18s}
.pdir a.pt:hover{transform:translateY(-3px);border-color:transparent;
  box-shadow:0 18px 36px -18px rgba(40,60,140,.45)}
.pdir a.pt:focus-visible{outline:2px solid var(--primary);outline-offset:2px}

/* De kleurband bovenin: de eigen kleur van de partner, verlopend naar
   het merkpaars. Dat is wat een rij tegels een rij MERKEN maakt in
   plaats van een rij witte vakjes. */
.pdir .pt-band{height:64px;position:relative;
  background:linear-gradient(135deg,var(--acc),#8B5CF6)}
.pdir .pt-band::after{content:"";position:absolute;inset:0;
  background:radial-gradient(circle at 85% -20%,rgba(255,255,255,.45),transparent 55%)}

/* Het merk zelf, half over de band heen -- zo hoort het bij allebei. */
.pdir .pt-mark{position:absolute;left:14px;top:34px;width:52px;height:52px;
  border-radius:15px;background:var(--panel);display:grid;place-items:center;
  box-shadow:0 6px 16px -6px rgba(20,30,80,.35);overflow:hidden;z-index:1}
.pdir .pt-mark img{width:100%;height:100%;object-fit:contain;padding:7px}
.pdir .pt-mark b{font-family:var(--hd);font-weight:800;font-size:1.35rem;
  color:var(--acc)}

.pdir .pt-body{padding:30px 14px 14px;display:flex;flex-direction:column;
  gap:6px;flex:1 1 auto;min-width:0}
.pdir .pt-cat{align-self:flex-start;font-size:.62rem;font-weight:800;
  letter-spacing:.08em;text-transform:uppercase;color:var(--acc);
  background:color-mix(in srgb,var(--acc) 12%,transparent);
  padding:3px 8px;border-radius:99px}
.pdir .pt-name{font-family:var(--hd);font-weight:800;font-size:1rem;
  color:var(--ink);line-height:1.2;letter-spacing:-.01em}
.pdir .pt-tag{font-size:.8rem;color:var(--txt-2);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;
  overflow:hidden}
.pdir .pt-more{margin-top:auto;padding-top:8px;display:inline-flex;
  align-items:center;gap:4px;font-size:.78rem;font-weight:700;
  color:var(--primary-600,#3a63d8)}
.pdir .pt-more svg{width:14px;height:14px;transition:transform .18s}
.pdir a.pt:hover .pt-more svg{transform:translate(2px,-2px)}

.pdir .skel{border-radius:18px;height:196px;background:var(--panel-2)}

.pdir-note{display:flex;gap:10px;align-items:flex-start;padding:14px;
  border-radius:14px;border:1px solid var(--line);background:var(--panel);
  font-size:.86rem;color:var(--txt-2)}
.pdir-note svg{width:18px;height:18px;flex:0 0 auto;color:var(--faint)}
.pdir-note b{display:block;color:var(--ink);font-family:var(--hd);
  margin-bottom:2px}

@media (prefers-reduced-motion:reduce){
  .pdir .pt,.pdir .pt-more svg{transition:none}
  .pdir a.pt:hover{transform:none}
}
`;

/** De beginletter van een naam, voor het monogram. */
function letter(naam: string) {
  const c = naam.trim().charAt(0);
  return c ? c.toUpperCase() : "·";
}

function Tegel({ p }: { p: Partner }) {
  const acc = p.accent && /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : "#5B8DFF";
  const inhoud = (
    <>
      <div className="pt-band" />
      <div className="pt-mark">
        {p.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logo_url} alt="" loading="lazy" />
        ) : (
          <b>{letter(p.name)}</b>
        )}
      </div>
      <div className="pt-body">
        {p.category ? <span className="pt-cat">{p.category}</span> : null}
        <span className="pt-name">{p.name}</span>
        {p.tagline ? <span className="pt-tag">{p.tagline}</span> : null}
        {p.url ? (
          <span className="pt-more">
            Learn more <ArrowUpRight />
          </span>
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
      aria-label={`${p.name} — opens in a new tab`}
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
            <b>We couldn&apos;t load our partners.</b>
            That is not the same as there being none — try again in a moment.
          </span>
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="pdir-note">
          <Handshake />
          <span>
            <b>No partners listed yet.</b>
            The companies we work with will appear here.
          </span>
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
