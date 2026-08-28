-- =====================================================================
-- Immutable audit log
-- =====================================================================
-- Every INSERT / UPDATE / DELETE on financial tables leaves a row in
-- audit_events. Rows here can only be inserted — never updated or
-- deleted, not even by the service role (see policy below and the
-- REVOKE that hides UPDATE/DELETE from the DB layer entirely).
--
-- If you ever need to rebuild a wallet balance, revive a lost invoice,
-- or answer "who changed this?" — this is where you look.
-- =====================================================================

set search_path = public;

create table if not exists public.audit_events (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  actor_user_id uuid,                    -- auth.uid() at time of change
  actor_profile_id uuid,                 -- best-effort profile.id from JWT
  tenant_id    uuid,                     -- copied from row when possible
  table_name   text not null,
  action       text not null check (action in ('INSERT','UPDATE','DELETE')),
  row_id       text,                     -- primary key of affected row
  before_data  jsonb,                    -- OLD row (null for INSERT)
  after_data   jsonb                     -- NEW row (null for DELETE)
);

create index if not exists audit_events_occurred_at_idx
  on public.audit_events (occurred_at desc);
create index if not exists audit_events_tenant_time_idx
  on public.audit_events (tenant_id, occurred_at desc);
create index if not exists audit_events_table_row_idx
  on public.audit_events (table_name, row_id);

-- Lock the table down: nobody can UPDATE or DELETE, ever.
-- INSERTs only happen via the trigger below (which runs SECURITY DEFINER).
alter table public.audit_events enable row level security;

drop policy if exists audit_events_no_select_anon on public.audit_events;
create policy audit_events_no_select_anon
  on public.audit_events for select
  using (
    -- Only admins of the row's tenant may read.
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and up.tenant_id = audit_events.tenant_id
    )
  );

-- Explicitly refuse INSERT/UPDATE/DELETE from application code. The
-- trigger below bypasses this because it runs SECURITY DEFINER as the
-- table owner.
drop policy if exists audit_events_no_writes on public.audit_events;
create policy audit_events_no_writes
  on public.audit_events for all
  using (false)
  with check (false);

revoke insert, update, delete on public.audit_events from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------
create or replace function public._audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_tenant_id uuid;
  v_row_id text;
begin
  -- Best-effort actor profile lookup.
  if v_uid is not null then
    select id, tenant_id into v_profile_id, v_tenant_id
      from public.user_profiles
     where user_id = v_uid
     order by created_at asc
     limit 1;
  end if;

  -- Prefer the row's own tenant_id when present.
  if tg_op = 'DELETE' then
    v_tenant_id := coalesce((to_jsonb(old) ->> 'tenant_id')::uuid, v_tenant_id);
    v_row_id := coalesce((to_jsonb(old) ->> 'id'), null);
  else
    v_tenant_id := coalesce((to_jsonb(new) ->> 'tenant_id')::uuid, v_tenant_id);
    v_row_id := coalesce((to_jsonb(new) ->> 'id'), null);
  end if;

  insert into public.audit_events (
    actor_user_id,
    actor_profile_id,
    tenant_id,
    table_name,
    action,
    row_id,
    before_data,
    after_data
  ) values (
    v_uid,
    v_profile_id,
    v_tenant_id,
    tg_table_name,
    tg_op,
    v_row_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- Attach the trigger to every financial-sensitive table.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  audited constant text[] := array[
    'wallets',
    'wallet_topups',
    'top_ups',
    'topup_logs',
    'invoices',
    'companies',
    'billings',
    'subscriptions',
    'exchange_rates',
    'referral_commissions',
    'referral_links',
    'ad_accounts',
    'ad_account_requests',
    'advertisers',
    'affiliates',
    'user_profiles',
    'tenants',
    'invitations'
  ];
begin
  foreach t in array audited loop
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'drop trigger if exists trg_audit_%1$I on public.%1$I;
         create trigger trg_audit_%1$I
           after insert or update or delete on public.%1$I
           for each row execute function public._audit_row_change();',
        t
      );
    end if;
  end loop;
end;
$$;
