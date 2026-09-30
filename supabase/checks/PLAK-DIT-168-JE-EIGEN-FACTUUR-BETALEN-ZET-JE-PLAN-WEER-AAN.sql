-- ════════════════════════════════════════════════════════════════════
-- PLAK 168 — JE EIGEN FACTUUR BETALEN ZET JE PLAN WEER AAN
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "als plan is betaald waarom springt die niet op
-- active dan"
--
-- ── WAT ER GEBEURT ────────────────────────────────────────────────
--
-- Twee wachters werken elkaar tegen.
--
-- `_on_subscription_invoice_paid` vuurt zodra een abonnementsfactuur
-- op `paid` gaat en wil het abonnement terugzetten op `active`. Zijn
-- eigen code zegt dat alleen `cancelled` en `paused` blijven staan,
-- met er letterlijk bij: "inactive hoort hier niet bij".
--
-- `_money_columns_are_the_owners` bewaakt op `subscriptions` de
-- kolommen `amount`, `currency` en **`status`**, en laat maar twee
-- soorten bellers door:
--
--     auth.uid() is null      -> service-rol, cron, de incasso
--     de eigenaar             -> via _in_owner_set sinds plak 166
--
-- Een klant die zijn eigen factuur betaalt is geen van beide. Zijn
-- betaling zet de factuur op `paid`, de eerste trigger probeert het
-- abonnement bij te werken, de tweede weigert -- en die weigering
-- wordt opgevangen door
--
--     exception when others then
--       raise warning 'subscription advance failed for invoice %: %'
--
-- Een `warning` ziet niemand. De betaling slaagt, het abonnement
-- verandert niet, en geen enkel scherm zegt er iets over.
--
-- ── GEMETEN, VANDAAG, OP PRODUCTIE ────────────────────────────────
--
-- PSM0020 betaalde om 14:49 zijn factuur van EUR 75 uit zijn wallet.
--
--     factuur      bijgewerkt 30-09 14:49:04, status paid
--     abonnement   bijgewerkt 30-09 14:39:55, status inactive
--
-- De abonnementsrij is niet aangeraakt. Geen fout, geen terugdraaiing,
-- geen spoor.
--
-- ── WAAROM DIT ERGER IS DAN EEN INACTIEF TESTABONNEMENT ───────────
--
-- Hetzelfde overkomt een klant op `past_due`. Die loopt zijn
-- achterstand in met de knop "Pay now" -- en blijft `past_due`:
--
--   * de pil op zijn dashboard blijft "Past due" zeggen boven een
--     factuur die "Paid" zegt;
--   * de poort op /accounts blijft dicht ("Your plan has to be active
--     first") terwijl hij net betaald heeft;
--   * `next_payment_date` schuift niet op, dus de nachtelijke run kan
--     dezelfde periode opnieuw factureren.
--
-- En het is niet zichtbaar in een test, want de nachtelijke incasso
-- doet het WEL goed: daar is `auth.uid()` leeg en laat de wachter hem
-- door. Alleen de klantroute is stuk.
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
-- Een smal luikje, geen gat. `_on_subscription_invoice_paid` zet vlak
-- voor zijn update een transactie-lokale vlag, en
-- `_money_columns_are_the_owners` laat een wijziging door zolang die
-- vlag staat.
--
--   * `set_config(..., true)` is TRANSACTIE-lokaal: hij verdwijnt aan
--     het einde van de betaling, hoe die ook afloopt.
--   * De naam zit NIET in de `request.`-ruimte, en dat is met opzet:
--     PostgREST zet `request.headers`, `request.jwt.claims`,
--     `request.method` en `request.path` uit de HTTP-kant. Een naam
--     daarbuiten kan een klant niet meesturen.
--   * De vlag staat alleen aan binnen die ene trigger, om die ene
--     update, op die ene abonnementsrij.
--
-- Wat NIET verandert: een mens die met de hand `amount`, `currency`
-- of `status` wijzigt wordt nog steeds geweigerd tenzij hij eigenaar
-- is. Alleen de automatische bijwerking na een betaalde factuur komt
-- erlangs -- en die deed de cron al.
--
-- Twee `execute`, twee functies, allebei met een revoke. En de
-- `raise warning` wordt een auditregel, zodat een volgende keer niet
-- weer spoorloos is.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. de wachter kent het luikje ────────────────────────────────
do $blk1$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_money_columns_are_the_owners' limit 1;
  if v_oid is null then raise notice 'wachter bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%psm.invoice_paid%' then
    raise notice '_money_columns_are_the_owners kent het luikje al'; return;
  end if;

  -- Vlak na de service-rol-uitzondering, zodat de volgorde leesbaar
  -- blijft: eerst "geen mens", dan "de betaling zelf", dan "de eigenaar".
  v_new := regexp_replace(
    v_def,
    '(if[[:space:]]+v_uid[[:space:]]+is[[:space:]]+null[[:space:]]+then[[:space:]]+return[[:space:]]+new;[[:space:]]+end[[:space:]]+if;)',
    '\1' || chr(10) || chr(10) ||
    '  -- Plak 168: de bijwerking die hoort bij een BETAALDE factuur.' || chr(10) ||
    '  -- _on_subscription_invoice_paid zet deze vlag vlak voor zijn' || chr(10) ||
    '  -- eigen update en hij is transactie-lokaal. Zonder dit weigerde' || chr(10) ||
    '  -- deze wachter de heractivering van een klant die zijn eigen' || chr(10) ||
    '  -- factuur betaalde, en die weigering werd opgeslikt tot een' || chr(10) ||
    '  -- warning die niemand ziet.' || chr(10) ||
    '  if coalesce(current_setting(''psm.invoice_paid'', true), '''') = ''1'' then' || chr(10) ||
    '    return new;' || chr(10) ||
    '  end if;',
    '');
  if v_new = v_def then
    raise exception '_money_columns_are_the_owners: patroon matchte niet -- NIET gewijzigd';
  end if;
  execute v_new;
end
$blk1$;
revoke all on function public._money_columns_are_the_owners() from public, anon;
grant execute on function public._money_columns_are_the_owners() to service_role;

-- ── 2. de trigger zet de vlag, en meldt het als het misgaat ──────
do $blk2$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid' limit 1;
  if v_oid is null then raise notice 'trigger bestaat niet'; return; end if;
  v_def := pg_get_functiondef(v_oid);
  if v_def ilike '%psm.invoice_paid%' then
    raise notice '_on_subscription_invoice_paid zet de vlag al'; return;
  end if;

  v_new := regexp_replace(
    v_def,
    '(and[[:space:]]+new\.subscription_id[[:space:]]+is[[:space:]]+not[[:space:]]+null[[:space:]]+then[[:space:]]+begin)',
    '\1' || chr(10) ||
    '      -- Plak 168. Transactie-lokaal, dus weg zodra deze betaling' || chr(10) ||
    '      -- klaar is. De wachter op de geldkolommen laat hierdoor' || chr(10) ||
    '      -- deze ene bijwerking door; alles wat een mens met de hand' || chr(10) ||
    '      -- wijzigt blijft geweigerd.' || chr(10) ||
    '      perform set_config(''psm.invoice_paid'', ''1'', true);',
    '');
  if v_new = v_def then
    raise exception '_on_subscription_invoice_paid: patroon 1 matchte niet -- NIET gewijzigd';
  end if;

  -- En de stille warning wordt een auditregel. Een bijwerking die niet
  -- lukt hoort ergens te staan waar iemand hem terugvindt.
  v_new := regexp_replace(
    v_new,
    'exception[[:space:]]+when[[:space:]]+others[[:space:]]+then[[:space:]]+raise[[:space:]]+warning',
    'exception when others then' || chr(10) ||
    '        begin' || chr(10) ||
    '          insert into public.audit_events' || chr(10) ||
    '            (actor_user_id, tenant_id, table_name, action, row_id, after_data)' || chr(10) ||
    '          values (auth.uid(), new.tenant_id, ''subscriptions'', ''ADVANCE_FAILED'',' || chr(10) ||
    '                  new.subscription_id::text,' || chr(10) ||
    '                  jsonb_build_object(''invoice_id'', new.id, ''error'', sqlerrm));' || chr(10) ||
    '        exception when others then null; end;' || chr(10) ||
    '        raise warning',
    '');
  execute v_new;
end
$blk2$;
revoke all on function public._on_subscription_invoice_paid() from public, anon;
grant execute on function public._on_subscription_invoice_paid() to service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Allebei hoort 1. `psm0020_nu` hoort nog `inactive` te zijn -- deze
-- plak repareert de weg, niet het verleden. Dat abonnement gaat met de
-- hand aan op /subscriptions.
select
  'plak 168 geplaatst'                                             as wat,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='_money_columns_are_the_owners'
      and pg_get_functiondef(p.oid) ilike '%psm.invoice_paid%')    as wachter_kent_luikje,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='_on_subscription_invoice_paid'
      and pg_get_functiondef(p.oid) ilike '%psm.invoice_paid%')    as trigger_zet_vlag,
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='_on_subscription_invoice_paid'
      and pg_get_functiondef(p.oid) ilike '%ADVANCE_FAILED%')      as mislukking_wordt_gelogd,
  (select s.status from public.subscriptions s
     join public.advertisers a on a.id = s.advertiser_id
    where a.tenant_client_code = 'PSM0020')                        as psm0020_nu;
