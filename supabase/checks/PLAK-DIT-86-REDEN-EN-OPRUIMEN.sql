-- ════════════════════════════════════════════════════════════════════
-- PLAK 86 — de reden van de aanvrager die werd overschreven, en drie
--            restjes uit de D3-sweep
-- ════════════════════════════════════════════════════════════════════
--
-- 1  EEN WEIGERING WIST DE REDEN VAN DEGENE DIE HET VROEG.
--
--    Plak 71 gaf ad_account_withdrawals een aparte `decision_reason`,
--    en het scherm toont die netjes als "They said:" / "We said:".
--    wallet_refunds en wallet_adjustments hebben dat nooit gekregen:
--    hun reject-RPC's doen
--
--        reason = coalesce(p_reason, reason)
--
--    en schrijven de weigering van de eigenaar dus over dezelfde kolom
--    die de beheerder invulde toen hij het aanvroeg.
--
--    Concreet: een beheerder vraagt een correctie aan met "top-up 1234
--    is dubbel binnengekomen", de eigenaar weigert met "duplicaat van
--    ref 9981". De kolom Reason zegt daarna alleen nog dat laatste, en
--    waarom het ooit gevraagd werd staat nergens meer -- ook niet in de
--    database.
--
-- 2  TWEE PORTEMONNEES ZONDER EIGENAAR, EN DAAROM KON tenant_id NIET
--    VAST.
--
--    wallet 9d67d60c en d17082e2: geen adverteerder, geen tenant, EUR 0
--    en USD 0, en NIETS verwijst ernaar -- geen top-up, geen
--    terugbetaling, geen correctie, geen voorschot, geen wissel
--    (gecontroleerd, alle vijf nul). Ze zijn weg te halen, en dan kan
--    wallets.tenant_id NOT NULL worden, wat de NULL-blinde controle in
--    wallet_refund_request en wallet_adjustment_request definitief
--    dichtzet.
--
--    Dit blok VERWIJDERT twee rijen. Het controleert eerst opnieuw dat
--    ze leeg zijn en nergens in voorkomen, en slaat zichzelf over als
--    dat niet meer klopt.
--
-- 3  `authenticated` heeft TRUNCATE op vijf tabellen van deze reis.
--    Niet te bereiken -- PostgREST stuurt geen TRUNCATE -- maar RLS
--    beperkt TRUNCATE niet, dus het scheelt één verkeerd geplaatste
--    hulpfunctie.
--
-- Elke stap in zijn eigen blok; het rapport leest uit de database.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak86 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak86;

-- ── 1a. de kolom ─────────────────────────────────────────────────────
do $blk0$
begin
  alter table public.wallet_refunds
    add column if not exists decision_reason text;
  alter table public.wallet_adjustments
    add column if not exists decision_reason text;
  insert into _plak86 values (1, 'decision_reason toevoegen', 'beide kolommen aanwezig');
