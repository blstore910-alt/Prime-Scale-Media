-- ════════════════════════════════════════════════════════════════════
-- PLAK 115 — de limieten omlaag, en een die er helemaal niet was
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 28-09: "15 openstaande top-ups per portemonnee en 30
-- financiële verzoeken per uur, dit is al veelste hoog. Ad-acc-topup
-- limiet op 10 openstaande en wallet op 5 openstaande ofzo, mag dus
-- veel lager."
--
-- WAT ER STOND
--
--   wallet_topups   maximaal 15 openstaand per portemonnee
--                   (_cap_pending_wallet_topups)
--   top_ups         NIETS. Geen enkele limiet op openstaande
--                   ad-account-fundingen -- ik heb alle veertien
--                   triggers op die tabel nagelopen.
--
-- Vijftien is geen limiet die iemand met opzet haalt; tegen die tijd is
-- de balie al een uur kwijt aan rijen die allemaal over hetzelfde geld
-- gaan. En bij top_ups was er niets, terwijl daar per rij geld uit de
-- portemonnee gaat op het moment van indienen.
--
-- WAT HET WORDT
--
--   wallet_topups   5 openstaand
--   top_ups         10 openstaand (per ad-account)
--
-- DIT IS DE NOODREM, NIET DE REM
--
-- De app remt eerder en vriendelijker af: binnen tien minuten na een
-- eerdere claim krijgt de klant te lezen dat we hem al hebben, met een
-- vinkje "ja, dit is een andere overboeking". Zie
-- lib/pure-topup-again.ts. Deze grenzen zijn wat er overblijft als
-- iemand langs het scherm heen werkt.
--
-- DE FOUTMELDING IS WAT DE KLANT LEEST
--
-- Een `raise exception` uit een trigger komt bij de klant op het scherm
-- terecht, dus hij staat er in gewone taal in plaats van als een
-- databasezin.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak115 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak115;

-- ── 1. wallet: van 15 naar 5 ────────────────────────────────────────
do $blk0$
begin
  create or replace function public._cap_pending_wallet_topups()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_count int;
  begin
    if new.status is distinct from 'pending' then
      return new;
    end if;
    select count(*) into v_count
      from public.wallet_topups
     where wallet_id = new.wallet_id
       and status = 'pending';
    if v_count >= 5 then
      raise exception 'You already have 5 top-ups waiting for us to check. We will get to those first — message us if one of them is wrong.'
        using errcode = '54000';
    end if;
    return new;
  end;
  $fn$;

  revoke all on function public._cap_pending_wallet_topups() from public, anon;
  grant execute on function public._cap_pending_wallet_topups()
    to authenticated, service_role;

  insert into _plak115 values (0, 'wallet: openstaande top-ups',
    'was 15, nu 5 per portemonnee');
exception when others then
  insert into _plak115 values (0, 'wallet: openstaande top-ups',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. ad-account funding: van niets naar 10 ───────────────────────
do $blk1$
begin
  create or replace function public._cap_pending_account_topups()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_count int;
  begin
    if new.status is distinct from 'pending' then
      return new;
    end if;
    -- Per AD-ACCOUNT, niet per klant: iemand met acht accounts die er
    -- op een ochtend vier bijvult is normaal werk, en die mag niet
    -- geraakt worden door een grens die voor herhaalde claims op EEN
    -- account bedoeld is.
    if new.account_id is null then
      return new;
    end if;
    select count(*) into v_count
      from public.top_ups
     where account_id = new.account_id
       and status = 'pending'
       and coalesce(is_deleted, false) = false;
    if v_count >= 10 then
      raise exception 'There are already 10 fundings waiting on this ad account. We will check those first — message us if one of them is wrong.'
        using errcode = '54000';
    end if;
    return new;
  end;
  $fn$;

  revoke all on function public._cap_pending_account_topups() from public, anon;
  grant execute on function public._cap_pending_account_topups()
    to authenticated, service_role;

  drop trigger if exists a2_cap_pending_account_topups on public.top_ups;
  create trigger a2_cap_pending_account_topups
    before insert on public.top_ups
    for each row execute function public._cap_pending_account_topups();

  insert into _plak115 values (1, 'ad-account: openstaande fundingen',
    'was GEEN grens, nu 10 per ad-account');
exception when others then
  insert into _plak115 values (1, 'ad-account: openstaande fundingen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── controle ────────────────────────────────────────────────────────
do $blk2$
declare
  v_w    boolean;
  v_a    integer;
  v_nu   text;
begin
  select position('>= 5' in pg_get_functiondef(p.oid)) > 0
    into v_w
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_cap_pending_wallet_topups';

  select count(*) into v_a
    from pg_trigger
   where tgname = 'a2_cap_pending_account_topups' and not tgisinternal;

  -- Staat er vandaag iemand al boven de nieuwe grenzen? Die rijen
  -- blijven gewoon staan -- de trigger kijkt alleen naar NIEUWE.
  select coalesce(string_agg(x.wat, ' | '), 'niemand')
    into v_nu
    from (
      select 'wallet ' || w.id::text || ': ' || count(*)::text || ' openstaand' as wat
        from public.wallet_topups wt
        join public.wallets w on w.id = wt.wallet_id
       where wt.status = 'pending'
       group by w.id
      having count(*) > 5
      union all
      select 'ad-account ' || t.account_id::text || ': ' || count(*)::text || ' openstaand'
        from public.top_ups t
       where t.status = 'pending' and t.account_id is not null
       group by t.account_id
      having count(*) > 10
    ) x;

  insert into _plak115 values (2, 'stand van zaken',
    'wallet op 5: ' || coalesce(v_w, false)::text ||
    ' | ad-accounttrigger: ' || v_a || '/1');
  insert into _plak115 values (3, 'zit er nu al iemand boven?', v_nu);
exception when others then
  insert into _plak115 values (2, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak115 order by n;
