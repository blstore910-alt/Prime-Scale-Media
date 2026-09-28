-- ════════════════════════════════════════════════════════════════════
-- PLAK 125 — HET GROOTBOEK
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 28-09, twee keer: "en waar is ons grootboek" en "zonder
-- dat was het niet compleet qua geld management".
--
-- Klopt, en het bestond niet. Gemeten vandaag: `wallets` heeft negen
-- kolommen, waarvan twee een SALDO zijn (`eur_balance`, `usd_balance`),
-- en dat saldo wordt ter plekke opgehoogd en verlaagd. De BEWEGINGEN
-- liggen verspreid over acht tabellen -- wallet_topups,
-- wallet_adjustments, wallet_exchanges, wallet_precharges,
-- wallet_refunds, top_ups, ad_account_withdrawals, invoices -- elk met
-- een eigen vorm. `bank_ledger_entries` bestaat wel maar is iets anders
-- (onze eigen bankrekeningen) en staat op nul rijen.
--
-- Gevolg: gaat er ooit één saldo fout, dan kunnen we niet BEWIJZEN wat
-- het had moeten zijn. Alleen reconstrueren uit `audit_events`, en
-- daarom bestaat `actions/wallet-recovery-actions.ts` -- een
-- reddingsboei, geen boekhouding.
--
-- ── HET ONTWERP ─────────────────────────────────────────────────────
--
-- EEN append-only tabel. Per beweging één regel, met het saldo ervoor
-- en erna, zodat elke regel zichzelf controleert.
--
-- GESCHREVEN DOOR EEN TRIGGER OP `wallets`, niet door de twaalf RPC's.
-- Dat is de kern. Een trigger op de saldokolommen ziet ELKE beweging --
-- ook die van een functie die iemand volgend jaar toevoegt en vergeet
-- aan te sluiten, ook een handmatige UPDATE in de SQL-editor.
-- Volledigheid vóór netheid.
--
-- DE REDEN KOMT ALS HINT. Elke money-RPC mag vóór zijn schrijf
-- `set local psm.ledger_source = 'topup_verify'` zetten (en
-- `psm.ledger_source_id`). De trigger leest die en zet hem in `source`.
-- Staat hij er niet, dan landt de regel alsnog met `source = 'unknown'`.
-- Een ontbrekende hint kost ons het WAAROM, nooit het DAT -- en
-- `where source = 'unknown'` is de werklijst die zichzelf bijhoudt.
--
-- ECHT APPEND-ONLY. Geen UPDATE- en DELETE-recht voor wie dan ook, plus
-- een trigger die het alsnog weigert, ook voor de service key en ook
-- voor de tabeleigenaar.
--
-- WAT HIER NIET IN ZIT: de backfill uit `audit_events`. De regels van
-- vóór vandaag bestaan niet en zijn niet uit het niets te maken. Een
-- beste-poging-backfill kan later, met `source = 'backfill'`, en die is
-- GEEN BEWIJS. Het grootboek is gezaghebbend vanaf het moment dat deze
-- plak draait, en geen seconde eerder. Daarom staat de starthoogte van
-- elke portemonnee er wel in, als één openingsregel per valuta: anders
-- klopt de controlesom vanaf dag één niet.
--
-- Er beweegt geen geld. Geen enkel saldo wordt aangeraakt.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak125 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak125;

