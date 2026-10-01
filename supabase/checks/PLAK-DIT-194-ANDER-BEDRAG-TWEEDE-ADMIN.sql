-- ════════════════════════════════════════════════════════════════════
-- PLAK 194 -- een wallet top-up bijschrijven met het ECHT ontvangen
--             bedrag, altijd door twee admins
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "wat als iemand de referentie goed heeft maar te
-- weinig overmaakt -- kunnen we dan het echte bedrag bijschrijven?" En:
-- "het moet altijd geverifieerd worden door een 2de admin; lager mag,
-- hoger moet een super admin."
--
--   wallet_topup_propose_amount(id, bedrag, reden)
--       een admin stelt het ontvangen bedrag voor, met reden. Er wordt
--       nog NIETS bijgeschreven.
--   wallet_topup_confirm_amount(id)
--       een ANDERE admin bevestigt. Hoger dan wat de klant opgaf: alleen
--       een eigenaar (super admin). Dan pas: bedrag = ontvangen, status
--       completed -- en de bestaande trigger schrijft het bij, precies
--       zoals bij een gewone Verify.
--   wallet_topup_cancel_proposal(id)
--       het voorstel intrekken (elke admin).
--
-- Kolommen op wallet_topups: claimed_amount (wat de klant opgaf, bewaard
-- zodra het bedrag wijzigt) en proposed_amount / _reason / _by / _at.
-- De auditregel (trg_audit_wallet_topups) legt elke stap vast.
--
-- Twee keer plakken kan.

do $blk0$
begin
  alter table public.wallet_topups
    add column if not exists claimed_amount  numeric,
    add column if not exists proposed_amount numeric,
    add column if not exists proposed_reason text,
    add column if not exists proposed_by     uuid,
    add column if not exists proposed_at     timestamptz;
end;
$blk0$;

-- ── 1. VOORSTELLEN ──────────────────────────────────────────────────
create or replace function public.wallet_topup_propose_amount(
  p_topup_id uuid,
  p_amount numeric,
  p_reason text
)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public, pg_temp
as $blk1$
declare
  v_admin record;
  v_t public.wallet_topups%rowtype;
  v_reden text := btrim(coalesce(p_reason, ''));
begin
  select * into v_admin from public._require_profile('admin');
  if v_admin.profile_id is null then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
  select * into v_t from public.wallet_topups where id = p_topup_id for update;
  if not found then raise exception 'Top-up not found.' using errcode = '42704'; end if;
  if v_t.tenant_id <> v_admin.tenant_id then raise exception 'Forbidden' using errcode = '42501'; end if;
  if v_t.status <> 'pending' then raise exception 'This top-up is not waiting any more.' using errcode = '22000'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'The received amount has to be above zero.' using errcode = '22023'; end if;
  if round(p_amount, 2) <> p_amount then raise exception 'Use at most two decimals.' using errcode = '22023'; end if;
  if p_amount = v_t.amount then raise exception 'That is the amount the customer gave -- just press Verify.' using errcode = '22023'; end if;
  if length(v_reden) < 5 then raise exception 'Say why, so the second admin and the customer understand it.' using errcode = '22023'; end if;

  update public.wallet_topups
     set proposed_amount = p_amount,
         proposed_reason = left(v_reden, 300),
         proposed_by = v_admin.profile_id,
         proposed_at = now(),
         updated_at = now()
   where id = p_topup_id
  returning * into v_t;
  return v_t;
end;
$blk1$;
revoke all on function public.wallet_topup_propose_amount(uuid, numeric, text) from public, anon;
grant execute on function public.wallet_topup_propose_amount(uuid, numeric, text) to authenticated, service_role;

