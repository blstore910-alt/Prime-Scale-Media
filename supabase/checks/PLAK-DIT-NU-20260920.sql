-- =====================================================================
-- PLAK DIT IN ZIJN GEHEEL — 20 september
-- =====================================================================
-- Vijf dingen in één plak. Alles is idempotent: nog een keer draaien
-- verandert niets en het rapport onderaan zegt precies wat er staat.
--
--   A. Prijzen zijn van de eigenaar, ook aan de tabelkant
--   B. "Edit wallet balances" is de eigenaar z'n knop
--   C. De tweede trigger op een betaalde factuur eraf
--   D. Een opname kan niet groter zijn dan wat er op het account staat
--   E. Je eigen gelezen meldingen wissen werkt echt
--
-- De SQL-editor toont alleen het LAATSTE resultaat, dus er is één
-- rapport helemaal onderaan. Regels 20 t/m 24 zijn functie-bodies die
-- ik nergens anders kan lezen -- STUUR DIE TERUG, daar zit onder meer
-- de incasso in die op een gestorneerde factuur vastloopt.
-- =====================================================================

set search_path = public;


-- =====================================================================
-- A. Elke prijs is van de eigenaar — ook aan de tabelkant
-- =====================================================================
-- Zeven schermen zijn stuk voor stuk eigenaar-only gemaakt. De tabellen
-- eronder zeggen nog steeds `_is_admin_of(tenant_id)`, en dat is "rol =
-- admin en actief" -- de eigenaar wordt daar niet onderscheiden.
-- PostgREST zet elke tabel op /rest/v1/<naam>, dus voor een
-- werknemer-admin was dit één regel in de console:
--
--   from('exchange_rates').update({ eur: 0.5 })
--       -> elke omrekening in de app deelt door dit getal
--   from('plans').update({ monthly_fee: 5, topup_fee_pct: 0 })
--   from('fee_defaults').update({ fee_pct: 0 })
--
-- LEZEN blijft voor elke admin: zonder die rijen kan niemand een scherm
-- tonen of een klant vertellen wat hij betaalt. Alleen SCHRIJVEN gaat
-- naar de eigenaar.
-- =====================================================================
do $a0$
declare
  t text;
begin
  foreach t in array array['exchange_rates', 'plans', 'fee_defaults'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabel niet aanwezig, overgeslagen: %', t;
      continue;
    end if;

    -- De bestaande ALL-policy dekt SELECT mee, dus splitsen in plaats
    -- van weghalen.
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_write_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);

    execute format('drop policy if exists %I on public.%I', t || '_admin_read_v2', t);
    execute format($a1$
      create policy %I on public.%I
        for select to authenticated
        using (public._is_admin_of(tenant_id))
    $a1$, t || '_admin_read_v2', t);

    execute format('drop policy if exists %I on public.%I', t || '_owner_write_v2', t);
    execute format($a1$
      create policy %I on public.%I
        for all to authenticated
        using (public._is_super_admin_of(tenant_id))
        with check (public._is_super_admin_of(tenant_id))
    $a1$, t || '_owner_write_v2', t);

    raise notice 'op slot: %', t;
  end loop;
end;
$a0$;

-- ── De twee tabellen waar een admin nog iets mag ─────────────────────
-- Een abonnement pauzeren is desk-werk; het BEDRAG is een prijs. Een
-- affiliate goedkeuren is desk-werk; zijn PERCENTAGE is een prijs. Dus
-- geen slot op de tabel maar een grendel op de kolommen.
--
-- Alles gaat via to_jsonb(new)/to_jsonb(old): zo noemt deze functie
-- geen enkele kolom bij naam, en kan een kolom die op deze database
-- anders heet of niet bestaat hem niet laten crashen op het moment dat
-- iemand een abonnement pauzeert.
create or replace function public._money_columns_are_the_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $a2$
declare
  j_new    jsonb := to_jsonb(new);
  j_old    jsonb := to_jsonb(old);
  v_uid    uuid  := auth.uid();
  v_owner  uuid;
  moved    boolean := false;
  k        text;
  num_keys text[];
  txt_keys text[];
