-- ════════════════════════════════════════════════════════════════════
--  PLAK 66 — een voorschot en een perk zijn een PRIJS, en dus van jou
--
--  GEVONDEN OP D3 (aanvragen en opnames), met de rechten-bril, en daarna
--  zelf tegen de live database nagerekend.
--
--  GAT 1 — EEN MEDEWERKER KAN ONBEPERKT WALLET-KREDIET MAKEN.
--  Op /withdrawals zit het Precharge-paneel. Terugbetalingen en
--  correcties op datzelfde scherm wachten allemaal op JOUW goedkeuring
--  ("awaiting owner approval" staat er zes keer). Een voorschot niet:
--  wallet_precharge_create kijkt alleen of je admin bent en schrijft het
--  saldo meteen omhoog. Een medewerker typt 50.000 en drukt op de knop.
--  Geen console nodig, gewoon het scherm.
--  En terugdraaien lukt daarna niet meer zodra het geld deels uitgegeven
--  is: annuleren weigert, afrekenen weigert, en wat overblijft is een
--  correctie — die JIJ weer moet goedkeuren.
--
--  GAT 2 — PERKS ZIJN ALLEEN IN TYPESCRIPT VAN DE EIGENAAR.
--  Het scherm is super-admin en de server action eist de eigenaar, maar
--  de functie eronder kijkt alleen naar 'admin' en neemt het bedrag
--  zonder grens. Eén aanroep en een klant wordt nooit meer gefactureerd
--  (subscription_waiver), of elke storting is feeloos, of elke aanvraag
--  van EUR 50 is gratis. De code zegt zelf "de dialoog is niet de grens,
--  deze actie is dat" — maar de actie is het ook niet.
--
--  GAT 3 — ZES GELD-FUNCTIES STAAN OPEN VOOR `anon`.
--  Nagemeten: wallet_precharge_create, _from_topup, _settle,
--  wallet_refund_request, wallet_adjustment_request en
--  ad_account_withdrawal_request. Vandaag komt daar niemand doorheen
--  (ze eisen binnenin een ingelogde gebruiker), maar dat is één `if` in
--  een met de hand geschreven functie. Dat hoort daar niet te staan.
--
--  GAT 4 — DRIE WACHTRIJ-TABELLEN STAAN OP TABELNIVEAU OPEN.
--  wallet_refunds, wallet_adjustments en wallet_precharges geven een
--  sessie insert/update/delete. Vandaag houdt alleen RLS ze tegen (er is
--  geen policy, dus 0 rijen). Eén policy erbij in de toekomst en elke
--  admin zet zijn eigen terugbetaling op 'approved'.
--
--  GAT 5 — EEN AANVRAAG KAN OP 'completed' BELANDEN ZONDER ACCOUNT.
--  Dan is de EUR 50 weg: afwijzen weigert een voltooide aanvraag, en de
--  poort weigert iedereen de weg terug. Niemand kan het rechtzetten.
--
--  WAT DIT BLOK DOET. Niet de functies overtypen — poorten op de
--  tabellen, die ook gelden als de functie zelf schrijft:
--    A  een voorschot ZONDER een wachtende storting eronder is van de
--       eigenaar. Het voorschot OP een storting (begrensd door die
--       storting) blijft werk van de admin.
--    B  een perk aanmaken, of zijn soort/bedrag/looptijd wijzigen, is
--       van de eigenaar — en een korting moet tussen 0 en 100 liggen.
--       Opmaken van een gratis aanvraag blijft gewoon werken.
--    C  anon eraf bij die zes functies
--    D  de drie wachtrijtabellen op tabelniveau dicht
--    E  de eigenaar mag een voltooide of afgewezen aanvraag heropenen;
--       een admin nog steeds niet
--
--  NAGEMETEN VOORDAT IK DIT SCHREEF: geen enkele wallet staat negatief,
--  er is geen aanvraag in payment_pending, en er bestaat geen enkele
--  ad_account_fee-factuur. Er is dus niets misbruikt.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p66;
create temp table _p66(nr int, wat text, uitkomst text);

