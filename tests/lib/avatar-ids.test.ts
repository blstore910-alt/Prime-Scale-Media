import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Two avatars for the same person on one page must not share SVG ids.
 *
 * WHY THIS EXISTS. The id was a hash of the seed alone — stable across
 * server and browser, which is what hydration needs, and identical for
 * every render of the same person, which is what SVG cannot have. The
 * advertiser shell draws one avatar in the sidebar and one in the
 * toolbar, so both SVGs declared the same <clipPath id> and both
 * referenced url(#that-id). A url() reference resolves to the FIRST
 * element with that id in the document — the sidebar's — and on a phone
 * the sidebar is off-canvas. A clip-path pointing into a hidden subtree
 * clips everything away, so the toolbar avatar rendered as a blank
 * space: in the DOM, correct size, opacity 1, painting nothing.
 *
 * There is no DOM in this suite, so this asserts the property that
 * prevents it: the id is derived from useId(), which is per instance.
 */
test("the avatar's SVG ids are per instance, not per seed", () => {
  const src = readFileSync("components/ui/psm-avatar.tsx", "utf8");

  assert.match(
    src,
    /useId\(\)/,
    "psm-avatar must derive its ids from React's useId — a seed hash is identical for every render of the same person, and two of them appear on every advertiser screen.",
  );

  // The uid must actually USE the per-instance part.
  const uid = /const uid = `av\$\{([^}]*)\}/.exec(src) ?? /const uid = `av\$\{(\w+)\}/.exec(src);
  assert.ok(uid, "could not find the uid expression");
  assert.ok(
    /instance/.test(src.slice(src.indexOf("const uid"), src.indexOf("const uid") + 200)),
    "the uid must include the per-instance value, not just the seed hash.",
  );
});
