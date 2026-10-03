-- ════════════════════════════════════════════════════════════════════
-- PLAK 202 -- Wise-betalingen naar Muxue vanzelf in het Bestads-saldo
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 03-10: "alle Wise betalingen naar MUXUE moeten als wallet
-- balance top-up bij Bestads ... just upcoming payments, USD en EUR."
--
-- Twee kolommen op supplier_ledger_lines:
--   external_ref   'wise:<transfer-id>' -- elke Wise-betaling EEN keer
--                  (unieke index per tenant; NULL voor regels met de hand)
--   usd_confirmed  false zolang een betaling die in EUR aankwam nog onze
--                  schatting draagt i.p.v. wat Bestads echt bijschreef
--
-- Zonder deze plak doet de code niets met Wise (hij leest en boekt alleen
-- als de kolommen er zijn). Geen nieuwe tabel; de bestaande audit- en
-- updated_at-triggers dekken deze tabel al.
--
-- Twee keer plakken kan.

do $blk0$
begin
  alter table public.supplier_ledger_lines add column if not exists external_ref text;
  alter table public.supplier_ledger_lines add column if not exists usd_confirmed boolean not null default true;
  create unique index if not exists supplier_ledger_lines_external_ref_uq
    on public.supplier_ledger_lines (tenant_id, external_ref)
    where external_ref is not null;
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_ledger_lines'
      and column_name in ('external_ref', 'usd_confirmed')) as kolommen_moet_2,
  exists (select 1 from pg_indexes
           where schemaname = 'public' and indexname = 'supplier_ledger_lines_external_ref_uq') as unieke_index_moet_true,
  (select count(*) from public.supplier_ledger_lines where usd_confirmed is not true) as onbevestigd_moet_0;
