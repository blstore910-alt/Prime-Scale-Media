-- ════════════════════════════════════════════════════════════════════
-- PLAK 173 — DRINGEND: EEN ABONNEMENTSFACTUUR DIE NIEMAND TE ZIEN
--            KRIJGT
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 30-09, als WENS: "subscription invoice via email,
-- klanten moeten voor elke subscription invoice email krijgen."
--
-- Het is geen wens. De mails bestaan al en ze zijn stuk.
--
-- ── GEMETEN, VANDAAG, OP PRODUCTIE ────────────────────────────────
--
-- Er zijn TWEE wegen naar een abonnementsfactuur, en maar één ervan
-- vertelt de klant iets:
--
--     subscription_billing_run           schrijft de melding
--     create_invoice_for_subscription    schrijft NIETS
--
-- De eerste is de nachtelijke incasso van 03:00. De tweede is een
-- trigger op `subscriptions` en die maakt de factuur in alle andere
-- gevallen -- een abonnement dat begint, een plan dat wijzigt.
--
-- Uitkomst: 20 abonnementsfacturen, 7 meldingen, en de laatste melding
-- is van 20-09. Elke factuur sindsdien ging de deur uit zonder mail:
--
--     145  30-09 14:39  EUR  75,00  PSM0020  paid
--     142  30-09 07:41  EUR 200,00  PSM0018  paid
--     138  24-09 21:06  EUR 200,00  PSM0013  ONBETAALD
--     136  24-09 08:50  EUR 200,00  PSM0012  ONBETAALD
--     135  23-09 20:25  EUR 150,00  PSM0011  paid
--     131  22-09 20:41  EUR  10,00  PSM0010  paid
--     130  22-09 20:33  EUR  10,00  PSM0007  paid
--     125  21-09 08:20  EUR 200,00  PSM0006  ONBETAALD
--
-- Drie klanten hebben samen EUR 600 openstaan en is nooit verteld dat
-- er een factuur was. Dat is niet "een mail die ontbreekt": dat is een
-- betalingsherinnering die nooit begon.
--
-- ── WAT DEZE PLAK DOET ────────────────────────────────────────────
--
-- `create_invoice_for_subscription` schrijft dezelfde melding als de
-- nachtelijke run. Letterlijk dezelfde vorm, overgenomen uit de live
-- definitie van `subscription_billing_run`:
--
--     insert into public.notifications
--       (recipient_user_id, tenant_id, type, payload, is_read)
--     values (…, 'subscription_invoice',
--             jsonb_build_object('invoice_id', …, 'amount', …,
--                                'currency', …), false);
--
-- De mail hangt daaraan: `app/api/push/notify` ziet die melding en
-- `lib/pure-billing-email.ts` maakt er de e-mail van. Er hoeft dus
-- verder niets gebouwd te worden -- alleen deze ene insert.
--
-- ── DRIE DINGEN DIE HIER MET OPZET IN ZITTEN ──────────────────────
--
-- 1. DE MELDING MAG DE FACTUUR NIET OMVERTREKKEN. Hij zit in zijn
--    eigen `begin … exception when others then null; end;`, precies
--    zoals in de nachtelijke run. Een factuur die niet ontstaat omdat
--    een melding faalt is een veel duurdere fout dan een melding die
--    wegvalt.
--
-- 2. ALLEEN ABONNEMENTEN. De eigenaar: "alleen subs he, verder
--    niets." Deze trigger staat op `subscriptions` en raakt dus niets
--    anders; `BILLING_EMAIL_TYPES` in de code kent maar drie soorten,
--    alledrie abonnement. Een walletopwaardering of een
--    ad-accounttopup stuurt geen mail en dat verandert hier niet.
--
-- 3. NIETS MET TERUGWERKENDE KRACHT. Deze plak maakt GEEN meldingen
--    voor de acht facturen hierboven. Een mail "je factuur is klaar"
--    over een factuur van tien dagen geleden waarvan er vijf al
--    betaald zijn, is verwarrender dan geen mail. De drie onbetaalde
--    (125, 136, 138) horen met een persoonlijk bericht, niet met een
--    automatische mail die doet alsof hij op tijd was.
--
-- EEN `execute`, EEN functie, met zijn revoke erachter.
-- ════════════════════════════════════════════════════════════════════

select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

