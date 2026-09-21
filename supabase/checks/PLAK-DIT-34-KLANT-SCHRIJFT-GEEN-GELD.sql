-- =====================================================================
-- PLAK 34 — een klant schrijft geen geld. BEVEILIGING, NU PLAKKEN.
-- =====================================================================
-- Plak 33 rij 7 en 8, gelezen op productie 21-09:
--
--   top_ups | "Enable insert for advertiser"  | INSERT | eigen advertiser
--   top_ups | "Enable update advertisers"     | UPDATE | eigen advertiser
--   top_ups   authenticated: INSERT, UPDATE (en anon ook)
--
-- Elke INGELOGDE KLANT kan dus vanuit de browserconsole:
--
--   update top_ups set status = 'completed', topup_amount = 10000
--    where id = '<een eigen funding>'
--
-- of er een nieuwe rij bij zetten die al 'completed' is -- zonder dat er
-- een cent uit zijn wallet gaat. Die rij telt mee voor "Funded to date",
-- boekt commissie voor zijn referrer, en telt mee voor het PLAFOND van
-- een opname van het ad account. Een opname die de admin goedkeurt zet
-- echt geld in de wallet. Dat is het lek.
--
-- De app gebruikt die twee policies NERGENS: de klant zet geld op een
-- account via de definer-functie top_up_create_for_advertiser, en er is
-- geen enkele schrijfactie op top_ups vanuit een klantsessie (gezocht in
-- actions/, app/, components/, hooks/, lib/).
--
-- Dezelfde soort, op twee andere tabellen:
--
--   invitations | "Only sender or receiver can update" | UPDATE
--       Een UITGENODIGDE kon zijn eigen uitnodiging wijzigen vóór hij hem
--       accepteert: plan, fee, referrer. Alle schrijvers in de code
--       gebruiken de service key (invite-actions, accept-invite, signup,
--       send-invite).
--   advertisers | "Allow ALL for advertisers" | ALL
--       Een klant kon zijn eigen advertiser-rij wijzigen of verwijderen,
--       elke kolom. De code LEEST die rij alleen (company-actions,
--       invites-table); aanmaken gaat via definer-functies.
--
-- En op top_ups voor een medewerker-admin: "Enable ALL for admins" laat
-- elke admin via de console bedragen herschrijven. De enige schrijver met
-- een admin-sessie (updateTopupAsAdmin) wijzigt alleen type, notes,
-- status, is_deleted, updated_at en author. Een BEFORE-trigger houdt de
-- sessie nu aan precies die kolommen. Definer-functies (verify, reject,
-- de klantfunctie) draaien als hun eigenaar en de service key als
-- service_role -- alleen een sessie is 'authenticated', dus die raakt
-- de trigger niet.
--
-- VEILIG: elke stap meet eerst. Schrijft een INVOKER-functie (geen
-- definer) naar de tabel, dan zou het intrekken iets breken -- dan wordt
-- die stap overgeslagen en staat in het rapport waarom.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p34 (nr int, item text, v text);
delete from _p34;

