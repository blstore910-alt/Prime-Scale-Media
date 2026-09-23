-- ════════════════════════════════════════════════════════════════════
--  PLAK 69 — reis F1 (de affiliate), gevonden met vier brillen tegelijk
--
--  VIER GELDFOUTEN EN TWEE POORTEN. Geen van alle is vandaag zichtbaar:
--  de twee echte affiliates hebben samen 0 commissies. Alle vier komen
--  binnen bereik zodra er één binnenkomt, en drie ervan laten het scherm
--  een ander bedrag noemen dan de server uitkeert.
--
--  A  "NOG AAN JOU VERSCHULDIGD" TELDE MEE WAT AL GEVRAAGD IS.
--     affiliate_referral_stats filtert unpaid_* alleen op
--     status = 'unpaid', terwijl affiliate_payout_request ÉN op
--     payout_id is null filtert. Een commissie die al in een lopende
--     aanvraag vastzit houdt status 'unpaid' — dus:
--
--       EUR 500 openstaand, affiliate vraagt uitbetaling aan.
--       Er komt EUR 200 bij.
--       De wallet leest "Still owed to you EUR 700,00"
--         en eronder "Requested 23 sep: EUR 500,00".
--
--     EUR 1.200 aan aanspraak op EUR 700 aan commissie. De wachtrij van
--     de eigenaar toont EUR 500. Bij de volgende aanvraag geeft de
--     server EUR 200 terug terwijl de kaart nog 700 zei.
--
--  B  "LIFETIME EARNED" VERLOOR GELD DAT AL VERREKEND WAS.
--     Dezelfde clawback-lateral wordt van earnings_* én unpaid_*
--     afgetrokken. Voor wat je nog krijgt is dat juist; voor wat je ooit
--     verdiende niet: een terugdraaiing die al van een BETAALDE
--     uitbetaling is afgetrokken, drukt de levenslange verdienste voor
--     altijd omlaag. EUR 1.000 verdiend, EUR 200 teruggedraaid en
--     verrekend: de portal zegt EUR 1.000, het boek van de eigenaar
--     EUR 800. De portal heeft ongelijk — die 200 is teruggekomen. En
--     het duwt de tier: op een drempel van 1.000 staat er "Riser" boven
--     EUR 800 aan echte verdienste.
--
--  C  DE VLOER PER LINK LIET GELD VERDWIJNEN TUSSEN ZIN EN KNOP.
--     unpaid_* wordt per referral afgekapt met greatest(...,0), dus een
--     clawback die groter is dan wat er op DIE link nog open staat valt
--     stil weg. affiliate_payout_request verrekent over het hele boek en
--     laat hem niet vallen:
--
--       Link A: EUR 100 verdiend en al uitbetaald, daarna EUR 100
--               teruggedraaid  ->  greatest(0 - 100, 0) = 0
--       Link B: EUR 400 open
--       Scherm: "Still owed to you: EUR 400,00"
--       Knop  : de server schrijft EUR 300,00
--
--     EUR 100 verdwijnt tussen de zin en de knop ernaast. De vloer gaat
--     eraf en de clawback-set wordt dezelfde als die van de RPC
--     (payout_id is null).
--
--  D  "UW UITBETALING IS ONDERWEG" NOEMDE HET GEVRAAGDE BEDRAG.
--     affiliate_payout_decide rekent v_settled uit — wat er werkelijk
--     verrekend is, nadat teruggedraaide commissies zijn losgemaakt — en
--     schrijft het verschil netjes in `reason` voor de eigenaar. Het
--     BERICHT aan de affiliate droeg v_row.amount. EUR 800 gevraagd,
--     EUR 50 teruggedraaid, EUR 750 overgemaakt: het scherm van de
--     affiliate zegt EUR 800,00.
--
--  E  IEDERE TENANTGENOOT LAS DE HELE PRIJSLIJST.
--     ad_account_types_read test alleen "je zit in deze tenant" — geen
--     rol, geen is_active. Een affiliate leest daarmee elke
--     default_fee_pct én api_topup_enabled, dus welke families via de
--     API van de leverancier lopen. Geen leveranciersnaam en geen
--     kostprijs in die tabel, maar het is onze prijs- en
--     automatiseringskaart.
--
--  F  ÉÉN RIJ CONTROLEREN, EEN GROEP BIJWERKEN.
--     affiliate_payout_cancel controleert eigendom op de aangesproken
--     rij en werkt daarna de hele groep bij zonder dat predicaat. Vandaag
--     onbereikbaar (group_id is per aanvraag een nieuwe uuid en geen
--     enkele groep overspant twee affiliates — nagemeten), dus dit is
--     diepteverdediging, geen open gat.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p69;
create temp table _p69(nr int, wat text, uitkomst text);

