-- =====================================================================
-- WAT-STAAT-ER-ECHT — alleen lezen. Eén resultaat, elf regels.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en row-level security geldt niet voor die rol. Er wordt
--   NIETS geschreven. Zo vaak draaien als je wilt.
--
-- WAAROM
--   Twee van de zwaarste geldgaten hebben een fix die alleen in
--   supabase/checks/RUN-NOW-2.sql staat — niet in supabase/migrations/,
--   in geen doc genoemd, in geen bundel. Uit de code is dus niet te zien
--   of ze ooit gedraaid zijn. Als ze er niet staan:
--
--     1  Een klant kiest ZELF de valuta van zijn eigen opname van een
--        ad-account, en goedkeuring boekt hem 1-op-1 bij. $1.000 opnemen
--        als EUR is €1.000 op de wallet = $1.163. Elke ronde +16%, door
--        de klant zelf, zo vaak als hij wil.
--     2  Een verlaging met terugbetaling leest-en-schrijft zonder slot,
--        dus twee kliks achter elkaar betalen allebei uit.
--
--   En drie dingen die ik moet weten voordat ik verder bouw:
--     3  Welke factuurtypes staan er echt in? (Jij zei dat er al
--        wallet-facturatie is; in de code maakt niets die regel aan.)
--     4  Zitten er nog facturen van de oude motor in — zonder
--        period_start of due_date? Die kan de incasso nooit afhandelen,
--        dus die blijven eeuwig open en blokkeren de klant.
--     5  Staat er ergens een opname met een andere valuta dan z'n
--        ad-account? Dat is de schade van punt 1, als die al geleden is.
-- =====================================================================

with regels(nr, wat, antwoord) as (

  select 1, 'Opname-valuta afgedwongen? (trigger _withdrawal_is_always_usd)',
         case when exists (
           select 1 from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relname = 'ad_account_withdrawals'
              and not t.tgisinternal
              and t.tgname like '%always_usd%'
         ) then 'JA — staat er' else 'NEE — GAT OPEN' end

  union all
  select 2, 'Dubbele terugbetaling geblokkeerd? (index wallet_adjustments_change_refund_uq)',
         case when exists (
           select 1 from pg_indexes
            where schemaname = 'public'
              and indexname = 'wallet_adjustments_change_refund_uq'
         ) then 'JA — staat er' else 'NEE — GAT OPEN' end

  union all
  select 3, 'Slot op de verlaging? (for update in change_subscription_amount)',
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'change_subscription_amount'
              and p.prokind = 'f'
              and p.prosrc ilike '%where id = p_subscription_id for update%'
         ) then 'JA — staat er' else 'NEE — GAT OPEN' end

  union all
  select 4, 'Factuurtypes die echt bestaan',
         coalesce((
           select string_agg(x.type || ' (' || x.n || ')', ', ' order by x.n desc)
             from (select coalesce(type, '(leeg)') as type, count(*) as n
                     from public.invoices group by 1) x
         ), 'geen facturen')

  union all
  select 5, 'Facturen van de OUDE motor (geen period_start of geen due_date)',
         (select count(*)::text from public.invoices
           where type = 'subscription'
             and status = 'unpaid'
             and (period_start is null or due_date is null))

  union all
  select 6, 'Klanten die daardoor geblokkeerd staan',
         (select count(distinct advertiser_id)::text from public.invoices
           where type = 'subscription'
             and status = 'unpaid'
             and (period_start is null or due_date is null))

  union all
  select 7, 'Opnames met een andere valuta dan hun ad-account',
         coalesce((
           select count(*)::text
             from public.ad_account_withdrawals w
             join public.ad_accounts a on a.id = w.ad_account_id
            where upper(coalesce(w.currency, '')) <>
                  upper(coalesce(a.currency, 'USD'))
         ), 'tabel of kolom bestaat niet')

  union all
  select 8, 'Goedgekeurde opnames zonder dekking (meer opgenomen dan gestort)',
         coalesce((
           select count(*)::text from (
             select w.ad_account_id,
                    sum(w.amount) as opgenomen,
                    coalesce((select sum(t.topup_amount) from public.top_ups t
                               where t.account_id = w.ad_account_id
                                 and t.status = 'completed'
                                 and coalesce(t.is_deleted, false) = false), 0) as gestort
               from public.ad_account_withdrawals w
              where w.status = 'approved'
              group by w.ad_account_id
           ) q where q.opgenomen > q.gestort
         ), 'niet te bepalen')

  union all
  select 9, 'Dubbele terugbetalingen die al gebeurd zijn',
         coalesce((
           select count(*)::text from (
             select reference from public.wallet_adjustments
              where reference like 'subscription_change_refund:%'
                and status = 'approved'
              group by reference having count(*) > 1
           ) q
         ), 'tabel bestaat niet')

  union all
  select 10, 'Abonnementen waarvan de betaaldatum vooruit staat zonder betaalde factuur',
         (select count(*)::text from public.subscriptions s
           where s.status = 'active'
             and s.next_payment_date > now()
             and not exists (select 1 from public.invoices i
                              where i.subscription_id = s.id
                                and i.status = 'paid'))

  union all
  select 11, 'Testaccounts @primescalemedia.test die nog bestaan',
         coalesce((
           select string_agg(email, ', ' order by email)
             from auth.users where email like '%@primescalemedia.test'
         ), 'geen — opgeruimd')
)
select nr as "#", wat as "vraag", antwoord as "antwoord"
  from regels order by nr;
