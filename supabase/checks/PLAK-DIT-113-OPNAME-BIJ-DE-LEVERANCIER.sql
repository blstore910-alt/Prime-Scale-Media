-- ════════════════════════════════════════════════════════════════════
-- PLAK 113 — een opname die bij de leverancier ligt
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 27-09: "B doen voor API-accounts en A houden voor
-- handmatige -- bij handwerk is de bevestiging de medewerker zelf, met
-- de screenshot erbij."
--
-- WAT ER MIS WAS AAN DE VOLGORDE
--
-- Vandaag crediteert `ad_account_withdrawal_approve` de portemonnee
-- METEEN en wordt daarna pas een push naar de leverancier in de
-- wachtrij gezet. Bij handwerk klopt dat: de medewerker heeft het geld
-- al weggehaald in het dashboard van de leverancier voordat ze op
-- goedkeuren drukt, en sinds plak 109 hangt daar een schermafdruk bij.
--
-- Zodra de API het doet, klopt het niet meer. Dan crediteren we eerst en
-- vragen we daarna, en de worker behandelt het antwoord "queued" van de
-- leverancier als geslaagd -- de klus gaat op succeeded en niets kijkt
-- ooit terug. Het geld zou in de portemonnee staan terwijl het ook nog
-- op het ad-account staat. Dat is precies het dubbele geld dat in
-- lib/integrations/enqueue.ts al als risico beschreven staat.
--
-- WAT HIER BIJKOMT
--
--   status 'at_supplier'   de opname is gepusht en we wachten
--   external_withdraw_id   hun kenmerk, om op terug te lezen
--   sent_to_supplier_at    wanneer we hem hebben weggestuurd
--   supplier_status        wat zij er het laatst over zeiden
--
-- en drie functies:
--
--   ad_account_withdrawal_send_to_supplier  zet 'at_supplier', crediteert
--                                           NIET. Zelfde controles als
--                                           goedkeuren.
--   ad_account_withdrawal_settle            de leverancier is klaar:
--                                           portemonnee erbij, status
--                                           'approved'.
--   ad_account_withdrawal_supplier_failed   zij konden het niet: terug
--                                           naar 'pending' met hun reden,
--                                           en de balie hoort het.
--
-- HET PLAFOND BLIJFT KLOPPEN
--
-- De ruimteberekening in approve telt elke opname mee waarvan de status
-- NIET rejected of cancelled is. 'at_supplier' zit daar niet bij, dus
-- een opname die bij de leverancier ligt telt gewoon tegen het account.
-- Twee opnames van hetzelfde geld kunnen elkaar dus niet passeren.
--
-- SETTLE KAN GEEN TWEE KEER CREDITEREN
--
-- De cron leest elke minuut terug, dus settle wordt gegarandeerd vaker
-- aangeroepen dan er opnames zijn. FOR UPDATE plus een statustest die
-- STIL terugkeert in plaats van te gooien: een tweede poll is normaal,
-- geen fout, en mag alleen niets doen.
--
-- Settle en supplier_failed zijn voor de CRON, niet voor een mens. Geen
-- van beide gaat naar `authenticated` -- alleen service_role, want de
-- enige aanroeper is de worker met de servicesleutel. Een ingelogde
-- gebruiker die zijn eigen opname kan afwikkelen is een portemonnee die
-- zichzelf vult.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak113 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak113;

-- ── 1. de kolommen en de nieuwe status ──────────────────────────────
do $blk0$
declare v_con text;
begin
  alter table public.ad_account_withdrawals
    add column if not exists external_withdraw_id text,
    add column if not exists sent_to_supplier_at  timestamptz,
    add column if not exists supplier_status      text;

  -- De statuscontrole opnieuw, met 'at_supplier' erbij. De naam van de
  -- constraint komt uit de oorspronkelijke migratie.
  select conname into v_con
    from pg_constraint
   where conrelid = 'public.ad_account_withdrawals'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%status%'
   limit 1;

  if v_con is not null then
    execute format(
      'alter table public.ad_account_withdrawals drop constraint %I', v_con);
  end if;

  alter table public.ad_account_withdrawals
    add constraint ad_account_withdrawals_status_check
    check (status in ('pending', 'at_supplier', 'approved', 'rejected', 'cancelled'));

  -- Terugvinden welke er bij de leverancier liggen, zonder een scan.
  create index if not exists ad_account_withdrawals_at_supplier_idx
    on public.ad_account_withdrawals (status, sent_to_supplier_at)
    where status = 'at_supplier';

  insert into _plak113 values (0, 'kolommen en status',
    'external_withdraw_id, sent_to_supplier_at, supplier_status; status kent nu at_supplier');
