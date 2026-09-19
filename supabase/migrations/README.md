# Supabase migrations — P0 security RPCs

These migrations add `SECURITY DEFINER` RPCs that move the last
client-writable financial mutations off the anon key. They match the
audit's P0 remaining-work list.

## Deployment

The migrations follow Supabase's `YYYYMMDDHHMMSS_description.sql`
naming convention. Deploy with either:

```bash
supabase db push
```

or apply each file manually via the Supabase SQL editor in this order:

1. `20260828120000_wallet_rpcs.sql` — wallet + wallet_topups (advertiser
   create, admin verify/reject/undo)
2. `20260828130000_top_up_admin_rpcs.sql` — admin-side top_ups mutations
3. `20260828140000_invoice_rpcs.sql` — invoice create + mark paid
4. `20260828150000_tenant_rpc.sql` — atomic tenant self-create

## Schema assumptions

The RPCs were written by reading how the client currently calls into
these tables (audit report, section 3 & 6). Before deployment, verify
the column names below exist with the expected types. If any differ,
adjust the RPC bodies — the auth/tenant checks are the parts that
matter for security; the field mapping is mechanical.

| Table              | Columns the RPCs touch                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `advertisers`      | `id`, `tenant_id`, `user_id`, `profile_id`                                                                                |
| `user_profiles`    | `id`, `user_id`, `tenant_id`, `role`                                                                                      |
| `wallets`          | `id`, `advertiser_id`, `tenant_id`, `reference_no`, `usd_balance`, `eur_balance`, `min_topup`, `updated_at`               |
| `wallet_topups`    | `id`, `wallet_id`, `advertiser_id`, `tenant_id`, `currency`, `amount`, `status`, `created_by`, `reference_no`, `payment_slip`, `approved_by`, `rejection_reason`, `updated_at`, `created_at` |
| `top_ups`          | `id`, `advertiser_id`, `tenant_id`, `ad_account_id`, `amount`, `fee`, `topup_amount`, `currency`, `status`, `type`, `source`, `author`, `note`, `created_at`, `updated_at` |
| `topup_logs`       | `id`, `top_up_id`, `action`, `updated_by`, `created_at`                                                                   |
| `invoices`         | `id`, `tenant_id`, `advertiser_id`, `company_id`, `number`, `type`, `currency`, `total`, `items`, `status`, `paid_at`, `created_at` |
| `tenants`          | `id`, `slug`, `name`, `initials`, `owner_id`, `last_client_code`                                                          |

## Balance-crediting behaviour

The wallet-verify/reject/undo RPCs **assume that a database trigger
already updates `wallets.usd_balance` / `eur_balance` when
`wallet_topups.status` transitions to `completed` and reverses it when
it moves back to `pending` / `rejected`.**

If no such trigger exists today (i.e. the balance is currently updated
by client code we haven't found), the trigger needs to be added
alongside these RPCs. A stub is provided at the bottom of
`20260828120000_wallet_rpcs.sql` — enable it if you don't already have
one.

## Client rewrite

The client-side changes that call these RPCs land in the same commit
that adds the migration files. Deploy the SQL BEFORE deploying the
new frontend, or the affected UI flows will fail closed with
"function does not exist".

## ⚠️ Niet alles staat in deze map

Een aantal fixes is alleen als los bestand in `supabase/checks/`
geschreven en nooit een genummerde migratie geworden — dus wie "plak de
migraties" doet, slaat ze over. Ze zijn allemaal gebundeld in:

    supabase/checks/ALLES-IN-1-V2.sql

Veilig om twee keer te draaien. Daarin zitten onder meer: row-level
security op `logs` en `wallet_exchanges` (die hadden nergens een policy),
`security_invoker` op de drie views die anders als eigenaar draaien,
het intrekken van `rate_limit_check` bij `anon`, en het versmallen van
`get_invite_by_token`. Zolang die niet gedraaid is, is de database niet
in de staat die deze map beschrijft.

Daarnaast, alleen bij een incident en nooit zomaar:
`supabase/checks/FREEZE-MONEY.sql` en `UNFREEZE-MONEY.sql` — zie
`docs/RUNBOOK.md`.
