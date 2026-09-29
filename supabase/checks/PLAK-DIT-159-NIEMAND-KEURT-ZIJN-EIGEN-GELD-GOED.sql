-- ════════════════════════════════════════════════════════════════════
-- PLAK 159 — NIEMAND KEURT ZIJN EIGEN GELD GOED
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar koos op 28-09 keuze B: twee paar ogen in plaats van
-- eigenaar-alleen. "Wie een opname invoert kan hem niet zelf
-- goedkeuren, want anders leegt een medewerker een ad-account met twee
-- klikken en raakt de affiliate zijn commissie kwijt zonder dat iemand
-- anders ernaar heeft gekeken."
--
-- Die regel staat in `ad_account_withdrawal_approve` en werkt.
--
-- ── EN OP ÉÉN VAN DE EENENTWINTIG ─────────────────────────────────
--
-- Gemeten vandaag: eenentwintig functies in `public` nemen een
-- geldbesluit (approve / verify / decide / settle / pay). Precies één
-- toetst of je je eigen aanvraag goedkeurt. De andere twintig niet.
--
-- Zes tabellen hebben de twee kolommen die ervoor nodig zijn -- wie
-- het invoerde en wie het goedkeurde -- en op vier ervan staat de deur
-- dus gewoon open. De gevaarlijkste is `wallet_adjustments`: dat is
-- een rechtstreekse bijschrijving op een wallet. Een medewerker kan
-- daar geld bijschrijven en zijn eigen bijschrijving goedkeuren.
--
-- ── EN HET IS GEEN THEORIE ────────────────────────────────────────
--
-- Vandaag op de echte database:
--
--   wallet_adjustments   2 van de 2 aangevraagd en goedgekeurd door
--                        dezelfde persoon
--   wallet_refunds       2 van de 2 idem
--   wallet_topups        0 van de 16  (de normale weg raakt dit niet)
--   wallet_precharges    0
--   fee_change_requests  0
--
-- Die vier zijn van de doorloop van de eigenaar zelf, dus geen fraude.
-- Ze bewijzen alleen dat er niets in de weg staat.
--
-- ── WAAROM EEN TRIGGER EN GEEN TEKSTCHIRURGIE ─────────────────────
--
-- De voor de hand liggende weg is vijf functielichamen herschrijven.
-- Dat is precies wat plak 124 deed en waarmee de Join-knop twintig
-- minuten stuk stond op productie. Eén trigger-functie, vijf triggers,
-- nul `execute`, niets aan een levende definitie geraakt.
--
-- Bijkomend voordeel: een trigger bewaakt ook de rechtstreekse UPDATE,
-- niet alleen de RPC. Een tweede deur die niemand vergeet.
--
-- ── DE EIGENAAR IS UITGEZONDERD, EN DAAROM ────────────────────────
--
-- Dezelfde redenering als bij read-only: iemand moet kunnen handelen,
-- en de laatste persoon buitensluiten is niet vanaf een scherm te
-- repareren. Het gat dat dit dicht is de MEDEWERKER die zichzelf
-- bijschrijft; een eigenaar die zijn eigen correctie goedkeurt doet
-- iets aan zijn eigen bedrijf.
--
-- Wil je het strenger -- ook de eigenaar twee paar ogen -- dan haal je
-- de regel met `_in_owner_set` eruit. Dat is jouw beslissing, niet de
-- mijne, en daarom staat hij apart en met commentaar.
--
-- In de SQL-editor is `auth.uid()` leeg, dus een met de hand geplakte
-- reparatie wordt hier niet door tegengehouden. Dat is bewust en gelijk
-- aan de bestaande controle op opnames.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── DE ENE TRIGGERFUNCTIE ─────────────────────────────────────────
--
-- TG_ARGV[0] = kolom met wie het invoerde
-- TG_ARGV[1] = kolom met wie het goedkeurde
-- TG_ARGV[2] = de status die "goedgekeurd" betekent
--
-- Hij kijkt naar de OVERGANG, niet naar de stand: een rij die al
-- goedgekeurd was en om een andere reden wordt bijgewerkt gaat vrijuit.
-- Anders zou elke latere aanraking van een oude rij afketsen.
create or replace function public._no_self_approval()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk0$
declare
  v_req    uuid;
  v_app    uuid;
  v_now    text;
  v_was    text;
  v_target text := lower(coalesce(TG_ARGV[2], ''));
