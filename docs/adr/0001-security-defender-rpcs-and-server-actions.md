# ADR 0001 — Financial writes go through SECURITY DEFINER RPCs or server actions

**Date:** 2026-08-29
**Status:** Accepted

## Context

The security audit (see `docs/SECURITY_HARDENING_SUMMARY.md`) found that
the browser had `.insert`/`.update`/`.delete` access to every financial
table (`wallets`, `wallet_topups`, `top_ups`, `invoices`, `tenants`,
`exchange_rates`, and more). All that stood between a hostile client
and a broken balance was RLS — policies which lived only in the Supabase
project (not in the repo) and were unauditable from the codebase.

Two failure modes were concrete:
- Admin approve on `wallet_topups` accepted a client-supplied `amount`.
  A rogue admin could credit a wallet with a different amount than the
  advertiser requested.
- Advertiser topup insert took `wallet_id` from the browser. If RLS
  wasn't strict, an advertiser could point a topup at someone else's wallet.

## Decision

Every financial mutation now flows through **one** of these mechanisms:

1. **`SECURITY DEFINER` RPC in Supabase** — for anything money-touching.
   The function bypasses RLS (runs as the table owner), so it does its
   own auth + tenant + role check. The client can't pass the sensitive
   fields (wallet_id, tenant_id, amount, status), they're derived
   server-side.
2. **Next.js server action** — for admin CRUD where the operation
   maps cleanly to "admin of caller's tenant may update these columns
   on this row." The action enforces auth + role + tenant + a column
   allowlist. RLS is still active, but the server-side check is the
   primary gate.

Both mechanisms **fail closed** on unauthorized callers, never trust
the browser for tenant_id/actor identity, and are covered by the
`audit_events` trigger (see ADR-0002 if written).

Concrete mapping:

| Kind of mutation                          | Mechanism                | Example |
| ----------------------------------------- | ------------------------ | ------- |
| Financial (wallet, wallet_topup)          | RPC (SECURITY DEFINER)   | `wallet_topup_admin_verify`, `wallet_create_for_advertiser` |
| Admin CRUD (top_ups, invoices, subs, etc.)| Server action + allowlist | `createTopupAsAdmin`, `setInvoicePaidStatus` |
| User self-update (profile, own company)   | Server action, owner-check | `updateOwnProfileAndCompany` |
| Read paths                                | Direct with RLS          | (tables gated by SELECT policies) |

## Consequences

- **Positive:** The client has no way to spoof tenant_id / actor / amount
  even if RLS is misconfigured. The security posture is now visible in
  the code, not just in the Supabase dashboard.
- **Positive:** All writes are auditable in `audit_events` — the trigger
  runs regardless of the entry point.
- **Positive:** Column allowlists are enforced in one place per table.
- **Negative:** Some routes went from 1 round-trip to 2 (client → server
  action → DB). Latency ~15-40ms extra. Acceptable given the risk it
  removes.
- **Negative:** Bulk operations need a bespoke action (see
  `bulkCreateTopupsAsAdmin`) instead of a plain `.insert([...])`.
- **Rejected alternative:** Rely purely on RLS. Rejected because RLS
  policies weren't in the repo, weren't testable from code, and one
  misconfigured policy is enough to break everything.
- **Rejected alternative:** Move all writes to RPCs. Rejected because
  SQL RPCs for tables with 15+ columns are painful to maintain; server
  actions with allowlists are easier to evolve.

## References

- `docs/SECURITY_HARDENING_SUMMARY.md` — full commit-by-commit rundown
- `supabase/migrations/20260828120000_wallet_rpcs.sql` — RPCs
- `supabase/migrations/20260828140000_rls_templates.sql` — RLS baseline
- `actions/*.ts` — server actions
