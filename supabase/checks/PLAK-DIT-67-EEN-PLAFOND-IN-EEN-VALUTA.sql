-- ════════════════════════════════════════════════════════════════════
--  PLAK 67 — een opnameplafond telt maar één valuta, en een voorschot
--             is niet van de klant
--
--  GEVONDEN OP D3 (aanvragen en opnames), met de rekenbril.
--
--  GAT 1 — HET PLAFOND IN DE DATABASE TELT VALUTA'S BIJ ELKAAR OP.
--  Twee plekken rekenen uit hoeveel er van een ad-account af mag:
--  `_withdrawal_within_the_account` (bij het indienen) en
--  `ad_account_withdrawal_approve` (bij het goedkeuren). Allebei doen ze
--  `sum(t.topup_amount)` over ALLE voltooide stortingen, zonder naar de
--  valuta te kijken.
--
--  Maar `topup_amount` is niet altijd dezelfde munt: bij een storting
--  die de KLANT zelf doet staat hij in de valuta van het account (en de
--  dollarwaarde in topup_usd), bij een storting die een ADMIN invoert
--  staat hij in dollars. Een euro-account dat door een admin met USD 500
--  en door de klant met EUR 194 gevuld is, geeft dus een plafond van
--  694 — en `ad_account_withdrawal_approve` schrijft daarna
--  `eur_balance + 694`. Die 500 waren dollars. EUR 500 uit het niets.
--
--  De server (TypeScript) rekent het al wél per valuta uit, dus vandaag
--  vangt die het af. Maar de functie staat via PostgREST open voor elke
--  ingelogde adverteerder, en dan is er geen server tussen.
--
--  NAGEMETEN: op dit moment heeft geen enkel account stortingen in twee
--  valuta's, dus er is nog niets misgegaan.
--
--  GAT 2 — EEN VOORSCHOT KAN NAAR DE BANK VAN DE KLANT.
--  Een voorschot zet krediet in de wallet vóórdat de betaling binnen is.
--  `wallet_refund_approve` kijkt alleen naar het saldo, niet naar wat
--  daarvan nog een openstaand voorschot is. Dus: EUR 5.000 voorschot op
--  een storting die nooit aankomt, klant vraagt zijn saldo terug, en wij
--  maken EUR 5.000 over voor geld dat nooit is binnengekomen. Het
--  voorschot blijft dan ook nog openstaan, want annuleren weigert bij
--  een leeg saldo.
--
--  WAT DIT BLOK DOET
--    A  operatie op de twee plafondfuncties: het leest de tekst zoals
--       die NU draait, zet er de valuta-voorwaarde in, controleert dat
--       het gelukt is, en zet hem terug. Geen overtypwerk.
--    B  een poort op wallet_refunds: goedkeuren kan niet als het saldo
--       min de openstaande voorschotten te laag is. Die geldt voor
--       iedereen, ook voor de functie zelf.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p67;
create temp table _p67(nr int, wat text, uitkomst text);

-- ── A. HET PLAFOND PER VALUTA ────────────────────────────────────────
do $blk0$
declare
  v_def  text;
  v_new  text;
  v_n    int;
  v_done text := '';
  r      record;
