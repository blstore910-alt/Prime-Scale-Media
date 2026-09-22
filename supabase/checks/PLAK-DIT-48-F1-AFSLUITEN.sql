-- ════════════════════════════════════════════════════════════════════
--  PLAK 48 — F1 AFSLUITEN: klopt wat de schermen zeggen met de database?
--
--  ALLEEN LEZEN. Verandert niets, boekt niets, keurt niets goed.
--
--  Reis F1: uitnodiging/link -> signup -> portaal met een werkende link.
--  Gelopen met Piet Hendrik (PSM0010), aangemeld via de link van
--  PSM0005, door mij goedgekeurd. Dit is dezelfde reis, nu aan de
--  databasekant:
--
--    1  Piet bestaat, met profiel, in de juiste tenant
--    2  zijn koppeling aan PSM0005 staat op active, mét besluitdatum
--    3  hij is zelf affiliate (approved) en heeft een eigen link
--    4  er is GEEN commissie geboekt (hij heeft nog niets gestort)
--    5  zijn wallets staan op 0,00
--    6  de meldingen die hierbij horen staan er echt
--    7  wat PSM0005 in zijn portaal hoort te zien
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p48;
create temp table _p48(nr int, wat text, uitkomst text);

do $blk0$
declare
  v_tenant   uuid;
  v_piet_adv uuid;
  v_piet_usr uuid;
  v_ref_adv  uuid;            -- PSM0005, de verwijzer
  v_link     jsonb;
  v_link_id  uuid;
  v_own      jsonb;
  v_n        int;
  v_txt      text;
