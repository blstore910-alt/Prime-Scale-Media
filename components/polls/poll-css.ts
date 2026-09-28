/**
 * ONE STYLESHEET FOR BOTH POLL SCREENS.
 *
 * The owner, 28-09: "maak poll duidelijker en mooier design". The first
 * version used bare `<input>` and `<select>` with inline styles, so it
 * inherited nothing: unstyled boxes, an Ask button that looked disabled
 * because it was the only greyed thing on a white card, and no spacing
 * between a label and the field it belonged to.
 *
 * Self-contained on purpose, like earnings-cabinet-css.ts: this screen
 * lives in the admin shell and the card lives in two customer shells,
 * and none of the three agree on what an input looks like.
 */
export const POLL_CSS = `
  .pa{display:flex;flex-direction:column;gap:14px}

  .pa-card{background:var(--panel,#fff);border:1px solid var(--line,#e3e8f4);
    border-radius:16px;padding:18px;box-shadow:0 1px 2px -1px rgba(20,30,80,.16),
    0 16px 34px -24px rgba(20,30,80,.42)}
  .pa-card h2{font-family:var(--hd,inherit);font-size:1.05rem;font-weight:800;
    margin:0 0 4px;letter-spacing:-.01em;color:var(--ink,#12162a)}
  .pa-card .sub{margin:0 0 16px;font-size:.84rem;line-height:1.45;color:var(--txt-2,#535e78)}

  .pa-lab{display:block;font-size:.72rem;font-weight:800;letter-spacing:.05em;
    text-transform:uppercase;color:var(--faint,#818ead);margin:0 0 6px}
  .pa-in{width:100%;padding:11px 13px;border-radius:11px;font:inherit;font-size:.92rem;
    color:var(--ink,#12162a);background:var(--panel-2,#f6f8fd);
    border:1px solid var(--line,#e3e8f4);outline:none;transition:border-color .14s,background .14s}
  .pa-in:focus{border-color:var(--primary,#3a6fff);background:var(--panel,#fff)}
  .pa-in::placeholder{color:var(--faint,#9aa3ba)}
  select.pa-in{appearance:none;cursor:pointer;
    background-image:linear-gradient(45deg,transparent 50%,var(--faint,#818ead) 50%),
      linear-gradient(135deg,var(--faint,#818ead) 50%,transparent 50%);
    background-position:calc(100% - 18px) 52%,calc(100% - 13px) 52%;
    background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:36px}

  /* Two ways to ask, side by side, so the choice is visible rather than
     hidden in a dropdown. */
  .pa-kinds{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
  .pa-kinds.three{grid-template-columns:repeat(3,1fr)}
  @media (max-width:760px){.pa-kinds.three{grid-template-columns:1fr}}
  .pa-kind{text-align:left;padding:11px 13px;border-radius:12px;cursor:pointer;
    border:1px solid var(--line,#e3e8f4);background:var(--panel,#fff);font:inherit;
    transition:border-color .14s,background .14s}
  .pa-kind b{display:block;font-size:.9rem;font-weight:700;color:var(--ink,#12162a)}
  .pa-kind span{display:block;font-size:.76rem;color:var(--txt-2,#535e78);margin-top:2px}
  .pa-kind.on{border-color:var(--primary,#3a6fff);background:rgba(58,111,255,.06)}

  .pa-rows{display:flex;flex-direction:column;gap:8px}
  .pa-row{display:flex;gap:8px;align-items:center}
  .pa-row .pa-in{flex:1}
  .pa-x{flex:0 0 auto;width:34px;height:34px;border-radius:10px;cursor:pointer;
    border:1px solid var(--line,#e3e8f4);background:var(--panel,#fff);
    color:var(--faint,#818ead);font-size:1rem;line-height:1;display:grid;place-items:center}
  .pa-x:hover{border-color:var(--danger,#e5484d);color:var(--danger,#e5484d)}

  .pa-add{margin-top:8px;padding:8px 13px;border-radius:10px;cursor:pointer;
    border:1px dashed var(--line-2,#d3daec);background:transparent;
    font:inherit;font-size:.84rem;font-weight:700;color:var(--txt-2,#535e78)}
  .pa-add:hover{border-color:var(--primary,#3a6fff);color:var(--primary,#3a6fff)}

  .pa-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;
    margin-top:18px;padding-top:16px;border-top:1px solid var(--line,#e3e8f4)}
  .pa-ask{padding:11px 22px;border:0;border-radius:11px;cursor:pointer;
    font:inherit;font-weight:800;font-size:.92rem;color:#fff;
    background:linear-gradient(90deg,#3a6fff,#8b5cf6);
    box-shadow:0 10px 24px -14px rgba(58,111,255,.9)}
  .pa-ask:disabled{cursor:not-allowed;opacity:.45;box-shadow:none}
  .pa-why{margin:0;font-size:.8rem;color:var(--danger,#e5484d)}

  .pa-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media (max-width:560px){.pa-two,.pa-kinds{grid-template-columns:1fr}}

  /* ── a poll that is already out there ───────────────────────── */
  .pa-head{display:flex;justify-content:space-between;gap:12px;
    align-items:flex-start;flex-wrap:wrap}
  .pa-q{font-family:var(--hd,inherit);font-weight:800;font-size:.98rem;
    color:var(--ink,#12162a);margin:0 0 3px}
  .pa-meta{font-size:.78rem;color:var(--faint,#818ead)}
  .pa-pill{display:inline-block;padding:3px 9px;border-radius:99px;margin-right:6px;
    font-size:.68rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
  .pa-pill.open{background:#e7f8f1;color:#0e8f66}
  .pa-pill.draft{background:var(--panel-2,#f0f4fd);color:var(--txt-2,#535e78)}
  .pa-pill.closed{background:var(--panel-2,#f0f4fd);color:var(--faint,#818ead)}
  .pa-acts{display:flex;gap:8px}
  .pa-btn{padding:7px 13px;border-radius:10px;cursor:pointer;font:inherit;
    font-size:.82rem;font-weight:700;border:1px solid var(--line,#e3e8f4);
    background:var(--panel,#fff);color:var(--ink,#12162a)}
  .pa-btn:hover{border-color:var(--primary,#3a6fff)}
  .pa-btn.danger:hover{border-color:var(--danger,#e5484d);color:var(--danger,#e5484d)}

  .pa-bars{display:flex;flex-direction:column;gap:9px;margin-top:14px}
  .pa-bl{display:flex;justify-content:space-between;gap:10px;font-size:.85rem;
    font-weight:600;margin-bottom:4px;color:var(--ink,#12162a)}
  .pa-bl .n{font-variant-numeric:tabular-nums;color:var(--txt-2,#535e78);font-weight:700}
  .pa-tr{height:8px;border-radius:99px;background:var(--panel-2,#f0f4fd);overflow:hidden}
  .pa-fi{display:block;height:100%;border-radius:99px;transition:width .3s;
    background:linear-gradient(90deg,#3a6fff,#8b5cf6)}

  /* Open answers: a list of what people typed, not a bar chart. */
  .pa-said{margin-top:14px;display:flex;flex-direction:column;gap:8px;
    max-height:340px;overflow:auto}
  .pa-say{padding:10px 12px;border-radius:11px;background:var(--panel-2,#f6f8fd);
    border:1px solid var(--line,#e3e8f4);font-size:.86rem;line-height:1.45;
    color:var(--ink,#12162a);overflow-wrap:anywhere}
  .pa-when{display:block;margin-top:4px;font-size:.72rem;color:var(--faint,#818ead)}
  .pa-none{margin:14px 0 0;font-size:.82rem;color:var(--faint,#818ead)}
`;
