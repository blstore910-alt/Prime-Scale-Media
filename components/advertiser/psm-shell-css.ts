// Scoped port of the approved advertiser mockup (advertiser-app.html).
// Every selector is prefixed with .psmapp so it only affects the ported
// advertiser area and never leaks into the rest of the app.
export const PSM_APP_CSS = `
.psmapp{
  --ground:#f4f6fc;--panel:#fff;--panel-2:#f1f4fb;--ink:#12162a;--muted:#5c6577;--faint:#8b93a6;
  --line:#e6e9f2;--line-2:#d8ddec;--primary:#3a6fff;--primary-600:#2f5ae6;--primary-tint:#eaf1ff;
  --blue:#5B8DFF;--purple:#8B5CF6;--navy1:#04050E;--navy2:#0c1230;--navy3:#0f172a;
  --win:#10b981;--win-soft:#daf5ec;--warn:#e08a00;--warn-soft:#fdeecb;--danger:#e5484d;--danger-soft:#fdecec;
  --gold:#efb02c;--gold-soft:#fdeecb;--teal:#0e93a6;
  --hd:var(--font-jakarta),system-ui,sans-serif;--bd:var(--font-dmsans),system-ui,sans-serif;
  --brand:linear-gradient(135deg,#5B8DFF,#8B5CF6);
  --shadow-sm:0 10px 26px -20px rgba(20,30,80,.5);--shadow:0 24px 54px -28px rgba(20,30,80,.4);--sidebar:256px;
  min-height:100vh;background:var(--ground);color:var(--ink);font-family:var(--bd);line-height:1.55;
  -webkit-font-smoothing:antialiased;display:flex;
}
.psmapp *{box-sizing:border-box}
/* Element rules apply only inside a ported view (.psmview) or the shell
   chrome, never to not-yet-ported page content rendered as children. */
.psmapp .psmview svg,.psmapp .sidebar svg,.psmapp .topbar svg,.psmapp .bottombar svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
.psmapp .psmview a{text-decoration:none;color:inherit}
.psmapp .psmview h1,.psmapp .psmview h2{margin:0}
.psmapp .psmview h2,.psmapp .phead h2{font-family:var(--hd);font-weight:800;font-size:1.12rem;letter-spacing:-.02em}
.psmapp .pfi svg{width:19px;height:19px}
.psmapp .cap{color:var(--muted);font-size:.9rem;margin:6px 0 16px}
.psmapp .grad{background:var(--brand);-webkit-background-clip:text;background-clip:text;color:transparent}
.psmapp .mono{font-family:ui-monospace,Menlo,monospace}

.psmapp .sidebar{width:var(--sidebar);flex:0 0 auto;background:var(--panel);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column;gap:3px;position:sticky;top:0;height:100vh;overflow-y:auto;overflow-x:hidden}
.psmapp .logo{display:flex;align-items:center;gap:11px;padding:6px 8px 18px}
.psmapp .mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#fff;flex:0 0 auto;background:linear-gradient(135deg,var(--navy1),var(--navy2),var(--navy3));box-shadow:0 0 22px rgba(91,141,255,.4),0 0 0 1px rgba(91,141,255,.28)}
.psmapp .mark svg{width:20px;height:20px;stroke:#fff}
.psmapp .logo .name{font-family:var(--hd);font-weight:800;letter-spacing:-.025em;font-size:.98rem;line-height:1.1}
.psmapp .logo .name small{display:block;font-weight:700;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:3px}
.psmapp .navsec{font-size:.64rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding:14px 12px 6px}
.psmapp .navlink{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;font-weight:600;font-size:.92rem;color:var(--muted);cursor:pointer;transition:.14s;border:0;background:none;width:100%;text-align:left;font-family:var(--bd)}
.psmapp .navlink:hover{background:var(--panel-2);color:var(--ink)}
.psmapp .navlink.on{background:var(--primary-tint);color:var(--primary-600)}
.psmapp .navlink svg{width:19px;height:19px}
.psmapp .navlink .n{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:var(--primary);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center}
.psmapp .navlink.aff{color:var(--purple)}.psmapp .navlink.aff svg{color:var(--purple)}.psmapp .navlink .n.new{background:var(--purple)}
.psmapp .side-foot{margin-top:auto;padding:12px 8px 4px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px}
.psmapp .side-foot .avatar{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.85rem;color:#fff;background:var(--brand)}
.psmapp .side-foot .who{font-size:.85rem;font-weight:700;line-height:1.2}
.psmapp .side-foot .who small{display:block;color:var(--faint);font-weight:500;font-size:.72rem}

.psmapp .main{flex:1;min-width:0;display:flex;flex-direction:column}
.psmapp .topbar{display:flex;align-items:center;gap:12px;padding:11px 22px;position:sticky;top:0;z-index:30;background:var(--panel);background:color-mix(in srgb,var(--panel) 88%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.psmapp .tb-brand{display:flex;align-items:center;gap:10px}
.psmapp .tb-brand .mark{width:34px;height:34px;display:none}
.psmapp .tb-title{font-family:var(--hd);font-weight:800;font-size:1.1rem;letter-spacing:-.02em}
/* The routed view already renders its own .phead h1, so the shell topbar
   title would be a duplicate — hide it on every width (it was already hidden
   under the mobile breakpoint). */
.psmapp .tb-title{display:none}
.psmapp .tb-spacer{flex:1}
.psmapp .toolbar{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:16px;padding:5px;box-shadow:0 10px 24px -16px rgba(20,30,80,.55),inset 0 1px 0 rgba(255,255,255,.6)}
.psmapp .tool{display:inline-flex;align-items:center;gap:8px;border:0;background:none;font-family:var(--bd);font-weight:700;color:var(--ink);border-radius:12px;padding:7px 12px;height:42px;cursor:pointer;position:relative;transition:.13s}
.psmapp .tool svg{width:18px;height:18px;color:var(--muted)}
.psmapp .tool.wal{background:var(--primary-tint);border:1px solid #cfe0ff}.psmapp .tool.wal svg{color:var(--primary-600)}
.psmapp .tool.wal .e{display:flex;flex-direction:column;line-height:1.05;text-align:left}
.psmapp .tool.wal small{font-size:.6rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
.psmapp .tool.wal b{font-family:var(--hd);font-weight:800;font-size:.95rem;color:var(--primary-600)}
.psmapp .tool.st{background:var(--win-soft);border:1px solid rgba(16,185,129,.24);color:#0e8f66;font-weight:700;font-size:.82rem}.psmapp .tool.st svg{color:var(--win)}
.psmapp .tool.ic-btn,.psmapp .tool.ava-btn{background:var(--panel);border:1px solid var(--line)}
.psmapp .tool.ic-btn:hover,.psmapp .tool.ava-btn:hover{background:var(--panel-2)}
.psmapp .tool.ic-btn{padding:7px 11px}
.psmapp .tool.ava-btn{padding:4px 8px 4px 4px}
.psmapp .tool.ava-btn .avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.8rem;color:#fff;background:var(--brand);position:relative}
.psmapp .tool.ava-btn .avatar::after{content:"";position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--win);border:2px solid var(--panel)}
.psmapp .tool.ava-btn svg{width:15px}
.psmapp .iconbtn{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--panel);color:var(--muted);display:grid;place-items:center;cursor:pointer}
.psmapp .ham{display:none}

.psmapp .content{padding:24px 26px 70px;max-width:1060px;width:100%;margin:0 auto;min-width:0;overflow-x:auto;animation:psmcontentin .5s cubic-bezier(.2,.7,.3,1) both}
@keyframes psmcontentin{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.psmapp .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.psmapp .phead h1{font-family:var(--hd);font-weight:800;font-size:1.5rem;letter-spacing:-.02em;margin:0}
.psmapp .phead p{color:var(--muted);font-size:.92rem;margin:4px 0 0}

.psmapp .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--shadow-sm)}
.psmapp .btn{display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;font-family:var(--bd);font-weight:700;border-radius:11px;padding:11px 16px;background:var(--primary);color:#fff;white-space:nowrap;box-shadow:0 12px 26px -12px rgba(58,111,255,.7);transition:.12s}
.psmapp .btn:hover{transform:translateY(-1px);background:var(--primary-600)}.psmapp .btn svg{width:17px;height:17px}
.psmapp .btn:disabled{opacity:.6;cursor:default;transform:none}
.psmapp .btn.sm{padding:8px 12px;font-size:.85rem}
.psmapp .btn.ghost{background:var(--panel);color:var(--ink);box-shadow:none;border:1px solid var(--line-2)}
.psmapp .btn.ghost:hover{background:var(--panel-2);border-color:var(--primary);color:var(--primary-600)}
.psmapp .btn.grad{background:var(--brand);box-shadow:0 12px 26px -12px rgba(124,92,255,.7)}
.psmapp .btn.grad:hover{background:var(--brand)}
.psmapp .btn.block{width:100%;justify-content:center}

.psmapp .alert{display:flex;align-items:center;gap:11px;background:var(--warn-soft);border:1px solid #f2d9a3;border-radius:12px;padding:10px 13px}
.psmapp .alert .ai{width:30px;height:30px;border-radius:9px;background:#fff;display:grid;place-items:center;color:var(--warn);flex:0 0 auto}.psmapp .alert .ai svg{width:16px;height:16px}
.psmapp .alert .atx{font-size:.82rem;line-height:1.34;min-width:0}.psmapp .alert .atx b{font-weight:700;color:#8a5a00}.psmapp .alert .atx span{color:#9a7420}
.psmapp .alert .btn{margin-left:auto;flex:0 0 auto}

.psmapp .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.psmapp .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.psmapp .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.psmapp .stat{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;transition:transform .16s,box-shadow .16s}
.psmapp .stat:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.psmapp [data-nav]{cursor:pointer}
.psmapp .stat .k{display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:600;color:var(--faint);min-height:2.4em}
.psmapp .stat .ci{width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center}.psmapp .stat .ci svg{width:15px;height:15px}
.psmapp .ci.b{background:var(--primary-tint);color:var(--primary-600)}.psmapp .ci.t{background:#d7f4f8;color:var(--teal)}.psmapp .ci.g{background:var(--gold-soft);color:#a9740b}.psmapp .ci.p{background:#f3e8ff;color:var(--purple)}
.psmapp .stat .v{font-family:var(--hd);font-weight:800;font-size:1.4rem;letter-spacing:-.02em;margin-top:auto;padding-top:10px}

.psmapp .wallet{position:relative;overflow:hidden;border-radius:18px;padding:22px;color:#fff;box-shadow:0 22px 46px -24px rgba(58,111,255,.7);transition:transform .16s}
.psmapp .wallet:hover{transform:translateY(-3px)}
.psmapp .wallet.eur{background:linear-gradient(135deg,var(--primary),#5b8dff 60%,#7aa2ff)}
.psmapp .wallet.usd{background:linear-gradient(135deg,#0e93a6,#14b8a6 60%,#3ad1c0)}
.psmapp .wallet .wsh{position:absolute;top:-45%;right:-12%;width:60%;height:170%;background:radial-gradient(circle,rgba(255,255,255,.26),transparent 60%)}
.psmapp .wallet .wl{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85;position:relative}
.psmapp .wallet .wv{font-family:var(--hd);font-weight:800;font-size:2.5rem;letter-spacing:-.02em;margin:6px 0 2px;position:relative}
.psmapp .wallet .wavail{position:relative;margin:2px 0 2px;font-size:.82rem;font-weight:700;color:#fff}.psmapp .wallet .wavail span{color:rgba(255,255,255,.72);font-weight:500}
.psmapp .wallet .wa{display:flex;gap:9px;margin-top:14px;position:relative;flex-wrap:wrap}
.psmapp .wbtn{display:inline-flex;align-items:center;gap:7px;border:0;cursor:pointer;font-family:var(--bd);font-weight:700;font-size:.86rem;border-radius:10px;padding:9px 13px;background:rgba(255,255,255,.92);color:var(--ink)}
.psmapp .wbtn.gh{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.3)}.psmapp .wbtn svg{width:15px;height:15px}
.psmapp .wbtn:disabled{opacity:.6;cursor:default}

.psmapp .list-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--line)}.psmapp .list-row:first-child{border-top:0}
.psmapp .list-row .ico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto}
.psmapp .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap}
.psmapp .badge.ok{background:var(--win-soft);color:#0e8f66}.psmapp .badge.pend{background:var(--warn-soft);color:#8a5a00}.psmapp .badge.due{background:var(--danger-soft);color:#c0392b}.psmapp .badge.info{background:var(--primary-tint);color:var(--primary-600)}

.psmapp .tblwrap{overflow-x:auto}
.psmapp .tbl{width:100%;border-collapse:collapse;font-size:.9rem}
.psmapp .tbl th{text-align:left;font-size:.7rem;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:700;padding:0 14px 12px}
.psmapp .tbl td{padding:13px 14px;border-top:1px solid var(--line)}
.psmapp .tbl tr:hover td{background:var(--panel-2)}
.psmapp .tbl .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.psmapp .tbl.wide{min-width:640px}
.psmapp .fbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;padding:10px;margin-bottom:14px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:15px;box-shadow:0 10px 26px -20px rgba(20,30,80,.5)}
.psmapp .fbar .fsr{display:flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;flex:1;min-width:150px;max-width:300px;color:var(--faint);transition:border-color .14s,box-shadow .14s}
.psmapp .fbar .fsr:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint);color:var(--primary-600)}
.psmapp .fbar .fsr svg{width:16px;height:16px;flex:0 0 auto}
.psmapp .fbar .fsr input{border:0;background:none;outline:0;font-family:var(--bd);font-size:.86rem;color:var(--ink);width:100%}
.psmapp .fbar select{font-family:var(--bd);font-weight:600;font-size:.84rem;border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;background:var(--panel);color:var(--ink);cursor:pointer;transition:border-color .14s,color .14s;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b93a6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 11px center;background-size:15px;padding-right:34px}
.psmapp .fbar select:hover{border-color:var(--primary);color:var(--primary-600)}
.psmapp .fbar select:focus{outline:0;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
.psmapp .fbar .fexp{margin-left:auto;display:inline-flex;align-items:center;gap:8px;font-family:var(--bd);font-weight:700;font-size:.84rem;border:1px solid #d9e2ff;border-radius:11px;padding:9px 14px;background:var(--primary-tint);color:var(--primary-600);cursor:pointer;transition:.14s}
.psmapp .fbar .fexp svg{width:16px;height:16px}
.psmapp .fbar .fexp:hover{background:var(--primary);color:#fff;border-color:var(--primary);transform:translateY(-1px)}

.psmapp .acard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:12px}
.psmapp .acard .top{display:flex;align-items:center;gap:11px}
.psmapp .acard .nm{font-weight:700}.psmapp .acard .sub{color:var(--faint);font-size:.78rem}
.psmapp .acard .kv{display:flex;justify-content:space-between;font-size:.85rem}.psmapp .acard .kv span{color:var(--faint)}.psmapp .acard .kv b{font-weight:700}
.psmapp .acard .acts{display:flex;gap:8px;margin-top:2px}
.psmapp .pfi{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--primary-tint);color:var(--primary-600);flex:0 0 auto}
.psmapp .muted{color:var(--muted)}

.psmapp .scrim{display:none}
.psmapp .bottombar{display:none}

@media (max-width:900px){
  /* dvh, not vh: on a phone 100vh is the viewport WITHOUT the browser
     toolbar, so the bottom of the nav sat underneath it and the last items
     were unreachable. overflow-y because the drawer is taller than a short
     or landscape screen. visibility:hidden while closed so the ~22 nav links
     are not in the tab order in front of the page content. */
  .psmapp .sidebar{position:fixed;z-index:60;left:0;top:0;height:100vh;height:100dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-100%);transition:transform .22s,visibility .22s;box-shadow:var(--shadow);visibility:hidden}
  .psmapp .sidebar.open{transform:none;visibility:visible}
  /* 16px is the threshold below which iOS Safari zooms the whole page on
     focus, which then leaves the layout scrolled sideways. */
  .psmapp .fbar .fsr input,.psmapp .fbar select,.psmapp .fbar input{font-size:16px}
  .psmapp .ham{display:grid}
  .psmapp .scrim{display:none;position:fixed;inset:0;background:rgba(12,18,48,.4);z-index:55}
  .psmapp .scrim.on{display:block}
  .psmapp .stats{grid-template-columns:repeat(2,1fr)}
  .psmapp .grid2,.psmapp .grid3{grid-template-columns:1fr}
  .psmapp .tool.wal,.psmapp .tool.st{display:none}
  .psmapp .tb-title{display:none}
  .psmapp .tb-brand .mark{display:grid}
  .psmapp .bottombar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:var(--panel);background:color-mix(in srgb,var(--panel) 96%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:7px 4px calc(7px + env(safe-area-inset-bottom));justify-content:space-around;gap:2px}
  .psmapp .bb{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;color:var(--faint);font-size:.6rem;font-weight:700;padding:4px 2px;cursor:pointer;transition:.14s}
  .psmapp .bbic{width:46px;height:28px;border-radius:99px;display:grid;place-items:center;position:relative;transition:.16s}
  .psmapp .bb svg{width:22px;height:22px}.psmapp .bb.on{color:var(--primary-600)}.psmapp .bb.on .bbic{background:var(--primary-tint)}
  .psmapp .content{padding:20px 16px 92px}
}

/* Phone: wide tables collapse into stacked cards. The header row is hidden
   and each <tr> becomes a bordered rounded card; each <td> is a label/value
   line — the label comes from the cell's data-label attribute (added in the
   ported views), the value sits on the right. Desktop is unaffected. */
@media (max-width:640px){
  .psmapp .tbl.wide{min-width:0}
  .psmapp .tbl.wide thead{display:none}
  .psmapp .tbl.wide,
  .psmapp .tbl.wide tbody,
  .psmapp .tbl.wide tr{display:block;width:100%}
  .psmapp .tbl.wide tr{
    border:1px solid var(--line-2);border-radius:14px;margin:0 0 12px;padding:4px 12px;
    background:var(--panel);box-shadow:var(--shadow-sm)
  }
  .psmapp .tbl.wide tr:last-child{margin-bottom:0}
  .psmapp .tbl.wide tr:hover td{background:transparent}
  .psmapp .tbl.wide td{
    display:grid;grid-template-columns:auto 1fr;align-items:center;gap:4px 16px;
    padding:10px 2px;border-top:1px solid var(--line);text-align:right;min-width:0
  }
  .psmapp .tbl.wide tr td:first-child{border-top:0}
  .psmapp .tbl.wide td::before{
    content:attr(data-label);grid-column:1;grid-row:1;justify-self:start;text-align:left;
    font-size:.66rem;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:700
  }
  .psmapp .tbl.wide td>*{grid-column:2;min-width:0}
  /* Inline value chips (status badges, short notes) keep their natural size
     and sit at the right instead of stretching the whole value column. */
  .psmapp .tbl.wide td>span{justify-self:end}
  .psmapp .tbl.wide td[colspan]{display:block;text-align:center;padding:22px 2px}
  .psmapp .tbl.wide td[colspan]::before{display:none}

  /* ── Density ──────────────────────────────────────────────────────
     Measured on the pool screen at 375x812 before this block: the page
     header was 225px, the filter bar 174px, and the first data row began
     at 560px — 69% of the screen was chrome, so a phone showed ZERO
     records without scrolling. Desktop is untouched. */

  /* Header: the title is a label, not a hero. The description is read
     once; keep it to two lines and let the content start sooner. */
  .psmapp .phead{gap:10px}
  .psmapp .phead h1{font-size:1.3rem;line-height:1.2}
  .psmapp .phead p{font-size:.85rem;margin-top:2px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  /* Page actions sit side by side instead of one full-width block each. */
  .psmapp .phead .btn{padding:9px 12px;font-size:.84rem}
  .psmapp .phead .btn svg{width:15px;height:15px}
  .psmapp .pactions{display:flex;gap:8px;width:100%}
  .psmapp .pactions .btn{flex:1 1 0;min-width:0;justify-content:center}

  /* Filters: search on its own line, the selects sharing the next one. */
  .psmapp .fbar{gap:8px;padding:8px;margin-bottom:10px;border-radius:13px}
  .psmapp .fbar .fsr{flex:1 1 100%;max-width:none;padding:8px 11px}
  .psmapp .fbar select{flex:1 1 0;min-width:0;padding:8px 11px;padding-right:30px}
  .psmapp .fbar .fexp{flex:1 1 100%;margin-left:0;justify-content:center;padding:8px 12px}

  /* Cards: same information, less air. 459px per record was roughly
     double what it needs. */
  .psmapp .tbl.wide tr{padding:2px 11px;margin-bottom:9px;border-radius:13px}
  .psmapp .tbl.wide td{padding:7px 2px;gap:2px 14px}
  .psmapp .tbl.wide td::before{font-size:.62rem}
}

/* Topbar account menu (anchored to the avatar) */
.psmapp .usermenu{position:relative;display:inline-flex}
.psmapp .umenu{position:absolute;top:calc(100% + 10px);right:0;z-index:82;min-width:210px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:6px;animation:pop .16s ease}
.psmapp .umenu-hd{padding:9px 11px 8px;border-bottom:1px solid var(--line);margin-bottom:5px}
.psmapp .umenu-hd .nm{font-family:var(--hd);font-weight:800;font-size:.9rem;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.psmapp .umenu-hd .sub{font-size:.74rem;color:var(--faint);margin-top:2px}
.psmapp .umenu-item{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;font-family:var(--bd);font-weight:600;font-size:.9rem;color:var(--ink);padding:10px 11px;border-radius:10px;cursor:pointer;transition:.12s}
.psmapp .umenu-item:hover{background:var(--panel-2)}
.psmapp .umenu-item svg{width:17px;height:17px;color:var(--muted)}
.psmapp .umenu-item.danger{color:var(--danger)}.psmapp .umenu-item.danger:hover{background:var(--danger-soft)}.psmapp .umenu-item.danger svg{color:var(--danger)}

/* Confirmation modal (matches the app's dialog look) */
.psmapp .modal{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:20px}
.psmapp .modal[hidden]{display:none}
.psmapp .mback{position:absolute;inset:0;background:rgba(12,18,48,.5);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}
.psmapp .mcard{position:relative;width:min(400px,100%);max-height:90vh;max-height:90dvh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:22px;animation:pop .2s ease}
.psmapp .mhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}.psmapp .mhead h2{font-family:var(--hd);font-weight:800;font-size:1.15rem;letter-spacing:-.02em}.psmapp .mhead .iconbtn{width:34px;height:34px;font-size:1.1rem;font-weight:600}
.psmapp .mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}
/* Modal form fields. The admin shell only ever styled controls inside .fbar,
   so a modal's inputs fell through to Tailwind's preflight — no border, no
   padding, transparent on a white card, i.e. invisible. Mirrors the advertiser
   and affiliate shells, which have carried .mlabel/.mnote all along. 16px on
   the control is deliberate: iOS zooms the page on focus below that. */
.psmapp .mlabel{display:block;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:16px 0 8px}
.psmapp .mnote{font-size:.8rem;color:var(--faint);text-align:center;margin:12px 0 0}
.psmapp .mcard input,.psmapp .mcard select,.psmapp .mcard textarea{width:100%;font-family:var(--bd);font-size:16px;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;background:var(--panel-2);color:var(--ink)}
.psmapp .mcard input:focus,.psmapp .mcard select:focus,.psmapp .mcard textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(58,111,255,.18)}
.psmapp .mrow{display:flex;gap:10px;flex-wrap:wrap}
.psmapp .mrow>*{flex:1 1 120px;min-width:0}
/* Desktop shows the full label; the phone block below drops the long half. */
.psmapp .pactions{display:flex;gap:8px;flex-wrap:wrap}
@media (max-width:560px){.psmapp .lbl-long{display:none}}
.psmapp .btn.danger{background:var(--danger);box-shadow:0 12px 26px -12px rgba(229,72,77,.7)}.psmapp .btn.danger:hover{background:var(--danger)}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.psmapp *{animation:none!important;transition:none!important}}
`;
