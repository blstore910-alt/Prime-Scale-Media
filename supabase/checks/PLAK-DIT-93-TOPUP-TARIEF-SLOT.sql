-- ════════════════════════════════════════════════════════════════════
-- PLAK 93 — een medewerker kan een ad-account-funding met 0% fee in de
--            wachtrij zetten, en daarna gewoon op Verify drukken
-- ════════════════════════════════════════════════════════════════════
--
-- `top_ups` is van de sessie uit beschrijfbaar:
--
--   top_ups | Enable ALL for admins | ALL | authenticated | _is_admin_of(tenant_id)
--
-- en `authenticated` heeft INSERT. De twee bestaande insert-triggers
-- kijken niet naar geld: de ene weigert alleen `status='completed'` van
-- een niet-eigenaar, de andere controleert bij INSERT alleen dat de
-- adverteerder en het account in dezelfde tenant zitten -- zijn
-- kolomlijst zit in de UPDATE-tak.
--
-- Alles wat `createTopupAsAdmin` veilig maakt (de kolom-allowlist en
-- resolveEffectiveFeePct) is een eigenschap van de SERVER ACTION, niet
-- van de database. De tabel is een tweede deur, en die heeft geen van
-- beide. Vanuit de browser, met de publiceerbare sleutel:
--
--   insert into top_ups (..., amount_received: 10000, fee: 0,
--                        fee_amount: 0, topup_amount: 10000, ...)
--
-- De rij komt er als een gewone aanvraag uit te zien, en de verify-knop
-- maakt hem af.
--
-- Deze plak zet er een slot op, en wel het smalst mogelijke:
--
--   1. de fee mag niet ONDER het tarief liggen dat voor dit account
--      geldt. Hoger mag -- dat is geen diefstal en de server action
--      heeft daar zijn eigen plafond voor.
--   2. het fee-BEDRAG moet bij het percentage horen (op een cent na),
--      zodat "fee 3% maar fee_amount 0" er niet langs komt.
--   3. de valuta moet die van het ad-account zijn, ALS het account er
--      een heeft. Zeven van de elf hebben er geen; die blijven werken
--      zoals ze nu werken.
--
-- De eigenaar mag alles, precies zoals nu. Definer-RPC's raken dit niet:
-- die draaien niet als `authenticated`.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak93 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak93;

-- ── 1. het slot ──────────────────────────────────────────────────────
do $blk0$
begin
  create or replace function public._top_ups_insert_fee_floor()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  declare
    v_pct      numeric;
    v_expected numeric;
    v_acct_cur text;
  begin
    -- Alleen sessies. Een SECURITY DEFINER RPC draait niet als
    -- `authenticated`, dus de klantroute en de verify-RPC gaan hier
    -- ongemoeid langs.
    if current_user <> 'authenticated' then
      return new;
    end if;

    -- De eigenaar van de tenant mag alles, net als nu.
    if exists (
      select 1 from public.tenants t
       where t.id = new.tenant_id and t.owner_id = auth.uid()
    ) then
      return new;
    end if;

    -- ── de valuta van het account ───────────────────────────────────
    select nullif(btrim(coalesce(aa.currency, '')), '')
      into v_acct_cur
      from public.ad_accounts aa
     where aa.id = new.account_id;

    if v_acct_cur is not null
       and new.currency is not null
       and upper(btrim(new.currency)) <> upper(v_acct_cur) then
      raise exception
        'This ad account is in %, so a top-up on it has to be in % too.',
        v_acct_cur, v_acct_cur
        using errcode = '42501';
    end if;

    -- ── de vloer onder het tarief ───────────────────────────────────
    begin
      v_pct := public._effective_topup_fee_pct(new.advertiser_id, new.account_id);
    exception when others then
      v_pct := null;
    end;

    if v_pct is not null and coalesce(new.fee, -1) < v_pct - 0.0001 then
      raise exception
        'This account is charged % percent and this top-up says % percent. Only the owner can file one below the rate.',
        v_pct, coalesce(new.fee, 0)
        using errcode = '42501';
    end if;

    -- ── en het bedrag moet bij het percentage horen ─────────────────
    v_expected := round(
      coalesce(new.amount_received, 0) * coalesce(new.fee, 0) / 100.0, 2);
    if abs(coalesce(new.fee_amount, -1) - v_expected) > 0.011 then
      raise exception
        'The fee amount (%) does not match % of %.',
        coalesce(new.fee_amount, 0), coalesce(new.fee, 0),
        coalesce(new.amount_received, 0)
        using errcode = '42501';
    end if;

    return new;
  end;
  $fn$;

  -- Postgres geeft EXECUTE aan PUBLIC op elke nieuwe functie, en PUBLIC
  -- is inclusief anon. Hoort in hetzelfde blok als de create.
  revoke all on function public._top_ups_insert_fee_floor() from public, anon;
  grant execute on function public._top_ups_insert_fee_floor()
    to authenticated, service_role;

  insert into _plak93 values (0, 'functie _top_ups_insert_fee_floor', 'geplaatst');
