-- =====================================================================
-- PLAK 6 — waarom de klant geen melding krijgt
-- =====================================================================
-- Ik heb het nu drie keer live gezien: een wallet-top-up van EUR 300
-- geverifieerd en er komt niets aan, een claim van EUR 1.000 afgewezen
-- mét reden en er komt niets aan — terwijl de ad-account-verify er wél
-- twee stuurde. De code die ze schrijft staat live en hangt aan precies
-- de hook die dat scherm gebruikt.
--
-- Het verschil tussen wat wél en niet aankomt is niet de code maar de
-- TYPENAAM: `topup_completed` bestaat al jaren, `wallet_topup_completed`
-- en `wallet_topup_rejected` heb ik vanavond toegevoegd. Als
-- `notifications.type` een CHECK-lijst of een enum is die met de hand
-- is aangelegd, dan wordt elke insert met een nieuwe naam geweigerd —
-- en notifyAdvertiser ving die fout tot vandaag stilzwijgend op.
--
-- Regel 1 en 2 zeggen of dat zo is. De rest van het bestand repareert
-- het alleen ALS het zo is, en laat verder alles staan.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

do $blk0$
declare
  r        record;
  v_type   text;
  v_enum   text;
  v_added  int := 0;
begin
  -- ── Is het een enum? ───────────────────────────────────────────────
  select t.typname into v_enum
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_type t on t.oid = a.atttypid
   where c.relname = 'notifications'
     and c.relnamespace = 'public'::regnamespace
     and a.attname = 'type'
     and t.typtype = 'e';

  if v_enum is not null then
    foreach v_type in array array['wallet_topup_completed', 'wallet_topup_rejected']
    loop
      if not exists (
        select 1 from pg_enum e
         join pg_type t on t.oid = e.enumtypid
        where t.typname = v_enum and e.enumlabel = v_type
      ) then
        execute format('alter type %I add value %L', v_enum, v_type);
        v_added := v_added + 1;
        raise notice 'enum %: waarde % toegevoegd', v_enum, v_type;
      end if;
    end loop;
    if v_added = 0 then
      raise notice 'enum % kende beide waarden al', v_enum;
    end if;
    return;
  end if;

  -- ── Of een CHECK-constraint met een lijst? ────────────────────────
  for r in
    select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
     where c.relname = 'notifications'
       and c.relnamespace = 'public'::regnamespace
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%type%'
  loop
    if r.def ilike '%topup_completed%'
       and r.def not ilike '%wallet_topup_completed%'
    then
      -- De lijst kent de bestaande typenamen wél en de nieuwe niet. Dan
      -- is dit hem. Weghalen in plaats van uitbreiden: de catalogus in
      -- lib/notification-catalog.ts is de plek waar typenamen worden
      -- bijgehouden, en een tweede lijst in de database die niemand bij
      -- het toevoegen van een type bijwerkt is precies hoe dit stil
      -- kapot ging. De kolom blijft tekst; een onbekend type rendert
      -- als "New Notification" en breekt niets.
      execute format(
        'alter table public.notifications drop constraint %I', r.conname);
      raise notice 'CHECK % verwijderd (kende de nieuwe types niet)', r.conname;
      v_added := v_added + 1;
    else
      raise notice 'CHECK % laten staan: %', r.conname, r.def;
    end if;
  end loop;

  if v_added = 0 then
    raise notice
      'geen enum en geen beperkende CHECK gevonden — de oorzaak ligt ergens anders';
  end if;
end;
$blk0$;


-- ── DE PROEF OP DE SOM ───────────────────────────────────────────────
-- Schrijf er één met het nieuwe type en gooi hem meteen weg. Als de
-- database hem weigert, staat de reden woord voor woord in het rapport
-- en hoeft niemand meer te raden.
create temporary table if not exists _probe_notify (result text);
delete from _probe_notify;

do $blk1$
declare
  v_user uuid;
  v_ten  uuid;
  v_id   uuid;
begin
  select n.recipient_user_id, n.tenant_id into v_user, v_ten
    from public.notifications n
   order by n.created_at desc limit 1;

  if v_user is null then
    insert into _probe_notify values ('geen bestaande melding om er een na te doen');
    return;
  end if;

  begin
    insert into public.notifications
      (recipient_user_id, tenant_id, type, payload, is_read)
    values (v_user, v_ten, 'wallet_topup_completed',
            jsonb_build_object('probe', true), true)
    returning id into v_id;
    delete from public.notifications where id = v_id;
    insert into _probe_notify values ('JA - de database accepteert het type');
  exception when others then
    insert into _probe_notify
      values ('NEE: ' || sqlstate || ' ' || sqlerrm);
  end;
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'type-kolom: welk type heeft hij' as item,
  coalesce((
    select t.typname || case when t.typtype = 'e' then '  (ENUM)' else '' end
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_type t on t.oid = a.atttypid
     where c.relname = 'notifications'
       and c.relnamespace = 'public'::regnamespace
       and a.attname = 'type'
  ), 'kolom bestaat niet') as antwoord
union all
select 2, 'CHECK-constraints op notifications',
  coalesce((
    select string_agg(con.conname || ': ' || pg_get_constraintdef(con.oid),
                      E'\n' order by con.conname)
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
     where c.relname = 'notifications'
       and c.relnamespace = 'public'::regnamespace
       and con.contype = 'c'
  ), 'geen')
union all
select 3, 'kolommen op notifications die NOT NULL zijn zonder default',
  coalesce((
    select string_agg(column_name, ', ' order by column_name)
      from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and is_nullable = 'NO' and column_default is null
  ), 'geen')
union all
-- Als het hierboven niet ligt, dan hier: wie mag er schrijven.
select 4, 'policies op notifications (met hun voorwaarde)',
  coalesce((
    select string_agg(
             policyname || ' [' || cmd || ']  using: ' ||
             coalesce(qual, '-') || '  check: ' || coalesce(with_check, '-'),
             E'\n' order by cmd, policyname)
      from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
  ), 'geen')
union all
select 5, 'welke types staan er nu in de tabel',
  coalesce((
    select string_agg(x.type || ': ' || x.n::text, E'\n' order by x.type)
      from (select type, count(*) n from public.notifications group by type) x
  ), 'tabel is leeg')
union all
select 6, 'PROEF: kan een rij met het nieuwe type geschreven worden',
  coalesce((select result from _probe_notify limit 1), 'probe niet gelopen')
order by nr;
