import test from "node:test";
import assert from "node:assert/strict";
import { maskRateLimitKey } from "../../lib/pure-rate-limit-key.ts";

test("an IP address does not reach the screen", () => {
  const out = maskRateLimitKey("login:ip:203.0.113.44");
  assert.ok(out.startsWith("login:ip:"));
  assert.ok(!out.includes("203.0.113.44"));
  assert.ok(!out.includes("203"));
});

test("a user id does not reach the screen", () => {
  const uuid = "8bd9b91b-c07b-4aae-9bd5-2aff773ab082";
  const out = maskRateLimitKey(`financial-request:user:${uuid}`);
  assert.ok(out.startsWith("financial-request:user:"));
  assert.ok(!out.includes(uuid));
  assert.ok(!out.includes("8bd9b91b"));
});

test("the kind survives, because that is what the screen is for", () => {
  assert.ok(maskRateLimitKey("login:ip:1.2.3.4").startsWith("login:"));
  assert.ok(
    maskRateLimitKey("financial-request:user:x").startsWith(
      "financial-request:",
    ),
  );
});

test("two different identifiers stay visibly different", () => {
  const a = maskRateLimitKey("login:ip:203.0.113.44");
  const b = maskRateLimitKey("login:ip:203.0.113.45");
  assert.notEqual(a, b);
});

test("the same identifier is stable across refreshes", () => {
  assert.equal(
    maskRateLimitKey("login:ip:203.0.113.44"),
    maskRateLimitKey("login:ip:203.0.113.44"),
  );
});

test("an identifier containing colons is masked whole", () => {
  const out = maskRateLimitKey("login:ip:2001:db8::1");
  assert.ok(!out.includes("db8"));
  assert.ok(!out.includes("2001"));
});

test("a key that is not the usual shape is still not printed raw", () => {
  const out = maskRateLimitKey("something-odd-with-an-email@example.com");
  assert.ok(!out.includes("example.com"));
});

test("nothing in gives a dash, not 'undefined'", () => {
  assert.equal(maskRateLimitKey(null), "—");
  assert.equal(maskRateLimitKey(""), "—");
  assert.equal(maskRateLimitKey(undefined), "—");
});
