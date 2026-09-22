-- =====================================================================
-- PLAK 47 — abonnementsmails: elke melding hooguit één keer gemaild
-- =====================================================================
-- De eigenaar, 22-09: "ik wil voor subscription ook een email reminder".
-- Vanaf nu gaat bij drie meldingen ook een mail uit (de app regelt dat):
--   nieuwe factuur / factuur binnenkort afgeschreven / afschrijven mislukt.
--
-- De meldingen-webhook kan een aanroep opnieuw proberen, en een klant mag
-- "je factuur staat klaar" niet drie keer krijgen. Daarom claimt de app
-- per melding eerst een rij in deze tabel en mailt alleen als dat lukt.
-- Zolang deze tabel er niet is, gaat er GEEN mail uit (de rest werkt
-- gewoon).
--
-- Alleen de server (service key) schrijft hier: RLS aan, geen policies.
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create table if not exists public.notification_emails (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.notification_emails enable row level security;
revoke all on public.notification_emails from anon, authenticated;

select 1 as nr, 'notification_emails' as item,
  case when to_regclass('public.notification_emails') is not null
       then 'staat; RLS ' || (select case when relrowsecurity then 'aan' else 'UIT' end
                                from pg_class where oid = 'public.notification_emails'::regclass)
       else 'ONTBREEKT' end as antwoord
union all
select 2, 'open abonnementsfacturen die binnen 3 dagen vervallen (krijgen morgenochtend een herinnering)',
  coalesce((select string_agg(coalesce(a.tenant_client_code, '?') || ' ' || coalesce(i.number::text, '?') || ' ' ||
                              coalesce(i.total::text, '?') || ' ' || coalesce(i.currency, '') || ' due ' ||
                              coalesce(i.due_date::text, '?') || ' (' || coalesce(i.status, '?') || ')', E'\n')
              from public.invoices i
              left join public.advertisers a on a.id = i.advertiser_id
             where lower(coalesce(i.type, '')) in ('subscription', 'subscription_adjustment')
               and lower(coalesce(i.status, '')) not in ('paid', 'void', 'voided', 'cancelled')
               and i.due_date::date between current_date and current_date + 3), 'geen');
