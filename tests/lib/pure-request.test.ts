import { test } from "node:test";
import assert from "node:assert/strict";
import { callerIp } from "../../lib/pure-request.ts";

function reqWith(headers: Record<string, string>) {
  return {
    headers: new Headers(headers),
  };
}

test("callerIp — uses x-forwarded-for first", () => {
  const req = reqWith({ "x-forwarded-for": "203.0.113.10" });
  assert.equal(callerIp(req), "203.0.113.10");
});

test("callerIp — takes the first IP when x-forwarded-for is a chain", () => {
  const req = reqWith({
    "x-forwarded-for": "203.0.113.10, 10.0.0.1, 172.16.0.1",
  });
  assert.equal(callerIp(req), "203.0.113.10");
});

test("callerIp — trims whitespace from x-forwarded-for", () => {
  const req = reqWith({ "x-forwarded-for": "  198.51.100.1  " });
  assert.equal(callerIp(req), "198.51.100.1");
});

test("callerIp — falls back to x-real-ip when x-forwarded-for absent", () => {
  const req = reqWith({ "x-real-ip": "192.0.2.5" });
  assert.equal(callerIp(req), "192.0.2.5");
});

test("callerIp — returns 'unknown' when both headers missing", () => {
  const req = reqWith({});
  assert.equal(callerIp(req), "unknown");
});

test("callerIp — prefers x-forwarded-for over x-real-ip", () => {
  const req = reqWith({
    "x-forwarded-for": "203.0.113.20",
    "x-real-ip": "192.0.2.5",
  });
  assert.equal(callerIp(req), "203.0.113.20");
});
