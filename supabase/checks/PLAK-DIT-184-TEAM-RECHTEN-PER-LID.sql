-- ════════════════════════════════════════════════════════════════════
-- PLAK 184 -- rechten per teamlid, en de geldfuncties die ze toetsen
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 01-10: "ik wil gewoon dat een tweede user net als
-- advertiser is, tenzij dingen uitgevinkt". Dus per lid vinkjes:
--
--   topup     wallet top-up indienen
--   exchange  wisselen tussen de EUR- en USD-wallet
--   request   een ad account aanvragen (EUR 50 als het niet inbegrepen is)
--   fund      geld van de wallet naar een ad account
--   withdraw  geld van een ad account terugvragen
--   pay       een factuur uit de wallet betalen
--   company   de bedrijfsgegevens bewerken (app-kant)
--
-- Tot nu toe eisten de zes geldfuncties dat de aanroeper ZELF de
-- eigenaar is (advertisers.user_id = auth.uid()). Een teamlid werd dus
-- altijd geweigerd -- terecht, maar dan kan een vinkje ook niets.
-- Nu vraagt elke functie: "is dit de eigenaar, OF een lid met dit
-- recht?" Voor de eigenaar verandert er niets: _psm_can kijkt eerst of
-- je de eigenaar bent.
--
-- Een recht wordt in de DATABASE getoetst, niet alleen in de app. Een
-- verborgen knop is geen beveiliging.
--
-- Wat er per functie verandert is EEN regel: waar de adverteerder van
-- de aanroeper wordt gezocht. De rest -- saldo, fee, grootboek, wie het
-- deed in de auditregel -- blijft precies zoals het was. Elke
-- functiewijziging is een eigen blok met EEN execute, en slaat zichzelf
-- over als hij al gedraaid is.
--
-- Twee keer plakken kan.

-- ── blk0: de poort ──────────────────────────────────────────────────
do $blk0$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = '_psm_member_of') then
    raise exception 'Plak 175 staat er niet (_psm_member_of ontbreekt).';
  end if;
  if exists (select 1 from public.advertisers where user_id is not null
              group by user_id having count(*) > 1) then
    raise exception 'Er is een login met twee adverteerders -- dan is "de adverteerder van deze login" niet eenduidig. Meld het.';
  end if;
end
$blk0$;

-- ── blk1: de rechten op het lidmaatschap ───────────────────────────
do $blk1$
begin
  alter table public.subject_members
    add column if not exists permissions text[] not null default '{}';
  alter table public.subject_members drop constraint if exists subject_members_permissions_check;
  alter table public.subject_members add constraint subject_members_permissions_check
    check (permissions <@ array['topup','exchange','request','fund','withdraw','pay','company']::text[]);
end
$blk1$;

-- ── blk2: de twee toetsen ──────────────────────────────────────────
do $blk2$
begin
  -- Mag deze login dit, voor deze adverteerder?
  create or replace function public._psm_can(p_advertiser uuid, p_perm text)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  as $fn$
    select exists (
             select 1 from public.advertisers a
              where a.id = p_advertiser and a.user_id = auth.uid()
           )
        or exists (
             select 1 from public.subject_members m
              where m.subject_kind = 'advertiser'
                and m.subject_id = p_advertiser
                and m.user_id = auth.uid()
                and (m.role = 'owner' or p_perm = any (m.permissions))
           );
  $fn$;
  revoke all on function public._psm_can(uuid, text) from public, anon;
  grant execute on function public._psm_can(uuid, text) to authenticated, service_role;

  -- Voor welke adverteerder handelt deze login? Eerst de eigen (de
  -- eigenaar), anders het team waar hij lid van is.
  create or replace function public._psm_acting_advertiser(p_tenant uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path to 'public'
  as $fn$
    select coalesce(
      (select a.id from public.advertisers a
        where a.user_id = auth.uid()
          and (p_tenant is null or a.tenant_id = p_tenant)
        order by a.created_at limit 1),
      (select m.subject_id from public.subject_members m
        where m.user_id = auth.uid()
          and m.subject_kind = 'advertiser'
          and m.role <> 'owner'
          and (p_tenant is null or m.tenant_id = p_tenant)
        order by m.created_at limit 1)
    );
  $fn$;
  revoke all on function public._psm_acting_advertiser(uuid) from public, anon;
  grant execute on function public._psm_acting_advertiser(uuid) to authenticated, service_role;
end
$blk2$;

-- ── blk3: wallet top-up indienen -> 'topup' ────────────────────────
do $blk3$
declare v_def text; v_new text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_topup_advertiser_create';
  v_def := pg_get_functiondef(v_oid);
  if v_def ~ '_psm_can' then raise notice 'wallet_topup_advertiser_create: al gedaan'; return; end if;
  v_new := regexp_replace(v_def,
    'where user_id = v_uid[[:space:]]+and tenant_id = v_profile\.tenant_id',
    'where id = public._psm_acting_advertiser(v_profile.tenant_id) and public._psm_can(id, ''topup'')');
  if v_new = v_def then raise exception 'wallet_topup_advertiser_create: patroon niet gevonden -- niets gewijzigd'; end if;
  execute v_new;
  revoke all on function public.wallet_topup_advertiser_create(numeric, text, text) from public, anon;
  grant execute on function public.wallet_topup_advertiser_create(numeric, text, text) to authenticated, service_role;
end
$blk3$;

-- ── blk4: exchange -> 'exchange' ───────────────────────────────────
do $blk4$
declare v_def text; v_new text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'wallet_exchange';
  v_def := pg_get_functiondef(v_oid);
  if v_def ~ '_psm_can' then raise notice 'wallet_exchange: al gedaan'; return; end if;
  v_new := regexp_replace(v_def,
    'AND a\.user_id = v_user_id;',
    'AND public._psm_can(a.id, ''exchange'');');
  if v_new = v_def then raise exception 'wallet_exchange: patroon niet gevonden -- niets gewijzigd'; end if;
  execute v_new;
  revoke all on function public.wallet_exchange(uuid, text, numeric) from public, anon;
  grant execute on function public.wallet_exchange(uuid, text, numeric) to authenticated, service_role;
end
$blk4$;

-- ── blk5: ad account aanvragen -> 'request' ────────────────────────
do $blk5$
declare v_def text; v_new text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_request_create_paid';
  v_def := pg_get_functiondef(v_oid);
  if v_def ~ '_psm_can' then raise notice 'ad_account_request_create_paid: al gedaan'; return; end if;
  v_new := regexp_replace(v_def,
    'where user_id = v_uid order by created_at desc limit 1;',
    'where id = public._psm_acting_advertiser(null) and public._psm_can(id, ''request'') limit 1;');
  if v_new = v_def then raise exception 'ad_account_request_create_paid: patroon niet gevonden -- niets gewijzigd'; end if;
  execute v_new;
  revoke all on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) from public, anon;
  grant execute on function public.ad_account_request_create_paid(text, text, text, text, text, jsonb) to authenticated, service_role;
