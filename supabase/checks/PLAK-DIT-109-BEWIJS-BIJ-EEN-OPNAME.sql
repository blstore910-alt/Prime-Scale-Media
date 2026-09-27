-- ════════════════════════════════════════════════════════════════════
-- PLAK 109 — bewijs dat het geld echt van het ad-account is teruggehaald
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 27-09: "hier wil ik bewijs zien dat medewerker geld van
-- ad account terug heeft gehaald naar ons wallet, dus een screenshot
-- bijv."
--
-- Nu is de enige vastlegging het woord van de medewerker. Die opent het
-- dashboard van de leverancier, haalt het geld weg, komt terug en drukt
-- op goedkeuren -- en de portemonnee van de klant wordt gecrediteerd.
-- Tussen die twee dingen zit niets: geen bedrag van de leverancier, geen
-- tijdstip, geen scherm. Als er later een gat is, is er geen manier om
-- te zien of het geld ooit is teruggekomen.
--
-- WAT DIT TOEVOEGT
--
--   ad_account_withdrawals.proof_path   het pad naar een schermafdruk
--   ad_account_withdrawals.proof_at     wanneer die is geüpload
--   ad_account_withdrawals.proof_by     wie
--
-- en een prive-emmer `withdrawal_proofs` waar alleen een ACTIEVE admin
-- van de tenant in mag schrijven en lezen.
--
-- DE EMMER IS EXPLICIET DICHT, EN DAT IS GELEERD
--
-- Vanmiddag bleek `wallet_payment_slips` open te liggen voor elke
-- ingelogde gebruiker: vier beleidsregels waarvan de enige test was
-- "welke emmer is dit" (plak 103). En `top_ups_view` verloor zijn
-- beveiliging doordat mijn eigen `create or replace view` de opties
-- leegde (plak 107).
--
-- Dus hier: geen enkele kale regel, elke regel test de ROL en de TENANT,
-- de emmer wordt als niet-publiek aangemaakt, en het rapport onderaan
-- controleert het na in plaats van het aan te nemen.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak109 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak109;

-- ── 1. de drie kolommen ─────────────────────────────────────────────
do $blk0$
begin
  alter table public.ad_account_withdrawals
    add column if not exists proof_path text,
    add column if not exists proof_at   timestamptz,
    add column if not exists proof_by   uuid;

  insert into _plak109 values (0, 'kolommen',
    'proof_path, proof_at en proof_by staan op ad_account_withdrawals');
exception when others then
  insert into _plak109 values (0, 'kolommen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. de emmer, prive ──────────────────────────────────────────────
do $blk1$
begin
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('withdrawal_proofs', 'withdrawal_proofs', false, 10485760)
  on conflict (id) do update
     set public = false,
         file_size_limit = 10485760;

  insert into _plak109 values (1, 'emmer withdrawal_proofs',
    'aangemaakt of bijgewerkt; public = false, 10 MB per bestand');
exception when others then
  insert into _plak109 values (1, 'emmer withdrawal_proofs',
    'FOUT ' || sqlstate || ': ' || sqlerrm ||
    ' || lukt dit niet vanuit de editor, maak de emmer dan met de hand ' ||
    'aan in Storage (NIET public) en draai deze plak opnieuw');
end
$blk1$;

-- ── 3. wie erin mag, en verder niemand ──────────────────────────────
--     Drie regels, elk met een rol- en tenanttest. Geen ALL, geen
--     kale bucket_id-regel, geen anon.
do $blk2$
begin
  drop policy if exists wproof_admin_read   on storage.objects;
  drop policy if exists wproof_admin_insert on storage.objects;
  drop policy if exists wproof_admin_update on storage.objects;

  -- Lezen: een actieve admin van de tenant waarvan de opname is. Het pad
  -- begint met het tenant-id, zodat de test in het pad zelf zit.
  create policy wproof_admin_read on storage.objects
    for select to authenticated
    using (
      bucket_id = 'withdrawal_proofs'
      and exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.role = 'admin'
           and coalesce(up.is_active, true) = true
           and coalesce(up.status, 'active') <> 'inactive'
           and coalesce(up.status, '') <> 'pending_erasure'
           and up.tenant_id::text = (storage.foldername(name))[1]
      )
    );

  -- Uploaden: dezelfde test. Geen UPDATE en geen DELETE -- bewijs dat
  -- overschreven of weggegooid kan worden is geen bewijs. Een verkeerde
  -- upload wordt een tweede bestand, niet een gum.
  create policy wproof_admin_insert on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'withdrawal_proofs'
      and exists (
        select 1 from public.user_profiles up
         where up.user_id = auth.uid()
           and up.role = 'admin'
           and coalesce(up.is_active, true) = true
           and coalesce(up.status, 'active') <> 'inactive'
           and coalesce(up.status, '') <> 'pending_erasure'
           and up.tenant_id::text = (storage.foldername(name))[1]
      )
    );

  insert into _plak109 values (2, 'beleid',
    'lezen en uploaden alleen voor een actieve admin van die tenant; geen update, geen delete');
exception when others then
  insert into _plak109 values (2, 'beleid',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle ────────────────────────────────────────────────────────
do $blk3$
declare
  v_kol  integer;
  v_pol  text;
  v_kaal integer;
begin
  select count(*) into v_kol
    from information_schema.columns
   where table_name = 'ad_account_withdrawals'
     and column_name in ('proof_path','proof_at','proof_by');

  select coalesce(string_agg(policyname || ' [' || cmd || ']', ' | '
           order by policyname), 'GEEN')
    into v_pol
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual,'') || coalesce(with_check,'') like '%withdrawal_proofs%';

  -- Een regel op deze emmer die NIET naar de gebruiker kijkt.
  select count(*) into v_kaal
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and coalesce(qual,'') || coalesce(with_check,'') like '%withdrawal_proofs%'
     and coalesce(qual,'') || coalesce(with_check,'') not like '%auth.uid()%';

  insert into _plak109 values (3, 'stand van zaken',
    'kolommen: ' || v_kol || '/3 | beleid: ' || v_pol ||
    ' | regels zonder gebruikerstest: ' || v_kaal || ' (moet 0)');
exception when others then
  insert into _plak109 values (3, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
--
-- Kan de editor de emmer niet aanmaken (regel 1 met een FOUT), maak hem
-- dan met de hand: Storage -> New bucket -> naam `withdrawal_proofs`,
-- Public UIT. Draai daarna deze plak nog een keer voor het beleid.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak109 order by n;
