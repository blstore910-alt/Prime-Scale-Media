-- =====================================================================
-- FIX-FACTUURSTOP — één openstaande bijboeking zette de maandfacturatie
--                   stil. Plus twee andere die geld kosten.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en row-level security geldt niet voor die rol. Veilig om
--   twee keer te draaien. De LAATSTE query is het rapport — dat is het
--   enige wat de editor toont.
--
-- A — DE FACTURATIE STOPT, STIL, VOOR ONBEPAALDE TIJD
--   De dubbel-check in subscription_billing_run kijkt of er al een
--   factuur voor dit abonnement openstaat — en filtert NIET op soort.
--   Een planverhoging maakt een `subscription_adjustment` mét
--   subscription_id en status `unpaid`. Zolang die openstaat slaat de
--   nachtelijke run het abonnement over.
--
--   Dus: klant op €99, jij verhoogt naar €149, dat maakt een bijboeking
--   van €50. Wallet leeg, dus die wordt niet geïncasseerd. Vanaf dat
--   moment wordt er NOOIT MEER een maandfactuur gemaakt. Niet in
--   november, niet in december. €50 houdt €149 per maand tegen, en er
--   staat nergens iets over op enig scherm.
--
--   De opruimquery drie regels verderop in diezelfde migratie filtert
--   wél op `i.type = 'subscription'`. Het filter is dus één keer
--   vergeten, in de regel die telt.
--
-- B — VERREKENEN KAN DE WALLET NEGATIEF TREKKEN
--   wallet_precharge_cancel weigert onder nul te gaan en noemt het
--   tekort. wallet_precharge_settle, de knop ernaast op hetzelfde
--   paneel, heeft helemaal geen ondergrens. Voorschot €1.000, klant
--   geeft er €800 van uit, jij verrekent het volle bedrag: saldo −€800.
--   Daarna weigert elke betaling en staat de klant 's nachts op
--   achterstand.
--
-- C — DE OPNAME KIJKT NIET NAAR HET AD-ACCOUNT
--   ad_account_withdrawal_approve leest `ad_accounts` helemaal niet: geen
--   status, geen saldo. Een opname die blijft staan terwijl het account
--   is uitgezet en teruggegeven aan de pool wordt gewoon goedgekeurd —
--   en dan staat er geld op de wallet van iemand wiens saldo inmiddels
--   op het account van een ander staat.
-- =====================================================================

set search_path = public;

drop table if exists public._psm_run_log;
create table public._psm_run_log (nr int, deel text, uitkomst text);

create or replace function public._log(p_nr int, p_deel text, p_uit text)
returns void language sql as $logfn$
  insert into public._psm_run_log(nr, deel, uitkomst) values (p_nr, p_deel, p_uit);
$logfn$;


-- ── A · de dubbel-check kijkt alleen naar maandfacturen ──────────────
do $a$
declare
  v_def  text;
  v_new  text;
  v_zoek text := 'or (i.status = ''unpaid'' and i.period_start is not null)';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(1, 'A facturatie loopt weer door',
      'OVERGESLAGEN: subscription_billing_run bestaat niet');
    return;
  end if;
  if position(v_zoek in v_def) = 0 then
    perform public._log(1, 'A facturatie loopt weer door',
      'OVERGESLAGEN: de dubbel-check ziet er anders uit dan verwacht — stuur me de body');
    return;
  end if;

  -- Alleen een openstaande MAANDFACTUUR mag de volgende tegenhouden. Een
  -- bijboeking is een aparte rekening; die hoort niet de hele
  -- abonnementsfacturatie stil te leggen.
  v_new := replace(v_def, v_zoek,
    'or (i.type = ''subscription'' and i.status = ''unpaid'' and i.period_start is not null)');

  execute v_new;
  perform public._log(1, 'A facturatie loopt weer door',
    'GELUKT: alleen een openstaande maandfactuur houdt de volgende nog tegen; een bijboeking niet meer');
exception when others then
  perform public._log(1, 'A facturatie loopt weer door', 'FOUT: ' || sqlerrm);
end;
$a$;


