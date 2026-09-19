-- =====================================================================
-- FIX-EN-RAPPORT — doet de fixes EN vertelt per deel wat er gebeurde.
-- =====================================================================
-- Vervangt ALLES-IN-1-V2.sql. Draai dit; de vorige mag weg.
--
-- WAAROM DEZE ANDERS IS. De vorige versies deden hun werk en meldden het
-- via `raise notice` / `raise warning` — en die komen in Supabase in een
-- apart paneel dat je niet openhad. Vanaf de resultaattabel gezien leek
-- het dus alsof er niets gebeurde, terwijl er in werkelijkheid van alles
-- kon zijn overgeslagen om redenen die ik nooit te zien kreeg.
--
-- Dit schrijft elke uitkomst in een tabel, en de LAATSTE query is die
-- tabel. Eén zichtbaar resultaat, met per deel: GELUKT, AL GOED,
-- OVERGESLAGEN (en waarom) of FOUT (en welke). Niets kan het bestand nog
-- afbreken — elk deel vangt z'n eigen fout op en rolt alleen zichzelf
-- terug.
--
-- Veilig om twee keer te draaien.
-- =====================================================================

set search_path = public;

drop table if exists public._psm_run_log;
create table public._psm_run_log (
  nr       int,
  deel     text,
  uitkomst text
);

create or replace function public._log(p_nr int, p_deel text, p_uit text)
returns void language sql as $logfn$
  insert into public._psm_run_log(nr, deel, uitkomst) values (p_nr, p_deel, p_uit);
$logfn$;

-- pg_get_functiondef gooit op een aggregate en op sommige interne
-- functies, en Postgres mag die aanroep vóór de schema-filter uitvoeren.
create or replace function public._fndef_safe(p_oid oid)
returns text language plpgsql stable as $fnsafe$
begin
  return pg_get_functiondef(p_oid);
exception when others then
  return '';
end;
$fnsafe$;


-- ── A1 · RLS op logs en wallet_exchanges ─────────────────────────────
-- Geen policy en geen slot op twee tabellen die vanuit de browser
-- gelezen worden. In `logs` staan volledige voor/na-kopieen van zakelijke
-- rijen plus namen en werkmails van personeel.
do $a1$
declare v_msg text := '';
begin
  if to_regprocedure('public._is_admin_of(uuid)') is null then
    perform public._log(1, 'A1 logs + wallet_exchanges RLS',
      'OVERGESLAGEN: _is_admin_of bestaat niet op deze database, dus een policy die erop leunt zou elk adminscherm op zwart zetten');
    return;
  end if;

  if to_regclass('public.logs') is null then
    v_msg := v_msg || 'logs bestaat niet. ';
  elsif not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='logs'
                       and column_name='tenant_id') then
    v_msg := v_msg || 'logs heeft geen tenant_id. ';
  else
    drop policy if exists logs_admin_read on public.logs;
    create policy logs_admin_read on public.logs
      for select to authenticated using (public._is_admin_of(tenant_id));
    -- Schrijven blijft exact zoals het was: ik weet niet wat deze tabel
    -- vult en een audit-spoor dat stilvalt merk je pas als je het nodig
    -- hebt.
    drop policy if exists logs_write_unchanged on public.logs;
    create policy logs_write_unchanged on public.logs
      for insert to authenticated with check (true);
    alter table public.logs enable row level security;
    v_msg := v_msg || 'logs: alleen leesbaar voor actieve admin van die tenant. ';
  end if;

  if to_regclass('public.wallet_exchanges') is null then
    v_msg := v_msg || 'wallet_exchanges bestaat niet.';
  else
    drop policy if exists wallet_exchanges_read on public.wallet_exchanges;
    -- wallet_exchanges heeft GEEN tenant_id (bevestigd), dus de admintak
    -- loopt via wallets.
    create policy wallet_exchanges_read on public.wallet_exchanges
      for select to authenticated
      using (
        exists (select 1 from public.wallets w
                  join public.advertisers a on a.id = w.advertiser_id
                 where w.id = wallet_exchanges.wallet_id
                   and a.user_id = auth.uid())
        or exists (select 1 from public.wallets w
                    where w.id = wallet_exchanges.wallet_id
                      and public._is_admin_of(w.tenant_id))
      );
    alter table public.wallet_exchanges enable row level security;
    v_msg := v_msg || 'wallet_exchanges: eigen wallet of eigen tenant.';
  end if;

  perform public._log(1, 'A1 logs + wallet_exchanges RLS', 'GELUKT: ' || v_msg);
