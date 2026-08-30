# Deployment guide — Prime Scale Media App

Step-by-step from a fresh clone to a running production instance.
Aimed at whoever is doing the deploy — probably you, once. Later
you re-read this when something feels off.

## 0. Prereqs

- Supabase project (Pro plan for PITR + pg_cron)
- Vercel account (or any Next.js-capable host)
- Domain (optional but recommended for HSTS to matter)
- Brevo or Resend account for transactional email
- Web Push VAPID key pair (generate via `npx web-push generate-vapid-keys`)
- An off-site bucket for daily snapshots (S3 / R2 / GCS)

## 1. Env variables

Fill `.env.local` locally, and add the same set to Vercel Project
Settings → Environment Variables (mark all as Production +
Preview).

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…        # SERVER only, NEVER prefix with NEXT_PUBLIC
BREVO_SMTP_USER=…                  # or use RESEND_API_KEY instead
BREVO_SMTP_PASS=…
FROM_EMAIL=…
RESEND_API_KEY=…                   # optional if using Brevo
NEXT_PUBLIC_APP_URL=https://YOUR_APP.example.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…                # server only
VAPID_SUBJECT=mailto:you@example.com
PUSH_WEBHOOK_SECRET=…              # any strong random string; used by Supabase webhook
MAINTENANCE_MODE=                  # leave blank; set to "true" during incidents
```

Verify locally:

```bash
npm run check-env
```

## 2. Supabase migrations

Deploy the 8 files in `supabase/migrations/` in order. Two options:

**Option A — CLI (recommended):**

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

**Option B — Dashboard:** open each `.sql` file in the Supabase
SQL Editor and run in order:

1. `20260828120000_wallet_rpcs.sql`
2. `20260828130000_audit_events.sql`
3. `20260828140000_rls_templates.sql` (review first! see docs/TEST_PLAN.md sec 0.2)
4. `20260828150000_rate_limits.sql`
5. `20260829120000_scheduled_maintenance.sql` (needs `pg_cron` extension)
6. `20260829130000_session_activity.sql`
7. `20260829140000_updated_at_triggers.sql`
8. `20260830120000_perf_indexes.sql`

**Verify:**

```sql
select count(*) from pg_proc where proname like 'wallet_%';   -- expect >= 5
select count(*) from pg_trigger where tgname like 'trg_audit_%'; -- expect ~17
select count(*) from cron.job where jobname like 'psm-%';      -- expect 2 if pg_cron enabled
```

## 3. Supabase webhook

Notifications table → webhook → `/api/push/notify`.

1. Supabase → Database → Webhooks → Create.
2. Table: `notifications`. Events: INSERT.
3. URL: `https://YOUR_APP/api/push/notify`.
4. HTTP headers: `x-push-secret: <PUSH_WEBHOOK_SECRET>`.
5. Save.

Test: insert a row into `notifications` manually; watch Vercel logs
for `push/notify` success.

## 4. Supabase Storage

Bucket for payment slips:

1. Storage → Buckets → New Bucket.
2. Name: `wallet_payment_slips`.
3. Public: NO. Set policy: authenticated users can upload to path
   `wallet-topups/{advertiser_id}/…`. See RLS templates for the
   Storage policy template.

## 5. Point-in-time recovery

Supabase Dashboard → Project Settings → Database → Point-in-time
recovery → enable. Retention: 7-30 days.

## 6. Off-site daily snapshot

See `docs/BACKUP_AND_RECOVERY.md` "Laag 3" for the Edge Function
skeleton. Schedule with Supabase Cron at 03:00 UTC.

## 7. Vercel

- Connect the GitHub repo.
- Root directory: leave default.
- Build command: `npm run build`.
- Output directory: leave default.
- Environment variables: paste from step 1.
- Deploy.

## 8. Custom domain

Vercel → Project → Settings → Domains → Add. Follow the DNS
instructions. HSTS is already enabled via `next.config.ts` so use
a domain you own permanently (HSTS survives cache clears on the
client).

## 9. First run

1. Open `https://YOUR_APP`.
2. Sign up as the super-admin (this becomes tenant owner in step 10).
3. Verify email.
4. Land on `/onboard` → create the tenant.
5. `/audit` should show your first audit_events rows for the tenant
   creation.

## 10. Post-deploy smoke test

```bash
BASE_URL=https://YOUR_APP npm run smoke
```

Expected: all 5 checks pass.

## 11. Test plan

Walk `docs/TEST_PLAN.md`. Sections 0.2 (RLS matrix) and 3.3
(tenant isolation) are the two you MUST NOT skip.

## 12. Sign-off

Update `docs/SECURITY_HARDENING_SUMMARY.md` sign-off section with
your name + date once you've verified the checklist.

## Rollback

Vercel → Deployments → previous good deploy → Promote. Postgres
data is untouched. If a migration went bad, restore via PITR to
a moment just before you deployed it.

## Common gotchas

- **Build fails on `/organization/new` prerender:** you forgot to
  paste `NEXT_PUBLIC_SUPABASE_*` env into Vercel. Add them, redeploy.
- **`/api/push/notify` returns 500:** VAPID_SUBJECT env is missing
  or not `mailto:…` format.
- **`/api/version` returns "dev":** `VERCEL_GIT_COMMIT_SHA` isn't
  populated. On Vercel this is auto; elsewhere set `GIT_SHA` in
  the build.
- **First admin can't get to `/dashboard`:** they finished signup
  before you created the tenant. Have them refresh; the layout
  will redirect them to `/onboard`.
- **Audit log is empty after 5 minutes:** trigger didn't attach.
  Re-run migration 2 in the Supabase SQL editor and check
  `select tgname from pg_trigger where tgname like 'trg_audit_%'`.
