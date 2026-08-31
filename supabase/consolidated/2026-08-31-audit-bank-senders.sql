-- Logbook completeness: advertiser_bank_senders was the one new
-- financial-adjacent table without an audit trigger (it only had
-- touch-updated_at). Add it so every learned sender→advertiser link
-- change is reconstructable from audit_events, like the rest.

drop trigger if exists trg_audit_advertiser_bank_senders on public.advertiser_bank_senders;
create trigger trg_audit_advertiser_bank_senders
  after insert or update or delete on public.advertiser_bank_senders
  for each row execute function public._audit_row_change();