begin
  -- Geen mens aan de knoppen: service-role, cron, de incasso-motor.
  if v_uid is null then
    return new;
  end if;

  select t.owner_id into v_owner
    from public.tenants t
   where t.id = (j_new->>'tenant_id')::uuid;
  if v_owner is not null and v_owner = v_uid then
    return new;
  end if;

  if tg_table_name = 'subscriptions' then
    num_keys := array['amount'];
    txt_keys := array['currency'];
  else
    num_keys := array['commission_pct', 'commission_monthly',
                      'commission_onetime', 'commission_rate',
                      'commission_amount'];
    txt_keys := array['commission_type', 'commission_currency'];
  end if;

  foreach k in array num_keys loop
    if round(coalesce((j_new->>k)::numeric, -1), 4)
       is distinct from round(coalesce((j_old->>k)::numeric, -1), 4)
    then
      moved := true;
    end if;
  end loop;

  foreach k in array txt_keys loop
    if coalesce(j_new->>k, '') is distinct from coalesce(j_old->>k, '') then
      moved := true;
    end if;
  end loop;

  if moved then
    if tg_table_name = 'subscriptions' then
      raise exception
        'Only the super-admin can change what a customer pays. Pausing, resuming and cancelling are still yours.'
        using errcode = '42501';
    else
      raise exception
        'Only the super-admin can set commission terms. Approving and rejecting a referral is still yours.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$a2$;

do $a3$
declare
  t text;
begin
  foreach t in array array['subscriptions', 'referral_links'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabel niet aanwezig, overgeslagen: %', t;
      continue;
    end if;
    -- Zonder tenant_id kan de functie de eigenaar niet vaststellen en
    -- zou zij ALLES weigeren. Dan liever geen grendel dan een kapot slot
    -- op een scherm dat de desk elke dag gebruikt.
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t
         and column_name = 'tenant_id'
    ) then
      raise notice 'OVERGESLAGEN: %.tenant_id bestaat niet', t;
      continue;
    end if;
    execute format('drop trigger if exists trg_money_columns_owner on public.%I', t);
    execute format(
      'create trigger trg_money_columns_owner before update on public.%I for each row execute function public._money_columns_are_the_owners()',
      t);
    raise notice 'geld-kolommen op slot: %', t;
  end loop;
end;
$a3$;


