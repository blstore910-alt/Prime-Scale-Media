/**
 * Which columns of `ad_accounts` a CUSTOMER'S screen may ask for.
 *
 * WHY THIS IS NOT `*`. `ad_accounts.notes` is where an operator writes,
 * in account-details-sheet.tsx's own words, "things like a supplier
 * account number and the rate we pay for it" — and `metadata` has
 * carried supplier provenance. Both are admin-writable and neither is
 * ever rendered to a customer: the details sheet gates both behind
 * `!isAdvertiser`.
 *
 * But the gate was at the RENDER layer and the query still said `*`, so
 * every advertiser's own dashboard fetched them. They crossed the wire,
 * sat in the React Query cache, and were one network tab away. The
 * owner's rule is that the supplier's name and what we pay never reach a
 * customer surface — "not in the UI, not in an email, not on an invoice,
 * and not in the JSON behind the page". The JSON behind the page is
 * exactly what this was.
 *
 * `actions/gdpr-actions.ts` already excludes `ad_accounts.notes` from
 * the customer's own data export by name. This makes the live screens
 * agree with that.
 *
 * `supplier_fee_pct` is absent on purpose twice over: it is our cost,
 * and migration 20260914140000 moved it off this table into the
 * admin-only `ad_account_costs`, so naming it would also throw on any
 * database where that has been applied.
 */
export const AD_ACCOUNT_CUSTOMER_COLUMNS = [
  "id",
  "name",
  "bm_id",
  "currency",
  "fee",
  "fee_status",
  "advertiser_id",
  "platform",
  "airtable",
  "start_date",
  "created_at",
  "updated_at",
  "payment_status",
  "created_by",
  "status",
  "tenant_id",
  "timezone",
  "website_url",
  "min_topup",
].join(", ");

/**
 * The short list to fall back to when the full one is refused.
 *
 * The live database is hand-authored and diverges from both the repo
 * migrations and the generated types, so naming a column that is not
 * there yet does not degrade — PostgREST throws, and "column
 * ad_accounts.x does not exist" lands on whatever screen asked. A
 * customer has read one of those on their own dashboard before.
 *
 * So: ask for the full list, and on error ask for this one. Every field
 * here is load-bearing on the advertiser's own screens — without them
 * there is no card to draw — and none of them is ours rather than
 * theirs. What is NOT here is the safety property: falling back to `*`
 * would trade a broken screen for the leak this file exists to close.
 */
export const AD_ACCOUNT_CORE_COLUMNS = [
  "id",
  "name",
  "currency",
  "fee",
  "advertiser_id",
  "platform",
  "status",
  "tenant_id",
  "created_at",
  "min_topup",
].join(", ");
