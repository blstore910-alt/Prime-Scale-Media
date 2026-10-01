-- ════════════════════════════════════════════════════════════════════
-- PLAK 193 -- geen leverancier of intern type in een notitie die de
--             klant kan lezen (lekcontrole 01-10, L4)
-- ════════════════════════════════════════════════════════════════════
--
-- advertisers.note en top_ups.notes zijn vrije tekst van een admin, en
-- de klant kan zijn eigen rij lezen. Vandaag staat er niets verkeerds in
-- (gecontroleerd), maar één getypte leveranciersnaam en hij staat in de
-- JSON achter de pagina van de klant.
--
-- Deze bewaker weigert zo'n notitie, met uitleg. Interne notities horen
-- op een plek die alleen admins lezen (het accountdetail van een ad
-- account is dat sinds plak 192 wel).
--
-- Twee keer plakken kan.

create or replace function public._guard_customer_readable_note()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $blk0$
declare
  v_tekst text;
begin
  v_tekst := case tg_table_name
    when 'advertisers' then new.note
    when 'top_ups' then new.notes
  end;
  if v_tekst is not null and v_tekst ~* '(rock ?ads|seam ?x|falkyn|bestads|muxue|gradyn|slash|hk-meta|eu-meta|meta-hk|meta-eu|(^|[^a-z])(hk|gh)([^a-z]|$))' then
    raise exception 'De klant kan deze notitie lezen. Laat de leveranciers- of typenaam weg (lekcontrole 01-10).'
      using errcode = '22023';
  end if;
  return new;
end;
$blk0$;
revoke all on function public._guard_customer_readable_note() from public, anon;

do $blk1$
begin
  drop trigger if exists a3_guard_customer_readable_note on public.advertisers;
  create trigger a3_guard_customer_readable_note
    before insert or update of note on public.advertisers
    for each row execute function public._guard_customer_readable_note();

  drop trigger if exists a3_guard_customer_readable_note on public.top_ups;
  create trigger a3_guard_customer_readable_note
    before insert or update of notes on public.top_ups
    for each row execute function public._guard_customer_readable_note();
end;
$blk1$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select count(*) from pg_trigger where tgname = 'a3_guard_customer_readable_note') as bewakers_moet_2,
  (select count(*) from public.advertisers where note ~* '(rock ?ads|seam ?x|falkyn|bestads|muxue|gradyn|slash|hk-meta|eu-meta)') as advertiser_notities_fout,
  (select count(*) from public.top_ups where notes ~* '(rock ?ads|seam ?x|falkyn|bestads|muxue|gradyn|slash|hk-meta|eu-meta)')     as topup_notities_fout;
