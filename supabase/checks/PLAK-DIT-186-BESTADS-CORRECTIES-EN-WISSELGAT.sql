-- ════════════════════════════════════════════════════════════════════
-- PLAK 186 -- Bestads: correcties met goedkeuring, en het wisselgat
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "admins moeten correctie kunnen aanvragen op
-- Bestads, en als wij EUR sturen wisselen zij om naar USD, daar zit ook
-- een kleine gap, en DST dus."
--
-- Op supplier_ledger_lines (plak 185):
--
--   status         approved | pending | rejected. Een correctie van een
--                  admin begint als pending en telt niet mee tot een
--                  eigenaar hem goedkeurt. Alles wat er al stond is
--                  approved.
--   requested_by / decided_by / decided_at / reject_reason
--                  wie vroeg, wie besliste, wanneer, en waarom niet.
--   sent_amount / sent_currency
--                  bij een storting: wat WIJ stuurden (bv. EUR 4000),
--                  naast amount = wat zij in USD bijschreven. Het verschil
--                  met onze koers is het wisselgat.
--   kind           er komt 'adjustment_out' bij: een correctie naar
--                  beneden. 'adjustment' blijft de correctie naar boven.
--
-- Twee keer plakken kan.

do $blk0$
begin
  alter table public.supplier_ledger_lines
    add column if not exists status text not null default 'approved',
    add column if not exists requested_by uuid,
    add column if not exists decided_by uuid,
    add column if not exists decided_at timestamptz,
    add column if not exists reject_reason text,
    add column if not exists sent_amount numeric(14, 2),
    add column if not exists sent_currency text;

  alter table public.supplier_ledger_lines drop constraint if exists supplier_ledger_lines_status_check;
  alter table public.supplier_ledger_lines add constraint supplier_ledger_lines_status_check
    check (status in ('approved', 'pending', 'rejected'));
  alter table public.supplier_ledger_lines drop constraint if exists supplier_ledger_lines_reject_reason_check;
  alter table public.supplier_ledger_lines add constraint supplier_ledger_lines_reject_reason_check
    check (reject_reason is null or length(reject_reason) <= 300);
  alter table public.supplier_ledger_lines drop constraint if exists supplier_ledger_lines_sent_check;
  alter table public.supplier_ledger_lines add constraint supplier_ledger_lines_sent_check
    check ((sent_amount is null and sent_currency is null)
        or (sent_amount > 0 and sent_currency in ('EUR', 'USD')));

  alter table public.supplier_ledger_lines drop constraint if exists supplier_ledger_lines_kind_check;
  alter table public.supplier_ledger_lines add constraint supplier_ledger_lines_kind_check
    check (kind in ('deposit', 'customer_topup', 'fee', 'dst', 'adjustment', 'adjustment_out'));
end
$blk0$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_name = 'supplier_ledger_lines'
      and column_name in ('status','requested_by','decided_by','decided_at','reject_reason','sent_amount','sent_currency')) as kolommen_van_7,
  pg_get_constraintdef((select oid from pg_constraint where conname = 'supplier_ledger_lines_kind_check')) ~ 'adjustment_out' as correctie_omlaag,
  case when (select count(*) from information_schema.columns
              where table_name = 'supplier_ledger_lines'
                and column_name in ('status','requested_by','decided_by','decided_at','reject_reason','sent_amount','sent_currency')) = 7
       then 'OK' else 'NIET GOED -- meld het' end as uitkomst;
