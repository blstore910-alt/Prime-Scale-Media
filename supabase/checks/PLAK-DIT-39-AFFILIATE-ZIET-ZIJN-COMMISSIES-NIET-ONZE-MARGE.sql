-- =====================================================================
-- PLAK 39 — een affiliate ziet elke commissie, niet onze marge
-- =====================================================================
-- De eigenaar: PSM0005 "moet alle referrals detailed kunnen zien, per
-- referral al zijn earnings en type, en kunnen sorteren, mooi
-- transparant".
--
-- En een lek dat daarbij bovenkwam: de policy "Allow affiliates to read
-- their data" op referral_commissions geeft een affiliate de HELE rij --
-- en sinds plak 35 staan daar base_amount (onze winst), fee_amount,
-- supplier_fee_pct en supplier_cost in. Eén verzoek vanuit de console:
--
--   select base_amount, supplier_fee_pct, supplier_cost from referral_commissions
--
-- en een affiliate kent onze marge per funding. De app leest die tabel
-- vanuit een affiliate-sessie NERGENS (alleen de eigenaar, in
-- hooks/use-affiliate-book.ts), dus de policy kan weg.
--
-- In plaats daarvan: affiliate_commission_list(van, tot). Definer, kijkt
-- wie belt, geeft ALLEEN: datum, klant (code + naam), soort (storting /
-- abonnement / bonus), bedrag, valuta, status. Geen grondslag, geen
-- percentage (bedrag / percentage = onze winst), geen leverancier.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p39 (nr int, item text, v text);
delete from _p39;

insert into _p39
select 0, 'policies VOOR op referral_commissions en referral_clawbacks',
  coalesce(string_agg(tablename || ' | ' || policyname || ' | ' || cmd || ' | ' || coalesce(qual, '-'), E'\n'
                      order by tablename, policyname), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename in ('referral_commissions', 'referral_clawbacks');

do $blk0$
begin
  execute 'drop policy if exists "Allow affiliates to read their data" on public.referral_commissions';
  insert into _p39 values (1, 'referral_commissions', 'affiliate-leespolicy weg; alleen de eigenaar leest de tabel');
exception when others then
  insert into _p39 values (1, 'referral_commissions', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

create or replace function public.affiliate_commission_list(
  p_from timestamptz default null,
  p_to   timestamptz default null)
returns table (
  commission_id uuid,
  created_at timestamptz,
  referral_link_id uuid,
  referred_advertiser_code text,
  referred_advertiser_name text,
  kind text,
  amount numeric,
  currency text,
  status text)
language plpgsql
stable
security definer
set search_path to 'public'
as $blk1$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    rc.id,
    rc.created_at,
    rc.referral_link_id,
    ra.tenant_client_code::text,
    rup.full_name::text,
    coalesce(rc.source,
             case when rc.type = 'onetime' then 'onetime'
                  when rc.subscription_invoice_id is not null then 'subscription'
                  else 'topup' end)::text,
    -- Nog niet uitgerekend (on hold) is geen bedrag.
    case when rc.status = 'on_hold' then null else rc.amount end,
    upper(coalesce(rc.currency, 'EUR'))::text,
    case coalesce(rc.status, 'unpaid')
      when 'paid' then 'paid'
      when 'on_hold' then 'processing'
      when 'reversed' then 'reversed'
      else 'owed' end::text
  from public.referral_commissions rc
  join public.referral_links rl on rl.id = rc.referral_link_id
  left join public.advertisers ra on ra.id = rl.referred_advertiser_id
  left join public.user_profiles rup on rup.id = ra.profile_id
  where rl.affiliate_advertiser_id = v_aff
    and (p_from is null or rc.created_at >= p_from)
    and (p_to   is null or rc.created_at <= p_to)
  order by rc.created_at desc;
end;
$blk1$;

revoke all on function public.affiliate_commission_list(timestamptz, timestamptz) from public, anon;
grant execute on function public.affiliate_commission_list(timestamptz, timestamptz) to authenticated;

insert into _p39 values (2, 'affiliate_commission_list', 'staat: datum, klant, soort, bedrag, valuta, status -- geen marge');

insert into _p39
select 3, 'policies NA',
  coalesce(string_agg(tablename || ' | ' || policyname || ' | ' || cmd, E'\n' order by tablename, policyname), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename in ('referral_commissions', 'referral_clawbacks');

-- Kan een affiliate de clawbacks lezen? Die dragen returned_amount,
-- topup_volume en share -- ook volume-informatie. Alleen melden.
insert into _p39
select 4, 'referral_clawbacks: RLS aan? + rechten authenticated',
  (select case when c.relrowsecurity then 'RLS aan' else 'RLS UIT' end
     from pg_class c where c.oid = 'public.referral_clawbacks'::regclass) || ' | ' ||
  coalesce((select string_agg(privilege_type, ',' order by privilege_type)
              from information_schema.role_table_grants
             where table_schema = 'public' and table_name = 'referral_clawbacks'
               and grantee = 'authenticated'), 'geen');

select nr, item, v as antwoord from _p39 order by nr;
