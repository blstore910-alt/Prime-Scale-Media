-- ════════════════════════════════════════════════════════════════════
--  PLAK 56 — geld uit het niets maken kan alleen de eigenaar
--
--  WAT DE RECHTEN-SWEEP OP F4 VOND
--
--  De eigenaar-poort staat in de server actions; de TABELLEN zeggen nog
--  steeds "elke admin van de tenant". Een medewerker met een
--  admin-account kan daardoor met één API-aanroep:
--
--    1  een FACTUUR wegschrijven met status 'paid' en een eigen bedrag
--       -> de trigger boekt meteen commissie over dat bedrag
--    2  een STORTING wegschrijven met status 'completed' en een eigen
--       fee -> commissie + welkomstbonus, en het telt mee als gestort
--    3  onze INKOOPPRIJS per ad-account-type veranderen
--       -> 0% = maximale commissie en een opgeblazen marge,
--          100% = niemand verdient ooit nog iets, stilletjes,
--          weghalen = elke nieuwe commissie blijft "on hold" hangen
--    4  de SLUG of de standaardfee van een ad-account-type veranderen
--       -> één woord en de inkoopprijs hangt nergens meer aan vast
--
--  Na dit blok geldt op alle vier: de service-sleutel en de functies
--  mogen alles (zo werkt de app), een sessie mag alleen nog wat bij het
--  werk hoort, en de rest is van de eigenaar.
--
--  WAT EEN MEDEWERKER WEL BLIJFT KUNNEN: een openstaande factuur op
--  betaald zetten, een wachtende storting verifiëren, notities en
--  vervaldata bijwerken. Dat is hun werk; het bedrag zelf verzinnen is
--  dat niet.
--
--  WAT ER VOOR EEN MEDEWERKER WEGVALT: met de hand een factuur AANMAKEN
--  (dat doet de facturatiemotor, of jij). Dat is bewust: wie een bedrag
--  mag typen, mag commissie maken. De knop blijft staan en zegt het
--  eerlijk als het niet mag.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p56;
create temp table _p56(nr int, wat text, uitkomst text);

