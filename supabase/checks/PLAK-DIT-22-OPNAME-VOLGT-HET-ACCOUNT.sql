-- =====================================================================
-- PLAK 22 — een opname krijgt de valuta van het ACCOUNT, niet USD
-- =====================================================================
-- `trg_withdrawal_is_always_usd` doet onvoorwaardelijk
--
--     new.currency := 'USD';
--
-- op elke insert en op elke update van currency. Hij is met goede reden
-- aangelegd: de RPC nam p_currency van de beller en controleerde alleen
-- of het USD of EUR was, dus $1.000 saldo als EUR 1.000 terugvragen
-- crediteerde eur_balance met 1.000 -- ongeveer $1.163, herhaalbaar.
-- De valuta uit handen van de beller halen was precies goed.
--
-- Maar de premisse eronder staat er ook bij: "an ad account is funded
-- in USD by construction". Dat is niet zo. Gemeten op deze database:
--
--     AA-PSM0005-EU-01   ad_accounts.currency = EUR
--     top_ups            topup_amount 194.00   topup_usd 222.38
--
-- topup_amount is de BETAALvaluta op de route van de klant en dollars
-- op de admin-routes -- daar is lib/pure-topup-landed.ts voor. Een
-- EUR-account houdt dus euro's, en die horen als euro's terug te komen.
--
-- De app stuurt dat sinds vandaag ook (dialoog, server action en
-- goedkeurcontrole rekenen alle drie in de valuta van het account),
-- maar deze trigger schreef er USD overheen. WD-081494 staat daardoor
-- op USD terwijl de dialoog EUR 50,00 liet zien.
--
-- ── WAT DIT DOET ─────────────────────────────────────────────────────
--
-- De valuta blijft uit handen van de beller -- dat lek blijft dicht --
-- maar hij wordt nu van het AD-ACCOUNT gelezen in plaats van
-- aangenomen. Wat erop staat is wat eraf komt.
--
-- De oude functie blijft bestaan en wordt alleen niet meer aangeroepen;
-- er wordt niets weggegooid dat teruggedraaid zou moeten worden.
--
-- ── EN DE RIJEN DIE ER AL STAAN ──────────────────────────────────────
--
-- Alleen OPENSTAANDE opnames worden bijgetrokken. Een goedgekeurde rij
-- blijft staan zoals hij is: daar is geld op bewogen en dat herschrijf
-- ik niet met een update. Er zijn er vandaag geen -- al_gevraagd stond
-- op 0 -- maar de regel hoort er te staan.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _wd (k text, v text);
delete from _wd;

insert into _wd
select 'voor',
  coalesce((
    select string_agg(w.reference || ': ' || w.amount::text || ' ' ||
                      coalesce(w.currency, '?') || ' (' || coalesce(w.status, '?') ||
                      ') op een ' || coalesce(a.currency, '?') || '-account',
                      E'\n' order by w.created_at desc)
      from public.ad_account_withdrawals w
      join public.ad_accounts a on a.id = w.ad_account_id
     where coalesce(w.status, '') = 'pending'
  ), 'geen openstaande opnames');

create or replace function public._withdrawal_takes_the_account_currency()
returns trigger
language plpgsql
as $blk0$
declare
  v_cur text;
begin
  -- DE VALUTA BLIJFT UIT HANDEN VAN DE BELLER. Dat was het punt van de
  -- trigger die hier stond, en dat lek blijft dicht: wat p_currency ook
  -- zegt, hij wordt overschreven. Alleen niet meer met een aanname.
  select upper(coalesce(a.currency, 'USD'))
    into v_cur
    from public.ad_accounts a
   where a.id = new.ad_account_id;

  -- Een account met een valuta die de wallets niet kennen kan nergens
  -- heen: ad_account_withdrawal_approve vertakt op USD en EUR en doet
  -- anders niets, wat een goedkeuring zou laten slagen zonder dat er
  -- geld beweegt. Dan liever weigeren.
  if v_cur is null then
    raise exception 'Dat ad-account bestaat niet, dus er is geen valuta om deze opname in te doen.'
      using errcode = '42704';
  end if;
  if v_cur not in ('USD', 'EUR') then
    raise exception 'Dat ad-account staat in %, en daar is geen wallet voor.', v_cur
      using errcode = '22000';
  end if;

  new.currency := v_cur;
  return new;
