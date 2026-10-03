-- ════════════════════════════════════════════════════════════════════
-- PLAK 207 -- Test 4 R9: affiliate T4-F over het uitbetaalminimum
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 03-10: "cross it". T4-F (PSM0028) staat op EUR 75,43
-- open (75,00 abonnement + 0,64 top-up - 0,21 clawback); het minimum voor
-- een uitbetaling is EUR 200. Een eenmalige TEST-commissie van EUR 130 op
-- de koppeling T4-F -> T4-R zet hem op EUR 205,43, zodat R9 de hele route
-- kan lopen: T4-F vraagt uit, beheer betaalt uit / weist af.
--
-- Alleen dit testaccount. Duidelijk gemerkt (type 'manual', source
-- 'adjustment', note). De audit-trigger op referral_commissions legt hem
-- vast. Niet twee keer plakken: de tweede keer telt er nog 130 bij --
-- daarom staat er een poort op de note.

do $blk0$
declare
  v_link uuid := 'df47ae89-3b80-4d5b-b2d7-df24154e608d';   -- T4-F -> T4-R
  v_tenant uuid;
begin
  if exists (select 1 from public.referral_commissions
              where referral_link_id = v_link and note = 'Test 4 R9: over het uitbetaalminimum') then
    raise notice 'al geplakt -- niets gedaan';
    return;
  end if;
  select tenant_id into v_tenant from public.referral_links where id = v_link;
  insert into public.referral_commissions
    (referral_link_id, tenant_id, type, source, amount, currency, status, note)
  values
    (v_link, v_tenant, 'manual', 'adjustment', 130.00, 'EUR', 'unpaid', 'Test 4 R9: over het uitbetaalminimum');
  perform public._referral_link_earnings_add(v_link, 'EUR', 130.00);
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select round(coalesce(sum(rc.amount), 0)
               - coalesce((select sum(cb.amount) from public.referral_clawbacks cb
                            where cb.referral_link_id = 'df47ae89-3b80-4d5b-b2d7-df24154e608d' and cb.payout_id is null), 0), 2)
     from public.referral_commissions rc
    where rc.referral_link_id = 'df47ae89-3b80-4d5b-b2d7-df24154e608d'
      and coalesce(rc.status, 'unpaid') = 'unpaid' and rc.payout_id is null) as open_moet_205_43,
  (select earnings_eur from public.referral_links where id = 'df47ae89-3b80-4d5b-b2d7-df24154e608d') as earnings_moet_205_43;
