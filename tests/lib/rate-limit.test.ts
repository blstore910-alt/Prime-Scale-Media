import { test } from "node:test";
import { strict as assert } from "node:assert";
import { callerIp } from "../../lib/pure-request.ts";

test("callerIp prefers x-forwarded-for's first entry", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
  });
  assert.equal(callerIp(req), "1.2.3.4");
});

test("callerIp falls back to x-real-ip", () => {
  const req = new Request("https://example.com", {
    headers: { "x-real-ip": "9.9.9.9" },
  });
  assert.equal(callerIp(req), "9.9.9.9");
});

test("callerIp trims whitespace", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "  10.0.0.1  " },
  });
  assert.equal(callerIp(req), "10.0.0.1");
});

test("callerIp returns 'unknown' when no header present", () => {
  const req = new Request("https://example.com");
  assert.equal(callerIp(req), "unknown");
});