-- ── A2 · wie staat er NU stil ────────────────────────────────────────
do $a2$
declare r record; v text := '';
begin
  for r in
    select s.id,
           coalesce(up.full_name, up.email, a.tenant_client_code, s.id::text) as klant,
           s.amount, s.currency, s.next_payment_date::date as vervalt
      from public.subscriptions s
      join public.advertisers a on a.id = s.advertiser_id
      left join public.user_profiles up on up.user_id = a.user_id
     where s.status in ('active', 'past_due')
       and s.next_payment_date is not null
       and s.next_payment_date <= now()
       and exists (
         select 1 from public.invoices i
          where i.subscription_id = s.id
            and i.type <> 'subscription'
            and i.status = 'unpaid'
       )
     order by s.next_payment_date
  loop
    v := v || format('%s (%s %s/mnd, stond stil sinds %s); ',
                     r.klant, upper(coalesce(r.currency,'EUR')),
                     r.amount::text, r.vervalt::text);
  end loop;
  perform public._log(2, 'A2 klanten die hierdoor stilstonden',
    case when v = '' then 'geen — niemand is hierdoor overgeslagen'
         else v || ' Deze worden vannacht om 03:00 vanzelf weer gefactureerd.' end);
exception when others then
  perform public._log(2, 'A2 klanten die hierdoor stilstonden', 'FOUT: ' || sqlerrm);
end;
$a2$;


-- ── B · verrekenen mag de wallet niet negatief trekken ───────────────
do $b$
declare
  v_def  text;
  v_new  text;
  v_zoek text := 'wallet_precharge_settle';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = v_zoek and p.prokind = 'f';
  if v_def is null then
    perform public._log(3, 'B verrekenen blijft boven nul',
      'OVERGESLAGEN: functie bestaat niet');
    return;
  end if;
  if position('SALDOCONTROLE' in v_def) > 0 then
    perform public._log(3, 'B verrekenen blijft boven nul', 'AL GOED');
    return;
  end if;
  -- De debet-regel staat er in twee smaken (USD en EUR). In plaats van
  -- die te herschrijven zet ik er één controle vóór, direct na de
  -- declare/begin, die het tekort noemt zoals cancel dat al doet.
  if position('begin' in v_def) = 0 then
    perform public._log(3, 'B verrekenen blijft boven nul',
      'OVERGESLAGEN: kon het begin van de functie niet vinden');
    return;
  end if;

  perform public._log(3, 'B verrekenen blijft boven nul',
    'HANDMATIG: stuur me de body van wallet_precharge_settle, dan schrijf ik de controle exact — hem blind ervoor plakken is bij een geldfunctie precies wat ik niet doe.');
exception when others then
  perform public._log(3, 'B verrekenen blijft boven nul', 'FOUT: ' || sqlerrm);
end;
$b$;


-- ── C · een opname kijkt naar het ad-account ─────────────────────────
do $c$
declare
  v_def  text;
  v_new  text;
  v_zoek text := 'if v_wd.status <> ''pending'' then';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_withdrawal_approve'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(4, 'C opname kijkt naar het ad-account',
      'OVERGESLAGEN: functie bestaat niet');
    return;
  end if;
  if position('KIJK NAAR HET AD-ACCOUNT' in v_def) > 0 then
    perform public._log(4, 'C opname kijkt naar het ad-account', 'AL GOED');
    return;
  end if;
  if position(v_zoek in v_def) = 0 then
    perform public._log(4, 'C opname kijkt naar het ad-account',
      'OVERGESLAGEN: de statuscheck ziet er anders uit — stuur me de body');
    return;
  end if;

  v_new := replace(v_def, v_zoek,
    v_zoek || '
    raise exception ''This withdrawal is no longer pending'' using errcode = ''22000'';
  end if;

  -- KIJK NAAR HET AD-ACCOUNT. Deze functie las ad_accounts helemaal
  -- niet: geen status, geen eigenaar. Een opname die bleef staan
  -- terwijl het account was uitgezet en teruggegeven aan de pool werd
  -- gewoon goedgekeurd, en dan kreeg de klant geld terug voor een
  -- saldo dat inmiddels op het account van iemand anders stond.
  if not exists (
    select 1 from public.ad_accounts aa
     where aa.id = v_wd.ad_account_id
       and aa.advertiser_id = v_wd.advertiser_id
       and coalesce(aa.status, ''active'') not in (''banned'', ''closed'')
  ) then
    raise exception ''That ad account is no longer this advertiser''''s, or has been closed. Check it before approving.''
      using errcode = ''22000'';
  end if;

  if false then');

  execute v_new;
  perform public._log(4, 'C opname kijkt naar het ad-account',
    'GELUKT: goedkeuren weigert nu als het account niet meer van die klant is of gesloten is');
exception when others then
  perform public._log(4, 'C opname kijkt naar het ad-account', 'FOUT: ' || sqlerrm);
end;
$c$;


-- ── HET RAPPORT ──────────────────────────────────────────────────────
select nr as "#", deel as "wat", uitkomst as "resultaat"
  from public._psm_run_log
 order by nr;
