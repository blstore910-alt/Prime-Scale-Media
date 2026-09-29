-- ════════════════════════════════════════════════════════════════════
-- PLAK 155 — VEERTIEN POLICIES KENNEN NOG MAAR ÉÉN EIGENAAR
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- Plak 145 leerde de VIJF eigenaarsfuncties over `tenant_owners`, en
-- daarmee werkten alle policies die zo'n functie bellen. Maar
-- veertien policies hebben de toets met de hand uitgeschreven:
--
--   exists (select 1 from tenants t
--            where t.id = <tabel>.tenant_id
--              and t.owner_id = auth.uid())
--
-- Die bellen niets, dus die weten nog van niets. Gemeten vandaag:
-- alle veertien vergelijken rechtstreeks met `owner_id = auth.uid()`.
--
-- Voor `contact@primescalemedia.com` betekent dat onder meer:
--
--   commission_rules   LEZEN geweigerd -- hij ziet geen enkele
--                      commissieregel
--   exchange_rates     toevoegen en bijwerken geweigerd -- hij kan de
--                      koers niet zetten
--   tenants            bijwerken geweigerd -- geen instellingen
--
-- Dit is dezelfde les voor de derde keer vandaag: een toets die met
-- de hand op veel plekken is uitgeschreven, is een toets die je op
-- veel plekken vergeet. Eerst in de code (dertig plekken), toen in de
-- vijf functies, nu in de policies.
--
-- ── WAT DIT DOET, EN WAT HET MET OPZET NIET DOET ──────────────────
--
-- Het vervangt precies één stukje tekst per policy:
--
--   t.owner_id = auth.uid()   ->   public._in_owner_set(t.id, auth.uid())
--
-- en laat de rest van de voorwaarde staan -- de `exists`, de join, de
-- eventuele "of een admin"-tak. Dat is met opzet zo klein mogelijk:
-- een policy herschrijven is hem eerst weggooien, en een policy die
-- weg is en niet terugkomt is een tabel die open staat of een desk
-- die buitengesloten is.
--
-- Er zit daarom GEEN exception-handler in. Gaat er iets mis, dan
-- rolt de hele plak terug en is er niets veranderd. Dat is hier het
-- veilige gedrag, niet "zo veel mogelijk doorgaan".
--
-- Niemand verliest een recht: `_in_owner_set` zegt ja tegen iedereen
-- tegen wie de oude kolom ook ja zei. Er komen alleen mensen bij.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
declare
  r        record;
  v_q      text;
  v_wc     text;
  v_roles  text;
  v_cmd    text;
  n        int := 0;
begin
  for r in
    select c.relname                                      as tabel,
           pol.polname                                    as naam,
           pol.polcmd                                     as cmd,
           pol.polpermissive                              as permissief,
           pg_get_expr(pol.polqual, pol.polrelid)         as q,
           pg_get_expr(pol.polwithcheck, pol.polrelid)    as wc,
           (select string_agg(quote_ident(ro.rolname), ', ')
              from unnest(pol.polroles) x(oid)
              join pg_roles ro on ro.oid = x.oid)         as roles
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
              like '%owner_id%'
         or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
              like '%owner_id%')
  loop
    -- Allebei de vormen die in de database staan. `t` is overal de
    -- alias van de tenants-rij; komt er ooit een andere, dan raakt
    -- deze plak hem niet en meldt het rapport onderaan dat.
    v_q := r.q;
    v_wc := r.wc;

    if v_q is not null then
      v_q := replace(v_q, 't.owner_id = ( SELECT auth.uid() AS uid)',
                          'public._in_owner_set(t.id, auth.uid())');
      v_q := replace(v_q, 't.owner_id = auth.uid()',
                          'public._in_owner_set(t.id, auth.uid())');
    end if;
    if v_wc is not null then
      v_wc := replace(v_wc, 't.owner_id = ( SELECT auth.uid() AS uid)',
                            'public._in_owner_set(t.id, auth.uid())');
      v_wc := replace(v_wc, 't.owner_id = auth.uid()',
                            'public._in_owner_set(t.id, auth.uid())');
    end if;

    -- Niets veranderd betekent: dit was geen eigenaarstoets in de
    -- vorm die we kennen. Afblijven.
    if v_q is not distinct from r.q and v_wc is not distinct from r.wc then
      raise notice 'overgeslagen (andere vorm): % op %', r.naam, r.tabel;
      continue;
    end if;

    v_cmd := case r.cmd
               when 'r' then 'select'
               when 'a' then 'insert'
               when 'w' then 'update'
               when 'd' then 'delete'
               else 'all'
             end;
    v_roles := coalesce(r.roles, 'public');

    execute format('drop policy %I on public.%I', r.naam, r.tabel);
    execute format(
      'create policy %I on public.%I as %s for %s to %s %s %s',
      r.naam,
      r.tabel,
      case when r.permissief then 'permissive' else 'restrictive' end,
      v_cmd,
      v_roles,
      case when v_q is null then '' else 'using (' || v_q || ')' end,
      case when v_wc is null then '' else 'with check (' || v_wc || ')' end
    );

    n := n + 1;
    raise notice 'verbreed: % op % (%)', r.naam, r.tabel, v_cmd;
  end loop;

  raise notice 'plak 155: % policies kennen nu beide eigenaren', n;
end
$blk0$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `nog_oude_kolom` hoort 0 te zijn, en `via_de_lijst` 14.
select
  'plak 155 geplaatst'                                        as wat,
  (select count(*) from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
             like '%owner_id = auth.uid()%'
        or coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
             like '%owner_id = ( SELECT auth.uid()%'))::text  as nog_oude_kolom,
  (select count(*) from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
            like '%_in_owner_set%')::text                     as via_de_lijst,
  (select count(*) from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public')::text                         as policies_totaal;