begin
  v_now := lower(coalesce(to_jsonb(new) ->> 'status', ''));
  if v_now <> v_target then
    return new;
  end if;

  -- Alleen de OVERGANG naar goedgekeurd is een besluit.
  if TG_OP = 'UPDATE' then
    v_was := lower(coalesce(to_jsonb(old) ->> 'status', ''));
    if v_was = v_target then
      return new;
    end if;
  end if;

  v_app := nullif(to_jsonb(new) ->> TG_ARGV[1], '')::uuid;
  v_req := nullif(to_jsonb(new) ->> TG_ARGV[0], '')::uuid;

  -- Niet te bepalen wie wie is: laat door. Weigeren op onbekende
  -- gegevens zet de hele wachtrij stil, en dat is de duurdere fout.
  if v_app is null or v_req is null or v_app <> v_req then
    return new;
  end if;

  -- DE EIGENAAR MAG HET WEL. Haal deze vier regels weg als je ook hem
  -- twee paar ogen wilt geven.
  if public._in_owner_set(
       nullif(to_jsonb(new) ->> 'tenant_id', '')::uuid, v_app) then
    return new;
  end if;

  raise exception
    'You entered this yourself, so somebody else has to approve it.'
    using errcode = '42501';
end
$blk0$;

revoke all on function public._no_self_approval() from public, anon;
grant execute on function public._no_self_approval() to authenticated, service_role;

-- ── DE VIJF TRIGGERS ──────────────────────────────────────────────
do $blk1$
declare
  r record;
begin
  for r in
    select * from (values
      -- tabel,                 invoerder,      goedkeurder,   status
      ('wallet_adjustments',   'requested_by', 'reviewed_by', 'approved'),
      ('wallet_refunds',       'requested_by', 'reviewed_by', 'approved'),
      ('wallet_topups',        'created_by',   'approved_by', 'approved'),
      ('wallet_precharges',    'created_by',   'settled_by',  'settled'),
      ('fee_change_requests',  'requested_by', 'reviewed_by', 'approved')
    ) as t(tabel, invoerder, keurder, status)
  loop
    -- Alleen als de tabel en allebei de kolommen er echt zijn. Een
    -- trigger op een kolom die niet bestaat valt pas om als er iemand
    -- op de knop drukt, en dat is het slechtste moment.
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name=r.tabel
                  and column_name=r.invoerder)
       and exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=r.tabel
                      and column_name=r.keurder)
       and exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=r.tabel
                      and column_name='status')
    then
      execute format(
        'drop trigger if exists a9_no_self_approval on public.%I', r.tabel);
      execute format(
        'create trigger a9_no_self_approval
           before insert or update on public.%I
           for each row execute function public._no_self_approval(%L, %L, %L)',
        r.tabel, r.invoerder, r.keurder, r.status);
    end if;
  end loop;
end
$blk1$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `triggers` hoort 5 te zijn. `nog_open` telt de geldbesluiten die nog
-- steeds geen controle hebben -- die kunnen niet allemaal naar nul,
-- want niet elke tabel heeft twee kolommen om te vergelijken.
select
  'plak 159 geplaatst'                                          as wat,
  (select count(*)::text from pg_trigger
    where tgname = 'a9_no_self_approval' and not tgisinternal)  as triggers,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_no_self_approval') as functie,
  (select count(*)::text from public.wallet_adjustments
    where requested_by is not null and reviewed_by is not null
      and requested_by = reviewed_by)                           as oude_zelfgoedkeuring_aanpassingen,
  (select count(*)::text from public.wallet_refunds
    where requested_by is not null and reviewed_by is not null
      and requested_by = reviewed_by)                           as oude_zelfgoedkeuring_refunds,
  'eigenaar is uitgezonderd'                                    as let_op;
