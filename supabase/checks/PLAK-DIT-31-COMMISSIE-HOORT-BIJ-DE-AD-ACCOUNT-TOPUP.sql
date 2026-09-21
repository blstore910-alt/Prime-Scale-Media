-- =====================================================================
-- PLAK 31 — commissie hoort bij de AD-ACCOUNT-topup
-- =====================================================================
-- Gelopen op productie: PSM0007 stortte EUR 100 in zijn wallet, de
-- eigenaar verifieerde, het saldo staat op EUR 100,00 -- en er ontstond
-- geen commissie. Plak 30 laat zien waarom, en het zijn twee dingen
-- tegelijk.
--
-- ── 1. DE WALLET-TRIGGER HOORT ER NIET TE ZIJN ──────────────────────
--
-- `_accrue_referral_commission` hangt op `wallet_topups` en HAD hier
-- moeten boeken: hij accepteert type 'pct', de link staat op 'pct' met
-- 10%, en 100 x 10 / 100 = 10,00. Hij deed het niet, en dat kan omdat
-- zijn hele blok in
--
--     exception when others then raise warning
--
-- zit. Wat er ook misging -- hij schrijft `type = 'percentage'` terwijl
-- de andere trigger en de enige rij in de tabel `pct` gebruiken -- het
-- verdween zonder dat er iets op een scherm kwam.
--
-- Dat hoeft niet uitgezocht te worden, want de regel is: commissie
-- ontstaat op wat er op een AD-ACCOUNT gezet wordt, niet op het vullen
-- van de wallet. Geld dat in een wallet staat is nog niet besteed. De
-- trigger gaat er dus af. De functie blijft bestaan en wordt alleen
-- niet meer aangeroepen; er wordt niets weggegooid.
--
-- ── 2. EN DE TRIGGER DIE HET WEL MOET DOEN HEEFT VIER GATEN ─────────
--
-- `handle_referral_commission_on_topup` op `top_ups` is de goede plek,
-- en zoals hij er staat:
--
--   a) FILTERT NIET OP DE STATUS VAN DE LINK.
--      `where referred_advertiser_id = NEW.advertiser_id limit 1`
--      Een AFGEWEZEN of nog openstaande link betaalt gewoon door. De
--      wallet-trigger doet dit wel goed. En `limit 1` zonder `order by`
--      pakt bij twee links een willekeurige.
--
--   b) KIJKT NIET OF DE TOPUP AF IS.
--      Voor 'pct' staat er geen enkele statuscontrole. Er wordt geboekt
--      op een bedrag waarvan nog niemand heeft vastgesteld dat het er
--      is.
--
--   c) REKENT IN `REAL`.
--      `v_amount REAL` -- geld in een zwevendekommagetal, in de kolom
--      waar een affiliate op uitbetaald wordt.
--
--   d) IS GEEN SECURITY DEFINER, EN DAT IS NU ACUUT.
--      Plak 27 heeft `insert` op `referral_commissions` ingetrokken van
--      `authenticated`. Deze trigger draait als de BELLER. Binnen
--      `top_up_admin_verify` (definer, eigenaar postgres) gaat dat goed,
--      maar `updateTopupAsAdmin` schrijft `top_ups` rechtstreeks met de
--      sessie van de admin -- en deze functie heeft GEEN exception-blok,
--      dus daar breekt de hele update op een geweigerde insert. Dat is
--      een gevolg van plak 27 en het moet in dezelfde beweging dicht.
--      Er staat ook geen `search_path` op, wat een trigger hoort te
--      hebben.
--
--   e) STEMPELT NEW.currency OVER EEN BEDRAG DAT DAT NIET HOEFT TE ZIJN.
--      `topup_amount` heeft twee betekenissen: op de KLANTroute het
--      netto in de BETAALvaluta, op de ADMINroutes dollars. De
--      discriminator is `topup_usd` -- lib/pure-topup-landed.ts. Een
--      adminrij in EUR-valuta draagt dollars in `topup_amount`, en die
--      werden als euro's geboekt.
--
-- ── WAT DIT NIET DOET ────────────────────────────────────────────────
--
-- De bedragen die al geboekt zijn blijven staan. Plak 30 telde 0
-- commissierijen, dus er is niets te herstellen -- maar de regel hoort
-- er te staan: wat op een rij staat waar geld op bewogen is, herschrijf
-- ik niet met een update.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _rc (k text, v text);
delete from _rc;

