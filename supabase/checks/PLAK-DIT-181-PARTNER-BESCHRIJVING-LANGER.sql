-- ════════════════════════════════════════════════════════════════════
-- PLAK 181 -- een partner mag een echte beschrijving hebben (400 tekens)
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "Prime Scale Fulfillment moet volledig leesbaar
-- en meer description". De tekst onder de naam was begrensd op 120
-- tekens (plak 174) -- een regel, geen beschrijving. Nu 400.
--
-- Raakt alleen de check op partners.tagline. Geen data, geen rechten.
-- Twee keer plakken kan: de drop is "if exists".

do $blk0$
begin
  alter table public.partners drop constraint if exists partners_tagline_check;
  alter table public.partners
    add constraint partners_tagline_check
    check (tagline is null or length(tagline) <= 400);
end
$blk0$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  conname as regel,
  pg_get_constraintdef(oid) as nu,
  case when pg_get_constraintdef(oid) like '%400%'
       then 'OK -- 400 tekens'
       else 'NIET GOED -- meld het' end as uitkomst
from pg_constraint
where conrelid = 'public.partners'::regclass
  and conname = 'partners_tagline_check';
