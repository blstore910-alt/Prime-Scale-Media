// AUTO-GENERATED verbatim from admin-app.html mockup (scoped .admapp).
export const ADM_CSS = `
  .admapp{--ground:#f4f6fc;--panel:#fff;--panel-2:#f1f4fb;--ink:#12162a;--muted:#5c6577;--faint:#8b93a6;
    --line:#e6e9f2;--line-2:#d8ddec;--primary:#3a6fff;--primary-600:#2f5ae6;--primary-tint:#eaf1ff;
    --blue:#5B8DFF;--purple:#8B5CF6;--purple-tint:#f3e8ff;--navy1:#04050E;--navy2:#0c1230;--navy3:#0f172a;
    --win:#10b981;--win-soft:#daf5ec;--warn:#e08a00;--warn-soft:#fdeecb;--danger:#e5484d;--danger-soft:#fdecec;
    --gold:#efb02c;--gold-soft:#fdeecb;--teal:#0e93a6;
    --hd:var(--font-jakarta),system-ui,sans-serif;--bd:var(--font-dmsans),system-ui,sans-serif;
    --brand:linear-gradient(135deg,#5B8DFF,#8B5CF6);
    --shadow-sm:0 10px 26px -20px rgba(20,30,80,.5);--shadow:0 24px 54px -28px rgba(20,30,80,.4);--sidebar:262px;--pad:20px}
  .admapp *{box-sizing:border-box}
  .admapp{background:var(--ground);color:var(--ink);font-family:var(--bd);line-height:1.55;-webkit-font-smoothing:antialiased;min-height:100vh}
  svg.ic{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;display:block;flex:0 0 auto}
  .mono{font-family:ui-monospace,Menlo,monospace}
  h2{font-family:var(--hd);font-weight:800;font-size:1.1rem;letter-spacing:-.02em;margin:0}
  .cap{color:var(--muted);font-size:.9rem;margin:6px 0 16px}

  .app{display:flex;min-height:100vh}
  .sidebar{width:var(--sidebar);flex:0 0 auto;background:var(--panel);border-right:1px solid var(--line);padding:16px 12px;display:flex;flex-direction:column;gap:2px;position:sticky;top:0;height:100vh;overflow-y:auto}
  .sidebar::-webkit-scrollbar{width:8px}.sidebar::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:8px}
  .logo{display:flex;align-items:center;gap:11px;padding:6px 8px 14px}
  .mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#fff;flex:0 0 auto;background:linear-gradient(135deg,var(--navy1),var(--navy2),var(--navy3));box-shadow:0 0 22px rgba(91,141,255,.4),0 0 0 1px rgba(91,141,255,.28)}
  .mark svg{width:20px;height:20px}
  .logo .name{font-family:var(--hd);font-weight:800;letter-spacing:-.025em;font-size:.96rem;line-height:1.1}
  .logo .name small{display:block;font-weight:700;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--primary-600);margin-top:3px}
  .navsec{font-size:.62rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding:12px 12px 5px}
  .navlink{display:flex;align-items:center;gap:11px;padding:9px 11px;border-radius:10px;font-weight:600;font-size:.89rem;color:var(--muted);cursor:pointer;transition:.14s;border:0;background:none;width:100%;text-align:left;font-family:var(--bd)}
  .navlink:hover{background:var(--panel-2);color:var(--ink)}.navlink.on{background:var(--primary-tint);color:var(--primary-600)}
  .navlink svg{width:18px;height:18px}.navlink .n{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:var(--danger);color:#fff;font-size:.64rem;font-weight:700;display:grid;place-items:center}
  .side-foot{margin-top:auto;padding:12px 8px 4px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px}
  .side-foot .avatar{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.8rem;color:#fff;background:linear-gradient(135deg,#2f66d8,var(--primary))}
  .side-foot .who{font-size:.83rem;font-weight:700;line-height:1.2}.side-foot .who small{display:block;color:var(--faint);font-weight:500;font-size:.7rem}

  .main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{display:flex;align-items:center;gap:12px;padding:11px 22px;position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--panel) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .tb-brand{display:flex;align-items:center;gap:10px}.tb-brand .mark{width:34px;height:34px}
  .tb-title{font-family:var(--hd);font-weight:800;font-size:1.1rem;letter-spacing:-.02em}
  .rolechip{display:inline-flex;align-items:center;gap:6px;font-size:.7rem;font-weight:800;color:var(--primary-600);background:var(--primary-tint);border:1px solid #cfe0ff;padding:4px 10px;border-radius:99px}
  .search{display:flex;align-items:center;gap:9px;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:9px 13px;min-width:160px;max-width:300px;flex:1;color:var(--faint)}
  .search svg{width:17px;height:17px}.search input{border:0;background:none;outline:0;font-family:var(--bd);font-size:.9rem;color:var(--ink);width:100%}
  .tb-spacer{flex:1}
  .toolbar{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:16px;padding:5px;box-shadow:0 10px 24px -16px rgba(20,30,80,.55),inset 0 1px 0 rgba(255,255,255,.6)}
  .tool{display:inline-flex;align-items:center;gap:8px;border:0;background:none;font-family:var(--bd);font-weight:700;color:var(--ink);border-radius:12px;padding:7px 12px;height:42px;cursor:pointer;position:relative;transition:.13s}
  .tool svg{width:18px;height:18px;color:var(--muted)}
  .tool.mm{background:var(--win-soft);border:1px solid rgba(16,185,129,.24);color:#0e8f66;font-weight:700;font-size:.82rem}.tool.mm svg{color:var(--win)}
  .tool.ic-btn,.tool.ava-btn{background:var(--panel);border:1px solid var(--line)}.tool.ic-btn:hover,.tool.ava-btn:hover{background:var(--panel-2)}
  .tool.ic-btn{padding:7px 11px}
  .badge-n{position:absolute;top:0;right:2px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:var(--danger);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--panel)}
  .tool.ava-btn{padding:4px 8px 4px 4px}
  .tool.ava-btn .avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.8rem;color:#fff;background:linear-gradient(135deg,#2f66d8,var(--primary))}
  .tool.ava-btn svg{width:15px}
  .iconbtn{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--panel);color:var(--muted);display:grid;place-items:center;cursor:pointer}
  .ham{display:none}

  .content{padding:24px 26px 70px;max-width:1200px;width:100%;margin:0 auto}
  .view{display:none;flex-direction:column;gap:16px}.view.on{display:flex;animation:fade .28s ease}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
  .phead h1{font-family:var(--hd);font-weight:800;font-size:1.5rem;letter-spacing:-.02em;margin:0}
  .phead p{color:var(--muted);font-size:.92rem;margin:4px 0 0}

  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:var(--pad);box-shadow:var(--shadow-sm)}
  .card.flush{padding:16px 6px 6px}.card.flush .ph2{padding:0 16px 10px}
  .ph2{display:flex;justify-content:space-between;align-items:center;gap:10px}
  .btn{display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;font-family:var(--bd);font-weight:700;border-radius:11px;padding:11px 16px;background:var(--primary);color:#fff;white-space:nowrap;box-shadow:0 12px 26px -12px rgba(58,111,255,.7);transition:.12s}
  .btn:hover{transform:translateY(-1px);background:var(--primary-600)}.btn svg{width:17px;height:17px}
  .btn.sm{padding:7px 11px;font-size:.82rem;border-radius:9px}
  .btn.ghost{background:var(--panel);color:var(--ink);box-shadow:none;border:1px solid var(--line-2)}.btn.ghost:hover{background:var(--panel-2);border-color:var(--primary);color:var(--primary-600)}
  .btn.grad{background:var(--brand);box-shadow:0 12px 26px -12px rgba(124,92,255,.7)}
  .btn.win{background:var(--win);box-shadow:0 12px 26px -12px rgba(16,185,129,.6)}.btn.win:hover{background:#0e9e6e}
  .btn.danger{background:#fff;color:var(--danger);border:1px solid #f3c0c2;box-shadow:none}.btn.danger:hover{background:var(--danger-soft);transform:translateY(-1px)}
  .btn.block{width:100%;justify-content:center}

  .attn{display:flex;align-items:center;gap:13px;background:linear-gradient(135deg,var(--primary-tint),var(--purple-tint));border:1px solid #d9e2ff;border-radius:16px;padding:14px 16px;flex-wrap:wrap}
  .attn .ai{width:38px;height:38px;border-radius:10px;background:#fff;display:grid;place-items:center;color:var(--primary-600);flex:0 0 auto}
  .attn b{font-weight:800;font-family:var(--hd)}.attn .sub{color:var(--muted);font-size:.86rem}

  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:var(--shadow-sm);transition:transform .16s,box-shadow .16s;cursor:pointer}
  .stat:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
  .stat .k{display:flex;align-items:center;gap:8px;font-size:.75rem;font-weight:600;color:var(--faint)}
  .ci{width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center;flex:0 0 auto}.ci svg{width:15px;height:15px}
  .ci.b{background:var(--primary-tint);color:var(--primary-600)}.ci.t{background:#d7f4f8;color:var(--teal)}.ci.g{background:var(--gold-soft);color:#a9740b}.ci.p{background:var(--purple-tint);color:var(--purple)}.ci.w{background:var(--win-soft);color:var(--win)}.ci.d{background:var(--danger-soft);color:var(--danger)}
  .stat .v{font-family:var(--hd);font-weight:800;font-size:1.4rem;letter-spacing:-.02em;margin-top:10px}
  .stat .sub{font-size:.75rem;color:var(--faint);margin-top:2px}

  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .qcard{display:flex;align-items:center;gap:13px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s}
  .qcard:hover{border-color:var(--primary);transform:translateY(-2px)}
  .qcard .qi{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}
  .qcard .qn{font-family:var(--hd);font-weight:800;font-size:1.15rem}.qcard .ql{color:var(--muted);font-size:.84rem}
  .qcard .go{margin-left:auto;color:var(--faint)}

  .tblwrap{overflow-x:auto}
  .tbl{width:100%;border-collapse:collapse;font-size:.88rem}
  .tbl th{text-align:left;font-size:.66rem;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:700;padding:0 12px 11px;white-space:nowrap}
  .tbl td{padding:12px;border-top:1px solid var(--line);vertical-align:middle}
  .tbl th:first-child,.tbl td:first-child{padding-left:16px}.tbl th:last-child,.tbl td:last-child{padding-right:16px}
  .tbl tr.clk{cursor:pointer}.tbl tbody tr.clk:hover td{background:var(--primary-tint)}
  .tbl tbody tr:hover td{background:var(--panel-2)}
  .tbl .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .tbl .acts{display:flex;gap:6px;justify-content:flex-end}
  .co{display:flex;align-items:center;gap:10px}.co .av{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.76rem;color:#fff;background:var(--brand);flex:0 0 auto}
  .co .nm{font-weight:700;line-height:1.15;white-space:nowrap}.co .cd{color:var(--faint);font-size:.74rem;font-family:ui-monospace,monospace}
  .badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap}
  .badge.ok{background:var(--win-soft);color:#0e8f66}.badge.pend{background:var(--warn-soft);color:#8a5a00}.badge.due{background:var(--danger-soft);color:#c0392b}.badge.info{background:var(--primary-tint);color:var(--primary-600)}.badge.pur{background:var(--purple-tint);color:var(--purple)}.badge.mut{background:var(--panel-2);color:var(--muted)}
  .pfi{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:#fff;border:1px solid var(--line-2);flex:0 0 auto}.pfi svg{width:18px;height:18px}.pfi.tt{background:#000;border-color:#000}
  .plat{display:inline-flex;align-items:center;gap:9px;font-weight:600;white-space:nowrap}
  .slip{display:inline-flex;align-items:center;gap:6px;color:var(--primary-600);font-weight:700;font-size:.82rem;cursor:pointer}.slip svg{width:15px;height:15px}
  .cur2{font-size:.74rem;color:var(--faint)}.neg{color:#c0392b;font-weight:700}.pos{color:#0e8f66;font-weight:700}

  .check{display:flex;align-items:center;gap:13px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow-sm)}
  .check .cki{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto}
  .check.ok .cki{background:var(--win-soft);color:var(--win)}.check.warn .cki{background:var(--warn-soft);color:var(--warn)}
  .check .ct{font-weight:700}.check .cd{color:var(--faint);font-size:.84rem}.check .cv{margin-left:auto;text-align:right;font-family:var(--hd);font-weight:800;white-space:nowrap}
  .recon-hero{position:relative;overflow:hidden;border-radius:16px;padding:22px;color:#fff;background:linear-gradient(135deg,#0e9e6e,var(--win) 60%,#3ad1a0);box-shadow:0 22px 46px -26px rgba(16,185,129,.7)}
  .recon-hero .rh-l{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
  .recon-hero .rh-v{font-family:var(--hd);font-weight:800;font-size:1.9rem;margin:6px 0 2px}
  .selbox{font-family:var(--bd);font-weight:700;font-size:.86rem;border:1px solid var(--line-2);border-radius:11px;padding:10px 13px;background:var(--panel);color:var(--ink);cursor:pointer}
  .profit-hero{position:relative;border-radius:16px;padding:22px;color:#fff;background:linear-gradient(135deg,var(--navy1),var(--navy2) 55%,#1a2350);box-shadow:0 22px 46px -26px rgba(20,30,80,.85)}
  .hclip{position:absolute;inset:0;overflow:hidden;border-radius:16px;pointer-events:none}
  .profit-hero .phd{position:absolute;top:14px;right:14px;z-index:3}
  .profit-hero .pl{padding-right:130px}
  .profit-hero .ring{position:absolute;inset:-45%;background:conic-gradient(from 0deg,transparent,rgba(91,141,255,.18),transparent 30%,rgba(139,92,246,.18),transparent 60%);animation:spin 26s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .profit-hero>*{position:relative}
  .profit-hero .pl{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
  .profit-hero .pv{font-family:var(--hd);font-weight:800;font-size:2.6rem;letter-spacing:-.02em;margin:6px 0 2px;background:linear-gradient(135deg,#9db8ff,#c9b3ff);-webkit-background-clip:text;background-clip:text;color:transparent}
  .profit-hero .prow{display:flex;gap:24px;flex-wrap:wrap;margin-top:14px}
  .profit-hero .prow .b span{font-size:.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.75}
  .profit-hero .prow .b b{display:block;font-family:var(--hd);font-size:1.15rem;margin-top:3px}
  .metric{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px;box-shadow:var(--shadow-sm)}
  .metric .k{display:flex;align-items:center;gap:8px;font-size:.73rem;font-weight:600;color:var(--faint)}
  .metric .v{font-family:var(--hd);font-weight:800;font-size:1.25rem;margin-top:9px;letter-spacing:-.01em}
  .metric .sub{font-size:.72rem;color:var(--faint);margin-top:2px}
  .qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px}
  .qtile.clk{cursor:pointer}
  .seg2{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px;flex-wrap:wrap}
  .seg2 button{border:0;background:none;font-family:var(--bd);font-weight:700;font-size:.84rem;color:var(--muted);padding:8px 14px;border-radius:8px;cursor:pointer}
  .seg2 button.on{background:var(--panel);color:var(--primary-600);box-shadow:0 1px 3px rgba(20,30,80,.16)}
  .qtile{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:13px 15px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:6px;transition:.15s}
  .qtile:hover{border-color:var(--line-2);transform:translateY(-2px);box-shadow:var(--shadow)}
  .qtile .qt-h{display:flex;align-items:center;gap:10px}
  .qtile .qt-amt{font-family:var(--hd);font-weight:800;font-size:1.35rem}
  .qtile .qt-meta{color:var(--faint);font-size:.82rem}
  .qtile .qt-acts{display:flex;gap:7px;flex-wrap:wrap;margin-top:4px}
  .warnbox{display:flex;gap:11px;background:var(--danger-soft);border:1px solid #f3c0c2;border-radius:12px;padding:13px;color:#8a2a2a;font-size:.88rem;margin-top:12px}.warnbox svg{width:18px;height:18px;color:var(--danger);flex:0 0 auto}
  .kvbox{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:8px}
  .kvr{display:flex;justify-content:space-between;gap:12px;padding:11px 13px;border-top:1px solid var(--line);font-size:.9rem}.kvr:first-child{border-top:0}
  .kvr span{color:var(--faint)}.kvr b{font-weight:700;text-align:right}
  .slipthumb{margin-top:12px;border:1px solid var(--line);border-radius:12px;height:120px;display:grid;place-items:center;color:var(--faint);font-size:.82rem;background:var(--panel-2);background-image:linear-gradient(45deg,#eef1f8 25%,transparent 25%),linear-gradient(-45deg,#eef1f8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef1f8 75%),linear-gradient(-45deg,transparent 75%,#eef1f8 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}
  .ddwrap{position:relative}
  .dd{display:inline-flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line-2);border-radius:12px;padding:10px 14px;font-family:var(--hd);font-weight:800;font-size:.88rem;cursor:pointer;color:var(--ink);box-shadow:var(--shadow-sm)}
  .dd:hover{border-color:var(--primary)}.dd>svg{width:16px;height:16px;color:var(--primary-600)}.dd .ddchev{transition:transform .18s;color:var(--faint)}.dd.open .ddchev{transform:rotate(180deg)}
  .ddmenu{position:absolute;top:calc(100% + 6px);right:0;z-index:25;background:var(--panel);border:1px solid var(--line);border-radius:13px;box-shadow:var(--shadow);padding:6px;min-width:200px}
  .ddmenu button{display:block;width:100%;text-align:left;border:0;background:none;font-family:var(--bd);font-weight:600;font-size:.88rem;color:var(--ink);padding:10px 12px;border-radius:9px;cursor:pointer}
  .ddmenu button:hover{background:var(--panel-2)}.ddmenu button.on{background:var(--primary-tint);color:var(--primary-600)}
  .ddmenu{min-width:236px}
  .ddsep{height:1px;background:var(--line);margin:6px 8px}
  .ddfield{padding:8px 10px 4px}
  .ddfield>label{display:block;font-size:.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);margin-bottom:6px}
  .ddfield input{width:100%;font-family:var(--bd);font-weight:600;font-size:.85rem;border:1px solid var(--line-2);border-radius:10px;padding:9px 11px;background:var(--panel-2);color:var(--ink)}
  .ddfield input:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
  .ddfield input::-webkit-calendar-picker-indicator{opacity:.55;cursor:pointer}
  .ddrange{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .profit-hero .phd .dd{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28);color:#fff;box-shadow:none;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
  .profit-hero .phd .dd>svg,.profit-hero .phd .dd .ddchev{color:rgba(255,255,255,.9)}
  .profit-hero .phd .dd:hover{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.42)}
  .profit-hero .ohcta{margin-top:18px;background:#fff;color:var(--navy1);box-shadow:0 10px 22px -12px rgba(0,0,0,.45)}
  .profit-hero .ohcta:hover{background:#eef2ff;transform:translateY(-1px)}.profit-hero .ohcta svg{color:var(--navy1)}
  .profit-hero .prow{gap:12px}
  .profit-hero .prow .b{flex:1;min-width:118px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:11px 13px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
  .profit-hero .prow .b span{display:flex;align-items:center;gap:7px;opacity:.82}
  .profit-hero .prow .b .bi{width:14px;height:14px;opacity:.95;flex:0 0 auto}
  .profit-hero .prow .b b{font-size:1.35rem;margin-top:5px}
  .profit-hero .livedot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#4ade80;margin-right:7px;vertical-align:middle;box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:pulse 2.2s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.55)}70%{box-shadow:0 0 0 8px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
  @media(prefers-reduced-motion:reduce){.profit-hero .livedot{animation:none}}
  .tabs{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:4px;gap:3px}
  .tab{border:0;background:none;font-family:var(--bd);font-weight:700;font-size:.86rem;color:var(--muted);padding:8px 16px;border-radius:9px;cursor:pointer}
  .tab.on{background:var(--panel);color:var(--primary-600);box-shadow:0 1px 3px rgba(20,30,80,.15)}
  .filterrow{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:6px;padding:10px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:15px;box-shadow:0 10px 26px -20px rgba(20,30,80,.5)}
  .srch{display:flex;align-items:center;gap:9px;background:var(--panel);border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;flex:1;min-width:170px;max-width:320px;color:var(--faint);box-shadow:0 1px 2px rgba(20,30,80,.04);transition:border-color .14s,box-shadow .14s}
  .srch:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint);color:var(--primary-600)}
  .srch svg{width:16px;height:16px;flex:0 0 auto}.srch input{border:0;background:none;outline:0;font-family:var(--bd);font-size:.86rem;color:var(--ink);width:100%}
  .selbox2{font-family:var(--bd);font-weight:600;font-size:.84rem;border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;background:var(--panel);color:var(--ink);cursor:pointer;box-shadow:0 1px 2px rgba(20,30,80,.04);transition:border-color .14s,box-shadow .14s,color .14s}
  .selbox2:hover{border-color:var(--primary);color:var(--primary-600);background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232f5ae6' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>")}
  .selbox2:focus{outline:0;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
  .selbox2,.field select{-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b93a6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");background-repeat:no-repeat;background-position:right 11px center;background-size:15px;padding-right:34px}
  .expbtn{margin-left:auto;display:inline-flex;align-items:center;gap:8px;font-family:var(--bd);font-weight:700;font-size:.84rem;border:1px solid #d9e2ff;border-radius:11px;padding:9px 14px;background:var(--primary-tint);color:var(--primary-600);cursor:pointer;transition:.14s}
  .expbtn svg{width:16px;height:16px}
  .expbtn:hover{background:var(--primary);color:#fff;border-color:var(--primary);box-shadow:0 10px 22px -12px rgba(58,111,255,.7);transform:translateY(-1px)}
  .fbtog{display:none;align-items:center;gap:8px;font-family:var(--bd);font-weight:700;font-size:.84rem;border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;background:var(--panel);color:var(--ink);cursor:pointer;box-shadow:0 1px 2px rgba(20,30,80,.04)}
  .fbtog .ddchev{width:15px;height:15px;color:var(--faint);transition:transform .18s}.filterrow.open .fbtog .ddchev{transform:rotate(180deg)}
  .fselwrap{display:contents}
  @media(max-width:640px){.filterrow .srch{flex:1 1 100%;max-width:none}.fbtog{display:inline-flex}.fselwrap{display:none}
    .filterrow.open .fselwrap{display:flex;flex-direction:column;gap:9px;flex:1 1 100%}
    .filterrow.open .fselwrap .selbox2{width:100%}}
  .mlabel{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:16px 0 8px}
  .field textarea{width:100%;font-family:var(--bd);font-size:.92rem;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;background:var(--panel-2);color:var(--ink);resize:vertical;min-height:70px}
  .chk{display:flex;gap:9px;align-items:center;font-size:.9rem;font-weight:600;margin:8px 0 14px;cursor:pointer}.chk input{width:17px;height:17px;accent-color:var(--primary)}

  .cfg{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;border-top:1px solid var(--line);flex-wrap:wrap}.cfg:first-child{border-top:0}
  .cfg .nm{font-family:var(--hd);font-weight:800}.cfg .d{color:var(--faint);font-size:.84rem}
  .vals{display:flex;gap:8px;flex-wrap:wrap}.kpill{font-size:.76rem;font-weight:700;background:var(--panel-2);border:1px solid var(--line);border-radius:99px;padding:5px 10px}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-top:1px solid var(--line)}.toggle-row:first-child{border-top:0}
  .toggle-row .t{font-weight:700;font-size:.92rem}.toggle-row .d{color:var(--faint);font-size:.82rem}
  .sw{width:44px;height:26px;border-radius:99px;background:var(--line-2);position:relative;cursor:pointer;flex:0 0 auto;transition:.18s;border:0}
  .sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:.18s}
  .sw.on{background:var(--primary)}.sw.on::after{left:21px}
  .rlbar{height:7px;border-radius:99px;background:var(--panel-2);overflow:hidden;border:1px solid var(--line)}
  .rlbar>i{display:block;height:100%;border-radius:99px}.rlbar>i.ok{background:#10b981}.rlbar>i.pend{background:#e08a00}.rlbar>i.due{background:#e5484d}
  .tstep{font-size:.82rem;font-weight:600;color:var(--muted);margin-top:9px}
  .tasksteps{display:flex;flex-direction:column;gap:0;margin:14px 0 4px}
  .tk{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--line);font-size:.9rem}.tk:first-child{border-top:0}
  .tkdot{width:24px;height:24px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;border:2px solid var(--line-2);color:transparent;background:var(--panel)}.tkdot svg{width:13px;height:13px}
  .tk.done{color:var(--muted)}.tk.done .tkdot{background:#10b981;border-color:transparent;color:#fff}
  .tk.cur{color:var(--ink);font-weight:700}.tk.cur .tkdot{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
  .tk.pend{color:var(--faint)}.tk.sa .tkdot{border-color:#b9780a}.tk.sa{color:#b9780a}
  .claimbar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:var(--panel-2);border:1px solid var(--line);border-radius:9px;padding:5px 6px 5px 11px;margin:10px 0 2px;font-size:.76rem;font-weight:600;color:var(--muted)}
  .claimbar span{display:inline-flex;align-items:center;gap:5px}.claimbar svg{width:13px;height:13px;flex:0 0 auto}.claimbar .btn{margin:0;padding:5px 10px;font-size:.74rem}
  .claimbar.me{background:var(--primary-tint);border-color:transparent;color:var(--primary-600)}
  .claimbar.open{background:rgba(16,185,129,.13);border-color:transparent;color:#0e8f66}
  .claimchip{display:inline-flex;align-items:center;gap:6px;font-size:.72rem;font-weight:700;border-radius:99px;padding:3px 10px;margin-top:8px;background:var(--panel-2);border:1px solid var(--line-2);color:var(--muted)}
  .claimchip.me{background:var(--primary-tint);border-color:transparent;color:var(--primary-600)}
  .onlinebar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 14px;box-shadow:var(--shadow-sm);margin-bottom:10px}
  .onlinebar .olab{font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-right:2px}
  .oav{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.7rem;color:#fff;background:var(--primary);position:relative}
  .oav::after{content:"";position:absolute;right:-2px;bottom:-2px;width:9px;height:9px;border-radius:50%;background:#10b981;border:2px solid var(--panel)}
  .tfilt{margin-bottom:2px}
  .okic{width:64px;height:64px;border-radius:50%;margin:8px auto 6px;display:grid;place-items:center;background:rgba(16,185,129,.14);color:#10b981;box-shadow:0 0 0 8px rgba(16,185,129,.1);animation:okpop .4s cubic-bezier(.2,.8,.2,1)}
  .okic svg{width:30px;height:30px}
  @keyframes okpop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
  .field{margin-bottom:14px}.field label{font-size:.8rem;font-weight:600;color:var(--muted);display:block;margin-bottom:6px}
  .field input,.field select{width:100%;font-family:var(--bd);font-size:.92rem;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;background:var(--panel-2);color:var(--ink)}
  .field input:focus,.field select:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
  .frow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .actl{display:flex;gap:12px;align-items:flex-start}.actl .ai{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:0 0 auto;background:var(--panel-2);color:var(--muted)}.actl .ai svg{width:16px;height:16px}
  .actl .t{font-weight:600}.actl .d{color:var(--faint);font-size:.82rem}.actl .tm{margin-left:auto;color:var(--faint);font-size:.76rem;white-space:nowrap}
  .actrow{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)}.actrow:first-child{border-top:0}

  /* drawer */
  .drawer{position:fixed;inset:0;z-index:70}.drawer[hidden]{display:none}
  .dback{position:absolute;inset:0;background:rgba(12,18,48,.45);backdrop-filter:blur(2px)}
  .dpanel{position:absolute;top:0;right:0;height:100%;width:min(560px,100%);background:var(--ground);box-shadow:-30px 0 60px -30px rgba(12,18,48,.5);overflow-y:auto;animation:slidein .26s cubic-bezier(.2,.8,.2,1)}
  @keyframes slidein{from{transform:translateX(30px);opacity:.4}to{transform:none;opacity:1}}
  .dhead{position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:16px 18px;display:flex;align-items:center;gap:12px}
  .dhead .av{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-family:var(--hd);font-weight:800;color:#fff;background:var(--brand);flex:0 0 auto}
  .dhead .nm{font-family:var(--hd);font-weight:800;font-size:1.1rem;line-height:1.15}.dhead .cd{color:var(--faint);font-size:.78rem;font-family:ui-monospace,monospace}
  .dbody{padding:18px}
  .dacts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .dkpi{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:6px}
  .dk{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 13px}
  .dk span{font-size:.66rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
  .dk b{display:block;font-family:var(--hd);font-weight:800;font-size:1.15rem;margin-top:3px}
  .dsec{font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:18px 0 9px;display:flex;align-items:center;gap:7px}.dsec svg{width:14px;height:14px}
  .mini{width:100%;border-collapse:collapse;font-size:.85rem;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .mini th{text-align:left;font-size:.64rem;letter-spacing:.03em;text-transform:uppercase;color:var(--faint);font-weight:700;padding:10px 12px 8px}
  .mini td{padding:10px 12px;border-top:1px solid var(--line)}.mini .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .drow{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin-bottom:8px}
  .drow .nm{font-weight:700}.drow .sub{color:var(--faint);font-size:.78rem}.drow .rt{margin-left:auto;text-align:right}

  .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(30px);background:var(--ink);color:#fff;padding:13px 20px;border-radius:12px;font-weight:600;font-size:.9rem;box-shadow:var(--shadow);opacity:0;transition:.25s;z-index:95;display:flex;align-items:center;gap:9px}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.toast svg{width:18px;height:18px;color:var(--win)}
  .modal{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px}.modal[hidden]{display:none}
  .mback{position:absolute;inset:0;background:rgba(12,18,48,.5);backdrop-filter:blur(2px)}
  .mcard{position:relative;width:min(460px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:22px;animation:pop .2s ease}
  @keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
  .mhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}.mhead h2{font-size:1.15rem}.mhead .iconbtn{width:34px;height:34px;font-size:1.1rem;font-weight:600}
  .mhL{display:flex;align-items:center;gap:11px}.mhead .mi{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--primary-tint);color:var(--primary-600)}.mhead .mi svg{width:18px;height:18px}
  .slipimg{margin-top:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2);height:220px;display:grid;place-items:center;color:var(--faint);background-image:linear-gradient(45deg,#eef1f8 25%,transparent 25%),linear-gradient(-45deg,#eef1f8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef1f8 75%),linear-gradient(-45deg,transparent 75%,#eef1f8 75%);background-size:18px 18px;background-position:0 0,0 9px,9px -9px,-9px 0}

  .bottombar{display:none}.bb{font-family:var(--bd)}
  @media (max-width:1000px){.search{display:none}}
  @media (max-width:900px){
    .sidebar{position:fixed;z-index:60;left:0;top:0;transform:translateX(-100%);transition:transform .22s;box-shadow:var(--shadow)}.sidebar.open{transform:none}
    .ham{display:grid}.scrim{display:none;position:fixed;inset:0;background:rgba(12,18,48,.4);z-index:55}.scrim.on{display:block}
    .stats{grid-template-columns:repeat(2,1fr)}.grid2,.grid3{grid-template-columns:1fr}.frow{grid-template-columns:1fr}.dkpi{grid-template-columns:repeat(2,1fr)}
    .tool.mm,.tb-title,.rolechip{display:none}
    .bottombar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:color-mix(in srgb,var(--panel) 96%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:7px 4px calc(7px + env(safe-area-inset-bottom));justify-content:space-around;gap:2px}
    .bb{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;color:var(--faint);font-size:.58rem;font-weight:700;padding:4px 2px;cursor:pointer}
    .bbic{width:46px;height:28px;border-radius:99px;display:grid;place-items:center;position:relative}
    .bb svg{width:22px;height:22px}.bb.on{color:var(--primary-600)}.bb.on .bbic{background:var(--primary-tint)}
    .content{padding:20px 16px 92px}
  }
  @media (max-width:640px){
    .tbl{min-width:0!important;display:block}
    .tbl thead{display:none}.tbl tbody{display:block}
    .tbl tr{display:block;border:1px solid var(--line);border-radius:12px;margin:0 6px 8px;background:var(--panel);box-shadow:var(--shadow-sm)}
    .tbl tr.clk:active{background:var(--primary-tint)}
    .tbl td{display:flex;gap:10px;align-items:baseline;text-align:right;border:0;padding:5px 13px;font-size:.86rem}
    .tbl td::before{content:attr(data-label);color:var(--faint);font-weight:700;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;text-align:left;flex:0 0 auto;margin-right:auto}
    .tbl td:first-child{display:block;text-align:left;padding:10px 13px 6px;border-bottom:1px dashed var(--line)}
    .tbl td:first-child::before{display:none}
    .tbl td[data-label=""]{display:none}
    .tbl td .co{justify-content:flex-start}.tbl td.acts,.tbl .acts{justify-content:flex-end}
    .card.flush{padding:12px 0 6px}
    .profit-hero .pv{font-size:2.1rem}
  }
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
