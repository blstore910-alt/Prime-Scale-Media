// ── ONE DARK PALETTE, THREE SHELLS ──────────────────────────────────
//
// The owner, 27-09: "donkere modus is prima toch maar, admin moet ook
// mooier, alles en iedereen."
//
// next-themes was already installed and pinned to light on purpose
// (attribute="class", defaultTheme="light", enableSystem={false}), and
// app/globals.css already carried a `.dark` block for the shadcn tokens.
// What was missing is the part that actually covers the app: each shell
// declares its OWN palette -- `.advapp`, `.psmapp` (which the admin
// shell also uses) and `.affapp` -- with hardcoded light values. Flip
// the class without this and the shadcn components go dark inside a
// white app, which looks broken rather than unfinished.
//
// WHY ONE FUNCTION AND NOT THREE BLOCKS
//
// The three light palettes are already near-identical and have already
// drifted in small ways (the affiliate's --ink is #161a23, the other two
// are #12162a). Writing the dark set three times guarantees they drift
// further, and a dark mode that is slightly different per screen is the
// thing people notice. So: one set, applied to each root.
//
// WHAT IS DELIBERATELY NOT OVERRIDDEN
//
//   --navy1/2/3, --brand  the dark hero cards are built from these and
//                         they are ALREADY dark. Lifting them would
//                         flatten the one contrast those cards have.
//   --gold, --teal,       brand hues. A palette that changes identity
//   --win/warn/danger     between modes is two brands.
//
// The accents ARE lifted a little: #3a6fff on #0a0e1d is legible but
// heavy, and the same blue that reads as "primary" on white reads as
// "visited link" on navy.

export type DarkTokenOverrides = {
  /** Shell-specific extras, e.g. the affiliate's --gold-deep. */
  extra?: string;
};

/**
 * The dark half of a shell's palette, scoped under `.dark`.
 *
 * `root` is the shell's own class, with the dot: ".advapp".
 */
