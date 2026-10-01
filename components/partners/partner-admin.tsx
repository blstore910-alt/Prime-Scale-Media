"use client";

// ── DE PARTNERS BEHEREN ─────────────────────────────────────────────
//
// De andere helft van de partnergids. De klant ziet de tegels; hier
// zet de eigenaar ze erin, zonder deploy en zonder mij.
//
// De eigenaar, 01-10: "admin moet ook easy en snel partners kunnen
// toevoegen of verwijderen en een icon toewijzen of logo etc".
//
//   * het VOORBEELD is de echte tegel (PartnerTile), live naast het
//     formulier: wat je typt, ziet de klant -- geen tweede tekening die
//     kan afwijken;
//   * een ICOON kies je uit tegels; een LOGO-link wint van het icoon en
//     staat meteen in het voorbeeld;
//   * HIGHLIGHTS, een BADGE en twee KNOPPEN maken van een tegel een
//     reden om te klikken (plak 181);
//   * VERWIJDEREN met een tweede klik ter bevestiging; UITZETTEN blijft
//     voor wie een partner even weg wil zonder hem kwijt te raken.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deletePartner,
  listPartnersForAdmin,
  savePartner,
  type PartnerRow,
} from "@/actions/partner-actions";
import { AlertTriangle, ExternalLink, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { PARTNER_ICONS, partnerIcon } from "@/lib/partner-icons";
import { PARTNER_CSS, PartnerTile } from "./partner-directory";

const CSS = `
.padm{display:flex;flex-direction:column;gap:16px}
.padm .row{display:flex;align-items:center;gap:12px;padding:12px 14px;
  border-bottom:1px solid var(--line)}
.padm .row:last-child{border-bottom:0}
.padm .card{border:1px solid var(--line);border-radius:14px;background:var(--panel);
  box-shadow:var(--shadow-sm);overflow:hidden}
.padm .mono{width:38px;height:38px;border-radius:11px;flex:0 0 auto;display:grid;
  place-items:center;color:#fff;overflow:hidden}
.padm .mono svg{width:18px;height:18px}
.padm .mono img{width:100%;height:100%;object-fit:contain;background:#fff;padding:4px}
.padm .who{min-width:0;flex:1 1 auto}
.padm .who b{display:block;font-weight:700;color:var(--ink);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.padm .who span{display:block;font-size:.76rem;color:var(--faint);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.padm .off{opacity:.5}
.padm .pill{font:inherit;font-size:.64rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  padding:4px 9px;border-radius:99px;background:var(--panel-2);color:var(--faint);
  flex:0 0 auto;border:0;cursor:pointer}
.padm .pill.on{background:var(--win-soft,#e7f7ef);color:var(--win,#178a55)}
.padm .ghost{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;
  border:1px solid var(--line-2);background:var(--panel);color:var(--txt-2);cursor:pointer;
  flex:0 0 auto}
.padm .ghost:hover{border-color:var(--primary);color:var(--primary-600)}
.padm .ghost.bad:hover,.padm .ghost.sure{border-color:var(--danger);color:var(--danger)}
.padm .ghost.sure{width:auto;padding:0 10px;font:inherit;font-size:.74rem;font-weight:800}
.padm .ghost svg{width:15px;height:15px}
.padm .note{display:flex;gap:9px;padding:12px 14px;border-radius:12px;font-size:.86rem;
  background:var(--warn-soft);color:var(--warn);border:1px solid var(--line-2)}
.padm .note svg{width:16px;height:16px;flex:0 0 auto}
.padm .empty{padding:24px 16px;text-align:center;color:var(--txt-2);font-size:.9rem}

.pedit{display:grid;grid-template-columns:1fr;gap:16px;padding:16px}
@media (min-width:980px){.pedit{grid-template-columns:minmax(0,1fr) 380px;align-items:start}}
.pedit .prev{position:sticky;top:12px;display:flex;flex-direction:column;gap:8px}
.pedit .prev h4,.pform h4{margin:0;font-size:.66rem;font-weight:800;letter-spacing:.08em;
  text-transform:uppercase;color:var(--faint)}

.pform{display:grid;grid-template-columns:1fr;gap:12px}
.pform label{display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:700;
  color:var(--txt-2)}
.pform input,.pform textarea{font:inherit;font-size:.9rem;font-weight:500;padding:9px 11px;
  border:1px solid var(--line-2);border-radius:10px;background:var(--panel);color:var(--ink)}
.pform input:focus,.pform textarea:focus{outline:0;border-color:var(--primary);
  box-shadow:0 0 0 3px var(--primary-tint)}
.pform .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pform .four{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pform .hint{font-weight:500;color:var(--faint);font-size:.72rem}
.pform .chk{flex-direction:row;align-items:center;gap:8px;font-weight:600}
.pform .sec{display:flex;flex-direction:column;gap:10px;padding-top:12px;border-top:1px solid var(--line)}
.pform .icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px}
.pform .icon{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:11px;
  border:1px solid var(--line-2);background:var(--panel);color:var(--txt-2);cursor:pointer;
  font:inherit;font-size:.62rem;font-weight:700}
.pform .icon svg{width:18px;height:18px}
.pform .icon.on{border-color:var(--primary);color:var(--primary-600);background:var(--primary-tint);
  box-shadow:0 0 0 2px var(--primary-tint)}
.pform .acts{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:4px;flex-wrap:wrap}
.pform .acts .sp{flex:1 1 auto}
.pform .btn2{font:inherit;font-weight:700;font-size:.86rem;padding:9px 14px;border-radius:10px;
  cursor:pointer;border:1px solid var(--line-2);background:var(--panel);color:var(--ink)}
.pform .btn2.pri{background:var(--primary);border-color:var(--primary);color:#fff}
.pform .btn2.bad{color:var(--danger)}
.pform .btn2.bad.sure{background:var(--danger);border-color:var(--danger);color:#fff}
.pform .btn2:disabled{opacity:.55;cursor:default}
@media (max-width:480px){.pform .two{grid-template-columns:1fr}}
`;

type Form = {
  id: string | null;
  name: string;
  tagline: string;
  category: string;
  url: string;
  logo_url: string;
  accent: string;
  sort_order: string;
  is_active: boolean;
  icon: string;
  badge: string;
  highlights: string[];
  cta_label: string;
  cta2_label: string;
  cta2_url: string;
  ifUpdatedAt: string | null;
};

const LEEG: Form = {
  id: null,
  name: "",
  tagline: "",
  category: "",
  url: "",
  logo_url: "",
  accent: "#5B8DFF",
  sort_order: "100",
  is_active: true,
  icon: "",
  badge: "",
  highlights: ["", "", "", ""],
  cta_label: "",
  cta2_label: "",
  cta2_url: "",
  ifUpdatedAt: null,
};

function vanRij(p: PartnerRow): Form {
  const hl = [...(p.highlights ?? [])];
  while (hl.length < 4) hl.push("");
  return {
    id: p.id,
    name: p.name,
    tagline: p.tagline ?? "",
    category: p.category ?? "",
    url: p.url ?? "",
    logo_url: p.logo_url ?? "",
    accent: p.accent ?? "#5B8DFF",
    sort_order: String(p.sort_order ?? 100),
    is_active: p.is_active,
    icon: p.icon ?? "",
    badge: p.badge ?? "",
    highlights: hl.slice(0, 4),
    cta_label: p.cta_label ?? "",
    cta2_label: p.cta2_label ?? "",
    cta2_url: p.cta2_url ?? "",
    ifUpdatedAt: p.updated_at,
  };
}

/** De host van een link, of de link zelf. `new URL` GOOIT bij iets
 *  onverwachts, en een throw in een render neemt de hele lijst mee. */
function host(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

function Merk({ p }: { p: { logo_url?: string | null; accent?: string | null; icon?: string | null; category?: string | null } }) {
  const acc = /^#[0-9a-fA-F]{6}$/.test(p.accent ?? "") ? p.accent! : "#5B8DFF";
  const Icon = partnerIcon(p.icon, p.category);
  return (
    <span className="mono" style={{ background: p.logo_url ? undefined : `linear-gradient(135deg,${acc},#8B5CF6)` }}>
      {p.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.logo_url} alt="" />
      ) : (
        <Icon />
      )}
    </span>
  );
}

