# ADR 0003 — Optimistic concurrency + local form drafts

Status: accepted (2026-08-30)

## Context

Two failure modes surfaced during the bol-app data-integrity review
that our repo also had:

1. **Silent "last write wins"** when two admins edit the same record
   in different tabs. The second save overwrites the first without
   warning, so a legitimate change disappears.
2. **Dataloss on long forms** when the browser crashes, the user
   accidentally navigates away, or the laptop closes. Typed input
   evaporates because everything lived in React state.

We wanted a fix that:

- Doesn't require a database schema migration to become effective
  (so existing rows work as-is).
- Doesn't require every mutation path to be rewritten in lockstep.
- Fails safe — a bug in the fix cannot cause silent data loss.
- Explains itself to the user rather than throwing a stack trace.

## Decision

**Optimistic concurrency guards**

Every admin update action accepts an optional `ifUpdatedAt: string`
parameter. Inside the action we re-fetch the target row and compare
`existing.updated_at` against `ifUpdatedAt` via `versionMatches` in
`actions/_shared.ts`. If they differ, the action returns
`{ok: false, code: "conflict", error: "…was updated by someone else"}`.
The client re-fetches and shows the user the new value.

If the caller passes `undefined`, the check is skipped —
opt-in. This lets us wire the UI over time without breaking
existing callers.

A separate migration (`20260829140000_updated_at_triggers.sql`)
attaches a `BEFORE UPDATE` trigger to every business table that has
an `updated_at` column, so no future update can "forget" to bump
the timestamp and cause a silent false-negative.

**IndexedDB form drafts**

`lib/form-draft.ts` + `hooks/use-form-draft.ts` auto-save the values
of a long form to IDB (7-day TTL, `profile.id` scope). On form
mount, if a draft exists, the UI renders a "Unsaved changes from
earlier — Restore?" banner. On successful submit, the draft clears.

Combined with `hooks/use-unsaved-changes-warning.ts` (a
`beforeunload` handler that fires the browser's built-in "leave
this page?" dialog), the user has three layers:
1. Browser dialog blocks accidental close
2. IDB draft on next visit
3. Server-side fallback for any partial write that made it through

Wired into:
- `company-onboarding-form`
- `account-form`
- `ad-account-request-form`
- `wallet-topup-dialog` (multi-step; also persists step + accountType)

## Consequences

**Positive**
- Impossible to blindly overwrite another admin's edit — the second
  save fails closed with a clear message.
- Impossible to lose more than a few keystrokes of typing — even
  a browser crash surfaces the draft on next visit.
- Everything is verifiable via `audit_events` (the wallet-recovery
  arithmetic in ADR 0002 depends on this too).
- 9 unit tests on the pure arithmetic; test coverage is at 92 tests.

**Negative**
- Adds a `select … updated_at` before every update. Cost is a single
  indexed lookup — negligible vs the network round-trip.
- IDB drafts live only on the device that typed them. NOT synced.
  This is intentional — sync would need conflict resolution of its
  own and would defeat the point.
- The optimistic-concurrency check is opt-in per callsite; callers
  that haven't migrated silently skip. Migration is happening
  gradually as we touch each form.

## Alternatives considered

- **Row-version columns (`row_version bigint`)** instead of
  `updated_at`. Cleaner semantics but requires a schema migration on
  every business table and doesn't reuse the trigger we already
  have. Ruled out for the marginal win.
- **DB-side advisory locks** for the multi-admin case. Overkill for
  the ~10-second window an admin has a form open, and adds a
  connection-pool concern.
- **localStorage** instead of IDB for drafts. Rejected — quota is
  smaller, storage is synchronous (blocks main thread), and
  doesn't support the object-store keyed access we get from IDB.

## References

- `actions/_shared.ts` — `versionMatches`, `maintenanceGuard`,
  `resolveAdminContext`
- `lib/form-draft.ts` — IDB persistence layer
- `hooks/use-form-draft.ts` — React wrapper
- `hooks/use-unsaved-changes-warning.ts` — beforeunload guard
- `supabase/migrations/20260829140000_updated_at_triggers.sql`
- `docs/DATA_INTEGRITY_LESSONS.md` — the bol-app cross-reference
  that motivated all of this
- ADR 0001 — SECURITY DEFINER RPCs + server actions
- ADR 0002 — Immutable audit log
