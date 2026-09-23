-- ════════════════════════════════════════════════════════════════════
--  PLAK 60 — de welkomstbonus werd stilletjes opgeslokt door een index
--
--  UITGEZOCHT MET DE NIEUWE LEESVERBINDING, in vier minuten in plaats
--  van vier plakken. Wat er precies gebeurde bij Piet (PSM0010):
--
--    1  zijn abonnementsfactuur van EUR 10,00 werd betaald om 20:43:15
--    2  de motor boekte netjes de maandcommissie: 50% = EUR 5,00,
--       met subscription_invoice_id = die factuur
--    3  daarna riep diezelfde motor de welkomstbonus aan (plak 55), en
--       die wil EUR 10,00 wegschrijven -- óók met subscription_invoice_id
--       = diezelfde factuur, want daar kwam hij vandaan
--    4  en daar stond een unieke index op:
--
--         referral_commissions_invoice_uq  ->  (subscription_invoice_id)
--
--       Eén commissie per factuur. De bonus was de tweede.
--    5  de regel eindigt op "on conflict do nothing", dus er kwam geen
--       foutmelding. De bonus verdween zonder een spoor.
--
--  DE INDEX ZELF IS GOED BEDOELD: hij voorkomt dat dezelfde factuur twee
--  keer commissie oplevert. Hij is alleen van vóór de bonus, en gaat er
--  nog van uit dat een factuur hoogstens één soort commissie geeft.
--
--  De storting-kant heeft die fout niet -- daar staat de soort al in de
--  index: (topup_id, coalesce(source,'topup')). Daarom viel de bonus op
--  een eerste storting wél en op een eerste factuur niet. Dit blok geeft
--  de factuur-index precies dezelfde vorm.
--
--  WAT DIT BLOK DOET
--    A  vervangt de index door (factuur, soort) -- twee soorten mogen,
--       twee dezelfde niet
--    B  haalt een oude trigger van facturen af die nog uit het vorige
--       commissiemodel komt en de nieuwe motor kan blokkeren
--    C  boekt de gemiste bonus alsnog, één per aangebrachte klant, en
--       met de regel zoals die gold TOEN de factuur betaald werd -- niet
--       met de regel van vandaag
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p60;
create temp table _p60(nr int, wat text, uitkomst text);

-- ── A. DE INDEX KRIJGT DE SOORT ERBIJ ────────────────────────────────
do $blk0$
begin
  drop index if exists public.referral_commissions_invoice_uq;
  create unique index referral_commissions_invoice_uq
    on public.referral_commissions (subscription_invoice_id, coalesce(source, 'subscription'))
    where subscription_invoice_id is not null;
  insert into _p60 values (1, 'de index',
    'nu (factuur, soort) -- een factuur mag een abonnementscommissie EN een bonus dragen, maar nooit twee van dezelfde soort');
exception when others then
  insert into _p60 values (1, 'de index', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. DE OUDE TRIGGER ERAF ──────────────────────────────────────────
--  trg_create_commission_from_invoice komt uit het vorige model: hij
--  leest commission_monthly van de koppeling en schrijft zelf een
--  commissie weg. Hij vuurt alfabetisch VOOR de echte motor, en zodra
--  een koppeling commission_type 'monthly' krijgt boekt hij een bedrag
--  uit een veld dat niemand meer onderhoudt -- waarna de echte motor
--  afhaakt ("er staat al commissie op deze factuur") en ook de bonus
--  overslaat. Vandaag staat geen enkele koppeling op 'monthly', dus dit
--  verandert nu niets; het haalt alleen de valstrik weg.
--
--  De functie zelf blijft staan, alleen de trigger gaat eraf.
do $blk1$
begin
  drop trigger if exists trg_create_commission_from_invoice on public.invoices;
  insert into _p60 values (2, 'oude trigger',
    'trg_create_commission_from_invoice losgekoppeld (de functie blijft bestaan)');
exception when others then
  insert into _p60 values (2, 'oude trigger', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── C. DE GEMISTE BONUSSEN ALSNOG ────────────────────────────────────
do $blk2$
declare
  r        record;
  v_out    numeric;
  v_n      int := 0;
  v_som    numeric := 0;
  v_detail text := '';
begin
  for r in
    select distinct on (l.id)
           l.id          as link_id,
           i.id          as inv_id,
           coalesce(i.paid_at, i.created_at) as at,
           a.tenant_client_code as klant
      from public.referral_links l
      join public.advertisers a on a.id = l.referred_advertiser_id
      join public.invoices i
        on i.advertiser_id = l.referred_advertiser_id
       and i.tenant_id     = l.tenant_id
     where coalesce(l.status, 'active') = 'active'
       and i.status = 'paid'
       and lower(coalesce(i.type, '')) in ('subscription', 'subscription_adjustment')
     order by l.id, coalesce(i.paid_at, i.created_at) asc
  loop
    begin
      select public._book_onetime_if_due(r.link_id, r.at, null, r.inv_id) into v_out;
      if coalesce(v_out, 0) > 0 then
        v_n   := v_n + 1;
        v_som := v_som + v_out;
        v_detail := v_detail || r.klant || ' ' || to_char(v_out, 'FM999G990D00') || ' · ';
      end if;
    exception when others then
      v_detail := v_detail || r.klant || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;

  insert into _p60 values (3, 'gemiste bonussen',
    case when v_n = 0
         then 'geen enkele klant had er nog een te goed (of er gold geen regel toen zijn factuur betaald werd)'
         else v_n::text || ' geboekt, samen ' || to_char(v_som, 'FM999G990D00') || ' — ' || rtrim(v_detail, ' ·') end);
end
$blk2$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk3$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(x.src || ': ' || x.n::text || ' × ' ||
                               to_char(x.som, 'FM999G990D00') || ' ' || x.cur, ' · ' order by x.src), 'geen')
      into v_txt
      from (
        select coalesce(rc.source, 'topup') as src, upper(coalesce(rc.currency, 'EUR')) as cur,
               count(*) as n, sum(rc.amount) as som
          from public.referral_commissions rc
          join public.referral_links l on l.id = rc.referral_link_id
          join public.advertisers a on a.id = l.affiliate_advertiser_id
         where a.tenant_client_code = 'PSM0005'
           and coalesce(rc.status, 'unpaid') <> 'reversed'
         group by 1, 2
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p60 values (4, 'alle commissie van PSM0005', v_txt);

  begin
    select coalesce(string_agg(t.tgname, ' · ' order by t.tgname), 'geen')
      into v_txt
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relname = 'invoices' and not t.tgisinternal
       and pg_get_functiondef(t.tgfoid) ilike '%commission%';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p60 values (5, 'triggers op facturen', v_txt);
end
$blk3$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p60 order by nr;
