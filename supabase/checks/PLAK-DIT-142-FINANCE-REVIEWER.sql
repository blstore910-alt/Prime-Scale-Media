-- ════════════════════════════════════════════════════════════════════
-- PLAK 142 — ÉÉN MEDEWERKER MAG DE FINANCIËN NAKIJKEN
-- ════════════════════════════════════════════════════════════════════
--
-- WAT DIT IS
--
-- Je vroeg om een financiële controletaak: één medewerker die ALLES
-- kan nakijken -- top-ups, opnames van ad-accounts, terugbetalingen,
-- alles wat niet automatisch is goedgekeurd door de Wise-API of de
-- leverancier -- zonder ook maar iets te kunnen goedkeuren.
--
-- "finance check only for 1 admin and super admin."
--
-- Dat is precies de vorm die een controle hoort te hebben: wie
-- controleert, beslist niet. Een medewerker die zowel nakijkt als
-- goedkeurt controleert zichzelf, en dat is geen controle.
--
-- WAT DEZE PLAK DOET
--
-- Eén kolom: `user_profiles.finance_reviewer`. Staat hij op true, dan
-- mag die admin het scherm /finance-check openen. De eigenaar mag er
-- altijd bij.
--
-- Het scherm zelf heeft GEEN enkele knop die geld verplaatst. Het
-- leest, het rekent na, en het zegt wat er niet klopt. Goedkeuren
-- gebeurt waar het altijd al gebeurde, door wie het altijd al deed.
--
-- WIE ZET HET AAN
--
-- Alleen de eigenaar, en alleen op een admin. Onderaan deze plak staat
-- de regel om het te doen -- vul het e-mailadres in en draai hem, of
-- laat hem staan en doe het later. Zonder dat kan alleen jij bij het
-- scherm.
-- ════════════════════════════════════════════════════════════════════

-- ── DE KOLOM ───────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists finance_reviewer boolean not null default false;

comment on column public.user_profiles.finance_reviewer is
  'Mag /finance-check openen: alle geldstromen nakijken, niets goedkeuren. Alleen de eigenaar zet dit aan, en alleen op een admin.';

-- ── WIE MAG HET AANZETTEN ──────────────────────────────────────────
-- Dit is een RECHT, dus het hoort niet in de gewone profielupdate te
-- kunnen glippen. De server action die profielen bijwerkt heeft een
-- kolom-allowlist en deze kolom staat daar niet in; deze functie is de
-- enige weg, en hij toetst de eigenaar.
create or replace function public.set_finance_reviewer(
  p_profile_id uuid,
  p_on         boolean
) returns void
language plpgsql
security definer
set search_path to 'public'
as $blk0$
declare
  v_tenant uuid;
  v_role   text;
begin
  select tenant_id, role into v_tenant, v_role
    from public.user_profiles where id = p_profile_id;

  if v_tenant is null then
    raise exception 'Dat profiel bestaat niet.';
  end if;

  -- Alleen de eigenaar van DIE tenant.
  if not exists (
    select 1 from public.tenants t
     where t.id = v_tenant and t.owner_id = auth.uid()
  ) then
    raise exception 'Alleen de eigenaar kan de financiële controle toewijzen.';
  end if;

  -- En alleen aan een admin. Een adverteerder of affiliate hoort nooit
  -- de boeken van alle klanten te zien.
  if p_on and coalesce(v_role, '') <> 'admin' then
    raise exception 'De financiële controle kan alleen aan een admin worden gegeven.';
  end if;

  update public.user_profiles
     set finance_reviewer = p_on,
         updated_at = now()
   where id = p_profile_id;
end
$blk0$;

-- De rechten. `authenticated` mag hem aanroepen omdat de eigenaar
-- daaronder valt; de functie toetst zelf of de beller de eigenaar is.
revoke all on function public.set_finance_reviewer(uuid, boolean)
  from public, anon;
grant execute on function public.set_finance_reviewer(uuid, boolean)
  to authenticated, service_role;

-- ── DE TOEWIJZING ──────────────────────────────────────────────────
-- Vul hieronder het e-mailadres in van de medewerker die de financiën
-- mag nakijken, haal de commentaarstreepjes weg en draai de plak
-- opnieuw. Of laat het staan: dan kan alleen jij bij het scherm, en je
-- kunt het later alsnog doen.
--
-- update public.user_profiles
--    set finance_reviewer = true
--  where email = 'VUL-HIER-HET-EMAILADRES-IN'
--    and role = 'admin';

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
select
  'plak 142 geplaatst'                                     as wat,
  (select count(*) from information_schema.columns
    where table_name = 'user_profiles'
      and column_name = 'finance_reviewer')::text          as kolom_bestaat,
  (select count(*) from public.user_profiles
    where finance_reviewer)::text                          as aantal_controleurs,
  coalesce((select string_agg(email, ', ')
              from public.user_profiles
             where finance_reviewer), '(nog niemand)')     as wie,
  (select has_function_privilege('anon',
            'public.set_finance_reviewer(uuid, boolean)', 'execute')::text)
                                                           as anon_mag;