-- ── A. EEN VRIJ VOORSCHOT IS VAN DE EIGENAAR ─────────────────────────
create or replace function public._guard_precharge_is_owners()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk0$
begin
  -- De service-sleutel en de cron hebben geen ingelogde gebruiker; die
  -- gaan vrij. Iedereen mét een sessie -- ook binnen een SECURITY
  -- DEFINER functie, want auth.uid() blijft de aanroeper -- valt hier
  -- onder.
  if auth.uid() is null then
    return new;
  end if;

  -- Een voorschot OP een wachtende storting is begrensd door die
  -- storting en blijft werk van de admin. Een voorschot uit het niets
  -- is een krediet, en elk ander krediet op dat scherm wacht op de
  -- eigenaar.
  if new.source_wallet_topup_id is null
     and not public._is_tenant_owner(new.tenant_id) then
    raise exception 'Alleen de eigenaar kan een vrij voorschot geven. Een voorschot op een wachtende storting kan wel, of vraag een correctie aan -- die keurt de eigenaar goed.'
      using errcode = '42501';
  end if;
  return new;
end;
$blk0$;

do $blk1$
begin
  execute 'drop trigger if exists a0_guard_precharge_is_owners on public.wallet_precharges';
  execute 'create trigger a0_guard_precharge_is_owners
             before insert on public.wallet_precharges
             for each row execute function public._guard_precharge_is_owners()';
  insert into _p66 values (1, 'vrij voorschot',
    'alleen de eigenaar; een voorschot op een wachtende storting blijft werk van de admin');
exception when others then
  insert into _p66 values (1, 'vrij voorschot', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── B. EEN PERK IS EEN PRIJS ─────────────────────────────────────────
create or replace function public._guard_perk_is_owners()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk2$
declare
  v_owner boolean;
begin
  if auth.uid() is null then
    return new;
  end if;
  v_owner := public._is_tenant_owner(new.tenant_id);

  if tg_op = 'INSERT' then
    if not v_owner then
      raise exception 'Alleen de eigenaar kan een perk geven -- een vrijstelling of korting is een prijs.'
        using errcode = '42501';
    end if;
  else
    -- Bij een WIJZIGING alleen de dingen die geld zijn. Het opmaken van
    -- een gratis aanvraag (remaining omlaag) moet gewoon blijven werken,
    -- want dat doet de klant zelf tijdens het aanvragen.
    if (new.kind is distinct from old.kind
        or new.amount is distinct from old.amount
        or new.expires_at is distinct from old.expires_at
        or coalesce(new.remaining, 0) > coalesce(old.remaining, 0))
       and not v_owner then
      raise exception 'Alleen de eigenaar kan de soort, het bedrag of de looptijd van een perk wijzigen.'
        using errcode = '42501';
    end if;
  end if;

  -- De grens die alleen in TypeScript stond. 500 "procentpunten" korting
  -- op een fee van 2% is geen korting.
  if new.kind in ('subscription_discount', 'topup_discount')
     and (new.amount is null or new.amount <= 0 or new.amount > 100) then
    raise exception 'Een korting is een percentage boven 0 en hoogstens 100.'
      using errcode = '22000';
  end if;

  return new;
end;
$blk2$;

do $blk3$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'advertiser_perks') then
    execute 'drop trigger if exists a0_guard_perk_is_owners on public.advertiser_perks';
    execute 'create trigger a0_guard_perk_is_owners
               before insert or update on public.advertiser_perks
               for each row execute function public._guard_perk_is_owners()';
    insert into _p66 values (2, 'perks',
      'aanmaken en het bedrag/de soort/de looptijd wijzigen is van de eigenaar; korting begrensd op 0-100; opmaken blijft werken');
  else
    insert into _p66 values (2, 'perks', 'tabel bestaat niet op deze database');
  end if;
exception when others then
  insert into _p66 values (2, 'perks', 'MISLUKT: ' || sqlerrm);
end
$blk3$;

-- ── C. ANON HOORT NIET BIJ DEZE ZES ──────────────────────────────────
do $blk4$
declare
  v_names text[] := array[
    'wallet_precharge_create', 'wallet_precharge_from_topup', 'wallet_precharge_settle',
    'wallet_refund_request', 'wallet_adjustment_request', 'ad_account_withdrawal_request'
  ];
  v_name text;
  v_sig  text;
  v_n    int := 0;
