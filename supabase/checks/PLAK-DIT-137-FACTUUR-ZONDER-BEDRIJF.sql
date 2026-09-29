-- ════════════════════════════════════════════════════════════════════
-- PLAK 137 — EEN FACTUUR ZONDER BEDRIJF WORDT NIET MEER VERSTUURD
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS, GEMETEN OP 29-09
--
--   select number, status, total, company_id from invoices
--    where company_id is null;
--   → 131 | paid | 10.00 | (leeg)
--
-- Factuur 131 is BETAALD, staat op EUR 10,00, en heeft geen bedrijf.
-- Dat is geen factuur — het is een bonnetje. Zonder bedrijfsnaam en
-- adres kan hij niet geboekt worden en voldoet hij niet aan de
-- btw-eisen. PSM0010 heeft nog steeds een LOPEND abonnement, dus dit
-- gebeurt volgende maand opnieuw.
--
-- WAAR HET VANDAAN KOMT
--
--   select c.id into v_company
--     from public.companies c
--    where c.advertiser_id = rec.advertiser_id
--    limit 1;
--
-- Geen rij → v_company is NULL → de insert gaat gewoon door. Er staat
-- geen enkele controle tussen.
--
-- WAT DIT DOET
--
-- De facturatie SLAAT DIE KLANT OVER in plaats van een onbruikbare
-- factuur te maken, en zet de teller NIET door — dus er is geen maand
-- gratis, de factuur wordt alsnog gemaakt zodra de bedrijfsgegevens er
-- zijn. En het wordt één keer per klant gemeld in `notifications`, zodat
-- iemand het kan navragen in plaats van dat het stil blijft staan.
--
-- Dit volgt de regel die je zelf al had gesteld: een bedrijf is
-- verplicht voor alles waar een factuur uit komt.
--
-- ONE execute per function — er staat geen tekstchirurgie in deze plak;
-- de functie wordt in zijn geheel opnieuw gezet.
-- ════════════════════════════════════════════════════════════════════

do $blk0$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'process_recurring_subscriptions'
   limit 1;

  if v_src is null then
    raise notice 'process_recurring_subscriptions bestaat niet -- overgeslagen';
    return;
  end if;

  if position('geen bedrijf op de factuur' in v_src) > 0 then
    raise notice 'PLAK 137 stond er al -- niets gedaan';
    return;
  end if;

  -- De haak: de select die het bedrijf ophaalt. Daar direct achter komt
  -- de controle. CRLF-veilig: [[:space:]] in plaats van een harde
  -- newline, want pg_get_functiondef geeft op deze database CRLF terug.
  v_new := regexp_replace(
    v_src,
    '(select[[:space:]]+c\.id[[:space:]]+into[[:space:]]+v_company' ||
    '[[:space:]]+from[[:space:]]+public\.companies[[:space:]]+c' ||
    '[[:space:]]+where[[:space:]]+c\.advertiser_id[[:space:]]*=' ||
    '[[:space:]]*rec\.advertiser_id[[:space:]]+limit[[:space:]]+1;)',
    E'\\1\n' ||
    E'\n' ||
    E'      -- geen bedrijf op de factuur = geen factuur.\n' ||
    E'      -- Een factuur zonder tegenpartij kan niet geboekt worden.\n' ||
    E'      -- De teller gaat NIET door, dus dit is geen gratis maand:\n' ||
    E'      -- zodra de bedrijfsgegevens er staan wordt hij alsnog\n' ||
    E'      -- gemaakt, met terugwerkende periode.\n' ||
    E'      if v_company is null then\n' ||
    E'        begin\n' ||
    E'          insert into public.notifications\n' ||
    E'            (tenant_id, recipient_user_id, type, payload)\n' ||
    E'          select rec.tenant_id, up.id, ''company_missing'',\n' ||
    E'                 jsonb_build_object(\n' ||
    E'                   ''advertiser_id'', rec.advertiser_id,\n' ||
    E'                   ''subscription_id'', rec.id,\n' ||
    E'                   ''amount'', rec.amount,\n' ||
    E'                   ''currency'', v_cur,\n' ||
    E'                   ''period_start'', v_period)\n' ||
    E'            from public.user_profiles up\n' ||
    E'           where up.tenant_id = rec.tenant_id\n' ||
    E'             and up.role in (''admin'', ''super_admin'')\n' ||
    E'             and not exists (\n' ||
    E'               select 1 from public.notifications nz\n' ||
    E'                where nz.recipient_user_id = up.id\n' ||
    E'                  and nz.type = ''company_missing''\n' ||
    E'                  and nz.created_at > now() - interval ''7 days''\n' ||
    E'                  and nz.payload ->> ''advertiser_id''\n' ||
    E'                      = rec.advertiser_id::text\n' ||
    E'             );\n' ||
    E'        exception when others then null;\n' ||
    E'        end;\n' ||
    E'        continue;\n' ||
    E'      end if;\n',
    ''
  );

  if v_new = v_src then
    raise exception 'PLAK 137: het haakje is niet gevonden -- niets gewijzigd';
  end if;

  execute v_new;
end
$blk0$;

-- De rechten terug. Postgres geeft EXECUTE aan PUBLIC op een functie die
-- opnieuw is aangemaakt, en PUBLIC is inclusief anon.
revoke all on function public.process_recurring_subscriptions() from public, anon;
grant execute on function public.process_recurring_subscriptions()
  to authenticated, service_role;

-- ── ÉÉN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
select
  'plak 137 geplaatst'                                          as wat,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'process_recurring_subscriptions'
      and position('geen bedrijf op de factuur'
                   in pg_get_functiondef(p.oid)) > 0)::text     as controle_staat_erin,
  (select count(*)::text from public.invoices
    where company_id is null)                                   as facturen_zonder_bedrijf_nu,
  (select count(*)::text from public.subscriptions s
    where s.status = 'active'
      and not exists (select 1 from public.companies c
                       where c.advertiser_id = s.advertiser_id)) as lopende_abos_zonder_bedrijf,
  (select has_function_privilege('anon',
            'public.process_recurring_subscriptions()', 'execute')::text) as anon_mag_nog;
