-- ════════════════════════════════════════════════════════════════════
-- PLAK 171 — DE WHATSAPP-GROEP VAN EEN KLANT
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "zet hier bij iedereen 'message on whatsapp in
-- your PSMxxx group' en haal deze button naar mij weg. Zoveel buttons
-- naar mij privé weghalen, anders krijg ik straks 100 berichten per
-- dag."
--
-- ── WAT ER AL GEBEURD IS ──────────────────────────────────────────
--
-- De acht knoppen zijn eruit en staan live. Ze wezen allemaal naar
-- +31 6 15300300 -- zijn eigen telefoon:
--
--   de hulpkaart van de adverteerder        twee plan-links
--   de melding bij een lopende terugboeking de affiliate-aanvraag (2x)
--   de uitbetaalkaart                       de hulpkaart van de affiliate
--   de valutamelding bij ad-account vullen
--
-- Er staat nu een ZIN op die plekken: "Message us in your PSM0020
-- group on WhatsApp". Geen knop, want een WhatsApp-groep opent alleen
-- met een uitnodigingslink en die kende de app niet.
--
-- ── WAT DEZE PLAK TOEVOEGT ────────────────────────────────────────
--
-- Die link. Eén kolom op `advertisers`, zodat de zin weer een knop kan
-- worden zodra hij per klant is ingevuld. Tot die tijd blijft de zin
-- staan -- de code kijkt of de kolom er is en gedraagt zich zonder
-- hem precies zoals nu.
--
-- ── DRIE DINGEN DIE HIER MET OPZET IN ZITTEN ──────────────────────
--
-- 1. EEN CHECK OP DE VORM. Een uitnodigingslink is altijd
--    https://chat.whatsapp.com/<code>. Zonder die toets belandt er
--    vroeg of laat een groepsNAAM in het veld, en dan krijgt een klant
--    een kapotte link op zijn dashboard te zien. Leeg mag, onzin niet.
--
-- 2. DE KLANT MAG HEM LEZEN, NIEMAND MAG HEM SCHRIJVEN. `advertisers`
--    staat al op RLS en `authenticated` heeft er geen update-recht;
--    deze kolom erft dat. Het invullen gaat dus via de beheerkant,
--    net als elk ander veld op die tabel.
--
-- 3. GEEN REVOKE-BLOK. De huisregel over revokes gaat over een NIEUWE
--    tabel of functie; dit is een kolom op een tabel die er al staat en
--    zijn rechten al heeft. De controle onderaan laat zien dat `anon`
--    er nog steeds niet bij kan, zodat dat geen aanname blijft.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. de kolom ──────────────────────────────────────────────────
do $blk1$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'advertisers'
       and column_name = 'whatsapp_group_url'
  ) then
    raise notice 'whatsapp_group_url bestaat al';
  else
    alter table public.advertisers add column whatsapp_group_url text;
  end if;
end
$blk1$;

-- ── 2. de vorm ───────────────────────────────────────────────────
-- Leeg mag. Een waarde moet een echte uitnodigingslink zijn.
do $blk2$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'advertisers_whatsapp_group_url_check'
  ) then
    raise notice 'de vormtoets staat er al';
  else
    alter table public.advertisers
      add constraint advertisers_whatsapp_group_url_check
      check (
        whatsapp_group_url is null
        or whatsapp_group_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$'
      );
  end if;
end
$blk2$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `kolom` en `vormtoets` horen allebei 1 te zijn, `anon_mag_lezen`
-- hoort 'nee'. `ingevuld` is 0 -- deze plak maakt de PLEK, niet de
-- inhoud. De links zelf zet je per klant in de beheerkant zodra die
-- knop er is.
select
  'plak 171 geplaatst'                                             as wat,
  (select count(*)::text from information_schema.columns
    where table_schema='public' and table_name='advertisers'
      and column_name='whatsapp_group_url')                        as kolom,
  (select count(*)::text from pg_constraint
    where conname='advertisers_whatsapp_group_url_check')          as vormtoets,
  (select case when has_column_privilege('anon','public.advertisers',
                                         'whatsapp_group_url','select')
               then 'JA -- FOUT' else 'nee' end)                   as anon_mag_lezen,
  (select count(*)::text from public.advertisers
    where coalesce(whatsapp_group_url,'') <> '')                   as ingevuld;
