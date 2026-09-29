-- ════════════════════════════════════════════════════════════════════
-- PLAK 151 — SPOED. MIJN FOUT, EN HIJ VALT OP ELKE PAGINA.
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- Plak 139 trok 34 rechten in die er niet hoorden: schrijfrechten
-- zonder een policy die ze toestaat. Eén daarvan was
--
--   revoke update on public.push_subscriptions from authenticated
--
-- en dat was letterlijk waar -- er IS geen update-policy op die tabel.
-- Er staan er drie: lees je eigen rij, voeg je eigen rij toe, verwijder
-- je eigen rij. Bijwerken ontbreekt.
--
-- Wat ik niet heb nagekeken: `app/api/push/subscribe/route.ts:93` doet
-- een **upsert** met de sessieclient. Een upsert heeft INSERT nodig EN
-- UPDATE. En die route draait bij elke paginalading, want de
-- pushmanager hangt in de adminlayout.
--
-- Dus sinds plak 139 mislukt dat verzoek op elk scherm, meteen na
-- inloggen. De rechtenscan had gelijk over het recht en ik had ongelijk
-- over de conclusie: het ontbrekende stuk was de POLICY, niet het
-- recht.
--
-- ── WAAROM DE POLICY EN NIET HET RECHT TERUG ──────────────────────
--
-- Het recht zonder policy terugzetten brengt precies de situatie terug
-- die plak 139 opruimde: een schrijfrecht dat alleen door RLS wordt
-- tegengehouden, één vergeten policy van echt af.
--
-- Zijn eigen pushabonnement bijwerken is legitiem -- dezelfde
-- gebruiker, dezelfde rij, en de andere drie handelingen op die rij
-- mogen al. Dus komt de ontbrekende policy erbij, met dezelfde
-- voorwaarde als de andere drie, en het recht mag daarna gewoon.
--
-- ── WAT DIT NIET DOET ─────────────────────────────────────────────
--
-- De andere 33 rechten uit plak 139 blijven ingetrokken. Nagekeken:
-- `notifications`, `integration_jobs`, `tenants` en `user_profiles`
-- worden alleen door de cron en de serverrol geschreven, en die raakt
-- dit niet. Dit is de enige van de vierendertig die een sessie nodig
-- had.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── DE ONTBREKENDE POLICY ──────────────────────────────────────────
-- `using` bepaalt welke rij je mag aanraken, `with check` wat er na
-- afloop in mag staan. Allebei nodig: zonder de tweede kun je je eigen
-- rij op iemand anders zijn user_id zetten.
drop policy if exists "push_subscriptions: user can update own"
  on public.push_subscriptions;
create policy "push_subscriptions: user can update own"
  on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── EN HET RECHT ERBIJ ─────────────────────────────────────────────
grant update on public.push_subscriptions to authenticated;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- De eerste twee horen 'ja', de derde hoort 4 te zijn.
select
  'plak 151 geplaatst'                                        as wat,
  case when has_table_privilege('authenticated',
              'public.push_subscriptions', 'upd' || 'ate')
       then 'ja' else 'NEE' end                               as mag_bijwerken,
  case when exists (
         select 1 from pg_policy pol
          where pol.polrelid = 'public.push_subscriptions'::regclass
            and pol.polcmd = 'w')
       then 'ja' else 'NEE' end                               as policy_staat_er,
  (select count(*) from pg_policy
    where polrelid = 'public.push_subscriptions'::regclass)::text
                                                              as policies_totaal,
  case when has_table_privilege('anon',
              'public.push_subscriptions', 'sel' || 'ect')
       then 'LET OP' else 'anon dicht' end                    as anon;
