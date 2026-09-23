-- ════════════════════════════════════════════════════════════════════
--  PLAK 61 — de laatste deur waardoor een medewerker geld kan maken
--
--  GEVONDEN OP D1 (admin-wachtrijen), met de rechten-bril. Plak 56 zette
--  facturen, stortingen, inkoopprijzen en ad-account-types op slot. Eén
--  tabel bleef over, en het is net de tabel waar EUR 50 per aanvraag
--  doorheen loopt.
--
--  WAT ER NU KAN. De terugbetaling van een geweigerde aanvraag leest het
--  bedrag uit `metadata->>'request_fee'`, en of hij al terugbetaald is
--  uit de kolom `refunded_at`. Bij het AANMAKEN gooit de app het veld
--  request_fee expres uit wat de klant meestuurt -- maar bij het
--  WIJZIGEN staat de hele tabel open voor elke admin van de tenant. Dus:
--
--    update ad_account_requests
--       set metadata = '{"request_fee": 250000}', status = 'pending',
--           refunded_at = null
--     where id = ...;
--    -- en dan gewoon op Reject drukken
--
--  Dat is EUR 250.000 in een wallet, en het kan zo vaak als je wilt.
--  Eén regel in de browserconsole, geen functie aangeroepen, geen spoor
--  behalve audit_events.
--
--  EN ANDERSOM. `update ... set status = 'rejected'` slaat de
--  terugbetaling over, en daarna weigert de terugbetaalfunctie de rij
--  voor altijd ("die is al afgewezen"). De klant is EUR 50 kwijt en geen
--  enkel scherm kan het nog rechtzetten.
--
--  DIT BLOK DOET DRIE DINGEN
--    A  zet op ad_account_requests dezelfde poort als op stortingen:
--       een sessie mag alleen status, reden en notities wijzigen, en
--       afwijzen gaat via de functie die het geld teruggeeft
--    B  haalt het recht weg om FACTUREN te verwijderen. Dat was verleend
--       aan een ingelogde sessie én aan anon, er staat geen poort op, en
--       aan facturen hangt referral_commissions met ON DELETE CASCADE --
--       dus een factuur wissen wist stilletjes de commissie van de
--       affiliate mee, zonder zijn saldo te corrigeren.
--    C  haalt het uitvoerrecht van de geld-functies weg bij anon. Dat
--       kan vandaag niets (de functies eisen een ingelogde admin), maar
--       het hoort daar niet te staan.
--
--  WAT ER VOOR EEN MEDEWERKER BLIJFT: een aanvraag oppakken, op
--  betaald/voltooid zetten, notities schrijven, en afwijzen via de
--  gewone knop -- die geeft de EUR 50 terug en eist een reden.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p61;
create temp table _p61(nr int, wat text, uitkomst text);

-- ── A. DE POORT OP AANVRAGEN ─────────────────────────────────────────
create or replace function public._guard_ad_account_requests_session_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk0$
declare
  -- Wat het werk van een admin is. Al het andere -- het bedrag, de
  -- klant, de terugbetaalstempel -- is van de functie.
  v_allowed text[] := array['status', 'rejection_reason', 'notes', 'updated_at'];
begin
  -- De functies (die draaien als postgres) en de service-sleutel gaan
  -- vrij; deze poort kijkt alleen naar een schrijfactie vanuit een
  -- ingelogde sessie.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'ad_account_requests: alleen status, reden en notities kunnen hier veranderen — het bedrag, de klant en de terugbetaalstempel zijn van de functie'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and coalesce(old.status, '') in ('completed', 'rejected') then
    raise exception 'ad_account_requests: een % aanvraag verandert hier niet meer van status', old.status
      using errcode = '42501';
  end if;

  if new.status = 'rejected' and coalesce(old.status, '') <> 'rejected' then
    raise exception 'ad_account_requests: afwijzen gaat via ad_account_request_reject_refund — die geeft de fee terug en eist een reden'
      using errcode = '42501';
  end if;

  return new;
end;
$blk0$;

do $blk1$
begin
  execute 'drop trigger if exists a0_guard_ad_account_requests_session_write on public.ad_account_requests';
  execute 'create trigger a0_guard_ad_account_requests_session_write
             before update on public.ad_account_requests
             for each row execute function public._guard_ad_account_requests_session_write()';
  insert into _p61 values (1, 'aanvragen',
    'op slot — een sessie kan het bedrag, de klant en refunded_at niet meer schrijven, en afwijzen loopt via de functie');
exception when others then
  insert into _p61 values (1, 'aanvragen', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── B. FACTUREN VERWIJDEREN ──────────────────────────────────────────
do $blk2$
declare v_txt text := '';
begin
  begin
    execute 'revoke delete on public.invoices from authenticated, anon';
    v_txt := 'facturen: verwijderen ingetrokken';
  exception when others then
    v_txt := 'facturen MISLUKT: ' || sqlerrm;
  end;

  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'advertiser_perks') then
    begin
      execute 'revoke insert, update, delete on public.advertiser_perks from authenticated, anon';
      v_txt := v_txt || ' · perks: schrijven ingetrokken (lezen blijft)';
    exception when others then
      v_txt := v_txt || ' · perks MISLUKT: ' || sqlerrm;
    end;
  else
    v_txt := v_txt || ' · perks: tabel bestaat niet';
  end if;

  insert into _p61 values (2, 'wat een sessie mag wissen', v_txt);
end
$blk2$;

-- ── C. ANON HOORT NIET AAN DE GELD-FUNCTIES ──────────────────────────
do $blk3$
declare
  v_names text[] := array[
    'wallet_topup_admin_verify', 'wallet_topup_admin_reject', 'wallet_topup_admin_undo',
    'ad_account_withdrawal_approve', 'ad_account_withdrawal_reject',
    'wallet_refund_approve', 'wallet_refund_reject',
    'wallet_adjustment_approve', 'wallet_adjustment_reject'
  ];
  v_name text;
  v_sig  text;
  v_done text := '';
  v_n    int := 0;
begin
  foreach v_name in array v_names loop
    for v_sig in
      select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name and p.prokind = 'f'
    loop
      begin
        execute 'revoke execute on function ' || v_sig || ' from anon';
        v_n := v_n + 1;
      exception when others then
        v_done := v_done || v_name || ' MISLUKT · ';
      end;
    end loop;
  end loop;
  insert into _p61 values (3, 'anon bij geld-functies',
    v_n::text || ' ingetrokken' || case when v_done = '' then '' else ' · ' || rtrim(v_done, ' ·') end);
exception when others then
  insert into _p61 values (3, 'anon bij geld-functies', 'MISLUKT: ' || sqlerrm);
end
$blk3$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk4$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(x.t || ': ' ||
             case when x.ins then 'insert ' else '' end ||
             case when x.upd then 'update ' else '' end ||
             case when x.del then 'delete' else '' end ||
             case when not (x.ins or x.upd or x.del) then 'niets' else '' end, ' · ' order by x.t)
           , 'geen')
      into v_txt
      from (
        select c.relname as t,
               has_table_privilege('authenticated', c.oid, 'INSERT') as ins,
               has_table_privilege('authenticated', c.oid, 'UPDATE') as upd,
               has_table_privilege('authenticated', c.oid, 'DELETE') as del
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in ('ad_account_requests','invoices','top_ups','wallet_topups','wallets')
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p61 values (4, 'wat een ingelogde sessie nog mag', v_txt);

  begin
    select coalesce(string_agg(c.relname || ': ' || t.tgname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname like 'a0_guard%';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p61 values (5, 'poorten op de geldtabellen', v_txt);
end
$blk4$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p61 order by nr;
