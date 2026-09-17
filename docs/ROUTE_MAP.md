# Which file actually renders each screen

Generated from `app/**/page.tsx`. **Check this before editing a view.**

Twice now, work has gone into a ported component that no route imports —
`components/invoices/psm-invoices-view.tsx` looked like the admin invoices
screen, compiled, and was carefully maintained, while `/invoices` renders
`components/invoices/invoices-table.tsx`. A fix applied there (the
client-code-prefixed invoice number) never reached a user, and the live
screen kept contradicting the PDF filename beside it.

A file being named `psm-*` does NOT mean it is the live mockup view. Some
ports landed; some did not.

Deleted so far for being unreachable: `invoices/psm-invoices-view`,
`advertiser/psm-shell`, `advertiser/dashboard-view`,
`advertiser/wallet-section`, `wallet/wallet-view`. Each looked maintained.
Two had received fixes that therefore never reached a user, and the last one
sat under two redirects that between them covered every role — so the page
imported it, which is why a grep for importers said it was alive.

**An importer is not a route.** Check that the page can actually render the
component before trusting that a fix in it matters.

| route | renders |
|---|---|
| `/dashboard` | `admin/dashboard` (admin) · `advertiser/dashboard` → `advertiser/adv-app` |
| `/users` | `admin/users/psm-advertisers` |
| `/accounts` | `account/accounts-router` → `account/accounts-table` |
| `/account-pool` | `account-pool/psm-account-pool` |
| `/ad-account-requests` | `ad-account-requests/psm-requests` |
| `/wallet-topups` | `wallet-transactions/psm-verify-topups` + `wise/wise-review-panel` |
| `/top-ups` | `topups/psm-verify-ad-topups` |
| `/wallets` | `wallets/psm-wallets` |
| `/withdrawals` | `withdrawals/psm-withdrawals` |
| `/invoices` | `invoices/invoices-table` — **not** a `psm-*` file |
| `/subscriptions` | `subscriptions/psm-subscriptions` |
| `/promotions` | `promotions/psm-promotions` |
| `/admins` | `admins/admins-table` |
| `/affiliates` | `affiliate/affiliate-table` |
| `/commissions` | `commissions/commissions-table` |
| `/invites` | `invites/invites-header` + `invites/invites-table` |
| `/activity-logs` | `activity-logs/activity-logs-table` |
| `/audit` | `audit/audit-events-table` |
| `/reconciliation` | `reconciliation/reconciliation-view` |
| `/manual` | `admin/admin-manual` |
| `/settings/finance` | `settings/finance/exchange-rates` |
| `/settings/banks` | `settings/finance/banks` |
| `/settings/plans` | `settings/finance/plans` |
| `/settings/ad-account-types` | `settings/finance/ad-account-types` |
| `/settings/integrations` | `settings/finance/integration-status` |
| `/settings/general` | `settings/general` |
| `/my-referrals` | `affiliate/aff-app` |
| `/my-subscription` | `subscriptions/my-subscription-view` |
| `/wallet` | redirect only — advertisers to `/dashboard`, everyone else to `/wallets` |
| `/profile` | `profile/profile-form` + `profile/privacy-controls` + `profile/my-activity` |
| `/notifications` | `notifications/*` |
| `/complete-profile` | `company/company-onboarding-form` |

Shells: the admin shell is `components/admin/adm-shell.tsx`; the advertiser
and affiliate single-page apps carry their own. All three inject
`components/advertiser/psm-shell-css.ts` (or the `adv-`/`aff-` variants) plus
`components/advertiser/refine-css.ts`.

To regenerate:

```bash
for p in $(find app -name "page.tsx" | sort); do r=$(echo "$p" | sed 's|app/||; s|/page.tsx||; s|([a-z-]*)/||g'); c=$(grep -o 'from "@/components/[^"]*"' "$p" | sed 's|from "@/components/||; s|"||' | tr '\n' ' '); echo "$r  ->  $c"; done
```
