-- ════════════════════════════════════════════════════════════════════
-- PLAK 185 -- het dagsaldo bij een handmatige leverancier (Bestads)
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "bij home dashboard moeten we ook Bestads hebben
-- als balance ... van hun is manual, dus wij doen een topup naar hun
-- (EUR naar USD of USD naar USD) en dan staat ons balans bij hun erop,
-- en klanten doen we allemaal USD topup en jij kan via de USD topups die
-- balans steeds eraf halen ... dagelijkse balans, kijk mijn screenshot
-- hoe we eerder deden ... en DST ook meerekenen."
--
-- Het spreadsheet had per dag: begin, eind, fees, verwacht eind,
-- verschil, status, notities (per klant een bedrag, en "+$4506.56 Added
-- by Bart"). Twee tabellen maken daar hetzelfde van:
--
--   supplier_ledger_lines   elke regel van een dag: wat wij stuurden
--                           (deposit), een klant-top-up, een fee, DST,
--                           of een correctie. Handmatig ingevoerd; de
--                           top-ups uit de app zelf telt het scherm er
--                           automatisch bij.
--   supplier_day_balances   het ECHTE eindsaldo van een dag, overgenomen
--                           uit het dashboard van de leverancier.
--
-- Verwacht = begin + deposits - top-ups - fees - DST. Verschil = echt -
-- verwacht. Dat rekent het scherm uit; de database bewaart alleen wat
-- iemand invoerde.
--
-- Alleen de beheerkant leest en schrijft (via server actions met de
-- service-sleutel na de beheertoets). Geen klant ziet dit ooit.
-- Twee keer plakken kan.

do $blk0$
begin
  create table if not exists public.supplier_ledger_lines (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id),
    supplier    text not null check (length(btrim(supplier)) between 1 and 40),
    day         date not null,
    kind        text not null check (kind in ('deposit', 'customer_topup', 'fee', 'dst', 'adjustment')),
    amount      numeric(14, 2) not null check (amount >= 0),
    currency    text not null default 'USD' check (currency in ('USD', 'EUR')),
    client_ref  text check (client_ref is null or length(client_ref) <= 40),
    note        text check (note is null or length(note) <= 300),
    created_by  uuid,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );
  create index if not exists supplier_ledger_lines_day on public.supplier_ledger_lines (tenant_id, supplier, day);

  create table if not exists public.supplier_day_balances (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references public.tenants(id),
    supplier    text not null check (length(btrim(supplier)) between 1 and 40),
    day         date not null,
    actual_end  numeric(14, 2) not null,
    currency    text not null default 'USD' check (currency in ('USD', 'EUR')),
    note        text check (note is null or length(note) <= 300),
    created_by  uuid,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (tenant_id, supplier, day)
  );
end
$blk0$;

-- ── RECHTEN: alleen beheer leest, niemand schrijft rechtstreeks ─────
do $blk1$
declare t text;
begin
  foreach t in array array['supplier_ledger_lines', 'supplier_day_balances'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, public', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public._is_admin_of(tenant_id))', t || '_admin_read', t);
    -- auditregel en updated_at, zoals elke geldtabel
    execute format('drop trigger if exists %I on public.%I', 'trg_audit_' || t, t);
    execute format('create trigger %I after insert or delete or update on public.%I for each row execute function public._audit_row_change()', 'trg_audit_' || t, t);
    execute format('drop trigger if exists %I on public.%I', 'trg_touch_' || t, t);
    execute format('create trigger %I before update on public.%I for each row execute function public._touch_updated_at()', 'trg_touch_' || t, t);
  end loop;
end
$blk1$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in ('supplier_ledger_lines', 'supplier_day_balances')) as tabellen_van_2,
  has_table_privilege('anon', 'public.supplier_ledger_lines', 'select')            as anon_leest,
  has_table_privilege('authenticated', 'public.supplier_ledger_lines', 'insert')   as klant_schrijft,
  (select count(*) from pg_trigger where tgname in ('trg_audit_supplier_ledger_lines', 'trg_audit_supplier_day_balances')) as audit_triggers,
  case when (select count(*) from information_schema.tables
              where table_schema = 'public' and table_name in ('supplier_ledger_lines', 'supplier_day_balances')) = 2
        and not has_table_privilege('anon', 'public.supplier_ledger_lines', 'select')
        and not has_table_privilege('authenticated', 'public.supplier_ledger_lines', 'insert')
       then 'OK' else 'NIET GOED -- meld het' end                                   as uitkomst;
