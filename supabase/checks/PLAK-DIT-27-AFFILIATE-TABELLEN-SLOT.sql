-- =====================================================================
-- PLAK 27 — de vier affiliate-tabellen stonden open voor elke admin
-- =====================================================================
-- Plak 26 mat het: `authenticated` houdt DELETE, INSERT en UPDATE op
-- alle vier de tabellen van deze journey. De policies eroverheen zijn
--
--   referral_links_write_admin        for all using (_is_admin_of(tenant_id))
--   referral_commissions_write_admin  for all using (_is_admin_of(tenant_id))
--
-- en `_is_admin_of` kent het verschil tussen de eigenaar en een
-- medewerker niet. Die policy test WIE de rij bezit en niets over WAT
-- erin geschreven wordt. Postgres kijkt eerst naar het GRANT en dan pas
-- naar de policy, dus vanuit de console van een ingelogde medewerker:
--
--   PATCH referral_links?id=eq.X   {"status":"active","commission_pct":90}
--     -> zichzelf goedkeuren en de prijs zetten, langs resolveOwnerCtx heen
--   POST  referral_links           {"affiliate_advertiser_id":<zichzelf>, ...}
--     -> de referral van een echte klant op je eigen rij richten
--   PATCH referral_commissions     {"status":"unpaid"}
--     -> een afgehandelde commissie heropenen
--   POST  referral_commissions     {"amount":5000, ...}   /  DELETE
--     -> geld verzinnen dat jou toekomt, of het bewijs weggooien
--
-- Er is vandaag niemand benadeeld: plak 26 telde 0 referral-links en 0
-- commissierijen. Dit is dus het goede moment -- er staat nog niets in
-- de weg.
--
-- ── WAT ER WEG KAN EN WAT MOET BLIJVEN ───────────────────────────────
--
-- Nagelopen per tabel welke schrijfactie er echt vanuit een BELLERsessie
-- komt. Alles wat niemand gebruikt, gaat eruit:
--
--   referral_clawbacks    geen enkele schrijver    -> INSERT, UPDATE, DELETE weg
--                         (_claw_back_referral_commission is definer)
--   referral_commissions  alleen UPDATE            -> INSERT, DELETE weg
--                         (referral-actions.ts:160; de accrual is definer)
--   referral_links        INSERT en UPDATE         -> alleen DELETE weg
--                         (referral-actions.ts:254 en :323 gebruiken
--                          createClient(); de aanmeldroute schrijft met
--                          de service-client en telt dus niet mee)
--   affiliates            alleen UPDATE            -> INSERT, DELETE weg
--                         (admin-actions.ts:499/551/609/788)
--
-- ── WAT DIT NIET DICHT DOET ──────────────────────────────────────────
--
-- De UPDATE-gaten blijven open, en dat is bewust. Ze dichtmaken vraagt
-- een kolomgrendel per tabel -- de vorm van `_guard_user_profile_role`
-- en `_fee_is_the_owners` -- die de eigenaar-only kolommen bewaakt:
-- `status` en `commission_*` op referral_links, `status` op
-- referral_commissions, `commission_rate`/`commission_amount`/
-- `payment_status` op affiliates. Dat is een aparte plak, en hij hoort
-- er te komen voordat de eerste affiliate iets verdient.
--
-- ── EN DE VIEW ───────────────────────────────────────────────────────
--
-- `referral_links_with_details` mag door `anon` gelezen worden. De view
-- staat wel op security_invoker (plak 26 regel 4), dus RLS van de
-- brontabel geldt en een anonieme sessie krijgt niets terug. Het recht
-- is daarmee zinloos in plaats van gevaarlijk -- maar zinloze rechten
-- zijn hoe het de volgende keer wel gevaarlijk wordt, en beide lezers
-- in de app zijn ingelogde adminschermen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _af (k text, v text);
delete from _af;

