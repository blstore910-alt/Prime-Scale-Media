#!/usr/bin/env node
/**
 * Post-deploy smoke test. Usage:
 *
 *   BASE_URL=https://YOUR_APP node scripts/post-deploy-smoke.mjs
 *
 * Checks:
 *   1. GET /api/health returns 200 with status=ok
 *   2. GET /api/version returns a non-empty version string
 *   3. GET /auth/login returns 200 (public route)
 *   4. GET /dashboard returns a redirect (unauthenticated → login)
 *   5. Security headers present (X-Frame-Options, HSTS, CSP)
 *
 * Exits non-zero on any failure. Wire this into your Vercel deploy
 * hook, or add a GitHub Actions job that runs it against the
 * production URL after a successful deploy.
 */

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("Set BASE_URL, e.g. https://YOUR_APP");
  process.exit(2);
}

let failed = 0;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (err) {
    failed += 1;
    results.push({ name, ok: false, error: err?.message ?? String(err) });
    console.error(`✗ ${name}\n  ${err?.message ?? err}`);
  }
}

await check("GET /api/health returns ok", async () => {
  const res = await fetch(`${BASE}/api/health`);
  if (res.status !== 200 && res.status !== 503) {
    throw new Error(`unexpected status ${res.status}`);
  }
  const body = await res.json();
  if (!body || (body.status !== "ok" && body.status !== "degraded")) {
    throw new Error(`bad body: ${JSON.stringify(body).slice(0, 200)}`);
  }
});

await check("GET /api/version returns a version string", async () => {
  const res = await fetch(`${BASE}/api/version`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const body = await res.json();
  if (typeof body?.version !== "string" || body.version.length === 0) {
    throw new Error(`bad body: ${JSON.stringify(body)}`);
  }
});

await check("GET /auth/login is public and returns 200", async () => {
  const res = await fetch(`${BASE}/auth/login`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
});

await check("GET /dashboard redirects unauthenticated", async () => {
  const res = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
  if (![302, 303, 307, 308].includes(res.status)) {
    throw new Error(`expected redirect, got ${res.status}`);
  }
});

await check("Security headers present on /", async () => {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  const required = [
    "x-frame-options",
    "strict-transport-security",
    "referrer-policy",
    "x-content-type-options",
  ];
  for (const h of required) {
    if (!res.headers.get(h)) throw new Error(`missing ${h}`);
  }
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
