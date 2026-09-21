-- =====================================================================
-- PLAK 30 — waar hoort commissie te ontstaan. LEEST ALLEEN.
-- =====================================================================
-- Gelopen op productie: PSM0007 is aangemaakt met PSM0005 als referrer,
-- de link staat op Active met 10% "Topup %", PSM0007 heeft EUR 100 in
-- zijn wallet gestort en de eigenaar heeft die geverifieerd.
--
--   /commissions          "No commissions yet."
--   /affiliates earnings  leeg
--
-- Er is dus niets geboekt. Volgens de eigenaar is dat de JUISTE uitkomst
-- -- commissie hoort bij een AD-ACCOUNT-topup, niet bij het vullen van
-- de wallet -- maar ik wil weten of het bewust niet gebeurde of stil
-- misging, want die twee zien er op het scherm identiek uit.
--
-- Wat plak 28 liet zien: er hangen TWEE accrual-triggers.
--
--   wallet_topups : trg_accrue_referral_commission -> _accrue_referral_commission
--   top_ups       : trg_handle_referral_commission -> handle_referral_commission_on_topup
--
-- De eerste staat in de repo (20260831130000) en rekent
-- `new.amount * commission_pct / 100` over de WALLET-storting. De tweede
-- staat NERGENS in deze repo -- hand geschreven op live -- dus ik kan
-- niet lezen wat hij doet.
--
-- De hele accrual zit bovendien in `exception when others then raise
-- warning`, dus een fout erin verdwijnt zonder dat er iets op een scherm
-- komt. "Geen commissie" en "de boeking klapte" zijn van buiten niet te
-- onderscheiden.
--
-- Regel 1 en 2 halen de twee bodies op. Die bepalen wat er moet
-- veranderen: als de wallet-trigger hoort te verdwijnen, moet ik eerst
-- weten of de andere het werk al doet.
--
-- Veilig om vaker te draaien. Er wordt niets geschreven.
-- =====================================================================

set search_path = public;

create temporary table if not exists _cm (nr int, item text, v text);
delete from _cm;

do $blk0$
declare v text;
begin
  begin
    insert into _cm values (1, 'STUUR TERUG >> body _accrue_referral_commission (op wallet_topups)',
      coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = '_accrue_referral_commission'
                 limit 1), 'staat niet op deze database'));
  exception when others then
    insert into _cm values (1, 'body _accrue_referral_commission', 'MISLUKT: ' || sqlerrm);
  end;

  begin
    insert into _cm values (2, 'STUUR TERUG >> body handle_referral_commission_on_topup (op top_ups)',
      coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'handle_referral_commission_on_topup'
                 limit 1), 'staat niet op deze database'));
  exception when others then
    insert into _cm values (2, 'body handle_referral_commission_on_topup', 'MISLUKT: ' || sqlerrm);
  end;

  -- 3 ── De link zoals hij er staat. commission_type bepaalt of de
  --      accrual hem uberhaupt oppakt.
  begin
    insert into _cm values (3, 'de referral-link PSM0005 -> PSM0007',
      coalesce((
        select string_agg('status=' || coalesce(rl.status, 'null') ||
                          ' | type=' || coalesce(rl.commission_type::text, 'null') ||
                          ' | pct=' || coalesce(rl.commission_pct::text, 'null') ||
                          ' | monthly=' || coalesce(rl.commission_monthly::text, 'null') ||
                          ' | onetime=' || coalesce(rl.commission_onetime::text, 'null') ||
                          ' | currency=' || coalesce(rl.commission_currency::text, 'null') ||
                          ' | earnings ' || coalesce(rl.earnings_eur::text, 'null') || ' EUR / ' ||
                          coalesce(rl.earnings_usd::text, 'null') || ' USD',
                          E'\n')
          from public.referral_links rl
      ), 'geen links'));
  exception when others then
    insert into _cm values (3, 'de referral-link', 'MISLUKT: ' || sqlerrm);
  end;

  -- 4 ── Is die wallet-storting echt completed geraakt?
  begin
    insert into _cm values (4, 'de wallet-storting van PSM0007',
      coalesce((
        select string_agg(wt.reference_no || ': ' || wt.amount::text || ' ' ||
                          coalesce(wt.currency, '?') || ' status=' ||
                          coalesce(wt.status, '?'), E'\n')
          from public.wallet_topups wt
         where wt.reference_no like '0007-%'
      ), 'geen storting met 0007-'));
  exception when others then
    insert into _cm values (4, 'de wallet-storting', 'MISLUKT: ' || sqlerrm);
  end;

  -- 5 ── Staat er al ooit een commissierij?
  begin
    insert into _cm values (5, 'commissierijen in totaal',
      (select count(*)::text from public.referral_commissions));
  exception when others then
    insert into _cm values (5, 'commissierijen', 'tabel bestaat niet');
  end;

  -- 6 ── Welke tabel voedt de accrual: de wallet of het ad-account?
  begin
    insert into _cm values (6, 'accrual-triggers, op welke tabel',
      coalesce((
        select string_agg(c.relname || ' :: ' || t.tgname || ' -> ' || p.proname ||
                          '  (' || case when t.tgenabled = 'D' then 'UIT' else 'aan' end || ')',
                          E'\n' order by c.relname, t.tgname)
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_proc p on p.oid = t.tgfoid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and not t.tgisinternal
           and (p.proname ilike '%referral_commission%' or p.proname ilike '%commission%')
      ), 'geen'));
  exception when others then
    insert into _cm values (6, 'accrual-triggers', 'MISLUKT: ' || sqlerrm);
  end;

  -- 7 ── De waarde die de accrual met een lijst vergelijkt. Staat er
  --      'pct' en verwacht de functie 'percentage', dan pakt hij hem
  --      nooit op -- en zegt daar niets over.
  begin
    select coalesce(string_agg(x.t || '=' || x.n::text, ' | ' order by x.n desc), 'geen')
      into v
      from (select coalesce(commission_type::text, '(null)') as t, count(*) as n
              from public.referral_links group by 1) x;
    insert into _cm values (7, 'commission_type-waarden die echt voorkomen', v);
  exception when others then
    insert into _cm values (7, 'commission_type-waarden', 'MISLUKT: ' || sqlerrm);
  end;
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select nr, item, v as antwoord from _cm order by nr;
