-- ════════════════════════════════════════════════════════════════════
-- PLAK 122 — vier dingen aan de uitbetaalkant
-- ════════════════════════════════════════════════════════════════════
--
-- Uit de vier veegjes op blok 9, 28-09. Alles gemeten op de LIVE
-- database voordat het is opgeschreven.
--
-- 1. DE OUDE RPC KENT DE ONDERGRENS NIET, EN IEDEREEN MAG HEM BELLEN
--
--    `affiliate_payout_request(text, jsonb)` leest `payout_min_override`
--    nergens en vergelijkt nergens met 200 -- in geen van zijn 126
--    regels. Zijn opvolger `affiliate_payout_request_multi` doet dat wel
--    en weigert eronder. En `authenticated` heeft EXECUTE op allebei.
--
--    Dus: een affiliate met EUR 12,00 openstaand roept de oude aan en
--    er staat een uitbetaling in de wachtrij, met al zijn commissies
--    gestempeld. De regel van de eigenaar ("ik wil pas payout vanaf 200
--    eu, tenzij vrijgegeven") geldt dan niet.
--
--    Er komt geen ondergrens IN de oude functie -- de app gebruikt hem
--    niet, alleen een terugval als `_multi` zou ontbreken, en die
--    terugval is zelf het gat. `authenticated` gaat eraf. Een weigering
--    is beter dan een uitbetaling zonder vloer.
--
-- 2. GOEDKEUREN VERGELIJKT BRUTO MET NETTO
--
--    In `affiliate_payout_decide` is `v_set` de som van de COMMISSIES
--    (bruto) en `v_ask` de som van `affiliate_payouts.amount` (netto =
--    bruto min clawback). Die twee kunnen alleen gelijk zijn als er
--    geen clawback is, dus de waarschuwingstak vuurt bij elke
--    uitbetaling met een clawback.
--
--    Gemeten: live uitbetaling #2 draagt in `reason` de zin "Let op:
--    gevraagd 15.96, werkelijk verrekend 20.00 (een commissie is na de
--    aanvraag...)" -- en er is niets veranderd na de aanvraag; die 4,04
--    IS de clawback. Die zin staat in een veld dat zowel de
--    geschiedenisregel van de affiliate als de wachtrij van de eigenaar
--    toont. Erger: een ECHTE afwijking blijft onzichtbaar zodra hij
--    toevallig gelijk is aan de clawback.
--
-- 3. DE RECALCULATE-KNOP KAN NIET WERKEN
--
--    `referral_commission_recalculate` is de enige van de dertien
--    affiliate-RPC's zonder EXECUTE voor `authenticated` (gemeten). De
--    eigenaar opent een commissie die on hold staat, vult de
--    leveranciersfee in, drukt Recalculate -- en krijgt "permission
--    denied", of erger: de action vertaalt PGRST202 naar "nog niet
--    aangezet in de database", dus hij gaat een migratie plakken die er
--    al is. Er is geen andere weg om een vastgelopen commissie los te
--    krijgen.
--
-- 4. DE TELLER `referral_links.earnings_*` IS PRECIES DUBBEL
--
--    Gemeten op alle vier de links:
--
--      a573fd96  opgeslagen 15,88  echt  5,92  (9,96 min 4,04 clawback)
--      9385a77b  opgeslagen 30,00  echt 15,00
--      8fd91a63  opgeslagen 75,00  echt 75,00
--      7c6ed477  leeg              echt  0,00
--
--    15,88 = 2 x 9,96 - 4,04 en 30,00 = 2 x 15,00: dubbel opgeteld en
--    daarna een keer teruggevorderd. Over de tenant: 120,88 opgeslagen
--    tegen 95,92 echt -- EUR 24,96 die nooit is verdiend.
--
--    Niets op een route leest hem vandaag (elk scherm telt de rijen),
--    dus dit is geen fout op een scherm maar wel verkeerde data, en de
--    eerste die hem gaat tonen toont het dubbele. Hij wordt hier
--    herberekend uit de rijen. De OORZAAK van het dubbel optellen zit
--    in de accrual-kant en is een aparte klus -- opgeschreven in
--    NEXT_SESSION_FIRST.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak122 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak122;

-- ── 1. de vloerloze RPC gaat op slot ────────────────────────────────
do $blk0$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_payout_request'
  loop
    execute 'revoke all on function public.affiliate_payout_request('
         || r.args || ') from public, anon, authenticated';
    execute 'grant execute on function public.affiliate_payout_request('
         || r.args || ') to service_role';
    v_n := v_n + 1;
  end loop;

  insert into _plak122 values (0, 'de vloerloze aanvraag-RPC',
    v_n || ' variant(en) ingetrokken van authenticated; alleen service_role mag hem nog');
exception when others then
  insert into _plak122 values (0, 'de vloerloze aanvraag-RPC',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. bruto tegen bruto ────────────────────────────────────────────
do $blk1$
declare
  v_oid  oid;
  v_def  text;
  v_pat  text;
  v_rep  text;
  v_args text;
begin
  select p.oid, pg_get_function_identity_arguments(p.oid)
    into v_oid, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_decide'
   limit 1;

  if v_oid is null then
    insert into _plak122 values (1, 'bruto tegen netto',
      'AFGEBROKEN: affiliate_payout_decide bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('min de clawback van deze groep' in v_def) > 0 then
    insert into _plak122 values (1, 'bruto tegen netto', 'stond er al -- niets gedaan');
    return;
  end if;

  v_pat := 'when[[:space:]]+round\(v_set,[[:space:]]*2\)[[:space:]]*<>[[:space:]]*round\(v_ask,[[:space:]]*2\)';

  if not (v_def ~ v_pat) then
    insert into _plak122 values (1, 'bruto tegen netto',
      'FOUT: de vergelijking is niet gevonden -- niets gewijzigd');
    return;
  end if;

  -- v_set is bruto, v_ask is netto. Haal de clawback van deze groep van
  -- het bruto af en dan vergelijken ze hetzelfde soort getal.
  v_rep :=
    'when round(v_set' || chr(10) ||
    '                   -- min de clawback van deze groep: v_set telt de' || chr(10) ||
    '                   -- COMMISSIES (bruto) en v_ask is wat er wordt' || chr(10) ||
    '                   -- uitbetaald (netto). Zonder dit vuurt de' || chr(10) ||
    '                   -- waarschuwing bij elke uitbetaling met een' || chr(10) ||
    '                   -- clawback, en verdwijnt een ECHTE afwijking' || chr(10) ||
    '                   -- zodra die toevallig even groot is.' || chr(10) ||
    '                   - coalesce((select sum(cb.amount)' || chr(10) ||
    '                                from public.referral_clawbacks cb' || chr(10) ||
    '                                join public.affiliate_payouts p2' || chr(10) ||
    '                                  on p2.id = cb.payout_id' || chr(10) ||
    '                               where coalesce(p2.group_id, p2.id) = v_group), 0)' || chr(10) ||
    '                 , 2) <> round(v_ask, 2)';

  execute regexp_replace(v_def, v_pat, v_rep);

  execute 'revoke all on function public.affiliate_payout_decide(' || v_args || ') from public, anon';
  execute 'grant execute on function public.affiliate_payout_decide(' || v_args || ') to authenticated, service_role';

  insert into _plak122 values (1, 'bruto tegen netto',
    'de waarschuwing vergelijkt nu bruto met bruto');
exception when others then
  insert into _plak122 values (1, 'bruto tegen netto',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. de Recalculate-knop mag bellen ───────────────────────────────
do $blk2$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'referral_commission_recalculate'
  loop
    execute 'revoke all on function public.referral_commission_recalculate('
         || r.args || ') from public, anon';
    execute 'grant execute on function public.referral_commission_recalculate('
         || r.args || ') to authenticated, service_role';
    v_n := v_n + 1;
  end loop;

  insert into _plak122 values (2, 'Recalculate',
    v_n || ' variant(en) nu uitvoerbaar door authenticated (de functie toetst zelf de eigenaar)');
exception when others then
  insert into _plak122 values (2, 'Recalculate',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. de teller opnieuw uit de rijen ───────────────────────────────
do $blk3$
declare
  v_voor text;
  v_na   text;
begin
  select coalesce(sum(coalesce(earnings_eur, 0)), 0)::text || ' EUR / '
      || coalesce(sum(coalesce(earnings_usd, 0)), 0)::text || ' USD'
    into v_voor
    from public.referral_links;

  update public.referral_links rl
     set earnings_eur = greatest(0, round(
           coalesce((select sum(c.amount) from public.referral_commissions c
                      where c.referral_link_id = rl.id
                        and upper(coalesce(c.currency, 'EUR')) = 'EUR'), 0)
         - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                      where cb.referral_link_id = rl.id
                        and upper(coalesce(cb.currency, 'EUR')) = 'EUR'), 0), 2)),
         earnings_usd = greatest(0, round(
           coalesce((select sum(c.amount) from public.referral_commissions c
                      where c.referral_link_id = rl.id
                        and upper(coalesce(c.currency, 'EUR')) = 'USD'), 0)
         - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                      where cb.referral_link_id = rl.id
                        and upper(coalesce(cb.currency, 'EUR')) = 'USD'), 0), 2));

  select coalesce(sum(coalesce(earnings_eur, 0)), 0)::text || ' EUR / '
      || coalesce(sum(coalesce(earnings_usd, 0)), 0)::text || ' USD'
    into v_na
    from public.referral_links;

  insert into _plak122 values (3, 'teller herberekend',
    'was ' || v_voor || ', is nu ' || v_na);
exception when others then
  insert into _plak122 values (3, 'teller herberekend',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── controle ────────────────────────────────────────────────────────
do $blk4$
declare
  v_oud   boolean;
  v_dec   boolean;
  v_rec   boolean;
  v_drift integer;
begin
  select coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'execute')), false)
    into v_oud
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_request';

  select coalesce(bool_or(position('min de clawback van deze groep' in pg_get_functiondef(p.oid)) > 0), false)
    into v_dec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_decide';

  select coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'execute')), false)
    into v_rec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'referral_commission_recalculate';

  select count(*) into v_drift
    from public.referral_links rl
   where round(coalesce(rl.earnings_eur, 0), 2) <> greatest(0, round(
           coalesce((select sum(c.amount) from public.referral_commissions c
                      where c.referral_link_id = rl.id
                        and upper(coalesce(c.currency, 'EUR')) = 'EUR'), 0)
         - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                      where cb.referral_link_id = rl.id
                        and upper(coalesce(cb.currency, 'EUR')) = 'EUR'), 0), 2));

  insert into _plak122 values (4, 'stand van zaken',
    'oude RPC nog uitvoerbaar door authenticated: ' || v_oud::text || ' (moet false)' ||
    ' | goedkeuren vergelijkt bruto met bruto: ' || v_dec::text ||
    ' | Recalculate uitvoerbaar: ' || v_rec::text ||
    ' | links die nog afwijken: ' || v_drift || ' (moet 0)');
exception when others then
  insert into _plak122 values (4, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak122 order by n;
