-- ════════════════════════════════════════════════════════════════════
-- PLAK 187 -- de klantcode ligt vast op het moment van uitnodigen
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "'PSM0022 if they sign up next' is onhandig, want
-- ik maak altijd direct de WhatsApp-groep aan. Beter vast, en anders is
-- die code maar verbrand -- geen probleem."
--
-- Tot nu toe kreeg een klant zijn code pas bij het AANMELDEN
-- (generate_client_code op advertisers). Twee uitnodigingen na elkaar
-- beloofden allebei PSM0022; wie het eerst aanmeldde kreeg hem.
--
-- Nu:
--   1. invitations.client_code: bij het aanmaken van een uitnodiging
--      voor een advertiser of affiliate (geen teamlid) wordt de volgende
--      code meteen gereserveerd -- tenants.last_client_code + 1. Staat
--      er voor hetzelfde adres al een open uitnodiging met een code die
--      nog niemand heeft, dan krijgt de nieuwe die code (opnieuw sturen
--      verbrandt dus niets).
--   2. generate_client_code: bij het aanmelden eerst de gereserveerde
--      code van de uitnodiging voor dit e-mailadres; alleen zonder
--      reservering (of als die code al bezet is) de volgende uit de rij.
--
-- Een uitnodiging die nooit geaccepteerd wordt, verbrandt haar code.
-- Dat is wat de eigenaar wil.
--
-- Twee keer plakken kan.

do $blk0$
begin
  alter table public.invitations add column if not exists client_code text;
end;
$blk0$;

-- ── 1. RESERVEREN BIJ HET UITNODIGEN ─────────────────────────────────
create or replace function public._reserve_invite_client_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $blk1$
declare
  v_initials text;
  v_next integer;
  v_bestaand text;
begin
  if new.client_code is not null
     or new.role not in ('advertiser', 'affiliate')
     or new.team_advertiser_id is not null then
    return new;
  end if;

  -- Opnieuw uitnodigen: dezelfde code, als die nog vrij is.
  select i.client_code into v_bestaand
    from public.invitations i
   where i.tenant_id = new.tenant_id
     and lower(i.email) = lower(new.email)
     and i.client_code is not null
     and i.status = 'pending'
     and not exists (select 1 from public.advertisers a where a.tenant_client_code = i.client_code)
   order by i.created_at desc
   limit 1;
  if v_bestaand is not null then
    new.client_code := v_bestaand;
    return new;
  end if;

  select initials, last_client_code into v_initials, v_next
    from public.tenants where id = new.tenant_id for update;
  v_next := coalesce(v_next, 0) + 1;
  update public.tenants set last_client_code = v_next where id = new.tenant_id;
  new.client_code := v_initials || lpad(v_next::text, 4, '0');
  return new;
end;
$blk1$;
revoke all on function public._reserve_invite_client_code() from public, anon;

drop trigger if exists a1_reserve_invite_client_code on public.invitations;
create trigger a1_reserve_invite_client_code
  before insert on public.invitations
  for each row execute function public._reserve_invite_client_code();

-- ── 2. BIJ HET AANMELDEN DE GERESERVEERDE CODE ───────────────────────
create or replace function public.generate_client_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $blk2$
declare
  tenant_initials varchar;
  next_number integer;
  v_email text;
  v_code text;
begin
  -- Het adres van wie zich aanmeldt: via het profiel, anders via auth.
  if new.profile_id is not null then
    select email into v_email from public.user_profiles where id = new.profile_id;
  end if;
  if v_email is null and new.user_id is not null then
    select email into v_email from auth.users where id = new.user_id;
  end if;

  if v_email is not null then
    select i.client_code into v_code
      from public.invitations i
     where i.tenant_id = new.tenant_id
       and lower(i.email) = lower(v_email)
       and i.client_code is not null
       and i.status in ('pending', 'accepted')
       and i.team_advertiser_id is null
       and not exists (select 1 from public.advertisers a where a.tenant_client_code = i.client_code)
     order by i.created_at desc
     limit 1;
  end if;

  if v_code is not null then
    new.tenant_client_code := v_code;
    return new;
  end if;

  -- Geen reservering: zoals altijd, de volgende uit de rij.
  select initials, last_client_code
    into tenant_initials, next_number
    from public.tenants
   where id = new.tenant_id
   for update;
  next_number := next_number + 1;
  update public.tenants set last_client_code = next_number where id = new.tenant_id;
  new.tenant_client_code := tenant_initials || lpad(next_number::text, 4, '0');
  return new;
end;
$blk2$;
revoke all on function public.generate_client_code() from public, anon;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select 'invitations.client_code' as wat,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'invitations' and column_name = 'client_code')::text as uitkomst
union all
select 'trigger reserveren',
       (select count(*) from pg_trigger where tgname = 'a1_reserve_invite_client_code')::text
union all
select 'generate_client_code leest uitnodiging',
       (position('i.client_code' in pg_get_functiondef('public.generate_client_code'::regproc)) > 0)::text
union all
select 'anon mag niet',
       (has_function_privilege('anon', 'public._reserve_invite_client_code()', 'execute')
        or has_function_privilege('anon', 'public.generate_client_code()', 'execute'))::text
union all
select 'laatste code nu',
       (select string_agg(initials || lpad(last_client_code::text, 4, '0'), ', ') from public.tenants);
