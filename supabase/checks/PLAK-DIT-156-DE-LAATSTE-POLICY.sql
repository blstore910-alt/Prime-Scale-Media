-- ════════════════════════════════════════════════════════════════════
-- PLAK 156 — DE LAATSTE POLICY DIE MAAR ÉÉN EIGENAAR KENT
-- ════════════════════════════════════════════════════════════════════
--
-- Plak 155 verbreedde er twaalf van de veertien. Er bleef er één
-- staan, en dat was mijn eigen vervanging die te nauw keek:
--
--   tenants_owner_update    using (owner_id = auth.uid())
--                           with check (owner_id = auth.uid())
--
-- Die policy staat ÓP `tenants`, dus er is geen `t.`-alias, en plak
-- 155 zocht naar `t.owner_id`. Gemeten zojuist: hij is de enige die
-- nog over is.
--
-- Gevolg: `contact@primescalemedia.com` kan de tenantinstellingen
-- niet wijzigen. De naam van de organisatie, de slug, de initialen.
-- Alles wat op /settings/general staat.
--
-- ── WAT DIT DOET ──────────────────────────────────────────────────
--
-- Allebei de helften gaan naar `_in_owner_set(id, auth.uid())`.
--
-- `using` bepaalt WELKE rij je mag aanraken; `with check` wat er na
-- afloop in mag staan. Allebei nodig, en allebei op dezelfde
-- voorwaarde: anders kan een eigenaar wel beginnen aan een wijziging
-- en hem niet afmaken, of erger, hem wél afmaken op een rij die
-- daarna van iemand anders is.
--
-- `tenants_owner_insert` blijft zoals hij is. Daar is
-- `owner_id = auth.uid()` juist goed: je maakt een tenant aan die van
-- JOU is, en pas daarna kun je er iemand bij zetten.
--
-- ── WAT ER NIET MEEVERANDERT ──────────────────────────────────────
--
-- Wie `owner_id` mag wijzigen wordt hier niet aangeraakt: daar zit de
-- trigger `a3_guard_owner_stays_in` op, en die blijft het werk doen.
-- Deze plak zegt alleen wie de RIJ mag bijwerken, niet wat hij ermee
-- mag doen.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

drop policy if exists tenants_owner_update on public.tenants;
create policy tenants_owner_update on public.tenants
  for update to authenticated
  using (public._in_owner_set(id, auth.uid()))
  with check (public._in_owner_set(id, auth.uid()));

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `nog_oude_kolom` hoort 0 te zijn. De insert-policy telt niet mee:
-- daar is de oude vergelijking juist correct.
select
  'plak 156 geplaatst'                                        as wat,
  (select count(*) from pg_policy pol
     join pg_class c on c.oid = pol.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pol.polname <> 'tenants_owner_insert'
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
  (select count(*) from pg_trigger
    where tgrelid = 'public.tenants'::regclass
      and tgname = 'a3_guard_owner_stays_in')::text           as eigenaarstrigger_staat_er;
