/**
 * One refinement layer, shared by every shell.
 *
 * The admin and advertiser shells were ported from separate mockups and had
 * drifted: flat fills, a single soft shadow on everything, no focus ring
 * anywhere, and modals that appeared as centred boxes on a phone where a
 * sheet is what people expect. Fixing that per screen would take forever and
 * would drift again, so it is done once, here, on the primitives every screen
 * already uses — .btn, .card, .modal/.mcard, .umenu, .badge.
 *
 * Scoped, so it always outranks the base rules it is refining.
 */
export function refineCss(scope: string): string {
  const s = scope;
  return `
/* ── Buttons ────────────────────────────────────────────────────────────
   A flat fill with a drop shadow is the default every framework ships. The
   difference between that and something considered is a light source: a
   gradient that is brighter at the top, a hairline of white along the top
   edge, and a shadow tinted with the button's own hue rather than grey. */
${s} .btn{
  background-image:linear-gradient(180deg,rgba(255,255,255,.17),rgba(255,255,255,0) 58%);
  box-shadow:0 1px 0 rgba(255,255,255,.22) inset,0 10px 22px -14px rgba(58,111,255,.85),0 2px 5px -3px rgba(20,30,80,.35);
  transition:transform .12s cubic-bezier(.2,.7,.3,1),box-shadow .12s,filter .12s,background-color .12s;
}
${s} .btn:hover{transform:translateY(-1px);filter:brightness(1.04);
  box-shadow:0 1px 0 rgba(255,255,255,.26) inset,0 16px 28px -16px rgba(58,111,255,.9),0 3px 7px -4px rgba(20,30,80,.4)}
/* A real press: down, and the lift taken away. Buttons that only change
   colour on :active feel like pictures of buttons. */
${s} .btn:active{transform:translateY(1px);filter:brightness(.98);
  box-shadow:0 1px 2px rgba(20,30,80,.28),0 1px 0 rgba(255,255,255,.14) inset}
${s} .btn:disabled,${s} .btn[aria-disabled="true"]{
  opacity:.5;cursor:not-allowed;transform:none;filter:none;
  box-shadow:0 1px 2px -1px rgba(20,30,80,.25)}
${s} .btn.ghost{background-image:linear-gradient(180deg,#fff,var(--panel-2));
  box-shadow:0 1px 0 #fff inset,0 2px 5px -4px rgba(20,30,80,.4)}
${s} .btn.ghost:hover{background-image:linear-gradient(180deg,#fff,var(--panel-2));
  box-shadow:0 1px 0 #fff inset,0 8px 16px -12px rgba(20,30,80,.5)}
${s} .btn.grad{background-image:linear-gradient(118deg,#4f83ff,#6d63ff 52%,#9a6bff)}
${s} .btn.danger{background-image:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 58%);
  box-shadow:0 1px 0 rgba(255,255,255,.2) inset,0 10px 22px -14px rgba(229,72,77,.9)}

/* ── Focus ──────────────────────────────────────────────────────────────
   There was no visible focus state anywhere in either shell, so a keyboard
   user had no idea where they were. :focus-visible only, so it never shows
   on a mouse click. */
${s} .btn:focus-visible,
${s} .iconbtn:focus-visible,
${s} .tool:focus-visible,
${s} .umenu-item:focus-visible,
${s} .bb:focus-visible,
${s} a:focus-visible,
${s} button:focus-visible,
${s} input:focus-visible,
${s} select:focus-visible,
${s} textarea:focus-visible{
  outline:2px solid var(--primary);outline-offset:2px;border-radius:inherit}

/* ── Cards ──────────────────────────────────────────────────────────────
   One flat shadow on every surface flattens the hierarchy. Two layers — a
   tight contact shadow and a wide soft one — read as an object resting on a
   page rather than a rectangle with a blur behind it. */
${s} .card{
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,
             0 1px 2px -1px rgba(20,30,80,.16),
             0 16px 34px -24px rgba(20,30,80,.42);
}
${s} .stat{transition:transform .14s,box-shadow .14s,border-color .14s}
${s} .stat:hover{transform:translateY(-2px);border-color:var(--line-2);
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 20px 34px -22px rgba(20,30,80,.5)}

/* ── Modals ─────────────────────────────────────────────────────────────
   The backdrop was a flat tint; blurring what is behind it is what makes a
   dialog feel like it is in front rather than pasted on. */
${s} .modal .mback,
${s} .modal>.mback{background:rgba(9,14,38,.5);-webkit-backdrop-filter:blur(6px) saturate(120%);backdrop-filter:blur(6px) saturate(120%)}
${s} .mcard{
  border-color:rgba(255,255,255,.7);
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,
             0 2px 6px -2px rgba(20,30,80,.3),
             0 40px 80px -40px rgba(20,30,80,.65);
  animation:psmpop .22s cubic-bezier(.2,.8,.25,1);
}
@keyframes psmpop{from{opacity:0;transform:translateY(10px) scale(.975)}to{opacity:1;transform:none}}
${s} .mhead{padding-bottom:13px;margin-bottom:15px;border-bottom:1px solid var(--line)}
${s} .mfoot{padding-top:15px;margin-top:17px;border-top:1px solid var(--line)}

/* On a phone a dialog belongs at the bottom, under the thumb, with the
   corners squared off against the edge it is attached to — that is what
   every native sheet does, and a floating centred box is the giveaway that
   something was designed for a desktop first. */
@media (max-width:640px){
  ${s} .modal{place-items:end center;padding:0}
  ${s} .mcard{
    width:100%;max-width:none;border-radius:22px 22px 0 0;
    max-height:92dvh;padding:20px 18px calc(20px + env(safe-area-inset-bottom));
    animation:psmsheet .26s cubic-bezier(.2,.8,.25,1);
  }
  @keyframes psmsheet{from{transform:translateY(100%)}to{transform:none}}
  /* A grab handle, so it reads as something you can dismiss downward. */
  ${s} .mcard::before{
    content:"";position:sticky;top:0;display:block;
    width:38px;height:4px;border-radius:99px;background:var(--line-2);
    margin:-6px auto 12px;
  }
  ${s} .mfoot{flex-direction:column-reverse;gap:8px}
  ${s} .mfoot .btn{width:100%;justify-content:center}
}
@media (prefers-reduced-motion:reduce){
  ${s} .mcard{animation:none}
  ${s} .btn:hover,${s} .btn:active,${s} .stat:hover{transform:none}
}

/* ── Menus ──────────────────────────────────────────────────────────────
   Same two-layer shadow as the cards, and items that fill rather than just
   tint, so the pointer has something definite under it. */
${s} .umenu{
  border-color:rgba(255,255,255,.7);
  box-shadow:0 2px 6px -2px rgba(20,30,80,.28),0 28px 56px -30px rgba(20,30,80,.6);
  animation:psmpop .16s cubic-bezier(.2,.8,.25,1);
}
${s} .umenu-hd{padding:9px 11px 10px;margin-bottom:4px;border-bottom:1px solid var(--line)}
${s} .umenu-item{transition:background .12s,color .12s,transform .12s}
${s} .umenu-item:hover{background:var(--primary-tint);color:var(--primary-600)}
${s} .umenu-item:hover svg{color:var(--primary-600)}
${s} .umenu-item:active{transform:translateX(1px)}

/* ── Responsiveness ─────────────────────────────────────────────────────
   Switching view in these shells is a state flip — no fetch, no navigation —
   so it could be instant. It was not, because every view ran a 300ms fade
   that also slid the content up 6px: the work finished immediately and then
   the screen spent a third of a second catching up. On a phone, where
   people tap through a menu quickly, that is the whole feeling of the app.

   130ms with no transform. Short enough to read as instant, long enough not
   to flicker, and arriving in place rather than drifting into it — movement
   is what makes a transition feel like it is still happening. */
${s} .view.on{animation:psmview .13s cubic-bezier(.2,.8,.25,1)}
@keyframes psmview{from{opacity:0}to{opacity:1}}
/* The drawer was .22s on the default ease, which starts slowly — exactly the
   wrong shape for something that should feel like it was already there.
   Faster, and front-loaded so it leaves the edge at once. */
${s} .sidebar{transition:transform .17s cubic-bezier(.22,.9,.28,1),visibility .17s}
${s} .scrim{transition:opacity .17s ease}
/* Give the compositor warning on the two things that actually move, so the
   first frame is not the one that pays for the layer. */
${s} .sidebar,${s} .mcard{will-change:transform}
@media (prefers-reduced-motion:reduce){
  ${s} .view.on{animation:none}
  ${s} .sidebar{transition:none}
}

/* ── Badges ─────────────────────────────────────────────────────────────
   A hairline of the badge's own colour, so a pale pill still has an edge. */
${s} .badge{box-shadow:0 0 0 1px rgba(20,30,80,.05) inset;letter-spacing:.01em}
`;
}
