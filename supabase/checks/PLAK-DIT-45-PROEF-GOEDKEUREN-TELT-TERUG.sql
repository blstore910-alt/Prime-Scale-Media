-- =====================================================================
-- PLAK 45 — PROEF: goedkeuren telt terug (alles wordt teruggedraaid)
-- =====================================================================
-- Plak 42 zegt: keurt de eigenaar een wachtende referral goed, dan wordt
-- ALLES wat die klant sinds de koppeling deed alsnog geboekt, met de
-- regels van nu. Dat bewijzen zonder echt geld te verplaatsen:
--
--   1. PSM0005 heeft echte voltooide fundings en een betaalde factuur
--      (A4/A5), en géén referrer.
--   2. Binnen een subtransactie: maak een WACHTENDE koppeling
--      "PSM0005 aangebracht door PSM0008", gedateerd vóór hun eerste
--      funding, en keur hem goed ALS DE EIGENAAR (referral_link_decide).
--   3. Lees wat er geboekt is, met de berekening per regel.
--   4. Draai ALLES terug (koppeling, commissies, meldingen).
--
-- Rij 4 bewijst dat er niets is blijven staan. Niets hier verplaatst geld.
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create temporary table if not exists _p45 (nr int, item text, v text);
delete from _p45;

do $blk0$
declare
  v_cust   record;
  v_aff    record;
  v_owner  uuid;
  v_first  timestamptz;
  v_link   uuid;
  v_res    jsonb;
  v_rows   text;
  v_src    text;
  v_err    text;
begin
  select a.id, a.tenant_id, a.user_id into v_cust
    from public.advertisers a where a.tenant_client_code = 'PSM0005' limit 1;
  select a.id, a.user_id into v_aff
    from public.advertisers a
   where a.tenant_client_code = 'PSM0008' and a.tenant_id = v_cust.tenant_id limit 1;
  if v_cust.id is null or v_aff.id is null then
    insert into _p45 values (1, 'proef', 'PSM0005 of PSM0008 niet gevonden — niets gedaan');
    return;
  end if;
  if exists (select 1 from public.referral_links where referred_advertiser_id = v_cust.id) then
    insert into _p45 values (1, 'proef', 'PSM0005 heeft al een koppeling — niets gedaan');
    return;
  end if;

  select t.owner_id into v_owner from public.tenants t where t.id = v_cust.tenant_id;
  select min(coalesce(t.verified_at, t.created_at)) into v_first
    from public.top_ups t
   where t.advertiser_id = v_cust.id and t.status = 'completed' and coalesce(t.is_deleted, false) = false;

  -- Wat er te boeken VALT: elke voltooide funding en betaalde abonnements-
  -- factuur van PSM0005 sinds (net vóór) de eerste funding.
  select string_agg(format('funding #%s %s %s: fee %s, geland %s',
                           lpad(coalesce(t.number::text, '?'), 6, '0'),
                           to_char(coalesce(t.verified_at, t.created_at), 'DD Mon HH24:MI'),
                           case when t.topup_usd is not null then upper(coalesce(t.currency, 'EUR')) else 'USD' end,
                           t.fee_amount, t.topup_amount), E'\n'
                    order by coalesce(t.verified_at, t.created_at))
    into v_src
    from public.top_ups t
   where t.advertiser_id = v_cust.id and t.status = 'completed' and coalesce(t.is_deleted, false) = false;
  insert into _p45 values (1, 'te boeken fundings van PSM0005', coalesce(v_src, 'geen'));

  select string_agg(format('factuur %s %s: sub_total %s, total %s, betaald %s',
                           coalesce(i.number::text, i.id::text), upper(coalesce(i.currency, 'EUR')),
                           i.sub_total, i.total, to_char(coalesce(i.paid_at, i.created_at), 'DD Mon HH24:MI')), E'\n')
    into v_src
    from public.invoices i
   where i.advertiser_id = v_cust.id and i.status = 'paid'
     and lower(coalesce(i.type, '')) in ('subscription', 'subscription_adjustment');
  insert into _p45 values (2, 'te boeken abonnementsfacturen van PSM0005', coalesce(v_src, 'geen'));

  begin
    -- De eigenaar is de beller: auth.uid() leest deze claims.
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    insert into public.referral_links
      (tenant_id, referred_advertiser_id, affiliate_advertiser_id,
       affiliate_user_id, advertiser_user_id, status, created_at)
    values
      (v_cust.tenant_id, v_cust.id, v_aff.id, v_aff.user_id, v_cust.user_id, 'pending',
       coalesce(v_first, now()) - interval '1 minute')
    returning id into v_link;

    v_res := public.referral_link_decide(v_link, true, null);

    select string_agg(
             format('%s: %s %s | regel %s%% | fee %s | leverancier %s%% = %s | winst/basis %s | %s',
                    rc.source, rc.amount, rc.currency, rc.pct,
                    coalesce(rc.fee_amount::text, '-'), coalesce(rc.supplier_fee_pct::text, '-'),
                    coalesce(rc.supplier_cost::text, '-'), coalesce(rc.base_amount::text, '-'),
                    coalesce(rc.note, '')), E'\n' order by rc.created_at, rc.source)
      into v_rows
      from public.referral_commissions rc
     where rc.referral_link_id = v_link;

    raise exception 'p45-terugdraaien';
  exception when others then
    if sqlerrm <> 'p45-terugdraaien' then
      v_err := sqlstate || ' ' || sqlerrm;
    end if;
  end;

  insert into _p45 values (3, 'uitkomst van goedkeuren (als eigenaar)',
    coalesce(v_err, coalesce(v_res::text, '-')));
  insert into _p45 values (4, 'geboekte regels, met de berekening (teruggedraaid)', coalesce(v_rows, 'geen'));
  insert into _p45 values (5, 'na de proef: staat er nog iets?',
    case when v_link is not null and exists (select 1 from public.referral_links where id = v_link)
         then 'JA — FOUT, meld dit'
         else 'nee: koppeling, commissies en meldingen zijn teruggedraaid' end);
end;
$blk0$;

select nr, item, v as antwoord from _p45 order by nr;
