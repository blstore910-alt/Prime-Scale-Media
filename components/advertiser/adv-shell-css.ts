// AUTO-GENERATED verbatim from advertiser-app.html mockup (scoped .advapp).
export const ADV_CSS = `
  .advapp{--ground:#f4f6fc;--panel:#fff;--panel-2:#f1f4fb;--ink:#12162a;--muted:#5c6577;--faint:#8b93a6;
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
  .cap{color:var(--muted);font-size:.9rem;margin:6px 0 16px}
  .grad{background:var(--brand);-webkit-background-clip:text;background-clip:text;color:transparent}

  .app{display:flex;min-height:100vh}
  .sidebar{width:var(--sidebar);flex:0 0 auto;background:var(--panel);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column;gap:3px;position:sticky;top:0;height:100vh}
  .logo{display:flex;align-items:center;gap:11px;padding:6px 8px 18px}
  .mark{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#fff;flex:0 0 auto;background:linear-gradient(135deg,var(--navy1),var(--navy2),var(--navy3));box-shadow:0 0 22px rgba(91,141,255,.4),0 0 0 1px rgba(91,141,255,.28)}
  .mark svg{width:20px;height:20px}
  .logo .name{font-family:var(--hd);font-weight:800;letter-spacing:-.025em;font-size:.98rem;line-height:1.1}
  .logo .name small{display:block;font-weight:700;font-size:.6rem;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin-top:3px}
  .navsec{font-size:.64rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);padding:14px 12px 6px}
  .navlink{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:11px;font-weight:600;font-size:.92rem;color:var(--muted);cursor:pointer;transition:.14s;border:0;background:none;width:100%;text-align:left;font-family:var(--bd)}
  .navlink:hover{background:var(--panel-2);color:var(--ink)}.navlink.on{background:var(--primary-tint);color:var(--primary-600)}
  .navlink svg{width:19px;height:19px}.navlink .n{margin-left:auto;min-width:19px;height:19px;padding:0 5px;border-radius:99px;background:var(--primary);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center}
  .side-foot{margin-top:auto;padding:12px 8px 4px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px}
  .side-foot .avatar{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.85rem;color:#fff;background:var(--brand)}
  .side-foot .who{font-size:.85rem;font-weight:700;line-height:1.2}.side-foot .who small{display:block;color:var(--faint);font-weight:500;font-size:.72rem}

  .main{flex:1;min-width:0;display:flex;flex-direction:column}
  .topbar{display:flex;align-items:center;gap:12px;padding:11px 22px;position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--panel) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .tb-brand{display:flex;align-items:center;gap:10px}.tb-brand .mark{width:34px;height:34px;display:none}/* sidebar shows the logo on desktop */
  .tb-title{font-family:var(--hd);font-weight:800;font-size:1.1rem;letter-spacing:-.02em}
  .search{display:flex;align-items:center;gap:9px;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:9px 13px;min-width:160px;max-width:260px;flex:1;color:var(--faint)}
  .search svg{width:17px;height:17px}.search input{border:0;background:none;outline:0;font-family:var(--bd);font-size:.9rem;color:var(--ink);width:100%}
  .tb-spacer{flex:1}
  .toolbar{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:16px;padding:5px;box-shadow:0 10px 24px -16px rgba(20,30,80,.55),inset 0 1px 0 rgba(255,255,255,.6)}
  .tool{display:inline-flex;align-items:center;gap:8px;border:0;background:none;font-family:var(--bd);font-weight:700;color:var(--ink);border-radius:12px;padding:7px 12px;height:42px;cursor:pointer;position:relative;transition:.13s}
  .tool svg{width:18px;height:18px;color:var(--muted)}
  .tool.wal{background:var(--primary-tint);border:1px solid #cfe0ff}.tool.wal svg{color:var(--primary-600)}
  .tool.wal .e{display:flex;flex-direction:column;line-height:1.05;text-align:left}
  .tool.wal small{font-size:.6rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint)}
  .tool.wal b{font-family:var(--hd);font-weight:800;font-size:.95rem;color:var(--primary-600)}
  .tool.st{background:var(--win-soft);border:1px solid rgba(16,185,129,.24);color:#0e8f66;font-weight:700;font-size:.82rem}.tool.st svg{color:var(--win)}
  .tool.ic-btn,.tool.ava-btn{background:var(--panel);border:1px solid var(--line)}.tool.ic-btn:hover,.tool.ava-btn:hover{background:var(--panel-2)}
  .tool.ic-btn{padding:7px 11px}
  .badge-n{position:absolute;top:0;right:2px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:var(--primary);color:#fff;font-size:.66rem;font-weight:700;display:grid;place-items:center;border:2px solid var(--panel)}
  .tool.ava-btn{padding:4px 8px 4px 4px}
  .tool.ava-btn .avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-family:var(--hd);font-weight:700;font-size:.8rem;color:#fff;background:var(--brand);position:relative}
  .tool.ava-btn .avatar::after{content:"";position:absolute;bottom:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:var(--win);border:2px solid var(--panel)}
  .tool.ava-btn svg{width:15px}
  .iconbtn{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--panel);color:var(--muted);display:grid;place-items:center;cursor:pointer}
  .ham{display:none}

  .content{padding:24px 26px 70px;max-width:1060px;width:100%;margin:0 auto}
  .view{display:none;flex-direction:column;gap:16px}.view.on{display:flex;animation:fade .3s ease}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
  .phead h1{font-family:var(--hd);font-weight:800;font-size:1.5rem;letter-spacing:-.02em;margin:0}
  .phead p{color:var(--muted);font-size:.92rem;margin:4px 0 0}

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
  [data-v]{cursor:pointer}
  .wallet{transition:transform .16s}.wallet:hover{transform:translateY(-3px)}
  .wallet::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 34%,rgba(255,255,255,.16) 50%,transparent 66%);transform:translateX(-120%);animation:sweep 7s ease-in-out infinite;pointer-events:none}
  @keyframes sweep{0%,58%{transform:translateX(-120%)}82%,100%{transform:translateX(120%)}}

  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column}
  .stat .k{display:flex;align-items:center;gap:8px;font-size:.74rem;font-weight:600;color:var(--faint)}
  .stat .ci{width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center}.stat .ci svg{width:15px;height:15px}
  .ci.b{background:var(--primary-tint);color:var(--primary-600)}.ci.t{background:#d7f4f8;color:var(--teal)}.ci.g{background:var(--gold-soft);color:#a9740b}.ci.p{background:#f3e8ff;color:var(--purple)}
  .stat .v{font-family:var(--hd);font-weight:800;font-size:1.4rem;letter-spacing:-.02em;margin-top:auto;padding-top:10px}
  .stat .k{min-height:2.4em}

  .wallet{position:relative;overflow:hidden;border-radius:18px;padding:22px;color:#fff;box-shadow:0 22px 46px -24px rgba(58,111,255,.7)}
  .wallet.eur{background:linear-gradient(135deg,var(--primary),#5b8dff 60%,#7aa2ff)}
  .wallet.usd{background:linear-gradient(135deg,#0e93a6,#14b8a6 60%,#3ad1c0)}
  .wallet .wsh{position:absolute;top:-45%;right:-12%;width:60%;height:170%;background:radial-gradient(circle,rgba(255,255,255,.26),transparent 60%)}
  .wallet .wl{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85;position:relative}
  .wallet .wv{font-family:var(--hd);font-weight:800;font-size:2.5rem;letter-spacing:-.02em;margin:6px 0 2px;position:relative}
  .wallet .wavail{position:relative;margin:2px 0 2px;font-size:.82rem;font-weight:700;color:#fff}.wallet .wavail span{color:rgba(255,255,255,.72);font-weight:500}
  .wallet .wa{display:flex;gap:9px;margin-top:14px;position:relative;flex-wrap:wrap}
  .wbtn{display:inline-flex;align-items:center;gap:7px;border:0;cursor:pointer;font-family:var(--bd);font-weight:700;font-size:.86rem;border-radius:10px;padding:9px 13px;background:rgba(255,255,255,.92);color:var(--ink)}
  .wbtn.gh{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.3)}.wbtn svg{width:15px;height:15px}

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
  .plat{display:inline-flex;align-items:center;gap:8px;font-weight:700}
  .pfi{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#fff;border:1px solid var(--line-2);flex:0 0 auto}
  .pfi svg{width:19px;height:19px}.pfi.tt{background:#000;border-color:#000}

  .acard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;gap:12px}
  .acard .top{display:flex;align-items:center;gap:11px}
  .acard .nm{font-weight:700}.acard .sub{color:var(--faint);font-size:.78rem}
  .acard .kv{display:flex;justify-content:space-between;font-size:.85rem}.acard .kv span{color:var(--faint)}.acard .kv b{font-weight:700}
  .acard .acts{display:flex;gap:8px;margin-top:2px}
  .acard[data-acct]{cursor:pointer}.acard[data-acct]:hover{border-color:var(--primary)}
  .acard.banned{opacity:.94}.acard.banned:hover{border-color:#f3c9c9}
  .lockmsg{display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:600;color:var(--muted);background:var(--panel-2);border:1px solid var(--line-2);border-radius:10px;padding:9px 11px;width:100%}
  .lockmsg svg{width:15px;height:15px;flex:0 0 auto;color:var(--faint)}
  .lockmsg.banned{color:#c0392b;background:var(--danger-soft);border-color:#f3c9c9}.lockmsg.banned svg{color:var(--danger)}
  .okic{width:66px;height:66px;border-radius:50%;margin:8px auto 6px;display:grid;place-items:center;background:var(--win-soft);color:var(--win);box-shadow:0 0 0 8px rgba(16,185,129,.12);animation:okpop .4s cubic-bezier(.2,.8,.2,1)}
  .okic svg{width:30px;height:30px}
  @keyframes okpop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}

  .list-row{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid var(--line)}.list-row:first-child{border-top:0}
  .list-row .ico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto}
  .list-row .amt{margin-left:auto;font-family:var(--hd);font-weight:800}

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

  .field{margin-bottom:14px}.field label{font-size:.8rem;font-weight:600;color:var(--muted);display:block;margin-bottom:6px}
  .field input,.field select{width:100%;font-family:var(--bd);font-size:.92rem;border:1px solid var(--line-2);border-radius:11px;padding:11px 13px;background:var(--panel-2);color:var(--ink)}
  .field input:focus,.field select:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
  .frow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .toggle-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-top:1px solid var(--line)}.toggle-row:first-child{border-top:0}
  .toggle-row .t{font-weight:700;font-size:.92rem}.toggle-row .d{color:var(--faint);font-size:.82rem}
  .sw{width:44px;height:26px;border-radius:99px;background:var(--line-2);position:relative;cursor:pointer;flex:0 0 auto;transition:.18s;border:0}
  .sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:.18s}
  .sw.on{background:var(--primary)}.sw.on::after{left:21px}
  .nrow{display:flex;gap:13px;align-items:flex-start;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow-sm)}
  .nrow.unread{border-color:var(--primary-tint);background:linear-gradient(90deg,var(--primary-tint),var(--panel) 60%)}
  .nic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}.nic svg{width:19px;height:19px}
  .nic.b{background:var(--primary-tint);color:var(--primary-600)}.nic.win{background:var(--win-soft);color:var(--win)}.nic.warn{background:var(--warn-soft);color:var(--warn)}
  .nrow .t{font-weight:700}.nrow .d{color:var(--muted);font-size:.85rem}.nrow .tm{margin-left:auto;color:var(--faint);font-size:.78rem;white-space:nowrap}
  .undot{width:8px;height:8px;border-radius:50%;background:var(--primary);margin-top:6px;flex:0 0 auto}
  .faq .q{font-family:var(--hd);font-weight:700;font-size:.98rem;margin-bottom:4px}.faq .a{color:var(--muted);font-size:.9rem}.faq>div{margin-bottom:12px}
  .steps{display:flex;flex-direction:column;gap:12px}.step{display:flex;gap:11px;align-items:flex-start}
  .step .si{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;background:var(--primary-tint);color:var(--primary-600);font-family:var(--hd);font-weight:800}
  .bankbox{background:var(--panel-2);border:1px solid var(--line-2);border-radius:12px;padding:14px;font-size:.88rem}
  .bankbox .kv{display:flex;justify-content:space-between;padding:5px 0}.bankbox .kv span{color:var(--faint)}.bankbox .kv b{font-family:ui-monospace,monospace;font-weight:700}

  .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%) translateY(30px);background:var(--ink);color:#fff;padding:13px 20px;border-radius:12px;font-weight:600;font-size:.9rem;box-shadow:var(--shadow);opacity:0;transition:.25s;z-index:90;display:flex;align-items:center;gap:9px}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.toast svg{width:18px;height:18px;color:var(--win)}
  .modal{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px}.modal[hidden]{display:none}
  .mback{position:absolute;inset:0;background:rgba(12,18,48,.5);backdrop-filter:blur(2px)}
  .mcard{position:relative;width:min(480px,100%);max-height:90vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:22px;animation:pop .2s ease}
  @keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
  .mhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}.mhead h2{font-size:1.15rem}.mhead .iconbtn{width:34px;height:34px;font-size:1.1rem;font-weight:600}
  .mlabel{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);margin:16px 0 8px}
  .seg2{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px}
  .seg2 button{border:0;background:none;font-family:var(--bd);font-weight:700;font-size:.86rem;color:var(--muted);padding:8px 16px;border-radius:8px;cursor:pointer}
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
    .sidebar{position:fixed;z-index:60;left:0;top:0;transform:translateX(-100%);transition:transform .22s;box-shadow:var(--shadow)}.sidebar.open{transform:none}
    .ham{display:grid}.scrim{display:none;position:fixed;inset:0;background:rgba(12,18,48,.4);z-index:55}.scrim.on{display:block}
    .stats{grid-template-columns:repeat(2,1fr)}.grid2,.grid3{grid-template-columns:1fr}.sub-grid{grid-template-columns:1fr 1fr}.frow{grid-template-columns:1fr}
    .tool.wal,.tool.st{display:none}.tb-title{display:none}.tb-brand .mark{display:grid}
    .bottombar{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:color-mix(in srgb,var(--panel) 96%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:7px 4px calc(7px + env(safe-area-inset-bottom));justify-content:space-around;gap:2px}
    .bb{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;color:var(--faint);font-size:.6rem;font-weight:700;padding:4px 2px;cursor:pointer;transition:.14s}
    .bbic{width:46px;height:28px;border-radius:99px;display:grid;place-items:center;position:relative;transition:.16s}
    .bb svg{width:22px;height:22px}.bb.on{color:var(--primary-600)}.bb.on .bbic{background:var(--primary-tint)}
    .content{padding:20px 16px 92px}
  }
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
