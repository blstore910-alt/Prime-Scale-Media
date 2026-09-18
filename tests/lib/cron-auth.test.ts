import test from "node:test";
import assert from "node:assert/strict";
import { isCronAuthorised } from "../../lib/cron-auth.ts";

/**
 * This is the only gate on `subscription_billing_run()` and the one-minute
 * integration worker — invoices raised and wallets auto-debited for every
 * advertiser in every tenant — and it had no test at all. Its siblings
 * (lib/permissions.ts, lib/pure-request.ts) both do. It is pure and
 * synchronous, so it is the cheapest test in the repo.
 *
 * `req` only ever needs `headers.get`, so a two-line stand-in is enough
 * and no Next.js request has to be constructed.
 */
const req = (authorization?: string) =>
  ({
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? (authorization ?? null) : null,
    },
  }) as never;

const withSecret = <T>(secret: string | undefined, fn: () => T): T => {
  const had = Object.prototype.hasOwnProperty.call(process.env, "CRON_SECRET");
  const before = process.env.CRON_SECRET;
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  try {
    return fn();
  } finally {
    if (had) process.env.CRON_SECRET = before;
    else delete process.env.CRON_SECRET;
  }
};

test("the right secret is authorised", () => {
  withSecret("s3cret-value", () => {
    assert.equal(isCronAuthorised(req("Bearer s3cret-value")), true);
  });
});

// THE WHOLE POINT. A missing secret means CLOSED, not open — the failure
// the previous gate had was that an unset control let everything through.
test("no CRON_SECRET means nobody is authorised", () => {
  withSecret(undefined, () => {
    assert.equal(isCronAuthorised(req("Bearer anything")), false);
    assert.equal(isCronAuthorised(req()), false);
  });
  withSecret("", () => {
    assert.equal(isCronAuthorised(req("Bearer ")), false);
  });
});

// The attack the previous version allowed, verbatim: a header whose mere
// presence was the authorisation.
test("a bare x-vercel-cron style header is not authorisation", () => {
  withSecret("s3cret-value", () => {
    assert.equal(isCronAuthorised(req("1")), false);
    assert.equal(isCronAuthorised(req("Bearer 1")), false);
    assert.equal(isCronAuthorised(req()), false);
  });
});

test("the scheme has to be there, and it has to be Bearer", () => {
  withSecret("s3cret-value", () => {
    assert.equal(isCronAuthorised(req("s3cret-value")), false);
    assert.equal(isCronAuthorised(req("Basic s3cret-value")), false);
    assert.equal(isCronAuthorised(req("bearer s3cret-value")), false);
  });
});

// timingSafeEqual THROWS on different lengths, and a throw is itself a
// side channel — the helper checks the length first and returns false.
// These are the cases that would surface a regression there.
test("wrong length and wrong content both answer no, never throw", () => {
  withSecret("s3cret-value", () => {
    assert.equal(isCronAuthorised(req("Bearer s3cret-valu")), false);
    assert.equal(isCronAuthorised(req("Bearer s3cret-valueX")), false);
    assert.equal(isCronAuthorised(req("Bearer S3CRET-VALUE")), false);
    assert.equal(isCronAuthorised(req("Bearer " + "x".repeat(5000))), false);
  });
});

// Whitespace is not forgiven: a secret pasted with a trailing newline in
// the Vercel UI produces a DIFFERENT secret, and silently accepting the
// trimmed form would mean two values authorise.
test("padding is not trimmed away", () => {
  withSecret("s3cret-value", () => {
    assert.equal(isCronAuthorised(req("Bearer s3cret-value ")), false);
    assert.equal(isCronAuthorised(req(" Bearer s3cret-value")), false);
    assert.equal(isCronAuthorised(req("Bearer s3cret-value\n")), false);
  });
});
