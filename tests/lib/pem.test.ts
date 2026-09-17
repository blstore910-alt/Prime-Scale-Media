import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createSign, generateKeyPairSync } from "node:crypto";

import { normalizePem } from "../../lib/integrations/pem";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const GOOD = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** The point of the helper: whatever came back must actually sign. */
function signsWith(pem: string | null): boolean {
  if (!pem) return false;
  try {
    const s = createSign("RSA-SHA256");
    s.update("challenge-token");
    s.end();
    return s.sign(pem, "base64").length > 0;
  } catch {
    return false;
  }
}

test("a well-formed key passes through and still signs", () => {
  const out = normalizePem(GOOD);
  assert.ok(out);
  assert.ok(signsWith(out));
});

test("literal backslash-n — a .env line, a JSON value, most CI forms", () => {
  const mangled = GOOD.replace(/\n/g, "\n");
  assert.ok(signsWith(normalizePem(mangled)));
});

test("every newline collapsed to a space — a single-line form field", () => {
  // This is the case that produced "key unusable" on a real deployment.
  const mangled = GOOD.replace(/\n/g, " ");
  assert.ok(signsWith(normalizePem(mangled)));
});

test("newlines removed entirely", () => {
  const mangled = GOOD.replace(/\n/g, "");
  assert.ok(signsWith(normalizePem(mangled)));
});

test("CRLF, from Notepad on Windows", () => {
  const mangled = GOOD.replace(/\n/g, "\r\n");
  assert.ok(signsWith(normalizePem(mangled)));
});

test("wrapped in the quotes its .env line had", () => {
  assert.ok(signsWith(normalizePem(`"${GOOD.replace(/\n/g, "\n")}"`)));
});

test("no key in the string is null, not a broken key", () => {
  assert.equal(normalizePem(""), null);
  assert.equal(normalizePem(null), null);
  assert.equal(normalizePem("hello"), null);
  assert.equal(normalizePem("-----BEGIN PRIVATE KEY-----"), null);
  // Header and footer with nothing in between.
  assert.equal(
    normalizePem("-----BEGIN PRIVATE KEY-----\n\n-----END PRIVATE KEY-----"),
    null,
  );
});

test("a PUBLIC key is not accepted as a private one", () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.equal(normalizePem(pub), null);
});
