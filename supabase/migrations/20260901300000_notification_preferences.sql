-- notification_preferences + integration-failure alerts
--
-- Two things ship together here:
--
--   1. Per-user push preferences. A user (any role) chooses which
--      notification TYPES ping their device. Absence of a row = enabled
--      (opt-out model), so existing users keep getting everything until
--      they mute something. Only push DELIVERY is affected — the in-app
--      notification row is still written, so nothing is silently lost.
--
--   2. When an external integration/connection fails, every admin in the
--      tenant gets a notification. The super-admin is just the admin who
--      owns the tenant (tenants.owner_id), so role='admin' already covers
--      both tiers — see lib/permissions.ts. A DB trigger on
--      integration_jobs raises it, so the alert fires no matter which
--      code path marked the job failed. Manual fallback is always
--      available, so an alert never blocks operations.

-- ─────────────────────────────────────────────────────────────
-- 1) notification_preferences
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

alter table public.notification_preferences enable row level security;

-- Self-service: a user reads and writes only their own preference rows.
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own
  on public.notification_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Keep updated_at fresh on edits (the column has a default for inserts).
drop trigger if exists trg_touch_notification_preferences
  on public.notification_preferences;
create trigger trg_touch_notification_preferences
  before update on public.notification_preferences
  for each row execute function public._touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2) raise_integration_failure(tenant, source, detail)
--    Inserts one notification per admin of the tenant. Throttled so a
--    flapping integration doesn't spam: skip if an unread
--    integration_failure for the same source was raised in the last
--    hour. SECURITY DEFINER because it writes notifications for OTHER
--    users; safe because it only ever targets admins of the given
--    tenant and writes a fixed, non-caller-controlled shape.
-- ─────────────────────────────────────────────────────────────
create or replace function public.raise_integration_failure(
  p_tenant_id uuid,
  p_source text,
  p_detail text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent int;
begin
  if p_tenant_id is null then
    return;
  end if;

  select count(*) into v_recent
  from public.notifications n
  where n.tenant_id = p_tenant_id
    and n.type = 'integration_failure'
    and coalesce(n.is_read, false) = false
    and n.created_at > now() - interval '1 hour'
    and coalesce(n.payload->>'source', '') = coalesce(p_source, '');

  if v_recent > 0 then
    return;
  end if;

  insert into public.notifications (recipient_user_id, tenant_id, type, payload, is_read)
  select up.user_id,
         p_tenant_id,
         'integration_failure',
         jsonb_build_object(
           'source', coalesce(p_source, 'integration'),
           'detail', left(coalesce(p_detail, ''), 500)
         ),
         false
  from public.user_profiles up
  where up.tenant_id = p_tenant_id
    and up.role = 'admin'
    and up.user_id is not null;
end;
$$;

revoke all on function public.raise_integration_failure(uuid, text, text) from public;

-- ─────────────────────────────────────────────────────────────
-- 3) Trigger: fire the alert when a job transitions to 'failed'.
--    Wrapped so a notification-schema hiccup can NEVER roll back the
--    job's own state transition — the worker must always be able to
--    record a failure.
-- ─────────────────────────────────────────────────────────────
create or replace function public._alert_on_integration_job_failed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'failed'
     and coalesce(old.status, '') is distinct from 'failed' then
    begin
      perform public.raise_integration_failure(
        new.tenant_id,
        new.provider,
        coalesce(new.last_error, 'Integration job failed')
      );
    exception when others then
      -- Alerting is best-effort; never break the job state machine.
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_alert_integration_job_failed on public.integration_jobs;
create trigger trg_alert_integration_job_failed
  after update of status on public.integration_jobs
  for each row execute function public._alert_on_integration_job_failed();
