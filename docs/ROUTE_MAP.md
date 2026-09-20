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
`advertiser/wallet-section`, `wallet/wallet-view`,
`subscriptions/my-subscription-view`. Each looked maintained.
Two had received fixes that therefore never reached a user, and the last one
sat under two redirects that between them covered every role — so the page
imported it, which is why a grep for importers said it was alive.

**An importer is not a route.** Check that the page can actually render the
component before trusting that a fix in it matters.

## Regenerated 2026-09-20

Every `app/**/page.tsx` and `app/**/route.ts`, with the guard column
collected from the file AND from every `layout.tsx` above it — most guards
live in a layout, so reading only the page says "NONE" for screens that are
in fact owner-only. `/settings/*` is the clearest example: not one of its
six pages carries a guard, and `app/(app)/settings/layout.tsx` gates the
whole group behind `requireSuperAdmin`.

"NONE" in the table below therefore means no guard from these five helpers:
`requireSuperAdmin`, `requireAdmin`, `apiRequireAdmin`, `isCronAuthorised`,
`redirectCustomersToTheirShell`. Several API routes read NONE and are
nevertheless guarded — `/api/admins/create`, `/api/wallet-recovery`,
`/api/audit/export` and `/api/stats` each do their own `auth.getUser()` plus
an owner check. Verify before treating a NONE as a hole.

Eight routes were missing from the previous version of this file:
`/billing`, `/help`, `/referrals`, `/organization`, `/onboard`,
`/my-invites`, `/invite/*` and `/pwa`. And there is no `/system-status`
route at all — that panel lives inside `/dashboard`, behind a super-admin
`<details>`.

Regenerate with the walk in `docs/UNREACHABLE.md`, extended to collect
layout guards.

| route | guard (page + layouts) | rendered by |
| --- | --- | --- |
| `/account-pool` | requireAdmin | `account-pool/psm-account-pool` |
| `/accounts` | requireAdmin | `account/accounts-router` |
| `/activity-logs` | requireSuperAdmin + requireAdmin | `activity-logs/activity-logs-table` |
| `/ad-account-requests` | requireAdmin | `ad-account-requests/psm-requests` |
| `/admins` | requireSuperAdmin + requireAdmin | `admins/admins-table` |
| `/affiliates` | requireSuperAdmin + requireAdmin | `affiliate/affiliate-table` |
| `/audit` | requireSuperAdmin + requireAdmin | `audit/audit-events-table` |
| `/auth/error` | NONE | `ui/card` |
| `/auth/forgot-password` | NONE | `forgot-password-form` |
| `/auth/login` | NONE | `login-form` |
| `/auth/sign-up` | NONE | `invite-sign-up-form` |
| `/auth/sign-up-success` | NONE | `ui/card` |
| `/auth/update-password` | NONE | `update-password-form` |
| `/billing` | requireAdmin | `-` |
| `/commissions` | requireSuperAdmin + requireAdmin | `commissions/commissions-table` |
| `/complete-profile` | NONE | `company/company-onboarding-form` |
| `/dashboard` | requireAdmin | `admin/dashboard` |
| `/help` | redirectCustomersToTheirShell + requireAdmin | `-` |
| `/inactive` | NONE | `inactive/inactive-content` |
| `/invite/accept` | NONE | `invites/invite-accept` |
| `/invite/list` | NONE | `onboard/invites-list` |
| `/invites` | requireSuperAdmin + requireAdmin | `invites/invites-header` |
| `/invoices` | requireAdmin | `invoices/invoices-table` |
| `/manual` | requireAdmin | `admin/admin-manual` |
| `/my-invites` | NONE | `invites/invites-table` |
| `/my-referrals` | requireAdmin | `affiliate/aff-app` |
| `/my-subscription` | requireAdmin | `-` |
| `/notifications` | redirectCustomersToTheirShell + requireAdmin | `ad-account-requests/create-ad-account-from-request-dialog` |
| `/onboard` | NONE | `-` |
| `/organization` | NONE | `-` |
| `/organization/new` | NONE | `onboard/organization-form` |
| `/page.tsx` | NONE | `-` |
| `/profile` | redirectCustomersToTheirShell + requireAdmin | `ui/separator` |
| `/promotions` | requireSuperAdmin + requireAdmin | `promotions/psm-promotions` |
| `/pwa` | NONE | `-` |
| `/reconciliation` | requireSuperAdmin + requireAdmin | `reconciliation/reconciliation-view` |
| `/referrals` | requireAdmin | `-` |
| `/settings/ad-account-types` | requireSuperAdmin + requireAdmin | `settings/finance/ad-account-types` |
| `/settings/banks` | requireSuperAdmin + requireAdmin | `settings/finance/banks` |
| `/settings/finance` | requireSuperAdmin + requireAdmin | `settings/finance/exchange-rates` |
| `/settings/general` | requireSuperAdmin + requireAdmin | `settings/general` |
| `/settings/integrations` | requireSuperAdmin + requireAdmin | `settings/finance/integration-status` |
| `/settings/plans` | requireSuperAdmin + requireAdmin | `settings/finance/plans` |
| `/subscriptions` | requireAdmin | `subscriptions/psm-subscriptions` |
| `/top-ups` | requireAdmin | `topups/psm-verify-ad-topups` |
| `/users` | requireAdmin | `admin/users/psm-advertisers` |
| `/wallet` | requireAdmin | `-` |
| `/wallet-topups` | requireAdmin | `wallet-transactions/money-in-tabs` |
| `/wallets` | requireAdmin | `wallets/psm-wallets` |
| `/withdrawals` | requireAdmin | `withdrawals/psm-withdrawals` |

| API route | guard |
| --- | --- |
| `/api/accept-invite` | NONE |
| `/api/accept-invite/signup` | NONE |
| `/api/admins/create` | NONE |
| `/api/audit/export` | NONE |
| `/api/auth/sign-out` | NONE |
| `/api/cron/integration-jobs` | isCronAuthorised |
| `/api/cron/subscription-billing` | isCronAuthorised |
| `/api/health` | NONE |
| `/api/heartbeat` | NONE |
| `/api/invoices/[invoiceId]/pdf` | NONE |
| `/api/log/client-error` | NONE |
| `/api/me/export` | NONE |
| `/api/push/notify` | requireAdmin |
| `/api/push/subscribe` | NONE |
| `/api/send-invite` | apiRequireAdmin |
| `/api/stats` | NONE |
| `/api/stats/affiliate-commissions` | NONE |
| `/api/stats/batch` | NONE |
| `/api/stats/extra-ad-accounts` | apiRequireAdmin |
| `/api/stats/fees` | NONE |
| `/api/stats/profit` | NONE |
| `/api/stats/registrations` | apiRequireAdmin |
| `/api/stats/subscriptions` | apiRequireAdmin |
| `/api/stats/topups` | apiRequireAdmin |
| `/api/stats/wallet` | apiRequireAdmin |
| `/api/version` | NONE |
| `/api/wallet-recovery` | NONE |
| `/api/webhooks/wise` | NONE |
| `/api/webhooks/wise/[token]` | NONE |
| `/auth/confirm` | NONE |
