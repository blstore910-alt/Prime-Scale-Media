-- ════════════════════════════════════════════════════════════════════
-- PLAK 158 — EEN UITBETALING OVERLEEFT ZIJN AFFILIATE
-- ════════════════════════════════════════════════════════════════════
--
-- Plak 152 deed dit voor `referral_commissions`: de verdiende commissie
-- blijft staan als de affiliate verdwijnt, met zijn naam en code op de
-- regel zelf. Wat die plak NIET heeft aangeraakt is de tabel ernaast,
-- en dat is precies de tabel waar het geld al uit is.
--
-- Gemeten vandaag, 29-09:
--
--   affiliate_payouts.affiliate_advertiser_id
--     uuid NOT NULL references advertisers(id) ON DELETE CASCADE
--
--   status 'paid'      3 stuks   EUR 95,92   -- overgemaakt
--   status 'rejected'  1 stuk    EUR 75,00
--
-- CASCADE. Eén affiliate weghalen en drie overboekingen die echt hebben
-- plaatsgevonden zijn er niet meer. Geen wees, geen lege kolom, geen
-- foutmelding -- de rijen zijn weg, en met blok 15 voor de deur is dat
-- geen theorie maar volgende week.
--
-- En het is erger dan een wees, want dit is de kant van het geld die
-- naar BUITEN is gegaan. Een commissie die verdwijnt kost ons een
-- schuld die we niet meer zien. Een uitbetaling die verdwijnt kost ons
-- het bewijs dat we al betaald hebben -- en de commissies eronder staan
-- dankzij plak 152 nog wél overeind, zonder de uitbetaling die ze
-- afboekte. Dan staat er dus opnieuw open wat al over is gemaakt.
--
-- ── WAT DIT DOET, IN DE VOLGORDE DIE ERTOE DOET ───────────────────
--
-- 1. `affiliate_code` en `affiliate_name` op de rij, en meteen gevuld
--    -- NU, terwijl de verwijzing nog iets oplevert. Daarna kan het
--    niet meer.
-- 2. NOT NULL eraf. Een uitbetaling zonder affiliate moet kunnen
--    bestaan, anders kan SET NULL niet.
-- 3. De FK van CASCADE naar SET NULL.
--
-- `tenant_id` blijft CASCADE en dat hoort zo: gaat de hele tenant weg,
-- dan gaat alles weg.
--
-- ── ÉÉN DING DAT DIT NIET REPAREERT ───────────────────────────────
--
-- Het scherm. `components/affiliate/payout-queue.tsx` leest de naam uit
-- de affiliate-lijst, en die lijst wordt opgebouwd uit links die wél
-- casqueren -- dus na een verwijdering staat er "Affiliate · " met een
-- lege code, op het venster waar een eigenaar een overboeking
-- bevestigt. Die kant zit in de code en gaat mee met de volgende push.
-- Deze plak zorgt dat de gegevens er dan nog zijn om te tonen.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
begin
  -- ── 1. DE IDENTITEIT OP DE RIJ ZELF ───────────────────────────
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='affiliate_payouts'
       and column_name='affiliate_code'
  ) then
    alter table public.affiliate_payouts add column affiliate_code text;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='affiliate_payouts'
       and column_name='affiliate_name'
  ) then
    alter table public.affiliate_payouts add column affiliate_name text;
  end if;
end
$blk0$;

-- Vullen zolang het nog kan. Buiten het do-blok, zodat een mislukte
-- backfill zichtbaar is in plaats van stil.
update public.affiliate_payouts p
   set affiliate_code = coalesce(p.affiliate_code, a.tenant_client_code),
       affiliate_name = coalesce(p.affiliate_name,
                                 nullif(trim(coalesce(u.full_name, '')), ''),
                                 u.email)
  from public.advertisers a
  left join public.user_profiles u on u.id = a.profile_id
 where a.id = p.affiliate_advertiser_id
   and (p.affiliate_code is null or p.affiliate_name is null);

do $blk1$
begin
  -- ── 2. NOT NULL ERAF ──────────────────────────────────────────
  -- Zonder dit kan SET NULL niet: Postgres weigert een FK-regel die
  -- een kolom leeg zou moeten maken die niet leeg mag zijn.
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='affiliate_payouts'
       and column_name='affiliate_advertiser_id' and is_nullable='NO'
  ) then
    alter table public.affiliate_payouts
      alter column affiliate_advertiser_id drop not null;
  end if;

  -- ── 3. CASCADE -> SET NULL ────────────────────────────────────
  if exists (
    select 1 from pg_constraint
     where conrelid='public.affiliate_payouts'::regclass
       and conname='affiliate_payouts_affiliate_advertiser_id_fkey'
       and confdeltype = 'c'
  ) then
    alter table public.affiliate_payouts
      drop constraint affiliate_payouts_affiliate_advertiser_id_fkey;
    alter table public.affiliate_payouts
      add constraint affiliate_payouts_affiliate_advertiser_id_fkey
      foreign key (affiliate_advertiser_id)
      references public.advertisers(id) on delete set null;
  end if;
end
$blk1$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `regel` hoort 'n' te zijn (SET NULL). `zonder_naam` hoort 0 te zijn:
-- elke uitbetaling draagt nu zijn eigen identiteit.
select
  'plak 158 geplaatst'                                           as wat,
  (select confdeltype::text from pg_constraint
    where conrelid='public.affiliate_payouts'::regclass
      and conname='affiliate_payouts_affiliate_advertiser_id_fkey') as regel,
  (select is_nullable from information_schema.columns
    where table_schema='public' and table_name='affiliate_payouts'
      and column_name='affiliate_advertiser_id')                 as mag_leeg,
  (select count(*)::text from public.affiliate_payouts)          as uitbetalingen,
  (select count(*)::text from public.affiliate_payouts
    where affiliate_code is null or affiliate_name is null)      as zonder_naam,
  (select coalesce(sum(amount),0)::text from public.affiliate_payouts
    where status = 'paid')                                       as al_betaald;
