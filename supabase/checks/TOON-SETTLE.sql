-- =====================================================================
-- TOON-SETTLE — alleen lezen. Eén functie, één resultaat.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en RLS geldt niet voor die rol. Er wordt NIETS geschreven.
--
-- WAAROM
--   wallet_precharge_settle heeft geen ondergrens, terwijl z'n buurman
--   wallet_precharge_cancel wél weigert onder nul te gaan en het tekort
--   noemt. Voorschot €1.000, klant geeft er €800 van uit, jij drukt op
--   Verrekenen: saldo −€800. Daarna weigert elke betaling en staat de
--   klant 's nachts op achterstand.
--
--   Ik schrijf die controle exact in plaats van hem op de gok ervoor te
--   plakken — het is een functie die geld van een wallet afhaalt.
--
--   Stuur de tabel terug (of Download CSV).
-- =====================================================================

select p.proname                                  as "functie",
       t.ln::int                                  as "#",
       t.regel                                    as "regel"
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join lateral regexp_split_to_table(pg_get_functiondef(p.oid), E'\n')
       with ordinality as t(regel, ln) on true
 where n.nspname = 'public'
   and p.prokind = 'f'
   and p.proname = 'wallet_precharge_settle'
 order by t.ln;