export function shellDarkCss(root: string, o: DarkTokenOverrides = {}): string {
  return `
/* ── DARK ──────────────────────────────────────────────────────────
   Only the tokens. Everything in this file that reads var(--panel) or
   var(--ink) follows automatically; the literal colours that remain are
   on surfaces that were already dark. */
.dark ${root}{
  --ground:#0a0e1d;--panel:#121730;--panel-2:#1a2043;
  --ink:#eef1fa;--txt-2:#a7b0c8;--faint:#7b849c;
  --line:#232a4d;--line-2:#2f3862;
  /* Lifted: the light-mode primary is heavy on navy and reads as a
     visited link rather than an action. */
  --primary:#6d97ff;--primary-600:#87abff;--primary-tint:#1a2450;
  /* The soft ramps are tints of white in light mode, which on a dark
     ground become brighter than the text. They become deep washes of
     their own hue instead. */
  --win-soft:#0f3329;--warn-soft:#3a2c0c;--danger-soft:#3d1c1f;
  --gold-soft:#3a2c0c;
  /* A shadow is invisible on a dark ground -- depth comes from a rim.
     Kept as a shadow token so nothing downstream has to know that. */
  --shadow-sm:0 0 0 1px rgba(255,255,255,.05);
  --shadow:0 18px 40px -24px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.05);${
    o.extra ? `\n  ${o.extra}` : ""
  }
  color-scheme:dark;
}

/* Form controls and scrollbars are drawn by the browser, not by us, and
   they stay white without this. */
.dark ${root} input,
.dark ${root} textarea,
.dark ${root} select{background:var(--panel-2);color:var(--ink);border-color:var(--line)}
.dark ${root} input::placeholder,
.dark ${root} textarea::placeholder{color:var(--faint)}

/* Anything drawn as a white sheet rather than as var(--panel). These are
   the literals a token override cannot reach; each one is a real surface
   in this shell. */
.dark ${root} .card,
.dark ${root} .panel,
.dark ${root} .sheet{background:var(--panel);border-color:var(--line)}

/* ── THE GLOWS ─────────────────────────────────────────────────────
   The owner, 27-09, on the first dark screen: "alle buttons en
   highlighted en gradients zien wel raar toch." Right, and this is the
   half a token override cannot reach.

   Between them the three shells carry 47 coloured drop shadows --
   rgba(58,111,255,.7) under a button, rgba(20,30,80,.4) under a card.
   On white those read as depth. On #0a0e1d a navy shadow is invisible
   and a blue one is a halo around the button rather than under it.

   Depth on a dark ground comes from the TOP: a hairline of light where
   the surface would catch it. So every coloured glow becomes one. */
.dark ${root} .btn{box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
.dark ${root} .btn.grad,
.dark ${root} .btn.danger{box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}
.dark ${root} .btn.ghost{background:var(--panel-2);border-color:var(--line-2);box-shadow:none}
.dark ${root} .btn.ghost:hover{background:var(--line);border-color:var(--primary)}
.dark ${root} .wallet,
.dark ${root} .mark{box-shadow:0 0 0 1px rgba(255,255,255,.08)}

/* The selected segment was var(--panel) on a var(--panel-2) strip: a
   3% difference, which is a visible choice on white and nothing at all
   on navy. */
.dark ${root} .seg2 button.on{background:var(--line-2);color:var(--ink)}

/* Pale chips that are tints of white in light mode. Each is a real
   background in these files, not a token. */
.dark ${root} .ci.t{background:#0e3b42;color:#7fe0ef}
.dark ${root} .ci.p{background:#2c1f4a;color:#c9aeff}
.dark ${root} .alert .ai{background:var(--panel-2)}
.dark ${root} .pfi.tiktok{background:#2b2140;color:#c9a8ff}
/* The other two platform chips. tiktok was done and these were not,
   so Meta and Google sat as pale blue and pale green cards in a dark
   list while TikTok was dark -- three chips, two palettes. */
.dark ${root} .pfi.meta{background:#16244a;color:#9db8ff}
.dark ${root} .pfi.google{background:#0f3329;color:#7fd4a8}

/* ── THE PALE BORDERS ──────────────────────────────────────────────
   29-09. The backgrounds above were caught; their BORDERS were not.
   #cfe0ff around a dark blue tint and #f2d9a3 around a dark amber wash
   are the light-mode rims still drawn on the dark surface, which reads
   as a chip that did not finish loading. */
.dark ${root} .tool.wal,
.dark ${root} .fbtn.on{border-color:var(--primary-tint)}
.dark ${root} .alert{border-color:var(--line-2)}
.dark ${root} .rjchip{background:var(--panel-2);border-color:var(--line-2);color:var(--txt-2)}
.dark ${root} .rjchip.on{background:var(--primary-tint);border-color:var(--primary);color:var(--primary-600)}

/* Two form states that paint themselves white to say "you are here".
   On a dark ground that is a flashbulb, and the field stays white
   after the blur on a select. */
.dark ${root} .field select:hover,
.dark ${root} .field textarea:focus,
.dark ${root} .umenu-av{background:var(--panel-2)}

/* ── DE WITTE GLANS OP DE GRIJZE KNOPPEN ──────────────────────────
   De eigenaar, 29-09, met een screenshot van een lichtgrijze knop in
   een donkere kaart: "nog steeds her en der lichtgrijze buttons."

   refine-css.ts geeft .fbtn en .seg2 een background-IMAGE:
   linear-gradient(180deg,#fff,var(--panel-2)). Op wit is dat de
   glans bovenop een knop; op donker is het een witte knop die naar
   beneden toe donker wordt -- precies wat hij zag bij Sort & filter.

   De regel .btn.ghost heeft dezelfde gradient en was al gedekt,
   omdat die override de shorthand-eigenschap background gebruikt en
   die wist de image.
   Deze twee waren nergens overschreven. Zelfde truc, zelfde reden. */
.dark ${root} .fbtn,
.dark ${root} .seg2{background:var(--panel-2);border-color:var(--line-2)}
.dark ${root} .fbtn:hover{background:var(--line);border-color:var(--primary)}

/* ── DE NAAD BOVEN DE ONDERBALK ───────────────────────────────────
   "deze line boven de down bar lelijk."

   De balk is var(--panel) op een ondergrond van var(--ground): in
   donkere modus is de balk dus LICHTER dan de pagina, met daar
   bovenop nog een rand van var(--line). Twee lichte banden op elkaar,
   en dat leest als een naad in plaats van als een balk.

   Op wit is die volgorde juist goed -- een verhoogd vlak vangt licht.
   Op donker hoort het omgekeerd: de balk zakt naar de grond en de
   scheiding is een haarlijn van licht, niet een tweede vlak. */
.dark ${root} .bottombar{
  background:color-mix(in srgb,var(--ground) 94%,transparent);
  border-top-color:rgba(255,255,255,.06)}
`;
}