-- ── HULPJE: is de schrijver de eigenaar van deze tenant? ─────────────
create or replace function public._is_tenant_owner(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $blk0$
  select exists (
    select 1 from public.tenants t
     where t.id = p_tenant and t.owner_id = auth.uid()
  );
$blk0$;

revoke all on function public._is_tenant_owner(uuid) from public, anon;
grant execute on function public._is_tenant_owner(uuid) to authenticated;

-- ── A. FACTUREN ──────────────────────────────────────────────────────
create or replace function public._guard_invoices_session_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk1$
begin
  -- De service-sleutel (de facturatiemotor, de cron, de RPC's) gaat vrij.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Een factuur MET een bedrag aanmaken is geld maken.
    if not public._is_tenant_owner(new.tenant_id) then
      raise exception 'invoices: an invoice is raised by the billing engine or the owner'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: alleen het werk aan een bestaande factuur. De vergelijking
  -- loopt via to_jsonb, zodat een kolom die op deze database niet
  -- bestaat geen fout geeft maar gewoon niet meetelt.
  if new.tenant_id      is distinct from old.tenant_id
     or new.advertiser_id is distinct from old.advertiser_id
     or new.total        is distinct from old.total
     or new.currency     is distinct from old.currency
     or new.type         is distinct from old.type
     or (to_jsonb(new) ->> 'sub_total') is distinct from (to_jsonb(old) ->> 'sub_total')
     or (to_jsonb(new) ->> 'items') is distinct from (to_jsonb(old) ->> 'items')
     or new.subscription_id is distinct from old.subscription_id then
    if not public._is_tenant_owner(new.tenant_id) then
      raise exception 'invoices: the amount and who it is for are the owner''s'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$blk1$;

do $blk2$
begin
  execute 'drop trigger if exists a0_guard_invoices_session_write on public.invoices';
  execute 'create trigger a0_guard_invoices_session_write
             before insert or update on public.invoices
             for each row execute function public._guard_invoices_session_write()';
  insert into _p56 values (1, 'facturen', 'bedrag en klant alleen door de eigenaar; op betaald zetten blijft werk van de admin');
exception when others then
  insert into _p56 values (1, 'facturen', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── B. STORTINGEN ────────────────────────────────────────────────────
--  De bestaande poort (plak 34) bewaakt alleen UPDATE-kolommen. Wat
--  ontbrak is de INSERT van een rij die meteen 'completed' is: dat is
--  het moment waarop commissie geboekt wordt.
create or replace function public._guard_top_ups_insert_completed()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk3$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if coalesce(new.status, 'pending') = 'completed'
     and not public._is_tenant_owner(new.tenant_id) then
    raise exception 'top_ups: a funding is filed as pending and verified after that'
      using errcode = '42501';
  end if;
  return new;
end;
$blk3$;

do $blk4$
begin
  execute 'drop trigger if exists a0_guard_top_ups_insert_completed on public.top_ups';
  execute 'create trigger a0_guard_top_ups_insert_completed
             before insert on public.top_ups
             for each row execute function public._guard_top_ups_insert_completed()';
  insert into _p56 values (2, 'stortingen', 'een sessie kan geen rij meer invoegen die al voltooid is (behalve de eigenaar)');
exception when others then
  insert into _p56 values (2, 'stortingen', 'MISLUKT: ' || sqlerrm);
end
$blk4$;

-- ── C. ONZE INKOOPPRIJS ──────────────────────────────────────────────
create or replace function public._guard_supplier_cost_owner()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk5$
declare v_tenant uuid;
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  v_tenant := coalesce(new.tenant_id, old.tenant_id);
  if not public._is_tenant_owner(v_tenant) then
    raise exception 'supplier cost: what we pay is the owner''s'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$blk5$;

do $blk6$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'ad_account_type_suppliers') then
    execute 'drop trigger if exists a0_guard_supplier_cost_owner on public.ad_account_type_suppliers';
    execute 'create trigger a0_guard_supplier_cost_owner
               before insert or update or delete on public.ad_account_type_suppliers
               for each row execute function public._guard_supplier_cost_owner()';
    insert into _p56 values (3, 'inkoopprijs per type', 'alleen de eigenaar schrijft hem nog');
  else
    insert into _p56 values (3, 'inkoopprijs per type', 'tabel bestaat niet op deze database');
  end if;
exception when others then
  insert into _p56 values (3, 'inkoopprijs per type', 'MISLUKT: ' || sqlerrm);
end
$blk6$;

-- ── D. HET TYPE ZELF: FEE EN SLUG ────────────────────────────────────
create or replace function public._guard_ad_account_type_money()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk7$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.slug is distinct from old.slug
          or to_jsonb(new) ->> 'default_fee_pct' is distinct from to_jsonb(old) ->> 'default_fee_pct') then
    if not public._is_tenant_owner(new.tenant_id) then
      raise exception 'ad account types: the fee and the slug are the owner''s'
        using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' and not public._is_tenant_owner(new.tenant_id) then
    raise exception 'ad account types: a new type is the owner''s'
      using errcode = '42501';
  end if;
  return new;
end;
$blk7$;

do $blk8$
begin
  execute 'drop trigger if exists a0_guard_ad_account_type_money on public.ad_account_types';
  execute 'create trigger a0_guard_ad_account_type_money
             before insert or update on public.ad_account_types
             for each row execute function public._guard_ad_account_type_money()';
  insert into _p56 values (4, 'ad-account-types', 'fee en slug alleen door de eigenaar (de slug is waar de inkoopprijs aan hangt)');
exception when others then
  insert into _p56 values (4, 'ad-account-types', 'MISLUKT: ' || sqlerrm);
end
$blk8$;

-- ── E. WAT ER NU STAAT (alleen lezen, met vangnet) ───────────────────
do $blk9$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname || ': ' || t.tgname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal
       and t.tgname like 'a0_guard%'
       and c.relname in ('invoices','top_ups','ad_account_type_suppliers','ad_account_types',
                         'referral_links','advertisers');
  exception when others then
    v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p56 values (5, 'sloten die nu op de geldtabellen staan', v_txt);

  begin
    select coalesce(string_agg(t.name || ': ' ||
             coalesce((select up.email from public.user_profiles up
                        where up.user_id = t.owner_id limit 1), '(geen eigenaar)'),
             ' · '), 'geen tenants')
      into v_txt
      from public.tenants t;
  exception when others then
    v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p56 values (6, 'wie is de eigenaar', v_txt);
end
$blk9$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p56 order by nr;