exception when others then
  insert into _plak113 values (0, 'kolommen en status',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. wegsturen naar de leverancier (crediteert NIET) ─────────────
do $blk1$
begin
  create or replace function public.ad_account_withdrawal_send_to_supplier(
    p_withdrawal_id uuid
  )
  returns public.ad_account_withdrawals
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_admin  record;
    v_wd     public.ad_account_withdrawals%rowtype;
    v_row    public.ad_account_withdrawals%rowtype;
    v_put_on numeric;
    v_taken  numeric;
    v_room   numeric;
  begin
    select * into v_admin from public._require_profile('admin');

    select * into v_wd
      from public.ad_account_withdrawals
     where id = p_withdrawal_id
     for update;
    if not found then
      raise exception 'Withdrawal not found' using errcode = '42704';
    end if;
    if v_wd.tenant_id <> v_admin.tenant_id then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
    if v_wd.status <> 'pending' then
      raise exception 'This withdrawal is no longer pending' using errcode = '22000';
    end if;

    -- Exact dezelfde twee controles als bij goedkeuren. Dit is een ANDERE
    -- weg naar hetzelfde geld, en een tweede weg met minder sloten is
    -- geen tweede weg maar een gat.
    if not exists (
      select 1 from public.ad_accounts aa
       where aa.id = v_wd.ad_account_id
         and aa.advertiser_id = v_wd.advertiser_id
         and coalesce(aa.status, 'active') not in ('banned', 'closed')
    ) then
      raise exception 'That ad account is no longer this advertiser''s, or it is closed'
        using errcode = '22000';
    end if;

    begin
      select coalesce(sum(t.topup_amount), 0) into v_put_on
        from public.top_ups t
       where t.account_id = v_wd.ad_account_id
         and t.status = 'completed'
         and coalesce(t.is_deleted, false) = false
         and case when t.topup_usd is not null then upper(coalesce(t.currency, 'USD')) else upper(coalesce(v_wd.currency, 'USD')) end
             = upper(coalesce(v_wd.currency, 'USD'));
    exception when undefined_column then
      select coalesce(sum(t.topup_amount), 0) into v_put_on
        from public.top_ups t
       where t.account_id = v_wd.ad_account_id
         and t.status = 'completed'
         and case when t.topup_usd is not null then upper(coalesce(t.currency, 'USD')) else upper(coalesce(v_wd.currency, 'USD')) end
             = upper(coalesce(v_wd.currency, 'USD'));
    end;

    select coalesce(sum(w.amount), 0) into v_taken
      from public.ad_account_withdrawals w
     where w.ad_account_id = v_wd.ad_account_id
       and w.id is distinct from v_wd.id
       and lower(coalesce(w.status, '')) not in ('rejected', 'cancelled')
       and upper(coalesce(w.currency, 'USD')) = upper(coalesce(v_wd.currency, 'USD'));

    v_room := round((v_put_on - v_taken)::numeric, 2);

    if round(coalesce(v_wd.amount, 0)::numeric, 2) > v_room + 0.005 then
      raise exception
        'Sending this would ask the supplier for money that was never on the account (on: %, already taken: %, room: %)',
        to_char(v_put_on, 'FM999999990.00'),
        to_char(v_taken, 'FM999999990.00'),
        to_char(greatest(v_room, 0), 'FM999999990.00')
        using errcode = '23514';
    end if;

    -- GEEN CREDITERING HIER. Dat is het hele punt: het geld komt pas in
    -- de portemonnee als de leverancier zegt dat het van het account af
    -- is.
    update public.ad_account_withdrawals
       set status = 'at_supplier',
           reviewed_by = v_admin.profile_id,
           reviewed_at = now(),
           sent_to_supplier_at = now(),
           updated_at = now()
     where id = p_withdrawal_id
    returning * into v_row;

    return v_row;
  end;
  $fn$;

  revoke all on function public.ad_account_withdrawal_send_to_supplier(uuid)
    from public, anon;
  grant execute on function public.ad_account_withdrawal_send_to_supplier(uuid)
    to authenticated, service_role;

  insert into _plak113 values (1, 'wegsturen',
    'ad_account_withdrawal_send_to_supplier(uuid) -- zelfde controles als goedkeuren, crediteert niet');
exception when others then
  insert into _plak113 values (1, 'wegsturen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. afwikkelen als de leverancier klaar is ──────────────────────
do $blk2$
begin
  create or replace function public.ad_account_withdrawal_settle(
    p_withdrawal_id uuid,
    p_external_id text default null
  )
  returns public.ad_account_withdrawals
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_wd  public.ad_account_withdrawals%rowtype;
    v_row public.ad_account_withdrawals%rowtype;
  begin
    select * into v_wd
      from public.ad_account_withdrawals
     where id = p_withdrawal_id
     for update;
    if not found then
      raise exception 'Withdrawal not found' using errcode = '42704';
    end if;

    -- STIL TERUG, NIET GOOIEN. De cron leest elke minuut terug, dus deze
    -- functie wordt vaker aangeroepen dan er opnames zijn. Een tweede
    -- poll op een rij die al is afgewikkeld is het normale geval en geen
    -- fout -- en een exception zou de hele veegronde afbreken.
    if v_wd.status <> 'at_supplier' then
      return v_wd;
    end if;

    if v_wd.currency = 'USD' then
      update public.wallets
         set usd_balance = coalesce(usd_balance, 0) + v_wd.amount,
             updated_at = now()
       where id = v_wd.wallet_id;
    elsif v_wd.currency = 'EUR' then
      update public.wallets
         set eur_balance = coalesce(eur_balance, 0) + v_wd.amount,
             updated_at = now()
       where id = v_wd.wallet_id;
    else
      -- Een valuta waar geen wallet voor is zou stil slagen zonder dat er
      -- geld beweegt.
      raise exception 'This withdrawal is in %, and there is no wallet for it',
        v_wd.currency using errcode = '22000';
    end if;

    update public.ad_account_withdrawals
       set status = 'approved',
           supplier_status = 'completed',
           external_withdraw_id = coalesce(p_external_id, external_withdraw_id),
           updated_at = now()
     where id = p_withdrawal_id
    returning * into v_row;

    -- De klant hoort dat het geld er is. Hij wacht er sinds het
    -- wegsturen op, en dat kan een dag duren.
    begin
      insert into public.notifications (recipient_user_id, tenant_id, type, payload)
      select a.user_id, v_wd.tenant_id, 'withdrawal_approved',
             jsonb_build_object(
               'amount', v_wd.amount,
               'currency', v_wd.currency,
               'account_name', (select name from public.ad_accounts where id = v_wd.ad_account_id)
             )
        from public.advertisers a
       where a.id = v_wd.advertiser_id
         and a.user_id is not null;
    exception when others then
      raise warning 'withdrawal_approved notice failed: %', sqlerrm;
    end;

    return v_row;
  end;
  $fn$;

  -- ALLEEN service_role. De enige aanroeper is de cron met de
  -- servicesleutel; een ingelogde gebruiker die zijn eigen opname kan
  -- afwikkelen is een portemonnee die zichzelf vult.
  revoke all on function public.ad_account_withdrawal_settle(uuid, text)
    from public, anon, authenticated;
  grant execute on function public.ad_account_withdrawal_settle(uuid, text)
    to service_role;

  insert into _plak113 values (2, 'afwikkelen',
    'ad_account_withdrawal_settle(uuid, text) -- alleen service_role, idempotent, klant krijgt melding');
exception when others then
  insert into _plak113 values (2, 'afwikkelen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── 4. de leverancier kon het niet ──────────────────────────────────
do $blk3$
begin
  create or replace function public.ad_account_withdrawal_supplier_failed(
    p_withdrawal_id uuid,
    p_reason text
  )
  returns public.ad_account_withdrawals
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_wd  public.ad_account_withdrawals%rowtype;
    v_row public.ad_account_withdrawals%rowtype;
  begin
    select * into v_wd
      from public.ad_account_withdrawals
     where id = p_withdrawal_id
     for update;
    if not found then
      raise exception 'Withdrawal not found' using errcode = '42704';
    end if;
    if v_wd.status <> 'at_supplier' then
      return v_wd;
    end if;

    -- TERUG NAAR PENDING, niet naar rejected. De klant heeft niets
    -- verkeerd gedaan en zijn vraag staat nog; de leverancier kon hem
    -- alleen niet uitvoeren. Een medewerker pakt hem op, haalt het geld
    -- desnoods met de hand weg en keurt alsnog goed.
    update public.ad_account_withdrawals
       set status = 'pending',
           supplier_status = 'failed',
           reason = coalesce(reason, '') ||
                    ' | De leverancier kon dit niet uitvoeren: ' ||
                    coalesce(nullif(btrim(p_reason), ''), 'geen reden opgegeven') ||
                    '. Handmatig afhandelen.',
           sent_to_supplier_at = null,
           updated_at = now()
     where id = p_withdrawal_id
    returning * into v_row;

    -- Elke actieve admin, want dit blijft anders liggen: de rij staat
    -- weer op pending en ziet er uit als elke andere.
    begin
      if to_regprocedure('public._admin_recipients(uuid)') is not null then
        insert into public.notifications (recipient_user_id, tenant_id, type, payload)
        select r, v_wd.tenant_id, 'withdrawal_supplier_failed',
               jsonb_build_object(
                 'withdrawal_id', v_wd.id,
                 'reference', v_wd.reference,
                 'amount', v_wd.amount,
                 'currency', v_wd.currency,
                 'reason', btrim(coalesce(p_reason, ''))
               )
          from public._admin_recipients(v_wd.tenant_id) r;
      end if;
    exception when others then
      raise warning 'withdrawal_supplier_failed notice failed: %', sqlerrm;
    end;

    return v_row;
  end;
  $fn$;

  revoke all on function public.ad_account_withdrawal_supplier_failed(uuid, text)
    from public, anon, authenticated;
  grant execute on function public.ad_account_withdrawal_supplier_failed(uuid, text)
    to service_role;

  insert into _plak113 values (3, 'mislukt bij de leverancier',
    'ad_account_withdrawal_supplier_failed(uuid, text) -- terug naar pending met hun reden, elke admin hoort het');
exception when others then
  insert into _plak113 values (3, 'mislukt bij de leverancier',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── controle ────────────────────────────────────────────────────────
do $blk4$
declare
  v_kol   integer;
  v_fn    integer;
  v_stat  text;
  v_loose text;
begin
  select count(*) into v_kol
    from information_schema.columns
   where table_name = 'ad_account_withdrawals'
     and column_name in ('external_withdraw_id', 'sent_to_supplier_at', 'supplier_status');

  select count(*) into v_fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ad_account_withdrawal_send_to_supplier',
                       'ad_account_withdrawal_settle',
                       'ad_account_withdrawal_supplier_failed');

  select substring(pg_get_constraintdef(oid) from 1 for 200) into v_stat
    from pg_constraint
   where conrelid = 'public.ad_account_withdrawals'::regclass
     and conname = 'ad_account_withdrawals_status_check';

  -- De twee afwikkelfuncties mogen NIET door een ingelogde gebruiker
  -- aan te roepen zijn.
  select coalesce(string_agg(p.proname, ', '), 'geen')
    into v_loose
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('ad_account_withdrawal_settle',
                       'ad_account_withdrawal_supplier_failed')
     and (has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute'));

  insert into _plak113 values (4, 'stand van zaken',
    'kolommen: ' || v_kol || '/3 | functies: ' || v_fn || '/3 | status: ' ||
    coalesce(v_stat, 'GEEN') || ' | afwikkelen bereikbaar voor ingelogde/anon: ' ||
    v_loose || ' (moet "geen")');
exception when others then
  insert into _plak113 values (4, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak113 order by n;