end;
$blk0$;

drop trigger if exists trg_withdrawal_is_always_usd
  on public.ad_account_withdrawals;
drop trigger if exists trg_withdrawal_takes_the_account_currency
  on public.ad_account_withdrawals;
create trigger trg_withdrawal_takes_the_account_currency
  before insert or update of currency on public.ad_account_withdrawals
  for each row execute function public._withdrawal_takes_the_account_currency();

-- ── De openstaande rijen bijtrekken ──────────────────────────────────
do $blk1$
declare
  v_n int := 0;
begin
  with fixed as (
    update public.ad_account_withdrawals w
       set currency = upper(coalesce(a.currency, 'USD')),
           updated_at = now()
      from public.ad_accounts a
     where a.id = w.ad_account_id
       and coalesce(w.status, '') = 'pending'
       and upper(coalesce(w.currency, '')) <> upper(coalesce(a.currency, 'USD'))
       and upper(coalesce(a.currency, 'USD')) in ('USD', 'EUR')
    returning 1
  )
  select count(*) into v_n from fixed;
  insert into _wd values ('bijgewerkt', v_n::text || ' openstaande opname(s)');
exception when others then
  insert into _wd values ('bijgewerkt', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'welke trigger hangt er nu aan' as item,
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'ad_account_withdrawals'
       and c.relnamespace = 'public'::regnamespace
       and not t.tgisinternal
  ), 'geen') as antwoord
union all
select 2, 'stond de altijd-USD trigger er nog (die hoort weg te zijn)',
  case when exists (
    select 1 from pg_trigger
     where tgname = 'trg_withdrawal_is_always_usd' and not tgisinternal
  ) then 'JA - NIET GOED, zeg het meteen' else 'nee - vervangen' end
union all
select 3, 'openstaande opnames VOOR deze plak',
  coalesce((select v from _wd where k = 'voor' limit 1), '?')
union all
select 4, 'bijgewerkt',
  coalesce((select v from _wd where k = 'bijgewerkt' limit 1), '?')
union all
select 5, 'openstaande opnames NA deze plak',
  coalesce((
    select string_agg(w.reference || ': ' || w.amount::text || ' ' ||
                      coalesce(w.currency, '?') || ' op een ' ||
                      coalesce(a.currency, '?') || '-account',
                      E'\n' order by w.created_at desc)
      from public.ad_account_withdrawals w
      join public.ad_accounts a on a.id = w.ad_account_id
     where coalesce(w.status, '') = 'pending'
  ), 'geen openstaande opnames')
union all
-- Als er ooit een GOEDGEKEURDE opname in de verkeerde valuta staat, is
-- daar echt geld op bewogen. Die herschrijf ik niet; die moet iemand
-- zien.
select 6, 'GOEDGEKEURDE opnames waarvan de valuta niet bij het account past',
  coalesce((
    select string_agg(w.reference || ': ' || w.amount::text || ' ' ||
                      coalesce(w.currency, '?') || ' op een ' ||
                      coalesce(a.currency, '?') || '-account',
                      E'\n' order by w.created_at desc)
      from public.ad_account_withdrawals w
      join public.ad_accounts a on a.id = w.ad_account_id
     where coalesce(w.status, '') = 'approved'
       and upper(coalesce(w.currency, '')) <> upper(coalesce(a.currency, 'USD'))
  ), 'geen - er is nooit geld in de verkeerde valuta uitgekeerd')
order by nr;