-- ── 1. de tabel ─────────────────────────────────────────────────────
do $blk0$
begin
  if to_regclass('public.wallet_ledger') is not null then
    insert into _plak125 values (0, 'de tabel', 'bestond al -- niets gedaan');
    return;
  end if;

  create table public.wallet_ledger (
    id             uuid primary key default gen_random_uuid(),
    occurred_at    timestamptz not null default now(),
    tenant_id      uuid,
    advertiser_id  uuid,
    wallet_id      uuid not null,
    currency       text not null check (upper(currency) in ('EUR', 'USD')),
    -- Wat erbij kwam of eraf ging. Nooit nul: een beweging van nul is
    -- geen beweging, en de trigger schrijft die dan ook niet.
    delta          numeric(14,2) not null check (delta <> 0),
    balance_before numeric(14,2) not null,
    balance_after  numeric(14,2) not null,
    -- Waar de beweging vandaan kwam. 'unknown' als de RPC de hint nog
    -- niet zet -- dat is de werklijst, niet een fout.
    source         text not null default 'unknown',
    source_id      uuid,
    reason         text,
    actor_user_id  uuid,
    created_at     timestamptz not null default now(),
    -- Elke regel controleert zichzelf. Een regel die deze test niet
    -- doorstaat kan niet bestaan, dus de boeken kunnen niet stilletjes
    -- scheef gaan staan.
    constraint wallet_ledger_sluit check (
      round(balance_before + delta, 2) = round(balance_after, 2)
    )
  );

  create index wallet_ledger_wallet_idx
    on public.wallet_ledger (wallet_id, currency, occurred_at);
  create index wallet_ledger_tenant_idx
    on public.wallet_ledger (tenant_id, occurred_at desc);
  -- De werklijst van RPC's die hun hint nog niet zetten.
  create index wallet_ledger_source_idx
    on public.wallet_ledger (source) where source = 'unknown';

  -- CLAUDE.md: Supabase geeft `anon` standaard arwdDxtm op alles wat in
  -- public wordt gemaakt. Dus in hetzelfde blok eraf.
  alter table public.wallet_ledger enable row level security;
  revoke all on public.wallet_ledger from anon, public;
  -- AND from authenticated, which the line above does NOT reach: that
  -- role gets its rights from Supabase DEFAULT PRIVILEGES, not from
  -- PUBLIC, and the grants below add rather than replace. Plak 130 had
  -- to come back for exactly this.
  revoke insert, update, delete, truncate on public.wallet_ledger from authenticated;
  -- Alleen LEZEN, en alleen wat van jou is of wat je als beheerder mag
  -- zien. Schrijven doet uitsluitend de trigger (SECURITY DEFINER).
  grant select on public.wallet_ledger to authenticated;
  grant select, insert on public.wallet_ledger to service_role;

  insert into _plak125 values (0, 'de tabel',
    'wallet_ledger aangemaakt, RLS aan, anon eraf');
