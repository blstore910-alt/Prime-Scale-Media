-- ════════════════════════════════════════════════════════════════════
-- PLAK 170 — DRINGEND: EEN AD-ACCOUNT-TOPUP KAN NIET MEER GEVERIFIEERD
--            WORDEN
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden op 30-09 tijdens reis 4, door de knop in te drukken.
--
-- ── WAT ER STUK IS ────────────────────────────────────────────────
--
-- Plak 134 zette een wacht op `top_ups` omdat een medewerker-admin
-- rechtstreeks kon PATCHen en `top_up_admin_verify` kon overslaan --
-- geen verified_at, geen herberekende fee, geen leverancierspush,
-- terwijl de factuur- en meldingstriggers wel afgingen. Terecht.
--
-- Maar die wacht weigert de overgang ZONDER UITZONDERING:
--
--     if tg_op = 'UPDATE'
--        and coalesce(new.status,'') = 'completed'
--        and coalesce(old.status,'') is distinct from 'completed' then
--       raise exception 'Verify a top-up with the Verify button, ...'
--
-- En `top_up_admin_verify` doet zelf `SET status = 'completed'`. De
-- wacht houdt dus precies de route tegen die hij zou beschermen.
--
-- ── GEMETEN ───────────────────────────────────────────────────────
--
--   top_up_admin_verify zet completed          ja
--   de wacht staat op top_ups                  ja
--   trigger heeft GEEN when-clausule           BEFORE INSERT OR UPDATE
--   laatste geslaagde verificatie              28-09 14:49
--   ad-account-topups die nu vastzitten        1
--
-- Sinds 28 september is er geen enkele ad-account-topup meer
-- afgerond. Ik drukte vandaag op Verify met beide vinkjes aan en
-- kreeg die melding.
--
-- ── WAAROM DIT GELD RAAKT ─────────────────────────────────────────
--
-- Het bedrag gaat van de wallet af op het moment dat de KLANT de
-- financiering indient, niet bij de verificatie. Vandaag:
--
--     PSM0020 wallet   EUR 250,00 -> EUR 150,00
--     top-up #12       EUR 100 binnen, fee 4,00, netto 96,00
--     status           pending, en niet af te ronden
--
-- Het geld is dus van de klant af, en niemand kan vastleggen dat het
-- op het ad-account staat. Het staat er ook niet: de verificatie is
-- juist de stap waarop de admin het bij de leverancier neerzet.
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
-- Hetzelfde smalle luikje als plak 168, dat al draait en werkt.
-- `top_up_admin_verify` zet vlak voor zijn eigen update een
-- transactie-lokale vlag, en de wacht laat de overgang door zolang
-- die vlag staat.
--
--   * `set_config(..., true)` is TRANSACTIE-lokaal en verdwijnt zodra
--     de verificatie klaar is, hoe die ook afloopt.
--   * De naam zit NIET in de `request.`-ruimte: PostgREST zet alleen
--     `request.headers`, `request.jwt.claims`, `request.method` en
--     `request.path` vanuit de HTTP-kant. Een klant kan `psm.` niet
--     meesturen.
--   * Alles waar plak 134 voor gemaakt is blijft staan: een
--     medewerker-admin die met de hand PATCHt heeft die vlag niet en
--     wordt nog steeds geweigerd.
--
-- Twee `execute`, twee functies, allebei met hun revoke.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. de RPC zet de vlag, vlak na BEGIN ─────────────────────────
do $blk1$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'top_up_admin_verify' limit 1;
  if v_oid is null then raise notice 'top_up_admin_verify bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%psm.topup_verify%' then
    raise notice 'top_up_admin_verify zet de vlag al'; return;
  end if;

  -- Vlak na de openende BEGIN van het functielichaam. Die staat op
  -- een eigen regel in hoofdletters; de declare-sectie zit erboven.
  v_new := regexp_replace(
    v_def,
    '(AS[[:space:]]*\$function\$.*?[[:space:]]BEGIN[[:space:]])',
    '\1' || chr(10) ||
    '  -- Plak 170. Transactie-lokaal. De wacht uit plak 134 weigert' || chr(10) ||
    '  -- elke overgang naar completed; deze vlag zegt "dit IS de' || chr(10) ||
    '  -- Verify-knop". Een handmatige PATCH heeft hem niet.' || chr(10) ||
    '  perform set_config(''psm.topup_verify'', ''1'', true);' || chr(10),
    'ns');
  if v_new = v_def then
    raise exception 'top_up_admin_verify: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk1$;
revoke all on function public.top_up_admin_verify(uuid, numeric) from public, anon;
grant execute on function public.top_up_admin_verify(uuid, numeric) to authenticated, service_role;

-- ── 2. de wacht kent het luikje ──────────────────────────────────
do $blk2$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_top_ups_session_write' limit 1;
  if v_oid is null then raise notice 'de wacht bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%psm.topup_verify%' then
    raise notice '_guard_top_ups_session_write kent het luikje al'; return;
  end if;

  v_new := regexp_replace(
    v_def,
    '(if[[:space:]]+tg_op[[:space:]]*=[[:space:]]*''UPDATE''[[:space:]]+and[[:space:]]+coalesce\(new\.status,[[:space:]]*''''\)[[:space:]]*=[[:space:]]*''completed'')',
    'if coalesce(current_setting(''psm.topup_verify'', true), '''') <> ''1''' || chr(10) ||
    '     and tg_op = ''UPDATE''' || chr(10) ||
    '     and coalesce(new.status, '''') = ''completed''',
    'g');
  if v_new = v_def then
    raise exception '_guard_top_ups_session_write: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk2$;
revoke all on function public._guard_top_ups_session_write() from public, anon;
grant execute on function public._guard_top_ups_session_write() to service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Allebei hoort 1. `vastzittend` hoort daarna nog steeds 1 te zijn --
-- deze plak repareert de WEG, niet die ene rij. Druk daarna op Verify
-- bij PSM0020 / #12; dan hoort hij door te lopen.
select
  'plak 170 geplaatst'                                             as wat,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='top_up_admin_verify'
      and pg_get_functiondef(p.oid) ilike '%psm.topup_verify%')    as rpc_zet_vlag,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='_guard_top_ups_session_write'
      and pg_get_functiondef(p.oid) ilike '%psm.topup_verify%')    as wacht_kent_luikje,
  (select count(*)::text from public.top_ups where status = 'pending') as vastzittend,
  (select coalesce(to_char(max(updated_at),'DD-MM HH24:MI'),'-')
     from public.top_ups where status = 'completed')               as laatste_geslaagde;
