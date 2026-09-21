-- =====================================================================
-- PLAK 33 — F2 meten voordat er iets verandert. LEEST ALLEEN.
-- =====================================================================
-- Plak 32 bevestigde de eerste commissie ooit tot op de cent: EUR 4,85,
-- EUR, unpaid, aan topup #000004, earnings_eur 4,85 = som van de rijen.
--
-- Vier controles op F2 vonden daarna wat er OMHEEN mis is. De ernstigste:
-- de accrual-trigger draait nu met volle rechten (plak 31), en `top_ups`
-- staat voor elke admin open op INSERT en UPDATE (plak 21 liet dat
-- bewust open). Een medewerker-admin kan dus vanuit de console een
-- funding op 'completed' zetten met elk bedrag dat hij typt, en de
-- trigger boekt daar commissie op -- ook op een link van een ANDERE
-- tenant, want de trigger zoekt de link alleen op advertiser.
--
-- Dit repareer ik niet blind: repo en live lopen uiteen. Deze plak haalt
-- op wat ik nodig heb om de reparatie te schrijven:
--
--   1-3   de live bodies van affiliate_referral_stats, de clawback en
--         top_up_admin_reject (vult reject de wallet terug?)
--   4-5   de twee views achter /commissions en /affiliates
--   6     welke triggers er op top_ups hangen, en wanneer
--   7     policies op de vijf tabellen van deze reis
--   8     welke rechten `authenticated` nog heeft op die tabellen
--   9     kolommen + constraints van referral_commissions
--   10    user_profiles.status: default en welke waarden er staan
--   11    notifications: kolommen en toegestane types (voor een melding
--         "je hebt commissie verdiend")
--   12    rij 8 van plak 32: saldo PSM0007 was 50,00, mijn optelsom gaf
--         1,50. Ik denk dat mijn som een factuur van de funding dubbel
--         aftrok. Dit laat de rijen zien in plaats van het te raden.
--
-- Veilig om vaker te draaien. Er wordt niets geschreven.
-- =====================================================================

set search_path = public;

create temporary table if not exists _m33 (nr int, item text, v text);
delete from _m33;

do $blk0$
declare
  v text;
