/**
 * The earnings cabinet: everything the Affiliate program screen is made of.
 *
 * Written for the advertiser's Referrals tab, and then wanted verbatim on
 * the standalone affiliate portal -- the owner, 23-09: "deze is mooi van
 * advertiser dit ook toepassen bij affiliate". Two copies of 400 lines of
 * CSS is how a fix lands in one screen and not the other, which this repo
 * has paid for twice already, so it lives here and both shells include it.
 *
 * The selectors are unscoped on purpose: each shell injects its own <style>
 * and the two are never mounted on the same page. It leans on the shell
 * variables both define (--panel, --line, --primary-600, --win, --gold-soft
 * ...) plus --hd and --bd for the two typefaces, which .affapp now sets.
 */
export const EARNINGS_CABINET_CSS = `
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
  .xlist.busy .xrow,.xlist.busy .xl-sum b,.xlist.busy .xl-sub{opacity:.4;transition:opacity .15s}
  .xl-note{margin:0 16px 10px;font-size:.76rem;color:var(--faint)}
  /* Five rows, then the rest on one tap. */
  .xl-more{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px 16px;
    border:0;border-top:1px solid var(--line);background:none;font:inherit;font-weight:700;font-size:.82rem;
    color:var(--primary-600);cursor:pointer;transition:background .12s}
  .xl-more:hover{background:var(--panel-2)}
  .xl-more svg{width:15px;height:15px;transition:transform .2s}
  .xl-more:hover svg{transform:translateY(2px)}

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
  /* The export sits at the far end of the line that names the period,
     so the button and the words it obeys are one sentence. */
  .xr-exp{margin-left:auto;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;
    border:1px solid var(--line-2);background:linear-gradient(180deg,var(--panel),var(--panel-2));
    border-radius:10px;padding:5px 10px;font:inherit;font-weight:700;font-size:.74rem;
    color:var(--txt-2);cursor:pointer;transition:.13s}
  .xr-exp:hover{color:var(--primary-600);border-color:var(--primary)}
  .xr-exp svg{width:14px;height:14px}
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
  /* The commission list and the payout card sat in one wrapper with no
     gap, so they touched -- the owner: "2 grids bijna op elkaar". */
  .aff-stack{display:flex;flex-direction:column;gap:16px}
  .xpay{display:flex;flex-direction:column;gap:12px;padding:18px}
  .xp-top{display:flex;gap:12px;align-items:flex-start}
  .xp-top h2{font-size:1.02rem;margin:0 0 2px}
  .xp-top .cap{margin:0}
  .xp-top .ci{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}
  .xp-top .ci svg{width:17px;height:17px}
/* How close they are to a payout: what you have, how far to go. */
  .xp-prog{display:flex;flex-direction:column;gap:12px;padding:14px 16px;border-radius:16px;
    background:linear-gradient(180deg,var(--panel-2),var(--panel) 85%);border:1px solid var(--line)}
  .xp-prog.ok{background:linear-gradient(180deg,var(--win-soft),var(--panel) 85%);
    border-color:rgba(16,185,129,.35)}
  .xp-pr{display:flex;flex-direction:column;gap:6px;min-width:0}
  .xp-pr .top{display:flex;align-items:baseline;gap:8px}
  .xp-pr .l{font-size:.62rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
  .xp-pr .v{margin-left:auto;font-family:var(--hd);font-weight:800;font-size:1.25rem;letter-spacing:-.02em;
    color:var(--ink)}
  .xp-pr .bar{display:block;height:6px;border-radius:99px;background:var(--line-2);overflow:hidden}
  .xp-pr .fill{display:block;height:100%;border-radius:99px;
    background:linear-gradient(90deg,#5b8dff,#8b5cf6);transition:width .5s cubic-bezier(.3,1,.4,1)}
  .xp-prog.ok .fill{background:linear-gradient(90deg,#34d399,#10b981)}
  .xp-pr .foot{font-size:.74rem;color:var(--faint)}
  .xp-prog.ok .xp-pr .foot{color:#0e8f66;font-weight:700}
  .xp-hint{margin:0;font-size:.74rem;color:var(--faint);text-align:center}
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
  .xo-no{font-size:.72rem;font-weight:800;color:rgba(238,241,255,.8)}
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
  .xp-empty{margin:0;font-size:.82rem;color:var(--txt-2);padding:11px 12px;border-radius:13px;
    background:var(--panel-2);border:1px solid var(--line)}
  .xpay .btn.grad:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
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
`;