insert into _rc
select 'voor',
  coalesce((
    select string_agg(c.relname || ' :: ' || t.tgname || ' -> ' || p.proname,
                      E'\n' order by c.relname, t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
       and p.proname in ('_accrue_referral_commission',
                         'handle_referral_commission_on_topup')
  ), 'geen');

-- ── 1. De wallet-trigger eraf ────────────────────────────────────────
do $blk0$
begin
  execute 'drop trigger if exists trg_accrue_referral_commission on public.wallet_topups';
  insert into _rc values ('wallet', 'trigger verwijderd; de functie blijft bestaan');
exception when others then
  insert into _rc values ('wallet', 'MISLUKT: ' || sqlstate || ' ' || sqlerrm);
end;
$blk0$;

-- ── 2. De ad-account-trigger, gerepareerd ────────────────────────────
create or replace function public.handle_referral_commission_on_topup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_link            record;
  v_profile_status  text;
  v_done_count      int;
  v_amount          numeric;   -- NIET real: dit is geld
  v_type            text;
  v_landed          numeric;
  v_currency        text;
begin
  -- ── ALLEEN ALS DEZE TOPUP ECHT AF IS ──────────────────────────────
  -- Er stond geen enkele statuscontrole voor 'pct'. Zo wordt er geboekt
  -- op een bedrag waarvan nog niemand heeft vastgesteld dat het er is.
  if coalesce(new.status, '') <> 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.status, '') = 'completed' then
    return new;   -- was al af; niet nog een keer boeken
  end if;

  -- ── DE ACTIEVE LINK, DETERMINISTISCH ──────────────────────────────
  -- Dit had geen statusfilter, dus een AFGEWEZEN link betaalde door, en
  -- `limit 1` zonder `order by` pakte bij twee links een willekeurige.
  select rl.id, rl.tenant_id, rl.affiliate_advertiser_id,
         rl.commission_type, rl.commission_pct,
         rl.commission_onetime, rl.commission_currency
    into v_link
    from public.referral_links rl
   where rl.referred_advertiser_id = new.advertiser_id
     and coalesce(rl.status, 'active') = 'active'
   order by rl.created_at asc
   limit 1;
  if not found then
    return new;
  end if;

  if exists (
    select 1 from public.referral_commissions where topup_id = new.id
  ) then
    return new;
  end if;

  select up.status into v_profile_status
    from public.advertisers a
    join public.user_profiles up on up.id = a.profile_id
   where a.id = v_link.affiliate_advertiser_id
   limit 1;
  if v_profile_status is distinct from 'active' then
    return new;
  end if;

  if v_link.commission_type is null then
    return new;
  end if;

  select count(*) into v_done_count
    from public.top_ups
   where advertiser_id = new.advertiser_id
     and status = 'completed';

  -- ── WAT ER ECHT OP HET ACCOUNT LANDDE, EN IN WELKE MUNT ───────────
  -- `topup_amount` is het netto in de BETAALvaluta op de klantroute en
  -- dollars op de adminroutes; `topup_usd` is de discriminator. Dit
  -- stempelde altijd new.currency, dus een adminrij in een EUR-valuta
  -- boekte dollars als euro's.
  v_landed := coalesce(new.topup_amount, 0)::numeric;
  v_currency := case
    when new.topup_usd is not null then upper(coalesce(new.currency, 'EUR'))
    else 'USD'
  end;

  if v_link.commission_type in ('onetime', 'onetime_monthly') then
    if v_done_count = 1 then
      v_type := 'onetime';
      v_amount := round(coalesce(v_link.commission_onetime, 0)::numeric, 2);
      v_currency := upper(coalesce(v_link.commission_currency, v_currency));
    else
      return new;
    end if;

  elsif v_link.commission_type = 'onetime_pct' then
    if v_done_count = 1 then
      v_type := 'onetime';
      v_amount := round(coalesce(v_link.commission_onetime, 0)::numeric, 2);
      v_currency := upper(coalesce(v_link.commission_currency, v_currency));
    else
      v_type := 'pct';
      v_amount := round(coalesce(v_link.commission_pct, 0)::numeric / 100 * v_landed, 2);
    end if;

  elsif v_link.commission_type in ('monthly_pct', 'pct', 'percentage') then
    v_type := 'pct';
    v_amount := round(coalesce(v_link.commission_pct, 0)::numeric / 100 * v_landed, 2);

  else
    return new;
  end if;

  -- Een boeking van nul is geen boeking.
  if v_amount is null or v_amount <= 0 then
    return new;
  end if;

  insert into public.referral_commissions (
    referral_link_id, tenant_id, type, amount, currency, status, topup_id
  ) values (
    v_link.id, new.tenant_id, v_type, v_amount, v_currency, 'unpaid', new.id
  );

  -- De kolom die de adminlijst leest, mee bij.
  if v_currency = 'USD' then
    update public.referral_links
       set earnings_usd = coalesce(earnings_usd, 0) + v_amount
     where id = v_link.id;
  elsif v_currency = 'EUR' then
    update public.referral_links
       set earnings_eur = coalesce(earnings_eur, 0) + v_amount
     where id = v_link.id;
  end if;

  return new;