begin
  foreach v_name in array v_names loop
    for v_sig in
      select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name and p.prokind = 'f'
    loop
      begin
        execute 'revoke execute on function ' || v_sig || ' from public, anon';
        v_n := v_n + 1;
      exception when others then null;
      end;
    end loop;
  end loop;
  insert into _p66 values (3, 'anon bij geld-functies', v_n::text || ' ingetrokken');
exception when others then
  insert into _p66 values (3, 'anon bij geld-functies', 'MISLUKT: ' || sqlerrm);
end
$blk4$;

-- ── D. DE WACHTRIJTABELLEN DICHT ─────────────────────────────────────
do $blk5$
declare
  v_tab  text;
  v_done text := '';
begin
  foreach v_tab in array array['wallet_refunds', 'wallet_adjustments', 'wallet_precharges'] loop
    begin
      execute format('revoke insert, update, delete on public.%I from authenticated, anon', v_tab);
      execute format('grant select on public.%I to authenticated', v_tab);
      v_done := v_done || v_tab || ' · ';
    exception when others then
      v_done := v_done || v_tab || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;
  insert into _p66 values (4, 'wachtrijtabellen', rtrim(v_done, ' ·') || ' — lezen blijft, schrijven gaat via de functies');
end
$blk5$;

-- ── E. DE EIGENAAR MAG EEN AANVRAAG HEROPENEN ────────────────────────
create or replace function public._guard_ad_account_requests_session_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk6$
declare
  v_allowed text[] := array['status', 'rejection_reason', 'notes', 'updated_at'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'ad_account_requests: alleen status, reden en notities kunnen hier veranderen — het bedrag, de klant en de terugbetaalstempel zijn van de functie'
      using errcode = '42501';
  end if;

  -- NIEUW: de eigenaar mag terug. Een aanvraag die op 'completed' kwam
  -- te staan zonder dat er een account was, hield de EUR 50 vast:
  -- afwijzen weigert een voltooide aanvraag en deze poort weigerde
  -- iedereen de weg terug. Een admin blijft buiten.
  if new.status is distinct from old.status
     and coalesce(old.status, '') in ('completed', 'rejected')
     and not public._is_tenant_owner(new.tenant_id) then
    raise exception 'ad_account_requests: een % aanvraag verandert hier niet meer van status', old.status
      using errcode = '42501';
  end if;

  if new.status = 'rejected' and coalesce(old.status, '') <> 'rejected' then
    raise exception 'ad_account_requests: afwijzen gaat via ad_account_request_reject_refund — die geeft de fee terug en eist een reden'
      using errcode = '42501';
  end if;

  return new;
end;
$blk6$;

do $blk7$
begin
  insert into _p66 values (5, 'voltooide aanvraag',
    'de eigenaar kan hem heropenen en daarna netjes afwijzen; een admin nog steeds niet');
exception when others then
  insert into _p66 values (5, 'voltooide aanvraag', 'MISLUKT: ' || sqlerrm);
end
$blk7$;

-- ── F. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk8$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(x.t || ': ' ||
             case when x.ins or x.upd or x.del then
               rtrim(case when x.ins then 'insert ' else '' end ||
                     case when x.upd then 'update ' else '' end ||
                     case when x.del then 'delete' else '' end)
             else 'niets' end, ' · ' order by x.t), 'geen')
      into v_txt
      from (
        select c.relname as t,
               has_table_privilege('authenticated', c.oid, 'INSERT') as ins,
               has_table_privilege('authenticated', c.oid, 'UPDATE') as upd,
               has_table_privilege('authenticated', c.oid, 'DELETE') as del
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in ('wallet_refunds','wallet_adjustments','wallet_precharges',
                             'advertiser_perks','ad_account_withdrawals')
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p66 values (6, 'wat een sessie nog mag schrijven', v_txt);

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and (p.proname like 'wallet_%' or p.proname like 'ad_account_%'
            or p.proname like 'top_up_%' or p.proname like 'invoice_%');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p66 values (7, 'geld-functies die anon nog mag aanroepen', v_txt);
end
$blk8$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p66 order by nr;
