-- =====================================================================
-- LEESVRAGEN — alleen lezen. Draai dit NA ALLES-IN-1-V2.sql.
-- =====================================================================
-- Wat er misging: leesvraag H koppelde user_profiles aan
-- `advertisers.user_profile_id`, en die kolom bestaat niet — het is
-- `user_id`. Daardoor brak H en stopten G, I, J en K ook, plus het
-- opruimen van de hulpfunctie.
--
-- Alles vóór H is wel gewoon gelopen: alle write-blokken (A1 t/m B5) en
-- de ja/nee-regel. Die regel staat hier opnieuw, zodat je met één paste
-- allebei hebt.
--
-- Niets hier schrijft. De allerlaatste regel ruimt de hulpfunctie op.
-- =====================================================================

set search_path = public;

-- De hulpfunctie opnieuw, voor het geval de vorige run hem al had
-- opgeruimd of nooit tot daar kwam. pg_get_functiondef gooit op een
-- aggregate; dit vangt dat af.
create or replace function public._fndef_safe(p_oid oid)
returns text
language plpgsql
stable
as $fnsafe$
begin
  return pg_get_functiondef(p_oid);
exception when others then
  return '';
end;
$fnsafe$;


-- =====================================================================
-- 1. ALLES IN EEN RIJ — dit is de regel die ik wil zien
-- =====================================================================
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('logs','wallet_exchanges')
      and c.relrowsecurity)                                  as a1_rls_van_2,
  exists (
    select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname='slip_admin_read' and qual like '%is_active%')
                                                             as a2_slips_dicht,
  coalesce((select position('jsonb_build_object' in public._fndef_safe(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_invite_by_token'
      and p.prokind='f' limit 1), false)                     as a3_invite_smal,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and public._fndef_safe(p.oid) like '%coalesce(rl.status%'
       and public._fndef_safe(p.oid) like '%rl.created_at desc%')
                                                             as a4_clawback_actief,
  exists (select 1 from pg_constraint
           where conname='advertiser_perks_amount_sane')     as a5_perk_grens,
  (to_regprocedure('public.my_wallet_extras(uuid)') is not null)
                                                             as a6_rapport_extra,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'
      and c.relname in ('top_ups_view','referral_links_with_details','referral_commissions_with_details')
      and coalesce((select option_value::boolean from pg_options_to_table(c.reloptions)
                     where option_name='security_invoker'), false))
                                                             as a7_views_van_3,
  not exists (
    select 1 from information_schema.routine_privileges
     where specific_schema='public' and routine_name='rate_limit_check'
       and grantee in ('anon','authenticated'))              as a8_ratelimit_dicht,
  coalesce((select position('referred_advertiser_email' in public._fndef_safe(p.oid)) = 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='affiliate_referral_stats'
      and p.prokind='f' limit 1), false)                     as a9_email_weg,
  coalesce((select position('not in (''cancelled'', ''inactive'', ''paused'')' in public._fndef_safe(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='subscription_billing_run'
      and p.prokind='f' limit 1), false)                     as b1a_incasso_slaat_over,
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and public._fndef_safe(p.oid) like '%when status in (''cancelled'', ''inactive'', ''paused'')%')
                                                             as b1b_geen_reactivatie,
  exists (
    select 1 from pg_indexes
     where schemaname='public' and tablename='wallet_precharges'
       and indexdef ilike '%outstanding%' and indexdef ilike '%unique%')
                                                             as b2_voorschot_index,
  exists (select 1 from pg_trigger
           where tgname='trg_cap_pending_withdrawals')       as b3_withdrawal_rem,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid=t.tgrelid
     join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and t.tgname like 'trg_audit_%'
      and c.relname in ('subject_members','subject_member_accounts',
                        'notification_preferences','referral_clawbacks',
                        'advertiser_plans','advertiser_perks','tax_rates',
                        'bank_accounts','wallet_precharges','wallet_refunds',
                        'wallet_adjustments'))               as b4_audited_van_11,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname in ('grant_advertiser_perk','revoke_advertiser_perk')
      and public._fndef_safe(p.oid) like '%is_active%')      as b5_perks_van_2;