-- =====================================================================
-- B. "Edit wallet balances" is de eigenaar z'n knop
-- =====================================================================
-- De dialog riep `wallet_admin_adjust` RECHTSTREEKS uit de browser aan.
-- Die functie test alleen `role = 'admin'` (sinds 20260916110000 ook
-- is_active/status). Meer niet:
--
--   supabase.rpc('wallet_admin_adjust',
--     { p_wallet_id: '<willekeurige wallet>', p_eur_delta: 50000,
--       p_usd_delta: 0, p_reason: 'correctie' })
--
-- Geen eigenaar, geen tweede paar ogen, geen maximum, geen
-- negatief-test. Terwijl dit systeem er wél een goedgekeurde weg voor
-- heeft: wallet_adjustment_request (admin vraagt) +
-- wallet_adjustment_approve (eigenaar keurt goed).
--
-- De code-kant is sinds vanavond dicht (adminAdjustWalletBalances). Dit
-- sluit de kant waar geen scherm voor staat.
--
-- DIT OVERSCHRIJFT DE FUNCTIE NIET. Haar body staat niet in de repo, en
-- een live RPC terugzetten uit de repo heeft hier al eens de productie
-- plat gelegd. Postgres leest zijn EIGEN definitie terug, er wordt
-- precies één voorwaarde ingevoegd, en het resultaat wordt opnieuw
-- uitgevoerd. Er kan niets anders veranderen. Hij blijft als de
-- AANROEPER draaien, zodat auth.uid() blijft staan en het audit-spoor
-- de admin bij naam noemt.
-- =====================================================================
create or replace function public._is_wallet_tenant_owner(p_wallet uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $b0$
  select exists (
    select 1
      from public.wallets w
      join public.tenants t on t.id = w.tenant_id
     where w.id = p_wallet
       and t.owner_id = auth.uid()
  );
$b0$;

do $b1$
declare
  v_oid  oid;
  v_args text;
  src    text;
  pat    text;
  hits   int;
begin
  select p.oid, pg_get_function_arguments(p.oid)
    into v_oid, v_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'wallet_admin_adjust'
   limit 1;

  if v_oid is null then
    raise notice 'wallet_admin_adjust staat niet op deze database';
    return;
  end if;

  src := pg_get_functiondef(v_oid);

  if position('_is_wallet_tenant_owner' in src) > 0 then
    raise notice 'wallet_admin_adjust draagt de eigenaar-test al';
    return;
  end if;

  if position('p_wallet_id' in v_args) = 0 then
    raise notice
      'OVERGESLAGEN: wallet_admin_adjust heeft geen parameter p_wallet_id (%). Met de hand doen.',
      v_args;
    return;
  end if;

  -- Twee schrijfwijzen bestaan in dit schema. De gekwalificeerde MOET
  -- eerst getest worden: up.role = 'admin' bevat role = 'admin'.
  if position('up.role = ''admin''' in src) > 0 then
    pat := 'up.role = ''admin''';
  elsif position('role = ''admin''' in src) > 0 then
    pat := 'role = ''admin''';
  else
    raise notice 'OVERGESLAGEN: geen herkenbare admin-test in wallet_admin_adjust';
    return;
  end if;

  hits := (length(src) - length(replace(src, pat, ''))) / length(pat);
  if hits <> 1 then
    raise notice 'OVERGESLAGEN: patroon % keer gevonden, verwacht precies 1', hits;
    return;
  end if;

  execute replace(src, pat, pat || ' and public._is_wallet_tenant_owner(p_wallet_id)');
  raise notice 'wallet_admin_adjust is nu eigenaar-only';
end;
$b1$;


-- =====================================================================
-- C. De tweede trigger op een betaalde factuur
-- =====================================================================
-- Er hangen er TWEE aan dezelfde gebeurtenis:
--
--   on_invoice_subscription_paid      -> handle_invoice_payment_update
--   trg_on_subscription_invoice_paid  -> _on_subscription_invoice_paid
--
-- De tweede doet het werk goed. De eerste leest het abonnement uit
-- NEW.items->0->>'subscription_id' -- een veld dat de incasso-motor niet
-- schrijft -- dus hij doet vandaag niets. Dat is precies wat hem
-- gevaarlijk maakt: zodra iemand `items` uitbreidt wordt hij wakker, en
-- dan zet hij een GEPAUZEERD abonnement weer aan omdat er een oude
-- factuur betaald werd.
--
-- Hij gaat er alleen af als de live body ook echt die inerte vorm heeft.
-- Zo niet, dan blijft alles staan en zegt het rapport waarom; de body
-- komt hoe dan ook terug in regel 20.
-- =====================================================================
do $c0$
declare
  body     text;
  has_good boolean;
begin
  select p.prosrc into body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_invoice_payment_update'
   limit 1;

  if body is null then
    raise notice 'handle_invoice_payment_update bestaat niet; niets te doen';
    return;
  end if;

  select exists (
    select 1 from pg_trigger t
     where t.tgname = 'trg_on_subscription_invoice_paid' and not t.tgisinternal
  ) into has_good;

  if not has_good then
    raise notice 'OVERGESLAGEN: de goede trigger trg_on_subscription_invoice_paid ontbreekt';
    return;
  end if;

  if position('subscription_id' in body) = 0 or position('items' in body) = 0 then
    raise notice
      'OVERGESLAGEN: handle_invoice_payment_update leest niet uit items/subscription_id';
    return;
  end if;

  execute 'drop trigger if exists on_invoice_subscription_paid on public.invoices';
  raise notice 'on_invoice_subscription_paid verwijderd';
end;
$c0$;


-- =====================================================================
-- D. Een opname kan niet groter zijn dan wat er op het account staat
-- =====================================================================
-- `ad_account_withdrawal_request` controleert zelf GEEN saldo en GEEN
-- accountstatus; het hele plafond zit in actions/withdrawal-actions.ts.
-- PostgREST zet die functie op /rest/v1/rpc/<naam>, dus elke ingelogde
-- klant kan de actie overslaan:
--
--   supabase.rpc('ad_account_withdrawal_request',
--                { p_ad_account_id: mijn_account, p_amount: 999999 })
--
-- LET OP: dit is een PLAFOND, geen saldo. Geld dat bij het platform is
-- uitgegeven staat nergens in deze database, dus een klant die $10.000
-- heeft gefund en $9.000 heeft uitgegeven kan hier nog steeds $10.000
-- aanvragen. Dat gat sluit pas als we het echte saldo bij de leverancier
-- uitlezen; dit sluit de helft die wij WEL weten.
--
-- De service-role gaat er doorheen, zodat een correctie met de hand door
-- jou in deze editor blijft werken.
-- =====================================================================
create or replace function public._withdrawal_within_the_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $d0$
declare
  v_put_on numeric := 0;
  v_taken  numeric := 0;
  v_room   numeric := 0;
  v_status text;
begin
  if new.ad_account_id is null then
    return new;
  end if;

  -- Service-role en cron erdoor: jouw eigen correctie in deze editor
  -- moet kunnen.
  if auth.uid() is null then
    return new;
  end if;

  -- Dezelfde twee statussen die de server-actie weigert, zodat scherm en
  -- database het eens zijn.
  select lower(coalesce(a.status, '')) into v_status
    from public.ad_accounts a
   where a.id = new.ad_account_id;
  if v_status in ('banned', 'closed') then
    raise exception
      'This ad account is closed, so nothing can be withdrawn from it.'
      using errcode = '42501';
  end if;

  begin
    select coalesce(sum(t.topup_amount), 0) into v_put_on
      from public.top_ups t
     where t.account_id = new.ad_account_id
       and t.status = 'completed'
       and coalesce(t.is_deleted, false) = false;
  exception when undefined_column then
    -- is_deleted is met de hand toegevoegd en staat in geen migratie.
    select coalesce(sum(t.topup_amount), 0) into v_put_on
      from public.top_ups t
     where t.account_id = new.ad_account_id
       and t.status = 'completed';
  end;

  select coalesce(sum(w.amount), 0) into v_taken
    from public.ad_account_withdrawals w
   where w.ad_account_id = new.ad_account_id
     and w.id is distinct from new.id
     and lower(coalesce(w.status, '')) not in ('rejected', 'cancelled');

  v_room := round((v_put_on - v_taken)::numeric, 2);

  if round(coalesce(new.amount, 0)::numeric, 2) > v_room + 0.005 then
    raise exception
      'That is more than this ad account can return. We funded % and % has already been asked back, so at most % is available.',
      to_char(v_put_on, 'FM999999990.00'),
      to_char(v_taken, 'FM999999990.00'),
      to_char(greatest(v_room, 0), 'FM999999990.00')
      using errcode = '23514';
  end if;

  return new;
end;
$d0$;

drop trigger if exists trg_withdrawal_within_the_account
  on public.ad_account_withdrawals;
create trigger trg_withdrawal_within_the_account
  before insert on public.ad_account_withdrawals
  for each row execute function public._withdrawal_within_the_account();


-- =====================================================================
-- E. Je eigen meldingen: wel opruimen, niet herschrijven
-- =====================================================================
-- 20260828140000_rls_templates.sql maakt precies twee policies op
-- `notifications`: _select en _update_self. Er is GEEN delete-policy.
-- Met RLS aan raakt elke delete dus nul rijen, voor iedereen -- en
-- PostgREST noemt dat geen fout. Het scherm waarschuwde "this cannot be
-- undone", de toast zei "Old read notifications cleaned", en er ging
-- nooit iets weg.
--
-- Andersom kan te veel: notifications_update_self is
-- `for update using (recipient_user_id = auth.uid())` zonder
-- kolombeperking, dus vanuit de console kan iemand op zijn EIGEN rijen
-- ook type, title, body, metadata en created_at overschrijven -- en de
-- meldingenpagina dereferenceert ids uit metadata.
-- =====================================================================
drop policy if exists notifications_delete_self on public.notifications;
create policy notifications_delete_self on public.notifications
  for delete to authenticated
  using (
    recipient_user_id = auth.uid()
    and coalesce(is_read, false) = true
  );

create or replace function public._notification_flags_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $e0$
declare
  j_new jsonb := to_jsonb(new);
  j_old jsonb := to_jsonb(old);
  k     text;
begin
  if auth.uid() is null then
    return new;
  end if;

  foreach k in array array['recipient_user_id', 'type', 'title', 'body',
                           'metadata', 'data', 'created_at']
  loop
    if coalesce(j_new->>k, '') is distinct from coalesce(j_old->>k, '') then
      raise exception
        'A notification cannot be rewritten. You can mark it read or archive it.'
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$e0$;

drop trigger if exists trg_notification_flags_only on public.notifications;
create trigger trg_notification_flags_only
  before update on public.notifications
  for each row execute function public._notification_flags_only();


-- =====================================================================
-- HET RAPPORT — de SQL-editor toont alleen dit
-- =====================================================================
-- Regel 20 t/m 24 zijn de functie-bodies die ik nodig heb. Die vier
-- RPC's staan met de hand op de database en in geen enkele migratie,
-- dus ik kan van geen van vieren bewijzen dat ze de eigenaar opnieuw
-- afleiden uit auth.uid(). Zolang dat niet vaststaat is elke uitspraak
-- erover een gok.
-- =====================================================================
select 1 as nr, 'A. prijstabellen: wie mag schrijven' as item,
  coalesce((
    select string_agg(tablename || ': ' || policyname || ' (' || cmd || ')',
                      E'\n' order by tablename, policyname)
      from pg_policies
     where schemaname = 'public'
       and tablename in ('exchange_rates', 'plans', 'fee_defaults')
       and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  ), 'geen') as antwoord
union all
select 2, 'A. kan een werknemer-admin nog een prijs schrijven',
  case when exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('exchange_rates', 'plans', 'fee_defaults')
       and cmd in ('ALL', 'INSERT', 'UPDATE')
       and qual ilike '%_is_admin_of%'
       and qual not ilike '%_is_super_admin_of%'
  ) then 'JA - dit bestand is niet geplakt' else 'nee' end
