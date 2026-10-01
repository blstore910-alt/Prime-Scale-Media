-- ════════════════════════════════════════════════════════════════════
-- PLAK 200 -- exchange_rates.source: waar de koers vandaan kwam
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: onder de koers mag "Wise" staan als hij van Wise
-- komt. De refresh haalt sinds commit cff5a7c2 eerst bij Wise en anders
-- bij de open feed; deze kolom onthoudt welke. De code werkt ook zonder
-- deze plak (hij schrijft dan zonder bron en toont "middenkoers").
--
-- Twee keer plakken kan.

do $blk0$
begin
  alter table public.exchange_rates add column if not exists source text;
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'exchange_rates' and column_name = 'source'
  ) as kolom_er_moet_true,
  (select count(*) from public.exchange_rates where is_active) as actieve_rijen;
