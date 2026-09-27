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
`;
}
