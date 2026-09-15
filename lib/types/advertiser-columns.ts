/**
 * The columns of `advertisers` that a CUSTOMER may see.
 *
 * `advertisers(*)` was embedded in the profile read that every advertiser and
 * affiliate performs on their own session. The row carries the commission
 * terms we owe an affiliate for having referred them — commission_type,
 * commission_pct, commission_onetime, commission_monthly, commission_currency
 * — which is our arrangement with a third party, about them, and none of
 * their business. It never rendered anywhere; it was simply in the JSON.
 *
 * Fixing that by "remembering not to select *" is not a boundary. This
 * constant is, as long as customer-facing reads use it: adding a column to
 * `advertisers` cannot leak it, because a new column is not in this list.
 *
 * Admin screens keep using `*` deliberately — the commission terms are
 * exactly what an admin is there to manage.
 *
 * NOTE: PostgREST's TypeScript inference only reads a LITERAL select string,
 * so the call sites spell the list out instead of interpolating this
 * constant — a template literal degrades every embedded field to `any`, or
 * worse, to a ParserError that fails the build. This file is therefore the
 * documentation and the checklist; it is not the mechanism. If you add a
 * customer-facing read of `advertisers`, copy the list, do not use `*`.
 */
export const ADVERTISER_CUSTOMER_COLUMNS = [
  "id",
  "user_id",
  "tenant_id",
  "profile_id",
  "tenant_client_code",
  "startup_fee",
  "fee_status",
  "airtable",
  "created_at",
  "updated_at",
].join(", ");

/** Ready to drop into a PostgREST embed: `advertiser:advertisers(<cols>)`. */
export const ADVERTISER_CUSTOMER_EMBED = `advertiser:advertisers(${ADVERTISER_CUSTOMER_COLUMNS})`;
