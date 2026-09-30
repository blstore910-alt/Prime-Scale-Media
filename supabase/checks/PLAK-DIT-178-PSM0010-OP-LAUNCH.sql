-- ════════════════════════════════════════════════════════════════════
-- PLAK 178 — PSM0010 OP LAUNCH, VOOR ZIJN EIGEN EUR 10
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09: "10 euro per maand, noem hem gewoon Launch."
--
-- PSM0010 was de laatste met een abonnement zonder plan (zie plak 172):
-- EUR 10 per maand, actief, en die prijs staat niet in de catalogus.
-- Plak 172 liet hem met opzet open, omdat welk plan bij een eigen prijs
-- hoort een beslissing is en geen rekensom.
--
-- ── HET PLAN EN DE PRIJS ZIJN TWEE DINGEN ─────────────────────────
--
-- Launch kost in de catalogus EUR 150. PSM0010 betaalt EUR 10. Dat
-- mag verschillen, en zo is het sinds vandaag ook in het
-- abonnementsscherm gebouwd:
--
--   het PLAN   bepaalt wat er inbegrepen is -- 1 ad-account, 3,50%
--              opwaardeerfee
--   het BEDRAG bepaalt wat hij betaalt -- EUR 10, en dat verandert
--              hier niet
--
-- `advertiser_plans.monthly_fee` is het tarief van DEZE klant, niet de
-- catalogusprijs -- daarom staat er 10 en geen 150. Zijn abonnement
-- (`subscriptions.amount`) wordt niet aangeraakt.
--
-- Wat er voor hem verandert: hij heeft nu 1 ad-account inbegrepen en
-- een opwaardeerfee van 3,50%. Tot vandaag had hij geen van beide
-- vastgelegd, en viel de app ergens anders op terug.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk1$
declare v_adv uuid; v_tenant uuid; v_plan record;
begin
  select a.id, a.tenant_id into v_adv, v_tenant
    from public.advertisers a where a.tenant_client_code = 'PSM0010';
  if v_adv is null then
    raise exception 'PSM0010 niet gevonden';
  end if;

  select p.id, p.currency, p.included_ad_accounts, p.topup_fee_pct
    into v_plan
    from public.plans p
   where p.tenant_id = v_tenant and p.name = 'Launch' and p.is_active
   limit 1;
  if v_plan.id is null then
    raise exception 'Geen actief plan Launch op deze tenant';
  end if;

  if exists (select 1 from public.advertiser_plans where advertiser_id = v_adv) then
    raise notice 'PSM0010 heeft al een plan -- niets gedaan';
    return;
  end if;

  insert into public.advertiser_plans
    (advertiser_id, tenant_id, plan_id, monthly_fee, plan_currency,
     included_ad_accounts, topup_fee_pct)
  values
    (v_adv, v_tenant, v_plan.id, 10.00, v_plan.currency,
     v_plan.included_ad_accounts, v_plan.topup_fee_pct);
end
$blk1$;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
--   plan               hoort Launch
--   eigen_tarief       hoort 10.00  (niet 150)
--   abonnement         hoort nog steeds 10.00 -- niet aangeraakt
--   zonder_plan_nu     hoort 0 -- elk lopend abonnement heeft er een
select
  'plak 178 geplaatst'                                             as wat,
  (select p.name from public.advertiser_plans ap
     join public.plans p on p.id = ap.plan_id
     join public.advertisers a on a.id = ap.advertiser_id
    where a.tenant_client_code = 'PSM0010')                        as plan,
  (select ap.monthly_fee::text from public.advertiser_plans ap
     join public.advertisers a on a.id = ap.advertiser_id
    where a.tenant_client_code = 'PSM0010')                        as eigen_tarief,
  (select s.amount::text from public.subscriptions s
     join public.advertisers a on a.id = s.advertiser_id
    where a.tenant_client_code = 'PSM0010')                        as abonnement,
  (select count(*)::text from public.subscriptions s
     join public.advertisers a on a.id = s.advertiser_id
     left join public.advertiser_plans ap on ap.advertiser_id = a.id
    where ap.advertiser_id is null and s.status <> 'cancelled')    as zonder_plan_nu;
