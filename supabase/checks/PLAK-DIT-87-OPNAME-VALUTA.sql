-- ════════════════════════════════════════════════════════════════════
-- PLAK 87 — de valuta van een opname mag niet meer veranderen ONDER de
--            goedkeuring
-- ════════════════════════════════════════════════════════════════════
--
-- `trg_withdrawal_takes_the_account_currency` staat op BEFORE INSERT OR
-- UPDATE (tgtype 23). Hij haalt de valuta bij het AD-ACCOUNT vandaan en
-- overschrijft wat de beller stuurde -- volkomen terecht bij het
-- INDIENEN: de klant mag niet kiezen in welke munt hij geld terugkrijgt.
--
-- Maar hij vuurt ook bij de goedkeuring. En
-- ad_account_withdrawal_approve doet:
--
--     select * into v_wd ... for update;      -- leest de valuta
--     ... crediteert de wallet op v_wd.currency ...
--     update ad_account_withdrawals set status = 'approved' ...
--                                       ^ hier vuurt de trigger opnieuw
--
-- Corrigeert een beheerder tussen indienen en goedkeuren de valuta van
-- het ad-account -- precies wat vandaag is gebeurd met D2-0011-WALK,
-- van USD naar EUR -- dan wordt de portemonnee gecrediteerd in de OUDE
-- munt terwijl de rij de NIEUWE registreert. Daarna klopt geen enkele
-- optelling over die rij meer, en niets op een scherm laat zien dat de
-- twee uit elkaar lopen.
--
-- De valuta hoort vast te staan op het moment van indienen. Dus:
-- alleen nog BEFORE INSERT.
--
-- (Het lek waar deze trigger voor gemaakt is blijft dicht: bij het
-- indienen wordt de valuta van de beller nog steeds overschreven, en de
-- weigering voor een munt die de wallets niet kennen blijft staan.)
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak87 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak87;

do $blk0$
declare
  v_before integer;
  v_after  integer;
begin
  select t.tgtype into v_before
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'ad_account_withdrawals'
     and p.proname = '_withdrawal_takes_the_account_currency'
     and not t.tgisinternal;

  drop trigger if exists trg_withdrawal_takes_the_account_currency
    on public.ad_account_withdrawals;

  -- BEFORE INSERT only. tgtype wordt 7 (ROW 1 + BEFORE 2 + INSERT 4)
  -- in plaats van 23 (daar zat UPDATE 16 bij).
  create trigger trg_withdrawal_takes_the_account_currency
    before insert on public.ad_account_withdrawals
    for each row
    execute function public._withdrawal_takes_the_account_currency();

  select t.tgtype into v_after
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'ad_account_withdrawals'
     and p.proname = '_withdrawal_takes_the_account_currency'
     and not t.tgisinternal;

  insert into _plak87 values (
    1, 'valuta staat vast bij indienen',
    'tgtype ' || coalesce(v_before::text, '?') || ' -> ' ||
    coalesce(v_after::text, '?') || ' (7 = alleen BEFORE INSERT)');
exception when others then
  insert into _plak87 values (1, 'valuta staat vast bij indienen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle: lopen er rijen uit de pas? ─────────────────────────────
--
-- Een opname waarvan de valuta niet meer die van zijn ad-account is, is
-- precies het geval dat hierboven beschreven staat. Alleen kijken, niets
-- veranderen: wat er al is moet met de hand worden beoordeeld.
do $blk1$
declare
  v_n integer;
  v_list text;
begin
  select count(*),
         coalesce(string_agg(w.reference || ' (' || w.currency || ' vs account ' ||
                             coalesce(a.currency, 'geen') || ', ' || w.status || ')',
                             ' | '), 'geen')
    into v_n, v_list
    from public.ad_account_withdrawals w
    join public.ad_accounts a on a.id = w.ad_account_id
   where upper(coalesce(w.currency, '')) <> upper(coalesce(a.currency, ''));

  insert into _plak87 values (
    2, 'opnames waarvan de valuta afwijkt van hun ad-account',
    v_n || ': ' || v_list);
exception when others then
  insert into _plak87 values (2, 'opnames waarvan de valuta afwijkt van hun ad-account',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak87 order by n;
