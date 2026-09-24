-- ════════════════════════════════════════════════════════════════════
-- PLAK 85 — wat de D3-sweep in de database vond
-- ════════════════════════════════════════════════════════════════════
--
-- 1  DE CLAWBACK HEEFT NOG NOOIT GEWERKT. De helft van een migratie
--    staat niet op productie.
--
--    `20260918230000_commission_clawback.sql` maakt twee functies én
--    twee triggers. De functies staan er:
--
--      _claw_back_referral_commission      (numeric)
--      _clawback_on_wallet_refund          (trigger)
--      _clawback_on_ad_account_withdrawal  (trigger)
--
--    en de tabel referral_clawbacks ook. Maar:
--
--      select ... from pg_trigger where proname ilike '%claw%'  ->  0 rijen
--
--    Geen van beide triggers bestaat, en geen latere migratie haalt ze
--    weg. Alleen de twee `create trigger`-regels zijn nooit geland.
--
--    Wat dat betekent vandaag: een beheerder keurt een opname of een
--    terugbetaling goed, het geld gaat terug, en de affiliate houdt de
--    commissie op geld dat is teruggekomen. Er staan al twee
--    goedgekeurde opnames en één goedgekeurde terugbetaling op live.
--
-- 2  EEN AANVRAAG IS VAN 'pending' NAAR 'completed' TE ZETTEN VANUIT DE
--    CONSOLE.
--
--    ad_account_requests is de enige tabel van deze reis waar
--    `authenticated` UPDATE op heeft, en het RLS-beleid is
--    `_is_admin_of(tenant_id)`. De trigger
--    _guard_ad_account_requests_session_write houdt de kolommen tegen
--    (alleen status, rejection_reason, notes, updated_at), houdt tegen
--    dat je een completed/rejected aanvraag verzet als je niet de
--    eigenaar bent, en dwingt af dat AFWIJZEN via de terugbetalende RPC
--    gaat. Hij houdt `pending -> completed` NIET tegen.
--
--    Eén regel in devtools zet een aanvraag dus op voltooid zonder dat
--    createAdAccountFromRequest ooit draait: geen ad-account aangemaakt,
--    de EUR 50 gehouden, en de controle op een onbetaalde fee-factuur
--    overgeslagen. Een klant kan dit niet -- die is geen beheerder --
--    maar elke medewerker-beheerder wel.
--
-- 3  wallets.tenant_id IS NULLBAAR, en twee RPC's doen er een
--    NULL-BLINDE controle op.
--
--    `if v_wallet.tenant_id <> v_admin.tenant_id then raise` is met een
--    NULL links geen FALSE maar NULL, dus de if slaat niet aan. Dat zit
--    in wallet_refund_request en wallet_adjustment_request, en
--    wallet_refund_approve controleert daarna alleen zijn EIGEN
--    tenant_id voordat hij v_rf.wallet_id debiteert -- zonder de tenant
--    van die portemonnee nog eens na te kijken.
--
--    Vandaag niet te misbruiken: de twee NULL-rijen hebben ook geen
--    advertiser_id, en de opzoeking gaat via advertiser_id. Eén
--    portemonnee met een adverteerder en zonder tenant opent het. Dezelfde
--    oplossing als bij wallet_topups: vullen en vastzetten.
--
-- Elke stap in zijn EIGEN blok -- een `exception` in een DO-blok draait
-- alles terug wat dat blok deed, en in plak 82 heeft dat een geslaagde
-- ALTER stilletjes ongedaan gemaakt terwijl het rapport "ok" zei. Het
-- rapport onderaan leest daarom uit de database, niet uit een teller.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak85 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak85;

-- ── 1a. de clawback-trigger op terugbetalingen ───────────────────────
do $blk0$
begin
  drop trigger if exists trg_clawback_wallet_refund on public.wallet_refunds;
  create trigger trg_clawback_wallet_refund
    after update on public.wallet_refunds
    for each row execute function public._clawback_on_wallet_refund();
  insert into _plak85 values (1, 'clawback bij een terugbetaling', 'trigger geplaatst');
