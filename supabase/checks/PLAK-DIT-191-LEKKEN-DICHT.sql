-- ════════════════════════════════════════════════════════════════════
-- PLAK 191 -- lekcontrole 01-10: wat een klant uit de database kon lezen
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "geen enkele advertiser of affiliate mag HK,
-- RockAds, SeamX, Falkyn of onze interne afkortingen voor ad accounts
-- zien, behalve admins." Drie agents liepen de code en de live database
-- na. Dit dicht wat in de DATABASE zat:
--
--   1. bank_accounts was leesbaar voor IEDEREEN in de tenant (ook
--      klanten en affiliates): labels met "Slash", notities, en welk
--      accounttype naar welke bank gaat. Nu alleen admins. (De klant las
--      hem in de praktijk niet: zijn top-up-dialoog krijgt een lege lijst
--      en valt terug op de ingebouwde gegevens -- er verandert voor hem
--      niets.)
--   2. Het label met "Slash" hernoemd.
--   3. Twee meldingen "ad account ready" droegen platform =
--      "eu-meta-psm" in hun data. De code schrijft het niet meer; hier
--      gaat het uit de bestaande rijen.
--
-- Twee keer plakken kan.

do $blk0$
begin
  drop policy if exists bank_accounts_read on public.bank_accounts;
  create policy bank_accounts_read on public.bank_accounts
    for select to authenticated
    using (public._is_admin_of(tenant_id));

  update public.bank_accounts
     set label = replace(label, 'Slash / ', '')
   where label ilike '%slash / %';

  update public.notifications
     set payload = payload - 'platform'
   where type = 'ad_account_request_approved'
     and payload ? 'platform';
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select qual from pg_policies where tablename = 'bank_accounts' and policyname = 'bank_accounts_read') as leesregel,
  (select count(*) from public.bank_accounts where label ilike '%slash%')                                 as labels_met_slash,
  (select count(*) from public.notifications where type = 'ad_account_request_approved' and payload ? 'platform') as meldingen_met_type;