exception when others then
  insert into _plak125 values (0, 'de tabel', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. wie mag hem lezen ────────────────────────────────────────────
do $blk1$
begin
  drop policy if exists wallet_ledger_select on public.wallet_ledger;
  create policy wallet_ledger_select on public.wallet_ledger
    for select to authenticated
    using (
      exists (
        select 1 from public.wallets w
         where w.id = wallet_ledger.wallet_id
           and (
             public._is_admin_of(w.tenant_id)
             or exists (
               select 1 from public.advertisers a
                where a.id = w.advertiser_id
                  and a.user_id = auth.uid()
             )
           )
      )
    );

  insert into _plak125 values (1, 'wie mag lezen',
    'de eigen klant en een beheerder van die tenant; anon niets');
exception when others then
  insert into _plak125 values (1, 'wie mag lezen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. append-only, ook voor de service key ─────────────────────────
do $blk2$
begin
  create or replace function public._wallet_ledger_append_only()
  returns trigger
  language plpgsql
  as $fn$
  begin
    -- Een grootboek waar een regel uit kan verdwijnen is geen
    -- grootboek. Dit weigert het ook voor service_role en voor de
    -- eigenaar van de tabel, zodat er geen "even snel" bestaat.
    raise exception 'wallet_ledger is append-only: a line cannot be changed or removed (tried %)', tg_op
      using errcode = '42501';
  end;
  $fn$;

  drop trigger if exists wallet_ledger_no_change on public.wallet_ledger;
  create trigger wallet_ledger_no_change
    before update or delete or truncate on public.wallet_ledger
    for each statement execute function public._wallet_ledger_append_only();

  revoke all on function public._wallet_ledger_append_only() from public, anon;

  insert into _plak125 values (2, 'append-only',
    'wijzigen, verwijderen en legen worden geweigerd');
exception when others then
  insert into _plak125 values (2, 'append-only', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. de trigger die elke beweging ziet ────────────────────────────
do $blk3$
begin
  create or replace function public._wallet_ledger_record()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_src  text;
    v_sid  text;
    v_rsn  text;
  begin
    -- De hint. `current_setting(..., true)` geeft null in plaats van te
    -- gooien als hij niet gezet is, dus een RPC die hem nog niet zet
    -- breekt hier niet.
    v_src := nullif(btrim(coalesce(current_setting('psm.ledger_source', true), '')), '');
    v_sid := nullif(btrim(coalesce(current_setting('psm.ledger_source_id', true), '')), '');
    v_rsn := nullif(btrim(coalesce(current_setting('psm.ledger_reason', true), '')), '');

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

  -- AFTER, zodat een geweigerde saldowijziging geen regel achterlaat.
  drop trigger if exists wallet_ledger_record on public.wallets;
  create trigger wallet_ledger_record
    after update of eur_balance, usd_balance on public.wallets
    for each row execute function public._wallet_ledger_record();

  insert into _plak125 values (3, 'de trigger',
    'elke saldowijziging op wallets schrijft nu een regel');
exception when others then
  insert into _plak125 values (3, 'de trigger', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 5. de openingsstand ─────────────────────────────────────────────
do $blk4$
declare
  v_n integer := 0;
begin
  -- Zonder dit klopt de controlesom vanaf dag één niet, want de
  -- saldi die er NU staan zijn door bewegingen ontstaan die geen regel
  -- hebben. Eén openingsregel per portemonnee per valuta, eerlijk
  -- gemerkt: dit is geen bewijs van iets, het is het startpunt.
  if exists (select 1 from public.wallet_ledger where source = 'opening') then
    insert into _plak125 values (4, 'de openingsstand', 'stond er al -- niets gedaan');
    return;
  end if;

  insert into public.wallet_ledger
    (occurred_at, tenant_id, advertiser_id, wallet_id, currency, delta,
     balance_before, balance_after, source, reason)
  select now(), w.tenant_id, w.advertiser_id, w.id, 'EUR',
         round(w.eur_balance, 2), 0, round(w.eur_balance, 2), 'opening',
         'Stand bij het aanzetten van het grootboek. Niet uit bewegingen opgebouwd.'
    from public.wallets w
   where coalesce(w.eur_balance, 0) <> 0;
  get diagnostics v_n = row_count;

  insert into public.wallet_ledger
    (occurred_at, tenant_id, advertiser_id, wallet_id, currency, delta,
     balance_before, balance_after, source, reason)
  select now(), w.tenant_id, w.advertiser_id, w.id, 'USD',
         round(w.usd_balance, 2), 0, round(w.usd_balance, 2), 'opening',
         'Stand bij het aanzetten van het grootboek. Niet uit bewegingen opgebouwd.'
    from public.wallets w
   where coalesce(w.usd_balance, 0) <> 0;

  insert into _plak125 values (4, 'de openingsstand',
    (select count(*) from public.wallet_ledger where source = 'opening')
    || ' openingsregel(s) -- gemerkt als opening, geen bewijs van herkomst');
exception when others then
  insert into _plak125 values (4, 'de openingsstand', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── 6. de controle die er de hele tijd bij hoort ────────────────────
do $blk5$
declare
  v_scheef integer;
  v_regels integer;
  v_trg    integer;
begin
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

  select count(*) into v_regels from public.wallet_ledger;

  select count(*) into v_trg from pg_trigger
   where tgname in ('wallet_ledger_record', 'wallet_ledger_no_change')
     and not tgisinternal;

  insert into _plak125 values (5, 'de controlesom',
    'portemonnees waar de boeken niet kloppen: ' || v_scheef || ' (moet 0)'
    || ' | regels in het grootboek: ' || v_regels
    || ' | triggers aan: ' || v_trg || ' van 2');
  insert into _plak125 values (6, 'nog zonder reden',
    (select count(*) from public.wallet_ledger where source = 'unknown')
    || ' regel(s) met source = unknown -- dat is de werklijst, geen fout');
exception when others then
  insert into _plak125 values (5, 'de controlesom', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak125 order by n;
