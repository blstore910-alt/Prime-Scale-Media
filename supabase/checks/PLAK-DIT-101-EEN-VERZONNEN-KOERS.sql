-- ════════════════════════════════════════════════════════════════════
-- PLAK 101 — de EUR 50 aanvraagkosten verzinnen een koers
-- ════════════════════════════════════════════════════════════════════
--
-- Gevonden door de geld-agent op blok 1. In
-- ad_account_request_create_paid, regels 104-110 van de live definitie:
--
--   select eur into v_rate
--     from public.exchange_rates
--    where tenant_id = v_adv.tenant_id and is_active = true
--    limit 1;                                  <-- geen ORDER BY
--   if v_rate is null or v_rate <= 0 then
--     v_rate := 0.86;                          <-- verzonnen
--   end if;
--   v_fee := round(50 / v_rate, 0);
--
-- TWEE DINGEN MIS
--
-- 1. GEEN ONDERGRENS OP DE LEES. `limit 1` zonder `order by` laat de
--    queryplanner kiezen. Dat is vandaag geen probleem op deze tenant
--    -- er is er precies een actief -- maar upsertExchangeRate zet de
--    oude rij eerst stand-down in een APARTE instructie en schrijft dan
--    pas de nieuwe. Mislukt die tweede, dan staan er twee actieve
--    rijen, en dan kiest de planner. Elke andere lezer in de app doet
--    `order by updated_at desc limit 1`; deze niet.
--
-- 2. EEN VERZONNEN KOERS. Staat er geen actieve koers, dan neemt hij
--    0,86. Bij de echte koers van deze tenant (0,872361) is het bedrag
--    USD 57; met die 0,86 wordt het USD 58. Een dollar te veel per
--    aanvraag, op een koers die 1,4% mis is -- en niets op het scherm
--    of in de database zegt dat er geraden is.
--
--    Elk ander geldpad weigert netjes in die toestand:
--    top_up_create_for_advertiser geeft "Exchange rate unavailable",
--    affiliate_payout_request_multi geeft P0002. Alleen deze verzint
--    iets, en juist hier gaat er direct EUR 50 van een portemonnee af.
--
-- Weigeren is het juiste antwoord. Een klant die even niet kan
-- aanvragen is een ongemak; een klant die een dollar te veel betaalt op
-- een geraden koers is een fout in de boeken.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak101 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak101;

do $blk0$
declare
  v_src  text;
  v_new  text;
  v_step text;
  v_prev text;
  v_done text := '';
  v_nl   text := chr(13) || chr(10);
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ad_account_request_create_paid'
   limit 1;

  if v_src is null then
    insert into _plak101 values (0, 'de RPC aanpassen',
      'ad_account_request_create_paid bestaat niet - overgeslagen');
    return;
  end if;

  if position('Exchange rate unavailable' in v_src) > 0 then
    insert into _plak101 values (0, 'de RPC aanpassen',
      'stond er al - niets gedaan');
    return;
  end if;

  v_new := v_src;

  -- (a) een vaste volgorde, zodat de planner niet kiest
  v_step := 'order by op de koerslees';
  v_prev := v_new;
  v_new := replace(v_new,
    'where tenant_id = v_adv.tenant_id and is_active = true' || v_nl ||
    '       limit 1;',
    'where tenant_id = v_adv.tenant_id and is_active = true' || v_nl ||
    '       order by updated_at desc' || v_nl ||
    '       limit 1;');
  -- Geen terugvalanker. De inspringing is read-only nagelopen tegen de
  -- live definitie voordat deze plak werd verstuurd; grijpt hij niet
  -- aan, dan is de functie veranderd en hoort er iemand naar te kijken
  -- in plaats van dat een ruimer patroon alsnog iets raakt.
  if v_new = v_prev then raise exception '%', v_step; end if;
  v_done := v_done || v_step || ' ok | ';

  -- (b) niet verzinnen maar weigeren, zoals elk ander geldpad
  v_step := 'de verzonnen 0.86 eruit';
  v_prev := v_new;
  v_new := replace(v_new,
    'if v_rate is null or v_rate <= 0 then' || v_nl ||
    '        v_rate := 0.86;' || v_nl ||
    '      end if;',
    'if v_rate is null or v_rate <= 0 then' || v_nl ||
    '        -- Niet raden. Elk ander geldpad weigert hier ook, en juist' || v_nl ||
    '        -- hier gaat er direct EUR 50 van een portemonnee af.' || v_nl ||
    '        raise exception ''Exchange rate unavailable - ask us to set it''' || v_nl ||
    '          using errcode = ''P0002'';' || v_nl ||
    '      end if;');
  if v_new = v_prev then raise exception '%', v_step; end if;
  v_done := v_done || v_step || ' ok';

  execute v_new;

  insert into _plak101 values (0, 'de RPC aanpassen', v_done);
exception when others then
  insert into _plak101 values (0, 'de RPC aanpassen',
    'NIETS UITGEVOERD - ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── de rechten horen bij elke create or replace ─────────────────────
do $blk1$
declare
  v_sig text;
begin
  select 'public.' || p.proname || '(' ||
         pg_get_function_identity_arguments(p.oid) || ')'
    into v_sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ad_account_request_create_paid'
   limit 1;

  if v_sig is null then
    insert into _plak101 values (1, 'rechten', 'functie bestaat niet');
    return;
  end if;

  execute 'revoke all on function ' || v_sig || ' from public, anon';
  execute 'grant execute on function ' || v_sig ||
          ' to authenticated, service_role';
  insert into _plak101 values (1, 'rechten',
    'anon eraf, authenticated + service_role erop');
exception when others then
  insert into _plak101 values (1, 'rechten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ─────────────────────────────────────────────────────────
do $blk2$
declare
  v_086  integer;
  v_ord  integer;
  v_anon integer;
  v_act  integer;
begin
  select count(*) into v_086
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
     and pg_get_functiondef(p.oid) like '%0.86%';

  select count(*) into v_ord
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
     and pg_get_functiondef(p.oid) like '%order by updated_at desc%';

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid'
     and has_function_privilege('anon', p.oid, 'execute');

  select count(*) into v_act from public.exchange_rates where is_active;

  insert into _plak101 values (2, 'stand van zaken',
    'verzonnen 0.86 nog in de definitie: ' || v_086 || ' (moet 0) | ' ||
    'order by aanwezig: ' || v_ord || ' (moet 1) | ' ||
    'anon mag hem: ' || v_anon || ' (moet 0) | ' ||
    'actieve koersrijen in totaal: ' || v_act || ' (een per tenant hoort)');
exception when others then
  insert into _plak101 values (2, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── en welke koers welke tenant nu heeft ────────────────────────────
do $blk3$
declare
  v text;
begin
  select coalesce(string_agg(
           coalesce(t.slug, '?') || ' -> ' || r.eur::text, ' | '
           order by t.slug), 'geen actieve koers')
    into v
    from public.exchange_rates r
    left join public.tenants t on t.id = r.tenant_id
   where r.is_active;
  insert into _plak101 values (3, 'actieve koersen', v);
exception when others then
  insert into _plak101 values (3, 'actieve koersen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak101 order by n;