-- =====================================================================
-- 2. G — de definitie van top_ups_view
-- =====================================================================
-- /top-ups leest deze view, en die geeft doorgestreepte (is_deleted)
-- topups gewoon mee — dus een verwijderde PENDING topup staat nog in de
-- wachtrij met een Verify-knop erbij. Ik herbouw die view niet blind:
-- hij staat in geen migratie, en een view die ik verkeerd reconstrueer
-- neemt /top-ups mee. Met deze tekst lever ik de exacte regel.
select pg_get_viewdef('public.top_ups_view'::regclass, true) as top_ups_view_definitie;


-- =====================================================================
-- 3. H — uitgezette klanten met een openstaande factuur  [GECORRIGEERD]
-- =====================================================================
-- advertisers koppelt op user_id, niet op user_profile_id. Dit is de
-- groep die B1 raakt: als hier rijen uitkomen, zijn die mensen mogelijk
-- al geincasseerd terwijl ze geen toegang tot de app hadden — en als die
-- incasso lukte, staat hun abonnement nu weer op actief.
select
  a.tenant_client_code                as klant,
  up.status                           as profiel_status,
  coalesce(up.is_active, true)        as profiel_actief,
  s.status                            as abo_status,
  i.id                                as factuur,
  i.total,
  i.currency,
  i.due_date::date                    as vervalt,
  i.status                            as factuur_status
  from public.invoices i
  join public.subscriptions s on s.id = i.subscription_id
  join public.advertisers a on a.id = i.advertiser_id
  left join public.user_profiles up
         on up.user_id = a.user_id
        and up.tenant_id = a.tenant_id
 where i.status = 'unpaid'
   and (s.status in ('inactive', 'paused')
        or coalesce(up.is_active, true) = false
        or coalesce(up.status, 'active') = 'inactive')
 order by i.due_date;


-- =====================================================================
-- 4. I — doorgestreepte topups die tot vannacht in de cijfers zaten
-- =====================================================================
-- is_deleted werd door 1 van de 13 lezers gehonoreerd. Deze bedragen
-- zaten dus in je omzet, je fee-inkomsten, je winstgrafiek EN in het
-- financieel rapport van de klant, als geld dat hun wallet verliet.
-- Vannacht zijn die twaalf lezers gerepareerd; dit is wat het scheelde.
select
  count(*)                            as verwijderde_topups,
  sum(coalesce(t.fee_amount, 0))      as fee_usd_die_meetelde,
  sum(coalesce(t.topup_amount, 0))    as topup_usd_die_meetelde
  from public.top_ups t
 where t.is_deleted = true;


-- =====================================================================
-- 5. J — staan de testaccounts nog open op productie?
-- =====================================================================
-- Er zijn accounts geseed op @primescalemedia.test met een wachtwoord dat
-- in de repo staat. Rijen hier = een wachtwoord dat iedereen met toegang
-- tot de code kan lezen, en een daarvan is eigenaar van een tenant.
select
  u.email,
  u.email_confirmed_at is not null    as bevestigd,
  u.last_sign_in_at
  from auth.users u
 where u.email like '%@primescalemedia.test'
 order by u.email;


-- =====================================================================
-- 6. K — meer dan een openstaande withdrawal op een rekening
-- =====================================================================
select
  w.ad_account_id,
  count(*)                            as openstaand,
  sum(w.amount)                       as totaal_aangevraagd,
  w.currency
  from public.ad_account_withdrawals w
 where w.status = 'pending'
 group by w.ad_account_id, w.currency
having count(*) > 1;


-- =====================================================================
-- 7. D — stortingen met meer dan een voorschot
-- =====================================================================
-- Als hier iets met twee LOPENDE voorschotten staat, is de unieke index
-- uit B2 niet aangemaakt en moet dat eerst opgelost worden.
select
  p.source_wallet_topup_id            as storting,
  count(*)                            as voorschotten,
  string_agg(p.status, ', ')          as statussen,
  count(*) filter (where p.status = 'outstanding') as lopend
  from public.wallet_precharges p
 where p.source_wallet_topup_id is not null
 group by p.source_wallet_topup_id
having count(*) > 1;


-- =====================================================================
-- 8. F — hoe zien logs en wallet_exchanges eruit
-- =====================================================================
select
  c.table_name,
  string_agg(c.column_name, ', ' order by c.ordinal_position) as kolommen
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name in ('logs', 'wallet_exchanges')
 group by c.table_name;


-- =====================================================================
-- OPRUIMEN — als allerlaatste.
-- =====================================================================
drop function if exists public._fndef_safe(oid);
