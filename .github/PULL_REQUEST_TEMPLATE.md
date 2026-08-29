<!--
Fill in the section that matches best. Delete the others.

Before merging, verify the security check-list at the bottom.
-->

## What

<!-- One paragraph: what does this PR change, and why? -->

## Bug fix / feature / refactor / docs

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor / cleanup
- [ ] Docs / infra only

## Security check-list

- [ ] Any new mutation on a business table (wallets, top_ups,
      invoices, subscriptions, etc.) goes through a server action or
      SECURITY DEFINER RPC — never a direct `.from('...').insert/update`
      from a client component.
- [ ] Any new API route validates its body with Zod.
- [ ] Any new API route that mutates state calls `apiRequireAdmin()`
      (or an equivalent auth guard) and applies rate limiting where
      relevant.
- [ ] Any new sensitive field (passwords, tokens, secrets) is not
      logged as-is — use `safeErrorMessage()` for error logging.
- [ ] If this PR touches auth flows, the `docs/TEST_PLAN.md` section
      relevant to the flow has been re-verified locally.
- [ ] If this PR adds a new financial table, the `audit_events`
      trigger has been extended to cover it.

## SQL migrations

- [ ] No new migrations
- [ ] Added `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql` and
      deployed to staging first

## Testing

<!-- How did you test this? Manual steps, `npm test` output, etc. -->

## Screenshots

<!-- If UI changed -->
