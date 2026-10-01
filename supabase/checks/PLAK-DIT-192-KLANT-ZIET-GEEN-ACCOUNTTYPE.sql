-- ════════════════════════════════════════════════════════════════════
-- PLAK 192 -- de klant leest zijn ad accounts zonder het interne type
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "HK, RockAds, onze interne afkortingen voor ad
-- accounts -- niemand mag het zien behalve admins." Lekcontrole L1:
-- ad_accounts.platform IS het interne type (hk-meta-premium,
-- eu-meta-psm-gh) en elke klant las zijn eigen rijen rechtstreeks. Ook
-- notes en airtable (admin-tekst) kwamen zo mee.
--
-- Nu:
--   my_ad_accounts   een view voor de klant (en zijn teamleden, en
--                    admins): dezelfde rijen, ZONDER platform, notes,
--                    metadata, airtable, created_by -- MET `network`
--                    (meta/google/tiktok) en `bank_group` (turlit/zanel,
--                    voor de top-up; dezelfde regel als lib/bank-routing).
--   ad_accounts      de twee leesregels voor klanten gaan weg; alleen
--                    admins lezen de tabel nog rechtstreeks.
--   top_ups_view     account_name komt voor de klant via my_ad_accounts;
--                    platform blijft alleen voor admins gevuld.
--   twee triggers    die ad_accounts lezen krijgen eigen rechten, zodat
--                    ze niet afhangen van wie er schrijft.
--
-- De app valt terug op de oude weg zolang deze plak er niet is.
-- Twee keer plakken kan.

-- ── 1. DE VIEW ──────────────────────────────────────────────────────
create or replace view public.my_ad_accounts
with (security_barrier = true)
as
select
  a.id,
  a.name,
  a.bm_id,
  a.fee,
  a.advertiser_id,
  a.start_date,
  a.updated_at,
  a.payment_status,
  a.status,
  a.tenant_id,
  a.timezone,
  a.website_url,
  a.created_at,
  a.min_topup,
  a.currency,
  case
    when a.platform ilike '%tiktok%' then 'tiktok'
    when a.platform ilike '%google%' then 'google'
    when a.platform ilike '%meta%' then 'meta'
    else 'other'
  end::text as network,
  (case w.woorden
     when 'eu-gh-meta-psm' then 'zanel'
     when 'eu-meta-psm' then 'turlit'
     when 'google' then 'turlit'
     when 'tiktok' then 'turlit'
     when 'taboola' then 'turlit'
     when 'snapchat' then 'turlit'
     when 'hk-meta-premium' then 'turlit'
     when 'business-hk-meta' then 'turlit'
     when 'business-green-hk-meta' then 'turlit'
     else null
   end)::text as bank_group
from public.ad_accounts a
cross join lateral (
  select string_agg(x, '-' order by x) as woorden
    from regexp_split_to_table(lower(coalesce(a.platform, '')), '[^a-z0-9]+') x
   where x <> ''
) w
where exists (select 1 from public.advertisers adv where adv.id = a.advertiser_id and adv.user_id = auth.uid())
   or public._psm_member_of('advertiser', a.advertiser_id)
   or public._is_admin_of(a.tenant_id);

revoke all on public.my_ad_accounts from anon, public;
grant select on public.my_ad_accounts to authenticated;

-- ── 2. DE TABEL DICHT VOOR KLANTEN ──────────────────────────────────
do $blk0$
begin
  drop policy if exists "Enable select for advertisers" on public.ad_accounts;
  drop policy if exists ad_accounts_team_read on public.ad_accounts;
end;
$blk0$;

-- ── 3. TOP_UPS_VIEW: de accountnaam via my_ad_accounts ──────────────
create or replace view public.top_ups_view
with (security_invoker = on)
as
select t.id,
    t.created_at,
    t.updated_at,
    t.type,
    t.currency,
    t.amount_received,
    t.amount_usd,
    t.topup_amount,
    t.fee,
    t.advertiser_id,
    t.status,
    t.account_id,
    t.tenant_id,
    t.payment_slip,
    t.topup_currency,
    t.source,
    t.verified_at,
    t.affiliate_id,
    t.author,
    t.is_deleted,
    t.number,
    t.eur_value,
    t.eur_topup,
    t.fee_amount,
    t.topup_usd,
    t.rate,
    coalesce(a.id, ma.id) as ad_account_id,
    coalesce(a.name, ma.name) as account_name,
    adv.id as adv_id,
    adv.tenant_client_code,
    up.id as advertiser_profile_id,
    up.full_name as advertiser_full_name,
    up.email as advertiser_email,
    a.platform,
    t.rejection_reason
   from top_ups t
     left join ad_accounts a on a.id = t.account_id
     left join my_ad_accounts ma on ma.id = t.account_id
     left join advertisers adv on adv.id = t.advertiser_id
     left join user_profiles up on up.id = adv.profile_id;
revoke all on public.top_ups_view from anon, public;
grant select on public.top_ups_view to authenticated;

-- ── 4. DE TWEE TRIGGERS MET EIGEN RECHTEN ───────────────────────────
alter function public._guard_top_ups_session_write() security definer set search_path = public, pg_temp;
alter function public._withdrawal_takes_the_account_currency() security definer set search_path = public, pg_temp;
revoke all on function public._guard_top_ups_session_write() from public, anon;
revoke all on function public._withdrawal_takes_the_account_currency() from public, anon;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select count(*) from pg_policies where tablename = 'ad_accounts')                              as regels_op_ad_accounts_moet_1,
  (select count(*) from information_schema.columns
    where table_name = 'my_ad_accounts' and column_name in ('platform', 'notes', 'metadata', 'airtable')) as interne_kolommen_moet_0,
  -- (de view zelf is hier leeg: in de SQL-editor is er geen ingelogde
  -- gebruiker. Claude controleert hem daarna in de app.)
  has_table_privilege('anon', 'public.my_ad_accounts', 'select')                                  as anon_leest;