end
$blk5$;

-- ── blk6: ad account funden -> 'fund' ──────────────────────────────
do $blk6$
declare v_def text; v_new text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'top_up_create_for_advertiser';
  v_def := pg_get_functiondef(v_oid);
  if v_def ~ '_psm_can' then raise notice 'top_up_create_for_advertiser: al gedaan'; return; end if;
  v_new := regexp_replace(v_def,
    'FROM advertisers a WHERE a\.user_id = v_user_id LIMIT 1;',
    'FROM advertisers a WHERE a.id = public._psm_acting_advertiser(null) AND public._psm_can(a.id, ''fund'') LIMIT 1;');
  if v_new = v_def then raise exception 'top_up_create_for_advertiser: patroon niet gevonden -- niets gewijzigd'; end if;
  execute v_new;
  revoke all on function public.top_up_create_for_advertiser(uuid, text, numeric, text, text) from public, anon;
  grant execute on function public.top_up_create_for_advertiser(uuid, text, numeric, text, text) to authenticated, service_role;
end
$blk6$;

-- ── blk7: geld terugvragen van een ad account -> 'withdraw' ────────
do $blk7$
declare v_def text; v_new text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ad_account_withdrawal_request';
  v_def := pg_get_functiondef(v_oid);
  if v_def ~ '_psm_can' then raise notice 'ad_account_withdrawal_request: al gedaan'; return; end if;
  v_new := regexp_replace(v_def,
    'from public\.advertisers[[:space:]]+where user_id = v_uid[[:space:]]+limit 1;',
    'from public.advertisers where id = public._psm_acting_advertiser(null) and public._psm_can(id, ''withdraw'') limit 1;');
  if v_new = v_def then raise exception 'ad_account_withdrawal_request: patroon niet gevonden -- niets gewijzigd'; end if;
  execute v_new;
  revoke all on function public.ad_account_withdrawal_request(uuid, numeric, text, text) from public, anon;
  grant execute on function public.ad_account_withdrawal_request(uuid, numeric, text, text) to authenticated, service_role;
end
$blk7$;

-- ── blk8: factuur betalen uit de wallet -> 'pay' ───────────────────
do $blk8$
declare v_def text; v_new text; v_oid oid;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'invoice_pay_from_wallet';
  v_def := pg_get_functiondef(v_oid);
  if v_def ~ '_psm_can' then raise notice 'invoice_pay_from_wallet: al gedaan'; return; end if;
  v_new := regexp_replace(v_def,
    'where a\.id = v_inv\.advertiser_id and a\.user_id = v_uid',
    'where a.id = v_inv.advertiser_id and public._psm_can(a.id, ''pay'')');
  if v_new = v_def then raise exception 'invoice_pay_from_wallet: patroon niet gevonden -- niets gewijzigd'; end if;
  execute v_new;
  revoke all on function public.invoice_pay_from_wallet(uuid) from public, anon;
  grant execute on function public.invoice_pay_from_wallet(uuid) to authenticated, service_role;
end
$blk8$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_name = 'subject_members' and column_name = 'permissions')                  as kolom_rechten,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('wallet_topup_advertiser_create','wallet_exchange','ad_account_request_create_paid',
                        'top_up_create_for_advertiser','ad_account_withdrawal_request','invoice_pay_from_wallet')
      and pg_get_functiondef(p.oid) ~ '_psm_can')                                          as functies_van_6,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('wallet_topup_advertiser_create','wallet_exchange','ad_account_request_create_paid',
                        'top_up_create_for_advertiser','ad_account_withdrawal_request','invoice_pay_from_wallet',
                        '_psm_can','_psm_acting_advertiser')
      and has_function_privilege('anon', p.oid, 'execute'))                                as anon_mag_nog,
  case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('wallet_topup_advertiser_create','wallet_exchange','ad_account_request_create_paid',
                                  'top_up_create_for_advertiser','ad_account_withdrawal_request','invoice_pay_from_wallet')
                and pg_get_functiondef(p.oid) ~ '_psm_can') = 6
        and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('wallet_topup_advertiser_create','wallet_exchange','ad_account_request_create_paid',
                                  'top_up_create_for_advertiser','ad_account_withdrawal_request','invoice_pay_from_wallet',
                                  '_psm_can','_psm_acting_advertiser')
                and has_function_privilege('anon', p.oid, 'execute')) = 0
       then 'OK' else 'NIET GOED -- meld het' end                                           as uitkomst;
