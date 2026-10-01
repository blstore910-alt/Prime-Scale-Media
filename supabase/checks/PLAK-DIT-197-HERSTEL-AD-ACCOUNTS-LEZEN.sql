-- ════════════════════════════════════════════════════════════════════
-- PLAK 197 -- SPOED: klanten mogen hun eigen ad accounts weer lezen
-- ════════════════════════════════════════════════════════════════════
--
-- Plak 192 haalde de twee leesregels voor klanten op ad_accounts weg
-- (lekcontrole L1). Het scherm las al via my_ad_accounts, maar ruim tien
-- SERVERACTIES lezen ad_accounts nog met de rechten van de klant: de
-- fee-berekening bij funden ("That ad account was not found"),
-- terugboeken, het financieel rapport. Die vonden niets meer.
--
-- Deze plak zet precies de twee oude regels terug, zodat alles meteen weer
-- werkt. De serveracties gaan daarna over op een eigen, gecontroleerde
-- lees; pas dan gaan deze regels opnieuw dicht (een volgende plak).
--
-- Twee keer plakken kan.

do $blk0$
begin
  drop policy if exists "Enable select for advertisers" on public.ad_accounts;
  create policy "Enable select for advertisers" on public.ad_accounts
    for select to authenticated
    using (exists (
      select 1 from public.advertisers a
       where a.id = ad_accounts.advertiser_id
         and a.user_id = auth.uid()
    ));

  drop policy if exists ad_accounts_team_read on public.ad_accounts;
  create policy ad_accounts_team_read on public.ad_accounts
    for select to authenticated
    using (public._psm_member_of('advertiser', advertiser_id));
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select count(*) as regels_op_ad_accounts_moet_3
  from pg_policies where tablename = 'ad_accounts';
