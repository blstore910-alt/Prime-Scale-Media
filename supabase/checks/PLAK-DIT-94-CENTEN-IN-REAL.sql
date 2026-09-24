-- ════════════════════════════════════════════════════════════════════
-- PLAK 94 — vier geldkolommen staan in `real`, en boven EUR 9.999,99
--            sneuvelen de centen
-- ════════════════════════════════════════════════════════════════════
--
-- ⚠️ DEZE PLAK HERBOUWT EEN VIEW. Draai hem terwijl je meekijkt, niet
-- tussendoor. Het rapport onderaan zegt of `top_ups_view` er weer staat
-- EN of hij rijen teruggeeft; komt daar iets anders uit dan verwacht,
-- dan staat de oude definitie nog in `_plak94_stash` en kun je hem
-- terugzetten.
--
-- WAT ER MIS IS
--
-- `real` is single precision: zes significante cijfers. Gemeten op deze
-- database:
--
--   select 11463.12::real, 123456.78::real, 1146312.34::real
--          11463.1          123457           1146310
--
-- Een opwaardering van EUR 10.000 bij 3% zet `topup_usd` op 11119,16 en
-- leest hem terug als 11119,2. Bij EUR 100.000 verdwijnen hele euro's.
--
-- En dit is niet alleen weergave: `topup_usd` is de DISCRIMINATOR waar
-- lib/pure-topup-landed.ts op afgaat om te bepalen in welke valuta
-- `topup_amount` staat, en `rate` is waar top_up_admin_verify door
-- deelt als een fee wordt gewijzigd.
--
-- De vier kolommen op `top_ups`: eur_value, eur_topup, topup_usd, rate.
-- Plus `exchange_rates.eur`, de koers waar elke omrekening mee
-- vermenigvuldigt -- die rondt nu een zevende decimaal stilletjes af.
--
-- Migratie 20260918200000_money_to_numeric.sql heeft de rest van de
-- geldkolommen al omgezet; deze vier stonden niet in die lijst.
--
-- WAAROM DE VIEW ERAF MOET
--
-- `top_ups_view` hangt aan deze kolommen, en Postgres weigert een
-- `alter column type` zolang een view hem gebruikt. Deze plak leest de
-- definitie uit, legt hem weg, haalt de view weg, zet de kolommen om en
-- bouwt de view daarna weer op -- inclusief security_invoker en de
-- rechten die erop stonden.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak94 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak94;

-- De definitie en de rechten worden in een GEWONE tabel bewaard, niet
-- een temporary: mocht de sessie sneuvelen halverwege, dan is de oude
-- definitie nog terug te vinden.
create table if not exists public._plak94_stash (
  name text primary key,
  def text,
  invoker boolean,
  grants text,
  saved_at timestamptz not null default now()
);

-- ── 1. de view opzij ─────────────────────────────────────────────────
do $blk0$
declare
  v_def     text;
  v_invoker boolean;
  v_grants  text;
begin
  if to_regclass('public.top_ups_view') is null then
    insert into _plak94 values (0, 'view opzij', 'top_ups_view bestaat niet - niets te doen');
    return;
  end if;

  select pg_get_viewdef('public.top_ups_view'::regclass, true) into v_def;

  select coalesce(
           (select true
              from pg_class c
             where c.oid = 'public.top_ups_view'::regclass
               and c.reloptions::text ilike '%security_invoker=on%'),
           false)
    into v_invoker;

  select coalesce(string_agg(
           'grant ' || privilege_type || ' on public.top_ups_view to ' ||
           quote_ident(grantee) || ';', ' '), '')
    into v_grants
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'top_ups_view';

  insert into public._plak94_stash (name, def, invoker, grants)
  values ('top_ups_view', v_def, v_invoker, v_grants)
  on conflict (name) do update
    set def = excluded.def, invoker = excluded.invoker,
        grants = excluded.grants, saved_at = now();

  drop view public.top_ups_view;

  insert into _plak94 values (0, 'view opzij',
    'definitie bewaard (' || length(v_def) || ' tekens), invoker=' ||
    v_invoker || ', view verwijderd');