do $blk1$
declare v_oid oid; v_def text; v_new text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'create_invoice_for_subscription'
   limit 1;
  if v_oid is null then
    raise exception 'create_invoice_for_subscription bestaat niet';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if v_def like '%subscription_invoice''%' then
    raise notice 'de melding staat er al'; return;
  end if;

  -- ── 1. twee variabelen erbij ───────────────────────────────────
  v_new := regexp_replace(
    v_def,
    '(v_period[[:space:]]+date;)',
    '\1' || chr(10) ||
    '  v_inv_id     uuid;' || chr(10) ||
    '  v_adv_user   uuid;',
    '');
  if v_new = v_def then
    raise exception 'declare-blok niet gevonden -- NIETS gewijzigd';
  end if;

  -- ── 2. het id van de zojuist gemaakte factuur vasthouden ───────
  v_new := regexp_replace(
    v_new,
    '(NEW\.advertiser_id,[[:space:]]*v_type,[[:space:]]*''unpaid'',[[:space:]]*NEW\.currency[[:space:]]*\));',
    '\1' || chr(10) || '  returning id into v_inv_id;',
    '');
  if v_new not like '%returning id into v_inv_id%' then
    raise exception 'de insert-afsluiting niet gevonden -- NIETS gewijzigd';
  end if;

  -- ── 3. de melding, vlak voor de return ─────────────────────────
  -- Dezelfde vorm als subscription_billing_run, en net als daar in een
  -- eigen begin/exception zodat een mislukte melding de factuur niet
  -- meesleurt.
  v_new := regexp_replace(
    v_new,
    '([[:space:]])return NEW;([[:space:]]+end;[[:space:]]*\$function\$)',
    '\1' || chr(10) ||
    '  -- Plak 173. De klant hoort te weten dat er een factuur is.' || chr(10) ||
    '  -- Dezelfde melding die subscription_billing_run schrijft; de' || chr(10) ||
    '  -- e-mail hangt eraan via app/api/push/notify.' || chr(10) ||
    '  begin' || chr(10) ||
    '    select coalesce(a.user_id, up.user_id) into v_adv_user' || chr(10) ||
    '      from public.advertisers a' || chr(10) ||
    '      left join public.user_profiles up on up.id = a.profile_id' || chr(10) ||
    '     where a.id = NEW.advertiser_id' || chr(10) ||
    '     limit 1;' || chr(10) ||
    '    if v_adv_user is not null and v_inv_id is not null then' || chr(10) ||
    '      insert into public.notifications' || chr(10) ||
    '        (recipient_user_id, tenant_id, type, payload, is_read)' || chr(10) ||
    '      values' || chr(10) ||
    '        (v_adv_user, NEW.tenant_id, ''subscription_invoice'',' || chr(10) ||
    '         jsonb_build_object(''invoice_id'', v_inv_id,' || chr(10) ||
    '                            ''amount'', v_amount,' || chr(10) ||
    '                            ''currency'', NEW.currency), false);' || chr(10) ||
    '    end if;' || chr(10) ||
    '  exception when others then null; end;' || chr(10) || chr(10) ||
    '  return NEW;\2',
    '');
  if v_new not like '%Plak 173%' then
    raise exception 'de return niet gevonden -- NIETS gewijzigd';
  end if;

  execute v_new;
end
$blk1$;

revoke all on function public.create_invoice_for_subscription() from public, anon;
grant execute on function public.create_invoice_for_subscription() to service_role;

-- ── HET RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `maakt_de_melding` hoort 1 te zijn en `anon_mag` 0.
--
-- `facturen_zonder_melding` blijft op 8 staan: deze plak repareert de
-- WEG, niet het verleden. De drie onbetaalde daarvan (125, 136, 138 --
-- samen EUR 600) horen een persoonlijk bericht te krijgen, geen
-- automatische mail die doet alsof hij op tijd was.
--
-- Wil je het controleren: maak een abonnement aan en kijk of er een
-- rij bij komt in `notifications` met type `subscription_invoice`.
select
  'plak 173 geplaatst'                                             as wat,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_invoice_for_subscription'
      and pg_get_functiondef(p.oid) like '%subscription_invoice''%') as maakt_de_melding,
  (select count(*)::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='create_invoice_for_subscription'
      and has_function_privilege('anon', p.oid, 'execute'))         as anon_mag,
  (select count(*)::text from public.invoices i
    where i.type = 'subscription'
      and not exists (select 1 from public.notifications n
                       where n.type = 'subscription_invoice'
                         and n.payload::text like '%' || i.id::text || '%'))
                                                                    as facturen_zonder_melding,
  (select coalesce(string_agg(i.number::text, ', ' order by i.number), '-')
     from public.invoices i
    where i.type = 'subscription' and i.status in ('unpaid','overdue')
      and not exists (select 1 from public.notifications n
                       where n.type = 'subscription_invoice'
                         and n.payload::text like '%' || i.id::text || '%'))
                                                                    as onbetaald_en_nooit_gemeld;
