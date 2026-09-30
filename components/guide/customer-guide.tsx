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
import { ChevronDown } from "lucide-react";
import {
  CUSTOMER_GUIDES,
  type Note,
  type Section,
} from "@/components/admin/manual-content";

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
`;

function Hoofdstuk({
  s,
  open,
  onToggle,
}: {
  s: Section;
  open: boolean;
  onToggle: () => void;
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
          <b>{s.title}</b>
          {/* Het PAD, zodat de lezer weet waar hij moet drukken zonder
              het hele hoofdstuk te lezen. */}
          <span>{s.path}</span>
        </span>
        <ChevronDown className="cg-chev" />
      </button>
      {open ? (
        <div className="cg-body">
          <p className="cg-intro">{s.intro}</p>
          <ol>
            {s.steps.map((st, i) => (
              <li key={i}>{st}</li>
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
                  <b>{n.label}</b>
                  {n.text}
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
  const guide = CUSTOMER_GUIDES[audience];
  // Eén tegelijk open. Twee uitgeklapte hoofdstukken onder elkaar zijn
  // op een telefoon weer de muur tekst die dit moest vermijden.
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="cguide">
      <style>{CSS}</style>
      {guide.sections.map((s) => (
        <Hoofdstuk
          key={s.id}
          s={s}
          open={open === s.id}
          onToggle={() => setOpen((cur) => (cur === s.id ? null : s.id))}
        />
      ))}
    </div>
  );
}

/** De kop en inleiding, los, zodat elke app hem in zijn eigen kaartkop
 *  kan zetten in plaats van dat deze component hem opdringt. */
export function customerGuideHeading(audience: "advertiser" | "affiliate") {
  const g = CUSTOMER_GUIDES[audience];
  return { heading: g.heading, lead: g.lead };
}