exception when others then
  insert into _plak94 values (0, 'view opzij', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. de vier kolommen, één ALTER per blok ──────────────────────────
do $blk1$
begin
  alter table public.top_ups alter column eur_value type numeric(14,2);
exception when others then
  insert into _plak94 values (1, 'top_ups.eur_value', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

do $blk2$
begin
  alter table public.top_ups alter column eur_topup type numeric(14,2);
exception when others then
  insert into _plak94 values (2, 'top_ups.eur_topup', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

do $blk3$
begin
  alter table public.top_ups alter column topup_usd type numeric(14,2);
exception when others then
  insert into _plak94 values (3, 'top_ups.topup_usd', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

do $blk4$
begin
  alter table public.top_ups alter column rate type numeric(14,8);
exception when others then
  insert into _plak94 values (4, 'top_ups.rate', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

do $blk5$
begin
  alter table public.exchange_rates alter column eur type numeric(14,8);
exception when others then
  insert into _plak94 values (5, 'exchange_rates.eur', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ── 3. de view terug ─────────────────────────────────────────────────
do $blk6$
declare
  v record;
begin
  select * into v from public._plak94_stash where name = 'top_ups_view';
  if v is null then
    insert into _plak94 values (6, 'view terug', 'niets bewaard - overgeslagen');
    return;
  end if;
  if to_regclass('public.top_ups_view') is not null then
    insert into _plak94 values (6, 'view terug', 'stond er al - niets gedaan');
    return;
  end if;

  execute 'create view public.top_ups_view as ' || v.def;

  if v.invoker then
    execute 'alter view public.top_ups_view set (security_invoker = on)';
  end if;

  if coalesce(v.grants, '') <> '' then
    execute v.grants;
  end if;

  insert into _plak94 values (6, 'view terug', 'opnieuw aangemaakt');
exception when others then
  insert into _plak94 values (6, 'view terug', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk6$;

-- ── controle: lees de werkelijkheid terug ────────────────────────────
do $blk7$
declare
  v_types text;
  v_view  integer;
  v_rows  bigint;
  v_inv   boolean;
begin
  select string_agg(table_name || '.' || column_name || '=' || data_type, ', '
                    order by table_name, column_name)
    into v_types
    from information_schema.columns
   where (table_name = 'top_ups'
          and column_name in ('eur_value', 'eur_topup', 'topup_usd', 'rate'))
      or (table_name = 'exchange_rates' and column_name = 'eur');

  v_view := case when to_regclass('public.top_ups_view') is null then 0 else 1 end;

  if v_view = 1 then
    execute 'select count(*) from public.top_ups_view' into v_rows;
    select coalesce(
             (select true from pg_class c
               where c.oid = 'public.top_ups_view'::regclass
                 and c.reloptions::text ilike '%security_invoker=on%'), false)
      into v_inv;
  else
    v_rows := 0;
    v_inv := false;
  end if;

  insert into _plak94 values (7, 'stand van zaken',
    v_types || ' | view: ' || v_view || '/1, ' || v_rows ||
    ' rijen, security_invoker=' || v_inv);
exception when others then
  insert into _plak94 values (7, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk7$;

-- ── en of de centen er nu wel in passen ──────────────────────────────
do $blk8$
declare
  v text;
begin
  select 'een proefbedrag van 11463.12 wordt nu opgeslagen als ' ||
         (11463.12::numeric(14,2))::text ||
         ' (in real was dat 11463.1)'
    into v;
  insert into _plak94 values (8, 'proef', v);
exception when others then
  insert into _plak94 values (8, 'proef', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk8$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
--
-- Geen enkele regel met FOUT erin? Dan kan de bewaarde definitie weg:
--   drop table public._plak94_stash;
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak94 order by n;