exception when others then
  insert into _plak86 values (1, 'decision_reason toevoegen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 1b. de twee reject-RPC's laten schrijven in de nieuwe kolom ──────
--
-- Chirurgie op de LEVENDE definitie, door de database zelf, met een
-- controle dat de te vervangen regel er echt staat. pg_get_functiondef
-- geeft CRLF terug op deze database, dus de match gebeurt op
-- [[:space:]] in plaats van op een letterlijke newline.
do $blk1$
declare
  r        record;
  v_src    text;
  v_new    text;
  v_done   text := '';
  v_skip   text := '';
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('wallet_refund_reject', 'wallet_adjustment_reject')
  loop
    v_src := pg_get_functiondef(r.oid);

    if v_src !~ 'reason[[:space:]]*=[[:space:]]*coalesce\(p_reason,[[:space:]]*reason\)' then
      v_skip := v_skip || (case when v_skip = '' then '' else ', ' end)
             || r.proname || ' (regel niet gevonden — al om?)';
      continue;
    end if;

    v_new := regexp_replace(
      v_src,
      'reason[[:space:]]*=[[:space:]]*coalesce\(p_reason,[[:space:]]*reason\)',
      'decision_reason = nullif(btrim(coalesce(p_reason, '''''''')), '''''''')',
      'g');

    execute v_new;
    v_done := v_done || (case when v_done = '' then '' else ', ' end) || r.proname;
  end loop;

  -- Een create-or-replace geeft PUBLIC opnieuw EXECUTE, en PUBLIC is
  -- inclusief anon. Altijd in hetzelfde blok terugnemen.
  revoke all on function public.wallet_refund_reject(uuid, text) from public, anon;
  grant execute on function public.wallet_refund_reject(uuid, text)
    to authenticated, service_role;
  revoke all on function public.wallet_adjustment_reject(uuid, text) from public, anon;
  grant execute on function public.wallet_adjustment_reject(uuid, text)
    to authenticated, service_role;

  insert into _plak86 values (
    2, 'weigering schrijft niet meer over de aanvraag heen',
    coalesce(nullif(v_done, ''), 'niets vervangen') ||
    case when v_skip <> '' then ' | overgeslagen: ' || v_skip else '' end);
exception when others then
  insert into _plak86 values (2, 'weigering schrijft niet meer over de aanvraag heen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. de twee lege portemonnees ─────────────────────────────────────
do $blk2$
declare
  v_n     integer;
  v_refs  integer;
  v_del   integer := 0;
begin
  select count(*) into v_n
    from public.wallets
   where tenant_id is null
     and advertiser_id is null
     and coalesce(eur_balance, 0) = 0
     and coalesce(usd_balance, 0) = 0;

  select
      (select count(*) from public.wallet_topups t
        join public.wallets w on w.id = t.wallet_id where w.tenant_id is null)
    + (select count(*) from public.wallet_refunds x
        join public.wallets w on w.id = x.wallet_id where w.tenant_id is null)
    + (select count(*) from public.wallet_adjustments x
        join public.wallets w on w.id = x.wallet_id where w.tenant_id is null)
    + (select count(*) from public.wallet_precharges x
        join public.wallets w on w.id = x.wallet_id where w.tenant_id is null)
    + (select count(*) from public.wallet_exchanges x
        join public.wallets w on w.id = x.wallet_id where w.tenant_id is null)
    into v_refs;

  if v_refs > 0 then
    insert into _plak86 values (3, 'lege portemonnees opruimen',
      'OVERGESLAGEN: er verwijst nu wél iets naar ze (' || v_refs || ' rij(en)). Niets verwijderd.');
    return;
  end if;

  delete from public.wallets
   where tenant_id is null
     and advertiser_id is null
     and coalesce(eur_balance, 0) = 0
     and coalesce(usd_balance, 0) = 0;
  get diagnostics v_del = row_count;

  insert into _plak86 values (3, 'lege portemonnees opruimen',
    v_del || ' van ' || v_n || ' verwijderd (geen eigenaar, saldo nul, nergens genoemd)');
exception when others then
  insert into _plak86 values (3, 'lege portemonnees opruimen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 2b. en dan vast ──────────────────────────────────────────────────
do $blk3$
declare
  v_rest integer;
begin
  select count(*) into v_rest from public.wallets where tenant_id is null;
  if v_rest > 0 then
    insert into _plak86 values (4, 'wallets.tenant_id vastzetten',
      'OVERGESLAGEN: nog ' || v_rest || ' zonder tenant');
    return;
  end if;
  alter table public.wallets alter column tenant_id set not null;
  insert into _plak86 values (4, 'wallets.tenant_id vastzetten', 'NOT NULL gezet');
exception when others then
  insert into _plak86 values (4, 'wallets.tenant_id vastzetten',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── 3. TRUNCATE weg bij authenticated ────────────────────────────────
do $blk4$
declare
  t text;
  v_n integer := 0;
begin
  foreach t in array array[
    'ad_account_requests', 'ad_account_withdrawals',
    'wallet_refunds', 'wallet_adjustments', 'wallet_precharges'
  ] loop
    execute format('revoke truncate on table public.%I from authenticated', t);
    v_n := v_n + 1;
  end loop;
  insert into _plak86 values (5, 'TRUNCATE weg bij authenticated', v_n || ' tabellen');
exception when others then
  insert into _plak86 values (5, 'TRUNCATE weg bij authenticated',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ── controle: uit de database ────────────────────────────────────────
do $blk5$
declare
  v_cols  integer;
  v_null  integer;
  v_nn    boolean;
  v_trunc integer;
  v_old   integer;
begin
  select count(*) into v_cols
    from information_schema.columns
   where table_name in ('wallet_refunds', 'wallet_adjustments')
     and column_name = 'decision_reason';

  select count(*) into v_null from public.wallets where tenant_id is null;

  select a.attnotnull into v_nn
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'wallets' and a.attname = 'tenant_id';

  select count(*) into v_trunc
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('ad_account_requests','ad_account_withdrawals',
                       'wallet_refunds','wallet_adjustments','wallet_precharges')
     and exists (select 1 from aclexplode(c.relacl) g
                  where g.grantee::regrole::text = 'authenticated'
                    and g.privilege_type = 'TRUNCATE');

  select count(*) into v_old
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('wallet_refund_reject','wallet_adjustment_reject')
     and pg_get_functiondef(p.oid) ~ 'reason[[:space:]]*=[[:space:]]*coalesce\(p_reason';

  insert into _plak86 values (
    6, 'stand van zaken',
    v_cols || '/2 decision_reason-kolommen, ' ||
    v_old  || ' RPC(s) schrijven nog over de aanvraag heen (moet 0), ' ||
    v_null || ' portemonnee(s) zonder tenant, NOT NULL = ' ||
    coalesce(v_nn::text, '?') || ', ' ||
    v_trunc || ' tabel(len) met TRUNCATE voor authenticated (moet 0)');
exception when others then
  insert into _plak86 values (6, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk5$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak86 order by n;
