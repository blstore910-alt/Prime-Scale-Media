-- ════════════════════════════════════════════════════════════════════
-- PLAK 126 — het grootboek schrijft er zelf bij WIE de beweging maakte
-- ════════════════════════════════════════════════════════════════════
--
-- DRAAI EERST PLAK 125. Zonder `wallet_ledger` doet deze niets (hij
-- zegt dat dan ook, in plaats van te struikelen).
--
-- WAT PLAK 125 OPENLIET
--
-- Daar staat: elke money-RPC zet vóór zijn schrijf een hint
-- (`set local psm.ledger_source = 'topup_verify'`), en zonder hint
-- landt de regel met `source = 'unknown'`. Dat werkt, maar het betekent
-- dat TWINTIG functies één voor één opengelegd moeten worden --
-- gemeten, dat zijn er twintig die `eur_balance` of `usd_balance`
-- aanraken:
--
--   ad_account_request_create_paid       invoice_pay_from_wallet
--   ad_account_request_reject_refund     top_up_create_for_advertiser
--   ad_account_withdrawal_approve        wallet_adjustment_approve
--   ad_account_withdrawal_settle         wallet_admin_adjust
--   change_subscription_amount           wallet_exchange
--   refund_wallet_on_topup_rejected      wallet_precharge_cancel
--   wallet_precharge_create              wallet_precharge_from_topup
--   wallet_precharge_settle              wallet_refund_approve
--   _wallet_topup_balance_sync           log_wallet_activity
--   _guard_refund_not_from_an_advance    _withdrawal_is_always_usd
--
-- Twintig keer tekstchirurgie op een levende geldfunctie is twintig
-- kansen om iets te breken, voor informatie die we ook anders kunnen
-- krijgen.
--
-- WAT DIT DOET
--
-- Postgres weet zelf wie er belde. `get diagnostics v := pg_context`
-- geeft in een PL/pgSQL-functie de volledige aanroepstapel, met de
-- namen van de functies eronder. De trigger leest daar de dichtstbije
-- naam uit die niet van hemzelf is, en zet die in `source`.
--
-- Dus: geen enkele RPC hoeft aangeraakt te worden, EN een functie die
-- iemand volgend jaar toevoegt en vergeet aan te sluiten wordt
-- automatisch goed geboekt. Dat is dezelfde redenering als waarom de
-- trigger op `wallets` zit en niet in de RPC's: volledigheid vóór
-- netheid.
--
-- DE HINT BLIJFT WINNEN. Zet een RPC `psm.ledger_source` expliciet, dan
-- is dat de bron -- want een mens die de naam kiest weet meer dan een
-- stapel. De stapel is de terugval, en 'unknown' de terugval daarvan:
-- een handmatige UPDATE in de SQL-editor heeft geen functie eronder en
-- hoort ook precies zo in de boeken te staan.
--
-- Er beweegt geen geld. De bestaande regels blijven staan zoals ze
-- staan -- wat 'unknown' is blijft 'unknown', want achteraf verzinnen
-- waar een regel vandaan kwam is precies wat een grootboek niet doet.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak126 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak126;

