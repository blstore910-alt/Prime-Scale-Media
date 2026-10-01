// ── LEKSCAN, IN DE BROWSER VAN EEN KLANT ────────────────────────────
//
// De eigenaar, 01-10: "scan mijn supplier terms door de hele app als non
// admin -- niemand mag het ergens ooit zien." Plak/draai dit in een tab
// waar een KLANT (adverteerder of affiliate) is ingelogd op
// app.primescalemedia.com. Het leest met ZIJN sessie:
//
//   1. elke tabel en view die PostgREST hem laat lezen -- alle rijen, niet
//      alleen wat de app vraagt (de JSON die hij ZOU kunnen ophalen);
//   2. alle JavaScript die de browser geladen heeft.
//
// Het schrijft niets. Uitkomst: per plek welke term, met een stukje
// context. (De schermtekst per scherm loopt Claude apart na.)

(async () => {
  const TERMEN = [
    /rock\s?ads/i, /seam\s?x/i, /falkyn/i, /bestads/i, /muxue/i, /gradyn/i,
    /hk-meta/i, /eu-meta/i, /meta-hk/i, /meta-eu/i, /eu-meta-psm/i,
    /supplier_fee|supplier_cost|we pay|margin/i,
    /\bslash\b/i, /\bHK\b/, /\bGH\b/,
  ];
  // Wat Next.js zelf zegt en geen naam is.
  const NIET = /TrailingSlash|RepeatedSlashes|trailingSlash|addPathSuffix/;

  const scripts = [...new Set(
    [...document.querySelectorAll("script[src]")].map((s) => s.src)
      .concat(performance.getEntriesByType("resource").map((e) => e.name))
      .filter((u) => u.includes("/_next/static/") && /\.js(\?|$)/.test(u)),
  )];
  const bundels = await Promise.all(scripts.map(async (u) => [u, await (await fetch(u)).text()]));

  // De Supabase-URL en de publieke sleutel staan in de bundel; de sessie in de cookie.
  const alles = bundels.map((b) => b[1]).join("\n");
  const url = (alles.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/) || [])[0];
  const key = (alles.match(/sb_publishable_[A-Za-z0-9_-]{20,}/) || alles.match(/eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/) || [])[0];
  const ref = url ? url.slice(8, 28) : "";
  const cookies = Object.fromEntries(document.cookie.split("; ").map((c) => { const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
  let sess = Object.keys(cookies).filter((k) => k.startsWith(`sb-${ref}-auth-token`)).sort().map((k) => cookies[k]).join("");
  if (sess.startsWith("base64-")) sess = atob(sess.slice(7).replace(/-/g, "+").replace(/_/g, "/"));
  let token = "";
  try { token = JSON.parse(sess).access_token; } catch { /* geen sessie */ }
  if (!url || !key || !token) return { fout: "geen supabase-url, sleutel of sessie gevonden", url: !!url, key: !!key, token: !!token };
  const H = { apikey: key, Authorization: `Bearer ${token}` };

  const vondsten = [];
  const zoek = (waar, tekst) => {
    for (const t of TERMEN) {
      const m = tekst.match(new RegExp(t.source, t.flags.includes("i") ? "gi" : "g"));
      if (!m) continue;
      let i = tekst.search(t);
      const ctx = tekst.slice(Math.max(0, i - 60), i + 60);
      if (NIET.test(ctx)) continue;
      vondsten.push({ waar, term: t.source, aantal: m.length, ctx });
    }
  };

  // 1. De data
  const api = await (await fetch(`${url}/rest/v1/`, { headers: H })).json().catch(() => ({}));
  const tabellen = Object.keys(api.definitions || api.components?.schemas || {});
  const gelezen = [];
  for (const t of tabellen) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1000`, { headers: H });
    const body = await r.text();
    let n = 0;
    try { n = JSON.parse(body).length ?? 0; } catch { /* */ }
    if (r.ok && n) gelezen.push(`${t}(${n})`);
    if (r.ok) zoek(`data:${t}`, body);
  }

  // 2. De JavaScript
  for (const [u, t] of bundels) zoek(`js:${u.split("/").pop().split("?")[0]}`, t);

  return { klant: (document.body.innerText.match(/Welcome[^\n]*/) || [""])[0], tabellen_zichtbaar: tabellen.length, met_rijen: gelezen, scripts: scripts.length, vondsten };
})();
