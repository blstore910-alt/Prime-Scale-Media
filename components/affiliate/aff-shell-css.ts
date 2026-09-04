// AUTO-GENERATED verbatim from affiliate-jackpot-light.html mockup.
// Scoped under .affapp (loaded only in the affiliate layout). Font
// family names swapped for the app's next/font CSS variables.
export const AFF_CSS = `
  .affapp{--ground:#f4f6fc;--panel:#fff;--panel-2:#f1f4fb;--ink:#161a23;--muted:#5c6577;--faint:#8b93a6;
    --line:#e6e9f2;--line-2:#d8ddec;--primary:#3d7bf4;--primary-600:#2f66d8;--primary-tint:#eaf1ff;
    --gold:#efb02c;--gold-deep:#a9740b;--gold-soft:#fdeecb;--win:#10b981;--win-soft:#daf5ec;--teal:#18b8ce;
    --bronze:#c7864b;--silver:#9aa6b8;
    --shadow-sm:0 10px 26px -20px rgba(30,42,90,.5);--shadow:0 24px 54px -28px rgba(30,42,90,.4);--r:14px;--sidebar:256px;}
  .affapp *{box-sizing:border-box}
  .affapp{background:var(--ground);color:var(--ink);font-family:var(--font-outfit),system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;min-height:100vh}
  svg.ic{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;display:block;flex:0 0 auto}
  .mono{font-family:ui-monospace,"SFMono-Regular",Menlo,monospace}
  h2{font-family:var(--font-sora);font-weight:700;font-size:1.14rem;letter-spacing:-.01em;margin:0}
  .cap{color:var(--muted);font-size:.9rem;margin:6px 0 16px}

  .app{display:flex;min-height:100vh}
  .sidebar{width:var(--sidebar);flex:0 0 auto;background:var(--panel);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column;gap:3px;position:sticky;top:0;height:100vh}
  .logo{display:flex;align-items:center;gap:11px;padding:6px 8px 18px}
  .logo .mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#04050E,#0c1230,#0f172a);box-shadow:0 0 22px rgba(91,141,255,.4),0 0 0 1px rgba(91,141,255,.28)}
  .logo .mark svg{width:21px;height:21px}
  .logo .name{font-family:var(--font-jakarta),var(--font-sora),sans-serif;font-weight:800;letter-spacing:-.025em;font-size:.98rem;line-height:1.1}
  .logo .name small{display:block;font-weight:600;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:3px}
  .navlink{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;font-weight:600;font-size:.94rem;color:var(--muted);cursor:pointer;transition:.14s;border:0;background:none;width:100%;text-align:left;font-family:var(--font-outfit)}
  .navlink:hover{background:var(--panel-2);color:var(--ink)}.navlink.on{background:var(--primary-tint);color:var(--primary-600)}
  .navlink svg{width:19px;height:19px}.navlink .n{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:var(--primary);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center}
  .side-foot{margin-top:auto;padding:12px 8px 4px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px}
  .side-foot .avatar{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-family:var(--font-sora);font-weight:700;font-size:.85rem;color:#fff;background:linear-gradient(135deg,#2f66d8,var(--primary))}
  .side-foot .who{font-size:.85rem;font-weight:600;line-height:1.2}.side-foot .who small{display:block;color:var(--faint);font-weight:500;font-size:.72rem}

  .main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{display:flex;align-items:center;gap:12px;padding:11px 22px;position:sticky;top:0;z-index:20;background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 93%,transparent),color-mix(in srgb,var(--panel) 80%,transparent));backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .tb-brand{display:flex;align-items:center;gap:10px}
  .tb-brand .mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#04050E,#0c1230,#0f172a);box-shadow:0 0 20px rgba(91,141,255,.4),0 0 0 1px rgba(91,141,255,.28)}
  .tb-brand .mark svg{width:19px;height:19px}
  .tb-brand .mark{display:none}/* sidebar already shows the logo on desktop — avoid a 2nd */
  .tb-title{font-family:var(--font-sora);font-weight:700;font-size:1.12rem;letter-spacing:-.01em;line-height:1}
  .search{display:flex;align-items:center;gap:9px;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:9px 13px;min-width:180px;max-width:280px;flex:1;color:var(--faint);transition:.15s}
  .search:focus-within{border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
  .search svg{width:17px;height:17px}.search input{border:0;background:none;outline:0;font-family:var(--font-outfit);font-size:.9rem;color:var(--ink);width:100%}
  .epill{display:flex;align-items:center;gap:9px;background:var(--win-soft);border:1px solid rgba(16,185,129,.25);border-radius:12px;padding:6px 12px;cursor:pointer;transition:.14s}
  .epill:hover{transform:translateY(-1px);filter:brightness(1.02)}
  .stat[data-v]{cursor:pointer;transition:.14s}.stat[data-v]:hover{border-color:var(--primary);transform:translateY(-2px)}
  .epill .lbl{font-size:.64rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--win);line-height:1}
  .epill .num{font-family:var(--font-sora);font-weight:800;font-size:.98rem;color:#0e9e6e;line-height:1.15}.epill svg{width:16px;height:16px;color:var(--win)}
  .tier{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:99px;font-weight:700;font-size:.76rem;color:var(--gold-deep);background:linear-gradient(135deg,var(--gold-soft),#fff5db);border:1px solid #f2d9a3;box-shadow:0 6px 18px -8px rgba(239,176,44,.55)}.tier svg{width:15px;height:15px;stroke-width:2.2}
  .iconbtn{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--panel);color:var(--muted);display:grid;place-items:center;cursor:pointer;position:relative;transition:.15s}.iconbtn:hover{color:var(--ink);border-color:var(--line-2)}
  .badge-n{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:var(--primary);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--panel)}
  .who-btn{display:flex;align-items:center;gap:8px;padding:5px 8px 5px 5px;border:1px solid var(--line);border-radius:12px;background:var(--panel);cursor:pointer}.who-btn:hover{border-color:var(--line-2)}
  .who-btn .avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-family:var(--font-sora);font-weight:700;font-size:.8rem;color:#fff;background:linear-gradient(135deg,#2f66d8,var(--primary));position:relative}
  .who-btn .avatar::after{content:"";position:absolute;bottom:-1px;right:-1px;width:9px;height:9px;border-radius:50%;background:var(--win);border:2px solid var(--panel)}
  .who-btn .nm{font-size:.84rem;font-weight:600;line-height:1}.who-btn svg{width:15px;height:15px;color:var(--faint)}
  .tb-spacer{flex:1}
  .toolbar{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:16px;padding:5px;box-shadow:0 10px 24px -16px rgba(30,42,90,.55),inset 0 1px 0 rgba(255,255,255,.6)}
  .tool{display:inline-flex;align-items:center;gap:8px;border:0;background:none;font-family:var(--font-outfit);font-weight:600;color:var(--ink);border-radius:12px;padding:7px 12px;height:42px;cursor:pointer;position:relative;transition:.13s}
  .tool svg{width:18px;height:18px;color:var(--muted)}
  .tool.earn{background:var(--win-soft);border:1px solid rgba(16,185,129,.24)}.tool.earn:hover{filter:brightness(.98)}
  .tool.earn .e{display:flex;flex-direction:column;line-height:1.05;text-align:left}
  .tool.earn small{font-size:.6rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#12a575}
  .tool.earn b{font-family:var(--font-sora);font-weight:800;font-size:.95rem;color:#0e8f66}.tool.earn svg{color:var(--win)}
  .tool.tier2{background:linear-gradient(135deg,var(--gold-soft),#fff6de);border:1px solid #f0d59b;color:var(--gold-deep);font-weight:800;font-size:.82rem}.tool.tier2 svg{color:var(--gold)}.tool.tier2:hover{filter:brightness(.99)}
  .tool.ic-btn,.tool.ava-btn{background:var(--panel);border:1px solid var(--line)}.tool.ic-btn:hover,.tool.ava-btn:hover{background:var(--panel-2)}
  .tool.ic-btn{padding:7px 11px}.tool .badge-n{top:0;right:2px}
  .tool.ava-btn{padding:4px 8px 4px 4px}
  .tool.ava-btn .avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-family:var(--font-sora);font-weight:700;font-size:.8rem;color:#fff;background:linear-gradient(135deg,#2f66d8,var(--primary));overflow:hidden;position:relative}
  .tool.ava-btn .avatar::after{content:"";position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--win);border:2px solid var(--panel)}
  .tool.ava-btn svg{width:15px;height:15px}
  .tdiv{display:none}
  .ddwrap{position:relative}
  .ddmenu{position:absolute;top:calc(100% + 6px);left:0;z-index:30;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:6px;min-width:220px}
  .ddmenu button{display:block;width:100%;text-align:left;border:0;background:none;font-family:var(--font-outfit);font-weight:600;font-size:.86rem;color:var(--ink);padding:9px 11px;border-radius:8px;cursor:pointer}
  .ddmenu button:hover{background:var(--panel-2)}.ddmenu button.on{background:var(--primary-tint);color:var(--primary-600)}
  .dd .ddchev{transition:transform .18s}.dd.open .ddchev{transform:rotate(180deg)}
  .ham{display:none}
  .bottombar{display:none}
  .bb{font-family:var(--font-outfit)}
  .content{padding:24px 26px 70px;max-width:1000px;width:100%;margin:0 auto}
  .view{display:none;flex-direction:column;gap:16px}.view.on{display:flex;animation:fade .3s ease}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

  .hero{position:relative;border-radius:26px;padding:44px 30px 36px;overflow:hidden;text-align:center;
    background:radial-gradient(130% 130% at 50% -15%,rgba(91,141,255,.42),transparent 52%),radial-gradient(85% 120% at 87% 4%,rgba(139,92,246,.36),transparent 55%),radial-gradient(80% 120% at 12% 10%,rgba(24,184,206,.24),transparent 55%),linear-gradient(165deg,#090d22 0%,#0c1230 52%,#131a3c 100%);
    border:1px solid rgba(120,150,255,.26);box-shadow:0 36px 82px -34px rgba(6,10,30,.95),inset 0 1px 0 rgba(255,255,255,.08),inset 0 -34px 66px -34px rgba(0,0,0,.55)}
  .hero .ribbon{position:absolute;inset:-45%;background:conic-gradient(from 0deg,transparent,rgba(139,92,246,.18),transparent 26%,rgba(91,141,255,.22),transparent 56%,rgba(24,184,206,.16),transparent 82%);animation:spin 20s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .spk{position:absolute;color:var(--gold);opacity:0;animation:rise 5s ease-in infinite;filter:drop-shadow(0 0 6px rgba(255,196,60,.7))}
  @keyframes rise{0%{transform:translateY(46px) scale(.5);opacity:0}18%{opacity:.95}55%{opacity:.6}100%{transform:translateY(-236px) scale(1) rotate(200deg);opacity:0}}
  .hero-inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center}
  .hero .glow{position:absolute;top:44%;left:50%;transform:translate(-50%,-50%);width:min(640px,94%);height:270px;background:radial-gradient(ellipse at center,rgba(255,198,64,.4),rgba(255,170,40,0) 66%);filter:blur(12px);pointer-events:none;z-index:0;animation:glowpulse 3.4s ease-in-out infinite}
  @keyframes glowpulse{0%,100%{opacity:.72;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.07)}}
  .eyebrow{display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:.74rem;letter-spacing:.26em;text-transform:uppercase;color:#ffd98a;margin:0 0 12px;text-shadow:0 2px 14px rgba(255,190,60,.45)}.eyebrow svg{width:15px;height:15px;color:#ffcf6a}
  .jackpot{position:relative;display:inline-block;font-family:var(--font-sora);font-weight:800;letter-spacing:-.035em;line-height:.9;font-size:clamp(3.6rem,14vw,7rem);
    background:linear-gradient(100deg,#e0980f 0%,#ffdf85 28%,#fff7de 42%,#ffdf85 56%,#e0980f 82%);background-size:230% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
    text-shadow:0 0 48px rgba(255,198,64,.42);filter:drop-shadow(0 10px 22px rgba(255,170,40,.32));margin:0;animation:shine 3.8s ease-in-out infinite}
  @keyframes shine{0%{background-position:185% 0}55%,100%{background-position:-45% 0}}
  .jackpot .cur{font-size:.52em;vertical-align:.12em;margin-right:.04em;-webkit-text-fill-color:#ffcf6a;color:#ffcf6a}
  .hero-sub{color:rgba(255,255,255,.74);margin:14px auto 0;font-size:1.02rem;max-width:30ch}.hero-sub b{color:#fff}
  .rise-pill{display:inline-flex;align-items:center;gap:7px;margin-top:18px;padding:10px 17px;border-radius:99px;background:rgba(16,185,129,.16);color:#63f0c1;font-weight:700;font-size:.88rem;border:1px solid rgba(16,185,129,.42);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}.rise-pill svg{width:16px;height:16px}
  .hero-tiles{display:inline-flex;margin:22px auto 2px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);border-radius:16px;overflow:hidden;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 16px 30px -18px rgba(0,0,0,.6)}
  .ht{padding:14px 34px;text-align:center;display:flex;flex-direction:column;align-items:center;transition:.14s}.ht+.ht{border-left:1px solid rgba(255,255,255,.14)}
  .ht:hover{background:rgba(255,255,255,.07)}
  .ht .hti{width:17px;height:17px;color:rgba(255,255,255,.6);margin-bottom:5px}.ht.win .hti{color:#63f0c1}.ht.gold .hti{color:#ffcf6a}
  .ht .v{font-family:var(--font-sora);font-weight:800;font-size:1.8rem;line-height:1;color:#9db8ff}.ht.win .v{color:#63f0c1}.ht.gold .v{color:#ffd98a}
  .ht .l{font-size:.68rem;font-weight:700;color:rgba(255,255,255,.62);letter-spacing:.08em;text-transform:uppercase;margin-top:5px}
  [data-v]{cursor:pointer}
  .ht:hover{background:var(--panel-2)}
  @media(max-width:480px){.ht{padding:13px 20px}.ht .v{font-size:1.45rem}}
  .rise-pill{transition:.14s}.rise-pill[data-v]:hover{transform:translateY(-1px);filter:brightness(1.03)}
  .jackpot[data-v]{transition:.15s}.jackpot[data-v]:hover{filter:brightness(1.05)}

  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px;box-shadow:var(--shadow-sm)}
  .stat .k{display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:600;color:var(--faint)}.stat .k svg{width:16px;height:16px}
  .stat .v{font-family:var(--font-sora);font-weight:700;font-size:1.4rem;letter-spacing:-.02em;margin-top:9px}
  .stat .v.gold{color:var(--gold-deep)}.stat .v.win{color:var(--win)}.stat .v.blue{color:var(--primary-600)}

  .grid{display:grid;grid-template-columns:1.12fr .88fr;gap:16px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:var(--shadow)}
  .invite{position:relative;border-radius:20px;padding:24px;overflow:hidden;background:linear-gradient(135deg,rgba(61,123,244,.11),rgba(24,184,206,.09)),var(--panel);border:1px solid var(--line-2);box-shadow:var(--shadow)}
  .invite h2{display:flex;align-items:center;gap:9px}.invite h2 svg{width:20px;height:20px;color:var(--primary)}
  .linkrow{display:flex;gap:9px;margin-top:14px;align-items:center}
  .linkbox{flex:1;min-width:0;background:var(--panel-2);border:1px solid var(--line-2);border-radius:11px;padding:13px 14px;font-size:.84rem;color:var(--primary-600);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .btn{display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;font-family:var(--font-outfit);font-weight:700;border-radius:11px;padding:12px 17px;background:var(--primary);color:#fff;white-space:nowrap;box-shadow:0 12px 26px -12px rgba(61,123,244,.7);transition:.12s}
  .btn:hover{transform:translateY(-1px);background:var(--primary-600)}.btn svg{width:17px;height:17px}
  .btn.sm{padding:9px 13px;font-size:.85rem}
  .btn.ghost{background:var(--panel);color:var(--ink);box-shadow:none;border:1px solid var(--line-2)}.btn.ghost:hover{background:var(--panel-2);border-color:var(--primary);color:var(--primary-600)}
  .btn.gold{background:linear-gradient(135deg,#ffdc7a,var(--gold) 52%,#e29b0f);color:#3f2c04;font-weight:800;box-shadow:0 16px 32px -12px rgba(239,176,44,.9),inset 0 1px 0 rgba(255,255,255,.5);transition:.15s}.btn.gold:hover{transform:translateY(-1px);filter:brightness(1.03)}
  .share{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:12px}
  .share .btn{justify-content:center;padding:11px 8px;font-size:.88rem}

  /* tier ladder — premium metallic */
  .ratepill{font-size:.74rem;font-weight:800;color:var(--gold-deep);background:linear-gradient(135deg,var(--gold-soft),#fff5db);border:1px solid #f2d9a3;padding:5px 12px;border-radius:99px;box-shadow:0 6px 16px -9px rgba(239,176,44,.7);white-space:nowrap}
  .ladder{position:relative;display:flex;justify-content:space-between;padding:0 0 4px;margin-top:8px}
  .ladder .rail{position:absolute;top:27px;left:12.5%;right:12.5%;height:6px;border-radius:99px;background:var(--panel-2);border:1px solid var(--line)}
  .ladder .rail>i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#dd9e15,var(--gold),#ffdc85);box-shadow:0 0 12px rgba(239,176,44,.55);transition:width 1.3s cubic-bezier(.2,.8,.2,1)}
  .tnode{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;flex:1;min-width:0}
  .medalwrap{height:50px;display:grid;place-items:center}
  .medal{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;position:relative;border:3px solid var(--panel);color:#fff;
    background:radial-gradient(circle at 35% 27%,#eef2f8,#c6cedb 72%);
    box-shadow:0 9px 18px -7px rgba(30,42,90,.5),inset 0 2px 3px rgba(255,255,255,.65),inset 0 -4px 6px rgba(0,0,0,.13)}
  .medal svg{width:18px;height:18px;stroke:rgba(255,255,255,.96);stroke-width:2;filter:drop-shadow(0 1px 1px rgba(0,0,0,.28))}
  .medal::after{content:"";position:absolute;inset:5px 6px 52% 6px;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.6),transparent);pointer-events:none}
  .tnode.bronze .medal{background:radial-gradient(circle at 35% 27%,#f2c69c,#a9631f 74%)}
  .tnode.silver .medal{background:radial-gradient(circle at 35% 27%,#f6f9fc,#93a0b3 74%)}
  .tnode.gold .medal{background:radial-gradient(circle at 35% 27%,#ffe7a1,#db9c12 72%)}
  .tnode.plat .medal{background:radial-gradient(circle at 35% 27%,#fdfeff,#bfc9db 74%)}
  .tnode.locked .medal{background:radial-gradient(circle at 35% 27%,#eef1f6,#ccd3df 74%);filter:saturate(.35);opacity:.9;box-shadow:0 6px 14px -8px rgba(30,42,90,.4),inset 0 2px 3px rgba(255,255,255,.5)}
  .tnode.locked .medal svg{stroke:#9aa6b8}
  .tnode.locked .lock{position:absolute;right:-3px;bottom:-3px;width:21px;height:21px;border-radius:50%;background:var(--panel);border:1px solid var(--line-2);display:grid;place-items:center;box-shadow:0 3px 7px -3px rgba(30,42,90,.4)}
  .tnode.locked .lock svg{width:11px;height:11px;stroke:var(--faint);stroke-width:2.5;filter:none}
  .tnode.current .medal{width:46px;height:46px;box-shadow:0 0 0 4px var(--gold-soft),0 10px 22px -6px rgba(239,176,44,.7),inset 0 2px 3px rgba(255,255,255,.65),inset 0 -4px 7px rgba(0,0,0,.15)}
  .tnode.current .medal svg{width:20px;height:20px}
  .tnode .tn{font-family:var(--font-sora);font-weight:700;font-size:.84rem;margin-top:12px}
  .tnode.current .tn{color:var(--gold-deep)}.tnode.locked .tn{color:var(--faint)}
  .tnode .tr{font-size:.72rem;font-weight:800;color:var(--muted);margin-top:3px}.tnode.current .tr{color:var(--gold-deep)}.tnode.locked .tr{color:var(--faint);font-weight:700}
  .tnode .tt{font-size:.66rem;color:var(--faint);margin-top:2px}
  .tnode .tru{font-weight:600;color:var(--faint);font-size:.8em}
  .tnode .tbonus{margin-top:10px;font-family:var(--font-sora);font-weight:800;font-size:.74rem;color:var(--gold-deep);background:linear-gradient(135deg,var(--gold-soft),#fff5db);border:1px solid #f2d9a3;padding:3px 10px;border-radius:99px;white-space:nowrap}
  .tnode.locked .tbonus{color:var(--faint);background:var(--panel-2);border-color:var(--line-2)}
  .tnode.current .tbonus{box-shadow:0 7px 15px -8px rgba(239,176,44,.75)}
  .tnode .tbonus.start{color:var(--muted);background:var(--panel-2);border-color:var(--line-2)}
  .tnode .tthr{font-size:.66rem;color:var(--faint);margin-top:5px;font-weight:600}
  .tierlegend{font-size:.82rem;color:var(--muted);margin:12px 2px 16px;text-align:center;line-height:1.5}.tierlegend b{color:var(--ink)}
  .tiernote{margin-top:12px;font-size:.87rem;color:var(--muted);line-height:1.55;text-align:center}.tiernote b{color:var(--ink)}.tiernote b.gold{color:var(--gold-deep)}.tiernote b.plat{color:#8792a6}
  .tierhero{display:flex;align-items:center;gap:15px;margin:6px 0 2px}
  .thmedal{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:0 0 auto;background:radial-gradient(circle at 35% 27%,#ffe7a1,#db9c12 72%);box-shadow:0 0 0 6px var(--gold-soft),0 13px 26px -8px rgba(239,176,44,.7),inset 0 2px 3px rgba(255,255,255,.6),inset 0 -4px 7px rgba(0,0,0,.15)}
  .thmedal.bronze{background:radial-gradient(circle at 35% 27%,#f2c69c,#a9631f 74%);box-shadow:0 0 0 6px #f4e3d5,0 13px 26px -8px rgba(169,99,31,.5),inset 0 2px 3px rgba(255,255,255,.55),inset 0 -4px 7px rgba(0,0,0,.14)}
  .thmedal.silver{background:radial-gradient(circle at 35% 27%,#f6f9fc,#93a0b3 74%);box-shadow:0 0 0 6px #eef1f6,0 13px 26px -8px rgba(147,160,179,.5),inset 0 2px 3px rgba(255,255,255,.6),inset 0 -4px 7px rgba(0,0,0,.12)}
  .thmedal.plat{background:radial-gradient(circle at 35% 27%,#fdfeff,#bfc9db 74%);box-shadow:0 0 0 6px #eef2f8,0 13px 26px -8px rgba(150,160,180,.5),inset 0 2px 3px rgba(255,255,255,.6),inset 0 -4px 7px rgba(0,0,0,.12)}
  .thmedal svg{width:30px;height:30px;stroke:rgba(255,255,255,.96);stroke-width:2;filter:drop-shadow(0 1px 1px rgba(0,0,0,.28))}
  .thname{font-family:var(--font-sora);font-weight:800;font-size:1.55rem;letter-spacing:-.01em;line-height:1}
  .thsub{color:var(--muted);font-size:.87rem;margin-top:3px}
  .track{height:10px;border-radius:99px;background:var(--panel-2);border:1px solid var(--line);margin:14px 0 0;overflow:hidden}
  .fill{height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#dd9e15,var(--gold),#ffdc85);box-shadow:0 0 12px rgba(239,176,44,.5);transition:width 1.3s cubic-bezier(.2,.8,.2,1)}
  .prog-head{display:flex;justify-content:space-between;align-items:baseline;font-size:.88rem;color:var(--muted)}.prog-head b{color:var(--ink);font-family:var(--font-sora)}

  .bars{display:flex;align-items:flex-end;gap:10px;height:150px;margin-top:14px;padding-top:22px}
  .bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end}
  .bar{width:100%;max-width:38px;border-radius:8px 8px 4px 4px;background:linear-gradient(180deg,#f6c04b,var(--gold));position:relative;transition:height 1s cubic-bezier(.2,.8,.2,1);min-height:4px;cursor:pointer}
  .bar:hover{filter:brightness(1.06)}.bar.on{background:linear-gradient(180deg,#5b93ff,var(--primary))}
  .bar .val{position:absolute;top:-20px;left:50%;transform:translateX(-50%);font-size:.7rem;font-weight:700;color:var(--gold-deep);white-space:nowrap}.bar.on .val{color:var(--primary-600)}
  .bar-col .m{font-size:.72rem;color:var(--faint);font-weight:600}.bar-col.on .m{color:var(--primary-600);font-weight:700}

  /* stripe/shopify filter */
  .filterbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:10px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow-sm)}
  .seg{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px}
  .seg button{border:0;background:none;font-family:var(--font-outfit);font-weight:600;font-size:.83rem;color:var(--muted);padding:7px 13px;border-radius:8px;cursor:pointer;transition:.14s}
  .seg button:hover{color:var(--ink)}.seg button.on{background:var(--panel);color:var(--ink);box-shadow:0 1px 2px rgba(30,42,90,.12),0 2px 6px -3px rgba(30,42,90,.25)}
  .dd{display:inline-flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;font-weight:600;font-size:.85rem;cursor:pointer;color:var(--ink);box-shadow:0 1px 2px rgba(30,42,90,.04);transition:border-color .14s,box-shadow .14s,transform .14s,color .14s}
  .dd:hover{border-color:var(--primary);color:var(--primary-600);transform:translateY(-1px)}.dd:hover svg{color:var(--primary-600)}.dd svg{width:15px;height:15px;color:var(--faint)}
  .expbtn{background:var(--primary-tint);border-color:#d9e2ff;color:var(--primary-600);font-weight:700}.expbtn svg{color:var(--primary-600)}
  .expbtn:hover{background:var(--primary);border-color:var(--primary);color:#fff;box-shadow:0 10px 22px -12px rgba(61,123,244,.7);transform:translateY(-1px)}.expbtn:hover svg{color:#fff}
  .filters-l{display:flex;gap:10px;align-items:center;flex-wrap:wrap}

  .sumbar{display:grid;grid-template-columns:repeat(4,1fr);gap:0;background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-sm)}
  .sumbar .c{padding:15px 18px;border-right:1px solid var(--line)}.sumbar .c:last-child{border-right:0}
  .sumbar .l{font-size:.72rem;font-weight:600;color:var(--faint);display:flex;align-items:center;gap:7px}.sumbar .l svg{width:15px;height:15px}
  .sumbar .n{font-family:var(--font-sora);font-weight:700;font-size:1.2rem;margin-top:6px}.sumbar .n.win{color:var(--win)}

  .rrow{background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow-sm);overflow:hidden;transition:.15s}
  .rrow.open{border-color:var(--primary);box-shadow:0 20px 40px -24px rgba(61,123,244,.4)}
  .rhead{display:grid;grid-template-columns:46px 1.5fr 1fr 1fr 128px 24px;gap:14px;align-items:center;padding:15px 18px;cursor:pointer}
  .rhead:hover{background:var(--panel-2)}
  .ava{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;font-family:var(--font-sora);font-weight:700;font-size:.95rem;color:#fff;background:linear-gradient(135deg,#5b93ff,var(--primary))}
  .rhead .who{font-weight:700;line-height:1.2}.rhead .code{color:var(--faint);font-size:.78rem;font-family:ui-monospace,monospace}
  .col .lbl{font-size:.66rem;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--faint)}
  .col .num{font-weight:700;margin-top:2px}.col .num.win{color:var(--win)}
  .col.comm{text-align:right}.col.comm .lbl{white-space:nowrap}.col.comm .num{font-family:var(--font-sora);font-weight:800;font-size:1.06rem;margin-top:3px}
  .feepill{font-size:.72rem;font-weight:700;color:var(--gold-deep);background:var(--gold-soft);border:1px solid #f2d9a3;padding:3px 8px;border-radius:99px;display:inline-block}
  .terms{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
  .tbadge{font-size:.66rem;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid;line-height:1.55;white-space:nowrap}
  .tbadge.once{color:var(--gold-deep);background:var(--gold-soft);border-color:#f2d9a3}
  .tbadge.monthly{color:#0e8a9c;background:#d7f4f8;border-color:#a9e3ea}
  .tbadge.topup{color:var(--primary-600);background:var(--primary-tint);border-color:#cfe0ff}
  .termsbig{margin:2px 0 6px}.termsbig .tbadge{font-size:.72rem;padding:4px 10px}
  .miniwrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .rdtop{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:2px}
  .btn.sm2{padding:8px 12px;font-size:.82rem;border-radius:10px}.dd.sm2{padding:8px 12px;font-size:.83rem}
  .holdnote{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:.8rem;color:var(--muted);background:var(--panel);border:1px dashed var(--line-2);border-radius:10px;padding:9px 11px}.holdnote svg{width:15px;height:15px;color:var(--gold-deep);flex:0 0 auto;margin-top:1px}
  .mnote2{font-size:.88rem;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:11px 13px}
  .morerow{display:none}.mini.allshown .morerow{display:table-row}
  .mini .neg,.subtotal .b b.neg{color:#c0392b;font-weight:700}
  .badge.reversed{background:#fdecec;color:#c0392b}
  .viewall{margin-top:10px}
  .refhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap}
  .refhead h2{font-family:var(--font-sora);font-weight:700;font-size:1.05rem}.muted2{color:var(--faint);font-weight:600;font-size:.9rem}
  .ci{width:24px;height:24px;border-radius:7px;display:inline-grid;place-items:center;flex:0 0 auto}.ci svg{width:14px;height:14px}
  .ci.b{background:var(--primary-tint);color:var(--primary-600)}.ci.t{background:#d7f4f8;color:#0e8a9c}.ci.g{background:var(--gold-soft);color:var(--gold-deep)}
  .chev{color:var(--faint);transition:transform .2s}.rrow.open .chev{transform:rotate(180deg);color:var(--primary)}
  .rdetail{display:none;padding:2px 18px 18px;border-top:1px dashed var(--line);background:var(--panel-2)}
  .rrow.open .rdetail{display:block;animation:fade .25s ease}
  .subhead{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:16px 0 8px;display:flex;align-items:center;gap:7px}.subhead svg{width:14px;height:14px}
  .mini{width:100%;border-collapse:collapse;font-size:.86rem}
  .mini th{text-align:left;font-size:.68rem;letter-spacing:.03em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:0 10px 8px}
  .mini td{padding:10px;border-top:1px solid var(--line);background:var(--panel)}.mini tr:first-child td{border-top:0}.mini td.r{text-align:right;font-variant-numeric:tabular-nums}
  .mini .acc{display:flex;align-items:center;gap:9px;font-weight:600}.mini .acc svg{width:16px;height:16px;color:var(--primary)}.mini .win{color:var(--win);font-weight:700}
  .subtotal{display:flex;flex-wrap:wrap;gap:18px;margin-top:14px;padding:14px 16px;border-radius:12px;background:var(--panel);border:1px solid var(--line)}
  .subtotal .b{font-size:.72rem;color:var(--faint);font-weight:600}.subtotal .b b{display:block;font-family:var(--font-sora);font-size:1.05rem;color:var(--ink);margin-top:2px}.subtotal .b b.win{color:var(--win)}.subtotal .b b.gold{color:var(--gold-deep)}
  .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;font-size:.72rem;font-weight:700}
  .badge.paid{background:var(--win-soft);color:var(--win)}.badge.pending{background:var(--gold-soft);color:var(--gold-deep)}

  /* payouts */
  .balance{position:relative;overflow:hidden;border-radius:22px;padding:28px;color:#fff;background:radial-gradient(120% 130% at 100% 0%,rgba(24,184,206,.55),transparent 52%),radial-gradient(110% 120% at 0% 100%,rgba(139,92,246,.4),transparent 55%),linear-gradient(145deg,#2f63d6,#3d7bf4 48%,#3fa1c4);box-shadow:0 30px 60px -26px rgba(47,102,216,.85),inset 0 1px 0 rgba(255,255,255,.28)}
  .balance .l{font-size:.74rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
  .balance .amt{font-family:var(--font-sora);font-weight:800;font-size:2.8rem;letter-spacing:-.02em;margin:6px 0 2px}
  .balance .sub{opacity:.85;font-size:.9rem}
  .balance .btn.gold{margin-top:16px}
  .payin{display:flex;width:fit-content;align-items:center;gap:7px;margin-top:14px;font-size:.8rem;font-weight:600;color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.32);padding:8px 14px;border-radius:99px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}.payin svg{width:14px;height:14px;color:#fff}
  .bshine{position:absolute;top:-45%;right:-12%;width:65%;height:170%;background:radial-gradient(circle,rgba(255,255,255,.28),transparent 60%);pointer-events:none}
  .brow{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;position:relative;flex-wrap:wrap;gap:8px}
  .btag{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;font-weight:700;color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);padding:5px 11px;border-radius:99px}.btag svg{width:14px;height:14px;color:#fff}
  .btag.ghost2{background:rgba(255,255,255,.1)}
  .bcur{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;position:relative}
  .cchip{font-size:.8rem;font-weight:700;color:#fff;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);padding:5px 11px;border-radius:99px;font-family:ui-monospace,monospace}
  .bpots{display:flex;gap:10px;margin:8px 0 2px;position:relative;flex-wrap:wrap}
  .bpot{flex:1;min-width:118px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.28);border-radius:15px;padding:13px 15px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);box-shadow:inset 0 1px 0 rgba(255,255,255,.22);transition:.15s}
  .bpot:hover{background:rgba(255,255,255,.22);transform:translateY(-1px)}
  .bpot .pl{display:block;font-size:.64rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.85)}
  .bpot b{font-family:var(--font-sora);font-weight:800;font-size:1.72rem;letter-spacing:-.02em;display:block;margin-top:4px}
  .balance .sub b{font-weight:800}
  .bactions{display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap;position:relative}
  .bactions .btn.gold{margin-top:0}.bactions .payin{margin-top:0}
  .tbl{width:100%;border-collapse:collapse;font-size:.9rem}
  .tbl th{text-align:left;font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:0 14px 12px}
  .tbl td{padding:14px;border-top:1px solid var(--line)}.tbl tr:hover td{background:var(--panel-2)}

  /* notifications */
  .nrow{display:flex;gap:13px;align-items:flex-start;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow-sm)}
  .nrow.unread{border-color:var(--primary-tint);background:linear-gradient(90deg,var(--primary-tint),var(--panel) 60%)}
  .nic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}
  .nic.win{background:var(--win-soft);color:var(--win)}.nic.gold{background:var(--gold-soft);color:var(--gold-deep)}.nic.blue{background:var(--primary-tint);color:var(--primary-600)}
  .nic svg{width:19px;height:19px}
  .nrow .t{font-weight:600}.nrow .d{color:var(--muted);font-size:.85rem}.nrow .tm{margin-left:auto;color:var(--faint);font-size:.78rem;white-space:nowrap}
  .undot{width:8px;height:8px;border-radius:50%;background:var(--primary);margin-top:6px;flex:0 0 auto}

  /* settings */
  .field{margin-bottom:14px}.field label{font-size:.8rem;font-weight:600;color:var(--muted);display:block;margin-bottom:6px}
  .field input{width:100%;font-family:var(--font-outfit);font-size:.92rem;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;background:var(--panel-2);color:var(--ink)}
  .field input:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
  .subhead2{display:flex;align-items:center;gap:8px;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:18px 0 12px;padding-top:16px;border-top:1px solid var(--line)}.subhead2 svg{width:15px;height:15px;color:var(--primary)}
  .frow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .avpick{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;margin-top:6px}
  .av-current{width:88px;height:88px;border-radius:20px;overflow:hidden;box-shadow:var(--shadow-sm);flex:0 0 auto;background:var(--panel-2)}.av-current svg{width:100%;height:100%;display:block}
  .avgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;flex:1;min-width:220px}
  .avopt{aspect-ratio:1;border-radius:13px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:.12s;padding:0;background:none;line-height:0}
  .avopt svg{width:100%;height:100%;display:block}.avopt:hover{transform:translateY(-2px)}
  .avopt.sel{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
  .avopt.more{display:grid;place-items:center;background:var(--panel-2);border:2px dashed var(--line-2);color:var(--faint)}
  .avopt.more svg{width:42%;height:42%}.avopt.more:hover{border-color:var(--primary);color:var(--primary-600);transform:translateY(-2px)}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-top:1px solid var(--line)}.toggle-row:first-child{border-top:0}
  .toggle-row .t{font-weight:600;font-size:.92rem}.toggle-row .d{color:var(--faint);font-size:.82rem}
  .sw{width:44px;height:26px;border-radius:99px;background:var(--line-2);position:relative;cursor:pointer;flex:0 0 auto;transition:.18s;border:0}
  .sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:.18s}
  .sw.on{background:var(--primary)}.sw.on::after{left:21px}
  .feed-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--line)}.feed-row:first-child{border-top:0}
  .feed-ic{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--win-soft);color:var(--win);flex:0 0 auto}.feed-ic svg{width:18px;height:18px}.feed .amt{margin-left:auto;font-family:var(--font-sora);font-weight:700;color:var(--win)}
  .faq .q{font-family:var(--font-sora);font-weight:700;font-size:.98rem;margin-bottom:4px}.faq .a{color:var(--muted);font-size:.9rem}.faq>div{margin-bottom:12px}

  .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(30px);background:var(--ink);color:#fff;padding:13px 20px;border-radius:12px;font-weight:600;font-size:.9rem;box-shadow:var(--shadow);opacity:0;transition:.25s;z-index:90;display:flex;align-items:center;gap:9px}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.toast svg{width:18px;height:18px;color:var(--win)}
  .modal{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px}
  .modal[hidden]{display:none}
  .mback{position:absolute;inset:0;background:rgba(22,26,35,.45);backdrop-filter:blur(2px)}
  .mcard{position:relative;width:min(460px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:22px;animation:pop .2s ease}
  @keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
  .mhead{display:flex;justify-content:space-between;align-items:center}.mhead h2{font-size:1.15rem}.mhead .iconbtn{width:34px;height:34px;font-size:1.1rem;font-weight:600}
  .mlabel{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:16px 0 8px}
  .seg2{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px}
  .seg2 button{border:0;background:none;font-family:var(--font-outfit);font-weight:700;font-size:.86rem;color:var(--muted);padding:8px 20px;border-radius:8px;cursor:pointer}
  .seg2 button.on{background:var(--panel);color:var(--primary-600);box-shadow:0 1px 3px rgba(30,42,90,.16)}
  .convo{margin-top:12px;padding:12px 14px;border-radius:12px;background:var(--win-soft);border:1px solid rgba(16,185,129,.25);font-size:.9rem;color:#0e7a58}.convo b{font-family:var(--font-sora);font-size:1.05rem}.convo span{color:var(--muted);font-size:.8rem}
  .bankopts{display:flex;flex-direction:column;gap:8px}
  .bankopt{display:flex;align-items:center;gap:11px;padding:12px 13px;border:1px solid var(--line-2);border-radius:12px;cursor:pointer;transition:.12s}
  .bankopt:hover{border-color:var(--primary)}.bankopt.sel{border-color:var(--primary);background:var(--primary-tint)}
  .bankopt input{accent-color:var(--primary);width:17px;height:17px;flex:0 0 auto}
  .bankopt span{display:flex;flex-direction:column;line-height:1.3}.bankopt b{font-size:.9rem}.bankopt small{color:var(--faint);font-size:.78rem}
  .otherbank{margin-top:10px;padding-top:12px;border-top:1px dashed var(--line)}
  .mnote{font-size:.8rem;color:var(--faint);text-align:center;margin:12px 0 0}

  @media (max-width:960px){.search{display:none}}
  @media (max-width:900px){
    .sidebar{position:fixed;z-index:60;left:0;top:0;transform:translateX(-100%);transition:transform .22s;box-shadow:var(--shadow)}.sidebar.open{transform:none}
    .ham{display:grid}.scrim{display:none;position:fixed;inset:0;background:rgba(22,26,35,.4);z-index:55}.scrim.on{display:block}
    .stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}.sumbar{grid-template-columns:repeat(2,1fr)}
    .tool.earn,.tool.tier2,.tdiv{display:none}.rhead{grid-template-columns:44px 1fr 108px 22px}.rhead .col.hide{display:none}
    .bottombar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:color-mix(in srgb,var(--panel) 96%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:7px 4px calc(7px + env(safe-area-inset-bottom));justify-content:space-around;gap:2px}
    .bb{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;color:var(--faint);font-size:.6rem;font-weight:700;padding:4px 2px;cursor:pointer;transition:.14s}
    .bbic{width:46px;height:28px;border-radius:99px;display:grid;place-items:center;position:relative;transition:.16s}
    .bb svg{width:22px;height:22px}
    .bb.on{color:var(--primary-600)}.bb.on .bbic{background:var(--primary-tint)}
    .bb:active .bbic{transform:scale(.92)}
    .content{padding:20px 16px 92px}
    .tb-title{display:none}.tb-brand .mark{display:grid}.topbar{gap:9px;padding:10px 14px}.tier{padding:7px 10px}
    .avgrid{grid-template-columns:repeat(5,1fr)}.frow{grid-template-columns:1fr}
    .filterbar{gap:8px}
  }
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
