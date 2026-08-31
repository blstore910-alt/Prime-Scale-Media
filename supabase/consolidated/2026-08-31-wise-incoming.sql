-- Wise incoming-transfer ledger + idempotent settle.
--
-- Money-critical safety: a single Wise transfer must settle AT MOST
-- ONE wallet top-up, and a top-up must complete AT MOST ONCE. Two
-- guards enforce that:
--
--   1. wise_incoming_transfers.external_id is UNIQUE — a webhook
--      redelivery (Wise retries) for the same transfer inserts once;
--      the second attempt hits the conflict and is a no-op.
--   2. Completion is an UPDATE ... WHERE status = 'pending', so even
--      if two events raced, only the first flips the topup; the
--      second updates 0 rows.
--
-- Both live inside one SECURITY DEFINER function so the record + the
-- completion commit together or not at all.

create table if not exists public.wise_incoming_transfers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  external_id text not null unique,        -- Wise transfer / transaction id
  amount_cents integer not null,
  currency text not null,
  reference text,
  status text not null default 'received'
    check (status in ('received', 'matched', 'unmatched', 'ambiguous')),
  matched_topup_id uuid references public.wallet_topups(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wise_incoming_status_idx
  on public.wise_incoming_transfers (status, created_at desc);

alter table public.wise_incoming_transfers enable row level security;

-- Admins read the ledger (for the manual-review queue). No client
-- writes — only the service-role webhook path writes, via the RPC.
drop policy if exists wise_incoming_admin_read on public.wise_incoming_transfers;
create policy wise_incoming_admin_read on public.wise_incoming_transfers
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.role = 'admin'
         and (
           wise_incoming_transfers.tenant_id is null
           or up.tenant_id = wise_incoming_transfers.tenant_id
         )
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- wise_record_and_settle
--   Records the incoming transfer (idempotent on external_id) and, if
--   a topup id is supplied, completes that topup atomically — but only
--   if it is still pending and its amount + currency still match.
--   Returns the ledger row.
--
--   p_topup_id NULL  → record only, status 'unmatched' / 'ambiguous'
--                      (matcher couldn't decide; admin reviews).
-- ─────────────────────────────────────────────────────────────────
create or replace function public.wise_record_and_settle(
  p_external_id  text,
  p_amount_cents integer,
  p_currency     text,
  p_reference    text,
  p_topup_id     uuid,
  p_note         text default null
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
  v_updated  integer;
  v_row      public.wise_incoming_transfers%rowtype;
begin
  if p_external_id is null or length(p_external_id) = 0 then
    raise exception 'external_id required' using errcode = '22000';
  end if;

  -- Idempotency: if we've already seen this transfer, return the
  -- existing record untouched. No double settle, ever.
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
      update public.wallet_topups
         set status = 'completed',
             updated_at = now()
       where id = p_topup_id
         and status = 'pending';
      get diagnostics v_updated = row_count;
      if v_updated = 1 then
        v_status := 'matched';
        v_ten := v_topup.tenant_id;
      end if;
    end if;
  end if;

  insert into public.wise_incoming_transfers (
    tenant_id, external_id, amount_cents, currency, reference,
    status, matched_topup_id, note
  ) values (
    v_ten, p_external_id, p_amount_cents, upper(p_currency), p_reference,
    v_status,
    case when v_status = 'matched' then p_topup_id else null end,
    p_note
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.wise_record_and_settle(text, integer, text, text, uuid, text) from public;
-- service-role only (webhook). No grant to authenticated.

drop trigger if exists trg_touch_wise_incoming on public.wise_incoming_transfers;
create trigger trg_touch_wise_incoming
  before update on public.wise_incoming_transfers
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_wise_incoming on public.wise_incoming_transfers;
create trigger trg_audit_wise_incoming
  after insert or update or delete on public.wise_incoming_transfers
  for each row execute function public._audit_row_change();