end;
$blk1$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select 1 as nr, 'accrual-triggers VOOR deze plak' as item,
  coalesce((select v from _rc where k = 'voor' limit 1), '?') as antwoord
union all
select 2, 'wallet-trigger', coalesce((select v from _rc where k = 'wallet' limit 1), '?')
union all
select 3, 'accrual-triggers NA deze plak (alleen top_ups hoort over)',
  coalesce((
    select string_agg(c.relname || ' :: ' || t.tgname || ' -> ' || p.proname,
                      E'\n' order by c.relname, t.tgname)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
       and p.proname in ('_accrue_referral_commission',
                         'handle_referral_commission_on_topup')
  ), 'geen')
union all
select 4, 'is de ad-account-trigger nu SECURITY DEFINER (plak 27 maakte dit acuut)',
  coalesce((
    select case when p.prosecdef then 'ja - definer, eigenaar ' || pg_get_userbyid(p.proowner)
                else 'NEE - zeg het meteen' end
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'handle_referral_commission_on_topup'
     limit 1
  ), 'functie niet gevonden')
union all
select 5, 'de vier gaten dicht',
  coalesce((
    select (case when position('coalesce(rl.status, ''active'') = ''active''' in d) > 0
                 then 'statusfilter:ja' else 'statusfilter:NEE' end) || ' | ' ||
           (case when position('<> ''completed''' in d) > 0
                 then 'alleen-af:ja' else 'alleen-af:NEE' end) || ' | ' ||
           (case when position('v_amount          numeric' in d) > 0
                 then 'numeric:ja' else 'numeric:NEE' end) || ' | ' ||
           (case when position('new.topup_usd is not null' in d) > 0
                 then 'valuta:ja' else 'valuta:NEE' end)
      from (select pg_get_functiondef(p.oid) as d
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname = 'handle_referral_commission_on_topup' limit 1) x
  ), 'functie niet gevonden')
union all
select 6, 'commissierijen die er staan (moet nog 0 zijn)',
  (select count(*)::text from public.referral_commissions)
union all
select 7, 'de link PSM0005 -> PSM0007 zoals hij nu staat',
  coalesce((
    select string_agg('status=' || coalesce(rl.status, 'null') ||
                      ' | type=' || coalesce(rl.commission_type::text, 'null') ||
                      ' | pct=' || coalesce(rl.commission_pct::text, 'null') ||
                      ' | earnings ' || coalesce(rl.earnings_eur::text, 'null') || ' EUR / ' ||
                      coalesce(rl.earnings_usd::text, 'null') || ' USD', E'\n')
      from public.referral_links rl
  ), 'geen links')
order by nr;
