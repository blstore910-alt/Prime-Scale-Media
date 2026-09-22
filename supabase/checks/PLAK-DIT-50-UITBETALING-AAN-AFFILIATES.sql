-- ════════════════════════════════════════════════════════════════════
--  PLAK 50 — REIS F3: een affiliate vraagt uitbetaling, jij handelt af
--
--  WAT ER NU GEBEURT (en waarom dit er moet komen)
--
--  "Request payout" opent vandaag WhatsApp met een tekstje. Er wordt
--  NIETS vastgelegd: geen bedrag, geen datum, geen status. Jij ziet geen
--  wachtrij, de affiliate ziet niet of het loopt, en per commissie
--  "Mark paid" aanvinken is precies wat je niet wilde ("dat moeten we in
--  bulk doen").
--
--  Wat dit blok maakt:
--
--    affiliate_payouts   één rij per aanvraag: wie, welke valuta, welk
--                        bedrag, status, bankgegevens van dat moment
--    referral_commissions.payout_id / paid_at
--                        welke commissies in die uitbetaling zitten, en
--                        wanneer ze echt betaald zijn
--    referral_clawbacks.payout_id
--                        een terugvordering wordt één keer verrekend
--
--    affiliate_payout_request(valuta, gegevens)   de affiliate zelf
--    affiliate_payout_cancel(id)                  zolang jij niets deed
--    affiliate_payout_decide(id, actie, ...)      alleen de eigenaar
--
--  HET BEDRAG STAAT VAST ZODRA HET GEVRAAGD IS: de aanvraag hangt de
--  exacte commissierijen aan zichzelf (payout_id), dus het kan niet
--  meebewegen terwijl het in jouw wachtrij staat, en dezelfde commissie
--  kan nooit in twee uitbetalingen zitten. Openstaande terugvorderingen
--  gaan er één keer af en worden dan als verrekend gemarkeerd.
--
--  Niets hiervan verplaatst geld: "betaald" is een vastlegging van wat
--  jij hebt overgemaakt, met jouw referentie erbij.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p50;
create temp table _p50(nr int, wat text, uitkomst text);

-- ── A. DE TABEL ──────────────────────────────────────────────────────
create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  affiliate_advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  affiliate_user_id uuid,

  currency text not null check (upper(currency) in ('EUR', 'USD')),
  -- Wat er bij de aanvraag openstond: commissies min terugvorderingen.
  amount numeric(14,2) not null check (amount > 0),
  commission_count int not null default 0,
  clawback_amount numeric(14,2) not null default 0,

  status text not null default 'requested'
    check (status in ('requested', 'paid', 'rejected', 'cancelled')),
  -- 'bank' = jij maakt het over. 'wallet' bestaat vast in het model,
  -- maar de knop komt er pas als jij zegt dat het zo moet.
  method text not null default 'bank' check (method in ('bank', 'wallet')),

  -- De bankgegevens ZOALS ZE BIJ DEZE AANVRAAG GEGEVEN ZIJN. Een
  -- verwijzing naar een profiel dat later verandert, maakt een oude
  -- betaling onverklaarbaar.
  details jsonb,

  reason text,        -- waarom afgewezen
  reference text,     -- jouw bankreferentie bij betaald

  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists affiliate_payouts_tenant_idx
  on public.affiliate_payouts (tenant_id, status, requested_at desc);
create index if not exists affiliate_payouts_affiliate_idx
  on public.affiliate_payouts (affiliate_advertiser_id, requested_at desc);

-- Eén openstaande aanvraag per affiliate per valuta.
create unique index if not exists affiliate_payouts_one_open_uq
  on public.affiliate_payouts (affiliate_advertiser_id, upper(currency))
  where status = 'requested';

alter table public.referral_commissions
  add column if not exists payout_id uuid references public.affiliate_payouts(id) on delete set null,
  add column if not exists paid_at timestamptz;
create index if not exists referral_commissions_payout_idx
  on public.referral_commissions (payout_id);

alter table public.referral_clawbacks
  add column if not exists payout_id uuid references public.affiliate_payouts(id) on delete set null;

-- ── B. WIE MAG WAT ZIEN ──────────────────────────────────────────────
alter table public.affiliate_payouts enable row level security;

drop policy if exists affiliate_payouts_select on public.affiliate_payouts;
create policy affiliate_payouts_select on public.affiliate_payouts
  for select using (
    -- DE EIGENAAR, niet elke admin: in `details` staat het IBAN van de
    -- affiliate. Afhandelen is al alleen van de eigenaar, dus meekijken
    -- hoort dat ook te zijn. En de affiliate zelf, voor zijn eigen rijen.
    exists (
      select 1 from public.tenants t
       where t.id = affiliate_payouts.tenant_id
         and t.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.advertisers a
       where a.id = affiliate_payouts.affiliate_advertiser_id
         and a.user_id = auth.uid()
    )
  );

-- Lezen mag; schrijven gaat uitsluitend via de drie functies hieronder.
grant select on public.affiliate_payouts to authenticated;
revoke insert, update, delete on public.affiliate_payouts from authenticated;
revoke insert, update, delete on public.affiliate_payouts from anon;

-- ── C. AUDIT EN updated_at (CLAUDE.md: elke financiële tabel) ─────────
do $blk0$
begin
  if exists (select 1 from pg_proc where proname = '_audit_row_change') then
    execute 'drop trigger if exists trg_audit_affiliate_payouts on public.affiliate_payouts';
    execute 'create trigger trg_audit_affiliate_payouts
               after insert or update or delete on public.affiliate_payouts
               for each row execute function public._audit_row_change()';
  end if;
  if exists (select 1 from pg_proc where proname = '_touch_updated_at') then
    execute 'drop trigger if exists trg_touch_affiliate_payouts on public.affiliate_payouts';
    execute 'create trigger trg_touch_affiliate_payouts
               before update on public.affiliate_payouts
               for each row execute function public._touch_updated_at()';
  end if;
  insert into _p50 values (1, 'tabel affiliate_payouts', 'aangemaakt, met audit en updated_at, schrijven alleen via de functies');
exception when others then
  insert into _p50 values (1, 'tabel affiliate_payouts', 'LET OP: ' || sqlerrm);
end
$blk0$;

-- ── D. DE AFFILIATE VRAAGT ───────────────────────────────────────────
create or replace function public.affiliate_payout_request(
  p_currency text,
  p_details jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_uid      uuid := auth.uid();
  v_cur      text := upper(coalesce(p_currency, 'EUR'));
  v_aff      uuid;
  v_tenant   uuid;
  v_gross    numeric(14,2) := 0;
  v_claw     numeric(14,2) := 0;
  v_net      numeric(14,2);
  v_count    int := 0;
  v_payout   uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if v_cur not in ('EUR', 'USD') then
    raise exception 'Only EUR or USD' using errcode = '22023';
  end if;

  -- PRECIES DE RIJ DIE HET SCHERM GEBRUIKT. affiliate_referral_stats
  -- neemt de nieuwste advertiser-rij van deze gebruiker; als dit iets
  -- anders koos, vroeg iemand een bedrag aan dat op zijn eigen scherm
  -- nergens staat.
  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;

  if v_aff is null then
    raise exception 'There is nothing waiting to be paid out in %', v_cur
      using errcode = 'P0002';
  end if;

  select tenant_id into v_tenant from public.advertisers where id = v_aff;

  if exists (
    select 1 from public.affiliate_payouts p
     where p.affiliate_advertiser_id = v_aff
       and upper(p.currency) = v_cur
       and p.status = 'requested'
  ) then
    raise exception 'You already have a % payout waiting for us', v_cur
      using errcode = '23505';
  end if;

  -- Wat er openstaat, en wat er nog verrekend moet worden.
  -- Alleen koppelingen die meetellen op het scherm: een afgewezen
  -- koppeling telt daar niet mee, dus die commissie zit hier ook niet in.
  select coalesce(sum(rc.amount), 0), count(*)
    into v_gross, v_count
    from public.referral_commissions rc
    join public.referral_links l on l.id = rc.referral_link_id
   where l.affiliate_advertiser_id = v_aff
     and coalesce(l.status, 'active') in ('active', 'pending')
     and coalesce(rc.status, 'unpaid') = 'unpaid'
     and rc.payout_id is null
     and upper(coalesce(rc.currency, 'EUR')) = v_cur;

  select coalesce(sum(cb.amount), 0)
    into v_claw
    from public.referral_clawbacks cb
    join public.referral_links l on l.id = cb.referral_link_id
   where l.affiliate_advertiser_id = v_aff
     and coalesce(l.status, 'active') in ('active', 'pending')
     and cb.payout_id is null
     and upper(cb.currency) = v_cur;

  v_net := round(v_gross - v_claw, 2);
  if v_net <= 0 then
    raise exception 'After what has been returned there is nothing to pay out in % right now', v_cur
      using errcode = 'P0002';
  end if;

  insert into public.affiliate_payouts
    (tenant_id, affiliate_advertiser_id, affiliate_user_id, currency, amount,
     commission_count, clawback_amount, details, status, method)
  values
    (v_tenant, v_aff, v_uid, v_cur, v_net, v_count, v_claw,
     case when jsonb_typeof(p_details) = 'object' then p_details else null end,
     'requested', 'bank')
  returning id into v_payout;

  -- HET BEDRAG STAAT NU VAST: precies deze rijen horen erbij.
  update public.referral_commissions rc
     set payout_id = v_payout
    from public.referral_links l
   where l.id = rc.referral_link_id
     and l.affiliate_advertiser_id = v_aff
     and coalesce(l.status, 'active') in ('active', 'pending')
     and coalesce(rc.status, 'unpaid') = 'unpaid'
     and rc.payout_id is null
     and upper(coalesce(rc.currency, 'EUR')) = v_cur;

  update public.referral_clawbacks cb
     set payout_id = v_payout
    from public.referral_links l
   where l.id = cb.referral_link_id
     and l.affiliate_advertiser_id = v_aff
     and coalesce(l.status, 'active') in ('active', 'pending')
     and cb.payout_id is null
     and upper(cb.currency) = v_cur;

  -- De eigenaar krijgt het in zijn wachtrij.
  insert into public.notifications (recipient_user_id, tenant_id, type, payload)
  select t.owner_id, t.id, 'affiliate_payout_requested',
         jsonb_build_object(
           'payout_id', v_payout,
           'amount', v_net,
           'currency', v_cur,
           'client_code', (select tenant_client_code from public.advertisers where id = v_aff),
           'commissions', v_count)
    from public.tenants t
   where t.id = v_tenant and t.owner_id is not null;

  return jsonb_build_object(
    'ok', true, 'payout_id', v_payout, 'amount', v_net,
    'currency', v_cur, 'commissions', v_count, 'clawbacks', v_claw);
end;
$blk1$;

-- ── E. DE AFFILIATE TREKT IN (zolang jij niets deed) ─────────────────
create or replace function public.affiliate_payout_cancel(p_payout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk2$
declare
  v_uid uuid := auth.uid();
  v_row public.affiliate_payouts;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select p.* into v_row
    from public.affiliate_payouts p
    join public.advertisers a on a.id = p.affiliate_advertiser_id
   where p.id = p_payout_id and a.user_id = v_uid
   for update of p;

  if v_row.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'This payout has already been answered' using errcode = '42501';
  end if;

  update public.referral_commissions set payout_id = null where payout_id = v_row.id;
  update public.referral_clawbacks set payout_id = null where payout_id = v_row.id;
  update public.affiliate_payouts
     set status = 'cancelled', decided_at = now()
   where id = v_row.id;

  return jsonb_build_object('ok', true);
end;
$blk2$;

-- ── F. DE EIGENAAR HANDELT AF ────────────────────────────────────────
create or replace function public.affiliate_payout_decide(
  p_payout_id uuid,
  p_action text,                    -- 'paid' of 'reject'
  p_reason text default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $blk3$
declare
  v_uid  uuid := auth.uid();
  v_row  public.affiliate_payouts;
  v_own  boolean;
  v_n    int := 0;
  v_settled numeric(14,2) := 0;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select p.* into v_row from public.affiliate_payouts p
   where p.id = p_payout_id for update;
  if v_row.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.tenants t
     where t.id = v_row.tenant_id and t.owner_id = v_uid
  ) into v_own;
  if not v_own then
    raise exception 'Only the owner settles payouts' using errcode = '42501';
  end if;

  if v_row.status <> 'requested' then
    raise exception 'This payout was already answered' using errcode = '42501';
  end if;

  if p_action = 'paid' then
    -- Een commissie die intussen teruggedraaid is, hoort niet bij deze
    -- betaling: losmaken, zodat hij niet als betaald in de boeken komt.
    update public.referral_commissions
       set payout_id = null
     where payout_id = v_row.id
       and coalesce(status, 'unpaid') <> 'unpaid';

    select coalesce(sum(amount), 0) into v_settled
      from public.referral_commissions
     where payout_id = v_row.id
       and coalesce(status, 'unpaid') = 'unpaid';

    update public.referral_commissions
       set status = 'paid', paid_at = now()
     where payout_id = v_row.id
       and coalesce(status, 'unpaid') = 'unpaid';
    get diagnostics v_n = row_count;

    update public.affiliate_payouts
       set status = 'paid', paid_at = now(), decided_at = now(),
           decided_by = v_uid, reference = nullif(trim(coalesce(p_reference, '')), ''),
           -- Als er tussen aanvraag en betaling iets is teruggedraaid,
           -- staat dat hier zwart op wit in plaats van stil te verdwijnen.
           reason = case
             when round(v_settled, 2) <> round(v_row.amount, 2)
               then 'Let op: gevraagd ' || to_char(v_row.amount, 'FM999G999G990D00')
                    || ', werkelijk verrekend ' || to_char(v_settled, 'FM999G999G990D00')
                    || ' (een commissie is na de aanvraag teruggedraaid)'
             else reason end
     where id = v_row.id;

    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    select a.user_id, v_row.tenant_id, 'affiliate_payout_paid',
           jsonb_build_object('payout_id', v_row.id, 'amount', v_row.amount,
                              'currency', upper(v_row.currency),
                              'reference', nullif(trim(coalesce(p_reference, '')), ''))
      from public.advertisers a
     where a.id = v_row.affiliate_advertiser_id and a.user_id is not null;

  elsif p_action = 'reject' then
    if length(trim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Say why, so they know' using errcode = '22023';
    end if;
    -- De commissies gaan terug de wachtrij in; de terugvorderingen ook,
    -- zodat de volgende aanvraag ze opnieuw verrekent.
    update public.referral_commissions set payout_id = null where payout_id = v_row.id;
    update public.referral_clawbacks set payout_id = null where payout_id = v_row.id;
    update public.affiliate_payouts
       set status = 'rejected', decided_at = now(), decided_by = v_uid,
           reason = left(trim(p_reason), 500)
     where id = v_row.id;

    insert into public.notifications (recipient_user_id, tenant_id, type, payload)
    select a.user_id, v_row.tenant_id, 'affiliate_payout_rejected',
           jsonb_build_object('payout_id', v_row.id, 'amount', v_row.amount,
                              'currency', upper(v_row.currency),
                              'reason', left(trim(p_reason), 500))
      from public.advertisers a
     where a.id = v_row.affiliate_advertiser_id and a.user_id is not null;
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'commissions', v_n, 'settled', v_settled,
                            'asked', v_row.amount);
end;
$blk3$;

do $blk4$
begin
  execute 'revoke all on function public.affiliate_payout_request(text, jsonb) from public, anon';
  execute 'revoke all on function public.affiliate_payout_cancel(uuid) from public, anon';
  execute 'revoke all on function public.affiliate_payout_decide(uuid, text, text, text) from public, anon';
  execute 'grant execute on function public.affiliate_payout_request(text, jsonb) to authenticated';
  execute 'grant execute on function public.affiliate_payout_cancel(uuid) to authenticated';
  execute 'grant execute on function public.affiliate_payout_decide(uuid, text, text, text) to authenticated';
  insert into _p50 values (2, 'de drie functies', 'aanvragen / intrekken door de affiliate, afhandelen alleen door de eigenaar');
exception when others then
  insert into _p50 values (2, 'de drie functies', 'MISLUKT: ' || sqlerrm);
end
$blk4$;

-- ── G. EEN VERREKENDE TERUGVORDERING TELT NIET EEUWIG DOOR ───────────
--
--  affiliate_referral_stats trekt elke terugvordering af, elke keer weer.
--  Zodra een uitbetaling er één verrekent, zou het scherm hem een tweede
--  keer aftrekken — de affiliate zou er twee keer voor betalen. Dit is
--  dezelfde functie als in plak 42, met één voorwaarde erbij.
drop function if exists public.affiliate_referral_stats(timestamptz, timestamptz);
create function public.affiliate_referral_stats(
  p_from timestamp with time zone default null::timestamp with time zone,
  p_to   timestamp with time zone default null::timestamp with time zone)
returns table(referral_link_id uuid, referred_advertiser_id uuid, referred_advertiser_name text,
              referred_advertiser_email text, referred_advertiser_code text, commission_type text,
              commission_pct numeric, commission_currency text, spend_usd numeric, spend_eur numeric,
              topup_count integer, earnings_usd numeric, earnings_eur numeric,
              unpaid_usd numeric, unpaid_eur numeric, link_status text)
language plpgsql
security definer
set search_path to 'public'
as $blk6$
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
    d.id, d.referred_advertiser_id, d.referred_advertiser_name::text,
    regexp_replace(d.referred_advertiser_email::text, '^(.)[^@]*@', '\1***@'),
    d.referred_advertiser_tenant_client_code::text,
    null::text, null::numeric, null::text,
    coalesce(sp.spend_usd, 0)::numeric, coalesce(sp.spend_eur, 0)::numeric,
    coalesce(sp.topup_count, 0)::int,
    greatest(coalesce(ea.earn_usd, 0) - coalesce(cb.usd, 0), 0)::numeric,
    greatest(coalesce(ea.earn_eur, 0) - coalesce(cb.eur, 0), 0)::numeric,
    greatest(coalesce(ea.unpaid_usd, 0) - coalesce(cb.usd, 0), 0)::numeric,
    greatest(coalesce(ea.unpaid_eur, 0) - coalesce(cb.eur, 0), 0)::numeric,
    coalesce(rl.status, 'active')::text
  from public.referral_links_with_details d
  join public.referral_links rl on rl.id = d.id
  left join lateral (
    select
      sum(t.topup_amount) filter (where t.topup_usd is null
                                     or upper(coalesce(t.currency, 'EUR')) = 'USD') as spend_usd,
      sum(t.topup_amount) filter (where t.topup_usd is not null
                                     and upper(coalesce(t.currency, 'EUR')) = 'EUR') as spend_eur,
      count(*) as topup_count
    from public.top_ups t
    where t.advertiser_id = d.referred_advertiser_id
      and t.tenant_id = d.tenant_id
      and t.status = 'completed'
      and coalesce(t.is_deleted, false) = false
      and (p_from is null or coalesce(t.verified_at, t.created_at) >= p_from)
      and (p_to   is null or coalesce(t.verified_at, t.created_at) <= p_to)
  ) sp on true
  left join lateral (
    select
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') in ('unpaid', 'paid')) as earn_eur,
      sum(rc.amount) filter (where upper(rc.currency) = 'USD' and coalesce(rc.status, 'unpaid') = 'unpaid') as unpaid_usd,
      sum(rc.amount) filter (where upper(rc.currency) = 'EUR' and coalesce(rc.status, 'unpaid') = 'unpaid') as unpaid_eur
    from public.referral_commissions rc
    where rc.referral_link_id = d.id
      and (p_from is null or rc.created_at >= p_from)
      and (p_to   is null or rc.created_at <= p_to)
  ) ea on true
  left join lateral (
    select sum(c.amount) filter (where upper(c.currency) = 'USD') as usd,
           sum(c.amount) filter (where upper(c.currency) = 'EUR') as eur
      from public.referral_clawbacks c
     where c.referral_link_id = d.id
       -- NIEUW (plak 50): al verrekend in een BETAALDE uitbetaling.
       and not exists (
         select 1 from public.affiliate_payouts pp
          where pp.id = c.payout_id and pp.status = 'paid')
       and (p_from is null or c.created_at >= p_from)
       and (p_to   is null or c.created_at <= p_to)
  ) cb on true
  where d.affiliate_advertiser_id = v_aff
    and coalesce(rl.status, 'active') in ('active', 'pending')
  order by d.referred_advertiser_name nulls last;
end;
$blk6$;

do $blk7$
begin
  execute 'revoke all on function public.affiliate_referral_stats(timestamptz, timestamptz) from public, anon';
  execute 'grant execute on function public.affiliate_referral_stats(timestamptz, timestamptz) to authenticated';
  insert into _p50 values (4, 'verrekende terugvordering', 'telt na een betaalde uitbetaling niet nog een keer mee');
exception when others then
  insert into _p50 values (4, 'verrekende terugvordering', 'MISLUKT: ' || sqlerrm);
end
$blk7$;

-- ── H. GELD STAAT NIET MEER OPEN VOOR HANDMATIG SCHRIJVEN ────────────
--
--  De rechten-sweep: elke ADMIN van de tenant kon met één API-aanroep
--  een commissie op 'paid' zetten, terugzetten naar 'unpaid' (waarna de
--  volgende ronde hem nog een keer betaalt) of het bedrag veranderen. De
--  eigenaar-poort stond alleen in de server action. Schrijven gaat nu
--  uitsluitend via de functies die commissie boeken en uitbetalen.
do $blk8$
declare v_open int;
begin
  execute 'revoke insert, update, delete on public.referral_commissions from authenticated';
  execute 'revoke insert, update, delete on public.referral_commissions from anon';
  execute 'revoke insert, update, delete on public.referral_clawbacks from authenticated';
  execute 'revoke insert, update, delete on public.referral_clawbacks from anon';

  select count(*) into v_open
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('referral_commissions','referral_clawbacks')
     and grantee in ('authenticated','anon')
     and privilege_type in ('INSERT','UPDATE','DELETE');

  insert into _p50 values (5, 'commissies handmatig schrijven',
    case when v_open = 0 then 'DICHT — alleen nog via de boek- en uitbetaalfuncties'
         else 'LET OP: ' || v_open::text || ' schrijfrechten staan nog open' end);
exception when others then
  insert into _p50 values (5, 'commissies handmatig schrijven', 'MISLUKT: ' || sqlerrm);
end
$blk8$;

-- ── I. DE AFFILIATE LEEST ONZE MARGE NIET ────────────────────────────
--
--  referral_commissions draagt base_amount, pct, fee_amount,
--  supplier_fee_pct en supplier_cost: onze inkoop en onze marge. Plak 39
--  haalde daarvoor één policy weg, maar de policy uit de RLS-sjablonen
--  (referral_commissions_select) liet de affiliate nog steeds de hele rij
--  lezen. Hij leest zijn commissies via affiliate_commission_list, die
--  precies toont wat mag.
do $blk9$
begin
  execute 'drop policy if exists referral_commissions_select on public.referral_commissions';
  execute $q$
    create policy referral_commissions_select on public.referral_commissions
      for select using (
        exists (
          select 1 from public.user_profiles up
           where up.user_id = auth.uid()
             and up.tenant_id = referral_commissions.tenant_id
             and up.role = 'admin'
             and coalesce(up.is_active, true)
        )
      )$q$;
  insert into _p50 values (6, 'affiliate leest de commissietabel', 'niet meer rechtstreeks: alleen via affiliate_commission_list');
exception when others then
  insert into _p50 values (6, 'affiliate leest de commissietabel', 'MISLUKT: ' || sqlerrm);
end
$blk9$;

-- ── J. WAT ER NU OPENSTAAT (alleen lezen) ────────────────────────────
do $blk5$
declare
  v_txt text;
begin
  select coalesce(string_agg(x.code || ': ' || x.cur || ' ' ||
                             to_char(x.som, 'FM999G999G990D00') || ' (' || x.n::text || ' rijen)', ' · '), 'niets')
    into v_txt
    from (
      select coalesce(a.tenant_client_code, left(a.id::text, 8)) as code,
             upper(coalesce(rc.currency, 'EUR')) as cur,
             sum(rc.amount) as som, count(*) as n
        from public.referral_commissions rc
        join public.referral_links l on l.id = rc.referral_link_id
        join public.advertisers a on a.id = l.affiliate_advertiser_id
       where coalesce(rc.status, 'unpaid') = 'unpaid'
         and rc.payout_id is null
       group by 1, 2
    ) x;
  insert into _p50 values (7, 'Wat er vandaag uitbetaald kan worden', v_txt);
end
$blk5$;

-- ── HET RAPPORT ──────────────────────────────────────────────────────
select nr as "#", wat as "wat", uitkomst as "uitkomst"
  from _p50 order by nr;
