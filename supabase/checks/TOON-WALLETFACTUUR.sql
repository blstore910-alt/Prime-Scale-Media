-- =====================================================================
-- TOON-WALLETFACTUUR — alleen lezen. Twee dingen die ik moet zien.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Plakken in de Supabase SQL editor en Run. Geen rol wisselen, geen
--   instelling aanzetten: de editor draait als `postgres`, dat is de
--   eigenaar, en RLS geldt niet voor die rol. Er wordt NIETS geschreven.
--   Zo vaak draaien als je wilt. Als het lang is: Download CSV.
--
-- WAAROM
--   1  Jij wilt de bankreferentie (0005-32423) op de wallet-factuur, met
--      één klik kopiëren. Die factuur wordt gemaakt door
--      create_invoice_for_wallet_topup — een functie die op de database
--      staat en in geen enkele migratie. Ik moet zien wat hij nu
--      wegschrijft voordat ik hem aanpas; een geldfunctie herschrijf ik
--      niet op de gok.
--
--   2  Er blijken meer functies alleen op live te bestaan. Bij het
--      geldonderzoek van vannacht kon een aantal dingen NIET nagekeken
--      worden om precies die reden — top_up_create_for_advertiser,
--      wallet_exchange, top_up_admin_verify, wallet_admin_adjust staan
--      nergens in de repo. Dat is een blinde vlek midden in de geldweg,
--      en bij een herstel uit backup zijn ze weg.
--
--      Deel 2 geeft me de LIJST (namen, niet de inhoud), zodat ik kan
--      zien hoe groot het is. Daarna vraag ik gericht de paar bodies op
--      die ik nog nodig heb.
-- =====================================================================

with def as (
  select pg_get_functiondef(p.oid) as src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_invoice_for_wallet_topup'
     and p.prokind = 'f'
   limit 1
),
deel1 as (
  select 1 as blok,
         'create_invoice_for_wallet_topup'::text as bron,
         t.ln::int as nr,
         t.regel::text as inhoud
    from def
    left join lateral regexp_split_to_table(def.src, E'\n')
         with ordinality as t(regel, ln) on true
),
deel2 as (
  select 2 as blok,
         'ALLE security definer functies'::text as bron,
         row_number() over (order by p.proname)::int as nr,
         (p.proname || '(' ||
          pg_get_function_identity_arguments(p.oid) || ')' ||
          case when p.prosecdef then '  [definer]' else '' end ||
          '  ' || length(p.prosrc)::text || ' tekens')::text as inhoud
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and p.proname not like 'pg\_%'
     -- Alleen wat zelf geschreven is; de extensies laten we met rust.
     and not exists (
       select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
     )
)
select blok as "blok", bron as "bron", nr as "#", inhoud as "inhoud"
  from (select * from deel1 union all select * from deel2) q
 order by blok, nr;
