import test from "node:test";
import assert from "node:assert/strict";

import {
  isChunkLoadFailure,
  MIN_AGE_BEFORE_RELOAD_MS,
  shouldReloadForChunk,
} from "../../lib/pure-chunk-error";

test("webpack's own error is recognised", () => {
  const e = new Error("Loading chunk 4413 failed.\n(missing: https://app.primescalemedia.com/_next/static/chunks/4413-8a61d52d570fb10a.js)");
  e.name = "ChunkLoadError";
  assert.equal(isChunkLoadFailure(e), true);
});

test("every browser's wording for a dead dynamic import", () => {
  const messages = [
    "Failed to fetch dynamically imported module: https://app.primescalemedia.com/_next/static/chunks/3549.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Loading CSS chunk 812 failed.",
    "expected expression, got '<'",
  ];
  for (const m of messages) {
    assert.equal(isChunkLoadFailure(new Error(m)), true, m);
  }
});

test("a plain string is accepted too — some events carry no Error", () => {
  assert.equal(isChunkLoadFailure("ChunkLoadError: Loading chunk 7 failed"), true);
});

test("a script tag that 404s gives no error object, only a URL", () => {
  assert.equal(
    isChunkLoadFailure(null, "https://app.primescalemedia.com/_next/static/chunks/8720.js"),
    true,
  );
  assert.equal(
    isChunkLoadFailure(undefined, "/_next/static/css/abc.css"),
    true,
  );
});

test("an ordinary runtime error must NOT trigger a reload", () => {
  // This is the whole risk: a reload throws away unsaved typing, so it
  // fires for one fault and no other.
  const ordinary = [
    new Error("Cannot read properties of undefined (reading 'id')"),
    new Error("Insufficient wallet balance"),
    new TypeError("x is not a function"),
    new Error("NetworkError when attempting to fetch resource."),
    new Error("Failed to fetch"),
  ];
  for (const e of ordinary) {
    assert.equal(isChunkLoadFailure(e), false, e.message);
  }
});

test("a failed image or API call is not a chunk", () => {
  assert.equal(isChunkLoadFailure(null, "https://app.primescalemedia.com/api/version"), false);
  assert.equal(isChunkLoadFailure(null, "/_next/image?url=x"), false);
  assert.equal(isChunkLoadFailure(null, null), false);
});

test("nothing at all is not a chunk failure", () => {
  assert.equal(isChunkLoadFailure(undefined), false);
  assert.equal(isChunkLoadFailure(null), false);
  assert.equal(isChunkLoadFailure(""), false);
  assert.equal(isChunkLoadFailure({}), false);
});

test("it reloads once, and only once", () => {
  assert.equal(
    shouldReloadForChunk({ alreadyReloaded: false, pageAgeMs: 60_000 }),
    true,
  );
  assert.equal(
    shouldReloadForChunk({ alreadyReloaded: true, pageAgeMs: 60_000 }),
    false,
  );
});

test("a chunk error in the first seconds is a flaky network, not a deploy", () => {
  assert.equal(
    shouldReloadForChunk({ alreadyReloaded: false, pageAgeMs: 1_000 }),
    false,
  );
  assert.equal(
    shouldReloadForChunk({
      alreadyReloaded: false,
      pageAgeMs: MIN_AGE_BEFORE_RELOAD_MS,
    }),
    true,
  );
});