export default function PartnerAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [zekerWeg, setZekerWeg] = useState<string | null>(null);

  const lijst = useQuery({
    queryKey: ["partners-admin"],
    queryFn: async () => {
      const res = await listPartnersForAdmin();
      if (!res.ok) throw new Error(res.error);
      return res;
    },
  });
  const rijen = lijst.data?.data ?? [];
  const plakNodig = lijst.data?.plakNodig ?? false;

  const vernieuw = () => {
    void qc.invalidateQueries({ queryKey: ["partners-admin"] });
    void qc.invalidateQueries({ queryKey: ["partners-directory"] });
  };

  const opslaan = useMutation({
    mutationFn: async (f: Form) => {
      const res = await savePartner({
        id: f.id,
        name: f.name,
        tagline: f.tagline,
        category: f.category,
        url: f.url,
        logo_url: f.logo_url,
        accent: f.accent,
        sort_order: Number(f.sort_order),
        is_active: f.is_active,
        icon: f.icon || null,
        badge: f.badge,
        highlights: f.highlights,
        cta_label: f.cta_label,
        cta2_label: f.cta2_label,
        cta2_url: f.cta2_url,
        ifUpdatedAt: f.ifUpdatedAt,
      });
      // Een server action zet zijn fout in een 200-antwoord. Zonder deze
      // regel zegt de knop "opgeslagen" boven een weigering.
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      if (d?.plakNodig)
        toast.warning("Saved — but icon, badge, highlights and buttons need plak 181 first. Name, text and link are saved.");
      else if (d?.ingekort) toast.warning("Saved, but the description was cut to 120 characters — run plak 181 to allow 400.");
      else toast.success("Saved");
      setForm(null);
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const aanUit = useMutation({
    mutationFn: async (p: PartnerRow) => {
      const res = await savePartner({ ...vanRijNaarInput(p), is_active: !p.is_active, ifUpdatedAt: p.updated_at });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => vernieuw(),
    onError: (e) => toast.error((e as Error).message),
  });

  const weg = useMutation({
    mutationFn: async (p: { id: string; updated_at: string | null }) => {
      const res = await deletePartner({ id: p.id, ifUpdatedAt: p.updated_at });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Partner removed");
      setZekerWeg(null);
      setForm(null);
      vernieuw();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const zet = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const voorbeeld = form
    ? {
        id: form.id ?? "nieuw",
        name: form.name || "Partner name",
        tagline: form.tagline || null,
        category: form.category || null,
        url: form.url || null,
        logo_url: /^https:\/\//.test(form.logo_url) ? form.logo_url : null,
        accent: form.accent,
        icon: form.icon || null,
        badge: form.badge || null,
        highlights: form.highlights.filter((h) => h.trim()),
        cta_label: form.cta_label || null,
        cta2_label: form.cta2_label || null,
        cta2_url: form.cta2_url || null,
      }
    : null;

  return (
    <div className="psmview padm">
      <style>{CSS}</style>
      <style>{PARTNER_CSS}</style>
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Partners</h1>
          <p>The directory your customers see.</p>
        </div>
        <div className="pacts">
          <button className="btn grad" onClick={() => setForm({ ...LEEG, highlights: ["", "", "", ""] })}>
            <Plus /> <span className="blab">Add partner</span>
          </button>
        </div>
      </div>

      {plakNodig ? (
        <div className="note">
          <AlertTriangle />
          <span>
            <b>Plak 181 has not run yet.</b> Icons, badges, highlights and the second button are saved once it has;
            until then a tile shows name, category, description and one button.
          </span>
        </div>
      ) : null}

      {form && voorbeeld ? (
        <div className="card">
          <div className="pedit">
            <div className="pform">
              <h4>{form.id ? "Edit partner" : "New partner"}</h4>
              <div className="two">
                <label>
                  Name
                  <input value={form.name} maxLength={80} onChange={(e) => zet("name", e.target.value)} placeholder="Prime Scale Fulfillment" />
                </label>
                <label>
                  Category
                  <input value={form.category} maxLength={40} onChange={(e) => zet("category", e.target.value)} placeholder="Fulfillment" />
                </label>
              </div>
              <label>
                Description
                <textarea
                  value={form.tagline}
                  maxLength={400}
                  rows={4}
                  onChange={(e) => zet("tagline", e.target.value)}
                  placeholder="What they do, for whom, and why a PSM customer would call them."
                />
                <span className="hint">{form.tagline.length}/400 — shown in full on the tile.</span>
              </label>

              <div className="sec">
                <h4>Icon or logo</h4>
                <div className="icons">
                  <button type="button" className={`icon${!form.icon ? " on" : ""}`} onClick={() => zet("icon", "")}>
                    <Wand2 />
                    Auto
                  </button>
                  {PARTNER_ICONS.map(({ key, label, Icon }) => (
                    <button
                      type="button"
                      key={key}
                      className={`icon${form.icon === key ? " on" : ""}`}
                      onClick={() => zet("icon", key)}
                    >
                      <Icon />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="two">
                  <label>
                    Logo link (optional — wins over the icon)
                    <input value={form.logo_url} onChange={(e) => zet("logo_url", e.target.value)} placeholder="https://…/logo.png" />
                  </label>
                  <label>
                    Colour
                    <input
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(form.accent) ? form.accent : "#5B8DFF"}
                      onChange={(e) => zet("accent", e.target.value)}
                      style={{ height: 40, padding: 4 }}
                    />
                  </label>
                </div>
              </div>

              <div className="sec">
                <h4>Why click — highlights and badge</h4>
                <div className="four">
                  {form.highlights.map((h, i) => (
                    <input
                      key={i}
                      value={h}
                      maxLength={40}
                      placeholder={["Shopify app", "100% QC", "6-10 day delivery", "No setup fees"][i]}
                      onChange={(e) =>
                        zet(
                          "highlights",
                          form.highlights.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                  ))}
                </div>
                <label>
                  Badge (optional)
                  <input value={form.badge} maxLength={30} onChange={(e) => zet("badge", e.target.value)} placeholder="Live in 24h" />
                </label>
              </div>

              <div className="sec">
                <h4>Buttons</h4>
                <div className="two">
                  <label>
                    Main button text
                    <input value={form.cta_label} maxLength={30} onChange={(e) => zet("cta_label", e.target.value)} placeholder="Learn more" />
                  </label>
                  <label>
                    Main button link
                    <input value={form.url} onChange={(e) => zet("url", e.target.value)} placeholder="https://…" />
                  </label>
                </div>
                <div className="two">
                  <label>
                    Second button text (optional)
                    <input value={form.cta2_label} maxLength={30} onChange={(e) => zet("cta2_label", e.target.value)} placeholder="Shopify app" />
                  </label>
                  <label>
                    Second button link
                    <input value={form.cta2_url} onChange={(e) => zet("cta2_url", e.target.value)} placeholder="https://apps.shopify.com/…" />
                  </label>
                </div>
                <span className="hint">Links must start with https:// — they open on a customer&apos;s phone.</span>
              </div>

              <div className="sec">
                <div className="two">
                  <label>
                    Order
                    <input type="number" value={form.sort_order} onChange={(e) => zet("sort_order", e.target.value)} />
                    <span className="hint">Lower comes first.</span>
                  </label>
                  <label className="chk" style={{ alignSelf: "center" }}>
                    <input type="checkbox" checked={form.is_active} onChange={(e) => zet("is_active", e.target.checked)} />
                    Show to customers
                  </label>
                </div>
              </div>

              <div className="acts">
                {form.id ? (
                  <button
                    className={`btn2 bad${zekerWeg === form.id ? " sure" : ""}`}
                    disabled={weg.isPending}
                    onClick={() =>
                      zekerWeg === form.id
                        ? weg.mutate({ id: form.id!, updated_at: form.ifUpdatedAt })
                        : setZekerWeg(form.id)
                    }
                  >
                    {weg.isPending ? "Removing…" : zekerWeg === form.id ? "Sure? Remove for good" : "Remove"}
                  </button>
                ) : null}
                <span className="sp" />
                <button className="btn2" onClick={() => { setForm(null); setZekerWeg(null); }} disabled={opslaan.isPending}>
                  Cancel
                </button>
                <button className="btn2 pri" onClick={() => opslaan.mutate(form)} disabled={opslaan.isPending || !form.name.trim()}>
                  {opslaan.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>

            <div className="prev">
              <h4>What customers see</h4>
              <PartnerTile p={voorbeeld} />
            </div>
          </div>
        </div>
      ) : null}

      {lijst.isError ? (
        <div className="note">
          <AlertTriangle />
          <span>
            <b>The partners could not be read.</b> This is not an empty list. {(lijst.error as Error).message}
          </span>
        </div>
      ) : null}

      <div className="card">
        {lijst.isPending ? (
          <div className="empty">Loading…</div>
        ) : rijen.length === 0 && !lijst.isError ? (
          <div className="empty">No partners yet. Add the first one above.</div>
        ) : (
          rijen.map((p) => (
            <div key={p.id} className={`row${p.is_active ? "" : " off"}`}>
              <Merk p={p} />
              <div className="who">
                <b>{p.name}</b>
                <span>{[p.category, p.url ? host(p.url) : "no link"].filter(Boolean).join(" · ")}</span>
              </div>
              {/* Een klik zet hem aan of uit -- de snelle weg, zonder het
                  formulier te openen. */}
              <button
                className={`pill${p.is_active ? " on" : ""}`}
                disabled={aanUit.isPending}
                onClick={() => aanUit.mutate(p)}
                title={p.is_active ? "Click to hide from customers" : "Click to show to customers"}
              >
                {p.is_active ? "Shown" : "Hidden"}
              </button>
              {p.url ? (
                <a className="ghost" href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Open link">
                  <ExternalLink />
                </a>
              ) : null}
              <button className="ghost" onClick={() => { setForm(vanRij(p)); setZekerWeg(null); }} aria-label={`Edit ${p.name}`}>
                <Pencil />
              </button>
              <button
                className={`ghost bad${zekerWeg === p.id ? " sure" : ""}`}
                disabled={weg.isPending}
                onClick={() => (zekerWeg === p.id ? weg.mutate({ id: p.id, updated_at: p.updated_at }) : setZekerWeg(p.id))}
                aria-label={`Remove ${p.name}`}
              >
                {zekerWeg === p.id ? "Sure?" : <Trash2 />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Een bestaande rij terug als invoer, voor de snelle aan/uit-knop. */
function vanRijNaarInput(p: PartnerRow) {
  return {
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    category: p.category,
    url: p.url,
    logo_url: p.logo_url,
    accent: p.accent,
    sort_order: p.sort_order,
    highlights: p.highlights ?? null,
    icon: p.icon ?? null,
    badge: p.badge ?? null,
    cta_label: p.cta_label ?? null,
    cta2_label: p.cta2_label ?? null,
    cta2_url: p.cta2_url ?? null,
  };
}
