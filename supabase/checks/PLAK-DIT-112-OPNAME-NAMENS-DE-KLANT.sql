-- ════════════════════════════════════════════════════════════════════
-- PLAK 112 — een medewerker kan een opname aanvragen namens de klant
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 27-09: "momenteel kan een admin nergens withdrawal
-- requesten of doen van ad acc van clients."
--
-- Klopt, en het zit dieper dan het scherm. De RPC
-- `ad_account_withdrawal_request` doet:
--
--     select * into v_advertiser
--       from public.advertisers
--      where user_id = v_uid;
--     if not found then raise 'No advertiser for caller';
--
-- Een medewerker IS geen advertiser, dus de functie weigert haar
-- meteen. Er is geen scherm voor omdat er geen functie voor is; het
-- enige knopje zit in het eigen accountscherm van de klant.
--
-- WAAROM DAT UITMAAKT
--
-- Een klant belt: "haal dat geld er even af." Vandaag moet de
-- medewerker zeggen dat de klant het zelf in de app moet doen. Bij een
-- account dat op `disabled` staat -- de stap vóór teruggeven aan de
-- pool -- kan de klant er soms niet eens meer bij, en dan staat het geld
-- vast op een account dat wij zo doorgeven aan de volgende klant.
--
-- WAT HIER BIJKOMT
--
-- Dezelfde functie, maar de advertiser komt uit het ACCOUNT in plaats
-- van uit auth.uid(), en de aanroeper moet een actieve admin van
-- diezelfde tenant zijn. Verder identiek: dezelfde tabel, dezelfde
-- statussen, dezelfde goedkeuring erna. Een opname die de balie invoert
-- is geen andere opname -- hij moet door precies dezelfde controle.
--
-- DRIE DINGEN DIE MET OPZET ANDERS ZIJN
--
--  1. `requested_by` blijft de medewerker, en de reden krijgt er
--     "namens de klant" voor. Anders leest de wachtrij alsof de klant
--     zelf iets vroeg, en dat is precies het soort rij waarvan je later
--     wilt weten wie hem heeft ingevoerd.
--  2. Een reden is VERPLICHT. Bij de klant zelf is hij optioneel -- die
--     vraagt om zijn eigen geld. Een medewerker die namens iemand anders
--     geld verplaatst legt uit waarom.
--  3. De balanscontrole zit NIET hier maar in de server-action
--     ernaast, net als bij de klantkant: `fundedUsd` telt de top-ups min
--     de opnames en weigert wat er nooit op stond. Een tweede kopie van
--     die som in SQL die uit de pas gaat lopen is erger dan geen.
--
-- De revoke staat in HETZELFDE blok als de create: Postgres geeft
-- EXECUTE aan PUBLIC op een nieuwe functie, en PUBLIC is inclusief anon.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak112 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak112;

-- ── 1. de functie ───────────────────────────────────────────────────
do $blk0$
begin
  create or replace function public.ad_account_withdrawal_request_admin(
    p_ad_account_id uuid,
    p_amount numeric,
    p_currency text,
    p_reason text
  )
  returns public.ad_account_withdrawals
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_uid        uuid := auth.uid();
    v_prof       public.user_profiles%rowtype;
    v_advertiser public.advertisers%rowtype;
    v_account    public.ad_accounts%rowtype;
    v_wallet     public.wallets%rowtype;
    v_ref        text;
    v_row        public.ad_account_withdrawals%rowtype;
  begin
    if v_uid is null then
      raise exception 'Unauthorized' using errcode = '42501';
    end if;

    -- Rol EN actief EN niet in verwijdering. Geen enkele geld-RPC in dit
    -- schema testte die drie samen; een uitgezette medewerker houdt een
    -- geldige JWT tot hij verloopt.
    select * into v_prof
      from public.user_profiles
     where user_id = v_uid
       and role = 'admin'
       and coalesce(is_active, true) = true
       and coalesce(status, 'active') <> 'inactive'
       and coalesce(status, '') <> 'pending_erasure'
     limit 1;
    if not found then
      raise exception 'Forbidden' using errcode = '42501';
    end if;

    if p_amount is null or p_amount <= 0 then
      raise exception 'Vul een bedrag boven nul in' using errcode = '22000';
    end if;
    if p_currency not in ('USD', 'EUR') then
      raise exception 'Valuta wordt niet ondersteund' using errcode = '22000';
    end if;
    -- Verplicht, anders dan bij de klant zelf: wie namens een ander geld
    -- verplaatst legt uit waarom.
    if p_reason is null or length(btrim(p_reason)) < 3 then
      raise exception 'Schrijf erbij waarom' using errcode = '22000';
    end if;

    -- De advertiser komt uit het ACCOUNT, niet uit auth.uid(). Dat is het
    -- hele verschil met de klantversie.
    select * into v_account
      from public.ad_accounts
     where id = p_ad_account_id
       and tenant_id = v_prof.tenant_id;
    if not found then
      raise exception 'Dat ad-account bestaat niet' using errcode = '42704';
    end if;

    select * into v_advertiser
      from public.advertisers
     where id = v_account.advertiser_id;
    if not found then
      raise exception 'Dit ad-account hoort bij geen enkele klant'
        using errcode = '42704';
    end if;
    -- Tweede slot: het account zat in onze tenant, de klant hoort dat
    -- ook te zijn. Een rij waar die twee niet kloppen is geen rij om
    -- geld op te verplaatsen.
    if v_advertiser.tenant_id <> v_prof.tenant_id then
      raise exception 'Forbidden' using errcode = '42501';
    end if;

    -- Geband of gesloten: dat is het woord van het platform en het geld
    -- is niet aan ons om op eigen houtje te verplaatsen. `disabled` mag
    -- juist WEL -- dat is de stap vóór teruggeven aan de pool, en een
    -- account leeghalen is precies wat daar moet gebeuren.
    if lower(coalesce(v_account.status, '')) in ('banned', 'closed') then
      raise exception 'Dit account staat op % -- daar halen we niets vanaf',
        v_account.status using errcode = '22000';
    end if;

    select * into v_wallet
      from public.wallets
     where advertiser_id = v_advertiser.id
     limit 1;
    if not found then
      raise exception 'Deze klant heeft geen portemonnee' using errcode = '42704';
    end if;

    v_ref := 'WD-' || lpad((floor(random() * 1000000)::int)::text, 6, '0');

    insert into public.ad_account_withdrawals (
      tenant_id, advertiser_id, ad_account_id, wallet_id,
      amount, currency, status, reference, reason, requested_by
    ) values (
      v_advertiser.tenant_id, v_advertiser.id, v_account.id, v_wallet.id,
      p_amount, p_currency, 'pending', v_ref,
      -- Zichtbaar in de wachtrij dat dit door de balie is ingevoerd.
      'Namens de klant (' || coalesce(v_prof.full_name, 'balie') || '): '
        || btrim(p_reason),
      v_uid
    )
    returning * into v_row;

    return v_row;
  end;
  $fn$;

  revoke all on function
    public.ad_account_withdrawal_request_admin(uuid, numeric, text, text)
    from public, anon;
  grant execute on function
    public.ad_account_withdrawal_request_admin(uuid, numeric, text, text)
    to authenticated, service_role;

  insert into _plak112 values (0, 'opname namens de klant',
    'ad_account_withdrawal_request_admin(uuid, numeric, text, text) staat; rol + actief getest, reden verplicht');
