-- ════════════════════════════════════════════════════════════════════
-- PLAK 130 — `revoke from anon, public` raakt `authenticated` NIET
-- ════════════════════════════════════════════════════════════════════
--
-- CLAUDE.md schrijft voor dat elke nieuwe tabel in `public` afsluit met
--
--     revoke all on public.<naam> from anon, public;
--     grant select on public.<naam> to authenticated;
--
-- en dat heb ik netjes gedaan -- bij `wallet_ledger` (plak 125), bij
-- `polls` en `poll_votes` (plak 129), en eerder iemand bij
-- `fee_change_requests`. Vandaag gemeten wat dat oplevert:
--
--   tabel                 insert  update  delete   insert-policies
--   fee_change_requests   true    true    true     0
--   poll_votes            true    true    true     0
--   polls                 true    true    true     0
--   wallet_ledger         true    false   false    0
--
-- `authenticated` mag op alle vier schrijven. De revoke haalt het er
-- niet af, want die rol krijgt zijn rechten uit Supabase's DEFAULT
-- PRIVILEGES en niet uit PUBLIC -- en `grant select` erna voegt toe, het
-- vervangt niets.
--
-- NIETS HIERVAN IS VANDAAG UIT TE BUITEN. Alle vier hebben RLS aan en
-- geen van alle heeft een policy die een insert, update of delete
-- toestaat, dus Postgres weigert de schrijf alsnog. Het is precies één
-- vergeten policy verwijderd van wel echt zijn, en op `wallet_ledger`
-- -- een grootboek dat append-only HOORT te zijn -- is dat één te
-- weinig.
--
-- Vier tabellen bij naam, niet een veeg over heel `public`: een
-- generieke revoke over alles wat "geen policy heeft" is precies het
-- soort ding dat iets stilletjes breekt. Wat er verder nog scheef staat
-- komt onderaan in het rapport te staan, zonder dat er iets aan
-- gebeurt.
--
-- Er beweegt geen geld en geen enkele rij verandert.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak130 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak130;

do $blk0$
declare
  r     record;
  v_n   integer := 0;
  v_had text := '';
begin
  for r in
    select unnest(array[
      'polls', 'poll_votes', 'wallet_ledger', 'fee_change_requests'
    ]) as t
  loop
    if to_regclass('public.' || r.t) is null then
      v_had := v_had || r.t || ' (bestaat niet), ';
      continue;
    end if;

    execute format(
      'revoke insert, update, delete, truncate on public.%I from authenticated',
      r.t);
    -- service_role hoort er ook niet bij op het grootboek: dat is
    -- append-only, en de trigger die erin schrijft is SECURITY DEFINER
    -- en heeft de grant niet nodig.
    if r.t = 'wallet_ledger' then
      execute 'revoke update, delete, truncate on public.wallet_ledger from service_role';
    end if;
    v_n := v_n + 1;
  end loop;

  insert into _plak130 values (0, 'de vier tabellen',
    v_n || ' dichtgezet' || case when v_had = '' then '' else ' | overgeslagen: ' || v_had end);
exception when others then
  insert into _plak130 values (0, 'de vier tabellen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle, en de rest van het huis in beeld ──────────────────────
do $blk1$
declare
  v_nog  text;
  v_rest integer;
  v_open text;
begin
  select coalesce(string_agg(t, ', ' order by t), 'geen')
    into v_nog
    from (
      select c.relname as t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('polls','poll_votes','wallet_ledger','fee_change_requests')
         and (has_table_privilege('authenticated', 'public.' || c.relname, 'insert')
           or has_table_privilege('authenticated', 'public.' || c.relname, 'update')
           or has_table_privilege('authenticated', 'public.' || c.relname, 'delete'))
    ) x;

  -- Hoeveel andere tabellen in public staan in dezelfde toestand:
  -- authenticated mag schrijven terwijl geen enkele policy dat
  -- toestaat. ALLEEN GETELD -- hier wordt niets aan gedaan.
  select count(*), coalesce(string_agg(t, ', ' order by t), '')
    into v_rest, v_open
    from (
      select c.relname as t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and c.relrowsecurity
         and (has_table_privilege('authenticated', 'public.' || c.relname, 'insert')
           or has_table_privilege('authenticated', 'public.' || c.relname, 'update')
           or has_table_privilege('authenticated', 'public.' || c.relname, 'delete'))
         and not exists (
           select 1 from pg_policy p
            where p.polrelid = c.oid and p.polcmd in ('a', 'w', 'd', '*')
         )
    ) y;

  insert into _plak130 values (1, 'stand van zaken',
    'van de vier staat nog scheef: ' || v_nog || ' (moet: geen)');
  insert into _plak130 values (2, 'de rest van public (alleen geteld)',
    v_rest || ' tabel(len) waar authenticated mag schrijven terwijl geen policy het toestaat'
    || case when v_rest = 0 then '' else ': ' || left(v_open, 300) end);
exception when others then
  insert into _plak130 values (1, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak130 order by n;
