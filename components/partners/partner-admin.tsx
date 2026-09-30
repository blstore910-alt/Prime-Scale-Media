"use client";

// ── DE PARTNERS BEHEREN ─────────────────────────────────────────────
//
// De andere helft van de partnergids. De klant ziet de tegels; hier
// zet de eigenaar ze erin, zonder deploy en zonder mij.
//
// ── WAT HIER BEWUST NIET KAN ──────────────────────────────────────
//
// Wissen. Een partner gaat UIT en blijft terug te zetten -- zie
// actions/partner-actions.ts. Een weggeklikte partner met de verkeerde
// link is met één klik hersteld; een gewiste niet.
//
// ── HET VOORBEELD STAAT ERNAAST ───────────────────────────────────
//
// Wie een tegel invult ziet meteen hoe hij bij de klant uitvalt: de
// accentkleur, het monogram als er geen logo is, de lengte van de
// ondertitel. Een formulier dat pas na opslaan laat zien dat de
// ondertitel na drie regels wordt afgekapt, laat je twee keer werken.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listPartnersForAdmin,
  savePartner,
  type PartnerRow,
} from "@/actions/partner-actions";
import { AlertTriangle, ExternalLink, Pencil, Plus } from "lucide-react";

const CSS = `
.padm{display:flex;flex-direction:column;gap:16px}
.padm .phead h1{margin:0;font-family:var(--hd);font-weight:800;font-size:1.35rem;
  letter-spacing:-.02em;color:var(--ink)}
.padm .phead p{margin:4px 0 0;color:var(--txt-2);font-size:.9rem}
.padm .row{display:flex;align-items:center;gap:12px;padding:12px 14px;
  border-bottom:1px solid var(--line)}
.padm .row:last-child{border-bottom:0}
.padm .card{border:1px solid var(--line);border-radius:14px;background:var(--panel);
  box-shadow:var(--shadow-sm);overflow:hidden}
.padm .mono{width:38px;height:38px;border-radius:11px;flex:0 0 auto;display:grid;
  place-items:center;font-family:var(--hd);font-weight:800;color:#fff;overflow:hidden}
.padm .mono img{width:100%;height:100%;object-fit:contain;background:#fff;padding:4px}
.padm .who{min-width:0;flex:1 1 auto}
.padm .who b{display:block;font-weight:700;color:var(--ink);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.padm .who span{display:block;font-size:.76rem;color:var(--faint);white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.padm .off{opacity:.5}
.padm .pill{font-size:.64rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  padding:3px 8px;border-radius:99px;background:var(--panel-2);color:var(--faint);
  flex:0 0 auto}
.padm .pill.on{background:var(--win-soft,#e7f7ef);color:var(--win,#178a55)}
.padm .ghost{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;
  border:1px solid var(--line-2);background:var(--panel);color:var(--txt-2);cursor:pointer;
  flex:0 0 auto}
.padm .ghost:hover{border-color:var(--primary);color:var(--primary-600)}
.padm .ghost svg{width:15px;height:15px}
.padm .note{display:flex;gap:9px;padding:12px 14px;border-radius:12px;font-size:.86rem;
  background:var(--warn-soft);color:var(--warn);border:1px solid var(--line-2)}
.padm .note svg{width:16px;height:16px;flex:0 0 auto}
.padm .empty{padding:24px 16px;text-align:center;color:var(--txt-2);font-size:.9rem}

.pform{display:grid;grid-template-columns:1fr;gap:12px}
.pform label{display:flex;flex-direction:column;gap:5px;font-size:.78rem;font-weight:700;
  color:var(--txt-2)}
.pform input,.pform textarea{font:inherit;font-size:.9rem;font-weight:500;padding:9px 11px;
  border:1px solid var(--line-2);border-radius:10px;background:var(--panel);color:var(--ink)}
.pform input:focus,.pform textarea:focus{outline:0;border-color:var(--primary);
  box-shadow:0 0 0 3px var(--primary-tint)}
.pform .two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pform .hint{font-weight:500;color:var(--faint);font-size:.72rem}
.pform .chk{flex-direction:row;align-items:center;gap:8px;font-weight:600}
.pform .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.pform .btn2{font:inherit;font-weight:700;font-size:.86rem;padding:9px 14px;border-radius:10px;
  cursor:pointer;border:1px solid var(--line-2);background:var(--panel);color:var(--ink)}
.pform .btn2.pri{background:var(--primary);border-color:var(--primary);color:#fff}
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
  ifUpdatedAt: null,
};

function vanRij(p: PartnerRow): Form {
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
    ifUpdatedAt: p.updated_at,
  };
}

/** De host van een link, of de link zelf. `new URL` GOOIT bij iets
 *  onverwachts, en een throw in een render neemt de hele lijst mee --
 *  een rare link bij een partner mag de andere niet onzichtbaar maken. */
function host(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

function Monogram({ naam, logo, accent }: { naam: string; logo: string; accent: string }) {
  const acc = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#5B8DFF";
  return (
    <span className="mono" style={{ background: logo ? undefined : acc }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" />
      ) : (
        (naam.trim().charAt(0) || "·").toUpperCase()
      )}
    </span>
  );
}

export default function PartnerAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);

  const lijst = useQuery({
    queryKey: ["partners-admin"],
    queryFn: async () => {
      const res = await listPartnersForAdmin();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

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
        ifUpdatedAt: f.ifUpdatedAt,
      });
      // Een server action zet zijn fout in een 200-antwoord. Zonder deze
      // regel zegt de knop "opgeslagen" boven een weigering.
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Saved");
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["partners-admin"] });
      void qc.invalidateQueries({ queryKey: ["partners-directory"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const zet = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="psmview padm">
      <style>{CSS}</style>
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Partners</h1>
          <p>The directory your customers see.</p>
        </div>
        <div className="pacts">
          <button className="btn grad" onClick={() => setForm({ ...LEEG })}>
            <Plus /> <span className="blab">Add partner</span>
          </button>
        </div>
      </div>

      {form ? (
        <div className="card" style={{ padding: 16 }}>
          <div className="pform">
            <div className="row" style={{ padding: 0, border: 0 }}>
              <Monogram naam={form.name || "?"} logo={form.logo_url} accent={form.accent} />
              <div className="who">
                <b>{form.name || "New partner"}</b>
                <span>{form.tagline || "One line under the name"}</span>
              </div>
            </div>
            <label>
              Name
              <input
                value={form.name}
                maxLength={80}
                onChange={(e) => zet("name", e.target.value)}
                placeholder="Prime Scale Fulfillment"
              />
            </label>
            <label>
              One line about them
              <input
                value={form.tagline}
                maxLength={120}
                onChange={(e) => zet("tagline", e.target.value)}
                placeholder="Storage, pick-and-pack and shipping for your store."
              />
              <span className="hint">{form.tagline.length}/120 — the tile shows three lines at most.</span>
            </label>
            <div className="two">
              <label>
                Category
                <input
                  value={form.category}
                  maxLength={40}
                  onChange={(e) => zet("category", e.target.value)}
                  placeholder="Fulfillment"
                />
              </label>
              <label>
                Order
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => zet("sort_order", e.target.value)}
                />
                <span className="hint">Lower comes first.</span>
              </label>
            </div>
            <label>
              Link to our page about them
              <input
                value={form.url}
                onChange={(e) => zet("url", e.target.value)}
                placeholder="https://primescalemedia.com/partners/…"
              />
              <span className="hint">Must start with https:// — it opens on a customer&apos;s phone.</span>
            </label>
            <div className="two">
              <label>
                Logo link (optional)
                <input
                  value={form.logo_url}
                  onChange={(e) => zet("logo_url", e.target.value)}
                  placeholder="https://…/logo.png"
                />
                <span className="hint">Without one, the tile shows their initial.</span>
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
            <label className="chk">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => zet("is_active", e.target.checked)}
              />
              Show to customers
            </label>
            <div className="acts">
              <button className="btn2" onClick={() => setForm(null)} disabled={opslaan.isPending}>
                Cancel
              </button>
              <button
                className="btn2 pri"
                onClick={() => opslaan.mutate(form)}
                disabled={opslaan.isPending || !form.name.trim()}
              >
                {opslaan.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lijst.isError ? (
        <div className="note">
          <AlertTriangle />
          <span>
            <b>The partners could not be read.</b> This is not an empty list.{" "}
            {(lijst.error as Error).message}
          </span>
        </div>
      ) : null}

      <div className="card">
        {lijst.isPending ? (
          <div className="empty">Loading…</div>
        ) : (lijst.data ?? []).length === 0 && !lijst.isError ? (
          <div className="empty">No partners yet. Add the first one above.</div>
        ) : (
          (lijst.data ?? []).map((p) => (
            <div key={p.id} className={`row${p.is_active ? "" : " off"}`}>
              <Monogram naam={p.name} logo={p.logo_url ?? ""} accent={p.accent ?? ""} />
              <div className="who">
                <b>{p.name}</b>
                <span>
                  {[p.category, p.url ? host(p.url) : "no link"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <span className={`pill${p.is_active ? " on" : ""}`}>
                {p.is_active ? "Shown" : "Hidden"}
              </span>
              {p.url ? (
                <a className="ghost" href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Open link">
                  <ExternalLink />
                </a>
              ) : null}
              <button className="ghost" onClick={() => setForm(vanRij(p))} aria-label={`Edit ${p.name}`}>
                <Pencil />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
