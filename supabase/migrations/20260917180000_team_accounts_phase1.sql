-- =====================================================================
-- Team accounts — PHASE 1: the membership table and nothing else
-- =====================================================================
-- Several people on one advertiser, and on one affiliate, with fewer
-- rights. Design: docs/TEAM_ACCOUNTS.md.
--
-- ⚠️ APPLY ON SUPABASE MANUALLY. Read this header first.
--
-- WHAT THIS PHASE CHANGES ABOUT THE APP'S BEHAVIOUR: NOTHING.
--
-- That is the point of splitting it out. It creates two tables, two helper
-- functions and a backfill. It does not touch a single existing policy, so
-- every read and write in the app keeps resolving ownership exactly the way
-- it does today (advertisers.user_id = auth.uid() and the affiliate
-- equivalent). Nothing can start leaking, because nothing starts reading
-- the new tables.
--
-- Phase 2 — rewriting ~12 advertiser policies and the affiliate ones to
-- _psm_member_of() — is where the risk is, and it goes ONE TABLE PER
-- MIGRATION, each verified against live first. It is deliberately not in
-- this file.
--
-- ROLLBACK is clean while we are still in phase 1:
--     drop function if exists public._psm_member_of(text, uuid);
--     drop function if exists public._psm_member_role(text, uuid);
--     drop table if exists public.subject_member_accounts;
--     drop table if exists public.subject_members;
--
-- WHY ONE TABLE FOR BOTH SUBJECTS
-- An affiliate is the same problem with a different ownership table. Two
-- parallel sets of tables drift: a fix to one is a fix nobody applies to the
-- other. One table with a subject_kind cannot drift from itself.
-- =====================================================================

set search_path = public;

-- ── Members ──────────────────────────────────────────────────────────
create table if not exists public.subject_members (
  id           uuid primary key default gen_random_uuid(),
  -- 'advertiser' → subject_id is advertisers.id
  -- 'affiliate'  → subject_id is affiliates.id
  subject_kind text not null check (subject_kind in ('advertiser', 'affiliate')),
  subject_id   uuid not null,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      uuid not null,
  -- owner   : everything the subject can do today, including managing
  --           members and (for an advertiser) requesting withdrawals
  -- manager : day-to-day work, but NOT withdrawals, NOT member management,
  --           NOT company / billing / payout details
  -- viewer  : read only
  role         text not null check (role in ('owner', 'manager', 'viewer')),
  created_at   timestamptz not null default now(),
  created_by   uuid,
  -- One membership per person per subject. A second row for the same pair
  -- would make "what may this person do" depend on which row is read first.
  unique (subject_kind, subject_id, user_id)
);

create index if not exists subject_members_user_idx
  on public.subject_members (user_id);
create index if not exists subject_members_subject_idx
  on public.subject_members (subject_kind, subject_id);

-- ── Optional narrowing, advertiser only ──────────────────────────────
-- NO rows for a member means every ad account. Rows mean exactly those.
-- (There is no affiliate equivalent: the obvious one would be per referral
-- link, and nobody has asked for it. Not building it on speculation.)
create table if not exists public.subject_member_accounts (
  member_id     uuid not null references public.subject_members(id) on delete cascade,
  ad_account_id uuid not null references public.ad_accounts(id) on delete cascade,
  primary key (member_id, ad_account_id)
);