-- ── 2. BEVESTIGEN (DE TWEEDE ADMIN) ─────────────────────────────────
create or replace function public.wallet_topup_confirm_amount(p_topup_id uuid)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public, pg_temp
as $blk2$
declare
  v_admin record;
  v_t public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');
  if v_admin.profile_id is null then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
  select * into v_t from public.wallet_topups where id = p_topup_id for update;
  if not found then raise exception 'Top-up not found.' using errcode = '42704'; end if;
  if v_t.tenant_id <> v_admin.tenant_id then raise exception 'Forbidden' using errcode = '42501'; end if;
  if v_t.status <> 'pending' then raise exception 'This top-up is not waiting any more.' using errcode = '22000'; end if;
  if v_t.proposed_amount is null then raise exception 'There is no other amount proposed.' using errcode = '22000'; end if;
  if v_t.proposed_by = v_admin.profile_id then
    raise exception 'You proposed this amount yourself -- a second admin has to confirm it.' using errcode = '42501';
  end if;
  if v_t.proposed_amount > v_t.amount
     and not public._in_owner_set(v_t.tenant_id, v_admin.user_id) then
    raise exception 'More than the customer gave: only a super admin can confirm that.' using errcode = '42501';
  end if;

  update public.wallet_topups
     set claimed_amount = coalesce(claimed_amount, amount),
         amount = proposed_amount,
         notes = left(trim(both ' ' from coalesce(notes, '') || ' Received ' || proposed_amount::text || ' ' || currency
                 || ' of ' || amount::text || ' ' || currency || ': ' || coalesce(proposed_reason, '')), 1000),
         status = 'completed',
         approved_by = v_admin.profile_id,
         rejection_reason = null,
         updated_at = now()
   where id = p_topup_id
  returning * into v_t;
  return v_t;
end;
$blk2$;
revoke all on function public.wallet_topup_confirm_amount(uuid) from public, anon;
grant execute on function public.wallet_topup_confirm_amount(uuid) to authenticated, service_role;

-- ── 3. INTREKKEN ────────────────────────────────────────────────────
create or replace function public.wallet_topup_cancel_proposal(p_topup_id uuid)
returns public.wallet_topups
language plpgsql
security definer
set search_path = public, pg_temp
as $blk3$
declare
  v_admin record;
  v_t public.wallet_topups%rowtype;
begin
  select * into v_admin from public._require_profile('admin');
  if v_admin.profile_id is null then
    raise exception 'Only an admin can do this.' using errcode = '42501';
  end if;
  select * into v_t from public.wallet_topups where id = p_topup_id for update;
  if not found then raise exception 'Top-up not found.' using errcode = '42704'; end if;
  if v_t.tenant_id <> v_admin.tenant_id then raise exception 'Forbidden' using errcode = '42501'; end if;
  update public.wallet_topups
     set proposed_amount = null, proposed_reason = null, proposed_by = null, proposed_at = null, updated_at = now()
   where id = p_topup_id
  returning * into v_t;
  return v_t;
end;
$blk3$;
revoke all on function public.wallet_topup_cancel_proposal(uuid) from public, anon;
grant execute on function public.wallet_topup_cancel_proposal(uuid) to authenticated, service_role;

-- ── 4. GEWOON VERIFY MAG NIET ZOLANG ER EEN VOORSTEL OPEN STAAT ─────
-- Anders schrijft iemand toch het opgegeven bedrag bij terwijl een
-- collega net zag dat er minder binnenkwam.
create or replace function public._guard_verify_with_open_proposal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $blk4$
begin
  if new.status = 'completed' and old.status = 'pending'
     and old.proposed_amount is not null
     and new.amount is not distinct from old.amount then
    raise exception 'Another amount is proposed for this top-up. Confirm or cancel that first.' using errcode = '22000';
  end if;
  return new;
end;
$blk4$;
revoke all on function public._guard_verify_with_open_proposal() from public, anon;

do $blk5$
begin
  drop trigger if exists a2_guard_verify_with_open_proposal on public.wallet_topups;
  create trigger a2_guard_verify_with_open_proposal
    before update of status on public.wallet_topups
    for each row execute function public._guard_verify_with_open_proposal();
end;
$blk5$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns where table_name = 'wallet_topups'
     and column_name in ('claimed_amount', 'proposed_amount', 'proposed_reason', 'proposed_by', 'proposed_at')) as kolommen_moet_5,
  (select count(*) from pg_proc where proname in ('wallet_topup_propose_amount', 'wallet_topup_confirm_amount', 'wallet_topup_cancel_proposal')) as functies_moet_3,
  (has_function_privilege('anon', 'public.wallet_topup_propose_amount(uuid, numeric, text)', 'execute')
   or has_function_privilege('anon', 'public.wallet_topup_confirm_amount(uuid)', 'execute')
   or has_function_privilege('anon', 'public.wallet_topup_cancel_proposal(uuid)', 'execute')) as anon_mag_moet_false,
  (select count(*) from pg_trigger where tgname = 'a2_guard_verify_with_open_proposal') as bewaker_moet_1;
