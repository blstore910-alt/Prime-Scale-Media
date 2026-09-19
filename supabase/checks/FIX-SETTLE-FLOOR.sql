-- =====================================================================
-- FIX-SETTLE-FLOOR — verrekenen mag de wallet niet onder nul trekken.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en RLS geldt niet voor die rol. Veilig om twee keer te
--   draaien. De LAATSTE query is het rapport.
--
-- WAT ER MIS IS
--   wallet_precharge_cancel weigert onder nul te gaan en noemt het
--   tekort. wallet_precharge_settle — de knop er direct naast op
--   hetzelfde paneel — heeft helemaal geen ondergrens. Hij klemt alleen
--   op het openstaande bedrag van het voorschot, niet op wat er nog op
--   de wallet staat.
--
--   Voorschot €1.000 → saldo €1.000. Klant zet er €800 van op een
--   ad-account → saldo €200. Jij drukt op Verrekenen (of het geld kwam
--   korter binnen dan geclaimd): 200 − 1000 = **−€800**. Daarna weigert
--   invoice_pay_from_wallet alles, zet de nachtelijke run de klant op
--   achterstand, en op z'n eigen scherm staat −€800 zonder één regel
--   uitleg.
--
--   De controle hieronder is dezelfde die cancel al doet, met dezelfde
--   toon: zeg het tekort, en zeg wat je in plaats daarvan moet doen.
--
--   Geschreven op de echte body (TOON-SETTLE), niet op de gok. De
--   wijziging is één declare-regel en één blok vóór de afboeking; al het
--   andere blijft letterlijk zoals het was.
-- =====================================================================

set search_path = public;

drop table if exists public._psm_run_log;
create table public._psm_run_log (nr int, deel text, uitkomst text);

create or replace function public._log(p_nr int, p_deel text, p_uit text)
returns void language sql as $logfn$
  insert into public._psm_run_log(nr, deel, uitkomst) values (p_nr, p_deel, p_uit);
$logfn$;


do $fix$
declare
  v_def text;
  v_new text;
  v_decl text := '  v_row    public.wallet_precharges%rowtype;';
  v_anchor text := '  -- The repaid portion comes back off the wallet.';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_precharge_settle'
     and p.prokind = 'f';
  if v_def is null then
    perform public._log(1, 'Verrekenen blijft boven nul',
      'OVERGESLAGEN: wallet_precharge_settle bestaat niet');
    return;
  end if;
  if position('SALDOCONTROLE' in v_def) > 0 then
    perform public._log(1, 'Verrekenen blijft boven nul', 'AL GOED');
    return;
  end if;
  if position(v_decl in v_def) = 0 or position(v_anchor in v_def) = 0 then
    perform public._log(1, 'Verrekenen blijft boven nul',
      'OVERGESLAGEN: de functie ziet er anders uit dan de body die ik gelezen heb');
    return;
  end if;

  v_new := replace(v_def, v_decl, v_decl || '
  v_bal    numeric;');

  v_new := replace(v_new, v_anchor,
'  -- SALDOCONTROLE. Zonder dit klemt deze functie alleen op het
  -- openstaande bedrag van het voorschot, en niet op wat er nog op de
  -- wallet staat -- dus verrekenen van een voorschot dat de klant al
  -- uitgegeven heeft trok het saldo negatief, waarna elke betaling
  -- weigert en de nachtelijke run hem op achterstand zet.
  --
  -- wallet_precharge_cancel doet deze controle al en noemt het tekort;
  -- de knop ernaast deed hem niet.
  --
  -- for update op dezelfde rij die hieronder wordt bijgewerkt, zodat er
  -- tussen lezen en afboeken niets tussendoor kan.
  select case when v_pc.currency = ''USD''
              then coalesce(usd_balance, 0)
              else coalesce(eur_balance, 0) end
    into v_bal
    from public.wallets
   where id = v_pc.wallet_id
   for update;
  if not found then
    raise exception ''Wallet not found'' using errcode = ''42704'';
  end if;
  if v_bal < v_settle then
    raise exception
      ''Settling % % would take the wallet below zero -- they are short % %. The advance has already been spent, so take it back with a wallet adjustment instead of settling it.'',
      v_settle, v_pc.currency, (v_settle - v_bal), v_pc.currency
      using errcode = ''22000'';
  end if;

' || v_anchor);

  execute v_new;
  perform public._log(1, 'Verrekenen blijft boven nul',
    'GELUKT: verrekenen weigert nu als het saldo het niet dekt, en noemt het tekort');
exception when others then
  perform public._log(1, 'Verrekenen blijft boven nul', 'FOUT: ' || sqlerrm);
end;
$fix$;


-- ── Staat er nu al een wallet onder nul ──────────────────────────────
do $chk$
declare v int;
begin
  select count(*) into v from public.wallets
   where coalesce(eur_balance, 0) < 0 or coalesce(usd_balance, 0) < 0;
  perform public._log(2, 'Wallets die nu onder nul staan',
    case when v = 0 then 'geen'
         else v::text || ' — die moeten met een aanpassing rechtgezet worden' end);
end;
$chk$;


select nr as "#", deel as "wat", uitkomst as "resultaat"
  from public._psm_run_log
 order by nr;
