-- =====================================================================
-- PLAK 16 — DRINGEND: de eerste factuur is een weesfactuur
-- =====================================================================
-- `trg_create_invoice_on_subscription_created -> create_invoice_for_
-- subscription` maakt de eerste factuur bij het aanmaken van het
-- abonnement. Factuur 0006-125 kwam daar vandaan, en heeft:
--
--     subscription_id = NULL
--     period_start    = NULL
--
-- Dat is geen schoonheidsfoutje. Het breekt drie dingen tegelijk.
--
-- 1. DUBBEL FACTUREREN, VANNACHT. De duplicaat-grendel van
--    subscription_billing_run is
--
--        where i.subscription_id = r.id and i.period_start = v_period
--
--    en die vindt niets. PSM0006 staat op next_payment_date = vandaag,
--    status active, bedrag 200 -- dus de run van 03:00 maakt een TWEEDE
--    factuur van EUR 200. E2E0001 heeft al twee openstaande van samen
--    EUR 500 staan; dat is vermoedelijk dezelfde fout, al afgegaan.
--
-- 2. HIJ WORDT NOOIT GEÏND. De incasso-lus filtert op
--    `i.subscription_id is not null` en joint erop. De vervaldag die
--    plak 14 hem gaf helpt daar niet: hij komt de lus niet eens in.
--
-- 3. MET DE HAND BETALEN DOET NIETS. `_on_subscription_invoice_paid`
--    begint met `and new.subscription_id is not null`. Dus: geen
--    heractivering, de klok schuift niet, en de melding die plak 15
--    net heeft aangezet gaat niet af.
--
-- ── WAT DIT BESTAND DOET ─────────────────────────────────────────────
--
-- ALLEEN de rijen repareren. De trigger zelf raak ik niet aan voordat
-- ik zijn live body heb gezien -- die staat niet in de repo, en een
-- live body vervangen door de repo-versie heeft hier eerder productie
-- platgelegd. Regel 6 vraagt hem op.
--
-- Een weesfactuur wordt aan het abonnement gekoppeld en krijgt de
-- periode waar de grendel op test (`next_payment_date::date`), maar
-- ALLEEN als er voor die combinatie nog geen andere factuur bestaat.
-- Bestaat die wel, dan is er al dubbel gefactureerd en is het een
-- beslissing, geen reparatie: die laat ik staan en zet ik in regel 4.
--
-- Klanten met meer dan één abonnement sla ik ook over -- dan valt niet
-- af te leiden welke erbij hoort.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _wees (k text, v text);
delete from _wees;

do $blk0$
declare
  r        record;
  v_fixed  int := 0;
  v_dup    int := 0;
  v_many   int := 0;
begin
  for r in
    select i.id as inv_id,
           i.advertiser_id,
           i.total,
           i.currency,
           (select count(*) from public.subscriptions s2
             where s2.advertiser_id = i.advertiser_id
               and s2.status in ('active', 'past_due', 'paused', 'inactive')
           ) as n_subs,
           (select s3.id from public.subscriptions s3
             where s3.advertiser_id = i.advertiser_id
               and s3.status in ('active', 'past_due', 'paused', 'inactive')
             order by s3.created_at desc limit 1) as sub_id,
           (select s4.next_payment_date::date from public.subscriptions s4
             where s4.advertiser_id = i.advertiser_id
               and s4.status in ('active', 'past_due', 'paused', 'inactive')
             order by s4.created_at desc limit 1) as period
      from public.invoices i
     where i.type = 'subscription'
       and i.subscription_id is null
       and coalesce(i.status, '') not in ('paid', 'void', 'cancelled')
  loop
    if r.n_subs <> 1 then
      -- Nul of meer dan een: niet af te leiden welk abonnement erbij
      -- hoort, en gokken op een geldbedrag doe ik niet.
      v_many := v_many + 1;
      continue;
    end if;

    if r.period is null then
      v_many := v_many + 1;
      continue;
    end if;

    if exists (
      select 1 from public.invoices d
       where d.subscription_id = r.sub_id
         and d.period_start = r.period
         and d.id <> r.inv_id
    ) then
      -- Er staat al een factuur voor dezelfde periode. Koppelen zou
      -- twee facturen voor een maand opleveren; dat is een beslissing
      -- (welke wordt gestorneerd), geen reparatie.
      v_dup := v_dup + 1;
      continue;
    end if;

    update public.invoices
       set subscription_id = r.sub_id,
           period_start    = r.period,
           updated_at      = now()
     where id = r.inv_id;
    v_fixed := v_fixed + 1;
  end loop;

  insert into _wees values ('gekoppeld', v_fixed::text);
  insert into _wees values ('al dubbel', v_dup::text);
  insert into _wees values ('overgeslagen', v_many::text);
exception when others then
  insert into _wees values ('FOUT', sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'weesfacturen gekoppeld aan hun abonnement' as item,
  coalesce((select v from _wees where k = 'gekoppeld' limit 1),
           coalesce((select v from _wees where k = 'FOUT' limit 1), 'niets gelopen')) as antwoord
union all
select 2, 'overgeslagen: al een factuur voor dezelfde periode (BESLISSING NODIG)',
  coalesce((select v from _wees where k = 'al dubbel' limit 1), '-')
union all
select 3, 'overgeslagen: geen of meerdere abonnementen',
  coalesce((select v from _wees where k = 'overgeslagen' limit 1), '-')
union all
select 4, 'wie heeft nu MEER DAN EEN openstaande abonnementsfactuur',
  coalesce((
    select string_agg(x.code || ': ' || x.n::text || ' open, samen ' || x.bedrag,
                      E'\n' order by x.code)
      from (
        select a.tenant_client_code as code, count(*) n,
               string_agg(distinct upper(coalesce(i.currency, 'EUR')) || ' ' ||
                          to_char(i.total, 'FM999999990.00'), ' + ') as bedrag
          from public.invoices i
          join public.advertisers a on a.id = i.advertiser_id
         where i.type in ('subscription', 'subscription_adjustment')
           and coalesce(i.status, '') not in ('paid', 'void', 'cancelled')
         group by a.tenant_client_code
        having count(*) > 1
      ) x
  ), 'geen - opgelost')
union all
select 5, 'factuur 0006-125 nu',
  coalesce((
    select 'periode ' || coalesce(i.period_start::text, 'GEEN')
           || '  vervalt ' || coalesce(i.due_date::date::text, 'GEEN')
           || '  abonnement ' || case when i.subscription_id is null
                                      then 'NIET GEKOPPELD' else 'gekoppeld' end
           || '  |  klok staat op ' || coalesce((
                select s.next_payment_date::date::text
                  from public.subscriptions s
                 where s.id = i.subscription_id), '?')
      from public.invoices i
      join public.advertisers a on a.id = i.advertiser_id
     where a.tenant_client_code = 'PSM0006'
       and i.type = 'subscription'
     order by i.created_at desc limit 1
  ), 'niet gevonden')
union all
-- De trigger zelf raak ik niet aan voordat ik dit heb gezien.
select 6, 'STUUR TERUG >> body create_invoice_for_subscription',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'create_invoice_for_subscription'
     limit 1
  ), 'staat niet op deze database')
order by nr;
