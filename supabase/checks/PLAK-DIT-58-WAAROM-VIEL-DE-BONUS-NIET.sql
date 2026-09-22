-- ════════════════════════════════════════════════════════════════════
--  PLAK 58 — waarom viel de welkomstbonus niet?
--
--  WAT IK ZAG. Ik zette de bonus op EUR 10 voor PSM0005 (alleen voor
--  hem, niet als standaard), maakte een abonnement voor Piet (PSM0010,
--  door PSM0005 aangebracht) en zette de factuur op betaald. De
--  maandcommissie kwam keurig binnen (50% van EUR 10 = EUR 5,00), maar
--  de bonus van EUR 10 niet. Plak 55 hoort hem juist óók op een
--  betaalde factuur te laten vallen.
--
--  DIT BLOK LEEST EN PROBEERT HET DAN ZELF
--    1  staat de bonusregel er, en vanaf wanneer?
--    2  draait de functie die plak 55 heeft neergezet, of nog de oude?
--    3  welke trigger hangt er aan facturen, en welke functie roept hij?
--    4  hoe ziet Piets koppeling eruit, en wat staat er aan commissie?
--    5  en dan: roep de bonusfunctie één keer aan voor Piets koppeling
--       en vertel wat eruit komt
--
--  Stap 5 is het enige dat iets kan schrijven, en precies wat er hoort
--  te gebeuren: één bonus, als hij verdiend is.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p58;
create temp table _p58(nr int, wat text, uitkomst text);

do $blk0$
declare
  v_txt  text;
  v_link uuid;
  v_out  numeric;
begin
  -- ── 1. DE REGEL ───────────────────────────────────────────────────
  begin
    select coalesce(string_agg(
             coalesce(a.tenant_client_code, 'STANDAARD') || ': ' ||
             to_char(r.amount, 'FM999G990D00') || ' ' || coalesce(r.currency, '?') ||
             ' vanaf ' || left(r.effective_from::text, 16), ' · ' order by r.effective_from), 'GEEN')
      into v_txt
      from public.commission_rules r
      left join public.advertisers a on a.id = r.affiliate_advertiser_id
     where r.source = 'onetime';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p58 values (1, 'bonusregels in de database', v_txt);

  -- ── 2. WELKE VERSIE VAN DE BOEKFUNCTIE DRAAIT ─────────────────────
  begin
    select case
             when position('_book_onetime_if_due' in pg_get_functiondef(p.oid)) > 0
               then 'plak 55 (roept _book_onetime_if_due aan)'
             else 'OUDE VERSIE — plak 55 zit er niet in'
           end
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_book_invoice_commission'
     limit 1;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p58 values (2, '_book_invoice_commission', coalesce(v_txt, 'BESTAAT NIET'));

  -- ── 3. DE TRIGGER OP FACTUREN ─────────────────────────────────────
  begin
    select coalesce(string_agg(t.tgname || ' -> ' || p.proname ||
             case when position('_book_invoice_commission' in pg_get_functiondef(p.oid)) > 0
                  then ' (roept de boekfunctie aan)'
                  else ' (heeft de boeking zelf in zich!)' end, ' · '), 'GEEN TRIGGER')
      into v_txt
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'invoices' and not t.tgisinternal
       and pg_get_functiondef(p.oid) ilike '%commission%';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p58 values (3, 'trigger op invoices', v_txt);

  -- ── 4. PIETS KOPPELING ────────────────────────────────────────────
  begin
    select l.id into v_link
      from public.referral_links l
      join public.advertisers a on a.id = l.referred_advertiser_id
     where a.tenant_client_code = 'PSM0010'
     limit 1;

    select coalesce(string_agg(coalesce(rc.source, '?') || ' ' ||
                               to_char(rc.amount, 'FM999G990D00') || ' ' ||
                               coalesce(rc.currency, '') || ' (' || coalesce(rc.status, 'unpaid') || ')',
                               ' · ' order by rc.created_at), 'nog geen commissie')
      into v_txt
      from public.referral_commissions rc
     where rc.referral_link_id = v_link;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p58 values (4, 'commissie op Piets koppeling',
    coalesce(v_link::text, 'GEEN KOPPELING') || ' — ' || coalesce(v_txt, '?'));

  -- ── 5. EN NU DE BONUS ZELF PROBEREN ───────────────────────────────
  begin
    if v_link is null then
      v_txt := 'overgeslagen: geen koppeling gevonden';
    else
      select public._book_onetime_if_due(v_link, now(), null, null) into v_out;
      v_txt := case when coalesce(v_out, 0) > 0
                    then 'GEBOEKT: ' || to_char(v_out, 'FM999G990D00')
                    else 'niets geboekt (functie gaf 0 terug — er is geen regel, hij staat er al, of de affiliate is inactief)' end;
    end if;
  exception when others then
    v_txt := 'MISLUKT: ' || sqlerrm;
  end;
  insert into _p58 values (5, 'bonus alsnog boeken', v_txt);

  -- ── 6. WAT ER NU STAAT ────────────────────────────────────────────
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
  insert into _p58 values (6, 'alle commissie van PSM0005 per soort', v_txt);
end
$blk0$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p58 order by nr;