union all
select 3, 'A. geld-kolom-grendel op welke tabellen',
  (select coalesce(string_agg(c.relname, ' + ' order by c.relname), 'GEEN')
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname = 'trg_money_columns_owner' and not t.tgisinternal)
union all
select 4, 'A. actieve koersen zichtbaar voor JOU, nu',
  case when to_regclass('public.exchange_rates') is null then 'tabel ontbreekt'
       else (select count(*)::text from public.exchange_rates where is_active) end
union all
select 5, 'A. tenants met MEER DAN EEN actieve koers',
  case when to_regclass('public.exchange_rates') is null then 'tabel ontbreekt'
       else (select count(*)::text from (
               select tenant_id from public.exchange_rates
                where is_active group by 1 having count(*) > 1) x) end
union all
select 6, 'A. ad-account-types zichtbaar voor JOU, nu',
  case when to_regclass('public.ad_account_types') is null then 'tabel ontbreekt'
       else (select count(*)::text from public.ad_account_types) end
union all
select 10, 'B. wallet_admin_adjust is eigenaar-only',
  coalesce((
    select case when position('_is_wallet_tenant_owner' in p.prosrc) > 0
                then 'JA' else 'NEE - nog elke admin' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_admin_adjust' limit 1
  ), 'functie bestaat niet')
