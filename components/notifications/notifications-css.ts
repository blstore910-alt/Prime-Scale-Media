// ─────────────────────────────────────────────────────────────────────
// The alerts page carries its own styling
// ─────────────────────────────────────────────────────────────────────
// /notifications is a SHARED route: app/(app)/layout.tsx sends admins
// through AdminLayout, advertisers through AdvertiserLayout and
// affiliates through AffiliateLayout. Only the admin shell injects
// PSM_APP_CSS.
//
// So the swipe rules, which lived there, reached admins and nobody
// else -- and without them .swipeback loses position:absolute and
// renders as a grey "Archive" block ABOVE every row, .swipebtn loses
// opacity:0 and sits visibly in every row, and .swiperow loses
// overflow:hidden so a swipe slides the row across the page. A customer
// following a link to their own alerts would have seen that.
//
// Unscoped and self-contained, with literal colours rather than tokens,
// because the three shells define different token sets and this has to
// look the same in all of them.
// ─────────────────────────────────────────────────────────────────────

export const NOTIFICATIONS_CSS = `
/* Inbox / Archive. A base .seg2 as well as the modifier: PSM_APP_CSS
   has no base rule for it at all -- that lives in the advertiser and
   affiliate shells -- so on the admin side these rendered as plain grey
   browser buttons with no indication of which one was selected. */
.nfview{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;
  margin:0 0 12px;max-width:280px;padding:3px;border-radius:10px;
  background:rgba(120,130,160,.10);border:1px solid rgba(120,130,160,.18)}
.nfview button{padding:8px 6px;border:0;border-radius:8px;background:none;
  font:inherit;font-weight:700;font-size:.82rem;color:#5b647d;cursor:pointer;
  text-align:center;transition:.13s}
.nfview button:hover{color:#1b2135}
.nfview button.on{background:#fff;color:#3a6fff;
  box-shadow:0 1px 3px rgba(20,30,80,.16)}

/* The coloured panel sits behind the row and never moves; the row
   slides over it. Hence overflow:hidden and a stacking context. */
.swiperow{position:relative;overflow:hidden;isolation:isolate}
.swiperow .swipeback{position:absolute;inset:0;display:flex;align-items:center;
  justify-content:flex-end;gap:8px;padding:0 20px;background:#eef1f8;
  color:#5b647d;font-size:.78rem;font-weight:800;letter-spacing:.02em;
  transition:background .12s,color .12s}
.swiperow .swipeback svg{width:17px;height:17px}
/* Past the point of no return, so the colour IS the confirmation --
   a gesture has no dialog to offer. */
.swiperow .swipeback.armed{background:#dbe6ff;color:#3a6fff}
.swiperow .swipefront{position:relative;z-index:1;background:#fff;
  touch-action:pan-y}
.swiperow.gone .swipefront{transition:transform .14s ease-in;opacity:.4}

/* The same action for a keyboard and a screen reader: quiet until the
   row is hovered or it is focused, but always reachable by Tab. */
.swiperow .swipebtn{position:absolute;top:50%;right:8px;transform:translateY(-50%);
  z-index:2;display:grid;place-items:center;width:30px;height:30px;padding:0;
  border:1px solid transparent;border-radius:9px;background:none;cursor:pointer;
  color:#8b93a7;opacity:0;transition:opacity .12s,color .12s,border-color .12s}
.swiperow:hover .swipebtn,.swiperow .swipebtn:focus-visible{opacity:1}
.swiperow .swipebtn:hover{color:#3a6fff;border-color:#c9d6f5}
.swiperow .swipebtn svg{width:15px;height:15px}
@media (hover:none){
  /* No hover on a phone, and there the swipe IS the gesture -- the
     button would only cover the unread dot. */
  .swiperow .swipebtn{display:none}
}

@media (prefers-color-scheme: dark){
  .nfview{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)}
  .nfview button{color:#9aa3bd}
  .nfview button.on{background:rgba(255,255,255,.12);color:#9db8ff;box-shadow:none}
  .swiperow .swipeback{background:rgba(255,255,255,.07);color:#9aa3bd}
  .swiperow .swipeback.armed{background:rgba(91,141,255,.22);color:#9db8ff}
  /* transparent, not a literal: the row's own background belongs to
     whichever shell drew it. */
  .swiperow .swipefront{background:transparent}
}
`;