begin
  -- ── 1. WIE IS PIET ─────────────────────────────────────────────────
  select a.id, a.user_id, a.tenant_id
    into v_piet_adv, v_piet_usr, v_tenant
    from public.advertisers a
   where a.tenant_client_code = 'PSM0010'
   limit 1;

  if v_piet_adv is null then
    insert into _p48 values (1, 'PSM0010 (Piet) gevonden', 'NEE — geen advertiser met die code');
    return;
  end if;

  select coalesce(p.full_name, u.email, '(geen naam)')
    into v_txt
    from public.user_profiles p
    left join auth.users u on u.id = p.user_id
   where p.user_id = v_piet_usr
   limit 1;

  insert into _p48 values (
    1, 'PSM0010 bestaat, met profiel',
    coalesce(v_txt, 'GEEN PROFIEL') || ' · tenant ' || coalesce(v_tenant::text, '?'));

  select a.id into v_ref_adv
    from public.advertisers a
   where a.tenant_client_code = 'PSM0005'
   limit 1;

  -- ── 2. DE KOPPELING AAN PSM0005 ───────────────────────────────────
  select to_jsonb(l), l.id
    into v_link, v_link_id
    from public.referral_links l
   where l.referred_advertiser_id = v_piet_adv
   limit 1;

  insert into _p48 values (
    2, 'Koppeling PSM0005 -> Piet',
    case when v_link is null then 'GEEN rij in referral_links'
         else 'status=' || coalesce(v_link ->> 'status', '?')
              || ' · besloten op ' || coalesce(left(v_link ->> 'decided_at', 19), '(leeg)')
              || ' · verwijzer klopt: '
              || case when (v_link ->> 'affiliate_advertiser_id') = v_ref_adv::text then 'ja' else 'NEE' end
              || ' · aangemaakt ' || coalesce(left(v_link ->> 'created_at', 19), '?')
    end);

  -- ── 3. PIET ALS AFFILIATE ─────────────────────────────────────────
  insert into _p48
  select 3, 'Piets eigen aanvraag om affiliate te worden',
         'status=' || coalesce(j ->> 'affiliate_status', '(leeg)')
         || ' · aangevraagd ' || coalesce(left(j ->> 'affiliate_applied_at', 19), '-')
         || ' · besloten ' || coalesce(left(j ->> 'affiliate_decided_at', 19), '-')
         || ' · weigerreden: ' || coalesce(j ->> 'affiliate_refusal_reason', '-')
    from (select to_jsonb(a) as j from public.advertisers a where a.id = v_piet_adv) s;

  select to_jsonb(l)
    into v_own
    from public.referral_links l
   where l.affiliate_advertiser_id = v_piet_adv
   limit 1;

  select count(*) into v_n
    from public.referral_links x
   where x.affiliate_advertiser_id = v_piet_adv
     and x.referred_advertiser_id is not null;

  insert into _p48 values (
    4, 'Piets eigen referral-link',
    case when v_own is null then 'GEEN eigen link (zijn portaal deelt dan alleen ?ref=PSM0010)'
         else 'status=' || coalesce(v_own ->> 'status', '?')
              || ' · aangemaakt ' || coalesce(left(v_own ->> 'created_at', 19), '?')
              || ' · klanten eronder: ' || v_n::text
    end);

  -- ── 4. GEEN COMMISSIE (hij heeft nog niets gestort) ───────────────
  select count(*) into v_n
    from public.referral_commissions rc
   where rc.referral_link_id = v_link_id;

  insert into _p48 values (
    5, 'Commissie op de koppeling PSM0005 -> Piet',
    v_n::text || ' rijen (verwacht 0: Piet heeft nog niets gestort)');

  -- ── 5. ZIJN WALLET ────────────────────────────────────────────────
  insert into _p48
  select 6, 'Wallet van Piet',
         coalesce(
           string_agg('EUR ' || to_char(coalesce((j ->> 'eur_balance')::numeric, 0), 'FM999G999G990D00')
                      || ' · USD ' || to_char(coalesce((j ->> 'usd_balance')::numeric, 0), 'FM999G999G990D00'), ' | '),
           'GEEN wallet-rij')
    from (select to_jsonb(w) as j from public.wallets w where w.advertiser_id = v_piet_adv) s;

  -- ── 6. DE MELDINGEN DIE HIERBIJ HOREN ─────────────────────────────
  insert into _p48
  select 7, 'Meldingen (laatste 24 u) van deze reis',
         coalesce(string_agg(x.t || ' ×' || x.c::text, ' · ' order by x.t), 'GEEN')
    from (
      select n.type as t, count(*) as c
        from public.notifications n
       where n.created_at > now() - interval '24 hours'
         and n.type in ('referral_pending','referral_joined','referral_approved','referral_rejected',
                        'affiliate_application','affiliate_approved','affiliate_refused',
                        'affiliate_upgrade_requested','affiliate_upgrade_approved','affiliate_upgrade_refused')
       group by n.type
    ) x;

  -- ── 7. WAT PSM0005 IN ZIJN PORTAAL HOORT TE ZIEN ──────────────────
  insert into _p48
  select 8, 'PSM0005: koppelingen onder zijn link',
         'totaal: ' || count(*)::text
         || ' · actief: ' || count(*) filter (where l.status = 'active')::text
         || ' · wachtend: ' || count(*) filter (where l.status = 'pending')::text
    from public.referral_links l
   where l.affiliate_advertiser_id = v_ref_adv;

  insert into _p48
  select 9, 'PSM0005: verdiend volgens de database',
         'EUR ' || to_char(coalesce(sum(rc.amount) filter (where upper(rc.currency) = 'EUR'), 0), 'FM999G999G990D00')
         || ' · USD ' || to_char(coalesce(sum(rc.amount) filter (where upper(rc.currency) = 'USD'), 0), 'FM999G999G990D00')
         || ' · rijen: ' || count(*)::text
    from public.referral_commissions rc
    join public.referral_links l on l.id = rc.referral_link_id
   where l.affiliate_advertiser_id = v_ref_adv;
end
$blk0$;

-- ── HET RAPPORT ──────────────────────────────────────────────────────
select nr as "#", wat as "wat gecontroleerd", uitkomst as "uitkomst"
  from _p48 order by nr;
