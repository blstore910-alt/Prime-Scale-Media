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
/* ── Palette ────────────────────────────────────────────────────────────
   The shells did not LOOK grey by design — the ground is a cool blue —
   but they read grey, because almost everything that is not a heading is
   drawn in one of two desaturated slates: table headers, stat labels, all
   secondary text, filter buttons, input surfaces. Grey neutrals on a
   near-white ground is the definition of flat.

   The neutrals move toward the brand's own hue rather than away from it.
   The shift is small on purpose — these are read at small sizes and a
   saturated grey becomes a colour, which is worse than a flat one. */
${s}{
  --txt-2:#535e78;
  --faint:#818ead;
  --line:#e3e8f4;
  --line-2:#d3daec;
  --panel-2:#f0f4fd;
}
/* A ground with a light source. One wash from the top, fixed, so the page
   does not stripe when it scrolls. Cards then sit ON something. */
${s}{
  background-image:
    radial-gradient(120% 55% at 50% 0%,rgba(91,141,255,.11),transparent 62%),
    radial-gradient(90% 45% at 100% 8%,rgba(139,92,246,.07),transparent 58%);
  background-attachment:fixed;
  background-repeat:no-repeat;
}
/* The top bar is sticky and 88% opaque, which was fine over a white page and
   wrong the moment anything dark scrolled beneath it: the hero showed through
   as a muddy grey smear across the bar. Nearly opaque, with the blur kept for
   the edge where content passes under it, and a soft lip so the bar reads as
   sitting above the page rather than cut out of it. */
${s} .topbar{
  background:color-mix(in srgb,var(--panel) 97%,transparent);
  box-shadow:0 1px 0 var(--line),0 10px 22px -20px rgba(20,30,80,.5);
}
/* Column headers and small caps pick up the brand hue instead of reading as
   grey furniture. */