-- ── A+B+C. WAT JE NOG KRIJGT, EN WAT JE OOIT VERDIENDE ───────────────
create or replace function public.affiliate_referral_stats(
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to   timestamp with time zone default null::timestamp with time zone)
returns table(referral_link_id uuid, referred_advertiser_id uuid, referred_advertiser_name text,
              referred_advertiser_email text, referred_advertiser_code text, commission_type text,
              commission_pct numeric, commission_currency text, spend_usd numeric, spend_eur numeric,
              topup_count integer, earnings_usd numeric, earnings_eur numeric,
              unpaid_usd numeric, unpaid_eur numeric, link_status text)
language plpgsql
security definer
set search_path to 'public'
as $blk0$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    d.id, d.referred_advertiser_id, d.referred_advertiser_name::text,
    regexp_replace(d.referred_advertiser_email::text, '^(.)[^@]*@', '\1***@'),
    d.referred_advertiser_tenant_client_code::text,
    null::text, null::numeric, null::text,
    coalesce(sp.spend_usd, 0)::numeric, coalesce(sp.spend_eur, 0)::numeric,
    coalesce(sp.topup_count, 0)::int,
    -- B: wat je OOIT verdiende trekt ELKE terugdraaiing af, ook een die
    --    al van een betaalde uitbetaling is afgehaald -> cba, niet cb.
    greatest(coalesce(ea.earn_usd, 0) - coalesce(cba.usd, 0), 0)::numeric,
    greatest(coalesce(ea.earn_eur, 0) - coalesce(cba.eur, 0), 0)::numeric,
    -- C: geen vloer per link. De som over de links moet gelijk zijn aan
    --    wat affiliate_payout_request over het hele boek berekent, en
    --    die kapt niet per referral af.
    (coalesce(ea.unpaid_usd, 0) - coalesce(cb.usd, 0))::numeric,
    (coalesce(ea.unpaid_eur, 0) - coalesce(cb.eur, 0))::numeric,
    coalesce(rl.status, 'active')::text
  from public.referral_links_with_details d
  join public.referral_links rl on rl.id = d.id
  left join lateral (
    select
      sum(t.topup_amount) filter (where t.topup_usd is null
                                     or upper(coalesce(t.currency, 'EUR')) = 'USD') as spend_usd,
      sum(t.topup_amount) filter (where t.topup_usd is not null
                                     and upper(coalesce(t.currency, 'EUR')) = 'EUR') as spend_eur,
      count(*) as topup_count
    from public.top_ups t
    where t.advertiser_id = d.referred_advertiser_id
      and t.tenant_id = d.tenant_id
      and t.status = 'completed'
      and coalesce(t.is_deleted, false) = false
      and (p_from is null or coalesce(t.verified_at, t.created_at) >= p_from)
      and (p_to   is null or coalesce(t.verified_at, t.created_at) <= p_to)
  ) sp on true
  left join lateral (
    select
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_eur,
      -- A: een commissie die al in een lopende aanvraag vastzit is niet
      --    meer vrij om te vragen. Dat is precies de test die
      --    affiliate_payout_request zelf doet.
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') = 'unpaid'
                               and rc.payout_id is null) as unpaid_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') = 'unpaid'
                               and rc.payout_id is null) as unpaid_eur
    from public.referral_commissions rc
    where rc.referral_link_id = d.id
      and (p_from is null or rc.created_at >= p_from)
      and (p_to   is null or rc.created_at <= p_to)
  ) ea on true
  -- cb: de terugdraaiingen die NOG NERGENS aan hangen. Dezelfde set als
  --     affiliate_payout_request gebruikt, dus scherm en server komen op
  --     hetzelfde uit.
  left join lateral (
    select sum(c.amount) filter (where upper(c.currency) = 'USD') as usd,
           sum(c.amount) filter (where upper(c.currency) = 'EUR') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
       and c.payout_id is null
       and (p_from is null or c.created_at >= p_from)
       and (p_to   is null or c.created_at <= p_to)
  ) cb on true
  -- cba: ALLE terugdraaiingen, voor de levenslange verdienste.
  left join lateral (
    select sum(c.amount) filter (where upper(c.currency) = 'USD') as usd,
           sum(c.amount) filter (where upper(c.currency) = 'EUR') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
       and (p_from is null or c.created_at >= p_from)
       and (p_to   is null or c.created_at <= p_to)
  ) cba on true
  where d.affiliate_advertiser_id = v_aff
    and coalesce(rl.status, 'active') in ('active', 'pending')
  order by d.referred_advertiser_name nulls last;