exception when others then
  insert into _plak85 values (1, 'clawback bij een terugbetaling',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 1b. en op opnames van een ad-account ─────────────────────────────
do $blk1$
begin
  drop trigger if exists trg_clawback_ad_account_withdrawal
    on public.ad_account_withdrawals;
  create trigger trg_clawback_ad_account_withdrawal
    after update on public.ad_account_withdrawals
    for each row execute function public._clawback_on_ad_account_withdrawal();
  insert into _plak85 values (2, 'clawback bij een opname', 'trigger geplaatst');
exception when others then
  insert into _plak85 values (2, 'clawback bij een opname',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. voltooien gaat voortaan ook via de server ─────────────────────
--
-- Dezelfde poort die afwijzen al dicht heeft. De tekst blijft in de
-- taal van de bestaande trigger.
do $blk2$
begin
  create or replace function public._guard_ad_account_requests_session_write()
  returns trigger
  language plpgsql
  set search_path to 'public'
  as $fn$
  declare
    v_allowed text[] := array['status', 'rejection_reason', 'notes', 'updated_at'];
  begin
    if current_user <> 'authenticated' then
      return new;
    end if;

    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'ad_account_requests: alleen status, rejection_reason en notes zijn vanaf een sessie te schrijven'
        using errcode = '42501';
    end if;

    -- De eigenaar mag terug. Een aanvraag die op 'completed' bleef staan
    -- zonder dat er een account was, hield de EUR 50 vast; afwijzen
    -- weigert een voltooide aanvraag en deze poort sloot voor iedereen
    -- de weg terug. Een admin blijft buiten.
    if new.status is distinct from old.status
       and coalesce(old.status, '') in ('completed', 'rejected')
       and not public._is_tenant_owner(new.tenant_id) then
      raise exception 'ad_account_requests: een % aanvraag verzetten kan alleen de eigenaar', old.status
        using errcode = '42501';
    end if;

    if new.status = 'rejected' and coalesce(old.status, '') <> 'rejected' then
      raise exception 'ad_account_requests: afwijzen gaat via de server, niet vanaf een sessie'
        using errcode = '42501';
    end if;

    -- ── EN VOLTOOIEN OOK NIET ─────────────────────────────────────
    --
    -- Dit was het gat naast het vorige. `authenticated` heeft UPDATE op
    -- deze tabel en het RLS-beleid laat elke tenant-beheerder erbij, dus
    -- één PATCH met {"status":"completed"} zette een aanvraag op
    -- voltooid zonder dat createAdAccountFromRequest ooit draaide: geen
    -- ad-account, de EUR 50 gehouden, en de controle op een onbetaalde
    -- fee-factuur overgeslagen. Voltooien is precies zo'n stap als
    -- afwijzen -- hij hoort langs de server.
    if new.status = 'completed' and coalesce(old.status, '') <> 'completed' then
      raise exception 'ad_account_requests: voltooien gaat via de server, niet vanaf een sessie'
        using errcode = '42501';
    end if;

    return new;
  end;
  $fn$;

  revoke all on function public._guard_ad_account_requests_session_write()
    from public, anon;
  grant execute on function public._guard_ad_account_requests_session_write()
    to authenticated, service_role;

  insert into _plak85 values (
    3, 'voltooien kan niet meer vanaf een sessie', 'trigger-functie vervangen');
exception when others then
  insert into _plak85 values (3, 'voltooien kan niet meer vanaf een sessie',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 3. wallets.tenant_id vullen ──────────────────────────────────────
do $blk3$
declare
  v_adv  integer := 0;
  v_rest integer := 0;
begin
  update public.wallets w
     set tenant_id = a.tenant_id
    from public.advertisers a
   where a.id = w.advertiser_id
     and w.tenant_id is null
     and a.tenant_id is not null;
  get diagnostics v_adv = row_count;

  select count(*) into v_rest from public.wallets where tenant_id is null;

  insert into _plak85 values (
    4, 'wallets.tenant_id vullen',
    v_adv || ' via de adverteerder; ' || v_rest || ' nog leeg' ||
    case when v_rest > 0
      then ' (dat zijn portemonnees zonder adverteerder — zie het rapport hieronder)'
      else '' end);
exception when others then
  insert into _plak85 values (4, 'wallets.tenant_id vullen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 3b. en vastzetten, maar alleen als er echt niets meer leeg is ────
do $blk4$
declare
  v_rest integer;
begin
  select count(*) into v_rest from public.wallets where tenant_id is null;
  if v_rest > 0 then
    insert into _plak85 values (5, 'wallets.tenant_id vastzetten',
      'OVERGESLAGEN: er staan nog ' || v_rest ||
      ' portemonnee(s) zonder tenant. Die hebben ook geen adverteerder, dus er valt niets af te leiden — laat ze zien met de laatste regel van dit rapport en beslis wat ermee moet.');
    return;
  end if;
  alter table public.wallets alter column tenant_id set not null;
  insert into _plak85 values (5, 'wallets.tenant_id vastzetten', 'NOT NULL gezet');
exception when others then
  insert into _plak85 values (5, 'wallets.tenant_id vastzetten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── controle: uit de database ────────────────────────────────────────
do $blk5$
declare
  v_trg  integer;
  v_null integer;
  v_nn   boolean;
begin
  select count(*) into v_trg
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and p.proname ilike '%claw%';

  select count(*) into v_null from public.wallets where tenant_id is null;

  select a.attnotnull into v_nn
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'wallets'
     and a.attname = 'tenant_id';

  insert into _plak85 values (
    6, 'stand van zaken',
    v_trg || ' clawback-trigger(s) aanwezig (moet 2 zijn), ' ||
    v_null || ' portemonnee(s) zonder tenant, NOT NULL = ' ||
    coalesce(v_nn::text, '?'));
exception when others then
  insert into _plak85 values (6, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- Welke portemonnees dan nog leeg zijn, als dat er zijn.
do $blk6$
declare
  v text;
begin
  select coalesce(string_agg(
           'wallet ' || left(id::text, 8) ||
           ' (advertiser ' || coalesce(left(advertiser_id::text, 8), 'geen') ||
           ', eur ' || coalesce(eur_balance::text, '0') ||
           ', usd ' || coalesce(usd_balance::text, '0') || ')', ' | '), 'geen')
    into v
    from public.wallets where tenant_id is null;
  insert into _plak85 values (7, 'portemonnees zonder tenant', v);
exception when others then
  insert into _plak85 values (7, 'portemonnees zonder tenant', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk6$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak85 order by n;
