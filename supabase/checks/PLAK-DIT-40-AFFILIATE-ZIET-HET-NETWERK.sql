-- =====================================================================
-- PLAK 40 — een affiliate ziet "Meta", nooit het accounttype
-- =====================================================================
-- De eigenaar: "affiliates zien ook nooit ergens de account type he?
-- alleen Meta en currency, meer niet".
--
-- affiliate_commission_list (plak 39) geeft bij een top-up-commissie nu
-- ook het NETWERK: Meta, Google of TikTok. De database rekent dat zelf
-- uit het type-slug; het slug zelf (eu-meta-psm, met regio en route)
-- verlaat de database niet. Hetzelfde woordbegrip als
-- lib/pure-platform-badge.ts (customerPlatformName).
--
-- Een extra kolom in RETURNS TABLE kan niet met create or replace, dus de
-- functie wordt opnieuw aangemaakt. Het scherm (live) leest de oude
-- kolommen en de nieuwe erbij.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

drop function if exists public.affiliate_commission_list(timestamptz, timestamptz);

create function public.affiliate_commission_list(
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
  status text,
  network text)
language plpgsql
stable
security definer
set search_path to 'public'
as $blk0$
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
    case when rc.status = 'on_hold' then null else rc.amount end,
    upper(coalesce(rc.currency, 'EUR'))::text,
    case coalesce(rc.status, 'unpaid')
      when 'paid' then 'paid'
      when 'on_hold' then 'processing'
      when 'reversed' then 'reversed'
      else 'owed' end::text,
    -- Het netwerk, nooit het type.
    case
      when lower(coalesce(x.platform, '')) ~ '(meta|facebook)' then 'Meta'
      when lower(coalesce(x.platform, '')) ~ '(google|gdn|youtube)' then 'Google'
      when lower(coalesce(x.platform, '')) ~ 'tiktok' then 'TikTok'
      else null
    end::text
  from public.referral_commissions rc
  join public.referral_links rl on rl.id = rc.referral_link_id
  left join public.advertisers ra on ra.id = rl.referred_advertiser_id
  left join public.user_profiles rup on rup.id = ra.profile_id
  left join public.top_ups t on t.id = rc.topup_id
  left join public.ad_accounts x on x.id = t.account_id
  where rl.affiliate_advertiser_id = v_aff
    and (p_from is null or rc.created_at >= p_from)
    and (p_to   is null or rc.created_at <= p_to)
  order by rc.created_at desc;
end;
$blk0$;

revoke all on function public.affiliate_commission_list(timestamptz, timestamptz) from public, anon;
grant execute on function public.affiliate_commission_list(timestamptz, timestamptz) to authenticated;

select 1 as nr, 'affiliate_commission_list' as item,
  'opnieuw aangemaakt met netwerk (Meta/Google/TikTok); geen type, geen marge' as antwoord
union all
select 2, 'zelftest: wat de functie van de bestaande slugs maakt',
  coalesce((select string_agg(distinct x.platform || ' -> ' ||
                case when lower(x.platform) ~ '(meta|facebook)' then 'Meta'
                     when lower(x.platform) ~ '(google|gdn|youtube)' then 'Google'
                     when lower(x.platform) ~ 'tiktok' then 'TikTok' else '(niets)' end, E'\n')
              from public.ad_accounts x), 'geen accounts');
