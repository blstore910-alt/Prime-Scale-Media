-- ════════════════════════════════════════════════════════════════════
-- PLAK 150 — EERST UITZETTEN, EEN DAG KIJKEN, DAN PAS WEG
-- ════════════════════════════════════════════════════════════════════
--
-- DEZE PLAK VERWIJDERT NIETS. Hij zet accounts op inactief, en dat is
-- met één regel terug te draaien (onderaan).
--
-- ── WAAROM DEZE TUSSENSTAP ────────────────────────────────────────
--
-- Een account dat nergens meer aan hangt kan weg. Een account dat
-- ergens aan hangt merk je -- maar alleen als je het eerst uitzet en
-- een dag kijkt. Zet je het meteen weg, dan merk je het ook, alleen
-- dan is het al gebeurd.
--
-- Concreet: een inactief account kan niet meer inloggen, komt niet
-- meer in wachtrijen, en zijn abonnement wordt niet meer gefactureerd.
-- Valt er in die dag iets om -- een factuurrun die struikelt, een
-- scherm dat leegloopt, een telling die verandert -- dan weet je het
-- vóór het onomkeerbaar is.
--
-- ── WELKE ACCOUNTS ────────────────────────────────────────────────
--
-- Vul ze hieronder in bij `v_codes`. Ik zet er geen een op eigen
-- initiatief in: het document zegt dat jij ze bij naam aanwijst, en
-- twee van de zestien ("Piet Hendrik", "Gers padoel") lezen niet als
-- een walkthrough. Alle zestien staan wel op wegwerpadressen, maar dat
-- is bewijs en geen besluit.
--
-- ── WAT DEZE PLAK WEIGERT ─────────────────────────────────────────
--
-- Een code die niet bestaat, en een account met een openstaand saldo.
-- Dat laatste is met opzet: een portemonnee met geld erin hoort niet
-- stilletjes uitgezet te worden, want dan staat er geld van iemand op
-- een account waar niemand meer bij kan. Hij meldt het en slaat die
-- ene over; de rest gaat gewoon door.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg, dus
-- zonder deze regel staat er straks niet wie dit heeft gedaan.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk0$
declare
  -- ── VUL HIER DE CODES IN ────────────────────────────────────────
  -- Bijvoorbeeld: array['PSM0001', 'PSM0002', 'PSM0003']
  v_codes text[] := array[]::text[];

  r        record;
  n_uit    int := 0;
  n_over   int := 0;
begin
  if array_length(v_codes, 1) is null then
    raise notice '----------------------------------------------------';
    raise notice 'Geen codes ingevuld. Er is niets veranderd.';
    raise notice 'Vul v_codes bovenaan en draai de plak opnieuw.';
    raise notice '----------------------------------------------------';
    return;
  end if;

  for r in
    select a.id, a.tenant_client_code as code, a.profile_id,
           coalesce(w.eur_balance, 0) as eur,
           coalesce(w.usd_balance, 0) as usd,
           up.email
      from public.advertisers a
      left join public.user_profiles up on up.id = a.profile_id
      left join public.wallets w on w.advertiser_id = a.id
     where a.tenant_client_code = any(v_codes)
  loop
    if r.eur <> 0 or r.usd <> 0 then
      raise notice 'OVERGESLAGEN %: saldo EUR % / USD % -- maak eerst leeg',
        r.code, r.eur, r.usd;
      n_over := n_over + 1;
      continue;
    end if;

    update public.user_profiles
       set is_active = false,
           status = 'inactive',
           updated_at = now()
     where id = r.profile_id;

    n_uit := n_uit + 1;
    raise notice 'uitgezet: % (%)', r.code, coalesce(r.email, 'geen e-mail');
  end loop;

  -- Een code die je intypte en die niet bestaat is een typefout, geen
  -- stilte waard.
  for r in
    select unnest(v_codes) as code
  loop
    if not exists (
      select 1 from public.advertisers a where a.tenant_client_code = r.code
    ) then
      raise notice 'BESTAAT NIET: %', r.code;
    end if;
  end loop;

  raise notice 'plak 150: % uitgezet, % overgeslagen wegens saldo',
    n_uit, n_over;
end
$blk0$;

-- ── TERUGDRAAIEN ───────────────────────────────────────────────────
-- Eén regel, met dezelfde codes:
--
--   update public.user_profiles up
--      set is_active = true, status = 'active', updated_at = now()
--     from public.advertisers a
--    where a.profile_id = up.id
--      and a.tenant_client_code = any(array['PSM0001', 'PSM0002']);

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- Alle zestien, met wat eraan hangt, zodat je kunt aanwijzen wat weg
-- mag. `mag_weg` is een indicatie en geen besluit: het zegt alleen dat
-- er geen geld en geen factuur aan vastzit.
select
  a.tenant_client_code                                        as code,
  coalesce(up.full_name, up.email, '(geen naam)')             as naam,
  case when coalesce(up.is_active, true)
            and coalesce(up.status, 'active') <> 'inactive'
       then 'actief' else 'UIT' end                           as staat,
  to_char(coalesce(w.eur_balance, 0), 'FM999990.00')          as eur,
  to_char(coalesce(w.usd_balance, 0), 'FM999990.00')          as usd,
  (select count(*) from public.wallet_topups t
    where t.advertiser_id = a.id and t.status = 'completed')  as topups,
  (select count(*) from public.invoices i
    where i.advertiser_id = a.id)                             as facturen,
  (select count(*) from public.ad_accounts ac
    where ac.advertiser_id = a.id)                            as accounts,
  case
    when coalesce(w.eur_balance, 0) <> 0
      or coalesce(w.usd_balance, 0) <> 0             then 'nee -- saldo'
    when exists (select 1 from public.invoices i
                  where i.advertiser_id = a.id)      then 'kijk -- facturen'
    else 'geen geld, geen factuur'
  end                                                         as mag_weg
from public.advertisers a
left join public.user_profiles up on up.id = a.profile_id
left join public.wallets w on w.advertiser_id = a.id
where a.tenant_id = (select id from public.tenants
                      where name = 'Prime Scale Media')
order by a.tenant_client_code;