exception when others then
  perform public._log(1, 'A1 logs + wallet_exchanges RLS', 'FOUT: ' || sqlerrm);
end;
$a1$;


-- ── A2 · bankbewijzen dicht voor een uitgezette admin ────────────────
do $a2$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='storage' and tablename='objects'
                    and policyname='slip_admin_read') then
    perform public._log(2, 'A2 bankbewijzen',
      'OVERGESLAGEN: policy slip_admin_read bestaat niet op storage.objects');
    return;
  end if;
  drop policy if exists slip_admin_read on storage.objects;
  create policy slip_admin_read on storage.objects
    for select to authenticated
    using (
      bucket_id = 'wallet_payment_slips'
      and exists (select 1 from public.user_profiles up
                   where up.user_id = auth.uid()
                     and up.role = 'admin'
                     and coalesce(up.is_active, true) = true
                     and coalesce(up.status, 'active') <> 'inactive')
    );
  perform public._log(2, 'A2 bankbewijzen', 'GELUKT: uitgezette admin komt er niet meer bij');
exception when others then
  perform public._log(2, 'A2 bankbewijzen',
    'FOUT: ' || sqlerrm || ' — waarschijnlijk geen rechten op storage.objects vanuit de SQL editor; doe het dan via Dashboard > Storage > Policies');
end;
$a2$;


-- ── A3 · de uitnodiging geeft onze kostprijs weg ─────────────────────
-- to_jsonb(i) geeft ELKE kolom terug aan een anonieme beller: het
-- commissietarief dat wij een affiliate betalen, en de maandprijs, nog
-- voordat iemand ja heeft gezegd.
do $a3$
begin
  if to_regprocedure('public.get_invite_by_token(text)') is null then
    perform public._log(3, 'A3 uitnodiging versmald', 'OVERGESLAGEN: functie bestaat niet');
    return;
  end if;
  execute $ddl$
    create or replace function public.get_invite_by_token(p_token text)
    returns jsonb language sql security definer set search_path = public stable
    as $body$
      select jsonb_build_object(
               'id', i.id, 'email', i.email, 'role', i.role,
               'tenant_id', i.tenant_id, 'affiliate_id', i.affiliate_id,
               'expires_at', i.expires_at, 'status', i.status,
               'tenant_name', t.name)
        from public.invitations i
        left join public.tenants t on t.id = i.tenant_id
       where i.token::text = p_token
       limit 1;
    $body$;
  $ddl$;
  revoke all on function public.get_invite_by_token(text) from public;
  grant execute on function public.get_invite_by_token(text) to anon, authenticated;
  perform public._log(3, 'A3 uitnodiging versmald', 'GELUKT: acht velden, geen commissie en geen prijs');
exception when others then
  perform public._log(3, 'A3 uitnodiging versmald', 'FOUT: ' || sqlerrm);
end;
$a3$;


