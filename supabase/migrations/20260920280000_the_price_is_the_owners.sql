-- =====================================================================
-- What a customer is charged is the owner's — at the table, not just
-- in the server action
-- =====================================================================
-- `ad_accounts.fee` is the strongest money lever in this app.
-- resolveEffectiveFeePct reads it FIRST and it beats the plan, so it
-- overrides upsertPlan, upsertFeeDefault, upsertExchangeRate,
-- upsertAdAccountType and changeSubscriptionAmount -- every one of
-- which was deliberately raised to owner-only.
--
-- Three server actions now gate it (createAdAccountAsAdmin,
-- updateAdAccountAsAdmin, assignSupplierAdAccount): a fee that is not
-- the customer's plan rate or the ad-account type's own default needs
-- the tenant owner. That is the right rule and it is enforced in the
-- wrong place, because the table says:
--
--   create policy "Enable ALL for admins" on public.ad_accounts
--     for all to authenticated
--     using (public._is_admin_of(tenant_id))
--
-- So every employee admin of the tenant has full UPDATE on that column
-- through PostgREST. From devtools on any admin screen:
--
--   supabase.from('ad_accounts').update({ fee: 25 }).eq('id', '<acct>')
--
-- No action, no gate, no record of who decided the price. EUR 2,500
-- instead of EUR 500 on a EUR 10,000 top-up, on every top-up of that
-- account, for ever.
--
-- This is the same argument the app already makes one level up -- "a
-- door nobody walks through is still a door" -- carried down to the
-- table.
--
-- ── WHY A TRIGGER AND NOT A NEW POLICY ───────────────────────────────
--
-- A policy cannot express "this column may change only for the owner":
-- RLS is row-level, so the WITH CHECK would have to refuse the whole
-- UPDATE, which would stop an employee renaming an account. A BEFORE
-- UPDATE trigger can compare old and new and refuse the one column.
--
-- It is additive: no policy is rewritten, no existing row is touched,
-- and it drops in one line if it ever refuses something it should not.
--
-- ── WHAT IT ALLOWS ───────────────────────────────────────────────────
--
-- The same four things the server rule allows, so the two cannot drift:
-- no change, a change to NULL or 0 ("use the plan"), the advertiser's
-- own plan rate, and the ad-account type's default. Anything else is a
-- price.
--
-- The service role bypasses RLS and does not go through this either
-- (it is not `authenticated`), which is correct: the billing engine and
-- the pool sync are not people.
--
-- Safe to run more than once.
-- =====================================================================

set search_path = public;

create or replace function public._fee_is_the_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_old       numeric := round(coalesce(old.fee, 0)::numeric, 2);
  v_new       numeric := round(coalesce(new.fee, 0)::numeric, 2);
  v_plan      numeric;
  v_default   numeric;
begin
  -- Not a change to the price: nothing to say.
  if v_old = v_new then
    return new;
  end if;

  -- No auth.uid() means this is the service role or a database job, and
  -- those are not people. RLS does not apply to them either.
  if v_uid is null then
    return new;
  end if;

  select t.owner_id into v_owner
    from public.tenants t
   where t.id = new.tenant_id;

  if v_owner is not null and v_owner = v_uid then
    return new;
  end if;

  -- Zero or null is "use whatever is configured", which is not a price.
  if v_new <= 0 then
    return new;
  end if;

  -- The rate this customer actually agreed.
  begin
    select p.topup_fee_pct into v_plan
      from public.advertiser_plans p
     where p.advertiser_id = new.advertiser_id
     limit 1;
  exception when undefined_table or undefined_column then
    v_plan := null;
  end;
  if v_plan is not null and round(v_plan::numeric, 2) = v_new then
    return new;
  end if;

  -- ...and this account type's own default.
  begin
    select ty.default_fee_pct into v_default
      from public.ad_account_types ty
     where ty.tenant_id = new.tenant_id
       and ty.slug = new.platform
     limit 1;
  exception when undefined_table or undefined_column then
    v_default := null;
  end;
  if v_default is not null and round(v_default::numeric, 2) = v_new then
    return new;
  end if;

  raise exception
    'Only the super-admin can set what a customer is charged on top-ups. Leave the fee at their plan rate or the account type default.'
    using errcode = '42501';
end;
$blk0$;

drop trigger if exists trg_fee_is_the_owners on public.ad_accounts;
create trigger trg_fee_is_the_owners
  before update of fee on public.ad_accounts
  for each row execute function public._fee_is_the_owners();

-- =====================================================================
-- The report -- the SQL editor shows only the LAST result set
-- =====================================================================
select 1 as sort, 'price guard on ad_accounts.fee' as item,
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_fee_is_the_owners' and not tgisinternal)
       then 'ON' else 'NOT APPLIED' end as status
union all
select 2, 'who can UPDATE ad_accounts today',
  coalesce((
    select string_agg(policyname || ' (' || cmd || ')', ' | ' order by policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'ad_accounts'
       and cmd in ('UPDATE', 'ALL')
  ), 'no UPDATE policy')
union all
-- Accounts whose fee is neither the customer's plan rate nor the type
-- default. Every one of these was priced by somebody; this says how
-- many, so a number above zero can be looked at rather than assumed.
select 3, 'accounts priced off both the plan and the type default',
  case
    when to_regclass('public.ad_account_types') is null
      then 'ad_account_types is not on this database'
    else (
      select count(*)::text || ' of ' ||
             (select count(*)::text from public.ad_accounts)
        from public.ad_accounts a
        left join public.advertiser_plans p
               on p.advertiser_id = a.advertiser_id
        left join public.ad_account_types ty
               on ty.tenant_id = a.tenant_id and ty.slug = a.platform
       where coalesce(a.fee, 0) > 0
         and round(coalesce(a.fee, 0)::numeric, 2)
             is distinct from round(coalesce(p.topup_fee_pct, -1)::numeric, 2)
         and round(coalesce(a.fee, 0)::numeric, 2)
             is distinct from round(coalesce(ty.default_fee_pct, -1)::numeric, 2)
    )
  end
union all
select 4, 'employee admins (everybody this changes anything for)',
  (select count(*)::text from public.user_profiles up
     join public.tenants t on t.id = up.tenant_id
    where up.role = 'admin' and t.owner_id is distinct from up.user_id
      and coalesce(up.is_active, true))
order by sort;
