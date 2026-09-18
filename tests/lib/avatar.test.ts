import test from "node:test";
import assert from "node:assert/strict";
import {
  hashSeed,
  avatarFor,
  initialsFrom,
  darken,
  mouthPath,
} from "../../lib/pure-avatar.ts";

test("the same person is always the same face", () => {
  const a = avatarFor("profile-123", { role: "advertiser" });
  const b = avatarFor("profile-123", { role: "advertiser" });
  assert.deepEqual(a, b);
});

test("different people look different", () => {
  const seeds = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const faces = seeds.map((s) => JSON.stringify(avatarFor(s)));
  assert.equal(new Set(faces).size, seeds.length);
});

test("a role picks its own hue family", () => {
  const adv = avatarFor("same-seed", { role: "advertiser" });
  const aff = avatarFor("same-seed", { role: "affiliate" });
  assert.notEqual(adv.bg, aff.bg);
});

test("the hash stays inside 32 bits and never goes negative", () => {
  for (const s of ["", "a", "a".repeat(500), "ölçü", "🙂"]) {
    const h = hashSeed(s);
    assert.ok(Number.isInteger(h), `${s} gave ${h}`);
    assert.ok(h >= 0 && h <= 0xffffffff, `${s} gave ${h}`);
  }
});

test("every generated value stays inside its drawing box", () => {
  for (let i = 0; i < 400; i += 1) {
    const s = avatarFor(`seed-${i}`);
    assert.ok(s.tilt >= -18 && s.tilt <= 18, `tilt ${s.tilt}`);
    assert.ok(s.eyeY >= 14 && s.eyeY <= 17, `eyeY ${s.eyeY}`);
    assert.ok(s.eyeGap >= 4 && s.eyeGap <= 6, `eyeGap ${s.eyeGap}`);
    assert.ok(s.smile > 0 && s.smile <= 1, `smile ${s.smile}`);
    assert.ok(s.mouthW >= 9 && s.mouthW <= 14, `mouthW ${s.mouthW}`);
    // The mouth must not run off the 36-unit face.
    assert.ok(18 - s.mouthW / 2 >= 3, `mouth left ${s.mouthW}`);
    assert.ok(18 + s.mouthW / 2 <= 33, `mouth right ${s.mouthW}`);
  }
});

test("initials: two names give two letters", () => {
  assert.equal(initialsFrom("Prime Scale Media"), "PS");
  assert.equal(initialsFrom("Baris Demir"), "BD");
});

test("initials: one name gives its first two letters, never one", () => {
  assert.equal(initialsFrom("Baris"), "BA");
});

test("initials: no name falls back to the email, not to a question mark", () => {
  assert.equal(initialsFrom(null, "barisdemir@example.com"), "BA");
  assert.equal(initialsFrom("", "x@y.z"), "X");
});

test("initials: nothing at all is a mark, not an error", () => {
  assert.equal(initialsFrom(null, null), "··");
  assert.equal(initialsFrom("   ", ""), "··");
});

test("darken moves toward black and stays a valid hex", () => {
  assert.equal(darken("#5B8DFF", 0), "#5b8dff");
  assert.equal(darken("#FFFFFF", 1), "#000000");
  assert.match(darken("#5B8DFF", 0.28), /^#[0-9a-f]{6}$/);
});

test("darken refuses to invent a colour from nonsense", () => {
  assert.equal(darken("not a colour", 0.3), "#000000");
});

// A straight mouth is a face that looks bored; a missing one looks broken.
test("the mouth is always a drawable path", () => {
  for (let i = 0; i < 50; i += 1) {
    const d = mouthPath(avatarFor(`m-${i}`));
    assert.match(d, /^M [\d.]+ \d+ Q 18 [\d.]+ [\d.]+ \d+$/);
  }
});
