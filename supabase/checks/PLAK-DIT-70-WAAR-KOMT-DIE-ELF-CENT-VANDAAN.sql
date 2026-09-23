-- ════════════════════════════════════════════════════════════════════
--  PLAK 70 — waar komt die elf cent vandaan
--
--  DE VRAAG VAN DE EIGENAAR (23-09): "hier meer details, hoeveel topup
--  er is gedaan, zeer klein subtiel, en hoeveel fee we hebben geind, en
--  als we evt ook 2% supplier fee hebben maar dan moet er staan 'the fee
--  we pay' ofzo, en dan de berekening — dus zeer klein subtiel, 11 cent
--  uitkomen."
--
--  DE HELE BEREKENING BESTAAT AL, maar op het ADMIN-scherm. Ga naar
--  /affiliates, open een affiliate, en elke commissieregel draagt daar:
--
--      "20% of profit €0.53 (fee €3.00 − supplier 2% = €2.45)"
--
--  Dat staat in components/affiliate/affiliates-book.tsx (calcLine).
--  Daar hoort hij ook, en alleen daar.
--
--  WAAROM NIET OP HET SCHERM VAN DE KLANT OF DE AFFILIATE. De regel die
--  in CLAUDE.md staat en die de eigenaar zelf gegeven heeft: de
--  leveranciersfee en onze marge komen nooit in beeld bij een klant of
--  een affiliate — "niet in de UI, niet in een mail, niet op een factuur,
--  en niet in de JSON achter de pagina". En het is niet genoeg om alleen
--  de leverancier weg te laten: commissie = 20% × (fee − leverancier).
--  Wie de commissie ziet én het percentage ziet, rekent de winst uit; wie
--  daarbij de fee kent — en de klant kent zijn eigen fee, die staat op
--  zijn factuur — heeft de inkoopprijs. Twee onschuldige velden naast
--  elkaar zijn samen de marge.
--
--  WAT ER WÉL BIJ KAN, EN WAT DIT BLOK DOET. Het bedrag waar de
--  commissie op slaat: de storting zelf, of de factuur bij een
--  abonnement. Dat is het eigen bedrag van de verwezen klant, de
--  affiliate ziet de som ervan al als "Spend driven", en er zit geen
--  fee, geen percentage en geen inkoop in. Daarmee leest de regel
--  straks:
--
--      F2 Walkthrough
--      22 sep 2026 · Top-up · Meta · PSM0007 · op €97,00        €0,11
--
--  Genoeg om te zien waar hij vandaan komt, zonder te zeggen wat wij
--  eraan verdienen.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p70;
create temp table _p70(nr int, wat text, uitkomst text);

drop function if exists public.affiliate_commission_list(timestamptz, timestamptz);

create function public.affiliate_commission_list(
  p_from timestamptz default null,
  p_to   timestamptz default null)
returns table (
  commission_id uuid,
  created_at timestamptz,
  referral_link_id uuid,
  referred_advertiser_code text,
  referred_advertiser_name text,
  kind text,
  amount numeric,
  currency text,
  status text,
  network text,
  -- NIEUW: het bedrag waar de commissie op slaat. De storting, of de
  -- factuur bij een abonnement. Nooit de winst (rc.base_amount), nooit
  -- het percentage, nooit de inkoop.
  source_amount numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $blk0$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    rc.id,
    rc.created_at,
    rc.referral_link_id,
    ra.tenant_client_code::text,
    rup.full_name::text,
    coalesce(rc.source,
             case when rc.type = 'onetime' then 'onetime'
                  when rc.subscription_invoice_id is not null then 'subscription'
                  else 'topup' end)::text,
    case when rc.status = 'on_hold' then null else rc.amount end,
    upper(coalesce(rc.currency, 'EUR'))::text,
    case coalesce(rc.status, 'unpaid')
      when 'paid' then 'paid'
      when 'on_hold' then 'processing'
      when 'reversed' then 'reversed'
      else 'owed' end::text,
    -- Het netwerk, nooit het type.
    case
      when lower(coalesce(x.platform, '')) ~ '(meta|facebook)' then 'Meta'
      when lower(coalesce(x.platform, '')) ~ '(google|gdn|youtube)' then 'Google'
      when lower(coalesce(x.platform, '')) ~ 'tiktok' then 'TikTok'
      else null
    end::text,
    -- De storting zelf, of de factuur. Een eenmalige bonus hangt aan
    -- niets, die blijft leeg in plaats van 0 te tonen.
    case
      when rc.topup_id is not null then t.topup_amount
      when rc.subscription_invoice_id is not null then i.amount
      else null
    end::numeric
  from public.referral_commissions rc
  join public.referral_links rl on rl.id = rc.referral_link_id
  left join public.advertisers ra on ra.id = rl.referred_advertiser_id
  left join public.user_profiles rup on rup.id = ra.profile_id
  left join public.top_ups t on t.id = rc.topup_id
  left join public.ad_accounts x on x.id = t.account_id
  left join public.invoices i on i.id = rc.subscription_invoice_id
  where rl.affiliate_advertiser_id = v_aff
    and (p_from is null or rc.created_at >= p_from)
    and (p_to   is null or rc.created_at <= p_to)
  order by rc.created_at desc;
end;
$blk0$;

-- Een nieuwe functie krijgt van Postgres uitvoerrecht voor PUBLIC — dus
-- ook voor anon. Intrekken hoort in HETZELFDE blok als de create.
do $blk1$
begin
  execute 'revoke all on function public.affiliate_commission_list(timestamptz, timestamptz) from public, anon';
  execute 'grant execute on function public.affiliate_commission_list(timestamptz, timestamptz) to authenticated, service_role';
  insert into _p70 values (1, 'affiliate_commission_list',
    'opnieuw aangemaakt met source_amount (de storting of de factuur); geen fee, geen percentage, geen inkoop');
exception when others then
  insert into _p70 values (1, 'affiliate_commission_list', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── WAT ER NU STAAT (alleen lezen) ───────────────────────────────────
do $blk2$
declare v_txt text;
begin
  begin
    select case when pg_get_functiondef(p.oid) ilike '%base_amount%'
                  or pg_get_functiondef(p.oid) ilike '%supplier_cost%'
                  or pg_get_functiondef(p.oid) ilike '%rc.pct%'
                then 'LET OP: er staat een margeveld in'
                else 'goed: geen winst, geen percentage, geen inkoop' end
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_commission_list'
     limit 1;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p70 values (2, 'lekt de lijst onze marge', coalesce(v_txt, 'functie niet gevonden'));

  begin
    select coalesce(string_agg(
             coalesce(ra.tenant_client_code, '?') || ': ' ||
             coalesce(to_char(rc.amount, 'FM999G990D00'), '-') || ' ' ||
             upper(coalesce(rc.currency, 'EUR')) || ' op ' ||
             coalesce(to_char(coalesce(t.topup_amount, i.amount), 'FM999G990D00'), 'niets'),
             ' · ' order by rc.created_at desc), 'geen commissies')
      into v_txt
      from public.referral_commissions rc
      join public.referral_links rl on rl.id = rc.referral_link_id
      left join public.advertisers ra on ra.id = rl.referred_advertiser_id
      left join public.top_ups t on t.id = rc.topup_id
      left join public.invoices i on i.id = rc.subscription_invoice_id;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p70 values (3, 'wat de regels straks zeggen', v_txt);
end
$blk2$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p70 order by nr;
