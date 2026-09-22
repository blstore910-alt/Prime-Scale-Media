-- ════════════════════════════════════════════════════════════════════
--  PLAK 54 — F3 AFSLUITEN: klopt de uitbetaling met de database?
--
--  ALLEEN LEZEN. Verandert niets.
--
--  Reis F3, zojuist gelopen op productie: PSM0005 vroeg uitbetaling van
--  EUR 4,96, jij hebt hem in de wachtrij gezien en op betaald gezet met
--  je eigen referentie. Dit is diezelfde reis aan de databasekant:
--
--    1  de uitbetaling zelf: nummer, bedrag, status, referentie
--    2  de commissies die erin zitten: betaald, met datum, aan die rij
--    3  staat er niets dubbel open voor deze affiliate
--    4  de meldingen van deze reis (aanvraag -> betaald)
--    5  en: hoeveel actieve koersen staan er? (er waren er twee)
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p54;
create temp table _p54(nr int, wat text, uitkomst text);

do $blk0$
declare
  v_aff   uuid;
  v_txt   text;
  v_n     int;
begin
  select a.id into v_aff
    from public.advertisers a
   where a.tenant_client_code = 'PSM0005'
   limit 1;

  -- ── 1. DE UITBETALING ─────────────────────────────────────────────
  select coalesce(string_agg(
           '#' || coalesce(p.payout_no::text, '?') ||
           ' · ' || upper(coalesce(p.payout_currency, p.currency)) || ' ' ||
           to_char(coalesce(p.payout_amount, p.amount), 'FM999G999G990D00') ||
           ' · ' || p.status ||
           ' · gevraagd ' || left(p.requested_at::text, 16) ||
           ' · betaald ' || coalesce(left(p.paid_at::text, 16), '-') ||
           ' · ref: ' || coalesce(p.reference, '-') ||
           ' · commissies: ' || coalesce(p.commission_count::text, '?'), ' | ' order by p.payout_no), 'GEEN')
    into v_txt
    from public.affiliate_payouts p
   where p.affiliate_advertiser_id = v_aff;
  insert into _p54 values (1, 'Uitbetalingen van PSM0005', v_txt);

  -- ── 2. DE COMMISSIES DIE ERIN ZITTEN ──────────────────────────────
  select coalesce(string_agg(
           upper(coalesce(rc.currency, 'EUR')) || ' ' ||
           to_char(rc.amount, 'FM999G999G990D00') ||
           ' · ' || coalesce(rc.status, 'unpaid') ||
           ' · betaald op ' || coalesce(left(rc.paid_at::text, 16), 'GEEN DATUM') ||
           ' · hangt aan #' || coalesce((select payout_no::text from public.affiliate_payouts
                                          where id = rc.payout_id), 'LOS'), ' | '
           order by rc.created_at), 'geen rijen')
    into v_txt
    from public.referral_commissions rc
    join public.referral_links l on l.id = rc.referral_link_id
   where l.affiliate_advertiser_id = v_aff;
  insert into _p54 values (2, 'Commissies van PSM0005', v_txt);

  -- ── 3. STAAT ER NOG IETS OPEN ─────────────────────────────────────
  select count(*) into v_n
    from public.referral_commissions rc
    join public.referral_links l on l.id = rc.referral_link_id
   where l.affiliate_advertiser_id = v_aff
     and coalesce(rc.status, 'unpaid') = 'unpaid';
  insert into _p54 values (3, 'Nog onbetaalde commissie bij PSM0005',
    v_n::text || ' rijen (verwacht 0 — alles is zojuist uitbetaald)');

  -- ── 4. DE MELDINGEN VAN DEZE REIS ─────────────────────────────────
  select coalesce(string_agg(x.t || ' ×' || x.c::text, ' · ' order by x.t), 'GEEN')
    into v_txt
    from (
      select n.type as t, count(*) as c
        from public.notifications n
       where n.created_at > now() - interval '6 hours'
         and n.type in ('affiliate_payout_requested','affiliate_payout_paid','affiliate_payout_rejected')
       group by n.type
    ) x;
  insert into _p54 values (4, 'Meldingen rond de uitbetaling (6 u)', v_txt);

  -- ── 5. DE KOERS ───────────────────────────────────────────────────
  select coalesce(string_agg(coalesce(t.name, left(er.tenant_id::text, 8)) ||
                             ': 1 USD = ' || to_char(er.eur, 'FM990D000000') || ' EUR' ||
                             ' (bijgewerkt ' || coalesce(left(er.updated_at::text, 16), '?') || ')',
                             ' · ' order by er.updated_at desc nulls last), 'GEEN')
    into v_txt
    from public.exchange_rates er
    left join public.tenants t on t.id = er.tenant_id
   where coalesce(er.is_active, true);
  insert into _p54 values (5, 'Actieve koersen', v_txt);

  -- ── 6. WAT EEN ZELFFACTUUR OP ONZE NAAM ZET ───────────────────────
  select coalesce(string_agg(coalesce(c.name, '(geen naam)') ||
                             ' · ' || coalesce(c.address, 'geen adres') ||
                             ' · btw ' || coalesce(c.vat_no, '-'), ' · '), 'GEEN tenant-bedrijf ingevuld')
    into v_txt
    from public.companies c
   where c.advertiser_id is null;
  insert into _p54 values (6, 'Ons eigen bedrijf op de factuur', v_txt);
end
$blk0$;

select nr as "#", wat as "wat gecontroleerd", uitkomst as "uitkomst"
  from _p54 order by nr;
