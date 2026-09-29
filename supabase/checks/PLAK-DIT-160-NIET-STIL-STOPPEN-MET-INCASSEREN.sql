-- ════════════════════════════════════════════════════════════════════
-- PLAK 160 — EEN KLANT DIE NIET BETAALT VERDWIJNT NIET STIL
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 29-09, op de vraag wat er moet gebeuren met iemand die
-- na zeven dagen niet betaald heeft: **"op tijd betaald, of opzeggen."**
--
-- Dus niet: stil uit de boeken vallen. Doorgaan met aanmanen tot hij
-- betaalt of tot JIJ hem opzegt.
--
-- ── DE FOUT IS ÉÉN WOORD, EN DE CODE ZEGT HET ZELF ────────────────
--
-- In `subscription_billing_run`, bij een mislukte incasso:
--
--   regel 157   update public.subscriptions set status = 'inactive'
--   regel 160   if v_was_status <> 'past_due' then
--   regel 161     v_pastdue := v_pastdue + 1;
--   regel 166     ... 'subscription_past_due' ...
--
-- De teller heet `v_pastdue`, de melding heet `subscription_past_due`,
-- en het rapport onderaan telt hem als `past_due`. Alles in dat blok
-- bedoelt PAST DUE. Alleen de regel die de database raakt schrijft
-- `inactive`.
--
-- ── WAT DAT ÉÉN WOORD KOST ────────────────────────────────────────
--
-- De aanmaanlus zelf slaat `inactive` over (regel 139: `and s.status
-- not in ('cancelled','inactive','paused')`). En de facturatielus
-- pakt alleen `active` en `past_due`. Een abonnement op `inactive`
-- zit dus in GEEN van beide: het wordt nooit meer gefactureerd en
-- nooit meer aangemaand.
--
-- De aanmaanketen loopt met andere woorden dood in precies de status
-- die hij zelf aanmaakt.
--
-- Gemeten op 29-09: vannacht om 03:00 zijn **PSM0006, PSM0012 en
-- PSM0013** zo omgezet, elk met een openstaande factuur van EUR 200.
-- **EUR 600 waar niemand meer achteraan gaat**, en de klant kreeg een
-- melding die zei dat hij achterliep terwijl het systeem hem al had
-- laten gaan.
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
-- 1. `'inactive'` wordt `'past_due'` in die ene regel. Eén `execute`,
--    op één functie -- de huisregel na plak 124.
-- 2. `paused` komt erbij in de uitzondering. Een gepauzeerd abonnement
--    hoort niet door een mislukte incasso op past_due te springen; dat
--    was al zo bedoeld (de leeslus sluit `paused` uit) maar deze
--    schrijf keek er niet naar.
-- 3. De drie die er al ingelopen zijn gaan terug naar `past_due`.
--    ALLEEN die met een openstaande abonnementsfactuur -- een
--    `inactive` zonder schuld is met de hand uitgezet en daar blijf ik
--    vanaf.
--
-- ── WAT DIT BETEKENT, ZODAT JE HET WEET ───────────────────────────
--
-- Een klant die blijft weigeren houdt nu ELKE MAAND een nieuwe
-- factuur erbij, want de facturatielus pakt `past_due` ook. Dat is
-- wat "tot hij betaalt of jij hem opzegt" economisch betekent: het
-- abonnement loopt door, dus de maandprijs loopt door.
--
-- Wil je dat niet -- wel blijven aanmanen, geen nieuwe maanden
-- erbij -- dan is dat één andere regel (`in ('active')` op regel 28
-- van dezelfde functie) en zeg je het, dan lever ik hem. Ik doe het
-- nu NIET op eigen houtje, want dat is een prijsbeslissing.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. DE ENE REGEL ───────────────────────────────────────────────
-- `pg_get_functiondef` geeft op deze database CRLF terug, dus het
-- patroon matcht op [[:space:]] en niet op een spatie. En de functie
-- wordt bij OID gezocht, niet via een signatuur met parameternamen.
do $blk0$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
   limit 1;
  if v_oid is null then
    raise exception 'subscription_billing_run bestaat niet op deze database';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('set status = ''inactive''' in v_def) = 0 then
    raise notice 'De regel staat er niet (meer). Niets gedaan.';
    return;
  end if;

  v_new := regexp_replace(
    v_def,
    'update[[:space:]]+public\.subscriptions[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''inactive'',[[:space:]]*updated_at[[:space:]]*=[[:space:]]*now\(\)[[:space:]]*where[[:space:]]+id[[:space:]]*=[[:space:]]*inv\.subscription_id[[:space:]]+and[[:space:]]+status[[:space:]]*<>[[:space:]]*''cancelled'';',
    'update public.subscriptions set status = ''past_due'', updated_at = now()'
    || chr(10) ||
    '         where id = inv.subscription_id and status not in (''cancelled'', ''paused'');',
    'g');

  if v_new = v_def then
    raise exception 'Het patroon matchte niet -- de functie is NIET gewijzigd. Niets geraden.';
  end if;

  execute v_new;
end
$blk0$;

-- ── 2. DE DRIE DIE ER AL IN GELOPEN ZIJN ──────────────────────────
-- Alleen een `inactive` MET een openstaande abonnementsfactuur. Een
-- inactive zonder schuld is met de hand uitgezet en blijft zoals hij is.
update public.subscriptions s
   set status = 'past_due',
       updated_at = now()
 where s.status = 'inactive'
   and exists (
     select 1 from public.invoices i
      where i.subscription_id = s.id
        and i.status = 'unpaid'
        and i.type = 'subscription'
   );

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `schrijft_nog_inactive` hoort 0 te zijn en `schrijft_past_due` 1.
-- `doodlopend` hoort 0 te zijn: geen enkel abonnement met een
-- openstaande factuur mag nog op inactive staan.
select
  'plak 160 geplaatst'                                          as wat,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'subscription_billing_run'
      and pg_get_functiondef(p.oid) like '%set status = ''inactive''%')
                                                                as schrijft_nog_inactive,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'subscription_billing_run'
      and pg_get_functiondef(p.oid) like '%set status = ''past_due''%')
                                                                as schrijft_past_due,
  (select count(*)::text from public.subscriptions s
    where s.status = 'inactive'
      and exists (select 1 from public.invoices i
                   where i.subscription_id = s.id and i.status = 'unpaid'
                     and i.type = 'subscription'))              as doodlopend,
  (select count(*)::text from public.subscriptions
    where status = 'past_due')                                  as nu_past_due,
  (select coalesce(sum(i.total),0)::text from public.invoices i
     join public.subscriptions s on s.id = i.subscription_id
    where i.status = 'unpaid' and s.status = 'past_due')        as wordt_weer_aangemaand;
