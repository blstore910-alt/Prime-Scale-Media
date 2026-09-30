-- ════════════════════════════════════════════════════════════════════
-- PLAK 161 — EEN WALLET KAN NIET ONDER NUL
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "hoe zit het met mensen die tegelijk op 1
-- affiliate acc of adv account zitten en dan handelingen tegelijk per
-- ongeluk doen?"
--
-- Goede vraag, en het antwoord is niet overal hetzelfde.
--
-- ── DE BEHEERKANT IS GEDEKT ───────────────────────────────────────
--
-- Gemeten: elke beslissing die geld verplaatst zet `for update` op de
-- rij voordat hij hem aanraakt --
-- `ad_account_withdrawal_approve`, `affiliate_payout_decide`,
-- `invoice_pay_from_wallet`, `wallet_topup_admin_verify`. Twee admins
-- die op hetzelfde moment klikken: de tweede wacht, ziet dat de rij
-- niet meer `pending` is, en krijgt een nette weigering. Daar is niets
-- aan te doen.
--
-- ── DE KLANTKANT NIET ─────────────────────────────────────────────
--
-- `wallet_exchange` zet GEEN lock. Hij schrijft wel relatief
-- (`balance = balance - x`), dus er gaat geen bedrag verloren -- maar
-- de CONTROLE racet. Twee mensen op hetzelfde account die allebei
-- EUR 80 wisselen op een saldo van EUR 100:
--
--   sessie A leest 100, vindt 80 <= 100, gaat door
--   sessie B leest 100, vindt 80 <= 100, gaat door
--   A schrijft 100 - 80 = 20
--   B schrijft  20 - 80 = -60
--
-- Rekenkundig klopt het eindbedrag. Er is alleen EUR 60 uitgegeven
-- die er niet was. En er staat vandaag **geen enkele CHECK op
-- `wallets`** (gemeten), dus niets ving dat op.
--
-- ── WAAROM EEN CHECK EN NIET EEN LOCK ─────────────────────────────
--
-- Een lock in `wallet_exchange` lost dat ene geval op. Een CHECK op
-- de tabel ligt onder ALLES: elke functie die er nu is, elke functie
-- die er nog komt, en elke UPDATE die met de hand in de SQL-editor
-- wordt geplakt. Dat laatste is in dit project geen randgeval maar de
-- normale weg voor een migratie.
--
-- En de richting van de fout is goed: bij een race faalt de tweede
-- transactie met een constraint-fout in plaats van stilletijgend geld
-- te scheppen. Lelijk voor die ene klik, veilig voor het geld. De
-- lock in `wallet_exchange` maakt die fout later netjes -- dat is een
-- volgende plak en geen reden om de ondergrens uit te stellen.
--
-- ── WAAROM DIT VANDAAG KAN ────────────────────────────────────────
--
-- Gemeten vlak voor het schrijven van deze plak:
--
--   wallets met een negatief saldo        0
--   laagste EUR-saldo                     0
--   laagste USD-saldo                     0
--   openstaande voorschotten (precharge)  0
--   kolomtype                             numeric  (niet meer `real`)
--
-- En `wallet_precharge_cancel` -- de enige plek die een saldo
-- OMLAAG duwt na een correctie -- weigert al met een eigen
-- foutmelding voordat hij aftrekt. De constraint spreekt die code dus
-- niet tegen; hij zet er een vangnet onder.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
declare
  v_neg int;
begin
  -- Nooit een constraint toevoegen over data die hem al breekt: dan
  -- faalt de hele plak en weet je niet hoeveel er nog goed ging.
  select count(*) into v_neg
    from public.wallets
   where coalesce(eur_balance, 0) < 0 or coalesce(usd_balance, 0) < 0;

  if v_neg > 0 then
    raise exception
      'Er staan % wallets met een negatief saldo. Die eerst uitzoeken -- '
      'een ondergrens eronder leggen verbergt ze alleen.', v_neg;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.wallets'::regclass
       and conname = 'wallets_balance_not_negative'
  ) then
    alter table public.wallets
      add constraint wallets_balance_not_negative
      check (coalesce(eur_balance, 0) >= 0 and coalesce(usd_balance, 0) >= 0);
  end if;
end
$blk0$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `ondergrens` hoort 1 te zijn en `negatief_nu` 0.
select
  'plak 161 geplaatst'                                          as wat,
  (select count(*)::text from pg_constraint
    where conrelid = 'public.wallets'::regclass
      and conname = 'wallets_balance_not_negative')             as ondergrens,
  (select count(*)::text from public.wallets
    where coalesce(eur_balance,0) < 0 or coalesce(usd_balance,0) < 0)
                                                                as negatief_nu,
  (select count(*)::text from public.wallets)                   as wallets_totaal,
  'wallet_exchange mist nog een for-update lock -- volgende plak'
                                                                as nog_te_doen;