insert into _af
select 'voor',
  coalesce((
    select string_agg(x.obj || ': ' || x.privs, E'\n' order by x.obj)
      from (
        select c.relname::text as obj,
               string_agg(distinct a.privilege_type::text, ', '
                          order by a.privilege_type::text) as privs
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          cross join lateral aclexplode(
            coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
          left join pg_roles g on g.oid = a.grantee
         where n.nspname = 'public'
           and c.relname in ('referral_links','referral_commissions',
                             'affiliates','referral_clawbacks')
           and a.privilege_type in ('INSERT','UPDATE','DELETE')
           and coalesce(g.rolname,'PUBLIC') in ('anon','authenticated','PUBLIC')
         group by c.relname) x
  ), 'geen - alles was al dicht');

do $blk0$
declare
  v_done text := '';
begin
  -- Niemand schrijft deze vanuit een bellersessie.
  execute 'revoke insert, update, delete on public.referral_clawbacks from authenticated, anon';
  v_done := v_done || 'referral_clawbacks: alles weg' || E'\n';

  -- UPDATE blijft: referral-actions.ts:160 zet de betaalstatus met de
  -- sessie van de beller.
  execute 'revoke insert, delete on public.referral_commissions from authenticated, anon';
  v_done := v_done || 'referral_commissions: insert+delete weg, update blijft' || E'\n';

  -- INSERT en UPDATE blijven: assignAffiliateToAdvertiser en
  -- setReferralLinkStatus gaan allebei via createClient().
  execute 'revoke delete on public.referral_links from authenticated, anon';
  v_done := v_done || 'referral_links: delete weg, insert+update blijven' || E'\n';

  -- UPDATE blijft: admin-actions.ts schrijft er met de bellersessie.
  execute 'revoke insert, delete on public.affiliates from authenticated, anon';
  v_done := v_done || 'affiliates: insert+delete weg, update blijft';

  insert into _af values ('revoke', v_done);
exception when others then
  insert into _af values ('revoke', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

do $blk1$
begin
  execute 'revoke select on public.referral_links_with_details from anon';
  execute 'revoke select on public.referral_commissions_with_details from anon';
  insert into _af values ('view', 'anon-leesrecht ingetrokken');
exception when others then
  insert into _af values ('view', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'schrijfrechten VOOR deze plak' as item,
  coalesce((select v from _af where k = 'voor' limit 1), '?') as antwoord
union all
select 2, 'wat er is ingetrokken',
  coalesce((select v from _af where k = 'revoke' limit 1), '?')
union all
select 3, 'schrijfrechten NA deze plak (links insert+update, commissions update, affiliates update, clawbacks niets)',
  coalesce((
    select string_agg(x.obj || ': ' || x.privs, E'\n' order by x.obj)
      from (
        select c.relname::text as obj,
               string_agg(distinct a.privilege_type::text, ', '
                          order by a.privilege_type::text) as privs
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          cross join lateral aclexplode(
            coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
          left join pg_roles g on g.oid = a.grantee
         where n.nspname = 'public'
           and c.relname in ('referral_links','referral_commissions',
                             'affiliates','referral_clawbacks')
           and a.privilege_type in ('INSERT','UPDATE','DELETE')
           and coalesce(g.rolname,'PUBLIC') in ('anon','authenticated','PUBLIC')
         group by c.relname) x
  ), 'geen - alles dicht')
union all
select 4, 'de views', coalesce((select v from _af where k = 'view' limit 1), '?')
union all
select 5, 'wie mag referral_links_with_details nu lezen',
  coalesce((
    select string_agg(distinct coalesce(g.rolname,'PUBLIC'), ', ')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(
        coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
      left join pg_roles g on g.oid = a.grantee
     where n.nspname = 'public' and c.relname = 'referral_links_with_details'
       and a.privilege_type = 'SELECT'
       and coalesce(g.rolname,'PUBLIC') in ('anon','authenticated','PUBLIC')
  ), 'niemand buiten service_role')
union all
-- Wat hierna nog open is. Een `for all`-policy die alleen naar de
-- EIGENAAR van de rij kijkt laat een medewerker-admin nog steeds de
-- prijs en de status schrijven; daar hoort een kolomgrendel op.
select 6, 'policies die nog WIE testen en niet WAT (volgende plak)',
  coalesce((
    select string_agg(tablename || ' :: ' || policyname || ' [' || cmd || ']' ||
             case when cmd in ('ALL','INSERT','UPDATE')
                   and coalesce(with_check, '') !~* 'status'
                   and coalesce(with_check, '') !~* 'commission'
                  then '  <- status en commissie onbewaakt' else '' end,
             E'\n' order by tablename, policyname)
      from pg_policies
     where schemaname = 'public'
       and tablename in ('referral_links','referral_commissions','affiliates')
       and cmd in ('ALL','INSERT','UPDATE')
  ), 'geen')
union all
select 7, 'staat er al een kolomgrendel op een van de drie',
  coalesce((
    select string_agg(c.relname || ':' || t.tgname, E'\n' order by c.relname, t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
       and c.relname in ('referral_links','referral_commissions','affiliates')
  ), 'GEEN - alleen het grant beschermt de prijs')
order by nr;