-- ── A4 · de clawback pakt de verkeerde referral-link ─────────────────
-- De trigger die commissie AANMAAKT filtert op de actieve link. De
-- functie die hem TERUGHAALT pakt de oudste, zonder statusfilter — dus
-- bij iemand met een afgewezen oude link wordt er nul teruggehaald.
do $a4$
declare v_fn text; v_src text; v_new text;
begin
  select p.proname into v_fn
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f'
     and position('order by rl.created_at' in public._fndef_safe(p.oid)) > 0
   limit 1;

  if v_fn is null then
    perform public._log(4, 'A4 clawback actieve link',
      'OVERGESLAGEN: geen functie gevonden met "order by rl.created_at"');
    return;
  end if;

  select public._fndef_safe(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=v_fn and p.prokind='f' limit 1;

  if position('coalesce(rl.status' in v_src) > 0 then
    perform public._log(4, 'A4 clawback actieve link', 'AL GOED: ' || v_fn || ' filtert al op status');
    return;
  end if;

  v_new := replace(v_src, 'order by rl.created_at',
    'and coalesce(rl.status, ''active'') = ''active''
   order by rl.created_at desc');
  execute v_new;
  perform public._log(4, 'A4 clawback actieve link', 'GELUKT: ' || v_fn || ' pakt nu de actieve link');
exception when others then
  perform public._log(4, 'A4 clawback actieve link', 'FOUT: ' || sqlerrm);
end;
$a4$;


-- ── A5 · een korting van -50% is een toeslag ─────────────────────────
do $a5$
begin
  if to_regclass('public.advertiser_perks') is null then
    perform public._log(5, 'A5 kortingsgrens', 'OVERGESLAGEN: advertiser_perks bestaat niet');
    return;
  end if;
  if exists (select 1 from pg_constraint
              where conrelid='public.advertiser_perks'::regclass
                and conname='advertiser_perks_amount_sane') then
    perform public._log(5, 'A5 kortingsgrens', 'AL GOED');
    return;
  end if;
  alter table public.advertiser_perks
    add constraint advertiser_perks_amount_sane
    check (amount is null
           or kind not in ('topup_discount','subscription_discount')
           or (amount >= 0 and amount <= 100)) not valid;
  perform public._log(5, 'A5 kortingsgrens', 'GELUKT: 0-100');
exception when others then
  perform public._log(5, 'A5 kortingsgrens', 'FOUT: ' || sqlerrm);
end;
$a5$;


-- ── A6 · refunds en correcties op het rapport van de klant ───────────
do $a6$
begin
  execute $ddl$
    create or replace function public.my_wallet_extras(p_advertiser_id uuid)
    returns table (kind text, row_id uuid, at timestamptz, amount numeric,
                   currency text, status text, reference text)
    language plpgsql security definer set search_path = public
    as $body$
    begin
      -- SECURITY DEFINER zet RLS hierbinnen uit, dus DEZE controle IS de
      -- beveiliging. auth.uid() komt van de sessie, nooit van de beller.
      if not exists (select 1 from public.advertisers a
                      where a.id = p_advertiser_id and a.user_id = auth.uid()) then
        raise exception 'Not your advertiser' using errcode = '42501';
      end if;
      if to_regclass('public.wallet_refunds') is not null then
        return query select 'refund'::text, r.id, r.created_at,
                            -abs(r.amount)::numeric, r.currency::text,
                            r.status::text, r.reference::text
                       from public.wallet_refunds r
                      where r.advertiser_id = p_advertiser_id and r.status = 'approved';
      end if;
      if to_regclass('public.wallet_adjustments') is not null then
        return query select 'adjustment'::text, j.id, j.created_at,
                            j.delta::numeric, j.currency::text,
                            j.status::text, j.reference::text
                       from public.wallet_adjustments j
                      where j.advertiser_id = p_advertiser_id and j.status = 'approved';
      end if;
    end;
    $body$;
  $ddl$;
  revoke execute on function public.my_wallet_extras(uuid) from public, anon;
  grant execute on function public.my_wallet_extras(uuid) to authenticated;
  perform public._log(6, 'A6 refunds op het rapport', 'GELUKT');
exception when others then
  perform public._log(6, 'A6 refunds op het rapport', 'FOUT: ' || sqlerrm);
end;
$a6$;


-- ── A7 · de drie views lezen als de beller ───────────────────────────
do $a7$
declare v_name text; v_kind "char"; v_done text := '';
begin
  foreach v_name in array array['top_ups_view','referral_links_with_details','referral_commissions_with_details'] loop
    select c.relkind into v_kind from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname=v_name;
    if v_kind is null then v_done := v_done || v_name || ':bestaat niet. '; continue; end if;
    if v_kind <> 'v' then v_done := v_done || v_name || ':geen view. '; continue; end if;
    execute format('alter view public.%I set (security_invoker = true)', v_name);
    execute format('grant select on public.%I to authenticated', v_name);
    v_done := v_done || v_name || ':ok. ';
  end loop;
  perform public._log(7, 'A7 views', 'GELUKT: ' || v_done);
exception when others then
  perform public._log(7, 'A7 views', 'FOUT: ' || sqlerrm);
end;
$a7$;


-- ── A8 · rate_limit_check dicht voor anon ────────────────────────────
do $a8$
begin
  if to_regprocedure('public.rate_limit_check(text, integer, integer)') is null then
    perform public._log(8, 'A8 rate limit', 'OVERGESLAGEN: functie niet gevonden');
    return;
  end if;
  revoke execute on function public.rate_limit_check(text, integer, integer)
    from public, anon, authenticated;
  grant execute on function public.rate_limit_check(text, integer, integer) to service_role;
  perform public._log(8, 'A8 rate limit', 'GELUKT: server-only');
exception when others then
  perform public._log(8, 'A8 rate limit', 'FOUT: ' || sqlerrm);
end;
$a8$;


-- ── A9 · het e-mailadres van andermans klant ─────────────────────────
-- affiliate_referral_stats declareert referred_advertiser_email, en de
-- hook die het aanroept hangt in zowel de affiliate- als de
-- adverteerder-app. Een referral-link is publiek deelbaar.
do $a9$
declare v_src text; v_new text; v_sig text; v_hits int;
begin
  select public._fndef_safe(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='affiliate_referral_stats' and p.prokind='f' limit 1;

  if v_src is null or v_src = '' then
    perform public._log(9, 'A9 e-mailadres weg', 'OVERGESLAGEN: functie niet leesbaar of niet aanwezig');
    return;
  end if;
  if position('referred_advertiser_email' in v_src) = 0 then
    perform public._log(9, 'A9 e-mailadres weg', 'AL GOED');
    return;
  end if;

  select count(*) into v_hits from regexp_split_to_table(v_src, E'\n') l
   where l like '%referred_advertiser_email%';
  if v_hits <> 2 then
    perform public._log(9, 'A9 e-mailadres weg',
      'OVERGESLAGEN: kolom staat op ' || v_hits || ' regels in plaats van 2, ik herschrijf hem niet op de gok');
    return;
  end if;

  select string_agg(x.l, E'\n' order by x.rn) into v_new
    from (select row_number() over () as rn, l
            from regexp_split_to_table(v_src, E'\n') l) x
   where x.l not like '%referred_advertiser_email%';

  select p.oid::regprocedure::text into v_sig
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='affiliate_referral_stats' limit 1;

  -- drop + create in deze subtransactie: create or replace kan het
  -- returntype niet wijzigen, en als het opnieuw aanmaken misgaat rolt de
  -- drop mee terug zodat de oude functie blijft staan.
  execute format('drop function if exists %s', v_sig);
  execute v_new;
  execute format('grant execute on function %s to authenticated',
                 (select p.oid::regprocedure::text from pg_proc p
                    join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname='public' and p.proname='affiliate_referral_stats' limit 1));
  perform public._log(9, 'A9 e-mailadres weg', 'GELUKT');
exception when others then
  perform public._log(9, 'A9 e-mailadres weg',
    'FOUT: ' || sqlerrm || ' — de oude functie staat er nog precies zoals hij was');
end;
$a9$;


-- ── B1a · een uitgezette klant wordt nog steeds geincasseerd ─────────
do $b1a$
declare v_src text; v_new text;
begin
  select public._fndef_safe(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='subscription_billing_run' and p.prokind='f' limit 1;

  if v_src is null or v_src = '' then
    perform public._log(10, 'B1a incasso slaat uitgezet over',
      'OVERGESLAGEN: subscription_billing_run bestaat niet of is niet leesbaar');
    return;
  end if;
  if position('not in (''cancelled'', ''inactive'', ''paused'')' in v_src) > 0 then
    perform public._log(10, 'B1a incasso slaat uitgezet over', 'AL GOED');
    return;
  end if;
  if position('and s.status <> ''cancelled''' in v_src) = 0 then
    perform public._log(10, 'B1a incasso slaat uitgezet over',
      'OVERGESLAGEN: de incassolus ziet er anders uit dan verwacht — stuur me de body, dan doe ik het exact');
    return;
  end if;
  v_new := replace(v_src, 'and s.status <> ''cancelled''',
                   'and s.status not in (''cancelled'', ''inactive'', ''paused'')');
  execute v_new;
  perform public._log(10, 'B1a incasso slaat uitgezet over', 'GELUKT');
exception when others then
  perform public._log(10, 'B1a incasso slaat uitgezet over', 'FOUT: ' || sqlerrm);
end;
$b1a$;


-- ── B1b · en zet zichzelf daarna weer op actief ──────────────────────
do $b1b$
declare v_fn text; v_src text; v_new text;
begin
  select p.proname into v_fn from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f'
     and position('when status = ''cancelled'' then status else ''active''' in public._fndef_safe(p.oid)) > 0
   limit 1;

  if v_fn is null then
    perform public._log(11, 'B1b geen zelf-reactivatie',
      'OVERGESLAGEN: geen functie met die case-expressie gevonden');
    return;
  end if;

  select public._fndef_safe(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=v_fn and p.prokind='f' limit 1;

  v_new := replace(v_src,
    'when status = ''cancelled'' then status else ''active''',
    'when status in (''cancelled'', ''inactive'', ''paused'') then status else ''active''');
  execute v_new;
  perform public._log(11, 'B1b geen zelf-reactivatie', 'GELUKT: ' || v_fn);
exception when others then
  perform public._log(11, 'B1b geen zelf-reactivatie', 'FOUT: ' || sqlerrm);
end;
$b1b$;


-- ── B2 · een geannuleerd voorschot blokkeert die storting voor altijd ─
do $b2$
declare v_idx text; v_msg text := '';
begin
  if to_regclass('public.wallet_precharges') is null then
    perform public._log(12, 'B2 voorschot-index', 'OVERGESLAGEN: wallet_precharges bestaat niet');
    return;
  end if;
  select i.indexname into v_idx from pg_indexes i
   where i.schemaname='public' and i.tablename='wallet_precharges'
     and i.indexdef ilike '%source_wallet_topup_id%'
     and i.indexdef ilike '%unique%'
     and i.indexdef not ilike '%outstanding%'
   limit 1;
  if v_idx is not null then
    execute format('drop index if exists public.%I', v_idx);
    v_msg := 'oude index ' || v_idx || ' weg. ';
  else
    v_msg := 'geen status-loze index gevonden. ';
  end if;
  create unique index if not exists wallet_precharges_open_source_uq
    on public.wallet_precharges (source_wallet_topup_id)
    where source_wallet_topup_id is not null and status = 'outstanding';
  perform public._log(12, 'B2 voorschot-index', 'GELUKT: ' || v_msg || 'alleen een LOPEND voorschot blokkeert nog');
exception when others then
  perform public._log(12, 'B2 voorschot-index', 'FOUT: ' || sqlerrm);
end;
$b2$;


-- ── B3 · geen rem op openstaande withdrawals ─────────────────────────
do $b3$
begin
  if to_regclass('public.ad_account_withdrawals') is null then
    perform public._log(13, 'B3 withdrawal-rem', 'OVERGESLAGEN: tabel bestaat niet');
    return;
  end if;
  execute $ddl$
    create or replace function public._cap_pending_withdrawals()
    returns trigger language plpgsql security definer set search_path = public
    as $body$
    declare v_open int;
    begin
      if new.status is distinct from 'pending' then return new; end if;
      select count(*) into v_open from public.ad_account_withdrawals w
       where w.ad_account_id = new.ad_account_id and w.status = 'pending';
      if v_open >= 3 then
        raise exception 'There are already % withdrawal requests waiting on this ad account. Wait for those to be reviewed first.', v_open
          using errcode = '22000';
      end if;
      return new;
    end;
    $body$;
  $ddl$;
  drop trigger if exists trg_cap_pending_withdrawals on public.ad_account_withdrawals;
  create trigger trg_cap_pending_withdrawals before insert on public.ad_account_withdrawals
    for each row execute function public._cap_pending_withdrawals();
  perform public._log(13, 'B3 withdrawal-rem', 'GELUKT: max 3 openstaand per rekening');
exception when others then
  perform public._log(13, 'B3 withdrawal-rem', 'FOUT: ' || sqlerrm);
end;
$b3$;


-- ── B4 · tabellen zonder audit-spoor ─────────────────────────────────
do $b4$
declare v_tbl text; v_ok int := 0; v_mis text := '';
begin
  if to_regprocedure('public._audit_row_change()') is null then
    perform public._log(14, 'B4 audit-triggers', 'OVERGESLAGEN: _audit_row_change bestaat niet');
    return;
  end if;
  foreach v_tbl in array array[
    'subject_members','subject_member_accounts','notification_preferences',
    'referral_clawbacks','advertiser_plans','advertiser_perks','tax_rates',
    'bank_accounts','wallet_precharges','wallet_refunds','wallet_adjustments'] loop
    begin
      if to_regclass('public.' || v_tbl) is null then
        v_mis := v_mis || v_tbl || ' '; continue;
      end if;
      execute format('drop trigger if exists trg_audit_%I on public.%I', v_tbl, v_tbl);
      execute format('create trigger trg_audit_%I after insert or update or delete on public.%I
                        for each row execute function public._audit_row_change()', v_tbl, v_tbl);
      v_ok := v_ok + 1;
    exception when others then
      v_mis := v_mis || v_tbl || '(' || sqlerrm || ') ';
    end;
  end loop;
  perform public._log(14, 'B4 audit-triggers',
    'GELUKT: ' || v_ok || ' van 11' || case when v_mis <> '' then ' — niet gedaan: ' || v_mis else '' end);
exception when others then
  perform public._log(14, 'B4 audit-triggers', 'FOUT: ' || sqlerrm);
end;
$b4$;


-- ── B4b · wie een perk introk ────────────────────────────────────────
do $b4b$
begin
  if to_regclass('public.advertiser_perks') is null then
    perform public._log(15, 'B4b revoked_by', 'OVERGESLAGEN: tabel bestaat niet'); return;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='advertiser_perks'
                and column_name='revoked_by') then
    perform public._log(15, 'B4b revoked_by', 'AL GOED'); return;
  end if;
  alter table public.advertiser_perks
    add column revoked_by uuid references public.user_profiles(id),
    add column revoked_at timestamptz;
  perform public._log(15, 'B4b revoked_by', 'GELUKT');
exception when others then
  perform public._log(15, 'B4b revoked_by', 'FOUT: ' || sqlerrm);
end;
$b4b$;


-- ── B5 · een uitgezette admin kan nog een perk geven ─────────────────
-- Een medewerker-admin mag de prijs van een plan niet wijzigen
-- (owner-only, met opzet) maar mag die klant wel een 100% waiver geven.
do $b5$
declare r record; v_src text; v_new text; v_ok int := 0; v_note text := '';
begin
  for r in select p.oid, p.proname from pg_proc p
             join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.prokind='f'
              and p.proname in ('grant_advertiser_perk','revoke_advertiser_perk') loop
    begin
      v_src := public._fndef_safe(r.oid);
      if v_src = '' then v_note := v_note || r.proname || ':onleesbaar '; continue; end if;
      if position('coalesce(up.is_active, true)' in v_src) > 0
         or position('_require_profile' in v_src) > 0 then
        v_note := v_note || r.proname || ':al goed '; continue;
      end if;
      v_new := replace(v_src, 'and up.role = ''admin''',
        'and up.role = ''admin''
       and coalesce(up.is_active, true) = true
       and coalesce(up.status, ''active'') <> ''inactive''');
      if v_new = v_src then v_note := v_note || r.proname || ':vorm wijkt af '; continue; end if;
      execute v_new;
      v_ok := v_ok + 1;
    exception when others then
      v_note := v_note || r.proname || '(' || sqlerrm || ') ';
    end;
  end loop;
  perform public._log(16, 'B5 perk-RPCs',
    case when v_ok > 0 then 'GELUKT: ' || v_ok || ' aangepast. ' else 'NIETS GEWIJZIGD. ' end || v_note);
exception when others then
  perform public._log(16, 'B5 perk-RPCs', 'FOUT: ' || sqlerrm);
end;
$b5$;


-- ── Wat er nu staat, onafhankelijk van wat hierboven meldde ──────────
do $chk$
begin
  perform public._log(90, 'CONTROLE RLS op logs + wallet_exchanges (van 2)',
    (select count(*)::text from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname in ('logs','wallet_exchanges') and c.relrowsecurity));
  perform public._log(91, 'CONTROLE audit-triggers (van 11)',
    (select count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and t.tgname like 'trg_audit_%'
        and c.relname in ('subject_members','subject_member_accounts','notification_preferences',
                          'referral_clawbacks','advertiser_plans','advertiser_perks','tax_rates',
                          'bank_accounts','wallet_precharges','wallet_refunds','wallet_adjustments')));
  perform public._log(92, 'CONTROLE my_wallet_extras bestaat',
    (to_regprocedure('public.my_wallet_extras(uuid)') is not null)::text);
  perform public._log(93, 'CONTROLE withdrawal-rem bestaat',
    (exists (select 1 from pg_trigger where tgname='trg_cap_pending_withdrawals'))::text);
  perform public._log(94, 'CONTROLE voorschot-index op status',
    (exists (select 1 from pg_indexes where schemaname='public'
              and tablename='wallet_precharges' and indexdef ilike '%outstanding%'
              and indexdef ilike '%unique%'))::text);
  perform public._log(95, 'CONTROLE testaccounts op productie',
    coalesce((select string_agg(u.email, ' | ') from auth.users u
               where u.email like '%@primescalemedia.test'), '(geen)'));
exception when others then
  perform public._log(99, 'CONTROLE', 'FOUT: ' || sqlerrm);
end;
$chk$;

drop function if exists public._fndef_safe(oid);
drop function if exists public._log(int, text, text);

-- =====================================================================
-- DIT IS HET RESULTAAT. Laatste query, dus dit is wat de editor toont.
-- =====================================================================
select nr, deel, uitkomst from public._psm_run_log order by nr;