${s} .tbl th{color:#6b7796}
/* Filter and toolbar buttons get the same lit surface as the ghost button,
   so a row of them stops looking like a row of grey boxes. */
${s} .fbtn,${s} .seg2{background-image:linear-gradient(180deg,#fff,var(--panel-2))}
${s} .fbtn:hover{border-color:var(--primary);color:var(--primary-600)}

/* ── Buttons ────────────────────────────────────────────────────────────
   A flat fill with a drop shadow is the default every framework ships. The
   difference between that and something considered is a light source: a
   gradient that is brighter at the top, a hairline of white along the top
   edge, and a shadow tinted with the button's own hue rather than grey. */
${s} .btn{
  /* SMALLER, EVERYWHERE. These inherited the body's 16px at weight 700
     with 11px of padding above and below, which came out as a 46px slab
     — fine for one hero button, wrong for the eight of them on a phone
     screen. 14px text and 10px of padding is still a comfortable tap
     target (42px with the border) and stops a button shouting louder
     than the heading above it. */
  font-size:.875rem;
  padding:10px 15px;
  background-image:linear-gradient(180deg,rgba(255,255,255,.17),rgba(255,255,255,0) 58%);
  box-shadow:0 1px 0 rgba(255,255,255,.22) inset,0 10px 22px -14px rgba(58,111,255,.85),0 2px 5px -3px rgba(20,30,80,.35);
  transition:transform .12s cubic-bezier(.2,.7,.3,1),box-shadow .12s,filter .12s,background-color .12s;
}
/* THE MODIFIERS HAVE TO WIN.
   The rule above is scoped (0,2,0); .btn.sm and .btn.sm2 in the shell
   sheets are unscoped and therefore ALSO (0,2,0) — and this file is
   appended last, so equal specificity meant source order decided and the
   base rule beat both. A change made to shrink buttons enlarged the
   densest ones in the app: every small ghost button in a table action
   row. Restated here at the same scope, so the modifier is later too.
   (No backticks in this comment: it lives inside a template literal, and
   one here has broken the production build twice.) */
/* Lower again. "View all", "Pay" and the table action buttons sit
   inside cards and beside text, where a 38px slab reads as heavy.
   7px keeps a 34px control, which is still comfortable next to a
   heading and no longer competes with it. */
${s} .btn.sm{padding:7px 12px;font-size:.84rem}
${s} .btn.sm2{padding:7px 12px;font-size:.82rem}
${s} .btn:hover{transform:translateY(-1px);filter:brightness(1.04);
  box-shadow:0 1px 0 rgba(255,255,255,.26) inset,0 16px 28px -16px rgba(58,111,255,.9),0 3px 7px -4px rgba(20,30,80,.4)}
/* A real press: down, and the lift taken away. Buttons that only change
   colour on :active feel like pictures of buttons. */
${s} .btn:active{transform:translateY(1px);filter:brightness(.98);
  box-shadow:0 1px 2px rgba(20,30,80,.28),0 1px 0 rgba(255,255,255,.14) inset}
${s} .btn:disabled,${s} .btn[aria-disabled="true"]{
  opacity:.5;cursor:not-allowed;transform:none;filter:none;
  box-shadow:0 1px 2px -1px rgba(20,30,80,.25)}
/* A trailing arrow leans toward where it is taking you. "View all →" appears
   on nearly every list in this app, and a static arrow is the difference
   between a control and a label. */
${s} .btn>svg:last-child:not(:first-child){transition:transform .14s cubic-bezier(.2,.8,.25,1)}
${s} .btn:hover>svg:last-child:not(:first-child){transform:translateX(2px)}
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
/* Three fixed rows — label, value, sub — so tiles line up with each other
   whatever they contain. They did not: one label wrapped to two lines while
   its neighbour stayed on one, which pushed its value a whole line lower, and
   one tile had a sub-line the other did not. Both were visible as a wobble
   between two tiles sitting side by side. */
${s} .stat{display:grid;grid-template-rows:auto 1fr auto;align-content:start}
${s} .stat .k{min-height:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:.75rem;letter-spacing:.01em}
${s} .stat .v{margin-top:11px;padding-top:0;line-height:1.08;align-self:end}
${s} .stat .sub{min-height:1.15em;margin-top:4px}
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
/* A dialog that holds a question and one line of answer should be the size
   of a question and one line of answer. These were laid out for forms, so a
   two-line confirmation came out as tall as a top-up. */
${s} .mcard:has(.mfoot) .cap{margin-bottom:0}
${s} .mcard .mfoot .btn{font-size:.9rem;padding:11px 18px}

/* ── The page-head action ───────────────────────────────────────────────
   .phead is space-between with wrap, so as soon as the title and the
   button stop fitting side by side the button drops to its own line and
   lands hard against the left margin — under the subtitle, in line with
   nothing. It reads like something that fell off.
   Pushed to the right instead, where it lines up with the edge of the
   cards below it, and given the same air above as the subtitle has. */
@media (max-width:640px){
  ${s} .phead{align-items:flex-start}
  ${s} .phead>.btn,
  ${s} .phead>*:last-child:not(:first-child){margin-left:auto}
}

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
  /* THE ACTION NEVER SCROLLS OUT OF REACH. A sheet can always be handed
     more content than the screen holds — a plan with five perks, a long
     wallet line, a second warning — and when that happens the thing the
     person opened it to press must still be under their thumb rather
     than below the fold. Trimming content buys headroom once; a footer
     that sticks to the bottom of the sheet is true whatever the content
     turns out to be. It carries the safe-area padding itself, so the
     card gives up its own. */
  ${s} .mcard:has(.mfoot){padding-bottom:0}
  ${s} .mfoot{
    flex-direction:column-reverse;gap:8px;
    position:sticky;bottom:0;z-index:3;background:var(--panel);
    margin-top:14px;padding-top:13px;
    padding-bottom:calc(16px + env(safe-area-inset-bottom));
  }
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
${s} .umenu-hd{display:flex;align-items:center;gap:10px;padding:10px 11px 11px;margin-bottom:4px;border-bottom:1px solid var(--line)}
${s} .umenu-av{width:34px;height:34px;flex:0 0 auto;border-radius:10px;display:grid;place-items:center;
  font-family:var(--hd);font-weight:800;font-size:.8rem;letter-spacing:-.02em;color:#fff;background:var(--brand);
  box-shadow:0 6px 14px -8px rgba(124,92,255,.8),inset 0 1px 0 rgba(255,255,255,.3)}
${s} .umenu-who{min-width:0;display:flex;flex-direction:column;line-height:1.25}
${s} .umenu-who .nm,${s} .umenu-hd .nm{font-weight:800;font-family:var(--hd);letter-spacing:-.01em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${s} .umenu-who .sub,${s} .umenu-hd .sub{color:var(--faint);font-size:.78rem;font-weight:600;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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

/* The green dot on the avatar is gone. It sat half off a 30px tile with a
   2px ring, so at phone size it was three or four pixels of colour that read
   as a smudge rather than a status — and it was not reporting a status
   anyway: it was on for everyone, always. A signal that never varies is
   decoration, and this one was decoration that looked like a defect. */
${s} .tool.ava-btn .avatar::after,
${s} .who-btn .avatar::after{display:none}

/* ── A pair of fees ─────────────────────────────────────────────────────
   What the customer pays US and what WE pay the supplier, side by side.
   Stacked and identical, the only thing telling them apart was reading the
   label — on the one screen where confusing them sets a margin backwards.
   Money in takes the brand colour, money out takes amber, and side by side
   they fit on one phone screen with the margin line under them. */
${s} .feepair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}
${s} .feefield{border:1px solid var(--line);border-radius:12px;padding:9px 10px 8px;min-width:0}
${s} .feefield .mlabel{display:flex;flex-direction:column;gap:1px;margin:0 0 6px;
  font-size:.72rem;font-weight:800;letter-spacing:.02em}
${s} .feefield .mlabel span{font-size:.66rem;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;opacity:.75}
${s} .feefield input{width:100%;font-variant-numeric:tabular-nums;font-weight:700}
${s} .feefield .feehint{margin:5px 0 0;font-size:.68rem;line-height:1.3;color:var(--faint)}
${s} .feefield.in{background:var(--primary-tint);border-color:#cfe0ff}
${s} .feefield.in .mlabel{color:var(--primary-600)}
${s} .feefield.out{background:var(--warn-soft);border-color:#f2d9a3}
${s} .feefield.out .mlabel{color:#a9740b}
${s} .feefield.out input:disabled{opacity:.6}

/* ── Customer name ──────────────────────────────────────────────────────
   Client code loud, name quiet. See components/psm/customer-name.tsx for
   why that order and not the other one. */
${s} .cust{display:flex;flex-direction:column;gap:1px;min-width:0}
${s} .cust-code{display:flex;align-items:center;gap:7px;min-width:0;
  font-family:var(--hd);font-weight:800;letter-spacing:-.01em;line-height:1.2;
  font-variant-numeric:tabular-nums;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${s} .cust-name{color:var(--faint);font-size:.8rem;font-weight:600;line-height:1.25;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${s} .cust-none{color:var(--faint);font-weight:600}

/* ── One line per cell ──────────────────────────────────────────────────
   A company called "Test Advertiser BV" was drawn on THREE lines, in a
   column 60px wide, in a table that had a horizontal scrollbar at the same
   time. Both halves of that come from the same thing: nothing capped how
   much width a cell could ask for, so a long name either wrapped (no
   nowrap) or pushed the table past the viewport (nowrap).

   .clip caps it. The cap goes on the cell's CHILD, not the cell: in the
   automatic table layout a td's own max-width is advisory — browsers still
   size the column to its content — while a block child's max-width really
   does clamp what the column asks for. Call sites put the full value in a
   title so nothing is lost, only shortened.

   .nw is for the values that must never break across two lines: a date,
   a reference, an amount. .r already carries it; this is for the ones
   that are not right-aligned. */
${s} .tbl td.clip>*{display:block;max-width:190px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${s} .tbl td.clip{max-width:190px}
${s} .tbl td.nw,${s} .tbl th.nw{white-space:nowrap}
/* The customer identity is two stacked lines by design, so it caps as a
   block rather than per line. */
${s} .tbl .cust{max-width:190px}
/* In card mode a row IS the width of the card, so a 190px cap would clip
   text that has room. Let it use the card. */
@media (max-width:640px){
  ${s} .tbl.wide td.clip,
  ${s} .tbl.wide td.clip>*,
  ${s} .tbl.wide .cust{max-width:100%}
}

/* ── Card headings ──────────────────────────────────────────────────────
   An icon sitting loose against a title at whatever size it happened to be
   drawn is the difference between a heading and two things that are near
   each other. Every card heading that carries an icon gets the same tile,
   the same 10px gap and the same baseline — done here rather than at each
   call site, because there are dozens and they were each inline-styled. */
/* ALSO an h2 inside a .phead — which is most of them. The selector was
   .card>h2 only, so every card whose heading sits in a title/action row
   missed all of this: the icon fell back to an inline image at its natural
   size and the title wrapped onto the line UNDER it. "Your ad accounts" was
   drawn below its own monitor glyph. */
/* ANY h2 inside a card, at any depth. This was .card>h2, then
   .card>h2 plus .card .phead>h2, and each time another heading turned up
   that sat one div deeper — "Wallet activity" lives inside a padding
   wrapper — and rendered its icon as a loose inline image with the title
   on the line UNDERNEATH it. A card heading is a card heading wherever it
   is nested; an h2 with no icon is unaffected by the svg rules. */
${s} .card h2{display:flex;align-items:center;gap:10px;font-size:1.06rem;min-width:0}
${s} .card h2>span{display:inline-flex;align-items:center;gap:10px;min-width:0}
${s} .card h2 svg{
  box-sizing:content-box;width:17px;height:17px;padding:7px;flex:0 0 auto;
  border-radius:10px;color:var(--primary-600);background:var(--primary-tint);
  box-shadow:0 1px 0 #fff inset,0 0 0 1px rgba(58,111,255,.12)}

/* ── Fields ─────────────────────────────────────────────────────────────
   Labels that sit a little away from their input and inputs that look like
   the page they are on. A field should read as one object. */
${s} .field label{font-weight:700;font-size:.8rem;color:var(--txt-2);margin-bottom:6px;display:block}
${s} .field input,${s} .field select,${s} .field textarea{
  background:var(--panel-2);border:1px solid var(--line-2);border-radius:11px;
  transition:border-color .13s,box-shadow .13s,background .13s}
${s} .field input:hover,${s} .field select:hover{border-color:var(--line-2);background:#fff}
${s} .field input:focus,${s} .field select:focus,${s} .field textarea:focus{
  outline:0;background:#fff;border-color:var(--primary);
  box-shadow:0 0 0 3px var(--primary-tint)}

/* ── Empty states ───────────────────────────────────────────────────────
   "No ad accounts yet." in grey italics inside an otherwise blank card is
   the least helpful screen in any app: it states the obvious and offers
   nothing. An empty state is the first thing a new customer sees on half
   these screens, so it gets an icon, a heading, a sentence that says what
   happens next, and the button that does it. */
${s} .card.empty{display:flex;flex-direction:column;align-items:center;text-align:center;
  gap:4px;padding:34px 22px}
${s} .card.empty .empty-ic{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;
  margin-bottom:10px;color:var(--primary-600);
  background:linear-gradient(160deg,var(--primary-tint),#fff);
  box-shadow:0 1px 0 #fff inset,0 10px 22px -14px rgba(58,111,255,.55),0 0 0 1px var(--line)}
${s} .card.empty .empty-ic svg{width:24px;height:24px}
${s} .card.empty h3{font-family:var(--hd);font-weight:800;font-size:1.05rem;letter-spacing:-.02em;margin:0}
${s} .card.empty p{color:var(--txt-2);font-size:.88rem;margin:6px 0 16px;max-width:42ch;line-height:1.5}
/* An empty state's action should be the obvious next step, not a slab.
   min-width:180px on a 375px screen made "Go to billing" half the width
   of the card it sat in. */
${s} .card.empty .btn{min-width:0;padding:10px 20px;justify-content:center}

/* ── Badges ─────────────────────────────────────────────────────────────
   A hairline of the badge's own colour, so a pale pill still has an edge. */
/* ── Waiting is a state, and it should look like one ─────────────
   A pending payment is the only thing on these screens that is actually in
   motion: somebody has sent money and is waiting to be told it arrived. It
   was drawn as a flat amber pill, indistinguishable from a label. Now it
   breathes.

   Two effects, both tiny on purpose. This is a financial app: money that
   bounces around is money you do not trust.
     1. A pulsing dot on every pending pill, in the pill's own colour.
     2. A slow sheen across a row that is waiting for us to act.

   Both are animation-only, so the reduced-motion block further down stops
   them dead without leaving a gap in the layout. */
@keyframes psm-pulse{
  0%,100%{opacity:.3;transform:scale(.78)}
  50%{opacity:1;transform:scale(1.1)}
}
${s} .badge.pend::before{
  content:"";width:6px;height:6px;border-radius:99px;background:currentColor;
  flex:0 0 auto;animation:psm-pulse 1.7s ease-in-out infinite
}
@keyframes psm-sheen{
  0%{transform:translateX(-130%)}
  100%{transform:translateX(230%)}
}
${s} .waiting{position:relative;overflow:hidden}
${s} .waiting::after{
  content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(104deg,transparent 38%,rgba(255,255,255,.5) 50%,transparent 62%);
  transform:translateX(-130%);animation:psm-sheen 3.2s ease-in-out infinite
}
/* The clock tile on a waiting row gets one soft ring, once per sheen. */
@keyframes psm-ring{
  0%{box-shadow:0 0 0 0 rgba(233,168,44,.45)}
  70%{box-shadow:0 0 0 9px rgba(233,168,44,0)}
  100%{box-shadow:0 0 0 0 rgba(233,168,44,0)}
}
${s} .waiting .ico{animation:psm-ring 3.2s ease-out infinite}

/* ── A customer identity that is also a link ────────────────────
   On a queue where you are about to credit somebody's wallet, their own
   record should be one tap away. The identity block becomes the button, so
   the thing you press is the thing you are pressing on. */
${s} .custbtn{
  display:block;min-width:0;border:0;background:none;padding:0;margin:0;
  font:inherit;color:inherit;text-align:left;cursor:pointer;border-radius:9px;
  transition:color .12s
}
${s} .custbtn:hover .cust-code{color:var(--primary-600)}
${s} .custbtn:focus-visible{outline:0;box-shadow:0 0 0 3px var(--primary-tint)}

/* ── The verify queue's five actions ────────────────────────
   AT EVERY WIDTH, not behind a phone breakpoint. These cards sit in a
   repeat(auto-fill,minmax(280px,1fr)) grid, so the card is about 300px wide
   on a 27-inch monitor exactly as it is on a phone — the viewport tells you
   nothing about it.

   That is also what broke it: the row was given the shared .actrow, which is
   flex with justify-content:flex-end and no wrapping. Five buttons do not
   fit in 300px, and a flex-end row whose content overflows spills out of its
   START edge — so Verify hung outside the left edge of the card and Details
   was clipped away entirely, on a desktop.

   A two-up grid cannot overflow. Verify spans both columns at the top,
   because it is the action this screen exists for; the rest pair off. */
${s} .tupacts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
${s} .tupacts .btn{width:100%;justify-content:center;min-width:0}
${s} .tupacts .tupmain{grid-column:1 / -1;order:-1}

${s} .badge{box-shadow:0 0 0 1px rgba(20,30,80,.05) inset;letter-spacing:.01em}
`;
}
