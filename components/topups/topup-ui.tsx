"use client";

/**
 * The look shared by the two screens customers use most: the wallet
 * top-up and the ad-account top-up (de eigenaar, 01-10: "wallet topup +
 * ad account topup is de meest gebruikte tool dus dat moet er echt gaaf
 * uit zien").
 *
 * One scoped stylesheet (every class starts with tpx-) instead of forty
 * Tailwind strings per control, so both dialogs share the same cards,
 * the same stepper and the same button -- and a change to one is a
 * change to both.
 */

import { Check } from "lucide-react";
import type { ReactNode } from "react";

const CSS = `
.tpx{--tpx-a:#5B8DFF;--tpx-b:#8B5CF6;--tpx-ink:#0B1020;--tpx-soft:#F4F6FC;--tpx-line:#E4E8F2;--tpx-mut:#6A7389;--tpx-grad:linear-gradient(135deg,var(--tpx-a),var(--tpx-b));color:var(--tpx-ink)}
.tpx *{box-sizing:border-box}
.tpx-steps{display:flex;gap:6px;margin:2px 0 16px}
.tpx-step{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.tpx-step i{display:block;height:4px;border-radius:99px;background:var(--tpx-line)}
.tpx-step[data-on=true] i{background:var(--tpx-grad)}
.tpx-step span{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#A3AABB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tpx-step[data-on=true] span{color:var(--tpx-ink)}
.tpx-stack{display:flex;flex-direction:column;gap:18px}
.tpx-sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--tpx-mut);margin:0 0 8px}
.tpx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tpx-grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.tpx-card{position:relative;display:block;width:100%;text-align:left;border:1.5px solid var(--tpx-line);background:#fff;border-radius:16px;padding:14px;cursor:pointer;color:var(--tpx-ink);transition:border-color .18s,box-shadow .18s,transform .18s}
.tpx-card:hover{border-color:#C7D3F4;transform:translateY(-1px);box-shadow:0 8px 20px -12px rgba(40,60,140,.35)}
.tpx-card:focus-visible{outline:2px solid var(--tpx-a);outline-offset:2px}
.tpx-card[data-on=true]{border-color:transparent;background:linear-gradient(#fff,#fff) padding-box,var(--tpx-grad) border-box;box-shadow:0 12px 28px -16px rgba(91,141,255,.8),0 0 0 4px rgba(91,141,255,.10)}
.tpx-card[aria-disabled=true]{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.tpx-coin{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:18px;color:#fff;background:linear-gradient(135deg,#232C4D,#0B1020);transition:background .18s}
.tpx-card[data-on=true] .tpx-coin{background:var(--tpx-grad)}
.tpx-card b{display:block;font-size:15px;font-weight:700;margin-top:10px;line-height:1.2}
.tpx-card small{display:block;font-size:12px;color:var(--tpx-mut);margin-top:3px;line-height:1.3}
.tpx-tick{position:absolute;top:10px;right:10px;width:20px;height:20px;border-radius:99px;display:grid;place-items:center;background:var(--tpx-grad);color:#fff;opacity:0;transform:scale(.5);transition:.18s}
.tpx-card[data-on=true] .tpx-tick{opacity:1;transform:none}
.tpx-cur{padding:11px 4px 9px;text-align:center}
.tpx-cur .sym{display:block;font-size:19px;font-weight:800;line-height:1.1}
.tpx-cur .code{display:block;font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--tpx-mut);margin-top:3px}
.tpx-cur[data-on=true]{background:var(--tpx-grad) border-box;color:#fff}
.tpx-cur[data-on=true] .code{color:rgba(255,255,255,.85)}
.tpx-note{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:13px;background:var(--tpx-soft);font-size:12.5px;color:#3A4358;line-height:1.45}
.tpx-note>svg{flex:none;width:16px;height:16px;color:var(--tpx-a);margin-top:1px}
.tpx-note strong{color:var(--tpx-ink)}
.tpx-note[data-tone=warn]{background:#FFF7EA;color:#6B4A12}.tpx-note[data-tone=warn]>svg{color:#E59A12}
.tpx-actions{display:flex;gap:10px;padding-top:2px}
.tpx-cta{flex:1;min-height:50px;border-radius:14px;border:0;color:#fff;font-weight:700;font-size:15px;background:var(--tpx-grad);box-shadow:0 12px 26px -14px rgba(91,141,255,1);display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;padding:0 18px;transition:filter .15s,transform .15s}
.tpx-cta:hover{filter:brightness(1.06)}.tpx-cta:active{transform:translateY(1px)}
.tpx-cta:disabled{opacity:.42;cursor:not-allowed;box-shadow:none;filter:none}
.tpx-ghost{min-height:50px;border-radius:14px;border:1.5px solid var(--tpx-line);background:#fff;padding:0 16px;font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--tpx-ink)}
.tpx-ghost:hover{border-color:#C7D3F4}
.tpx-bank{position:relative;overflow:hidden;border-radius:20px;padding:16px 16px 6px;color:#fff;background:radial-gradient(120% 140% at 105% -10%,rgba(139,92,246,.6),transparent 55%),radial-gradient(110% 130% at -10% 110%,rgba(91,141,255,.5),transparent 55%),#0B1020;box-shadow:0 20px 40px -24px rgba(11,16,32,.9)}
.tpx-bank::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.tpx-bank-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.tpx-bank-top em{font-style:normal;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.62)}
.tpx-bank-top span{font-size:11px;font-weight:800;letter-spacing:.06em;padding:4px 9px;border-radius:99px;background:rgba(255,255,255,.12)}
.tpx-bank-desc{font-size:12px;color:rgba(255,255,255,.72);line-height:1.4;margin:0 0 6px}
.tpx-bank-row{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid rgba(255,255,255,.1)}
.tpx-bank-row>div{min-width:0}
.tpx-bank-grid{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:14px;border-top:1px solid rgba(255,255,255,.1)}
.tpx-bank-grid .tpx-bank-row{border-top:0}
.tpx-bank-grid .tpx-bank-row+.tpx-bank-row[data-wide=true],.tpx-bank-grid .tpx-bank-row[data-wide=true]{grid-column:1/-1;border-top:1px solid rgba(255,255,255,.1)}
.tpx-bank-sub{grid-column:1/-1;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.75);padding-top:10px}
.tpx-bank .tpx-mini .tpx-val{font-size:14px;font-weight:650}
.tpx-bank .tpx-mini .tpx-copy{width:30px;height:30px;border-radius:9px}
.tpx-lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--tpx-mut)}
.tpx-bank .tpx-lbl{color:rgba(255,255,255,.55)}
.tpx-val{display:block;font-size:14px;font-weight:650;line-height:1.3;margin-top:2px;white-space:pre-wrap;word-break:break-word}
.tpx-bank .tpx-val{font-size:17px;font-weight:700}
.tpx-mono{font-family:var(--font-mono,ui-monospace),ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.01em;font-variant-numeric:tabular-nums}
.tpx-copy{position:relative;z-index:1;flex:none;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;border:0;cursor:pointer;background:rgba(255,255,255,.12);color:#fff;transition:background .15s,color .15s}
.tpx-copy:hover{background:rgba(255,255,255,.22)}
.tpx-copy[data-done=true]{background:#22C08A;color:#fff}
.tpx-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tpx-tile{min-width:0;border:1px solid var(--tpx-line);border-radius:13px;padding:9px 10px 9px 12px;background:#fff;display:flex;gap:8px;align-items:center;justify-content:space-between}
.tpx-tile[data-wide=true]{grid-column:1/-1}
.tpx-tile>div{min-width:0}
.tpx-tile .tpx-copy{width:30px;height:30px;border-radius:9px;background:var(--tpx-soft);color:var(--tpx-mut)}
.tpx-tile .tpx-copy:hover{color:var(--tpx-ink);background:#E9EDF7}
.tpx-tile .tpx-copy[data-done=true]{background:#22C08A;color:#fff}
.tpx-ref{border-radius:18px;padding:14px;border:1.5px solid transparent;background:linear-gradient(#fff,#fff) padding-box,var(--tpx-grad) border-box}
.tpx-ref p{margin:0;font-size:12.5px;color:var(--tpx-mut);line-height:1.4}
.tpx-ref-code{margin-top:10px;width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:12px;border-radius:13px;border:0;cursor:pointer;background:var(--tpx-soft);font-size:22px;font-weight:800;letter-spacing:.05em;color:var(--tpx-ink);transition:background .15s}
.tpx-ref-code:hover{background:#E9EDF7}
.tpx-ref-code svg{width:18px;height:18px;color:var(--tpx-a)}
.tpx-ref small{display:block;text-align:center;font-size:11.5px;color:var(--tpx-mut);margin-top:6px}
.tpx-sum{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:15px;background:var(--tpx-soft)}
.tpx-sum .tpx-coin{width:36px;height:36px;font-size:16px;background:var(--tpx-grad)}
.tpx-sum>div{flex:1;min-width:0}
.tpx-sum b{display:block;font-size:14px;font-weight:700;line-height:1.3}
.tpx-link{border:0;background:none;padding:4px 2px;font-size:12.5px;font-weight:700;color:var(--tpx-a);cursor:pointer}
.tpx-amount{border:1.5px solid var(--tpx-line);border-radius:18px;padding:14px 16px;background:#fff;transition:border-color .15s,box-shadow .15s}
.tpx-amount:focus-within{border-color:var(--tpx-a);box-shadow:0 0 0 4px rgba(91,141,255,.13)}
.tpx-amount>label{display:block;font-size:12.5px;font-weight:600;color:var(--tpx-mut);margin-bottom:4px}
.tpx-amount-in{display:flex;align-items:baseline;gap:8px}
.tpx-amount-in span{font-size:34px;font-weight:800;line-height:1.1;background:var(--tpx-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.tpx-amount-in input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-size:34px;line-height:1.1;height:40px;font-weight:800;color:var(--tpx-ink);font-variant-numeric:tabular-nums;padding:0;letter-spacing:-.01em}
.tpx-amount-in input::placeholder{color:#C9CFDC}
.tpx-amount-in input:disabled{opacity:.5}
.tpx-amount-in input::-webkit-outer-spin-button,.tpx-amount-in input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.tpx-amount-in input[type=number]{-moz-appearance:textfield}
.tpx-pills>div{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding-top:12px}
.tpx-pills button{border-radius:11px;border:1px solid transparent;background:var(--tpx-soft);font-weight:700;font-size:13px;padding:8px 2px;color:var(--tpx-ink);white-space:nowrap}
.tpx-pills button:hover:not(:disabled){background:#E9EDF7;border-color:#C7D3F4}
.tpx-pills button:nth-child(5){grid-column:1/-1;border-style:dashed;border-color:#C7D3F4;background:#fff}
.tpx-hint{font-size:12px;color:var(--tpx-mut);margin:8px 0 0;line-height:1.4}
.tpx-err{font-size:13px;color:#D93B3B;margin:6px 0 0;font-weight:600}
.tpx-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding:20px 14px;border:1.5px dashed #C3CDE6;border-radius:18px;background:linear-gradient(180deg,#FAFBFF,#F2F5FD);cursor:pointer;transition:border-color .15s,background .15s}
.tpx-drop:hover,.tpx-drop[data-drag=true]{border-color:var(--tpx-a);background:#EDF2FF}
.tpx-drop[data-busy=true]{pointer-events:none;opacity:.7}
.tpx-drop[data-done=true]{border-style:solid;border-color:#A6E5C8;background:#F1FBF6;flex-direction:row;text-align:left;justify-content:flex-start;gap:12px;padding:12px 14px}
.tpx-drop-ic{width:46px;height:46px;flex:none;border-radius:15px;display:grid;place-items:center;background:var(--tpx-grad);color:#fff;box-shadow:0 10px 22px -12px rgba(91,141,255,1);margin-bottom:6px}
.tpx-drop[data-done=true] .tpx-drop-ic{background:#22C08A;box-shadow:none;margin:0;width:40px;height:40px;border-radius:12px}
.tpx-drop b{font-size:14.5px;font-weight:700}
.tpx-drop small{font-size:12px;color:var(--tpx-mut);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tpx-drop[data-done=true]>div{min-width:0;flex:1}
.tpx-drop[data-done=true] b,.tpx-drop[data-done=true] small{display:block}
.tpx-drop[data-done=true] em{font-style:normal;font-size:12.5px;font-weight:700;color:var(--tpx-a)}
.tpx-preview{border-radius:14px;overflow:hidden;border:1px solid var(--tpx-line)}
.tpx-preview img{display:block;width:100%;max-height:200px;object-fit:contain;background:#EEF1F7}
.tpx-receipt{border-radius:18px;border:1px solid var(--tpx-line);background:#fff;overflow:hidden}
.tpx-receipt-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 14px;font-size:13.5px}
.tpx-receipt-row>span:first-child{color:var(--tpx-mut)}
.tpx-receipt-row>span:last-child{font-weight:650;font-variant-numeric:tabular-nums;text-align:right}
.tpx-receipt-row[data-tone=strong]>span:last-child{font-weight:800}
.tpx-receipt-row[data-tone=danger]>span:last-child{color:#D93B3B;font-weight:800}
.tpx-receipt-row small{display:block;font-size:11px;color:var(--tpx-mut);font-weight:500}
.tpx-receipt-hero{padding:14px;background:var(--tpx-grad);color:#fff;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.tpx-receipt-hero em{font-style:normal;display:block;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.78)}
.tpx-receipt-hero b{display:block;font-size:26px;font-weight:800;line-height:1.1;margin-top:3px;font-variant-numeric:tabular-nums}
.tpx-receipt-hero span{font-size:12px;color:rgba(255,255,255,.88);text-align:right}
.tpx-receipt hr{border:0;border-top:1px dashed var(--tpx-line);margin:2px 14px}

.tpx-route{border-radius:18px;padding:12px;background:var(--tpx-soft);display:flex;flex-direction:column;gap:10px}
.tpx-route-head{display:flex;align-items:center;justify-content:space-between}
.tpx-route-row{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr);align-items:center;gap:6px}
.tpx-route-box{min-width:0;background:#fff;border-radius:13px;padding:9px 11px;box-shadow:0 1px 2px rgba(20,30,80,.06)}
.tpx-route-box b{display:block;font-size:14px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}
.tpx-route-box small{display:block;font-size:11.5px;color:var(--tpx-mut);margin-top:1px}
.tpx-route-arrow{width:28px;height:28px;border-radius:99px;display:grid;place-items:center;background:var(--tpx-grad);color:#fff;box-shadow:0 6px 14px -8px rgba(91,141,255,1)}
.tpx-ticket{position:relative;border-radius:20px;padding:16px;color:#fff;overflow:hidden;background:radial-gradient(120% 140% at 0% 0%,rgba(91,141,255,.55),transparent 55%),radial-gradient(120% 140% at 100% 100%,rgba(139,92,246,.6),transparent 55%),#0B1020;box-shadow:0 20px 40px -24px rgba(11,16,32,.9)}
.tpx-ticket::before,.tpx-ticket::after{content:"";position:absolute;top:50%;width:18px;height:18px;margin-top:-9px;border-radius:99px;background:#fff}
.tpx-ticket::before{left:-9px}.tpx-ticket::after{right:-9px}
.tpx-ticket .tpx-lbl{color:rgba(255,255,255,.6)}
.tpx-ticket-code{display:block;font-size:26px;font-weight:800;letter-spacing:.06em;margin:6px 0 4px;word-break:break-all}
.tpx-ticket-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1.5px dashed rgba(255,255,255,.18);padding-top:10px;margin-top:8px}
.tpx-ticket-foot p{margin:0;font-size:12px;color:rgba(255,255,255,.72);line-height:1.35}
.tpx-pill{flex:none;display:inline-flex;align-items:center;gap:6px;border:0;cursor:pointer;border-radius:99px;padding:8px 14px;font-size:13px;font-weight:800;color:#0B1020;background:#fff;transition:transform .15s,background .15s}
.tpx-pill:hover{transform:translateY(-1px)}
.tpx-pill[data-done=true]{background:#22C08A;color:#fff}
.tpx-done{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:6px 0 2px}
.tpx-burst{position:relative;width:96px;height:96px;margin-top:6px}
.tpx-burst-core{position:absolute;inset:12px;border-radius:99px;display:grid;place-items:center;background:var(--tpx-grad);color:#fff;box-shadow:0 16px 34px -14px rgba(91,141,255,1);animation:tpxPop .55s cubic-bezier(.2,1.6,.4,1) both}
.tpx-burst-core svg{width:34px;height:34px}
.tpx-burst-core path{stroke-dasharray:30;stroke-dashoffset:30;animation:tpxDraw .45s .35s ease-out forwards}
.tpx-burst-ring{position:absolute;inset:12px;border-radius:99px;border:2px solid rgba(139,92,246,.55);animation:tpxRing 1.6s .2s ease-out infinite}
.tpx-burst-ring+.tpx-burst-ring{animation-delay:.8s;border-color:rgba(91,141,255,.5)}
.tpx-confetti{position:absolute;left:50%;top:50%;width:8px;height:8px;border-radius:2px;opacity:0;animation:tpxFly .9s .25s ease-out forwards}
.tpx-done h3{margin:0;font-size:21px;font-weight:800;letter-spacing:-.01em}
.tpx-done>p{margin:-6px 0 0;font-size:13.5px;color:var(--tpx-mut);max-width:19rem;line-height:1.45}
.tpx-amt{font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1;background:var(--tpx-grad);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums;animation:tpxUp .5s .2s both}
.tpx-status{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#8A5A00;background:#FFF4DB;padding:5px 11px;border-radius:99px}
.tpx-status i{width:7px;height:7px;border-radius:99px;background:#F2A516;animation:tpxBlink 1.4s infinite}
.tpx-next{width:100%;text-align:left;border:1px solid var(--tpx-line);border-radius:18px;padding:6px 14px}
.tpx-next-row{display:flex;gap:12px;align-items:center;padding:9px 0;font-size:13.5px;font-weight:600;line-height:1.35}
.tpx-next-row+.tpx-next-row{border-top:1px solid var(--tpx-line)}
.tpx-next-row span{flex:none;width:26px;height:26px;border-radius:9px;display:grid;place-items:center;font-size:12.5px;font-weight:800;color:#fff;background:var(--tpx-grad)}
.tpx-done .tpx-ticket,.tpx-done .tpx-next{animation:tpxUp .5s both}
.tpx-done .tpx-ticket{animation-delay:.3s}.tpx-done .tpx-next{animation-delay:.42s}
@keyframes tpxPop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}
@keyframes tpxDraw{to{stroke-dashoffset:0}}
@keyframes tpxRing{from{transform:scale(1);opacity:.9}to{transform:scale(1.55);opacity:0}}
@keyframes tpxFly{0%{opacity:1;transform:translate(-50%,-50%) rotate(0)}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) rotate(220deg)}}
@keyframes tpxUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes tpxBlink{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.tpx *{animation:none!important}.tpx-burst-core path{stroke-dashoffset:0}}
.tpx-x-pay,.tpx-x-get{border-radius:20px;padding:14px 16px}
.tpx-x-pay{border:1.5px solid var(--tpx-line);background:#fff;transition:border-color .15s,box-shadow .15s}
.tpx-x-pay:focus-within{border-color:var(--tpx-a);box-shadow:0 0 0 4px rgba(91,141,255,.13)}
.tpx-x-get{color:#fff;margin-top:-4px;background:radial-gradient(120% 140% at 100% 0%,rgba(139,92,246,.6),transparent 55%),radial-gradient(110% 130% at 0% 100%,rgba(91,141,255,.5),transparent 55%),#0B1020;box-shadow:0 20px 40px -24px rgba(11,16,32,.9)}
.tpx-x-get .tpx-lbl{color:rgba(255,255,255,.6)}
.tpx-x-top{display:flex;align-items:center;justify-content:space-between}
.tpx-x-row{display:flex;align-items:center;gap:12px;margin-top:8px}
.tpx-x-row input{flex:1;min-width:0;text-align:right;border:0;outline:0;background:transparent;font-size:32px;line-height:1.1;font-weight:800;color:var(--tpx-ink);font-variant-numeric:tabular-nums;padding:0}
.tpx-x-row input::placeholder{color:#C9CFDC}
.tpx-x-row input::-webkit-outer-spin-button,.tpx-x-row input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.tpx-x-row input[type=number]{-moz-appearance:textfield}
.tpx-x-row b{flex:1;text-align:right;font-size:32px;line-height:1.1;font-weight:800;font-variant-numeric:tabular-nums}
.tpx-x-chip{flex:none;display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:99px;background:var(--tpx-soft);font-weight:800;font-size:14px;color:var(--tpx-ink)}
.tpx-x-get .tpx-x-chip{background:rgba(255,255,255,.12);color:#fff}
.tpx-x-chip i{font-style:normal;width:28px;height:28px;border-radius:99px;display:grid;place-items:center;background:var(--tpx-grad);color:#fff;font-size:14px}
.tpx-swap{align-self:center;position:relative;z-index:2;margin:-18px 0 -18px;width:42px;height:42px;border-radius:14px;border:4px solid #fff;display:grid;place-items:center;background:var(--tpx-grad);color:#fff;cursor:pointer;box-shadow:0 10px 22px -10px rgba(91,141,255,1);transition:transform .25s}
.tpx-swap:hover:not(:disabled){transform:rotate(180deg)}
.tpx-swap:disabled{opacity:.5;cursor:not-allowed}
@media (max-width:380px){.tpx-grid4{grid-template-columns:repeat(2,minmax(0,1fr))}.tpx-tiles{grid-template-columns:1fr}.tpx-amount-in input{font-size:30px}}
`;

export function TopupStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}

export function TopupStepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="tpx-steps" aria-label={`Step ${step} of ${labels.length}`}>
      {labels.map((l, i) => (
        <div key={l} className="tpx-step" data-on={i < step}>
          <i />
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

/** A big selectable card: a coin, a title, a line under it. */
export function ChoiceCard({
  on,
  onPick,
  coin,
  title,
  sub,
  disabled,
}: {
  on: boolean;
  onPick: () => void;
  coin: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="tpx-card"
      data-on={on}
      aria-pressed={on}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onPick();
      }}
    >
      <span className="tpx-tick">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span className="tpx-coin">{coin}</span>
      <b>{title}</b>
      {sub ? <small>{sub}</small> : null}
    </button>
  );
}

const SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", HKD: "HK$" };
export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? code;
}