exception when others then
  insert into _plak93 values (0, 'functie _top_ups_insert_fee_floor',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. hem aanzetten ─────────────────────────────────────────────────
do $blk1$
begin
  drop trigger if exists trg_top_ups_insert_fee_floor on public.top_ups;
  create trigger trg_top_ups_insert_fee_floor
    before insert on public.top_ups
    for each row execute function public._top_ups_insert_fee_floor();
  insert into _plak93 values (1, 'trigger op top_ups', 'geplaatst');
exception when others then
  insert into _plak93 values (1, 'trigger op top_ups',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle: lees de werkelijkheid terug ────────────────────────────
do $blk2$
declare
  v_fn   integer;
  v_trg  integer;
  v_anon integer;
  v_bad  integer;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_top_ups_insert_fee_floor';

  select count(*) into v_trg
    from pg_trigger t
   where t.tgrelid = 'public.top_ups'::regclass
     and t.tgname = 'trg_top_ups_insert_fee_floor'
     and not t.tgisinternal;

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_top_ups_insert_fee_floor'
     and has_function_privilege('anon', p.oid, 'execute');

  -- Zou een van de bestaande rijen door dit slot zijn tegengehouden?
  select count(*) into v_bad
    from public.top_ups t
   where abs(coalesce(t.fee_amount, 0)
             - round(coalesce(t.amount_received, 0) * coalesce(t.fee, 0) / 100.0, 2)) > 0.011;

  insert into _plak93 values (2, 'stand van zaken',
    'functie ' || v_fn || '/1 | trigger ' || v_trg || '/1 | anon mag hem: ' ||
    v_anon || ' (moet 0) | bestaande rijen die niet aan de fee-som voldoen: ' ||
    v_bad);
exception when others then
  insert into _plak93 values (2, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── en een echte proef, die zichzelf weer opruimt ────────────────────
do $blk3$
declare
  v_msg text := 'niet uitgevoerd';
  v_id  uuid;
begin
  -- Draait als de eigenaar van de sessie in de SQL editor (postgres),
  -- dus de trigger laat hem door -- wat de proef hieronder juist wil
  -- weten: dat een INSERT nog steeds werkt en de tabel niet op slot zit.
  begin
    insert into public.top_ups (
      tenant_id, advertiser_id, account_id, type, currency,
      amount_received, fee, fee_amount, topup_amount, status
    )
    select t.tenant_id, t.advertiser_id, t.account_id, 'top-up', t.currency,
           1.00, t.fee, round(1.00 * t.fee / 100.0, 2),
           round(1.00 - round(1.00 * t.fee / 100.0, 2), 2), 'pending'
      from public.top_ups t
     order by t.created_at desc
     limit 1
    returning id into v_id;
    v_msg := 'een geldige rij gaat er nog gewoon in';
    -- meteen weer weg, en alleen precies deze ene rij
    delete from public.top_ups where id = v_id;
    v_msg := v_msg || ', en is weer verwijderd';
  exception when others then
    v_msg := 'FOUT ' || sqlstate || ': ' || sqlerrm;
  end;
  insert into _plak93 values (3, 'proef', v_msg);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak93 order by n;
