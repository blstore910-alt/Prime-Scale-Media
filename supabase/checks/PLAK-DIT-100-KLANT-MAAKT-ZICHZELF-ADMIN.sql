-- ════════════════════════════════════════════════════════════════════
-- PLAK 100 — een klant kan zichzelf een adminprofiel geven
-- ════════════════════════════════════════════════════════════════════
--
-- Gemeten op productie, 26-09. Drie schakels die los onschuldig zijn en
-- samen een deur vormen:
--
--   1. tenants_owner_insert  INSERT, rol {public}, en de enige test is
--                            auth.uid() is not null and owner_id = auth.uid()
--   2. authenticated heeft INSERT op public.tenants  -> true
--   3. add_admin_after_tenant_insert is SECURITY DEFINER en draait
--      create_admin_for_tenant, dat dit doet:
--
--        insert into user_profiles (role, user_id, tenant_id, ...)
--        values ('admin', NEW.owner_id, NEW.id, ...);
--        insert into admins (tenant_id, user_id, profile_id) ...;
--
-- Dus: elke ingelogde adverteerder of affiliate kan EEN verzoek naar
-- /rest/v1/tenants sturen met zijn eigen uid als owner_id, en heeft
-- daarna een tweede user_profiles-rij met role = 'admin'.
--
-- WAT DAT WEL EN NIET IS
--
-- Het is GEEN weg naar de gegevens van Prime Scale Media. De nieuwe
-- tenant is leeg en alle RLS is per tenant, dus hij ziet geen andere
-- klant, geen portemonnee en geen factuur.
--
-- Het is wel een weg naar de ADMINSCHIL. De app kiest het actieve
-- profiel met een profile_id-cookie, dus met die tweede rij staat hij
-- in het beheerscherm -- en daar staan leverancierskosten en marge, die
-- een klant nooit mag zien. Bovendien vuurt ensureInitialAdAccountTypes
-- bij het laden voor elke admin, dus zijn verse tenant wordt meteen
-- gevuld met accounttypes inclusief die tarieven.
--
-- DE REPARATIE
--
-- De server action doet dit al goed: createTenantForCurrentUser weigert
-- met "This account already belongs to an organisation" als er al een
-- profiel is (actions/tenant-actions.ts). Die regel staat alleen in de
-- code en niet in de database, en PostgREST loopt om de code heen.
--
-- Dus: dezelfde regel in het beleid. Wie al ergens een profiel heeft,
-- kan geen nieuwe organisatie beginnen. Iemand die echt voor het eerst
-- komt heeft nog geen profiel en kan het gewoon.
--
-- En meteen: anon heeft SELECT op tenants (geverifieerd true). Dat lekt
-- vandaag niets, want het enige SELECT-beleid is {authenticated}. Maar
-- er staan al twee {public}-beleidsregels op die tabel, en de dag dat
-- iemand er een SELECT bij zet is het wel een lek. Weg ermee.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak100 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak100;

-- ── 1. wie al een profiel heeft, begint geen organisatie ────────────
do $blk0$
begin
  drop policy if exists tenants_owner_insert on public.tenants;

  create policy tenants_owner_insert on public.tenants
    for insert
    to authenticated
    with check (
      auth.uid() is not null
      and owner_id = auth.uid()
      -- Dezelfde regel als in de server action, nu ook waar PostgREST
      -- hem niet kan omzeilen.
      and not exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
      )
    );

  insert into _plak100 values (0, 'tenants_owner_insert vervangen',
    'alleen wie nog nergens een profiel heeft; rol van public naar authenticated');
exception when others then
  insert into _plak100 values (0, 'tenants_owner_insert vervangen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. het wijzigingsbeleid stond ook op public ─────────────────────
do $blk1$
begin
  drop policy if exists tenants_owner_update on public.tenants;

  create policy tenants_owner_update on public.tenants
    for update
    to authenticated
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

  insert into _plak100 values (1, 'tenants_owner_update vervangen',
    'rol van public naar authenticated, with check erbij zodat eigenaarschap niet weggeschreven kan worden');
exception when others then
  insert into _plak100 values (1, 'tenants_owner_update vervangen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. anon heeft niets te zoeken op tenants ────────────────────────
do $blk2$
begin
  revoke all on public.tenants from anon;
  insert into _plak100 values (2, 'anon van tenants af', 'gedaan');
exception when others then
  insert into _plak100 values (2, 'anon van tenants af',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk3$
declare
  v_pol  text;
  v_anon boolean;
  v_dicht integer;
begin
  select coalesce(string_agg(
           policyname || ' [' || cmd || '] ' || roles::text, ' | '
           order by cmd, policyname), 'geen')
    into v_pol
    from pg_policies where tablename = 'tenants';

  select has_table_privilege('anon', 'public.tenants', 'select') into v_anon;

  -- Staat de profielcontrole er echt in?
  select count(*) into v_dicht
    from pg_policies
   where tablename = 'tenants' and policyname = 'tenants_owner_insert'
     and coalesce(with_check, '') like '%user_profiles%';

  insert into _plak100 values (3, 'stand van zaken',
    v_pol || ' || anon mag lezen: ' || v_anon || ' (moet false)' ||
    ' || profielcontrole in het insert-beleid: ' || v_dicht || '/1');
exception when others then
  insert into _plak100 values (3, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── en dat er geen tweede adminprofiel is ontstaan ──────────────────
--     Iemand met meer dan een profiel is of een echte dubbelrol, of
--     iemand die deze deur al heeft gevonden. Hier staat wie het zijn,
--     zodat er naar gekeken kan worden in plaats van geraden.
do $blk4$
declare
  v text;
begin
  select coalesce(string_agg(
           x.user_id::text || ' -> ' || x.rollen, ' | '), 'niemand')
    into v
    from (
      select up.user_id,
             string_agg(distinct up.role::text, '+' order by up.role::text) as rollen,
             count(*) as n
        from public.user_profiles up
       group by up.user_id
      having count(*) > 1
    ) x;
  insert into _plak100 values (4, 'accounts met meer dan een profiel', v);
exception when others then
  insert into _plak100 values (4, 'accounts met meer dan een profiel',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak100 order by n;