end;
$blk0$;

-- Een nieuwe functie krijgt van Postgres uitvoerrecht voor PUBLIC — dus
-- ook voor anon. Intrekken hoort in HETZELFDE blok als de create.
do $blk1$
begin
  execute 'revoke all on function public.affiliate_referral_stats(timestamptz, timestamptz) from public, anon';
  execute 'grant execute on function public.affiliate_referral_stats(timestamptz, timestamptz) to authenticated, service_role';
  insert into _p69 values (1, 'wat je nog krijgt / ooit verdiende',
    'aangepast: al gevraagde commissie telt niet meer mee, levenslang verliest geen verrekende clawback, en de vloer per link is eraf');
exception when others then
  insert into _p69 values (1, 'wat je nog krijgt / ooit verdiende', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── D. HET BERICHT NOEMT WAT ER IS OVERGEMAAKT ───────────────────────
do $blk2$
declare
  v_def text;
  v_new text;
  v_oid oid;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'affiliate_payout_decide'
   limit 1;

  if v_oid is null then
    insert into _p69 values (2, 'bericht bij een betaalde uitbetaling', 'functie niet gevonden');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('''amount'', v_settled' in v_def) > 0 then
    insert into _p69 values (2, 'bericht bij een betaalde uitbetaling', 'stond al goed');
    return;
  end if;

  -- Alleen de regel in de notificatie-insert, herkenbaar aan het
  -- payout_id dat er direct voor staat. De andere v_row.amount-plekken
  -- (de reason-tekst) blijven staan: die MOETEN het gevraagde bedrag
  -- noemen, dat is juist het verschil dat ze uitleggen.
  v_new := replace(v_def,
    '''payout_id'', v_row.id, ''amount'', v_row.amount',
    '''payout_id'', v_row.id, ''amount'', v_settled');

  if v_new = v_def then
    insert into _p69 values (2, 'bericht bij een betaalde uitbetaling',
      'NIET AANGEPAST (de regel niet herkend, niets veranderd)');
    return;
  end if;

  execute v_new;
  execute 'revoke all on function public.affiliate_payout_decide(uuid, text, text, text) from public, anon';
  execute 'grant execute on function public.affiliate_payout_decide(uuid, text, text, text) to authenticated, service_role';
  insert into _p69 values (2, 'bericht bij een betaalde uitbetaling',
    'aangepast: het bericht noemt nu wat er werkelijk verrekend is');
exception when others then
  insert into _p69 values (2, 'bericht bij een betaalde uitbetaling', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── E. DE PRIJSLIJST IS NIET VOOR IEDEREEN IN DE TENANT ──────────────
do $blk3$
begin
  execute 'drop policy if exists ad_account_types_read on public.ad_account_types';
  execute $pol$
    create policy ad_account_types_read on public.ad_account_types
      for select to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
           where up.user_id   = auth.uid()
             and up.tenant_id = ad_account_types.tenant_id
             and lower(coalesce(up.role, '')) in ('advertiser', 'admin')
             and coalesce(up.is_active, true)
             and lower(coalesce(up.status, 'active')) <> 'inactive'
        )
      )
  $pol$;
  insert into _p69 values (3, 'wie leest de ad-account-types',
    'alleen een ACTIEVE advertiser of admin in dezelfde tenant — een affiliate en een gedeactiveerd account niet meer');
exception when others then
  insert into _p69 values (3, 'wie leest de ad-account-types', 'MISLUKT: ' || sqlerrm);
end
$blk3$;

-- ── F. WAT JE MAG INTREKKEN IS WAT VAN JOU IS ────────────────────────
create or replace function public.affiliate_payout_cancel(p_payout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk4$
declare
  v_uid   uuid := auth.uid();
  v_row   public.affiliate_payouts;
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select p.* into v_row
    from public.affiliate_payouts p
    join public.advertisers a on a.id = p.affiliate_advertiser_id
   where p.id = p_payout_id and a.user_id = v_uid
   for update of p;

  if v_row.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'This payout has already been answered' using errcode = '42501';
  end if;

  v_group := coalesce(v_row.group_id, v_row.id);

  -- Alles hieronder draagt nu OOK affiliate_advertiser_id. Het eigendom
  -- werd op één rij getest en de schrijfactie raakte een verzameling.
  update public.referral_commissions rc
     set payout_id = null
    from public.affiliate_payouts p
   where p.id = rc.payout_id
     and coalesce(p.group_id, p.id) = v_group
     and p.affiliate_advertiser_id = v_row.affiliate_advertiser_id;

  update public.referral_clawbacks cb
     set payout_id = null
    from public.affiliate_payouts p
   where p.id = cb.payout_id
     and coalesce(p.group_id, p.id) = v_group
     and p.affiliate_advertiser_id = v_row.affiliate_advertiser_id;

  update public.affiliate_payouts
     set status = 'cancelled', decided_at = now()
   where coalesce(group_id, id) = v_group
     and status = 'requested'
     and affiliate_advertiser_id = v_row.affiliate_advertiser_id;

  return jsonb_build_object('ok', true);
end;
$blk4$;

do $blk5$
begin
  execute 'revoke all on function public.affiliate_payout_cancel(uuid) from public, anon';
  execute 'grant execute on function public.affiliate_payout_cancel(uuid) to authenticated, service_role';
  insert into _p69 values (4, 'een aanvraag intrekken',
    'de drie groepsbrede updates dragen nu het affiliate-predicaat; anon mag hem niet meer aanroepen');
exception when others then
  insert into _p69 values (4, 'een aanvraag intrekken', 'MISLUKT: ' || sqlerrm);
end
$blk5$;

-- ── G. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk6$
declare v_txt text;
begin
  begin
    select case
             when pg_get_functiondef(p.oid) ilike '%rc.payout_id is null%'
              and pg_get_functiondef(p.oid) ilike '%) cba on true%'
             then 'goed: al gevraagde commissie eruit, levenslang compleet'
             else 'LET OP: nog de oude vorm' end
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_referral_stats'
     limit 1;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p69 values (5, 'controle op affiliate_referral_stats', coalesce(v_txt, 'niet gevonden'));

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and (p.proname like 'affiliate\_%' or p.proname like 'referral\_%');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p69 values (6, 'affiliate-functies die anon nog mag aanroepen',
    coalesce(nullif(v_txt, 'geen'), 'geen'));

  begin
    select coalesce(count(*)::text, '0') || ' commissies zitten in een lopende aanvraag'
      into v_txt
      from public.referral_commissions rc
      join public.affiliate_payouts p on p.id = rc.payout_id
     where p.status = 'requested';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p69 values (7, 'is er al iets misgegaan', v_txt);
end
$blk6$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p69 order by nr;
