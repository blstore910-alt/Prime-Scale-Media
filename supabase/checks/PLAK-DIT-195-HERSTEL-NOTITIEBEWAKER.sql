-- ════════════════════════════════════════════════════════════════════
-- PLAK 195 -- HERSTEL: de notitiebewaker van plak 193 blokkeerde
--             nieuwe adverteerders en nieuwe top-ups
-- ════════════════════════════════════════════════════════════════════
--
-- Test 4, 01-10: aanmelden gaf "Failed to create user profile".
-- _guard_customer_readable_note las new.note EN new.notes in één CASE.
-- PL/pgSQL zoekt dat veld op ook als die tak niet gekozen wordt, en
-- advertisers heeft geen "notes", top_ups geen "note" -> elke INSERT op
-- beide tabellen faalde: geen nieuwe klant, geen nieuwe ad-account
-- top-up.
--
-- Nu via to_jsonb(new): een ontbrekend veld is gewoon null.
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
  v_tekst := coalesce(to_jsonb(new) ->> 'note', to_jsonb(new) ->> 'notes');
  if v_tekst is not null and v_tekst ~* '(rock ?ads|seam ?x|falkyn|bestads|muxue|gradyn|slash|hk-meta|eu-meta|meta-hk|meta-eu|(^|[^a-z])(hk|gh)([^a-z]|$))' then
    raise exception 'De klant kan deze notitie lezen. Laat de leveranciers- of typenaam weg (lekcontrole 01-10).'
      using errcode = '22023';
  end if;
  return new;
end;
$blk0$;
revoke all on function public._guard_customer_readable_note() from public, anon;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  position('to_jsonb(new)' in pg_get_functiondef('public._guard_customer_readable_note()'::regprocedure)) > 0 as hersteld,
  (select count(*) from pg_trigger where tgname = 'a3_guard_customer_readable_note') as bewakers_moet_2;
