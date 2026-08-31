-- Wise suggest-mode: safe start where nothing auto-completes.
--
-- Until the matching is proven, the webhook should NOT complete
-- topups on its own. Instead it records the deposit + the suggested
-- topup, and an admin confirms it by hand. Once confident, flip
-- WISE_AUTO_SETTLE=true and matches complete automatically.
--
-- Changes:
--   - suggested_topup_id column + 'suggested' / 'confirmed' statuses
--     on wise_incoming_transfers.
--   - wise_record_and_settle gains p_auto_settle. When false (the
--     default start), a confident match is stored as 'suggested' with
--     the topup id, but the topup stays pending.
--   - wise_confirm_suggestion(transfer_id): an admin completes the
--     suggested topup — the same idempotent, status='pending' guard.

alter table public.wise_incoming_transfers
  add column if not exists suggested_topup_id uuid
    references public.wallet_topups(id) on delete set null;

alter table public.wise_incoming_transfers
  drop constraint if exists wise_incoming_transfers_status_check;
alter table public.wise_incoming_transfers
  add constraint wise_incoming_transfers_status_check
  check (status in (
    'received', 'matched', 'unmatched', 'ambiguous',
    'suggested', 'confirmed'
  ));

-- Recreate the settle RPC with the auto-settle switch.
drop function if exists public.wise_record_and_settle(text, integer, text, text, uuid, text);

create or replace function public.wise_record_and_settle(
  p_external_id  text,
  p_amount_cents integer,
  p_currency     text,
  p_reference    text,
  p_topup_id     uuid,
  p_note         text default null,
  p_auto_settle  boolean default false
)
returns public.wise_incoming_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.wise_incoming_transfers%rowtype;
  v_topup    public.wallet_topups%rowtype;
  v_ten      uuid;
  v_status   text;
  v_suggest  uuid;
  v_updated  integer;
  v_row      public.wise_incoming_transfers%rowtype;
begin
  if p_external_id is null or length(p_external_id) = 0 then
    raise exception 'external_id required' using errcode = '22000';
  end if;

  select * into v_existing
    from public.wise_incoming_transfers
   where external_id = p_external_id;
  if found then
    return v_existing;
  end if;

  v_status := 'unmatched';

  if p_topup_id is not null then
    select * into v_topup
      from public.wallet_topups
     where id = p_topup_id
     for update;

    if found
       and v_topup.status = 'pending'
       and upper(coalesce(v_topup.currency, '')) = upper(p_currency)
       and abs(round(v_topup.amount * 100)::int - p_amount_cents) <= 1
    then
      v_ten := v_topup.tenant_id;
      if p_auto_settle then
        update public.wallet_topups
           set status = 'completed', updated_at = now()
         where id = p_topup_id and status = 'pending';
        get diagnostics v_updated = row_count;
        if v_updated = 1 then
          v_status := 'matched';
        end if;
      else
        -- Suggest only — leave the topup pending for admin confirm.
        v_status := 'suggested';
        v_suggest := p_topup_id;
      end if;
    end if;
  end if;

  insert into public.wise_incoming_transfers (
    tenant_id, external_id, amount_cents, currency, reference,
    status, matched_topup_id, suggested_topup_id, note
  ) values (
    v_ten, p_external_id, p_amount_cents, upper(p_currency), p_reference,
    v_status,
    case when v_status = 'matched' then p_topup_id else null end,
    v_suggest,
    p_note
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wise_record_and_settle(text, integer, text, text, uuid, text, boolean) from public;

-- Admin confirms a suggested transfer → completes the topup.
create or replace function public.wise_confirm_suggestion(
  p_transfer_id uuid
)
returns public.wise_incoming_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   record;
  v_tr      public.wise_incoming_transfers%rowtype;
  v_topup   public.wallet_topups%rowtype;
  v_updated integer;
  v_row     public.wise_incoming_transfers%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  select * into v_tr
    from public.wise_incoming_transfers
   where id = p_transfer_id
   for update;
  if not found then
    raise exception 'Transfer not found' using errcode = '42704';
  end if;
  if v_tr.tenant_id is not null and v_tr.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_tr.status <> 'suggested' or v_tr.suggested_topup_id is null then
    raise exception 'Nothing to confirm' using errcode = '22000';
  end if;

  select * into v_topup
    from public.wallet_topups
   where id = v_tr.suggested_topup_id
   for update;
  if not found or v_topup.status <> 'pending' then
    raise exception 'Topup no longer pending' using errcode = '22000';
  end if;
  if v_topup.tenant_id <> v_admin.tenant_id then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update public.wallet_topups
     set status = 'completed', updated_at = now()
   where id = v_topup.id and status = 'pending';
  get diagnostics v_updated = row_count;

  update public.wise_incoming_transfers
     set status = case when v_updated = 1 then 'confirmed' else status end,
         matched_topup_id = case when v_updated = 1 then v_topup.id else matched_topup_id end,
         updated_at = now()
   where id = p_transfer_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wise_confirm_suggestion(uuid) from public;
grant execute on function public.wise_confirm_suggestion(uuid) to authenticated;
