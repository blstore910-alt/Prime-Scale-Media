-- =====================================================================
-- CHECK-ALLES — één query, één tabel, alles erin. Alleen lezen.
-- =====================================================================
-- WAT ER MIS WAS AAN DE VORIGE TWEE. Niet de SQL: de OPZET. De Supabase
-- editor toont alleen het resultaat van de LAATSTE query, dus alle
-- antwoorden daarvoor liepen prima en waren gewoon onzichtbaar. Jij zag
-- één tabel en dacht dat de rest niet gedraaid had.
--
-- Dit is daarom één enkele SELECT. Elk antwoord wordt apart uitgevoerd
-- via _ans(), die z'n eigen fout opvangt en 'FOUT: ...' teruggeeft in
-- plaats van het hele bestand af te breken. Er kan dus niets meer
-- misgaan: je krijgt altijd de volledige lijst terug, en waar iets niet
-- kon, staat waarom.
--
-- Niets hierin schrijft. Plak het geheel, stuur de tabel terug.
-- =====================================================================

set search_path = public;

create or replace function public._ans(p_sql text)
returns text
language plpgsql
stable
as $ansfn$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, '(leeg)');
exception when others then
  return 'FOUT: ' || sqlerrm;
end;
$ansfn$;

select * from (
  -- ── Is ALLES-IN-1-V2 doorgekomen? ─────────────────────────────────
  select  1 as nr, 'A1 · RLS op logs + wallet_exchanges (van 2)' as vraag,
    public._ans($q$select count(*)::text from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname in ('logs','wallet_exchanges')
       and c.relrowsecurity$q$) as antwoord
  union all select 2, 'A2 · bankbewijzen dicht voor uitgezette admin',
    public._ans($q$select exists(select 1 from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='slip_admin_read' and qual like '%is_active%')::text$q$)
  union all select 3, 'A3 · uitnodiging geeft nog maar 7 velden',
    public._ans($q$select (position('jsonb_build_object' in pg_get_functiondef(p.oid))>0)::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='get_invite_by_token' and p.prokind='f' limit 1$q$)
  union all select 4, 'A4 · clawback pakt de ACTIEVE link',
    public._ans($q$select exists(select 1 from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and p.proname ilike '%clawback%'
       and pg_get_functiondef(p.oid) like '%coalesce(rl.status%')::text$q$)
  union all select 5, 'A5 · kortingspercentage begrensd 0-100',
    public._ans($q$select exists(select 1 from pg_constraint
      where conname='advertiser_perks_amount_sane')::text$q$)
  union all select 6, 'A6 · my_wallet_extras bestaat',
    public._ans($q$select (to_regprocedure('public.my_wallet_extras(uuid)') is not null)::text$q$)
  union all select 7, 'A7 · views lezen als de beller (van 3)',
    public._ans($q$select count(*)::text from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='v'
       and c.relname in ('top_ups_view','referral_links_with_details','referral_commissions_with_details')
       and coalesce((select option_value::boolean from pg_options_to_table(c.reloptions)
                      where option_name='security_invoker'), false)$q$)
  union all select 8, 'A8 · rate_limit_check dicht voor anon',
    public._ans($q$select (not exists(select 1 from information_schema.routine_privileges
      where specific_schema='public' and routine_name='rate_limit_check'
        and grantee in ('anon','authenticated')))::text$q$)
  union all select 9, 'A9 · e-mailadres weg uit affiliate_referral_stats',
    public._ans($q$select (position('referred_advertiser_email' in pg_get_functiondef(p.oid))=0)::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='affiliate_referral_stats' and p.prokind='f' limit 1$q$)
  union all select 10, 'B1a · incasso slaat uitgezet abonnement over',
    public._ans($q$select (position('not in (''cancelled'', ''inactive'', ''paused'')' in pg_get_functiondef(p.oid))>0)::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='subscription_billing_run' and p.prokind='f' limit 1$q$)
  union all select 11, 'B1b · abonnement zet zichzelf niet meer aan',
    public._ans($q$select exists(select 1 from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and pg_get_functiondef(p.oid) like '%when status in (''cancelled'', ''inactive'', ''paused'')%')::text$q$)
  union all select 12, 'B2 · voorschot-index kijkt naar status',
    public._ans($q$select exists(select 1 from pg_indexes
      where schemaname='public' and tablename='wallet_precharges'
        and indexdef ilike '%outstanding%' and indexdef ilike '%unique%')::text$q$)
  union all select 13, 'B3 · rem op openstaande withdrawals',
    public._ans($q$select exists(select 1 from pg_trigger
      where tgname='trg_cap_pending_withdrawals')::text$q$)
  union all select 14, 'B4 · tabellen met audit-spoor (van 11)',
    public._ans($q$select count(*)::text from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and t.tgname like 'trg_audit_%'
       and c.relname in ('subject_members','subject_member_accounts',
                         'notification_preferences','referral_clawbacks',
                         'advertiser_plans','advertiser_perks','tax_rates',
                         'bank_accounts','wallet_precharges','wallet_refunds',
                         'wallet_adjustments')$q$)
  union all select 15, 'B5 · perk-RPCs weigeren uitgezette admin (van 2)',
    public._ans($q$select count(*)::text from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.prokind='f'
       and p.proname in ('grant_advertiser_perk','revoke_advertiser_perk')
       and pg_get_functiondef(p.oid) like '%is_active%'$q$)

  -- ── Wat ik moet weten om verder te kunnen ─────────────────────────
  union all select 20, 'KOLOM · top_ups.is_deleted bestaat?',
    public._ans($q$select exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='top_ups'
        and column_name='is_deleted')::text$q$)
  union all select 21, 'KOLOM · wallet_precharges.source_wallet_topup_id bestaat?',
    public._ans($q$select exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='wallet_precharges'
        and column_name='source_wallet_topup_id')::text$q$)
  union all select 22, 'KOLOM · wallet_topups.description bestaat?',
    public._ans($q$select exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='wallet_topups'
        and column_name='description')::text$q$)
  union all select 23, 'KOLOM · invoices.due_date bestaat?',
    public._ans($q$select exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='invoices'
        and column_name='due_date')::text$q$)
  union all select 24, 'KOLOM · wise_incoming_transfers.archived_at bestaat?',
    public._ans($q$select exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='wise_incoming_transfers'
        and column_name='archived_at')::text$q$)

  -- ── Geld dat al fout gegaan kan zijn ──────────────────────────────
  union all select 30, 'GELD · uitgezette klanten met openstaande factuur',
    public._ans($q$select coalesce(string_agg(
        x.klant || ' · ' || x.cur || ' ' || x.total || ' vervalt ' || x.vervalt, ' | '), '(geen)')
      from (
        select a.tenant_client_code as klant, i.currency as cur,
               i.total::text as total, i.due_date::date::text as vervalt
          from public.invoices i
          join public.subscriptions s on s.id = i.subscription_id
          join public.advertisers a on a.id = i.advertiser_id
          left join public.user_profiles up
                 on up.user_id = a.user_id and up.tenant_id = a.tenant_id
         where i.status = 'unpaid'
           and (s.status in ('inactive','paused')
                or coalesce(up.is_active,true) = false
                or coalesce(up.status,'active') = 'inactive')
         limit 20) x$q$)
  union all select 31, 'GELD · doorgestreepte topups die meetelden',
    public._ans($q$select count(*)::text || ' stuks, fee $' ||
        coalesce(sum(fee_amount),0)::text || ', bedrag $' ||
        coalesce(sum(topup_amount),0)::text
      from public.top_ups where is_deleted = true$q$)
  union all select 32, 'GELD · stortingen met meer dan een voorschot',
    public._ans($q$select coalesce(string_agg(
        x.storting::text || ' (' || x.statussen || ')', ' | '), '(geen)')
      from (
        select p.source_wallet_topup_id as storting,
               string_agg(p.status, ',') as statussen
          from public.wallet_precharges p
         where p.source_wallet_topup_id is not null
         group by p.source_wallet_topup_id
        having count(*) > 1 limit 20) x$q$)
  union all select 33, 'GELD · meer dan een openstaande withdrawal',
    public._ans($q$select coalesce(string_agg(
        x.acc::text || ' x' || x.n::text, ' | '), '(geen)')
      from (
        select w.ad_account_id as acc, count(*) as n
          from public.ad_account_withdrawals w
         where w.status = 'pending'
         group by w.ad_account_id
        having count(*) > 1 limit 20) x$q$)
  union all select 34, 'GELD · commissies per status',
    public._ans($q$select coalesce(string_agg(
        x.status || ' ' || x.cur || ' ' || x.som::text, ' | '), '(geen)')
      from (
        select status, currency as cur, sum(amount) as som
          from public.referral_commissions
         group by status, currency) x$q$)

  -- ── Veiligheid ────────────────────────────────────────────────────
  union all select 40, 'RISICO · testaccounts op productie',
    public._ans($q$select coalesce(string_agg(u.email, ' | '), '(geen)')
      from auth.users u where u.email like '%@primescalemedia.test'$q$)
  union all select 41, 'RISICO · advertisers met een profiel in 2+ tenants',
    public._ans($q$select count(*)::text from (
        select a.user_id from public.advertisers a
         group by a.user_id having count(distinct a.tenant_id) > 1) x$q$)
  union all select 42, 'RISICO · abonnementen in de verkeerde tenant',
    public._ans($q$select count(*)::text
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
     where s.tenant_id is distinct from a.tenant_id$q$)

  -- ── De definitie die ik nodig heb om de laatste fix te schrijven ──
  union all select 50, 'DEFINITIE · top_ups_view',
    public._ans($q$select pg_get_viewdef('public.top_ups_view'::regclass, true)$q$)
) t
order by t.nr;

drop function if exists public._ans(text);
