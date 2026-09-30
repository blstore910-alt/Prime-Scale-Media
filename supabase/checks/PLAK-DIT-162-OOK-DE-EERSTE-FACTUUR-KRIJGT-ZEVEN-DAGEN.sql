-- ════════════════════════════════════════════════════════════════════
-- PLAK 162 — OOK DE EERSTE FACTUUR KRIJGT ZEVEN DAGEN
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "7 dagen prima, ook voor eerste."
--
-- ── WAAR DIT VANDAAN KOMT ─────────────────────────────────────────
--
-- Gevonden tijdens test 3, op het eerste scherm van een verse klant.
-- PSM0018 meldde zich aan op 30-09 om 07:41 en zijn factuur van
-- EUR 200 verviel op 03-10 -- drie dagen.
--
-- Dat was geen bug: de trigger
-- `_invoice_first_subscription_due_date` geeft de ALLEREERSTE
-- abonnementsfactuur van een adverteerder met zoveel woorden drie
-- dagen, en elke volgende zeven.
--
-- Maar die drie dagen passen niet op de weg die een klant moet gaan
-- om te betalen:
--
--   1. bedrijfsgegevens invullen -- tot dan is opwaarderen
--      geblokkeerd, dat staat letterlijk op zijn dashboard
--      ("Add your company details first");
--   2. een bankoverboeking -- een tot twee werkdagen;
--   3. een admin die hem met de hand verifieert.
--
-- Dat haalt niemand in drie dagen. En sinds plak 160 valt zo iemand
-- niet meer stil uit de boeken maar blijft hij in `past_due` staan en
-- wordt hij aangemaand -- dus een klant die niets fout deed kreeg op
-- dag drie een bericht dat hij achterliep. Plak 160 heeft dat niet
-- veroorzaakt; hij heeft het zichtbaar gemaakt.
--
-- ── WAT DIT DOET ──────────────────────────────────────────────────
--
-- De uitzondering voor de eerste factuur gaat eruit. Wat overblijft
-- is de regel die er al stond: is er geen vervaldatum meegegeven, dan
-- zeven dagen -- hetzelfde als wat de incassoroute zelf kiest.
--
-- Eén `execute` op één functie, en hij weigert als het patroon niet
-- matcht in plaats van te gokken. `pg_get_functiondef` geeft op deze
-- database CRLF terug, dus het patroon matcht op `[[:space:]]`.
--
-- ── EN DE FACTUREN DIE ER AL ZIJN ─────────────────────────────────
--
-- Elke openstaande abonnementsfactuur die nog geen zeven dagen oud is
-- en een kortere termijn heeft gekregen, krijgt die zeven dagen
-- alsnog. Dat raakt vandaag PSM0018 (factuur 142). Een factuur die al
-- betaald of vervallen is blijft zoals hij is -- een vervaldatum met
-- terugwerkende kracht verschuiven zou de geschiedenis herschrijven.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = '_invoice_first_subscription_due_date'
   limit 1;

  if v_oid is null then
    raise notice 'De trigger bestaat niet op deze database. Niets gedaan.';
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('interval ''3 days''' in v_def) = 0 then
    raise notice 'De uitzondering van drie dagen staat er niet (meer).';
    return;
  end if;

  -- Het hele blok eruit: de hele `if not exists (...) then ... end if;`
  -- die de eerste factuur apart behandelde.
  v_new := regexp_replace(
    v_def,
    'if[[:space:]]+not[[:space:]]+exists[[:space:]]*\([[:space:]]*select[[:space:]]+1[[:space:]]+from[[:space:]]+public\.invoices[[:space:]]+i.*?interval[[:space:]]*''3 days'';[[:space:]]*end[[:space:]]+if;',
    '-- Plak 162: de uitzondering van drie dagen voor de eerste'
    || chr(10) ||
    '  -- factuur is eruit. Zeven dagen voor iedereen, want de weg om'
    || chr(10) ||
    '  -- te betalen (bedrijf invullen, overboeken, laten verifieren)'
    || chr(10) ||
    '  -- past niet in drie.',
    'gs');

  if v_new = v_def then
    raise exception
      'Het patroon matchte niet -- de trigger is NIET gewijzigd. Niets geraden.';
  end if;

  execute v_new;
end
$blk0$;

-- ── DE FACTUREN DIE ER AL STAAN ───────────────────────────────────
-- Alleen openstaande, alleen die nog niet vervallen zijn, en alleen
-- waar de termijn korter was dan zeven dagen.
update public.invoices i
   set due_date = i.created_at + interval '7 days'
 where i.type = 'subscription'
   and i.status = 'unpaid'
   and i.due_date is not null
   and i.due_date > now()
   and i.due_date < i.created_at + interval '7 days';

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `nog_drie_dagen` hoort 0 te zijn en `te_korte_termijn` ook.
select
  'plak 162 geplaatst'                                          as wat,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = '_invoice_first_subscription_due_date'
      and pg_get_functiondef(p.oid) like '%interval ''3 days''%')
                                                                as nog_drie_dagen,
  (select count(*)::text from public.invoices
    where type = 'subscription' and status = 'unpaid'
      and due_date is not null and due_date > now()
      and due_date < created_at + interval '7 days')            as te_korte_termijn,
  (select coalesce(to_char(due_date, 'DD-MM HH24:MI'), '-')
     from public.invoices i
     join public.advertisers a on a.id = i.advertiser_id
    where a.tenant_client_code = 'PSM0018' and i.type = 'subscription'
    order by i.created_at desc limit 1)                         as psm0018_vervalt_nu;
