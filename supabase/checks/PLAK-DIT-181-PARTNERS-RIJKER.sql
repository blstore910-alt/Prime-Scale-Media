-- ════════════════════════════════════════════════════════════════════
-- PLAK 181 -- partners: een echte beschrijving, highlights, icoon,
--             badge en een tweede knop. Plus Prime Scale Fulfillment
--             met de feiten van hun eigen site.
-- ════════════════════════════════════════════════════════════════════
--
-- Vervangt de eerste versie van plak 181 (alleen de 400 tekens), die
-- nooit gedraaid is.
--
-- De eigenaar, 01-10: "iets meer description ... PSF heeft ook een
-- Shopify app etc, iets meer info, denk slim na, high converting" en
-- "admin moet ook easy en snel partners kunnen toevoegen of verwijderen
-- en een icon toewijzen of logo".
--
-- Nieuwe kolommen, allemaal optioneel en begrensd:
--   highlights  text[]  tot 4 korte punten ("Shopify app", "100% QC")
--   icon        text    een sleutel uit lib/partner-icons.ts
--   badge       text    een label op de kop ("Live in 24h")
--   cta_label   text    de tekst van de hoofdknop (leeg = "Meer info")
--   cta2_label  text    een tweede knop, bv. "Shopify app"
--   cta2_url    text    waar die heen gaat (https)
--
-- Geen nieuwe tabel, dus geen nieuwe rechten. De app leest de nieuwe
-- kolommen tolerant: zonder deze plak blijft alles werken zoals nu.
--
-- Twee keer plakken kan: "if not exists" en "drop constraint if exists".

do $blk0$
begin
  alter table public.partners drop constraint if exists partners_tagline_check;
  alter table public.partners
    add constraint partners_tagline_check check (tagline is null or length(tagline) <= 400);

  alter table public.partners add column if not exists highlights text[];
  alter table public.partners add column if not exists icon text;
  alter table public.partners add column if not exists badge text;
  alter table public.partners add column if not exists cta_label text;
  alter table public.partners add column if not exists cta2_label text;
  alter table public.partners add column if not exists cta2_url text;

  alter table public.partners drop constraint if exists partners_highlights_check;
  alter table public.partners add constraint partners_highlights_check
    -- Geen subquery in een CHECK (Postgres staat het niet toe): het
    -- aantal hier, de lengte per punt in de app (40 tekens).
    check (highlights is null or (cardinality(highlights) <= 4
           and length(array_to_string(highlights, '|')) <= 170));
  alter table public.partners drop constraint if exists partners_icon_check;
  alter table public.partners add constraint partners_icon_check
    check (icon is null or icon in ('package','truck','store','megaphone','palette','camera','chart',
           'card','scale','wrench','cap','users','globe','rocket','sparkles','handshake','building'));
  alter table public.partners drop constraint if exists partners_badge_check;
  alter table public.partners add constraint partners_badge_check check (badge is null or length(badge) <= 30);
  alter table public.partners drop constraint if exists partners_cta_label_check;
  alter table public.partners add constraint partners_cta_label_check check (cta_label is null or length(cta_label) <= 30);
  alter table public.partners drop constraint if exists partners_cta2_label_check;
  alter table public.partners add constraint partners_cta2_label_check check (cta2_label is null or length(cta2_label) <= 30);
  alter table public.partners drop constraint if exists partners_cta2_url_check;
  alter table public.partners add constraint partners_cta2_url_check
    check (cta2_url is null or cta2_url ~ '^https://[^[:space:]]+$');
end
$blk0$;

-- ── PRIME SCALE FULFILLMENT, MET DE FEITEN VAN HUN SITE ─────────────
-- Gelezen op primescalefulfillment.com, 01-10. Niets verzonnen: elk
-- punt hieronder staat daar.
do $blk1$
begin
  update public.partners
     set tagline = 'Pick, pack & ship from their own warehouses in Shenzhen and Ningbo, with QC on every unit. Product sourcing from verified factories, branded packaging and private label. One dedicated contact on WhatsApp, no setup fees, and you pay per order.',
         highlights = array['Shopify app, 1-click', '100% QC', '6-10 day delivery', 'No setup fees'],
         icon = 'package',
         badge = 'Live in 24h',
         cta_label = 'Get a free quote',
         cta2_label = 'Shopify app',
         cta2_url = 'https://apps.shopify.com/prime-scale-china-fulfillment'
   where name = 'Prime Scale Fulfillment';
end
$blk1$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'partners'
      and column_name in ('highlights','icon','badge','cta_label','cta2_label','cta2_url'))  as nieuwe_kolommen_van_6,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.partners'::regclass and conname = 'partners_tagline_check')  as beschrijving,
  (select coalesce(icon,'-') || ' | ' || coalesce(badge,'-') || ' | ' || coalesce(array_to_string(highlights, ' · '),'-')
     from public.partners where name = 'Prime Scale Fulfillment' limit 1)                  as psf,
  case when (select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'partners'
                and column_name in ('highlights','icon','badge','cta_label','cta2_label','cta2_url')) = 6
       then 'OK' else 'NIET GOED -- meld het' end                                          as uitkomst;
