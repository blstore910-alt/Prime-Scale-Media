import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HB_CHAPTERS, HB_GLOSSARY, chapterText } from "../../lib/staff-handbook";

test("elk hoofdstuk heeft Engels en Nederlands, met evenveel stappen", () => {
  for (const c of HB_CHAPTERS) {
    for (const k of ["title", "what", "why"] as const) {
      assert.ok(c[k].en.trim() && c[k].nl.trim(), `${c.id}.${k}`);
    }
    assert.equal(c.how.en.length, c.how.nl.length, `${c.id}: stappen`);
    assert.equal(c.watch?.en.length ?? 0, c.watch?.nl.length ?? 0, `${c.id}: let op`);
  }
  for (const g of HB_GLOSSARY) assert.ok(g.def.en && g.def.nl, g.term);
});

test("geen leveranciersnaam: dit wordt aan klanten voorgelezen", () => {
  const alles = HB_CHAPTERS.flatMap((c) => [...chapterText(c, "en"), ...chapterText(c, "nl"), c.where ?? ""]).join(" ");
  assert.doesNotMatch(alles, /seamx|falkyn|rockads|bestads|muxue|gradyn|turlit|zanel/i);
});

test("de hoofdstuknummers lopen door", () => {
  HB_CHAPTERS.forEach((c, i) => {
    assert.match(c.title.en, new RegExp(`^${i + 1}\\. `));
    assert.match(c.title.nl, new RegExp(`^${i + 1}\\. `));
  });
});