do $blk0$
begin
  if to_regclass('public.wallet_ledger') is null then
    insert into _plak126 values (0, 'de bron',
      'AFGEBROKEN: wallet_ledger bestaat niet -- draai eerst plak 125');
    return;
  end if;

  create or replace function public._wallet_ledger_record()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_src   text;
    v_sid   text;
    v_rsn   text;
    v_stack text;
    v_line  text;
  begin
    -- 1. De expliciete hint, als een RPC hem zet. Die wint: een naam
    --    die iemand gekozen heeft zegt meer dan een stapel.
    v_src := nullif(btrim(coalesce(current_setting('psm.ledger_source', true), '')), '');
    v_sid := nullif(btrim(coalesce(current_setting('psm.ledger_source_id', true), '')), '');
    v_rsn := nullif(btrim(coalesce(current_setting('psm.ledger_reason', true), '')), '');

    -- 2. Anders: vraag Postgres wie er belde.
    --
    --    pg_context geeft regels als
    --      PL/pgSQL function _wallet_ledger_record() line 12 at SQL statement
    --      SQL statement "update public.wallets set eur_balance = ..."
    --      PL/pgSQL function invoice_pay_from_wallet(uuid) line 84 at SQL statement
    --
    --    De eerste functienaam die niet van dit grootboek zelf is, is
    --    de veroorzaker. Alles is in een block met een eigen exception
    --    gezet: mislukt het lezen of het ontleden, dan valt hij terug
    --    op 'unknown' en gaat de regel gewoon door. Een grootboek mag
    --    nooit een betaling tegenhouden omdat het de naam niet kon
    --    vinden.
    if v_src is null then
      begin
        get diagnostics v_stack = pg_context;
        select m[1] into v_line
          from regexp_matches(
                 coalesce(v_stack, ''),
                 'function ([a-zA-Z0-9_]+)\(', 'g') as m
         where m[1] not in ('_wallet_ledger_record', '_wallet_ledger_append_only')
         limit 1;
        v_src := nullif(btrim(coalesce(v_line, '')), '');
      exception when others then
        v_src := null;
      end;
    end if;

    if coalesce(new.eur_balance, 0) is distinct from coalesce(old.eur_balance, 0) then
      insert into public.wallet_ledger
        (tenant_id, advertiser_id, wallet_id, currency, delta,
         balance_before, balance_after, source, source_id, reason, actor_user_id)
      values
        (new.tenant_id, new.advertiser_id, new.id, 'EUR',
         round(coalesce(new.eur_balance, 0) - coalesce(old.eur_balance, 0), 2),
         round(coalesce(old.eur_balance, 0), 2),
         round(coalesce(new.eur_balance, 0), 2),
         coalesce(v_src, 'unknown'),
         case when v_sid ~ '^[0-9a-fA-F-]{36}$' then v_sid::uuid else null end,
         v_rsn, auth.uid());
    end if;

    if coalesce(new.usd_balance, 0) is distinct from coalesce(old.usd_balance, 0) then
      insert into public.wallet_ledger
        (tenant_id, advertiser_id, wallet_id, currency, delta,
         balance_before, balance_after, source, source_id, reason, actor_user_id)
      values
        (new.tenant_id, new.advertiser_id, new.id, 'USD',
         round(coalesce(new.usd_balance, 0) - coalesce(old.usd_balance, 0), 2),
         round(coalesce(old.usd_balance, 0), 2),
         round(coalesce(new.usd_balance, 0), 2),
         coalesce(v_src, 'unknown'),
         case when v_sid ~ '^[0-9a-fA-F-]{36}$' then v_sid::uuid else null end,
         v_rsn, auth.uid());
    end if;

    return new;
  end;
  $fn$;

  revoke all on function public._wallet_ledger_record() from public, anon;

  insert into _plak126 values (0, 'de bron',
    'de trigger leest nu zelf uit de aanroepstapel wie de beweging maakte');
exception when others then
  insert into _plak126 values (0, 'de bron', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── de riem naast de bretel ─────────────────────────────────────────
do $blkA$
begin
  -- Gemeten na plak 125: `authenticated` en `service_role` hebben nog
  -- UPDATE en DELETE op wallet_ledger. De append-only-trigger weigert
  -- ze wel, dus er kan niets -- maar plak 125 deed `revoke all from
  -- anon, public`, en dat raakt `authenticated` niet: die rol heeft
  -- zijn rechten uit Supabase's default privileges, niet uit PUBLIC.
  --
  -- Het recht hoort er niet te zijn ook al werkt het slot. Twee dingen
  -- die allebei moeten falen is het hele punt van een grootboek.
  revoke update, delete, truncate on public.wallet_ledger
    from authenticated, service_role;

  insert into _plak126 values (1, 'de rechten',
    'update/delete/truncate afgenomen van authenticated en service_role');
exception when others then
  insert into _plak126 values (1, 'de rechten', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blkA$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_ok      boolean;
  v_trg     integer;
  v_scheef  integer;
  v_bronnen text;
begin
  select position('pg_context' in pg_get_functiondef(p.oid)) > 0
    into v_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_wallet_ledger_record';

  select count(*) into v_trg from pg_trigger
   where tgname = 'wallet_ledger_record' and not tgisinternal;

  select count(*) into v_scheef from (
    select w.id
      from public.wallets w
      left join public.wallet_ledger l on l.wallet_id = w.id
     group by w.id, w.eur_balance, w.usd_balance
    having round(coalesce(w.eur_balance, 0), 2) is distinct from
           round(coalesce(sum(l.delta) filter (where upper(l.currency) = 'EUR'), 0), 2)
        or round(coalesce(w.usd_balance, 0), 2) is distinct from
           round(coalesce(sum(l.delta) filter (where upper(l.currency) = 'USD'), 0), 2)
  ) x;

  select string_agg(s.source || ' ' || s.n, ', ' order by s.n desc)
    into v_bronnen
    from (select source, count(*) as n from public.wallet_ledger group by source) s;

  insert into _plak126 values (2, 'stand van zaken',
    'stapel wordt gelezen: ' || coalesce(v_ok, false)::text
    || ' | trigger aan: ' || v_trg || ' van 1'
    || ' | portemonnees die niet kloppen: ' || v_scheef || ' (moet 0)'
    || ' | authenticated mag nog wijzigen: '
    || has_table_privilege('authenticated', 'public.wallet_ledger', 'update')::text
    || ' (moet false)');
  insert into _plak126 values (3, 'bronnen tot nu toe',
    coalesce(v_bronnen, 'nog geen regels'));
exception when others then
  insert into _plak126 values (2, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak126 order by n;
