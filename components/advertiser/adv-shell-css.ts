import { refineCss } from "./refine-css";
// AUTO-GENERATED verbatim from advertiser-app.html mockup (scoped .advapp).
export const ADV_CSS = `
  .advapp{--ground:#f4f6fc;--panel:#fff;--panel-2:#f1f4fb;--ink:#12162a;--txt-2:#5c6577;--faint:#8b93a6;
    --line:#e6e9f2;--line-2:#d8ddec;--primary:#3a6fff;--primary-600:#2f5ae6;--primary-tint:#eaf1ff;
    --blue:#5B8DFF;--purple:#8B5CF6;--navy1:#04050E;--navy2:#0c1230;--navy3:#0f172a;
    --win:#10b981;--win-soft:#daf5ec;--warn:#e08a00;--warn-soft:#fdeecb;--danger:#e5484d;--danger-soft:#fdecec;
    --gold:#efb02c;--gold-soft:#fdeecb;--teal:#0e93a6;
    --hd:var(--font-jakarta),system-ui,sans-serif;--bd:var(--font-dmsans),system-ui,sans-serif;
    --brand:linear-gradient(135deg,#5B8DFF,#8B5CF6);
    --shadow-sm:0 10px 26px -20px rgba(20,30,80,.5);--shadow:0 24px 54px -28px rgba(20,30,80,.4);--sidebar:256px}
  .advapp *{box-sizing:border-box}
  .advapp{background:var(--ground);color:var(--ink);font-family:var(--bd);line-height:1.55;-webkit-font-smoothing:antialiased;min-height:100vh}
  svg.ic{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;display:block;flex:0 0 auto}
  .mono{font-family:ui-monospace,Menlo,monospace}
  h2{font-family:var(--hd);font-weight:800;font-size:1.12rem;letter-spacing:-.02em;margin:0}
  .cap{color:var(--txt-2);font-size:.9rem;margin:6px 0 16px}
  .grad{background:var(--brand);-webkit-background-clip:text;background-clip:text;color:transparent}

  .app{display:flex;min-height:100vh}
  .sidebar{width:var(--sidebar);flex:0 0 auto;background:var(--panel);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column;gap:3px;position:sticky;top:0;height:100vh}
  .logo{display:flex;align-items:center;gap:11px;padding:6px 8px 18px;
    background:none;border:0;width:100%;text-align:left;cursor:pointer;
    font:inherit;color:inherit;-webkit-tap-highlight-color:transparent}
  .logo:active .mark,.tb-brand:active .mark{transform:scale(.94)}
  .logo .mark,.tb-brand .mark{transition:transform .12s}
  .mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#fff;flex:0 0 auto;background:linear-gradient(135deg,var(--navy1),var(--navy2),var(--navy3));box-shadow:0 0 22px rgba(91,141,255,.4),0 0 0 1px rgba(91,141,255,.28)}
  .mark svg{width:20px;height:20px}
  .logo .name{font-family:var(--hd);font-weight:800;letter-spacing:-.025em;font-size:.98rem;line-height:1.1}
  .logo .name small{display:block;font-weight:700;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:3px}
  .navsec{font-size:.64rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding:14px 12px 6px}
  .navlink{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;font-weight:600;font-size:.92rem;color:var(--txt-2);cursor:pointer;transition:.14s;border:0;background:none;width:100%;text-align:left;font-family:var(--bd)}
  .navlink:hover{background:var(--panel-2);color:var(--ink)}.navlink.on{background:var(--primary-tint);color:var(--primary-600)}
  .navlink svg{width:19px;height:19px}.navlink .n{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:var(--primary);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center}
  .side-foot{margin-top:auto;padding:12px 8px 4px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px}
  /* NO BLUE BEHIND THE AVATAR. This box was a rounded SQUARE filled with
     the brand colour, from when it held two initials — and PsmAvatar
     draws a CIRCLE, so what you saw was a blue tile with a disc on it,
     blue in all four corners. The box now only positions and clips; the
     drawing paints itself. */
  .side-foot .avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;background:none;overflow:hidden}
  .side-foot .avatar svg{width:100%;height:100%;display:block}
  .side-foot .who{font-size:.85rem;font-weight:700;line-height:1.2}.side-foot .who small{display:block;color:var(--faint);font-weight:500;font-size:.72rem}

  .main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{display:flex;align-items:center;gap:12px;padding:11px 22px;position:sticky;top:0;z-index:30;background:var(--panel);background:color-mix(in srgb,var(--panel) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .tb-brand{display:flex;align-items:center;gap:10px;background:none;border:0;
    padding:0;cursor:pointer;color:inherit;-webkit-tap-highlight-color:transparent}.tb-brand .mark{width:34px;height:34px;display:none}/* sidebar shows the logo on desktop */
  /* The page content renders its own <h1> per view (.phead h1), so the
     topbar title would duplicate it on desktop — hide it everywhere, same
     as the .psmapp shell. On mobile the brand mark shows instead. */
  .tb-title{font-family:var(--hd);font-weight:800;font-size:1.1rem;letter-spacing:-.02em;display:none}
  .search{display:flex;align-items:center;gap:9px;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:9px 13px;min-width:160px;max-width:260px;flex:1;color:var(--faint)}
  .search svg{width:17px;height:17px}.search input{border:0;background:none;outline:0;font-family:var(--bd);font-size:.9rem;color:var(--ink);width:100%}
  .tb-spacer{flex:1}
  .toolbar{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:16px;padding:5px;box-shadow:0 10px 24px -16px rgba(20,30,80,.55),inset 0 1px 0 rgba(255,255,255,.6)}
  .tool{display:inline-flex;align-items:center;gap:8px;border:0;background:none;font-family:var(--bd);font-weight:700;color:var(--ink);border-radius:12px;padding:7px 12px;height:42px;cursor:pointer;position:relative;transition:.13s}
  .tool svg{width:18px;height:18px;color:var(--txt-2)}
  .tool.wal{background:var(--primary-tint);border:1px solid #cfe0ff}.tool.wal svg{color:var(--primary-600)}
  .tool.wal .e{display:flex;flex-direction:column;line-height:1.05;text-align:left}
  .tool.wal small{font-size:.6rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
  .tool.wal b{font-family:var(--hd);font-weight:800;font-size:.95rem;color:var(--primary-600)}
  .tool.st{background:var(--win-soft);border:1px solid rgba(16,185,129,.24);color:#0e8f66;font-weight:700;font-size:.82rem}.tool.st svg{color:var(--win)}
  .tool.ic-btn,.tool.ava-btn{background:var(--panel);border:1px solid var(--line)}.tool.ic-btn:hover,.tool.ava-btn:hover{background:var(--panel-2)}
  .tool.ic-btn{padding:7px 11px}
  .badge-n{position:absolute;top:0;right:2px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:var(--primary);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--panel)}
  /* ── THE UNKNOWN STATE IS NOT A COUNT ────────────────────────────
     When the count cannot be read the badge said "·" -- a full-size
     pill with a middot floating in it, which reads as a stray mark
     rather than a state. It is a small ring now: visibly not a number,
     visibly deliberate, and it carries its own title. */
  .badge-n.unknown{min-width:10px;width:10px;height:10px;padding:0;background:var(--faint);box-shadow:0 0 0 2px var(--panel);border:0;font-size:0;top:3px;right:5px}
  .tool.ava-btn{padding:4px 8px 4px 4px}
  /* Same: no brand fill behind a circular drawing, and the 36-unit SVG is
     sized to the box instead of overflowing it. The green presence dot
     stays. */
  .tool.ava-btn .avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:none;position:relative}
  .tool.ava-btn .avatar svg{width:100%;height:100%;display:block}
  .tool.ava-btn .avatar::after{content:"";position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--win);border:2px solid var(--panel)}
  .tool.ava-btn svg{width:15px}
  .iconbtn{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--panel);color:var(--txt-2);display:grid;place-items:center;cursor:pointer}
  .ham{display:none}

  .content{padding:24px 26px 70px;max-width:1060px;width:100%;margin:0 auto}
  .view{display:none;flex-direction:column;gap:16px}.view.on{display:flex;animation:fade .3s ease}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  /* flex-START, not flex-end: the action belongs beside the TITLE, and
     aligning to the bottom pinned it to whatever depth the subtitle
     happened to be -- two lines of subtitle pushed it down and, once it
     wrapped, under the heading entirely. And the text block shrinks
     rather than forcing the wrap. */
  .phead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px 16px;flex-wrap:wrap}
  .phead>div:first-child{flex:1 1 220px;min-width:0}
  .phead-actions{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-left:auto;flex:0 0 auto}
  .phead-why{flex:0 0 100%;text-align:right;color:var(--faint);font-size:.78rem}
  @media(max-width:560px){
    /* On a phone the actions sit under the title, full width, in the
       order you would press them. */
    .phead-actions{width:100%;justify-content:stretch}
    .phead-actions .btn{flex:1 1 0;justify-content:center}
    .phead-why{text-align:left}
  }
  .phead h1{font-family:var(--hd);font-weight:800;font-size:1.5rem;letter-spacing:-.02em;margin:0}
  .phead p{color:var(--txt-2);font-size:.92rem;margin:4px 0 0}

  /* ── A DISABLED BUTTON HAS TO LOOK DISABLED ─────────────────────────
     .btn and .btn.grad both set background and box-shadow explicitly,
     and there was no :disabled rule anywhere in either shell — so
     "Request one", "New request", "Withdraw to wallet" and the
     affiliate's "Request payout" rendered at full brand gradient, lifted
     on hover, swallowed every tap, and carried their reason only in a
     title attribute, which does not exist on a phone. The customer is
     left pressing a live-looking button that does nothing and saying
     nothing. */
  .btn:disabled,.btn[disabled]{cursor:not-allowed;opacity:.55;
    background:var(--panel-2)!important;color:var(--txt-2)!important;
    border-color:var(--line-2)!important;box-shadow:none!important;
    filter:none!important;transform:none!important}
  .btn:disabled:hover,.btn[disabled]:hover{transform:none!important;
    box-shadow:none!important;filter:none!important}
  .btn:disabled svg,.btn[disabled] svg{opacity:.7}

  .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:var(--shadow-sm)}
  .btn{display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;font-family:var(--bd);font-weight:700;border-radius:11px;padding:11px 16px;background:var(--primary);color:#fff;white-space:nowrap;box-shadow:0 12px 26px -12px rgba(58,111,255,.7);transition:.12s}
  .btn:hover{transform:translateY(-1px);background:var(--primary-600)}.btn svg{width:17px;height:17px}
  .btn.sm{padding:8px 12px;font-size:.85rem}
  .btn.ghost{background:var(--panel);color:var(--ink);box-shadow:none;border:1px solid var(--line-2)}.btn.ghost:hover{background:var(--panel-2);border-color:var(--primary);color:var(--primary-600)}
  .btn.grad{background:var(--brand);box-shadow:0 12px 26px -12px rgba(124,92,255,.7)}
  .btn.block{width:100%;justify-content:center}

  .alert{display:flex;align-items:center;gap:11px;background:var(--warn-soft);border:1px solid #f2d9a3;border-radius:12px;padding:10px 13px}
  .alert .ai{width:30px;height:30px;border-radius:9px;background:#fff;display:grid;place-items:center;color:var(--warn);flex:0 0 auto}.alert .ai svg{width:16px;height:16px}
  .alert .atx{font-size:.82rem;line-height:1.34;min-width:0}.alert .atx b{font-weight:700;color:#8a5a00}.alert .atx span{color:#9a7420}
  @media(max-width:480px){.alert{flex-wrap:wrap}.alert .atx{flex:1 1 auto}.alert>.btn{margin-left:auto;margin-top:4px}}
  .alert .btn{margin-left:auto;flex:0 0 auto}
  .stat,.acard{transition:transform .16s,box-shadow .16s}.stat:hover,.acard:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
  /* The markup never sets data-v — grep returns zero. Every one of these
     cards has an onClick and rendered with the default arrow cursor and
     no hover feedback. The class is what is actually there. */
  .stat,.acard,.list-row[role="button"]{cursor:pointer}
  .wallet{transition:transform .16s}.wallet:hover{transform:translateY(-3px)}
  .wallet::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 34%,rgba(255,255,255,.16) 50%,transparent 66%);transform:translateX(-120%);animation:sweep 7s ease-in-out infinite;pointer-events:none}
  @keyframes sweep{0%,58%{transform:translateX(-120%)}82%,100%{transform:translateX(120%)}}

  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  /* ── auto-fill, NOT three fixed columns ──────────────────────────
     A customer with ONE ad account got a card sitting in a third of the
     width with two empty thirds beside it, and a customer with four got
     three across and one alone on a second row. auto-fill lets the row
     hold as many as fit and lets one card be one card. */
  .grid3{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:14px}
  /* ── Balance hero ───────────────────────────────────────────────────
     The dashboard was a stack of flat white blocks that said the same
     number three times — two stat tiles, a "Your wallets" section and the
     top-bar chip — on a screen whose whole purpose is "what can I spend".
     One panel, in the brand the sign-in screen used, answers it. */
  .hero{position:relative;overflow:hidden;border-radius:22px;padding:22px;color:#fff;isolation:isolate;
    background:radial-gradient(120% 90% at 12% 0%,rgba(91,141,255,.42),transparent 58%),
               radial-gradient(110% 95% at 100% 100%,rgba(139,92,246,.44),transparent 55%),
               linear-gradient(160deg,#04050E,#0c1230 55%,#141a3c);
    box-shadow:0 30px 64px -34px rgba(20,30,80,.75)}
  .hero-ribbon{position:absolute;inset:-45%;z-index:0;pointer-events:none;
    background:conic-gradient(from 0deg,transparent,rgba(139,92,246,.16),transparent 26%,rgba(91,141,255,.2),transparent 58%);
    animation:advspin 30s linear infinite}
  @keyframes advspin{to{transform:rotate(360deg)}}
  .hero-stars{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.8;
    background-image:
      radial-gradient(1.5px 1.5px at 14% 20%,#fff,transparent),
      radial-gradient(1.3px 1.3px at 31% 68%,rgba(255,255,255,.75),transparent),
      radial-gradient(1.8px 1.8px at 64% 14%,#cdd7ff,transparent),
      radial-gradient(1.4px 1.4px at 86% 44%,#fff,transparent),
      radial-gradient(1.3px 1.3px at 48% 86%,rgba(255,255,255,.65),transparent),
      radial-gradient(1.5px 1.5px at 76% 76%,#fff,transparent),
      radial-gradient(1.2px 1.2px at 8% 54%,#fff,transparent);
    animation:advtwinkle 4.2s ease-in-out infinite}
  @keyframes advtwinkle{0%,100%{opacity:.4}50%{opacity:.9}}
  .hero>*{position:relative;z-index:1}
  .hero-greet{font-size:.7rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
    color:rgba(255,255,255,.5);margin:0}
  .hero-h{font-family:var(--hd);font-weight:800;font-size:1.55rem;letter-spacing:-.025em;
    margin:2px 0 18px;color:#fff}
  .hero-bal{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  /* Each balance is the button that opens the wallet — the number IS the
     link, so there is nothing extra to aim at. */
  .hero-w{display:flex;flex-direction:column;gap:7px;text-align:left;cursor:pointer;
    font-family:inherit;color:inherit;min-width:0;
    background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);
    border-radius:15px;padding:13px 14px;transition:.15s}
  .hero-w:hover{background:rgba(255,255,255,.12);transform:translateY(-1px)}
  .hero-w .l{display:flex;align-items:center;gap:7px;font-size:.68rem;font-weight:700;
    letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.62)}
  .hero-w .l i{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
  .hero-w .v{font-family:var(--hd);font-weight:800;letter-spacing:-.02em;
    font-size:clamp(1.15rem,5.4vw,1.5rem);font-variant-numeric:tabular-nums;
    overflow-wrap:anywhere}
  /* A GRID, not a wrapping flex row. At 375px the three labels plus their
     icons need ~346px and the hero gives 299, so Top up and Exchange took
     row one at half width each and "Ad accounts" sat alone underneath —
     on the first screen a customer sees. Three equal tracks that are
     allowed to shrink fit; below 420px the icons step aside rather than
     the layout breaking. */
  .hero-a{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:15px}
  .hero-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:0;
    border:0;cursor:pointer;font-family:var(--bd);font-weight:700;font-size:.88rem;
    border-radius:12px;padding:9px 14px;color:#fff;
    background:linear-gradient(118deg,#4f83ff,#6d63ff 52%,#9a6bff);
    box-shadow:0 14px 30px -14px rgba(96,86,255,.8),inset 0 1px 0 rgba(255,255,255,.28);
    transition:.14s}
  .hero-btn:hover{filter:brightness(1.05);transform:translateY(-1px)}
  .hero-btn:disabled{opacity:.55;cursor:default;transform:none;filter:none}
  .hero-btn.gh{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);box-shadow:none}
  .hero-btn.gh:hover{background:rgba(255,255,255,.16)}
  .hero-btn svg{width:16px;height:16px;flex:0 0 auto}
  /* THE ICON STAYS. Hiding it below 420px bought the width the third
     label needed, and it cost the thing that makes a row of three read as
     a row of three. Shortening "Ad accounts" to "Accounts" buys the same
     width and costs nothing — under a wallet balance, in an app whose
     only accounts are ad accounts, one word says it. */
  @media(max-width:420px){
    .hero-btn{padding:9px 7px;font-size:.8rem;gap:5px}
    .hero-btn svg{width:14px;height:14px}
  }
  /* A block the size of the number that is coming, not the number zero.
     The dashboard used to render €0 / $0 the instant it mounted and swap in
     the real balances a moment later — which is a flicker, and for that
     moment it is also untrue. Reserving the space means nothing below it
     moves when the figures land. */
  .hero-w .v.skel{
    display:block;min-height:1.15em;width:60%;border-radius:7px;
    background:linear-gradient(90deg,rgba(255,255,255,.08),rgba(255,255,255,.18),rgba(255,255,255,.08));
    background-size:200% 100%;animation:advskel 1.15s ease-in-out infinite}
  @keyframes advskel{0%{background-position:200% 0}100%{background-position:-200% 0}}
  @media (prefers-reduced-motion:reduce){
    .hero-ribbon,.hero-stars{animation:none}
    .hero-w .v.skel{animation:none}
  }
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column}
  .stat .k{display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:600;color:var(--faint)}
  .stat .ci{width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center}.stat .ci svg{width:15px;height:15px}
  .ci.b{background:var(--primary-tint);color:var(--primary-600)}.ci.t{background:#d7f4f8;color:var(--teal)}.ci.g{background:var(--gold-soft);color:#a9740b}.ci.p{background:#f3e8ff;color:var(--purple)}
  .stat .v{font-family:var(--hd);font-weight:800;font-size:1.4rem;letter-spacing:-.02em;margin-top:auto;padding-top:10px}
  .stat .k{min-height:2.4em}

  /* Same night sky as the dashboard hero, lit in the currency's own colour,
     rather than a flat slab of saturated blue next to a flat slab of
     saturated teal. Two bright rectangles read as a chart legend; one dark
     surface with a coloured light in it reads as the same product the rest of
     the app is. */
  .wallet{position:relative;overflow:hidden;border-radius:20px;padding:22px;color:#fff;isolation:isolate;
    box-shadow:0 1px 0 rgba(255,255,255,.1) inset,0 28px 56px -32px rgba(20,30,80,.8)}
  .wallet.eur{background:
    radial-gradient(130% 90% at 12% 0%,rgba(91,141,255,.5),transparent 60%),
    radial-gradient(110% 90% at 100% 100%,rgba(58,111,255,.34),transparent 56%),
    linear-gradient(160deg,#04050E,#0b1130 55%,#141c44)}
  .wallet.usd{background:
    radial-gradient(130% 90% at 12% 0%,rgba(20,184,166,.45),transparent 60%),
    radial-gradient(110% 90% at 100% 100%,rgba(139,92,246,.3),transparent 56%),
    linear-gradient(160deg,#04050E,#07161f 55%,#0e2a33)}
  .wallet .wsh{position:absolute;top:-45%;right:-12%;width:60%;height:170%;
    background:radial-gradient(circle,rgba(255,255,255,.14),transparent 62%);pointer-events:none}
  .wallet .wl{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85;position:relative}
  .wallet .wv{font-family:var(--hd);font-weight:800;font-size:2.5rem;letter-spacing:-.02em;margin:6px 0 2px;position:relative}
  .wallet .wl{opacity:1;color:rgba(255,255,255,.6)}
  .wallet .wv{font-variant-numeric:tabular-nums}
  .wallet .wavail{position:relative;margin:2px 0 2px;font-size:.8rem;font-weight:600;color:rgba(255,255,255,.6)}
  .wallet .wavail b{color:#fff;font-weight:800}
  .wallet .wa{display:flex;gap:9px;margin-top:16px;position:relative;flex-wrap:wrap}
  .wbtn{display:inline-flex;align-items:center;justify-content:center;gap:7px;flex:1 1 auto;border:0;cursor:pointer;
    font-family:var(--bd);font-weight:700;font-size:.86rem;border-radius:11px;padding:10px 14px;color:#fff;
    background:linear-gradient(118deg,#4f83ff,#6d63ff 52%,#9a6bff);
    box-shadow:0 1px 0 rgba(255,255,255,.28) inset,0 14px 28px -14px rgba(96,86,255,.85);transition:.14s}
  .wbtn:hover{filter:brightness(1.05);transform:translateY(-1px)}
  .wbtn:active{transform:translateY(1px)}
  .wbtn:disabled{opacity:.5;cursor:default;transform:none;filter:none}
  .wallet.usd .wbtn{background:linear-gradient(118deg,#12a99b,#14b8a6 52%,#3ad1c0);
    box-shadow:0 1px 0 rgba(255,255,255,.28) inset,0 14px 28px -14px rgba(20,184,166,.8)}
  .wbtn.gh{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2);box-shadow:none}
  .wbtn.gh:hover{background:rgba(255,255,255,.16)}
  .wallet.usd .wbtn.gh{background:rgba(255,255,255,.1)}
  .wbtn svg{width:15px;height:15px}

  .tbl{width:100%;border-collapse:collapse;font-size:.9rem}
  .tbl th{text-align:left;font-size:.7rem;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:700;padding:0 14px 12px}
  .tbl td{padding:13px 14px;border-top:1px solid var(--line)}.tbl tr:hover td{background:var(--panel-2)}
  .tbl .r{text-align:right;font-variant-numeric:tabular-nums}
  .fbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;padding:10px;margin-bottom:14px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:15px;box-shadow:0 10px 26px -20px rgba(20,30,80,.5)}
  .fbar .fsr{display:flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;flex:1;min-width:150px;max-width:300px;color:var(--faint);transition:border-color .14s,box-shadow .14s}
  .fbar .fsr:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint);color:var(--primary-600)}
  .fbar .fsr svg{width:16px;height:16px;flex:0 0 auto}.fbar .fsr input{border:0;background:none;outline:0;font-family:var(--bd);font-size:.86rem;color:var(--ink);width:100%}
  .fbar select{font-family:var(--bd);font-weight:600;font-size:.84rem;border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;background:var(--panel);color:var(--ink);cursor:pointer;transition:border-color .14s,color .14s;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b93a6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 11px center;background-size:15px;padding-right:34px}
  .fbar select:hover{border-color:var(--primary);color:var(--primary-600);background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232f5ae6' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>")}
  .fbar select:focus{outline:0;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
  .fbar .fexp{margin-left:auto;display:inline-flex;align-items:center;gap:8px;font-family:var(--bd);font-weight:700;font-size:.84rem;border:1px solid #d9e2ff;border-radius:11px;padding:9px 14px;background:var(--primary-tint);color:var(--primary-600);cursor:pointer;transition:.14s}
  .fbar .fexp svg{width:16px;height:16px}
  .fbar .fexp:hover{background:var(--primary);color:#fff;border-color:var(--primary);box-shadow:0 10px 22px -12px rgba(58,111,255,.7);transform:translateY(-1px)}
  .fbtog{display:none;align-items:center;gap:8px;font-family:var(--bd);font-weight:700;font-size:.84rem;border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;background:var(--panel);color:var(--ink);cursor:pointer}
  .fbtog .ddchev{width:15px;height:15px;color:var(--faint);transition:transform .18s}.fbar.open .fbtog .ddchev{transform:rotate(180deg)}
  .fselwrap{display:contents}
  @media(max-width:560px){.fbar .fsr{max-width:none;flex:1 1 100%}.fbar .fexp{margin-left:0}
    .fbtog{display:inline-flex}.fselwrap{display:none}
    .fbar.open .fselwrap{display:flex;flex-direction:column;gap:9px;flex:1 1 100%;width:100%}
    .fbar.open .fselwrap select{width:100%}}
  .tblwrap{overflow-x:auto}
  .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap}
  .badge.ok{background:var(--win-soft);color:#0e8f66}.badge.pend{background:var(--warn-soft);color:#8a5a00}.badge.due{background:var(--danger-soft);color:#c0392b}.badge.info{background:var(--primary-tint);color:var(--primary-600)}
  /* lib/invoice-status.ts declares four tones and this file had three.
     "muted" is what a cancelled, refunded or draft invoice gets, and a
     badge with no background rule renders as body text in a transparent
     pill — so the one status that means "this is not live" looked like
     no status at all. */
  .badge.muted{background:var(--panel-2);color:var(--txt-2);box-shadow:0 0 0 1px var(--line-2) inset}
  .plat{display:inline-flex;align-items:center;gap:8px;font-weight:700}
  .pfi{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#fff;border:1px solid var(--line-2);flex:0 0 auto}
  .pfi svg{width:19px;height:19px}.pfi.tt{background:#000;border-color:#000}

  /* ── THE CARD ────────────────────────────────────────────────────
     Three bands with one rhythm: who this account is, what it costs,
     and what you can do with it. The figures were free-floating rows of
     two different weights; they are a column now, right-aligned and
     tabular, so Fee and Currency line up under each other and a second
     card lines up with the first. */
  .acard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:13px}
  .acard .top{display:flex;align-items:flex-start;gap:11px}
  .acard .top .pfi{flex:0 0 auto}
  /* The brand mark fills the tile rather than sitting in it as a 15px
     stroke icon, and it keeps its own colour where it has one. */
  .pfi .pmark{width:20px;height:20px}
  .acard .nm{font-weight:700;letter-spacing:-.01em;overflow-wrap:anywhere}
  .acard .sub{color:var(--faint);font-size:.76rem;margin-top:1px}
  /* The figures, as one block with hairlines between rather than four
     separate lines floating in the card. */
  .acard .kv{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:.84rem;padding:7px 0;border-top:1px solid var(--line-2)}
  .acard .kv:first-of-type{border-top:0;padding-top:2px}
  .acard .kv span{color:var(--faint)}
  .acard .kv b{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
  /* Equal halves that fill the card, so two cards side by side have
     their buttons on the same line. */
  .acard .acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:auto;padding-top:2px}
  .acard .acts .btn{width:100%;justify-content:center}
  .acard .acts .lockmsg{grid-column:1 / -1}
  .acard:hover{border-color:var(--primary);box-shadow:0 10px 26px -16px rgba(20,30,80,.5)}
  .acard.banned{opacity:.94}.acard.banned:hover{border-color:#f3c9c9}
  .lockmsg{display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:600;color:var(--txt-2);background:var(--panel-2);border:1px solid var(--line-2);border-radius:10px;padding:9px 11px;width:100%}
  .lockmsg svg{width:15px;height:15px;flex:0 0 auto;color:var(--faint)}
  .lockmsg.banned{color:#c0392b;background:var(--danger-soft);border-color:#f3c9c9}.lockmsg.banned svg{color:var(--danger)}
  .okic{width:66px;height:66px;border-radius:50%;margin:8px auto 6px;display:grid;place-items:center;background:var(--win-soft);color:var(--win);box-shadow:0 0 0 8px rgba(16,185,129,.12);animation:okpop .4s cubic-bezier(.2,.8,.2,1)}
  .okic svg{width:30px;height:30px}
  @keyframes okpop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}

  .list-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--line)}.list-row:first-child{border-top:0}
  /* A reference that copies itself. It has to read as the value first
     and as a control second, so it keeps the cell's type and only picks
     up an outline and the small glyph. */
  .copyref{display:inline-flex;align-items:center;gap:7px;max-width:100%;
    background:none;border:0;padding:2px 6px 2px 0;margin:0;font:inherit;
    color:inherit;cursor:pointer;border-radius:8px;text-align:left;
    -webkit-tap-highlight-color:transparent}
  .copyref span{overflow-wrap:anywhere}
  .copyref svg{width:14px;height:14px;flex:0 0 auto;opacity:.5;transition:opacity .12s}
  .copyref:hover{background:var(--panel-2)}
  .copyref:hover svg{opacity:1}
  .copyref:active{transform:scale(.99)}
  /* "View all" under a truncated list. Full width, quiet, and it turns
     its chevron over when the list is open — so the control says which
     way it goes without a second label. */
  .invmore{width:100%;justify-content:center;margin-top:10px}
  .invmore svg{width:14px;height:14px;transition:transform .15s}
  /* ── The affiliate invitation ───────────────────────────────────────
     The one screen in the customer app that is selling something, so it
     gets the dark ground the balance hero has: everything else here is a
     white card, and a white card is what "another section" looks like. */
  .joinhero{position:relative;overflow:hidden;border-radius:20px;padding:28px 22px 26px;
    color:#fff;text-align:center;isolation:isolate;
    background:linear-gradient(150deg,var(--navy1),var(--navy2) 55%,#1b2450);
    box-shadow:0 24px 50px -28px rgba(20,30,80,.85),0 0 0 1px rgba(255,207,106,.22) inset}
  /* THE CABINET RING. A conic gradient turning behind the card, masked
     to a 2px band, so the border chases light the way a machine does. */
  .joinhero::before{content:"";position:absolute;inset:-60%;z-index:0;pointer-events:none;
    background:conic-gradient(from 0deg,transparent 0 12%,rgba(255,207,106,.85) 18%,
      transparent 26% 46%,rgba(124,92,255,.9) 54%,transparent 62% 84%,
      rgba(110,231,183,.8) 92%,transparent 100%);
    animation:jhspin 6s linear infinite}
  .joinhero .jh-mask{position:absolute;inset:2px;z-index:0;border-radius:18px;pointer-events:none;
    background:linear-gradient(150deg,var(--navy1),var(--navy2) 55%,#1b2450)}
  @keyframes jhspin{to{transform:rotate(1turn)}}
  .joinhero::after{content:"";position:absolute;inset:-40% -20% auto;height:70%;
    background:radial-gradient(60% 100% at 50% 0,rgba(124,92,255,.5),transparent 70%);
    pointer-events:none}
  .joinhero>*{position:relative}
  .jh-ic{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 14px;
    border-radius:16px;background:rgba(255,255,255,.13);
    box-shadow:0 0 0 1px rgba(255,255,255,.18) inset}
  .jh-ic svg{width:24px;height:24px}
  .joinhero h2{font-size:1.35rem;line-height:1.2;margin:0 0 8px;color:#fff}
  .joinhero p{margin:0 auto 16px;max-width:34ch;font-size:.88rem;line-height:1.55;
    color:rgba(255,255,255,.76)}
  .jh-list{list-style:none;margin:0 auto 20px;padding:0;display:grid;gap:9px;
    max-width:30ch;text-align:left}
  .jh-list li{display:flex;align-items:flex-start;gap:9px;font-size:.85rem;
    line-height:1.4;color:rgba(255,255,255,.9)}
  .jh-list svg{width:15px;height:15px;flex:0 0 auto;margin-top:2px;color:#6ee7b7}
  .joinhero .btn.grad{width:100%;max-width:19rem;justify-content:center}
  .jh-note{display:block;margin-top:11px;font-size:.76rem;color:rgba(255,255,255,.55)}
  /* ── THE MONEY ITSELF ───────────────────────────────────────────
     Gold, lit, tumbling. Still pure decoration: aria-hidden, no
     pointer events, under the content, and dead still under
     prefers-reduced-motion. */
  .joinhero .moneyfx{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
  .joinhero .moneyfx span{position:absolute;top:-52px;font-family:var(--hd);font-weight:900;
    background:linear-gradient(180deg,#fff3c4,#ffcf6a 45%,#e0951f);
    -webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 0 10px rgba(255,190,70,.75));
    animation:mfall linear infinite;will-change:transform,opacity}
  .joinhero .moneyfx span:nth-child(1){left:6%;font-size:1.5rem;animation-duration:7.5s;animation-delay:0s}
  .joinhero .moneyfx span:nth-child(2){left:20%;font-size:1.05rem;animation-duration:9.5s;animation-delay:-2.2s}
  .joinhero .moneyfx span:nth-child(3){left:35%;font-size:1.9rem;animation-duration:8.2s;animation-delay:-5.1s}
  .joinhero .moneyfx span:nth-child(4){left:52%;font-size:1.15rem;animation-duration:10.5s;animation-delay:-1.1s}
  .joinhero .moneyfx span:nth-child(5){left:68%;font-size:1.65rem;animation-duration:7.9s;animation-delay:-6.4s}
  .joinhero .moneyfx span:nth-child(6){left:82%;font-size:1rem;animation-duration:9.9s;animation-delay:-3.3s}
  .joinhero .moneyfx span:nth-child(7){left:93%;font-size:1.35rem;animation-duration:8.6s;animation-delay:-7.7s}
  @keyframes mfall{
    0%{transform:translateY(0) rotateY(0deg) rotate(0deg);opacity:0}
    8%{opacity:1}
    88%{opacity:1}
    100%{transform:translateY(470px) rotateY(900deg) rotate(160deg);opacity:0}
  }
  /* The icon gets a pulsing halo, so the eye lands there first. */
  .joinhero .jh-ic{box-shadow:0 0 0 1px rgba(255,207,106,.4) inset,0 0 26px rgba(255,190,70,.45);
    animation:jhpulse 2.4s ease-in-out infinite}
  .joinhero .jh-ic svg{color:#ffcf6a}
  @keyframes jhpulse{
    0%,100%{box-shadow:0 0 0 1px rgba(255,207,106,.4) inset,0 0 18px rgba(255,190,70,.35)}
    50%{box-shadow:0 0 0 1px rgba(255,207,106,.7) inset,0 0 38px rgba(255,190,70,.75)}
  }
  /* And a shine sweeping the button, the way a payout counter does. */
  .joinhero .btn.grad{position:relative;overflow:hidden}
  .joinhero .btn.grad::after{content:"";position:absolute;inset:0;pointer-events:none;
    background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.55) 50%,transparent 60%);
    background-size:260% 100%;background-position:180% 0;
    animation:jhsweep 3.2s ease-in-out infinite}
  @keyframes jhsweep{0%,55%{background-position:180% 0}100%{background-position:-60% 0}}
  @media (prefers-reduced-motion:reduce){
    .joinhero .moneyfx{display:none}
    .joinhero::before,.joinhero .jh-ic,.joinhero .btn.grad::after{animation:none}
    .joinhero::before{opacity:.35}
  }
  .list-row .ico{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}
  .list-row .ico svg{width:18px;height:18px}
  .list-row .amt{margin-left:auto;font-family:var(--hd);font-weight:800}

  /* ── THE NAME AND THE STATE ARE ONE LINE ──────────────────────────
     The pill was position:absolute in the top-right corner and the name
     started below it, so "PRIME" and "Active" sat on two lines with a
     band of empty card between them. They answer one question together
     — which plan, and is it running — so they share a row.

     Taking the pill out of the corner also removes the reason for the
     phone-width hack underneath it: there is nothing left to collide
     with, at any width, however long the plan name or the status word. */
  .sub-card .sub-head{display:flex;align-items:center;gap:10px;
    min-height:28px;margin:0 0 2px;position:relative;z-index:2}
  .sub-card .pill.pill-tr{position:static;margin:0 0 0 auto;flex:0 0 auto}
  /* The plan's own name, above the price. Small caps, spaced, at the
     card's own opacity — a label for the figure under it, not a second
     headline competing with it. */
  /* Small caps, spaced, at the card's own opacity — a label for the
   figure under it, not a second headline competing with it.

   No top margin any more: .sub-head owns the spacing. That also ends a
   fight this file used to have with itself -- a margin shorthand later
   in the file reset the margin-top that a phone-width rule above it had
   just set, so at 375px a long plan name ran straight into a pill that
   can read "Couldn't load", "Loading…" or "No plan". Both rules are
   gone; min-width:0 lets a long name ellipsise instead of shoving the
   pill off the card. */
.sub-card .plan-name{font-family:var(--hd);font-weight:800;font-size:.76rem;
    letter-spacing:.14em;text-transform:uppercase;opacity:.72;margin:0;
    min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sub-card{position:relative;overflow:hidden;border-radius:18px;padding:22px;color:#fff;background:linear-gradient(135deg,var(--navy1),var(--navy2),#151d3f);box-shadow:0 22px 46px -26px rgba(20,30,80,.8)}
  .sub-card .ring{position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent,rgba(91,141,255,.18),transparent 30%,rgba(139,92,246,.18),transparent 60%);animation:spin 24s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .sub-card>*{position:relative}
  .sub-card .pill{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;font-weight:700;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.24);padding:5px 11px;border-radius:99px}
  .sub-card .plan{font-family:var(--hd);font-weight:800;font-size:1.7rem;margin:12px 0 2px}
  .sub-card .meta{opacity:.85;font-size:.9rem}
  .sub-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
  .sub-grid .b{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:11px 13px}
  .sub-grid .b span{font-size:.66rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.8}
  .sub-grid .b b{display:block;font-family:var(--hd);font-size:1.05rem;margin-top:3px}

  .field{margin-bottom:14px}.field label{font-size:.8rem;font-weight:600;color:var(--txt-2);display:block;margin-bottom:6px}
  .field input,.field select{width:100%;font-family:var(--bd);font-size:.92rem;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;background:var(--panel-2);color:var(--ink)}
  .field input:focus,.field select:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
  /* A box you cannot type in must not look like one you can. */
  .field input:disabled,.field select:disabled{background:transparent;border-style:dashed;color:var(--faint);cursor:not-allowed}
  .frow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;border-top:1px solid var(--line)}.toggle-row>div:first-child{min-width:0}.toggle-row:first-child{border-top:0}
  .toggle-row .t{font-weight:700;font-size:.92rem}.toggle-row .d{color:var(--faint);font-size:.82rem}
  .sw{width:44px;height:26px;border-radius:99px;background:var(--line-2);position:relative;cursor:pointer;flex:0 0 auto;transition:.18s;border:0}
  .sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:.18s}
  .sw.on{background:var(--primary)}.sw.on::after{left:21px}
  .nrow{display:flex;gap:13px;align-items:flex-start;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow-sm)}
  .nrow.unread{border-color:var(--primary-tint);background:linear-gradient(90deg,var(--primary-tint),var(--panel) 60%)}
  .nic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}.nic svg{width:19px;height:19px}
  .nic.b{background:var(--primary-tint);color:var(--primary-600)}.nic.win{background:var(--win-soft);color:var(--win)}.nic.warn{background:var(--warn-soft);color:var(--warn)}
  .nrow .t{font-weight:700}.nrow .d{color:var(--txt-2);font-size:.85rem}.nrow .tm{margin-left:auto;color:var(--faint);font-size:.78rem;white-space:nowrap}
  .ntxt{flex:1 1 auto;min-width:0}
  .nhead{display:flex;align-items:baseline;gap:10px}
  .nhead .t{flex:1 1 auto;min-width:0}
  .nrow .tm{margin-left:auto;flex:0 0 auto}
  .undot{width:8px;height:8px;border-radius:50%;background:var(--primary);margin-top:0;flex:0 0 auto;align-self:center}
  .faq .q{font-family:var(--hd);font-weight:700;font-size:.98rem;margin-bottom:4px}.faq .a{color:var(--txt-2);font-size:.9rem}.faq>div{margin-bottom:12px}
  .steps{display:flex;flex-direction:column;gap:12px}.step{display:flex;gap:11px;align-items:flex-start}
  .step .si{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:var(--primary-tint);color:var(--primary-600);font-family:var(--hd);font-weight:800}
  .bankbox{background:var(--panel-2);border:1px solid var(--line-2);border-radius:12px;padding:14px;font-size:.88rem}
  .bankbox .kv{display:flex;justify-content:space-between;padding:5px 0}.bankbox .kv span{color:var(--faint)}.bankbox .kv b{font-family:ui-monospace,monospace;font-weight:700}

  .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(30px);background:var(--ink);color:#fff;padding:13px 20px;border-radius:12px;font-weight:600;font-size:.9rem;box-shadow:var(--shadow);opacity:0;transition:.25s;z-index:90;display:flex;align-items:center;gap:9px}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.toast svg{width:18px;height:18px;color:var(--win)}
  .modal{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px}.modal[hidden]{display:none}
  .mback{position:absolute;inset:0;background:rgba(12,18,48,.5);backdrop-filter:blur(2px)}
  .mcard{position:relative;width:min(480px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:22px;animation:pop .2s ease}

  /* A link that is a button, because it opens a dialog rather than
     going anywhere. */
  .linkish{border:0;background:none;padding:0;font:inherit;cursor:pointer;
    color:var(--primary-600);font-weight:600;text-decoration:underline;
    text-underline-offset:2px}
  .linkish:hover{color:var(--primary)}

  /* ── The plan, on the box that charges for it ──────────────────────
     Somebody is about to pay 200 a month. The confirmation listed
     "Monthly plan" in grey beside an amount — the same shape as a 5-euro
     correction.

     What carries it: air, one very large name, and a price that is the
     second thing you read and nothing else competing to be first. The
     movement is two slow aurorae that never stop and never hurry, rather
     than a sheen that fires once and leaves a static card behind. The
     rocket is the quietest thing on it, because a card that shouts its own
     logo at somebody who has already bought is selling to the wrong
     person. */
  .planhero{position:relative;overflow:hidden;isolation:isolate;
    margin:2px 0 16px;border-radius:18px;color:#fff;
    background:linear-gradient(158deg,#04050E,#0b1029 55%,#12183a);
    box-shadow:0 18px 40px -26px rgba(16,22,60,.85),
               inset 0 1px 0 rgba(255,255,255,.07)}
  /* A hairline of brand across the top edge. */
  .planhero::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;
    background:linear-gradient(90deg,transparent,#5B8DFF,#8B5CF6,transparent);
    opacity:.85;z-index:3}
  .planhero .ph-body{position:relative;z-index:2;padding:20px 20px 18px}

  /* The light, moving. Two blobs on long, different periods so they never
     land in the same place twice and it never reads as a loop. */
  .planhero .ph-aur{position:absolute;border-radius:50%;filter:blur(34px);
    pointer-events:none;z-index:0}
  .planhero .ph-aur.a{width:260px;height:260px;top:-120px;left:-70px;
    background:radial-gradient(circle,rgba(91,141,255,.55),transparent 68%);
    animation:phdrift1 17s ease-in-out infinite}
  .planhero .ph-aur.b{width:300px;height:300px;right:-110px;bottom:-150px;
    background:radial-gradient(circle,rgba(139,92,246,.55),transparent 68%);
    animation:phdrift2 23s ease-in-out infinite}
  @keyframes phdrift1{
    0%,100%{transform:translate(0,0) scale(1)}
    50%{transform:translate(38px,26px) scale(1.16)}}
  @keyframes phdrift2{
    0%,100%{transform:translate(0,0) scale(1.05)}
    50%{transform:translate(-34px,-22px) scale(.9)}}

  /* One pass of light on open, and then it is done. */
  .planhero .ph-sheen{position:absolute;inset:0;pointer-events:none;z-index:1;
    background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.16) 50%,transparent 60%);
    transform:translateX(-120%);animation:phsheen 2.4s ease-out .3s 1 forwards}
  @keyframes phsheen{to{transform:translateX(120%)}}

  /* Moved out of the name's corner, and quieter still. */
  .planhero .ph-mark{position:absolute;right:-10px;bottom:-14px;z-index:0;
    opacity:.07;pointer-events:none;transform:rotate(-12deg)}
  .planhero .ph-mark svg{width:96px;height:96px}

  /* Money left, name right. Side by side they competed for the same
     first glance; anchored to opposite corners each gets one. */
  .planhero .ph-head{display:flex;align-items:flex-start;
    justify-content:space-between;gap:14px}
  .planhero .ph-left{min-width:0}
  .planhero .ph-tag{display:block;font-size:.58rem;font-weight:800;
    letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.45)}
  .planhero .ph-name{font-family:var(--hd);font-weight:800;font-size:2.15rem;
    letter-spacing:-.04em;line-height:.95;text-align:right;flex:0 0 auto;
    margin-top:-2px;
    background:linear-gradient(180deg,#ffffff,#c7d4ff);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .planhero .ph-amt{display:flex;align-items:baseline;gap:8px;margin-top:6px}
  .planhero .ph-amt b{font-family:var(--hd);font-weight:800;font-size:1.7rem;
    letter-spacing:-.03em;line-height:1;
    background:linear-gradient(92deg,#dfe8ff,#bcd0ff 45%,#c9b6ff);
    -webkit-background-clip:text;background-clip:text;color:transparent}
  .planhero .ph-amt span{font-size:.8rem;color:rgba(255,255,255,.55)}

  /* STACKED, each pill only as wide as its own words. Wrapping put two on
     one line and the third alone underneath, and a ragged edge reads as an
     accident rather than as a list. Down the left they line up, and the
     eye gets three separate reasons instead of one paragraph of them. */
  .planhero .ph-perks{list-style:none;margin:14px 0 0;padding:0;
    display:flex;flex-direction:column;align-items:flex-start;gap:6px}
  .planhero .ph-perks li{display:inline-flex;align-items:center;gap:6px;
    font-size:.74rem;font-weight:600;color:rgba(255,255,255,.92);
    background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.09);
    border-radius:999px;padding:5px 10px 5px 8px;white-space:nowrap}
  .planhero .ph-perks svg{width:11px;height:11px;flex:0 0 auto;color:#7ef0b8}

  @media (max-width:400px){
    .planhero .ph-body{padding:16px 15px 14px}
    .planhero .ph-name{font-size:1.75rem}
    .planhero .ph-amt b{font-size:1.45rem}
    .planhero .ph-perks li{font-size:.71rem;padding:4px 9px 4px 7px}
  }
  @media (prefers-reduced-motion:reduce){
    .planhero .ph-sheen{display:none}
    .planhero .ph-aur{animation:none}
  }
  @keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
  .mhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}.mhead h2{font-size:1.15rem}.mhead .iconbtn{width:34px;height:34px;font-size:1.1rem;font-weight:600}
  .mlabel{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:16px 0 8px}
  /* Onboarding checklist row. The tick (28px), the icon (28px) and the CTA
     (.btn is white-space:nowrap) can't shrink, so on a narrow screen the text
     absorbed all of it. Below 560px the text takes its own full-width line and
     the CTA drops beneath it instead. */
  /* Tick, icon and title on the first line; description on its own; action
     last. Flat white panels with a 1px line read as unfinished, so each row
     gets a soft vertical wash and lifts a little under the pointer. */
  /* column-gap and row-gap SEPARATELY. A plain gap:10px on a wrapping
     flex row applies between the wrapped LINES too, so the description sat 10px
     below the title on top of its own margin and the button 10px below
     that — three gaps doing the work of one, and at phone width that is
     most of the card. The 10px between the tick, the icon and the title
     is the part that was wanted. */
  .onbrow{display:flex;align-items:center;column-gap:10px;row-gap:3px;flex-wrap:wrap;
    padding:13px 14px;border:1px solid var(--line);border-radius:14px;
    background:linear-gradient(180deg,#fff,var(--panel-2));
    box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 8px 20px -18px rgba(20,30,80,.5);
    transition:transform .14s,box-shadow .14s,border-color .14s}
  .onbrow:hover{transform:translateY(-1px);border-color:var(--line-2);
    box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 14px 26px -18px rgba(20,30,80,.55)}
  /* flex-basis 0, not auto. With auto, the title's own width is its basis,
     so "Request your first ad account" was wider than the space left beside
     a tick and an icon and wrapped to a line of its own — leaving two small
     squares sitting alone above it, which is exactly the layout this was
     meant to fix. At basis 0 it takes what is left and wraps INSIDE its
     column, beside the icon. */
  /* One line, always. The titles are written to fit beside a tick and an
     icon at phone width; the ellipsis is a safety net for a longer one added
     later, not something that should ever fire. Two-line titles beside a
     one-line icon is what made this list look ragged. */
  .onbrow .onb-t{flex:1 1 0;min-width:0;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .onbrow .onb-d{flex:1 1 100%;margin:0;padding-left:76px;line-height:1.35}
  .onbrow .ocat{flex:1 1 100%;margin:9px 0 0;justify-content:center}
  @media(min-width:561px){
    .onbrow .onb-d{flex:1 1 100%}
    .onbrow .ocat{flex:0 0 auto;margin-left:auto;margin-top:0;width:auto}
    /* Back to one line on a wider screen: title and action share the row and
       the description tucks under both. */
    .onbrow .onb-t{flex:1 1 150px}
  }
  /* The done row is the same shape, one size down — tick, icon, title, all
     on one line. It reads as the finished version of the row above it
     rather than as a different kind of thing. */
  .onbrow.is-done .onb-t{flex:1 1 0}
  /* ── Get-started card ───────────────────────────────────────────────
     Quieter than it was. This is the first card on the dashboard, and it
     was also the loudest thing on it: a bright "1/4" pill reporting the
     least urgent information on the page, and four full blocks that only
     ever grew, so the steps still to do were pushed down by the ones
     already handled. */
  .onb{padding:0;overflow:hidden}
  .onb-head{display:flex;align-items:center;gap:12px;width:100%;
    border:0;background:none;cursor:pointer;text-align:left;
    font-family:inherit;color:inherit;padding:16px 18px}
  .onb-head:hover{background:var(--panel-2)}
  .onb-head-t{display:flex;flex-direction:column;gap:2px;min-width:0}
  .onb-head-s{color:var(--faint);font-size:.8rem;font-weight:600}
  /* A thin bar instead of a pill. It sits between the title and the chevron
     and takes whatever room is left, down to nothing on a narrow phone —
     it is an at-a-glance sense of progress, not a number to read. */
  .onb-meter{flex:1 1 40px;min-width:0;max-width:160px;height:5px;border-radius:99px;
    background:var(--line);overflow:hidden;margin-left:auto}
  .onb-meter i{display:block;height:100%;border-radius:99px;background:var(--win);transition:width .3s ease}
  .onb-chev{display:grid;place-items:center;width:28px;height:28px;flex:0 0 auto;
    color:var(--faint);transition:transform .18s ease}
  .onb-chev.up{transform:rotate(180deg)}
  .onb-list{display:flex;flex-direction:column;gap:8px;padding:0 18px 18px}
  /* 28px for BOTH squares on the row. A 26px tick beside a 32px icon is two
     different objects sitting on one line; matched, they read as one
     control-and-label pair. Everything else on the row is measured from
     them: 28 + 10 + 28 + 10 = 76, which is where the title starts and
     therefore where the description must start too. It was indented 44,
     twenty pixels adrift of the text it belongs under. */
  .onb-tick{width:28px;height:28px;border-radius:9px;flex:0 0 auto;
    border:2px solid var(--line-2);background:var(--panel);color:#fff;
    display:grid;place-items:center;cursor:pointer;padding:0;transition:.13s}
  .onb-tick:disabled{cursor:default}
  .onb-tick.on{border-color:var(--win);background:var(--win)}
  /* An OFFER carries a dismiss, not an empty checkbox. Two identical
     squares above the words "1 step left" read as a broken counter even
     though the count was right — one of those squares was never a step. */
  .onb-tick.is-opt{border:0;background:transparent;color:var(--faint);
    font-size:1.05rem;line-height:1;display:grid;place-items:center;
    width:24px;height:24px}
  .onb-tick.is-opt:hover{color:var(--txt-2);background:var(--panel-2)}
  .onb-tick svg{width:15px;height:15px}
  .onb-ic{width:28px;height:28px;border-radius:9px;flex:0 0 auto;display:grid;place-items:center;
    background:var(--primary-tint);color:var(--primary-600)}
  .onb-ic svg{width:17px;height:17px}
  .onb-t{font-weight:700;overflow-wrap:anywhere}
  .onb-d{color:var(--faint);font-size:.82rem;line-height:1.4}
  /* The due row: one line, no filled banner, no solid button. Nothing is
     wrong yet — the fee is simply due — and a notice that shouts competes
     with the balances right above it. */
  /* One line, and a card rather than a slab of amber. Amber text on an amber
     fill next to an amber button was one colour doing three jobs, and it
     read as a warning for something that is not wrong — a fee that is simply
     due. A white card with a single amber marker says "note", and keeps the
     only saturated thing on the row the action you can take. */
  .duerow{display:flex;align-items:center;gap:11px;flex-wrap:nowrap;position:relative;
    background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:11px 13px 11px 15px;
    box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 1px 2px -1px rgba(20,30,80,.16),
               0 14px 28px -24px rgba(20,30,80,.4);overflow:hidden}
  .duerow::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
    background:linear-gradient(180deg,#f5b544,var(--warn))}
  /* The icon carries the amber. One small tile is enough to mark a row as a
     note; a tile AND a button in the same colour was the colour shouting. */
  .duerow .ai{width:30px;height:30px;border-radius:9px;background:var(--warn-soft);display:grid;
    place-items:center;color:#a9740b;flex:0 0 auto}
  .duerow .ai svg{width:16px;height:16px}
  /* Nothing outstanding: same row, no alarm. The rail and the tile drop
     to the page's own blue, which reads as "here is a fact" rather than
     "here is a bill". */
  .duerow.calm::before{background:linear-gradient(180deg,var(--primary),#7c5cff)}
  .duerow.calm .ai{background:var(--primary-tint);color:var(--primary-600)}
  .duerow .dtx{flex:1 1 auto;min-width:0;font-size:.85rem;color:var(--txt-2);line-height:1.3;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* Let THIS one wrap. The row is otherwise a single line by design,
     but the company-details message is 55 characters in about 198px,
     so it read "Add your company details to t..." beside a button
     labelled "Add" — the only sentence telling a new customer why Top
     up and Exchange do nothing, cut off before it says anything. */
  .duerow.msg{align-items:flex-start}
  .duerow.msg .dtx{white-space:normal;line-height:1.35}
  .duerow .dtx b{font-weight:800;color:var(--ink)}
  /* Brand, not amber. The marker down the left edge already says "note", so
     the button does not have to say it again — and an orange pill was the
     most saturated thing on a screen whose whole identity is blue and
     purple, which reads as a foreign object rather than as the thing to
     press. Tinted rather than filled: nothing here is urgent, the fee is
     simply due. */
  .duerow .dlink{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;
    cursor:pointer;font-family:var(--bd);font-weight:700;font-size:.82rem;
    color:var(--primary-600);background:var(--primary-tint);border:1px solid #cfe0ff;
    padding:6px 11px;border-radius:9px;box-shadow:0 1px 0 #fff inset;transition:.13s}
  .duerow .dlink:hover{background:#fff;border-color:var(--primary);
    box-shadow:0 1px 0 #fff inset,0 6px 14px -10px rgba(58,111,255,.7)}
  .duerow .dlink:active{transform:translateY(1px)}
  .duerow .dlink svg{width:14px;height:14px;transition:transform .14s}
  .duerow .dlink:hover svg{transform:translateX(2px)}
  /* Two tiles rather than four, now the balances live in the hero. */
  .stats-2{grid-template-columns:repeat(2,1fr)}
  .stat .sub{color:var(--faint);font-size:.76rem;font-weight:600;margin-top:3px}
  /* A finished step folds to one line: tick, icon, title. No description, no
     "Done" badge, no green fill — it is a record of what is behind you, and
     it should take up about as much room as that deserves. */
  .onbrow.is-done{padding:7px 14px;background:transparent;border-color:transparent;flex-wrap:nowrap;box-shadow:none}
  .onbrow.is-done .onb-tick{width:24px;height:24px;border-radius:8px}
  .onbrow.is-done .onb-tick svg{width:13px;height:13px}
  .onbrow.is-done .onb-ic{width:24px;height:24px;border-radius:8px;background:transparent;color:var(--faint)}
  .onbrow.is-done .onb-ic svg{width:15px;height:15px}
  .onbrow.is-done .onb-t{font-weight:600;color:var(--txt-2);font-size:.88rem;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
  /* Same height as the collapsed card it is standing in for, so the page
     does not jump when the real one takes its place. */
  /* ── The dashboard's first paint ──────────────────────────────────
     Same blocks, same order, same heights as the finished view, so the
     swap moves nothing. One shimmer keyframe shared with .onb-skel. */
  .dash-skel{display:flex;flex-direction:column;gap:16px}
  .dash-skel>*, .dash-skel .ds-card, .dash-skel .ds-stat{
    border-radius:var(--r,16px);
    background:linear-gradient(90deg,var(--panel),var(--panel-2),var(--panel));
    background-size:200% 100%;animation:advskel 1.15s ease-in-out infinite}
  .dash-skel .ds-hero{min-height:150px}
  .dash-skel .ds-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:none;animation:none}
  .dash-skel .ds-card{min-height:118px}
  .dash-skel .ds-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;background:none;animation:none}
  .dash-skel .ds-stat{min-height:86px}
  .dash-skel .ds-block{min-height:180px}
  @media (max-width:640px){
    .dash-skel .ds-stats{grid-template-columns:1fr 1fr}
  }
  @media (prefers-reduced-motion:reduce){
    .dash-skel>*, .dash-skel .ds-card, .dash-skel .ds-stat{animation:none}
  }
  .onb-skel{min-height:74px;padding:0;
    background:linear-gradient(90deg,var(--panel),var(--panel-2),var(--panel));
    background-size:200% 100%;animation:advskel 1.15s ease-in-out infinite}
  @media (prefers-reduced-motion:reduce){.onb-skel{animation:none}}
  /* ── GOOD NEWS TAKES THE LEAST ROOM ───────────────────────────────
     A full card for "nothing needs doing" was about 120px of green at
     the top of the dashboard. One strip, one line, and a single sheen
     that crosses it when it appears so it still feels like an arrival. */
  /* A white card like every other card on the dashboard, with the green
     kept to the one place it means something: the tick. A mint gradient
     under a solid green square under a bordered box read as three
     different greens and a button, not as one calm line of good news. */
  .onb-done{position:relative;overflow:hidden;display:flex;align-items:center;
    gap:12px;padding:12px 10px 12px 14px;border-radius:16px;
    background:var(--panel);border:1px solid var(--line);box-shadow:var(--shadow-sm)}
  .onb-done::after{content:"";position:absolute;inset:0;pointer-events:none;
    background:linear-gradient(105deg,transparent 40%,rgba(16,185,129,.10) 50%,transparent 60%);
    background-size:240% 100%;background-position:190% 0;
    animation:onbsheen 2.4s ease-out 1}
  @keyframes onbsheen{to{background-position:-70% 0}}
  .onb-done-ic{width:32px;height:32px;border-radius:50%;flex:0 0 auto;display:grid;
    place-items:center;background:var(--win-soft);color:var(--win);
    animation:onbpop .42s cubic-bezier(.2,1.5,.4,1) 1}
  .onb-done-ic svg{width:16px;height:16px;stroke-width:3}
  @keyframes onbpop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
  .onb-done-txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
  .onb-done-t{font-family:var(--hd);font-weight:800;font-size:.92rem;line-height:1.25;color:var(--ink)}
  .onb-done-s{color:var(--txt-2);font-size:.8rem;line-height:1.3;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .onb-done-x{position:relative;z-index:1;flex:0 0 auto;width:28px;height:28px;
    display:grid;place-items:center;border-radius:8px;cursor:pointer;
    border:0;background:none;color:var(--faint);transition:.14s}
  .onb-done-x svg{width:13px;height:13px;stroke-width:2.4}
  .onb-done-x:hover{background:var(--panel-2);color:var(--ink)}
  @media (prefers-reduced-motion:reduce){
    .onb-done::after,.onb-done-ic{animation:none}
    .onb-done::after{opacity:0}
  }
  .seg2{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px}
  .seg2 button{border:0;background:none;font-family:var(--bd);font-weight:700;font-size:.86rem;color:var(--txt-2);padding:8px 16px;border-radius:8px;cursor:pointer}
  .seg2 button.on{background:var(--panel);color:var(--primary-600);box-shadow:0 1px 3px rgba(20,30,80,.16)}
  .amtin{display:flex;align-items:center;gap:2px;border:1px solid var(--line-2);border-radius:12px;background:var(--panel-2);padding:6px 14px}
  .amtin span{font-family:var(--hd);font-weight:800;font-size:1.4rem;color:var(--faint)}
  .amtin input{border:0;background:none;outline:0;font-family:var(--hd);font-weight:800;font-size:1.4rem;color:var(--ink);width:100%}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .chip{border:1px solid var(--line-2);background:var(--panel);border-radius:99px;padding:7px 13px;font-weight:700;font-size:.84rem;cursor:pointer;font-family:var(--bd)}
  .chip:hover{border-color:var(--primary);color:var(--primary-600)}
  .drop{border:2px dashed var(--line-2);border-radius:12px;padding:18px;text-align:center;color:var(--faint);font-size:.86rem;cursor:pointer}.drop:hover{border-color:var(--primary);color:var(--primary-600)}
  .drop.on{border-color:var(--win);color:#0e8f66;background:var(--win-soft)}
  .tbl.wide{min-width:600px}.tbl .r{white-space:nowrap}
  .plans{display:flex;flex-direction:column;gap:8px}
  .plan-opt{display:flex;align-items:center;gap:11px;padding:12px 13px;border:1px solid var(--line-2);border-radius:12px;cursor:pointer;transition:.12s}
  .plan-opt:hover{border-color:var(--primary)}.plan-opt.sel{border-color:var(--primary);background:var(--primary-tint)}
  .plan-opt input{accent-color:var(--primary);width:17px;height:17px;flex:0 0 auto}
  .po-h{display:flex;align-items:center;gap:8px;font-weight:800;font-family:var(--hd)}.po-m{color:var(--faint);font-size:.82rem;margin-top:2px}
  .navlink.aff{color:var(--purple)}.navlink.aff svg{color:var(--purple)}.navlink .n.new{background:var(--purple)}
  .mhL{display:flex;align-items:center;gap:11px}
  .mhead .mi{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--primary-tint);color:var(--primary-600)}.mhead .mi svg{width:18px;height:18px}

  .bottombar{display:none}.bb{font-family:var(--bd)}
  @media (max-width:1000px){.search{display:none}}
  @media (max-width:900px){
    /* dvh + scroll + visibility — see the same block in psm-shell-css.ts.
       Without overflow-y the last drawer items (Get help, Affiliate program)
       were unreachable in landscape and on short phones. */
    .sidebar{position:fixed;z-index:60;left:0;top:0;height:100vh;height:100dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding-bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-100%);transition:transform .22s,visibility .22s;box-shadow:var(--shadow);visibility:hidden}.sidebar.open{transform:none;visibility:visible}
    .fbar .fsr input,.fbar select,.fbar input{font-size:16px}
    .stat{min-width:0}.stat .v{min-width:0;overflow-wrap:anywhere}
    .ham{display:grid}.scrim{display:none;position:fixed;inset:0;background:rgba(12,18,48,.4);z-index:55}.scrim.on{display:block}
    .stats{grid-template-columns:repeat(2,1fr)}.grid2,.grid3{grid-template-columns:1fr}.sub-grid{grid-template-columns:1fr 1fr}.frow{grid-template-columns:1fr}
    .tool.wal,.tool.st{display:none}.tb-title{display:none}.tb-brand .mark{display:grid}
    .bottombar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:var(--panel);background:color-mix(in srgb,var(--panel) 96%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:7px 4px calc(7px + env(safe-area-inset-bottom));justify-content:space-around;gap:2px}
    .bb{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;color:var(--faint);font-size:.6rem;font-weight:700;padding:4px 2px;cursor:pointer;transition:.14s}
    .bbic{width:46px;height:28px;border-radius:99px;display:grid;place-items:center;position:relative;transition:.16s}
    .bb svg{width:22px;height:22px}.bb.on{color:var(--primary-600)}.bb.on .bbic{background:var(--primary-tint)}
    /* The bar is 68px plus the notch inset, which is 34px once Safari
       collapses its toolbar — so 92px of padding left about ten
       pixels of the last row under it. */
    .content{padding:20px 16px calc(84px + env(safe-area-inset-bottom))}
  }

  /* Topbar account menu (anchored to the avatar) */
  .usermenu{position:relative;display:inline-flex}
  .umenu{position:absolute;top:calc(100% + 10px);right:0;z-index:82;min-width:210px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);padding:6px;animation:pop .16s ease}
  .umenu-hd{padding:9px 11px 8px;border-bottom:1px solid var(--line);margin-bottom:5px}
  .umenu-hd .nm{font-family:var(--hd);font-weight:800;font-size:.9rem;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .umenu-hd .sub{font-size:.74rem;color:var(--faint);margin-top:2px}
  .umenu-item{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;font-family:var(--bd);font-weight:600;font-size:.9rem;color:var(--ink);padding:10px 11px;border-radius:10px;cursor:pointer;transition:.12s}
  .umenu-item:hover{background:var(--panel-2)}
  .umenu-item svg{width:17px;height:17px;color:var(--txt-2)}
  .umenu-item.danger{color:var(--danger)}.umenu-item.danger:hover{background:var(--danger-soft)}.umenu-item.danger svg{color:var(--danger)}
  .mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:8px}
  .btn.danger{background:var(--danger);box-shadow:0 12px 26px -12px rgba(229,72,77,.7)}.btn.danger:hover{background:var(--danger)}
  /* Phone: wide tables collapse into stacked cards — the header row is
     hidden and each <tr> becomes a bordered card whose <td>s are
     label/value lines (label from the cell's data-label attribute).
     Mirrors the .psmapp shell so advertisers get the same mobile cards
     instead of a horizontally-scrolling table. */
  @media (max-width:640px){
    .tbl.wide{min-width:0}
    .tbl.wide thead{display:none}
    .tbl.wide,.tbl.wide tbody,.tbl.wide tr{display:block;width:100%}
    .tbl.wide tr{border:1px solid var(--line);border-radius:16px;margin:0 0 10px;padding:13px 14px;background:var(--panel);
      box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 1px 2px -1px rgba(20,30,80,.16),0 14px 30px -26px rgba(20,30,80,.45)}
    .tbl.wide tr:last-child{margin-bottom:0}
    .tbl.wide tr:hover td{background:transparent}
    /* No hairline between every field. A five-field card had four rules
       through it, which is more furniture than content; spacing separates
       them perfectly well and the card keeps one line above its action. */
    /* minmax on the label column, and anywhere-break on the value. The
       admin shell caps its label column for exactly this reason and this
       one did not, so a long unbreakable token in the value — a reference
       number, an IBAN — had an uncapped 1fr to grow into and pushed the
       table past its wrapper into a sideways scroll. Only the FIRST cell
       had overflow-wrap; the rest are values, which is where the long
       tokens actually live. */
    .tbl.wide td{display:grid;grid-template-columns:minmax(88px,auto) 1fr;align-items:baseline;gap:3px 16px;padding:5px 0;border:0;text-align:right;min-width:0}
    .tbl.wide td>*{overflow-wrap:anywhere}
    .tbl.wide td::before{/* 11.5px at 6.4:1, not 10.6px at 3.35:1 — this is
      the word that says whether a figure is AMOUNT, BALANCE or FEE, and on
      a phone the numbers were legible while their labels were not. */content:attr(data-label);grid-column:1;grid-row:1;justify-self:start;text-align:left;font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--txt-2);font-weight:700}
    .tbl.wide td>*{grid-column:2;min-width:0}
    .tbl.wide td>span{justify-self:end}
    /* The first cell is the card's TITLE, not another labelled field. Every
       one of these lists leads with the thing the row IS — an invoice number,
       an account name, a client code — and printing "INVOICE  117" as a
       label/value pair buries it among the details. */
    .tbl.wide tr td:first-child{display:block;text-align:left;font-family:var(--hd);font-weight:800;
      font-size:1.02rem;letter-spacing:-.01em;padding:0 0 9px;overflow-wrap:anywhere}
    .tbl.wide tr td:first-child::before{display:none}
    /* ...unless the list asks for it. On the invoices card the title IS
       the payment reference, and printed bare it reads as a serial
       number nobody knows what to do with. An eyebrow above it, not a
       label beside it, so the reference keeps its size. */
    .tbl.wide.lead-label tr td:first-child{padding-top:1px}
    .tbl.wide.lead-label tr td:first-child::before{display:block;
      content:attr(data-label);font-family:var(--bd,inherit);font-size:.68rem;
      letter-spacing:.07em;text-transform:uppercase;color:var(--txt-2);
      font-weight:700;margin:0 0 2px}
    /* A trailing action cell carries no label and gets the full width, with
       one rule above it. A small button floating at the right edge of a card
       is hard to hit and reads as an afterthought. */
    .tbl.wide tr td:last-child:empty{display:none}
    /* ONLY WHEN IT REALLY HOLDS ACTIONS.
       These three assumed the last cell is always a row of buttons, and
       on the referrals table it is the COMMISSION — so the card printed a
       bare green amount under a rule with no label at all, and the value
       (a text node, not an element) auto-placed into the narrow LABEL
       column and sat on the left, where a label belongs. :has() makes the
       test what it was always meant to be. */
    .tbl.wide tr td:last-child:not(:first-child):has(button),
    .tbl.wide tr td:last-child:not(:first-child):has(a.btn){padding:11px 0 0;margin-top:6px;border-top:1px solid var(--line)}
    .tbl.wide tr td:last-child:not(:first-child):has(button)::before,
    .tbl.wide tr td:last-child:not(:first-child):has(a.btn)::before{display:none}
    .tbl.wide tr td:last-child:not(:first-child):has(button)>*,
    .tbl.wide tr td:last-child:not(:first-child):has(a.btn)>*{grid-column:1 / -1}
    .tbl.wide tr td:last-child .btn{width:100%;justify-content:center}
    /* TWO buttons in an action cell. The rule above makes a lone button
       full width, which is right — but it also hit both buttons of a pair,
       so each took 100% of the cell and the card's content came out twice
       as wide as the card. Measured: a 305px cell with 610px of content, so
       the whole invoice table scrolled sideways. They share the row
       instead. */
    /* A payment we are verifying. Not a list row: a thing in progress.
     One fact per line, the state on its own line, and a bar that keeps
     moving — because the honest answer to "has my money arrived" is
     "we are looking", and a static amber pill does not say that.
     The bar is decorative and indeterminate ON PURPOSE. A percentage
     would be a lie: nothing here knows how far along a bank transfer is. */

  /* THREE BUTTONS NOW, NOT TWO. The invoice row gained View beside
     Download, and these were flex:1 1 0 with nowrap labels and nothing to
     clip them: a third button pushed the row past its track instead of
     shrinking inside it. This shell is .advapp, so none of the admin
     shell's action-row rules reach it — it needs its own.

     Equal columns, and the LABEL is what gives way, not the row. */
  .tbl.wide tr td:last-child .actrow{
    display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));
    gap:8px;align-items:center
  }
    /* THREE fit, if they are told to. auto-fit with a 96px minimum
       resolves to two tracks in a 299px cell (375px phone), so Pay now
       / View / Download came out 2 + 1 — and only at 375px, which is
       why it read as intermittent. Same rule the admin shell already
       uses. */
    .tbl.wide tr td:last-child .actrow:has(> :nth-child(3)){grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    .tbl.wide tr td:last-child .actrow:has(> :nth-child(3)) .btn{padding:7px 6px;font-size:.72rem}
    .tbl.wide tr td:last-child .actrow .btn{
      width:100%;min-width:0;justify-content:center;padding:7px 8px;
      font-size:.8rem;gap:5px
    }
    .tbl.wide tr td:last-child .actrow .btn svg{flex:0 0 auto}
    .tbl.wide tr td:last-child .actrow .alab{
      min-width:0;overflow:hidden;text-overflow:ellipsis
    }
    .tbl.wide td[colspan]{display:block;text-align:center;padding:22px 2px}
    .tbl.wide td[colspan]::before{display:none}
    .tbl.wide td[colspan]{border-top:0;margin-top:0}
  }


  /* OUT OF THE 640px BLOCK — this time actually out of it.
     A previous pass wrote that comment and left the rules where they
     were: the @media (max-width:640px) block opened 80 lines above them
     and did not close until 50 lines below, so above 640px the "your
     money is on its way" card — the one telling a customer their
     transfer has arrived and is being checked — still rendered with no
     card, no amber and no progress bar. A comment is not a change. */
  .ptup{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;
    padding:13px 14px;border-radius:15px;border:1px solid #f3e3c2;
    background:linear-gradient(180deg,#fffdf8,#fff8ea);margin-top:12px}
  .ptup+.ptup{margin-top:10px}
  .ptup .ico{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;
    background:#fdf0d5;color:#b07d10;flex:0 0 auto;
    animation:ptup-ring 3s ease-out infinite}
  .ptup .ico svg{width:18px;height:18px}
  .ptup .l1{font-family:var(--hd);font-weight:800;letter-spacing:-.01em;
    font-variant-numeric:tabular-nums}
  .ptup .l2{color:var(--faint);font-size:.82rem;margin-top:1px;
    font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  .ptup .l3{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
  .ptup .l3t{color:var(--txt-2);font-size:.8rem}
  .ptup .bar{grid-column:1 / -1;height:4px;border-radius:99px;background:#f4e6c8;
    overflow:hidden;margin-top:11px}
  .ptup .bar i{display:block;height:100%;width:34%;border-radius:99px;
    background:linear-gradient(90deg,#f0b429,#ffdd8a);
    animation:ptup-run 2s cubic-bezier(.45,.05,.55,.95) infinite}
  @keyframes ptup-run{0%{transform:translateX(-110%)}100%{transform:translateX(300%)}}
  @keyframes ptup-ring{
    0%{box-shadow:0 0 0 0 rgba(240,180,41,.5)}
    70%{box-shadow:0 0 0 10px rgba(240,180,41,0)}
    100%{box-shadow:0 0 0 0 rgba(240,180,41,0)}
  }
  /* No motion, no lie: the bar becomes a full quiet track rather than a
     stalled sliver that looks stuck. */
  @media (prefers-reduced-motion:reduce){
    .ptup .bar i{width:100%;animation:none;opacity:.5}
    .ptup .ico{animation:none}
  }

  /* ── The two bars ──────────────────────────────────────────────────
     These frame every screen a customer sees. Both were correct and
     plain; this is the difference between "a bar" and a surface.
     saturate() lifts the colour of whatever scrolls underneath so the
     bar reads as glass rather than a grey wash — biggest step, one
     property. The inset highlight is the lit top edge of that pane. */
  .topbar{
    background:var(--panel);
    background:linear-gradient(180deg,
      color-mix(in srgb,var(--panel) 92%,transparent),
      color-mix(in srgb,var(--panel) 78%,transparent));
    -webkit-backdrop-filter:blur(16px) saturate(1.6);
    backdrop-filter:blur(16px) saturate(1.6);
    border-bottom:0;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 1px 0 var(--line);
  }
  .topbar::after{
    content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;
    background:linear-gradient(90deg,transparent,var(--line-2) 22%,var(--line-2) 78%,transparent);
    pointer-events:none;
  }
  .tb-brand .mark{box-shadow:0 0 0 1px rgba(91,141,255,.3),0 6px 18px -8px rgba(91,141,255,.75)}

  @media (max-width:900px){
    /* The thumb rail gets the most care: lifted off the edge with light,
       a lit top edge, and generous taps. */
    .bottombar{
      background:var(--panel);
      background:linear-gradient(180deg,
        color-mix(in srgb,var(--panel) 86%,transparent),
        color-mix(in srgb,var(--panel) 98%,transparent));
      -webkit-backdrop-filter:blur(18px) saturate(1.7);
      backdrop-filter:blur(18px) saturate(1.7);
      border-top:0;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 -1px 0 var(--line),
        0 -14px 34px -22px rgba(20,30,80,.5);
      padding:6px 6px calc(6px + env(safe-area-inset-bottom));
    }
    /* The pill is a pseudo-element that SCALES, so the active state
       springs in while the icon itself stays perfectly still —
       movement under a finger reads as a glitch. */
    .bbic::before{
      content:"";position:absolute;inset:0;border-radius:99px;
      background:var(--primary-tint);transform:scale(.6);opacity:0;
      transition:transform .26s cubic-bezier(.34,1.56,.64,1),opacity .18s ease;
    }
    .bb.on .bbic::before{transform:scale(1);opacity:1}
    .bbic svg{position:relative;z-index:1}
    /* Weight change alongside colour: a stronger "you are here" signal
       than hue alone, and it survives colour-blindness. */
    .bb.on svg{stroke-width:2.3}
    .bb{gap:3px;font-size:.62rem;letter-spacing:.01em;padding:5px 2px;border-radius:12px;
      transition:color .16s ease,transform .12s ease}
    .bb:active{transform:scale(.94)}
  }

    /* ── A thumb needs 44px, and these are 26 to 37 ──────────────────────
     The admin shell grew its hit areas for exactly this reason and the two
     shells REAL CUSTOMERS use never got the same treatment. Measured here:
     the settings toggles are 26px tall, a modal close 34, the quick-amount
     chips about 35, the segmented control about 37 — against the ~44px a
     thumb hits reliably.

     The hit area grows and the control does not, via an overlay pinned to
     it, and VERTICAL ONLY: these sit in rows with small gaps, and a wider
     overlay would reach into a neighbour — on overlap the later element in
     the DOM wins, so the button beside the one you aimed at would fire. A
     wrong action is worse than a missed one.

     pointer:coarse only: with a mouse the visible edge IS the target. */
  @media (pointer:coarse){
    /* ── THE CONTROLS THAT WERE ACTUALLY MISSING ──────────────────
       .chip is dead markup in both shells and .sw only exists in
       settings, so two of the six entries were spent on nothing while
       these six real actions were uncovered: the three hero buttons
       (37.8px below 420), the onboarding tick (28px, on the first card
       a new customer sees), Pay now on the fee row (~32px), the
       copy-your-reference control (~25px), and on the affiliate side
       the date range and Export (39.1 / 36.6px). */
    .sw,
    .chip,
    .seg2 button,
    .mhead .iconbtn,
    .actrow .btn,
    .btn.sm,
    .hero-btn,
    .onb-tick,
    .duerow .dlink,
    .copyref{position:relative}
    /* ::before for the switch, NOT ::after. .sw::after IS the white
       knob — this block re-declared the same pseudo-element at the same
       specificity, later in the file, and overrode its top, left and
       height without resetting width:20px, background:#fff or
       border-radius:50%. So on every touch device the knob became a
       20px-wide, 44px-tall white capsule pinned to the left, hanging
       9px out of a 26px track, and .sw.on::after still slid it. Every
       settings toggle in both apps, on every phone. */
    .sw::before,
    .chip::after,
    .seg2 button::after,
    .mhead .iconbtn::after,
    .actrow .btn::after,
    .btn.sm::after,
    .hero-btn::after,
    .onb-tick::after,
    .duerow .dlink::after,
    .copyref::after{
      content:"";position:absolute;left:0;right:0;top:50%;
      transform:translateY(-50%);height:44px;
    }
  }

  /* Scoped. Every other rule in this file is; this one was not, so it
     froze animation across the whole document — toasts, the push
     prompt, every portal. */
  @media (prefers-reduced-motion:reduce){.advapp *{animation:none!important;transition:none!important}}

/* ── The iOS zoom trap ────────────────────────────────────────────────
   Mobile Safari ZOOMS THE PAGE whenever a focused input is styled below
   16px. It is not a preference and there is no way to opt out short of
   disabling pinch-zoom entirely, which breaks accessibility. So every
   field in this shell is 16px on a phone — padding still controls how
   tall the control looks, and 16px vs 15px is barely visible, but the
   difference between the page holding still and lurching sideways when
   someone taps a field is not subtle at all.

   One rule per shell rather than per field, so the next input added
   cannot reintroduce it. */
@media (max-width:640px){
  .advapp input,
  .advapp select,
  .advapp textarea{font-size:16px}
}

/* ── Top bar, brought up to the super-admin bar's treatment ──────────────
   The admin shell had a full refinement round that this one never got, and
   it showed: four different control sizes in one bar, a loose hamburger and
   a loose brand tile beside a grouped pill, a chevron making the avatar the
   one odd width, and a standalone sign-out duplicating the avatar menu's.
   Same rules here so a customer's bar is as considered as ours. */
.advapp .tb-left{display:none}
.advapp .topbar{padding-left:14px;padding-right:14px}
@media (max-width:900px){
  .advapp .tb-left{display:inline-flex}
  /* More room LEFT and RIGHT than above and below. Even padding measures the
     same on four sides but does not look it: a filled tile reads as touching
     an edge it is merely close to. */
  .advapp .toolbar{padding:4px 8px;border-radius:14px;gap:5px}

  /* ONE square for every control: 36x36, 10px radius, icon dead centre.
     place-items:center is load-bearing — .tool is an inline-flex with
     gap:8px and no justify-content, so in a zero-padding 36px box the line
     starts at the left edge and every icon sits 8px left of centre. */
  /* 40, not 36. Eighty lines up this file argues that a thumb needs 44px
     "and these are 26 to 37" — and then set the hamburger, the bell and
     the avatar, the three controls on every screen, to 36. .tool is not
     in the pointer:coarse overlay either, so nothing was making up the
     difference. The one-square rhythm is worth keeping; the square is
     40. */
  .advapp .toolbar .tool{height:40px;padding:0 9px;border-radius:10px}
  .advapp .toolbar .ic-btn,
  .advapp .tb-left .ham{display:grid;place-items:center;width:40px;height:40px;padding:0;gap:0}
  /* Optical sizing, not box sizing. Lucide draws each glyph to a different
     fraction of its 24-unit viewBox, so at a uniform 18px the actual INK
     came out hamburger 10.5px, bell 16.5, rocket 16.1, logout 15.0 — the
     hamburger 57% smaller than its neighbours, which is why it looked like
     it was floating. Each is scaled so the ink lands near 16px. */
  .advapp .toolbar .ic-btn svg,
  .advapp .tb-left .ham svg{display:block}
  .advapp .topbar .ham svg{width:25px;height:25px}
  .advapp .topbar button.ic-btn:not(.ham) svg{width:19px;height:19px}

  /* The brand tile is a control-sized square too, so the left cluster keeps
     the same rhythm as the right instead of a 30px tile beside a 36px one. */
  .advapp .tb-left .tb-brand{display:inline-flex;align-items:center}
  .advapp .tb-left .mark{display:grid;place-items:center;width:40px;height:40px;border-radius:11px}
  .advapp .tb-left .mark svg{width:18px;height:18px;display:block}

  /* The avatar kept its chevron and came out 58px — the one odd size, sitting
     in the middle of the right-hand cluster, which is exactly where a broken
     rhythm shows most. On a phone a tappable avatar tile is already
     understood to open a menu. */
  .advapp .toolbar .ava-btn{display:grid;place-items:center;width:40px;height:40px;padding:0;gap:0}
  .advapp .toolbar .ava-btn .avatar{width:34px;height:34px;border-radius:50%;overflow:hidden}
  /* The CHEVRON, not the avatar. ".ava-btn svg" is every svg in the
     button and the avatar is one of them, nested inside .avatar - so
     this hid the avatar itself on a phone and left an empty dark disc
     in the toolbar. */
  .advapp .toolbar .ava-btn > svg{display:none}
  .advapp .toolbar .ava-btn .avatar > svg{display:block;width:100%;height:100%}
  /* Duplicates the one inside that menu. */
  .advapp .topbar .so-btn{display:none}
  /* These render to 0x0 here — hidden by their own rule above — so take them
     out of the flex line entirely rather than leaving zero-size nodes
     between real controls. */
  .advapp .topbar .tool.st,
  .advapp .topbar .tool.wal{display:none}

  .advapp .topbar{gap:8px;padding:8px 12px}
}
/* Quiet tiles, not boxed ones: an outlined box per icon made the bar busy.
   The group already reads as a group. */
.advapp .tool.ic-btn,
.advapp .tool.ava-btn{background:transparent;border:1px solid transparent}
.advapp .tool.ic-btn:hover,
.advapp .tool.ava-btn:hover{background:var(--panel-2);border-color:var(--line)}

/* ── A generated face inside the avatar chip ────────────────────────────
   components/ui/psm-avatar.tsx draws an SVG disc. The chip around it
   keeps its size, its radius and — importantly — its ::after status dot,
   which a replaced element like <svg> cannot carry itself. The chip's own
   brand background would otherwise show as a square behind a round face,
   so it steps aside when it is holding one. */
  .avatar:has(> svg),.avatar:has(> *){background:none;color:transparent;box-shadow:none}
  .avatar > svg{width:100%;height:100%;border-radius:inherit;display:block}

/* ── REFERRALS: THE EARNINGS CABINET ─────────────────────────────────────
   The owner, 22-09: "first the casino card and the stats, then the link --
   the link can be much more subtle". The affiliate portal's hero, brought
   to the advertiser's Referrals tab: dark ground, a slow ribbon, gold
   light, coins rising, and the figure itself lit. Decoration is
   aria-hidden, never clickable, and dead still under reduced motion. */
  .xhero{position:relative;overflow:hidden;isolation:isolate;border-radius:22px;
    padding:26px 18px 22px;text-align:center;color:#fff;
    background:radial-gradient(130% 120% at 50% -20%,rgba(91,141,255,.42),transparent 55%),
      radial-gradient(80% 110% at 92% 0,rgba(139,92,246,.34),transparent 55%),
      radial-gradient(80% 110% at 8% 8%,rgba(24,184,206,.22),transparent 55%),
      linear-gradient(165deg,#090d22 0%,#0c1230 52%,#131a3c 100%);
    border:1px solid rgba(120,150,255,.26);
    box-shadow:0 24px 50px -30px rgba(10,16,48,.85),inset 0 1px 0 rgba(255,255,255,.08)}
  .xhero .xh-ribbon{position:absolute;inset:-45%;z-index:0;pointer-events:none;
    background:conic-gradient(from 0deg,transparent,rgba(139,92,246,.18),transparent 26%,
      rgba(91,141,255,.22),transparent 56%,rgba(24,184,206,.16),transparent 82%);
    animation:xhspin 20s linear infinite}
  @keyframes xhspin{to{transform:rotate(1turn)}}
  .xhero .xh-glow{position:absolute;top:40%;left:50%;width:min(520px,96%);height:210px;z-index:0;
    pointer-events:none;transform:translate(-50%,-50%);filter:blur(12px);
    background:radial-gradient(ellipse at center,rgba(255,198,64,.38),rgba(255,170,40,0) 66%);
    animation:xhglow 3.4s ease-in-out infinite}
  @keyframes xhglow{0%,100%{opacity:.72;transform:translate(-50%,-50%) scale(1)}
    50%{opacity:1;transform:translate(-50%,-50%) scale(1.07)}}
  .xhero .xh-coins{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}
  .xhero .xh-coins span{position:absolute;bottom:-30px;font-family:var(--hd);font-weight:800;
    color:rgba(255,198,64,.5);text-shadow:0 0 14px rgba(255,170,40,.55);
    animation:xhcoin linear infinite;will-change:transform,opacity}
  .xhero .xh-coins span:nth-child(1){left:6%;font-size:1rem;animation-duration:11s;animation-delay:0s}
  .xhero .xh-coins span:nth-child(2){left:18%;font-size:.78rem;animation-duration:15s;animation-delay:-3s}
  .xhero .xh-coins span:nth-child(3){left:31%;font-size:1.25rem;animation-duration:13s;animation-delay:-7s}
  .xhero .xh-coins span:nth-child(4){left:45%;font-size:.86rem;animation-duration:17s;animation-delay:-1s}
  .xhero .xh-coins span:nth-child(5){left:59%;font-size:1.1rem;animation-duration:12s;animation-delay:-9s}
  .xhero .xh-coins span:nth-child(6){left:72%;font-size:.8rem;animation-duration:16s;animation-delay:-5s}
  .xhero .xh-coins span:nth-child(7){left:85%;font-size:1.05rem;animation-duration:14s;animation-delay:-12s}
  .xhero .xh-coins span:nth-child(8){left:94%;font-size:.75rem;animation-duration:18s;animation-delay:-8s}
  @keyframes xhcoin{0%{transform:translateY(0) rotate(0deg) scale(.9);opacity:0}12%{opacity:1}
    82%{opacity:1}100%{transform:translateY(-360px) rotate(240deg) scale(1.1);opacity:0}}
  .xhero .xh-in{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center}
  .xh-eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:800;
    font-size:.7rem;letter-spacing:.24em;text-transform:uppercase;color:#ffd98a;
    text-shadow:0 2px 14px rgba(255,190,60,.45)}
  .xh-eyebrow svg{width:14px;height:14px;color:#ffcf6a}
  .xh-amt{position:relative;display:inline-block;margin:0;max-width:100%;font-family:var(--hd);
    font-weight:800;letter-spacing:-.035em;line-height:.95;font-size:clamp(2.5rem,12.5vw,4.4rem);
    background:linear-gradient(100deg,#e0980f 0%,#ffdf85 28%,#fff7de 42%,#ffdf85 56%,#e0980f 82%);
    background-size:230% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 10px 22px rgba(255,170,40,.32));animation:xhshine 3.8s ease-in-out infinite}
  @keyframes xhshine{0%{background-position:185% 0}55%,100%{background-position:-45% 0}}
  .xh-amt .cur{font-size:.52em;vertical-align:.14em;margin-right:.04em;
    -webkit-text-fill-color:#ffcf6a;color:#ffcf6a}
  .xh-amt .usd{font-size:.36em;letter-spacing:-.01em;opacity:.85}
  .xh-amt2{margin-top:6px;font-size:clamp(1.5rem,7.5vw,2.6rem)}
  .xh-sub{margin:10px auto 0;max-width:32ch;font-size:.8rem;line-height:1.45;color:rgba(255,255,255,.7)}
  .xh-tiles{display:inline-flex;margin:18px auto 0;border-radius:16px;overflow:hidden;
    background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);
    -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 16px 30px -18px rgba(0,0,0,.6)}
  .xh-t{display:flex;flex-direction:column;align-items:center;padding:11px 20px;border:0;
    background:none;color:inherit;font:inherit;cursor:pointer;transition:background .14s}
  .xh-t+.xh-t{border-left:1px solid rgba(255,255,255,.14)}
  .xh-t:hover{background:rgba(255,255,255,.07)}
  .xh-t .v{font-family:var(--hd);font-weight:800;font-size:1.45rem;line-height:1;color:#9db8ff}
  .xh-t.win .v{color:#63f0c1}.xh-t.gold .v{color:#ffd98a}
  .xh-t .l{margin-top:5px;font-size:.6rem;font-weight:700;letter-spacing:.08em;
    text-transform:uppercase;color:rgba(255,255,255,.62)}
  .xh-pill{display:inline-flex;align-items:center;gap:7px;margin-top:14px;padding:8px 14px;
    border-radius:99px;background:rgba(16,185,129,.16);border:1px solid rgba(16,185,129,.42);
    color:#63f0c1;font-weight:700;font-size:.8rem;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
  .xh-pill svg{width:15px;height:15px}
  @media (max-width:380px){.xh-t{padding:10px 13px}.xh-t .v{font-size:1.25rem}}
  @media (prefers-reduced-motion:reduce){
    .xhero .xh-ribbon,.xhero .xh-glow,.xh-amt{animation:none}
    .xhero .xh-coins{display:none}}

/* The four figures under it: the same tiles as everywhere, each lit from
   its own corner in its own colour. */
  .xstats .stat{position:relative;overflow:hidden}
  .xstats .stat::after{content:"";position:absolute;right:-34px;top:-34px;width:96px;height:96px;
    border-radius:50%;pointer-events:none;background:radial-gradient(circle,var(--xg,rgba(58,111,255,.16)),transparent 70%)}
  .xstats .stat.g-gold{--xg:rgba(239,176,44,.26)}.xstats .stat.g-win{--xg:rgba(16,185,129,.22)}
  .xstats .stat.g-blue{--xg:rgba(58,111,255,.2)}.xstats .stat.g-purple{--xg:rgba(139,92,246,.22)}
  .xstats .stat .v.gold{color:#a9740b}.xstats .stat .v.win{color:var(--win)}
  .xstats.busy .stat .v{opacity:.4;transition:opacity .15s}
  .xlist.busy .xrow,.xlist.busy .xl-sum b{opacity:.4;transition:opacity .15s}

/* The link, quiet: a tool, not the headline. */
  .xshare{padding:14px 16px}
  .xshare .xs-top{display:flex;align-items:flex-start;gap:11px}
  .xshare .xs-top .ci{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:0 0 auto}
  .xshare .xs-top .ci svg{width:16px;height:16px}
  .xshare h2{font-size:.98rem}
  .xshare .cap{margin:2px 0 0;font-size:.8rem}
  .xs-link{margin-top:11px;padding:9px 11px;border-radius:10px;background:var(--panel-2);
    border:1px solid var(--line-2);font-size:.8rem;color:var(--primary-600);
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .xs-acts{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap}
  .xs-acts .btn{flex:1 1 0;justify-content:center;min-width:0}
  .xs-acts .btn svg{flex:0 0 auto;width:16px;height:16px}
  .xs-acts .btn.wa svg{color:#1faa53}

/* Lists as rows, not as a card per line: one line of name, one line of
   detail, the money on the right. A phone showed four label/value pairs
   per commission, a screen tall for two of them. */
  .xlist{padding:6px 0 4px}
  .xl-head{display:flex;align-items:center;gap:8px;padding:10px 16px 8px}
  .xl-head h2{display:flex;align-items:center;gap:8px;font-size:1.02rem}
  .xl-head h2 svg{width:18px;height:18px;color:var(--primary-600)}
  .xl-count{margin-left:auto;min-width:24px;height:22px;padding:0 7px;border-radius:99px;
    display:inline-grid;place-items:center;font-size:.72rem;font-weight:800;
    background:var(--primary-tint);color:var(--primary-600)}
  .xrow{display:flex;align-items:center;gap:11px;width:100%;padding:9px 16px;margin:0;
    border:0;border-top:1px solid var(--line);background:none;color:inherit;font:inherit;text-align:left}
  button.xrow{cursor:pointer;transition:background .12s}
  button.xrow:hover{background:var(--panel-2)}
  .xrow .av{width:34px;height:34px;border-radius:11px;flex:0 0 auto;display:grid;place-items:center;
    font-family:var(--hd);font-weight:800;font-size:.76rem;color:var(--primary-600);
    background:linear-gradient(135deg,var(--primary-tint),#f3e8ff)}
  .xrow .pfi{width:34px;height:34px;border-radius:11px}
  .xrow .pfi .ic{width:17px;height:17px}
  .xrow .pfi.k-sub{background:var(--primary-tint);border-color:transparent;color:var(--primary-600)}
  .xrow .pfi.k-bonus{background:var(--gold-soft);border-color:transparent;color:#a9740b}
  .xrow .mid{min-width:0;flex:1 1 auto;display:flex;flex-direction:column;gap:2px}
  .xrow .nm{display:flex;align-items:center;gap:6px;min-width:0;font-weight:700;font-size:.88rem}
  .xrow .nm .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .xrow .sm{font-size:.74rem;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .xrow .rt{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
  .xrow .amt{font-family:var(--hd);font-weight:800;font-size:.92rem;color:var(--win);white-space:nowrap}
  .xrow .amt.rev{color:var(--faint);text-decoration:line-through}
  .badge.xs{padding:1px 7px;font-size:.64rem;gap:4px}
  .xl-empty{margin:0;padding:18px 16px;text-align:center;font-size:.84rem;color:var(--faint);
    border-top:1px solid var(--line)}
  .xl-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:0 16px 10px}
  .xl-tools select{border:1px solid var(--line-2);border-radius:10px;padding:6px 9px;
    background:var(--panel);font:inherit;font-size:.8rem}
  .xl-tools .seg2 button{padding:6px 10px;font-size:.78rem}
  .xl-sum{display:flex;gap:14px;flex-wrap:wrap;padding:0 16px 10px;font-size:.82rem;color:var(--txt-2)}
  .xl-sum b{color:var(--ink)}

/* ── EVERY COMMISSION: a title, one row of kinds, one row of sums ───────
   The sums are the status filter -- each the sum of the rows it shows --
   so the card has two quiet rows above the list, not four. */
  .xl-ic{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;flex:0 0 auto;
    color:var(--primary-600);background:linear-gradient(135deg,var(--primary-tint),#f3e8ff)}
  .xl-ic svg{width:18px;height:18px}
  .xl-ttl{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto}
  .xl-ttl h2{margin:0;line-height:1.2}
  .xl-sub{font-size:.74rem;font-weight:600;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .xl-focus{display:flex;align-items:center;gap:6px;margin:0 16px 10px;padding:6px 6px 6px 12px;border-radius:12px;
    background:var(--primary-tint);color:var(--primary-600);font-size:.8rem;font-weight:600}
  .xl-focus b{font-weight:800}
  .xl-focus button{margin-left:auto;border:0;background:var(--panel);color:var(--primary-600);font:inherit;
    font-weight:700;font-size:.74rem;padding:5px 10px;border-radius:99px;cursor:pointer}
  .xl-kind{margin:0 16px 10px}
  .xl-money{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:0 16px 12px}
  .xm{display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;padding:9px 10px;
    border-radius:13px;border:1px solid var(--line);background:var(--panel);font:inherit;color:inherit;
    text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .2s,background .2s,transform .15s}
  .xm:hover{border-color:var(--line-2)}
  .xm:active{transform:scale(.98)}
  .xm .l{max-width:100%;font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
    color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .xm .v{max-width:100%;font-family:var(--hd);font-weight:800;font-size:clamp(.82rem,3.7vw,1rem);
    letter-spacing:-.01em;color:var(--ink);white-space:nowrap}
  .xm .v .v2{font-size:.8em;margin-top:1px;opacity:.8}
  .xm.on{background:linear-gradient(180deg,var(--xm-t),var(--panel) 80%);border-color:var(--xm-b);
    box-shadow:0 0 0 3px var(--xm-r)}
  .xm.on .l{color:var(--xm-c)}
  .xm.b{--xm-t:#eef3ff;--xm-b:rgba(58,111,255,.55);--xm-r:rgba(58,111,255,.12);--xm-c:var(--primary-600)}
  .xm.g{--xm-t:#fff7e6;--xm-b:rgba(239,176,44,.75);--xm-r:rgba(239,176,44,.16);--xm-c:#a9740b}
  .xm.w{--xm-t:#eafaf3;--xm-b:rgba(16,185,129,.6);--xm-r:rgba(16,185,129,.14);--xm-c:var(--win)}
  .xlist.busy .xm .v{opacity:.4;transition:opacity .15s}

/* ── AN APPLICATION'S ANSWER ─────────────────────────────────────────────
   Received, what happens now, what comes after -- the step we are on lit
   and breathing. A light card with a brand-gradient edge, not the dark
   offer with its button greyed out. */
  .appcard{position:relative;border-radius:20px;padding:20px 18px 18px;background:var(--panel);
    border:1px solid transparent;
    background-image:linear-gradient(var(--panel),var(--panel)),linear-gradient(135deg,#5b8dff,#8b5cf6 55%,#18b8ce);
    background-origin:border-box;background-clip:padding-box,border-box;
    box-shadow:0 22px 44px -30px rgba(40,50,140,.55)}
  .appcard.refused{background-image:linear-gradient(var(--panel),var(--panel)),linear-gradient(135deg,#ffb020,#e5484d)}
  .ac-top{display:flex;gap:13px;align-items:flex-start}
  .ac-top h2{font-size:1.12rem;margin:2px 0 4px}
  .ac-top .cap{margin:0}
  .ac-ic{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:0 0 auto;color:#fff}
  .ac-ic svg{width:21px;height:21px}
  .ac-ic.ok{background:linear-gradient(135deg,#34d399,#10b981);box-shadow:0 10px 22px -10px rgba(16,185,129,.8)}
  .ac-ic.warn{background:linear-gradient(135deg,#ffb020,#e5484d);box-shadow:0 10px 22px -10px rgba(229,72,77,.7)}
  .ac-steps{list-style:none;margin:18px 0 14px;padding:0;display:grid;gap:0}
  .ac-steps li{position:relative;display:flex;gap:12px;align-items:flex-start;padding:0 0 16px}
  .ac-steps li:last-child{padding-bottom:0}
  .ac-steps li::before{content:"";position:absolute;left:12px;top:26px;bottom:2px;width:2px;
    background:var(--line-2);border-radius:2px}
  .ac-steps li:last-child::before{display:none}
  .ac-steps li.done::before{background:linear-gradient(#10b981,#5b8dff)}
  .ac-steps .dot{width:26px;height:26px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;
    background:var(--panel-2);border:2px solid var(--line-2);color:#fff}
  .ac-steps .dot svg{width:14px;height:14px}
  .ac-steps li.done .dot{background:var(--win);border-color:var(--win)}
  .ac-steps li.now .dot{background:var(--panel);border-color:var(--primary);
    box-shadow:0 0 0 4px rgba(58,111,255,.16);animation:acpulse 1.8s ease-in-out infinite}
  .ac-steps li.now .dot::after{content:"";width:10px;height:10px;border-radius:50%;
    background:linear-gradient(135deg,#5b8dff,#8b5cf6)}
  @keyframes acpulse{50%{box-shadow:0 0 0 8px rgba(58,111,255,.08)}}
  .ac-steps .t{display:flex;flex-direction:column;gap:1px;padding-top:2px}
  .ac-steps .t b{font-size:.9rem}
  .ac-steps .t small{font-size:.76rem;color:var(--faint)}
  .ac-steps li:not(.done):not(.now) .t b{color:var(--txt-2)}
  .ac-note{margin:14px 0 12px;font-size:.84rem;color:var(--txt-2)}
  .ac-acts{display:flex;gap:8px;flex-wrap:wrap}
  .ac-acts .btn{flex:1 1 0;justify-content:center;min-width:0}
  .appcard .btn svg{flex:0 0 auto;width:16px;height:16px}
  .appcard .btn.wa svg{color:#1faa53}
  .ac-help{width:100%;justify-content:center}
  @media (prefers-reduced-motion:reduce){.ac-steps li.now .dot{animation:none}}
  .xload{display:flex;flex-direction:column;gap:12px;padding:22px 18px}
  .xload .sk{display:block;height:13px;border-radius:8px;
    background:linear-gradient(90deg,var(--panel-2) 0%,#e6eaf6 45%,var(--panel-2) 90%);background-size:220% 100%;
    animation:xsk 1.2s linear infinite}
  .xload .sk.w40{width:40%;height:18px}.xload .sk.w90{width:90%}.xload .sk.w70{width:70%}
  .xload .sk.btn{width:100%;height:40px;border-radius:12px;margin-top:6px}
  @keyframes xsk{from{background-position:120% 0}to{background-position:-100% 0}}
  @media (prefers-reduced-motion:reduce){.xload .sk{animation:none}}

/* ── ONE ROW, AND A THUMB THAT GLIDES (slide-seg.tsx) ──────────────────
   The owner: "moet op 1 rij, iets super moois". Every choice in view, the
   chosen one lit by a thumb that slides to it with a little overshoot. */
  .sseg{position:relative;display:flex;gap:2px;padding:4px;border-radius:999px;isolation:isolate}
  .sseg-thumb{position:absolute;z-index:0;top:4px;bottom:4px;left:0;width:var(--tw,0px);
    transform:translateX(var(--tx,0px));border-radius:999px;pointer-events:none;overflow:hidden}
  .sseg[data-ready] .sseg-thumb{transition:transform .45s cubic-bezier(.3,1.3,.45,1),width .45s cubic-bezier(.3,1.3,.45,1)}
  .sseg-shine{position:absolute;inset:0;transform:translateX(-110%);
    background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%);
    animation:ssegshine .9s .2s ease-out forwards}
  @keyframes ssegshine{to{transform:translateX(110%)}}
  .sseg-opt{position:relative;z-index:1;flex:1 1 0;min-width:0;display:inline-flex;align-items:center;
    justify-content:center;gap:6px;border:0;background:none;font:inherit;font-weight:700;font-size:.8rem;
    letter-spacing:-.005em;padding:10px 4px;border-radius:999px;cursor:pointer;white-space:nowrap;
    overflow:hidden;text-overflow:ellipsis;color:var(--txt-2);transition:color .25s,transform .15s,background .2s}
  .sseg-opt:hover{color:var(--ink)}
  .sseg-opt:active{transform:scale(.96)}
  .sseg-opt:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
  .sseg-opt svg{width:16px;height:16px;flex:0 0 auto}
  .sseg-opt.wide{display:none}
  @media (min-width:640px){.sseg-opt.wide{display:inline-flex}}
  @media (max-width:350px){.sseg-opt{font-size:.74rem}}
  /* brand: a recessed glass track, a gradient thumb, white text on it */
  .sseg.brand{background:linear-gradient(180deg,#e8ecf8,#f4f6fc);border:1px solid var(--line);
    box-shadow:inset 0 1px 3px rgba(20,30,80,.08),0 1px 0 #fff}
  .sseg.brand .sseg-thumb{background:linear-gradient(120deg,#3a6fff 0%,#6a5cff 55%,#9b5cf6 100%);
    box-shadow:0 8px 20px -8px rgba(76,96,255,.9),inset 0 1px 0 rgba(255,255,255,.35)}
  .sseg.brand .sseg-opt[data-lit]{color:#fff;text-shadow:0 1px 1px rgba(20,20,80,.22)}
  /* soft: a quiet grey track, a white thumb -- for a filter, not a headline */
  .sseg.soft{padding:3px;border-radius:13px;background:var(--panel-2);border:1px solid var(--line)}
  .sseg.soft .sseg-thumb{top:3px;bottom:3px;border-radius:10px;background:var(--panel);
    box-shadow:0 1px 3px rgba(20,30,80,.14),0 0 0 1px rgba(58,111,255,.2)}
  .sseg.soft .sseg-shine{display:none}
  .sseg.soft .sseg-opt{border-radius:10px;padding:7px 4px;font-size:.78rem}
  .sseg.soft .sseg-opt[data-lit]{color:var(--primary-600)}
  @media (prefers-reduced-motion:reduce){.sseg[data-ready] .sseg-thumb{transition:none}.sseg-shine{animation:none;display:none}}

/* ── THE PERIOD: one control for every figure under it ─────────────────
   Three periods and a calendar on a phone; the calendar opens the other
   two and your own dates. From 640px up all of them sit in the row. */
  .xrange{display:flex;flex-direction:column;gap:8px}
  .sseg-opt.cal{flex:0 0 46px;padding:10px 0}
  .sseg-opt.cal .wide-lbl{display:none}
  .sseg-opt.cal.open:not([data-lit]){color:var(--primary-600);background:rgba(58,111,255,.1)}
  @media (min-width:640px){.sseg-opt.cal{flex:0 0 auto;padding:10px 16px}.sseg-opt.cal .wide-lbl{display:inline}}
  .xr-meta{display:flex;align-items:center;gap:7px;padding:0 6px;font-size:.76rem;color:var(--faint)}
  .xr-meta b{color:var(--ink);font-weight:700}
  .xr-meta .dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--win);
    box-shadow:0 0 0 3px rgba(16,185,129,.18)}
  .xr-meta .dot.busy{background:var(--gold);box-shadow:0 0 0 3px rgba(239,176,44,.2);animation:xrpulse 1s ease-in-out infinite}
  @keyframes xrpulse{50%{opacity:.35}}
  .xr-busy{margin-left:auto;font-weight:600}
  .xr-custom{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:16px;background:var(--panel);
    border:1px solid var(--line);box-shadow:0 16px 32px -24px rgba(20,30,80,.6);animation:xrin .2s ease}
  @keyframes xrin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
  .xr-quick{display:flex;gap:6px}
  .xr-q{flex:1 1 0;border:1px solid var(--line-2);background:var(--panel-2);font:inherit;font-weight:700;
    font-size:.8rem;color:var(--txt-2);padding:9px 10px;border-radius:12px;cursor:pointer;
    transition:border-color .15s,color .15s,background .15s}
  .xr-q:hover{border-color:rgba(58,111,255,.5);color:var(--primary-600)}
  .xr-q.on{background:var(--primary-tint);border-color:rgba(58,111,255,.5);color:var(--primary-600)}
  @media (min-width:640px){.xr-quick{display:none}}
  .xr-dates{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:end}
  .xr-dates label{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:.64rem;
    font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  .xr-dates input{border:1px solid var(--line-2);border-radius:11px;padding:8px 10px;font:inherit;width:100%;
    font-size:.86rem;font-weight:600;letter-spacing:0;text-transform:none;color:var(--ink);background:var(--panel-2);min-width:0}
  .xr-dates input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(58,111,255,.15)}
  .xr-dates .btn{justify-content:center}
  .xr-hint{margin:0;font-size:.76rem;font-weight:600;color:var(--gold-ink,#a9740b)}

/* ── GETTING PAID ──────────────────────────────────────────────────────
   One card: what is ready, one button, and what happened before. */
  .xpay{display:flex;flex-direction:column;gap:12px;padding:18px}
  .xp-top{display:flex;gap:12px;align-items:flex-start}
  .xp-top h2{font-size:1.02rem;margin:0 0 2px}
  .xp-top .cap{margin:0}
  .xp-top .ci{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}
  .xp-top .ci svg{width:17px;height:17px}
  .xp-legs{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
  .xp-leg{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:14px;
    background:linear-gradient(180deg,var(--win-soft),var(--panel) 85%);border:1px solid rgba(16,185,129,.35)}
  .xp-leg .l{font-size:.6rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
  .xp-leg .v{font-family:var(--hd);font-weight:800;font-size:1.15rem;letter-spacing:-.02em;color:#0e8f66}
  .xpay .btn.grad{width:100%;justify-content:center}
/* ── A PAYOUT IN FLIGHT ────────────────────────────────────────────────
   One card you can open, not a row of buttons: the owner, "doe view
   request en withdraw request niet overal wat buttons proppen". */
  .xp-open{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:9px;width:100%;
    padding:16px;border-radius:18px;border:0;text-align:left;font:inherit;color:#eef1ff;cursor:pointer;
    background:radial-gradient(120% 140% at 12% 0%,#20265c 0%,#141a40 45%,#0d1130 100%);
    box-shadow:0 20px 44px -26px rgba(20,24,80,.9),inset 0 1px 0 rgba(255,255,255,.08);
    transition:transform .15s,box-shadow .2s}
  .xp-open:hover{transform:translateY(-2px);box-shadow:0 26px 50px -26px rgba(20,24,80,.95)}
  .xp-open:active{transform:scale(.995)}
  .xo-aur{position:absolute;border-radius:50%;filter:blur(30px);pointer-events:none;opacity:.5}
  .xo-aur.a{width:150px;height:150px;right:-40px;top:-50px;background:rgba(124,92,255,.75);
    animation:xoA 9s ease-in-out infinite alternate}
  .xo-aur.b{width:130px;height:130px;left:-30px;bottom:-60px;background:rgba(16,185,129,.55);
    animation:xoB 11s ease-in-out infinite alternate}
  @keyframes xoA{to{transform:translate(-14px,10px) scale(1.12)}}
  @keyframes xoB{to{transform:translate(12px,-10px) scale(1.1)}}
  .xo-head{position:relative;display:flex;align-items:center;gap:8px}
  .xo-pill{display:inline-flex;align-items:center;gap:7px;padding:5px 11px;border-radius:99px;
    font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
    background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);color:#ffe8b0}
  .xo-pill .dot{width:7px;height:7px;border-radius:50%;background:var(--gold);
    box-shadow:0 0 0 0 rgba(239,176,44,.6);animation:xoPulse 1.8s ease-out infinite}
  @keyframes xoPulse{70%{box-shadow:0 0 0 7px rgba(239,176,44,0)}100%{box-shadow:0 0 0 0 rgba(239,176,44,0)}}
  .xo-when{margin-left:auto;font-size:.74rem;color:rgba(238,241,255,.6)}
  .xo-amt{position:relative;display:block;font-family:var(--hd);font-weight:800;font-size:1.9rem;
    letter-spacing:-.03em;line-height:1.05;color:#fff;text-shadow:0 8px 28px rgba(124,92,255,.45)}
  .xo-amt .cur{font-size:.62em;margin-right:2px;color:var(--gold)}
  .xo-amt .plus{font-size:.6em;color:rgba(238,241,255,.55);font-weight:700}
  .xo-sub{position:relative;display:block;font-size:.78rem;color:rgba(238,241,255,.72)}
  .xo-steps{position:relative;display:flex;gap:6px;margin-top:2px}
  .xo-steps .st{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:6px;
    font-size:.64rem;font-weight:700;color:rgba(238,241,255,.45);white-space:nowrap}
  .xo-steps .s-dot{display:block;height:3px;border-radius:3px;background:rgba(255,255,255,.14)}
  .xo-steps .st.done{color:rgba(238,241,255,.85)}
  .xo-steps .st.done .s-dot{background:linear-gradient(90deg,#34d399,#10b981)}
  .xo-steps .st.now{color:#fff}
  .xo-steps .st.now .s-dot{background:linear-gradient(90deg,#5b8dff,#8b5cf6);
    box-shadow:0 0 12px rgba(124,92,255,.8)}
  .xo-more{position:relative;display:inline-flex;align-items:center;gap:6px;margin-top:2px;
    font-size:.78rem;font-weight:700;color:rgba(238,241,255,.75)}
  .xo-more svg{width:14px;height:14px;transition:transform .15s}
  .xp-open:hover .xo-more{color:#fff}
  .xp-open:hover .xo-more svg{transform:translateX(3px)}
  @media (prefers-reduced-motion:reduce){.xo-aur,.xo-pill .dot{animation:none}
    .xp-open:hover{transform:none}.xp-open:hover .xo-more svg{transform:none}}

/* The three steps of the request, and what each one asks. */
  .xp-steps{display:flex;gap:5px;margin:0 0 14px}
  .xp-steps span{flex:1 1 0;height:3px;border-radius:3px;background:var(--line-2);transition:background .2s}
  .xp-steps span.on{background:linear-gradient(90deg,var(--primary),#8b5cf6)}
  .xp-pick{display:flex;flex-direction:column;gap:8px;margin-bottom:6px}
  .xp-p{display:flex;align-items:center;gap:10px;padding:13px 14px;border-radius:15px;cursor:pointer;
    border:1px solid var(--line-2);background:var(--panel);font:inherit;color:inherit;text-align:left;
    transition:border-color .15s,box-shadow .2s,background .2s}
  .xp-p .c{font-size:.7rem;font-weight:800;letter-spacing:.08em;color:var(--faint)}
  .xp-p .a{font-family:var(--hd);font-weight:800;font-size:1.05rem;color:var(--ink)}
  .xp-p .tick{margin-left:auto;font-weight:800;color:var(--primary-600)}
  .xp-p.on{border-color:rgba(58,111,255,.55);background:linear-gradient(180deg,#f4f7ff,var(--panel) 80%);
    box-shadow:0 0 0 3px rgba(58,111,255,.12)}
  .xp-p.on .c{color:var(--primary-600)}
  .xp-ways{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
  .xp-w{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:15px;cursor:pointer;
    border:1px solid var(--line-2);background:var(--panel);font:inherit;color:inherit;text-align:left;
    transition:border-color .15s,box-shadow .2s,background .2s}
  .xp-w b{font-size:.92rem}
  .xp-w small{font-size:.78rem;color:var(--txt-2);line-height:1.35}
  .xp-w.on{border-color:rgba(58,111,255,.55);background:linear-gradient(180deg,#f4f7ff,var(--panel) 80%);
    box-shadow:0 0 0 3px rgba(58,111,255,.12)}
  .xp-w:disabled{opacity:.5;cursor:not-allowed}
  .xp-calc{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:15px;
    background:var(--panel-2);border:1px solid var(--line);margin-bottom:12px}
  .xp-calc .row{display:flex;align-items:baseline;gap:8px;font-size:.82rem;color:var(--txt-2);flex-wrap:wrap}
  .xp-calc .row b{margin-left:auto;font-family:var(--hd);font-weight:800;color:var(--ink);white-space:nowrap}
  .xp-calc .fx{font-size:.76rem;color:var(--faint)}
  .xp-calc .tot{display:flex;align-items:baseline;gap:8px;border-top:1px solid var(--line);padding-top:8px;
    font-size:.82rem;font-weight:700;color:var(--ink)}
  .xp-calc .tot b{margin-left:auto;font-family:var(--hd);font-weight:800;font-size:1.05rem}
  .xp-calc .note{margin:0;font-size:.72rem;color:var(--faint)}
  .xp-rhead{display:flex;align-items:center;gap:8px;margin:-4px 0 12px}
  .xp-rhead .when{margin-left:auto;font-size:.76rem;color:var(--faint)}
  .xp-hero{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border-radius:16px;margin-bottom:12px;
    background:radial-gradient(120% 140% at 10% 0%,#20265c,#0f1433);color:#fff;
    box-shadow:0 18px 38px -28px rgba(20,24,80,.9)}
  .xp-hero .l{font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
    color:rgba(238,241,255,.6)}
  .xp-hero .v{font-family:var(--hd);font-weight:800;font-size:1.7rem;letter-spacing:-.02em}
  .xp-sec{display:flex;align-items:center;gap:8px;margin:16px 0 8px;font-size:.78rem;font-weight:800;
    letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
  .xp-sec svg{width:15px;height:15px;flex:0 0 auto;color:var(--primary-600)}
  .xp-view{display:flex;flex-direction:column;gap:7px;padding:12px 14px;border-radius:15px;
    background:var(--panel-2);border:1px solid var(--line)}
  .xp-view .row{display:flex;align-items:baseline;gap:10px;font-size:.82rem;color:var(--txt-2)}
  .xp-view .row b{margin-left:auto;text-align:right;color:var(--ink);word-break:break-word}
  .xp-view .row.big{border-top:1px solid var(--line);padding-top:8px;font-weight:700;color:var(--ink)}
  .xp-view .row.big b{font-family:var(--hd);font-weight:800;font-size:1.1rem}
  .xp-vfoot{flex-wrap:wrap}
  .xp-vfoot .btn{flex:1 1 auto;justify-content:center}
  .xp-vfoot .btn.wa svg{color:#1faa53}
  .xp-note{margin:0;font-size:.82rem;color:var(--txt-2);padding:10px 12px;border-radius:13px;
    background:var(--panel-2);border:1px solid var(--line)}
  .xp-empty{display:flex;align-items:flex-start;gap:11px;padding:14px;border-radius:15px;
    background:linear-gradient(180deg,var(--win-soft),var(--panel) 90%);border:1px solid rgba(16,185,129,.28)}
  .xp-empty .ic{width:30px;height:30px;border-radius:10px;flex:0 0 auto;display:grid;place-items:center;
    background:var(--win);color:#fff}
  .xp-empty .ic svg{width:16px;height:16px}
  .xp-empty div{display:flex;flex-direction:column;gap:2px;min-width:0}
  .xp-empty b{font-size:.9rem}
  .xp-empty span{font-size:.8rem;color:var(--txt-2)}
  .xp-hist{display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--line);padding-top:12px}
  .xp-hh{font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);
    padding:0 2px 4px}
  .xp-h{display:flex;align-items:center;gap:10px;width:100%;min-width:0;padding:9px 10px;border-radius:13px;
    border:1px solid transparent;background:none;font:inherit;text-align:left;cursor:pointer;
    transition:background .12s,border-color .12s}
  .xp-h:hover{background:var(--panel-2);border-color:var(--line)}
  .xp-h .hi{width:28px;height:28px;border-radius:9px;flex:0 0 auto;display:grid;place-items:center;color:#fff}
  .xp-h .hi svg{width:14px;height:14px}
  .xp-h .hi.paid{background:var(--win)}
  .xp-h .hi.rejected{background:var(--danger,#e5484d)}
  .xp-h .hi.cancelled{background:var(--faint)}
  .xp-h .mid{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto}
  .xp-h .m{font-family:var(--hd);font-weight:800;font-size:.92rem;color:var(--ink)}
  .xp-h .d{font-size:.74rem;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .xp-h .badge{flex:0 0 auto}
  .xp-cur{display:flex;gap:6px;margin-bottom:12px}
  .xp-cur button{flex:1 1 0;border:1px solid var(--line-2);background:var(--panel-2);font:inherit;font-weight:700;
    font-size:.82rem;color:var(--txt-2);padding:10px;border-radius:12px;cursor:pointer;white-space:nowrap}
  .xp-cur button.on{background:var(--primary-tint);border-color:rgba(58,111,255,.55);color:var(--primary-600)}
  .xp-sum{display:flex;flex-direction:column;gap:2px;padding:12px;border-radius:14px;margin-bottom:14px;
    background:linear-gradient(135deg,var(--primary-tint),#f3e8ff)}
  .xp-sum .l{font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--primary-600)}
  .xp-sum .v{font-family:var(--hd);font-weight:800;font-size:1.5rem;letter-spacing:-.02em;color:var(--ink)}
  .xp-sum .c{font-size:.76rem;color:var(--txt-2)}
  @media (max-width:420px){.xr-dates{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.xr-dates .btn{grid-column:1/-1}}
  @media (prefers-reduced-motion:reduce){.xr-meta .dot.busy,.xr-custom{animation:none}}

/* Filters as chips with their own count: the count on a chip is the
   number of rows it shows. */
  .xchips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:0 16px 8px;-webkit-overflow-scrolling:touch}
  .xchips::-webkit-scrollbar{display:none}
  .xchip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-2);
    background:var(--panel);font:inherit;font-weight:700;font-size:.78rem;color:var(--txt-2);
    padding:6px 11px 6px 9px;border-radius:99px;cursor:pointer;
    transition:border-color .15s,color .15s,background .15s,box-shadow .15s}
  .xchip:hover{border-color:rgba(58,111,255,.5);color:var(--primary-600)}
  .xchip.on{background:var(--primary-tint);border-color:rgba(58,111,255,.5);color:var(--primary-600);
    box-shadow:0 0 0 3px rgba(58,111,255,.12)}
  .xchip svg{width:14px;height:14px;flex:0 0 auto}
  .xchip .n{min-width:18px;padding:1px 6px;border-radius:99px;font-size:.66rem;font-weight:800;
    text-align:center;background:var(--panel-2);color:var(--faint)}
  .xchip.on .n{background:#fff;color:var(--primary-600)}
  .xl-tools2{display:flex;align-items:center;gap:6px;padding:0 16px 10px}
  .xl-tools2 .xchips{padding:0;flex:1 1 auto;min-width:0}
  .xsel{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}
  .xsel select{appearance:none;-webkit-appearance:none;border:1px solid var(--line-2);background:var(--panel);
    font:inherit;font-weight:700;font-size:.78rem;color:var(--txt-2);padding:6px 28px 6px 11px;
    border-radius:99px;cursor:pointer;transition:border-color .15s,box-shadow .15s}
  .xsel select:hover{border-color:rgba(58,111,255,.5)}
  .xsel select:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(58,111,255,.15)}
  .xsel .ic{position:absolute;right:9px;width:13px;height:13px;pointer-events:none;color:var(--faint)}
  .xl-head .xl-sort{margin-left:auto}
  .xl-head .xl-sort+.xl-count{margin-left:0}
  .xseg{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:3px;margin:0 16px 8px;
    padding:3px;border-radius:13px;background:var(--panel-2);border:1px solid var(--line)}
  .xseg button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:0;
    border:0;background:none;font:inherit;font-weight:700;font-size:.76rem;color:var(--txt-2);
    padding:7px 4px;border-radius:10px;cursor:pointer;white-space:nowrap;overflow:hidden;
    transition:background .15s,color .15s,box-shadow .15s}
  .xseg button:hover{color:var(--ink)}
  .xseg button.on{background:var(--panel);color:var(--primary-600);
    box-shadow:0 1px 3px rgba(20,30,80,.14),0 0 0 1px rgba(58,111,255,.2)}
  .xseg button svg{width:13px;height:13px;flex:0 0 auto}
  .xseg .n{flex:0 0 auto;min-width:16px;padding:0 5px;border-radius:99px;font-size:.64rem;font-weight:800;
    text-align:center;background:rgba(20,30,80,.06);color:var(--faint)}
  .xseg button.on .n{background:var(--primary-tint);color:var(--primary-600)}
  @media (max-width:420px){.xseg button svg{display:none}.xseg button{font-size:.72rem;gap:4px}}
  /* A second currency is its own line, under the first, a size smaller. */
  .v2{display:block;font-size:.62em;margin-top:3px;opacity:.85;letter-spacing:-.01em}
  .xrow .amt .v2{font-size:.82em;margin-top:1px;text-align:right}
`  + refineCss(".advapp");