begin
  -- 1. affiliate_referral_stats
  begin
    select string_agg(pg_get_functiondef(p.oid), E'\n\n-- ---- volgende overload ----\n\n')
      into v
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_referral_stats';
    insert into _m33 values (1, 'STUUR TERUG >> body affiliate_referral_stats', coalesce(v, 'bestaat niet'));
  exception when others then
    insert into _m33 values (1, 'body affiliate_referral_stats', 'MISLUKT: ' || sqlerrm);
  end;

  -- 2. clawback
  begin
    select string_agg(p.proname || E':\n' || pg_get_functiondef(p.oid), E'\n\n')
      into v
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname ilike '%claw%';
    insert into _m33 values (2, 'STUUR TERUG >> body clawback-functie(s)', coalesce(v, 'bestaat niet'));
  exception when others then
    insert into _m33 values (2, 'body clawback', 'MISLUKT: ' || sqlerrm);
  end;

  -- 3. top_up_admin_reject
  begin
    select string_agg(pg_get_functiondef(p.oid), E'\n\n')
      into v
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'top_up_admin_reject';
    insert into _m33 values (3, 'STUUR TERUG >> body top_up_admin_reject', coalesce(v, 'bestaat niet'));
  exception when others then
    insert into _m33 values (3, 'body top_up_admin_reject', 'MISLUKT: ' || sqlerrm);
  end;

  -- 4-5. de views
  begin
    insert into _m33 values (4, 'view referral_commissions_with_details',
      pg_get_viewdef('public.referral_commissions_with_details'::regclass, true));
  exception when others then
    insert into _m33 values (4, 'view referral_commissions_with_details', 'MISLUKT: ' || sqlerrm);
  end;
  begin
    insert into _m33 values (5, 'view referral_links_with_details',
      pg_get_viewdef('public.referral_links_with_details'::regclass, true));
  exception when others then
    insert into _m33 values (5, 'view referral_links_with_details', 'MISLUKT: ' || sqlerrm);
  end;

  -- 6. triggers op top_ups
  begin
    select string_agg(t.tgname || ' :: ' || pg_get_triggerdef(t.oid), E'\n' order by t.tgname)
      into v
      from pg_trigger t
     where t.tgrelid = 'public.top_ups'::regclass and not t.tgisinternal;
    insert into _m33 values (6, 'triggers op top_ups', coalesce(v, 'geen'));
  exception when others then
    insert into _m33 values (6, 'triggers op top_ups', 'MISLUKT: ' || sqlerrm);
  end;

  -- 7. policies
  begin
    select string_agg(tablename || ' | ' || policyname || ' | ' || cmd ||
                      ' | roles=' || array_to_string(roles, ',') ||
                      ' | using=' || coalesce(qual, '-') ||
                      ' | check=' || coalesce(with_check, '-'),
                      E'\n' order by tablename, policyname)
      into v
      from pg_policies
     where schemaname = 'public'
       and tablename in ('referral_links', 'referral_commissions', 'advertisers',
                         'top_ups', 'invitations', 'affiliates');
    insert into _m33 values (7, 'policies op de zes tabellen van F2', coalesce(v, 'geen'));
  exception when others then
    insert into _m33 values (7, 'policies', 'MISLUKT: ' || sqlerrm);
  end;

  -- 8. rechten voor authenticated / anon
  begin
    select string_agg(table_name || ' ' || grantee || ': ' || privs, E'\n' order by table_name, grantee)
      into v
      from (select table_name, grantee,
                   string_agg(privilege_type, ',' order by privilege_type) privs
              from information_schema.role_table_grants
             where table_schema = 'public'
               and grantee in ('authenticated', 'anon')
               and table_name in ('referral_links', 'referral_commissions', 'affiliates',
                                  'top_ups', 'invitations', 'referral_clawbacks')
             group by table_name, grantee) g;
    insert into _m33 values (8, 'tabelrechten authenticated/anon', coalesce(v, 'geen'));
  exception when others then
    insert into _m33 values (8, 'tabelrechten', 'MISLUKT: ' || sqlerrm);
  end;

  -- 9. referral_commissions: kolommen en constraints
  begin
    select 'KOLOMMEN: ' || string_agg(column_name || ' ' || data_type ||
                                      coalesce(' default ' || column_default, ''),
                                      ', ' order by ordinal_position)
      into v
      from information_schema.columns
     where table_schema = 'public' and table_name = 'referral_commissions';
    select v || E'\nCONSTRAINTS: ' || coalesce(string_agg(conname || ' ' || pg_get_constraintdef(oid), E'\n'), 'geen')
      into v
      from pg_constraint where conrelid = 'public.referral_commissions'::regclass;
    insert into _m33 values (9, 'referral_commissions: kolommen + constraints', v);
  exception when others then
    insert into _m33 values (9, 'referral_commissions', 'MISLUKT: ' || sqlerrm);
  end;

  -- 10. user_profiles.status
  begin
    select 'default=' || coalesce((select column_default from information_schema.columns
                                    where table_schema = 'public' and table_name = 'user_profiles'
                                      and column_name = 'status'), 'geen') ||
           ' | waarden: ' || coalesce((select string_agg(coalesce(status, 'NULL') || '=' || n, ', ')
                                        from (select status, count(*) n from public.user_profiles
                                               group by status) s), '-') ||
           ' | PSM0005 zelf: ' || coalesce((select coalesce(up.status, 'NULL')
                                             from public.advertisers a
                                             join public.user_profiles up on up.id = a.profile_id
                                            where a.tenant_client_code = 'PSM0005' limit 1), 'niet gevonden')
      into v;
    insert into _m33 values (10, 'user_profiles.status', v);
  exception when others then
    insert into _m33 values (10, 'user_profiles.status', 'MISLUKT: ' || sqlerrm);
  end;

  -- 11. notifications
  begin
    select 'KOLOMMEN: ' || string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position)
      into v
      from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications';
    select v || E'\nCONSTRAINTS: ' || coalesce(string_agg(conname || ' ' || pg_get_constraintdef(oid), E'\n'), 'geen')
      into v
      from pg_constraint where conrelid = 'public.notifications'::regclass and contype = 'c';
    select v || E'\nFUNCTIES DIE MELDINGEN SCHRIJVEN: ' ||
           coalesce(string_agg(distinct p.proname, ', '), 'geen')
      into v
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosrc ilike '%insert into public.notifications%';
    insert into _m33 values (11, 'notifications: kolommen, check-constraints, schrijvers', v);
  exception when others then
    insert into _m33 values (11, 'notifications', 'MISLUKT: ' || sqlerrm);
  end;

  -- 12. PSM0007: elke beweging, zodat rij 8 van plak 32 verklaard wordt
  begin
    select 'WALLET_TOPUPS: ' || coalesce((
             select string_agg(wt.status || ' ' || coalesce(wt.currency, '?') || ' ' || wt.amount::text, ' | ')
               from public.wallet_topups wt
               join public.wallets w on w.id = wt.wallet_id
               join public.advertisers a on a.id = w.advertiser_id
              where a.tenant_client_code = 'PSM0007'), 'geen') ||
           E'\nTOP_UPS: ' || coalesce((
             select string_agg('#' || tu.number || ' ' || tu.status || ' ' || coalesce(tu.currency, '?') ||
                               ' ontvangen ' || tu.amount_received::text, ' | ')
               from public.top_ups tu
               join public.advertisers a on a.id = tu.advertiser_id
              where a.tenant_client_code = 'PSM0007'), 'geen') ||
           E'\nINVOICES: ' || coalesce((
             select string_agg(coalesce(i.type, 'null') || ' ' || coalesce(i.status, 'null') || ' ' ||
                               coalesce(i.currency, '?') || ' ' || coalesce(i.total::text, 'null') ||
                               ' (' || to_char(i.created_at, 'DD-MM HH24:MI') || ')', ' | ' order by i.created_at)
               from public.invoices i
               join public.advertisers a on a.id = i.advertiser_id
              where a.tenant_client_code = 'PSM0007'), 'geen')
      into v;
    insert into _m33 values (12, 'PSM0007: alle bewegingen (verklaart rij 8 van plak 32)', v);
  exception when others then
    insert into _m33 values (12, 'PSM0007 bewegingen', 'MISLUKT: ' || sqlerrm);
  end;

  -- ── VOOR DE NIEUWE COMMISSIEREGELS (eigenaar, 21-09) ──────────────
  -- Commissie wordt een % van de WINST: onze fee min de leverancierskost,
  -- per accounttype instelbaar, plus een % van elke betaalde
  -- abonnementsfactuur. Daarvoor moet ik weten waar die getallen staan.

  -- 13. invoices: kolommen (zit btw apart, of alleen een totaal?)
  begin
    select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position)
      into v
      from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices';
    insert into _m33 values (13, 'invoices: kolommen', coalesce(v, 'tabel niet gevonden'));
  exception when others then
    insert into _m33 values (13, 'invoices kolommen', 'MISLUKT: ' || sqlerrm);
  end;

  -- 14. ad_account_types: kolommen en de rijen zelf
  begin
    select 'KOLOMMEN: ' || string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position)
      into v
      from information_schema.columns
     where table_schema = 'public' and table_name = 'ad_account_types';
    select v || E'\nRIJEN: ' || coalesce(string_agg(r::text, E'\n'), 'geen')
      into v
      from (select to_jsonb(t) - 'created_at' - 'updated_at' r
              from public.ad_account_types t) x;
    insert into _m33 values (14, 'ad_account_types: kolommen + rijen', v);
  exception when others then
    insert into _m33 values (14, 'ad_account_types', 'MISLUKT: ' || sqlerrm);
  end;

  -- 15. leverancierskost per account: hoeveel accounts hebben er een
  begin
    select 'accounts totaal: ' || (select count(*) from public.ad_accounts)::text ||
           ' | met supplier_fee_pct in ad_account_costs: ' ||
           (select count(*) from public.ad_account_costs where supplier_fee_pct is not null)::text ||
           E'\nAA-PSM0007-EU-01: platform=' ||
           coalesce((select a.platform from public.ad_accounts a where a.name = 'AA-PSM0007-EU-01' limit 1), '?') ||
           ' | fee=' || coalesce((select a.fee::text from public.ad_accounts a where a.name = 'AA-PSM0007-EU-01' limit 1), '?') ||
           ' | supplier_fee_pct=' ||
           coalesce((select c.supplier_fee_pct::text from public.ad_account_costs c
                       join public.ad_accounts a on a.id = c.ad_account_id
                      where a.name = 'AA-PSM0007-EU-01' limit 1), 'NIET INGEVULD')
      into v;
    insert into _m33 values (15, 'leverancierskost per account', v);
  exception when others then
    insert into _m33 values (15, 'leverancierskost', 'MISLUKT: ' || sqlerrm);
  end;
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select nr, item, v as antwoord from _m33 order by nr;