begin
  for r in
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
           p.proname,
           case when p.proname = 'ad_account_withdrawal_approve' then 'v_wd' else 'new' end as bron
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('_withdrawal_within_the_account', 'ad_account_withdrawal_approve')
  loop
    begin
      v_def := pg_get_functiondef(r.sig::regprocedure);
      v_new := v_def;

      -- De stortingen: alleen die in dezelfde munt als deze opname.
      v_new := replace(v_new,
        'and t.status = ''completed''' || chr(10) ||
        '       and coalesce(t.is_deleted, false) = false;',
        'and t.status = ''completed''' || chr(10) ||
        '       and coalesce(t.is_deleted, false) = false' || chr(10) ||
        '       and case when t.topup_usd is not null' || chr(10) ||
        '                then upper(coalesce(t.currency, ''EUR''))' || chr(10) ||
        '                else ''USD'' end' || chr(10) ||
        '           = upper(coalesce(' || r.bron || '.currency, ''USD''));');

      v_new := replace(v_new,
        'and t.status = ''completed'';',
        'and t.status = ''completed''' || chr(10) ||
        '       and case when t.topup_usd is not null' || chr(10) ||
        '                then upper(coalesce(t.currency, ''EUR''))' || chr(10) ||
        '                else ''USD'' end' || chr(10) ||
        '           = upper(coalesce(' || r.bron || '.currency, ''USD''));');

      -- En de opnames die er al af zijn: ook alleen dezelfde munt.
      v_new := replace(v_new,
        'and lower(coalesce(w.status, '''')) not in (''rejected'', ''cancelled'');',
        'and lower(coalesce(w.status, '''')) not in (''rejected'', ''cancelled'')' || chr(10) ||
        '     and upper(coalesce(w.currency, ''USD''))' || chr(10) ||
        '         = upper(coalesce(' || r.bron || '.currency, ''USD''));');

      v_n := (length(v_new) - length(replace(v_new, 'upper(coalesce(' || r.bron || '.currency', ''))) /
             length('upper(coalesce(' || r.bron || '.currency');

      if v_new = v_def or v_n < 3 then
        v_done := v_done || r.proname || ': NIET AANGEPAST (' || v_n::text || ' van 3 plekken herkend) · ';
      else
        execute v_new;
        v_done := v_done || r.proname || ': ' || v_n::text || ' plekken · ';
      end if;
    exception when others then
      v_done := v_done || r.proname || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p67 values (1, 'plafond per valuta',
    case when v_done = '' then 'geen van beide functies gevonden' else rtrim(v_done, ' ·') end);
end
$blk0$;

-- ── B. EEN OPENSTAAND VOORSCHOT IS NIET VAN DE KLANT ─────────────────
create or replace function public._guard_refund_not_from_an_advance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_bal      numeric;
  v_advanced numeric;
begin
  if coalesce(new.status, '') <> 'approved'
     or coalesce(old.status, '') = 'approved' then
    return new;
  end if;

  select case when upper(coalesce(new.currency, 'EUR')) = 'USD'
              then coalesce(w.usd_balance, 0)
              else coalesce(w.eur_balance, 0) end
    into v_bal
    from public.wallets w
   where w.id = new.wallet_id;

  select coalesce(sum(p.outstanding), 0)
    into v_advanced
    from public.wallet_precharges p
   where p.wallet_id = new.wallet_id
     and p.status = 'outstanding'
     and upper(coalesce(p.currency, 'EUR')) = upper(coalesce(new.currency, 'EUR'));

  if coalesce(v_advanced, 0) > 0
     and coalesce(v_bal, 0) - v_advanced < new.amount then
    raise exception 'Van dit saldo is % nog een openstaand voorschot — geld dat wij erin gezet hebben vóórdat de betaling binnen was. Reken dat voorschot eerst af of draai het terug; er is maar % van de klant zelf.',
      to_char(v_advanced, 'FM999G990D00'),
      to_char(greatest(coalesce(v_bal, 0) - v_advanced, 0), 'FM999G990D00')
      using errcode = '22000';
  end if;

  return new;
end;
$blk1$;

do $blk2$
begin
  execute 'drop trigger if exists a0_guard_refund_not_from_an_advance on public.wallet_refunds';
  execute 'create trigger a0_guard_refund_not_from_an_advance
             before update on public.wallet_refunds
             for each row execute function public._guard_refund_not_from_an_advance()';
  insert into _p67 values (2, 'terugbetaling vs voorschot',
    'goedkeuren kan niet meer als het saldo min de openstaande voorschotten te laag is — geldt ook voor de functie zelf');
exception when others then
  insert into _p67 values (2, 'terugbetaling vs voorschot', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── C. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk3$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(p.proname || ': ' ||
             (case when pg_get_functiondef(p.oid) ilike '%topup_usd is not null%' then 'per valuta'
                   else 'TELT NOG ALLES OP' end), ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('_withdrawal_within_the_account', 'ad_account_withdrawal_approve');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p67 values (3, 'controle op de twee functies', v_txt);

  begin
    select coalesce(count(*)::text || ' accounts met stortingen in twee valuta', '0')
      into v_txt
      from (
        select t.account_id
          from public.top_ups t
         where t.status = 'completed' and coalesce(t.is_deleted, false) = false
         group by t.account_id
        having count(distinct case when t.topup_usd is not null
                                   then upper(coalesce(t.currency, 'EUR')) else 'USD' end) > 1
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p67 values (4, 'is er al iets misgegaan', v_txt);
end
$blk3$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p67 order by nr;