-- ── 0. VOOR ──────────────────────────────────────────────────────────
insert into _p34
select 0, 'policies VOOR (top_ups, invitations, advertisers)',
  coalesce(string_agg(tablename || ' | ' || policyname || ' | ' || cmd, E'\n'
                      order by tablename, policyname), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename in ('top_ups', 'invitations', 'advertisers');

-- Invoker-functies die naar deze tabellen schrijven: die zouden breken.
insert into _p34
select 1, 'INVOKER-functies (geen definer) die schrijven naar top_ups / invitations / advertisers',
  coalesce(string_agg(p.proname, ', ' order by p.proname), 'geen')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and not p.prosecdef
   and p.prokind = 'f'
   and (p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(top_ups|invitations|advertisers)\b');

-- ── 1. top_ups: de klant schrijft niet meer ──────────────────────────
do $blk0$
declare
  v_invokers text;
begin
  select string_agg(p.proname, ', ') into v_invokers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
     and p.prosrc ~* '(insert\s+into|update)\s+(public\.)?top_ups\b';
  if v_invokers is not null then
    insert into _p34 values (2, 'top_ups: klant-policies', 'OVERGESLAGEN - invoker-functies schrijven hier: ' || v_invokers);
  else
    execute 'drop policy if exists "Enable insert for advertiser" on public.top_ups';
    execute 'drop policy if exists "Enable update advertisers" on public.top_ups';
    insert into _p34 values (2, 'top_ups: klant-policies', 'INSERT en UPDATE voor de adverteerder verwijderd; lezen blijft');
  end if;
  execute 'revoke insert, update, delete, truncate on public.top_ups from anon';
  execute 'revoke truncate on public.top_ups from authenticated';
exception when others then
  insert into _p34 values (2, 'top_ups: klant-policies', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- ── 2. top_ups: een sessie wijzigt geen bedragen ─────────────────────
create or replace function public._guard_top_ups_session_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk1$
declare
  v_allowed text[] := array['type', 'notes', 'status', 'is_deleted', 'updated_at', 'author'];
begin
  -- Hoort het account en de advertiser bij DEZE tenant? Voor iedereen,
  -- ook definer en service key: een funding op de advertiser van een
  -- andere tenant boekte commissie op DIENS link.
  if tg_op = 'INSERT' or new.advertiser_id is distinct from old.advertiser_id
     or new.tenant_id is distinct from old.tenant_id
     or new.account_id is distinct from old.account_id then
    if not exists (select 1 from public.advertisers a
                    where a.id = new.advertiser_id and a.tenant_id = new.tenant_id) then
      raise exception 'top_ups: advertiser is not in this tenant' using errcode = '42501';
    end if;
    if new.account_id is not null and not exists (
         select 1 from public.ad_accounts x
          where x.id = new.account_id and x.tenant_id = new.tenant_id) then
      raise exception 'top_ups: ad account is not in this tenant' using errcode = '42501';
    end if;
  end if;

  -- Alleen een sessie (browser of server action) is 'authenticated'.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'top_ups: only type, notes, status and is_deleted can be changed here'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and coalesce(old.status, '') in ('completed', 'rejected') then
      raise exception 'top_ups: a % top-up cannot change status here', old.status
        using errcode = '42501';
    end if;
    if coalesce(new.is_deleted, false) and not coalesce(old.is_deleted, false)
       and coalesce(old.status, '') = 'completed' then
      raise exception 'top_ups: a completed top-up cannot be deleted here'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$blk1$;

do $blk2$
begin
  execute 'drop trigger if exists trg_guard_top_ups_session_write on public.top_ups';
  execute 'create trigger trg_guard_top_ups_session_write before insert or update on public.top_ups
             for each row execute function public._guard_top_ups_session_write()';
  insert into _p34 values (3, 'top_ups: sessie-kolomwacht', 'trigger staat (BEFORE INSERT OR UPDATE)');
exception when others then
  insert into _p34 values (3, 'top_ups: sessie-kolomwacht', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk2$;

-- ── 3. invitations: niemand schrijft met een sessie ──────────────────
do $blk3$
declare
  v_invokers text;
begin
  select string_agg(p.proname, ', ') into v_invokers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
     and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?invitations\b';
  if v_invokers is not null then
    insert into _p34 values (4, 'invitations', 'OVERGESLAGEN - invoker-functies schrijven hier: ' || v_invokers);
  else
    execute 'drop policy if exists "Only sender or receiver can update" on public.invitations';
    execute 'drop policy if exists "Enable insert for admin users only" on public.invitations';
    execute 'revoke insert, update, delete, truncate on public.invitations from authenticated, anon';
    insert into _p34 values (4, 'invitations', 'schrijven ingetrokken voor sessies; lezen blijft; schrijvers gebruiken de service key');
  end if;
exception when others then
  insert into _p34 values (4, 'invitations', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk3$;

-- ── 4. advertisers: de klant leest zijn eigen rij, meer niet ─────────
do $blk4$
declare
  v_invokers text;
begin
  select string_agg(p.proname, ', ') into v_invokers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
     and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?advertisers\b';
  if v_invokers is not null then
    insert into _p34 values (5, 'advertisers', 'OVERGESLAGEN - invoker-functies schrijven hier: ' || v_invokers);
  else
    execute 'drop policy if exists "Allow ALL for advertisers" on public.advertisers';
    execute 'drop policy if exists advertisers_self_select on public.advertisers';
    execute 'create policy advertisers_self_select on public.advertisers
               for select to authenticated
               using ((select auth.uid()) = user_id)';
    insert into _p34 values (5, 'advertisers', 'ALL voor de klant vervangen door alleen SELECT op de eigen rij');
  end if;
exception when others then
  insert into _p34 values (5, 'advertisers', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk4$;

-- ── 5. anon schrijft nergens in deze reis ────────────────────────────
do $blk5$
begin
  execute 'revoke insert, update, delete, truncate on public.referral_links, public.referral_commissions,
             public.referral_clawbacks, public.affiliates from anon';
  execute 'revoke truncate on public.referral_links, public.referral_commissions,
             public.referral_clawbacks, public.affiliates, public.invitations from authenticated';
  insert into _p34 values (6, 'anon + truncate', 'ingetrokken op de referral-tabellen');
exception when others then
  insert into _p34 values (6, 'anon + truncate', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk5$;

-- ── 6. wat nog nodig is voor de volgende stap ────────────────────────
-- Om ook INSERT voor admin-sessies dicht te zetten gaan de drie admin-
-- schrijvers naar de service key; dan is auth.uid() leeg in de triggers.
-- Deze twee moeten daar tegen kunnen.
insert into _p34
select 7, 'STUUR TERUG >> bodies log_topup_activity + notify_topup_created',
  coalesce(string_agg(p.proname || E':\n' || pg_get_functiondef(p.oid), E'\n\n'), 'niet gevonden')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('log_topup_activity', 'notify_topup_created');

-- Dezelfde soort lek elders? Elke schrijf-policy in public die NIET op
-- een admin- of eigenaarscheck staat. Dit repareert niets; het is de
-- lijst voor de volgende ronde.
insert into _p34
select 8, 'OVERIGE schrijf-policies zonder admin/eigenaar-check (lijst, niet gerepareerd)',
  coalesce(string_agg(tablename || ' | ' || policyname || ' | ' || cmd, E'\n'
                      order by tablename, policyname), 'geen')
  from pg_policies
 where schemaname = 'public'
   and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
   and coalesce(qual, '') || coalesce(with_check, '') !~* '(_is_admin_of|_is_super_admin_of|owner_id)';

-- ── NA ───────────────────────────────────────────────────────────────
insert into _p34
select 9, 'policies NA (top_ups, invitations, advertisers)',
  coalesce(string_agg(tablename || ' | ' || policyname || ' | ' || cmd, E'\n'
                      order by tablename, policyname), 'geen')
  from pg_policies
 where schemaname = 'public' and tablename in ('top_ups', 'invitations', 'advertisers');

insert into _p34
select 10, 'rechten NA voor authenticated/anon',
  coalesce(string_agg(table_name || ' ' || grantee || ': ' || privs, E'\n' order by table_name, grantee), 'geen')
  from (select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
          from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('authenticated', 'anon')
           and table_name in ('top_ups', 'invitations', 'advertisers', 'referral_links',
                              'referral_commissions', 'referral_clawbacks', 'affiliates')
         group by table_name, grantee) g;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select nr, item, v as antwoord from _p34 order by nr;
