-- ════════════════════════════════════════════════════════════════════
--  PLAK 57 — abonnementsbedrag wijzigen doet weer iets, en: welke
--            geld-functies staan er nog meer dicht?
--
--  GEVONDEN TIJDENS DE F4-WANDELING. Het bedrag van een abonnement
--  wijzigen (PSM0007, EUR 10 -> EUR 12) deed niets en zei:
--
--      "permission denied for function change_subscription_amount"
--
--  De functie bestaat en bewaakt zichzelf netjes (alleen een admin van
--  die tenant komt erdoor, de rest krijgt Forbidden) -- alleen het
--  uitvoerrecht ontbreekt. Dat kan twee oorzaken hebben: de migratie
--  die het recht geeft is nooit geplakt, of de noodrem
--  (FREEZE-MONEY.sql) heeft ooit gedraaid en is nooit teruggedraaid.
--
--  DIT BLOK DOET TWEE DINGEN
--    A  geeft het recht terug op change_subscription_amount
--    B  leest voor ELKE geld-functie of een ingelogde gebruiker hem nog
--       mag aanroepen -- zodat je in één tabel ziet welke knoppen er
--       verder nog stilletjes niets doen
--
--  Alleen A verandert iets; B leest.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p57;
create temp table _p57(nr int, wat text, uitkomst text);

-- ── A. HET RECHT TERUG ───────────────────────────────────────────────
do $blk0$
declare
  v_sig text;
  v_n   int := 0;
begin
  for v_sig in
    select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'change_subscription_amount'
  loop
    execute 'grant execute on function ' || v_sig || ' to authenticated, service_role';
    v_n := v_n + 1;
  end loop;

  insert into _p57 values (1, 'abonnementsbedrag wijzigen',
    case when v_n = 0 then 'FUNCTIE BESTAAT NIET op deze database'
         else v_n::text || ' variant(en) weer aanroepbaar door een ingelogde admin' end);
exception when others then
  insert into _p57 values (1, 'abonnementsbedrag wijzigen', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. WELKE GELD-FUNCTIES STAAN DICHT? (alleen lezen) ───────────────
do $blk1$
declare
  v_names text[] := array[
    'top_up_create_for_advertiser',
    'top_up_admin_verify',
    'top_up_admin_reject',
    'wallet_topup_admin_verify',
    'wallet_topup_admin_reject',
    'wallet_topup_admin_undo',
    'wallet_exchange',
    'invoice_pay_from_wallet',
    'wallet_admin_adjust',
    'wallet_create_for_advertiser',
    'wallet_precharge_create',
    'wallet_adjustment_request',
    'wise_confirm_suggestion',
    'change_subscription_amount',
    'ad_account_request_create_paid',
    'affiliate_payout_request_multi',
    'affiliate_payout_decide',
    'affiliate_payout_cancel',
    'referral_link_decide',
    'referral_link_assign',
    'affiliate_application_submit',
    'affiliate_application_decide',
    'affiliate_referral_stats',
    'affiliate_commission_list',
    'referral_commission_recalculate'
  ];
  v_name  text;
  v_open  text := '';
  v_shut  text := '';
  v_gone  text := '';
  v_found boolean;
  v_can   boolean;
begin
  foreach v_name in array v_names loop
    v_found := false;
    v_can := false;
    for v_can in
      select has_function_privilege('authenticated', p.oid, 'EXECUTE')
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_name
    loop
      v_found := true;
      exit when v_can;   -- één aanroepbare variant is genoeg
    end loop;

    if not v_found then
      v_gone := v_gone || v_name || ' · ';
    elsif v_can then
      v_open := v_open || v_name || ' · ';
    else
      v_shut := v_shut || v_name || ' · ';
    end if;
  end loop;

  insert into _p57 values (2, 'DICHT voor een ingelogde gebruiker',
    case when v_shut = '' then 'geen — alles wat er is, is aanroepbaar' else rtrim(v_shut, ' ·') end);
  insert into _p57 values (3, 'BESTAAT NIET op deze database',
    case when v_gone = '' then 'geen' else rtrim(v_gone, ' ·') end);
  insert into _p57 values (4, 'open (ter controle)',
    case when v_open = '' then 'geen' else rtrim(v_open, ' ·') end);
end
$blk1$;

-- ── C. HEEFT DE NOODREM OOIT GEDRAAID? ───────────────────────────────
do $blk2$
declare v_txt text;
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = '_money_freeze') then
    select coalesce(count(*)::text || ' rijen, laatste ' ||
                    coalesce(left(max(frozen_at)::text, 16), '?'), '0 rijen')
      into v_txt from public._money_freeze;
  else
    v_txt := 'de noodrem heeft hier nooit gedraaid (tabel bestaat niet)';
  end if;
  insert into _p57 values (5, 'noodrem (FREEZE-MONEY)', v_txt);
exception when others then
  insert into _p57 values (5, 'noodrem (FREEZE-MONEY)', 'niet te lezen: ' || sqlerrm);
end
$blk2$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p57 order by nr;
