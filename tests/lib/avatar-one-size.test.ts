import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── WHY THIS IS A SOURCE TEST AND NOT A RENDER TEST ──────────────────
//
// The fault it guards is a CASCADE fault: an SVG presentation attribute
// (fontSize="14.5") loses to any CSS declaration, including one merely
// INHERITED from a wrapper. `.ava-btn .avatar{font-size:.72rem}` in the
// shell stylesheet therefore re-sized the letters inside the avatar, and
// the same person came out with small thin initials in the toolbar and
// proper ones in the account menu six pixels below it. The owner
// reported "two different avatars" many times over; nothing in a unit
// render would have caught it, because the component was innocent and
// the stylesheet was three files away.
//
// Two invariants, both checkable from the source and both the actual
// cause:
//   1. the avatar's own text sizing is an inline style, which no
//      inherited rule can outrank; and
//   2. no shell stylesheet sets a font property on an .avatar wrapper,
//      which is a leftover from when the avatar was two letters in a
//      div rather than a drawing.

const AVATAR = "components/ui/psm-avatar.tsx";
const SHELLS = [
  "components/advertiser/psm-shell-css.ts",
  "components/advertiser/adv-shell-css.ts",
  "components/affiliate/aff-shell-css.ts",
];

const read = (p: string) => readFileSync(p, "utf8");

test("the avatar's letters carry their own size, not the wrapper's", () => {
  const src = read(AVATAR);

  // No presentation attribute for anything CSS can inherit.
  for (const attr of ["fontSize=", "fontWeight=", "letterSpacing=", "fontFamily="]) {
    assert.equal(
      src.includes(attr),
      false,
      `${attr} is a presentation attribute — an inherited CSS rule outranks it. Put it in the element's own style={{...}}.`,
    );
  }

  // The avatar people actually get -- style "mono" -- is ONE element
  // with every visual property set inline, so there is no child for a
  // selector to reach and no presentation attribute for a stylesheet to
  // outrank. That is the property being guarded, not the shape it
  // happens to take today.
  const at = src.indexOf('if (resolved === "mono")');
  assert.ok(at > 0, "the mono branch is gone");
  const mono = src.slice(at, at + 3000);
  for (const prop of [
    "fontSize:",
    "fontWeight:",
    "letterSpacing:",
    "fontFamily:",
    "color:",
    "borderRadius:",
  ]) {
    assert.ok(
      mono.includes(prop),
      `the mono avatar does not set ${prop} inline, so a wrapper rule can still change it`,
    );
  }
});

test("no shell stylesheet reaches inside an avatar", () => {
  for (const path of SHELLS) {
    let css: string;
    try {
      css = read(path);
    } catch {
      continue; // a shell that no longer exists is not a failure
    }
    // Rule bodies that apply to a class ending in "avatar".
    const rules = css.match(/\.avatar[^{}]*\{[^}]*\}/g) ?? [];
    for (const rule of rules) {
      for (const prop of ["font-size", "letter-spacing", "font-weight", "font-family"]) {
        assert.equal(
          rule.includes(prop),
          false,
          `${path}: an .avatar rule sets ${prop}, which inherits into the avatar's own <text>:\n  ${rule}`,
        );
      }
    }
  }
});

test("an avatar wrapper's own fill is switched off for any child", () => {
  // .umenu-av and .side-foot .avatar each carry a brand fill from when
  // they held two letters rather than a picture. Both were neutralised
  // with a selector naming an svg CHILD -- which stopped matching the
  // moment the avatar became a single inline-styled element, and a
  // purple square came back out behind a round dark disc, in the
  // account menu only. The rule must not name the element.
  const SVG_CHILD = ":has(> svg)";
  const ANY_CHILD = ":has(> *)";
  for (const path of [...SHELLS, "components/advertiser/refine-css.ts"]) {
    let css: string;
    try {
      css = read(path);
    } catch {
      continue;
    }
    for (const line of css.split(String.fromCharCode(10))) {
      if (!line.includes(SVG_CHILD)) continue;
      // The whole line, not the part before the first "{": these are
      // template literals and `${s}` carries a brace of its own.
      // ORDER, not just presence. `:has(> *)` contributes the
      // specificity of `*`, which is zero, so a neutralising rule and
      // the rule it overrides are both (0,2,0) and the LATER one wins.
      // A version of this test that only looked for the selector passed
      // over a purple square that was still on screen.
      const neutralAt = css.indexOf(ANY_CHILD);
      const fillAt = css.lastIndexOf("background:var(--brand)");
      if (fillAt >= 0 && neutralAt >= 0) {
        assert.ok(
          neutralAt > fillAt,
          `${path}: the rule that switches an avatar wrapper's own fill off comes BEFORE the rule that sets it, at equal specificity — so it never applies.`,
        );
      }
      assert.ok(
        line.includes(ANY_CHILD),
        `${path}: a rule is keyed on an svg child only, so it stops ` +
          `applying the moment the avatar is not an <svg>: ${line.trim()}`,
      );
    }
  }
});

test("every avatar in a shell is drawn at the same size", () => {
  // Three shells, three places each: sidebar, toolbar, account menu.
  // When they differ, the wrapper's overflow:hidden shaves the rim off
  // the bigger one and the two read as different drawings.
  for (const path of [
    "components/admin/adm-shell.tsx",
    "components/advertiser/adv-app.tsx",
    "components/affiliate/aff-app.tsx",
  ]) {
    const src = read(path);
    const sizes = [...src.matchAll(/size=\{(\d+)\}/g)].map((m) => m[1]);
    assert.ok(sizes.length >= 3, `${path}: expected at least three avatars`);
    assert.equal(
      new Set(sizes).size,
      1,
      `${path}: avatars drawn at ${[...new Set(sizes)].join(", ")}px — pick one`,
    );
  }
});