union all
select 11, 'B. wie mag wallet_admin_adjust aanroepen',
  coalesce((
    select coalesce(array_to_string(p.proacl, ' , '), 'default (elke ingelogde)')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_admin_adjust' limit 1
  ), 'functie bestaat niet')
union all
select 12, 'C. triggers op invoices die op BETAALD reageren',
  coalesce((
    select string_agg(t.tgname || ' -> ' || p.proname, E'\n' order by t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'invoices' and not t.tgisinternal
       and (p.prosrc ilike '%paid%' or p.proname ilike '%paid%'
            or p.proname ilike '%payment%')
  ), 'geen')
union all
select 13, 'D. plafond-trigger op ad_account_withdrawals',
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_withdrawal_within_the_account'
                       and not tgisinternal)
       then 'AAN' else 'NIET AANGELEGD' end
union all
select 14, 'D. ad-accounts waar MEER af is gevraagd dan er ooit op stond',
  (select count(*)::text from (
     select w.ad_account_id
       from public.ad_account_withdrawals w
      where lower(coalesce(w.status, '')) not in ('rejected', 'cancelled')
      group by w.ad_account_id
     having coalesce(sum(w.amount), 0) > coalesce((
              select sum(t.topup_amount) from public.top_ups t
               where t.account_id = w.ad_account_id
                 and t.status = 'completed'), 0) + 0.005
   ) x)
union all
select 15, 'D. openstaande opnames nu  |  bedrag',
  (select count(*)::text || '  |  ' ||
          to_char(coalesce(sum(amount), 0), 'FM999999990.00')
     from public.ad_account_withdrawals
    where lower(coalesce(status, '')) = 'pending')
union all
select 16, 'E. policies op notifications',
  coalesce((
    select string_agg(policyname || ' (' || cmd || ')', '  |  ' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
  ), 'geen')
union all
select 17, 'E. kolom-grendel op notifications',
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_notification_flags_only'
                       and not tgisinternal)
       then 'AAN' else 'NIET AANGELEGD' end
union all
select 18, 'E. gelezen meldingen ouder dan 30 dagen (die nooit zijn gewist)',
  (select count(*)::text from public.notifications
    where coalesce(is_read, false) = true
      and created_at < now() - interval '30 days')
union all
select 20, 'STUUR TERUG >> body subscription_billing_run',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'subscription_billing_run' limit 1
  ), 'staat niet op deze database')
union all
select 21, 'STUUR TERUG >> body top_up_create_for_advertiser',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_create_for_advertiser' limit 1
  ), 'staat niet op deze database')
union all
select 22, 'STUUR TERUG >> body wallet_exchange',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'wallet_exchange' limit 1
  ), 'staat niet op deze database')
union all
select 23, 'STUUR TERUG >> body top_up_admin_reject',
  coalesce((
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_admin_reject' limit 1
  ), 'staat niet op deze database')
union all
select 24, 'STUUR TERUG >> body handle_invoice_payment_update',
  coalesce((
    select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_invoice_payment_update' limit 1
  ), 'bestaat niet meer')
order by nr;