exception when others then
  insert into _plak112 values (0, 'opname namens de klant',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. anon eraf bij fee_change_requests (en elke andere) ──────────
--
--     DIT IS VAN MIJ, UIT PLAK 111. Gemeten na het plakken:
--     fee_change_requests is de enige tabel in `public` waar `anon`
--     select op heeft.
--
--     Het komt niet doordat ik iets verkeerd schreef, maar doordat ik
--     iets NIET schreef. Supabase zet default privileges op dit schema
--     waarmee elke NIEUWE tabel in public meteen arwdDxtm krijgt voor
--     anon -- lezen, schrijven, wijzigen, wissen. Ik heb RLS aangezet en
--     een leesregel voor admins gemaakt, dus er komt nu geen rij uit,
--     maar de toekenning zelf hoort er niet te zijn. Precies dezelfde
--     les als bij functies ("een revoke hoort bij elke create"), en
--     dezelfde als waardoor _plak94_stash beschrijfbaar was voor anon.
--
--     Dus: eraf hier, en hieronder wordt elke tabel in public nagelopen
--     zodat een volgende die het per ongeluk krijgt meteen opvalt.
do $blk1$
declare
  v_open text;
  v_n    integer := 0;
  r      record;
begin
  -- Alleen tabellen die de app zelf heeft gemaakt en die RLS aan hebben
  -- staan. Niets aanraken wat Supabase zelf beheert.
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity = true
       and has_table_privilege('anon', c.oid, 'select')
  loop
    execute format('revoke all on public.%I from anon', r.relname);
    v_n := v_n + 1;
  end loop;

  select coalesce(string_agg(c.relname, ', ' order by c.relname), 'geen')
    into v_open
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and has_table_privilege('anon', c.oid, 'select');

  insert into _plak112 values (2, 'anon van de tabellen af',
    'ingetrokken op ' || v_n || ' tabel(len) | nog leesbaar voor anon: ' || v_open ||
    ' (moet "geen" zijn)');
exception when others then
  insert into _plak112 values (2, 'anon van de tabellen af',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ────────────────────────────────────────────────────────
do $blk2$
declare
  v_fn   integer;
  v_anon boolean;
  v_kol  integer;
begin
  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ad_account_withdrawal_request_admin';

  select coalesce(bool_or(has_function_privilege('anon', p.oid, 'execute')), false)
    into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ad_account_withdrawal_request_admin';

  -- Plak 109 hoort er al te staan; de opnamewachtrij toont het bewijs.
  select count(*) into v_kol
    from information_schema.columns
   where table_name = 'ad_account_withdrawals'
     and column_name in ('proof_path', 'proof_at', 'proof_by');

  insert into _plak112 values (3, 'stand van zaken',
    'functie: ' || v_fn || '/1 | anon mag uitvoeren: ' || v_anon::text ||
    ' (moet false) | bewijskolommen uit plak 109: ' || v_kol || '/3');
exception when others then
  insert into _plak112 values (3, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak112 order by n;
