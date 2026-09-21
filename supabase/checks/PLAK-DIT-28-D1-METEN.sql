-- =====================================================================
-- PLAK 28 — D1 meten. LEEST ALLEEN, verandert NIETS.
-- =====================================================================
-- De sweep op de adminwachtrijen kwam terug met vijf bevindingen die
-- allemaal op EEN oorzaak neerkomen:
--
--   "Enable ALL for admin" on <tabel>
--     for all to authenticated
--     using (_is_admin_of(tenant_id)) with check (_is_admin_of(tenant_id))
--
-- Die `with check` test WIE de rij bezit en niets over WAT erin komt, en
-- `_is_admin_of` kent het verschil tussen de eigenaar en een medewerker
-- niet. Postgres kijkt bovendien eerst naar het GRANT en pas daarna naar
-- de policy. En op `wallet_topups` hangt een saldo-trigger die bij
-- status 'completed' de wallet crediteert.
--
-- Vanuit de console van een ingelogde medewerker-admin is dat:
--
--   insert into wallet_topups (... status 'pending' ...)
--   update wallet_topups set status = 'completed' where id = ...
--
-- en er staat EUR 250.000 op een wallet, met `approved_by` leeg zodat
-- geen enkel scherm laat zien wie het deed. Er wordt geen functie
-- aangeroepen, dus elke controle in `wallet_topup_admin_verify` wordt
-- overgeslagen. Het komt wel in `audit_events` -- nateeltbaar, niet
-- tegengehouden.
--
-- Dezelfde vorm op `top_ups` verslaat de eigenaar-only fee-poort, en op
-- `ad_account_requests` laat hij een afwijzing zonder de terugbetaling
-- van de EUR 50 toe -- waarna `ad_account_request_reject_refund` de rij
-- weigert OMDAT hij al afgewezen is, dus dat geld kan er via de app
-- nooit meer uit.
--
-- ── WAAROM DIT EERST MEET EN NIET METEEN REPAREERT ───────────────────
--
-- Repo en live lopen op dit project uit elkaar, en twee eerdere plakken
-- (4 en 21) raken precies deze tabellen. Als plak 21 al geplakt is, is
-- `insert` op `top_ups` al ingetrokken -- en `createTopupAsAdmin` en
-- `bulkCreateTopupsAsAdmin` schrijven met de sessie van de beller, dus
-- dan ligt het aanmaken van admin-topups NU al plat. Regel 2 zegt welke.
-- Eerst kijken wat er staat, dan pas intrekken.
--
-- Regel 14 en 15 halen de twee functiebodies op die NIET in deze repo
-- staan. Bij allebei kan `execute` niet ingetrokken worden -- de wrapper
-- belt ze met de sessie van de beller en de functie leest zelf
-- `auth.uid()` -- dus de poort hoort IN de functie, en daarvoor moet ik
-- hem eerst kunnen lezen.
--
-- Veilig om vaker te draaien. Er wordt niets geschreven.
-- =====================================================================

set search_path = public;

create temporary table if not exists _d1 (nr int, item text, antwoord text);
delete from _d1;

-- 1-5 ── De GRANTs. Die komen vóór de policy. -------------------------
insert into _d1
select n.nr, 'schrijfrechten van authenticated/anon op ' || n.t,
       coalesce((
         select string_agg(distinct g.privilege_type, ', '
                           order by g.privilege_type)
           from information_schema.role_table_grants g
          where g.table_schema = 'public' and g.table_name = n.t
            and g.grantee in ('authenticated', 'anon')
            and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
       ), 'geen - dicht')
  from (values (1, 'wallet_topups'), (2, 'top_ups'),
               (3, 'ad_account_requests'), (4, 'ad_account_withdrawals'),
               (5, 'wallets')) as n(nr, t);

-- 6 ── Toetsen de schrijfpolicies WIE, of ook WAT? --------------------
insert into _d1
select 6, 'schrijfpolicies op de wachtrijtabellen (with check = wat erin mag)',
  coalesce((
    select string_agg(tablename || '.' || policyname || ' [' || cmd ||
                      ']  check: ' || coalesce(with_check, '-'),
                      E'\n' order by tablename, policyname)
      from pg_policies
     where schemaname = 'public'
       and tablename in ('wallet_topups', 'top_ups', 'ad_account_requests',
                         'ad_account_withdrawals', 'wallets')
       and cmd in ('ALL', 'INSERT', 'UPDATE')
  ), 'geen');

-- 7-9 ── Hangt er een kolomslot op de geldtabellen? -------------------
insert into _d1
select n.nr, 'triggers op ' || n.t || ' (is er een kolomslot)',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = n.t and c.relnamespace = 'public'::regnamespace
       and not t.tgisinternal
  ), 'GEEN')
  from (values (7, 'wallet_topups'), (8, 'top_ups'),
               (9, 'ad_account_withdrawals')) as n(nr, t);

-- 10 ── Staat het opnameplafond er als trigger op? --------------------
insert into _d1
select 10, 'plafondtrigger trg_withdrawal_within_the_account',
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_withdrawal_within_the_account'
                       and not tgisinternal)
       then 'aan' else 'NIET AANGELEGD' end;

-- 11 ── De discriminator in de view -----------------------------------
--       Staat `topup_usd` niet in de view, dan leest ELKE rij in de
--       ad-account-wachtrij als een adminrij en wordt elk bedrag in
--       dollars gedrukt, ook de euro's.
insert into _d1
select 11, 'top_ups_view levert topup_usd (anders leest elke rij als USD)',
  case when to_regclass('public.top_ups_view') is null then 'view bestaat niet'
       when exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'top_ups_view'
                       and column_name = 'topup_usd')
       then 'ja' else 'NEE - zeg het meteen' end;

do $blk0$
begin
  insert into _d1
  select 12, 'klantrijen (topup_usd gevuld) die niet in USD staan',
         (select count(*)::text from public.top_ups
           where topup_usd is not null
             and upper(coalesce(currency, '')) <> 'USD');
exception when others then
  insert into _d1 values (12, 'klantrijen die niet in USD staan',
                          'niet te lezen: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

do $blk1$
begin
  insert into _d1
  select 13, 'afgewezen opnames met tekst in de GEDEELDE reason-kolom',
         (select count(*)::text from public.ad_account_withdrawals
           where status = 'rejected' and coalesce(trim(reason), '') <> '');
exception when others then
  insert into _d1 values (13, 'afgewezen opnames met tekst in reason',
                          'niet te lezen: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- 14-15 ── De twee bodies die niet in de repo staan -------------------
insert into _d1
select n.nr, 'STUUR TERUG >> body ' || n.f,
  coalesce((select pg_get_functiondef(p.oid)
              from pg_proc p
              join pg_namespace ns on ns.oid = p.pronamespace
             where ns.nspname = 'public' and p.proname = n.f
             limit 1),
           'staat niet op deze database')
  from (values (14, 'top_up_admin_verify'),
               (15, 'ad_account_withdrawal_approve')) as n(nr, f);

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select nr, item, antwoord from _d1 order by nr;
