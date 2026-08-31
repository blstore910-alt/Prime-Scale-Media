-- Reliable Wise matching: sender-bank learning.
--
-- Amount-only matching breaks when several customers send the same
-- amount. Two stronger signals:
--   1. the payment reference (the topup's reference_no the customer
--      typed) — handled by the matcher already.
--   2. the SENDER's bank account. Once we've confidently matched a
--      payment to a customer (via reference), we remember that
--      sender IBAN belongs to that advertiser. A later payment from
--      the same IBAN then matches the advertiser even with no
--      reference.
--
-- This table is the learned map. Rows are written by the webhook
-- path (service role) after a confident match; admins can read it.

-- Extra columns on the incoming ledger to capture who sent it.
alter table public.wise_incoming_transfers
  add column if not exists sender_iban text,
  add column if not exists sender_name text;

create table if not exists public.advertiser_bank_senders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  advertiser_id uuid not null references public.advertisers(id) on delete cascade,
  -- Normalised (uppercased, spaces stripped) IBAN. One IBAN can map to
  -- SEVERAL advertisers — a customer may run multiple accounts (e.g. 3
  -- PSM accounts) all paying from the same bank. So the link is unique
  -- per (iban, advertiser), not per iban.
  sender_iban text not null,
  sender_name text,
  first_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advertiser_bank_senders_iban_adv_uq
    unique (tenant_id, sender_iban, advertiser_id)
);

create index if not exists advertiser_bank_senders_iban_idx
  on public.advertiser_bank_senders (tenant_id, sender_iban);

create index if not exists advertiser_bank_senders_advertiser_idx
  on public.advertiser_bank_senders (advertiser_id);

alter table public.advertiser_bank_senders enable row level security;

drop policy if exists bank_senders_admin_read on public.advertiser_bank_senders;
create policy bank_senders_admin_read on public.advertiser_bank_senders
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
       where up.user_id = auth.uid()
         and up.tenant_id = advertiser_bank_senders.tenant_id
         and up.role = 'admin'
    )
  );

-- Remember a sender IBAN → advertiser link. Idempotent on
-- (tenant, iban). Called from the webhook after a confident match.
create or replace function public.wise_remember_sender(
  p_tenant_id uuid,
  p_advertiser_id uuid,
  p_sender_iban text,
  p_sender_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iban text;
begin
  if p_sender_iban is null or length(p_sender_iban) = 0 then
    return;
  end if;
  v_iban := upper(regexp_replace(p_sender_iban, '\s', '', 'g'));

  insert into public.advertiser_bank_senders (
    tenant_id, advertiser_id, sender_iban, sender_name
  ) values (
    p_tenant_id, p_advertiser_id, v_iban, p_sender_name
  )
  on conflict (tenant_id, sender_iban, advertiser_id) do update
    set sender_name = coalesce(excluded.sender_name, advertiser_bank_senders.sender_name),
        updated_at = now();
end;
$$;

revoke all on function public.wise_remember_sender(uuid, uuid, text, text) from public;
-- service-role only (webhook).

drop trigger if exists trg_touch_advertiser_bank_senders on public.advertiser_bank_senders;
create trigger trg_touch_advertiser_bank_senders
  before update on public.advertiser_bank_senders
  for each row execute function public._touch_updated_at();