-- ── The helpers phase 2 will use ─────────────────────────────────────
-- SECURITY DEFINER so a policy on a table these functions read cannot
-- recurse through itself — the same reason _psm_admin_of exists.
create or replace function public._psm_member_of(p_kind text, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $blk0$
  select exists (
    select 1
      from public.subject_members m
     where m.subject_kind = p_kind
       and m.subject_id = p_subject
       and m.user_id = auth.uid()
  );
$blk0$;

-- The member's role, or null if they are not a member. Phase 2 uses this
-- for the writes only an owner may make.
create or replace function public._psm_member_role(p_kind text, p_subject uuid)
returns text
language sql
stable
security definer
set search_path = public
as $blk1$
  select m.role
    from public.subject_members m
   where m.subject_kind = p_kind
     and m.subject_id = p_subject
     and m.user_id = auth.uid()
   limit 1;
$blk1$;

revoke all on function public._psm_member_of(text, uuid) from public, anon;
revoke all on function public._psm_member_role(text, uuid) from public, anon;
grant execute on function public._psm_member_of(text, uuid) to authenticated;
grant execute on function public._psm_member_role(text, uuid) to authenticated;

-- ── RLS on the new tables themselves ─────────────────────────────────
-- A member may see who else is on the same subject; only an OWNER writes.
-- Tenant admins see and manage everything in their tenant, as everywhere
-- else.
alter table public.subject_members enable row level security;
alter table public.subject_member_accounts enable row level security;

drop policy if exists subject_members_select on public.subject_members;
create policy subject_members_select on public.subject_members
  for select
  using (
    user_id = auth.uid()
    or public._psm_member_of(subject_kind, subject_id)
    or is_tenant_admin(tenant_id)
  );

drop policy if exists subject_members_write on public.subject_members;
create policy subject_members_write on public.subject_members
  for all
  using (
    public._psm_member_role(subject_kind, subject_id) = 'owner'
    or is_tenant_admin(tenant_id)
  )
  with check (
    public._psm_member_role(subject_kind, subject_id) = 'owner'
    or is_tenant_admin(tenant_id)
  );

drop policy if exists subject_member_accounts_select on public.subject_member_accounts;
create policy subject_member_accounts_select on public.subject_member_accounts
  for select
  using (
    exists (
      select 1 from public.subject_members m
       where m.id = member_id
         and (
           m.user_id = auth.uid()
           or public._psm_member_of(m.subject_kind, m.subject_id)
           or is_tenant_admin(m.tenant_id)
         )
    )
  );

drop policy if exists subject_member_accounts_write on public.subject_member_accounts;
create policy subject_member_accounts_write on public.subject_member_accounts
  for all
  using (
    exists (
      select 1 from public.subject_members m
       where m.id = member_id
         and (
           public._psm_member_role(m.subject_kind, m.subject_id) = 'owner'
           or is_tenant_admin(m.tenant_id)
         )
    )
  )
  with check (
    exists (
      select 1 from public.subject_members m
       where m.id = member_id
         and (
           public._psm_member_role(m.subject_kind, m.subject_id) = 'owner'
           or is_tenant_admin(m.tenant_id)
         )
    )
  );

-- ── Backfill: today's single user becomes the owner ──────────────────
-- Idempotent (unique constraint plus ON CONFLICT), so it is safe to re-run,
-- and safe to run again after new signups until the signup path writes the
-- row itself in phase 2.
insert into public.subject_members
  (subject_kind, subject_id, tenant_id, user_id, role)
select 'advertiser', a.id, a.tenant_id, a.user_id, 'owner'
  from public.advertisers a
 where a.user_id is not null
   and a.tenant_id is not null
on conflict (subject_kind, subject_id, user_id) do nothing;

insert into public.subject_members
  (subject_kind, subject_id, tenant_id, user_id, role)
select 'affiliate', af.id, af.tenant_id, af.user_id, 'owner'
  from public.affiliates af
 where af.user_id is not null
   and af.tenant_id is not null
on conflict (subject_kind, subject_id, user_id) do nothing;

-- ── Read it back ─────────────────────────────────────────────────────
-- advertiser_owners must equal advertisers_with_a_user, and
-- affiliate_owners must equal affiliates_with_a_user. If either is short,
-- STOP: something has a null tenant_id, and phase 2 would lock that person
-- out of their own account.
select
  (select count(*) from public.subject_members where subject_kind = 'advertiser') as advertiser_owners,
  (select count(*) from public.subject_members where subject_kind = 'affiliate')  as affiliate_owners,
  (select count(*) from public.advertisers where user_id is not null)             as advertisers_with_a_user,
  (select count(*) from public.affiliates  where user_id is not null)             as affiliates_with_a_user,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename in ('subject_members', 'subject_member_accounts'))             as policies_created;
