-- ════════════════════════════════════════════════════════════════════
--  PLAK 74 — de drie regels uit de vorige tabel die nog open stonden
--
--  Van de 37 regels in de rapporttabel van PLAK-DIT-ALLES-69-73 zijn er
--  34 geland. Drie niet, en ÉÉN daarvan is nu kapot op productie.
--
--  A  KAPOT NU: affiliate_commission_list noemt een kolom die niet
--     bestaat.
--
--     Regel 70/3 zei "niet te lezen: column i.amount does not exist".
--     Dat las ik als een fout in de RAPPORTREGEL. Het is het niet: ik
--     heb dezelfde verkeerde kolomnaam ook IN de functie gezet.
--     `invoices` heeft geen `amount` — het is `total` (nagemeten:
--     sub_total, total, currency). De functie is dus wél aangemaakt,
--     maar plpgsql plant de query pas bij de eerste aanroep, dus hij
--     gooit sindsdien bij ELKE aanroep.
--
--     Dat is de kaart "Every commission" op het affiliate-portaal én op
--     het Referrals-scherm van de advertiser. Beide tonen nu een fout
--     in plaats van een lijst. Dit blok zet het recht.
--
--  B  ad_account_types_read: "MISLUKT: invalid input value for enum
--     Role: """
--
--     `user_profiles.role` is een ENUM (`Role`), geen tekst, en ik
--     schreef coalesce(up.role, '') — dat probeert '' naar die enum te
--     casten. Het hele blok draaide terug, dus de OUDE policy staat er
--     nog (nagemeten: ad_account_types_read bestaat) en er is geen
--     scherm door stukgegaan. Alleen: die oude policy test nog steeds
--     alleen "je zit in deze tenant", zonder rol.
--
--     En het kan simpeler dan ik het schreef. Nagemeten wie die tabel
--     leest: precies twee plekken, allebei admin
--     (hooks/use-affiliate-book.ts en hooks/use-supplier-link.ts).
--     GEEN ENKEL klantscherm leest hem. Dus _is_admin_of(tenant_id),
--     de helper die al bestaat — geen enum, geen rollijst, niets om
--     fout te doen.
--
--  C  _psm_run_log: een tabel zonder RLS die anon mag lezen.
--
--     Regel 72/12. Nagekeken: het is de rapporttabel van een oude plak,
--     twee regels tekst, geen geld en geen persoonsgegevens. Steigerwerk
--     dat is blijven staan. Weg ermee — een tabel zonder RLS in een
--     schema dat PostgREST publiceert hoort er niet te zijn, ook niet
--     als hij vandaag onschuldig is.
--
--  EN TWEE DINGEN DIE GEEN FOUT WAREN
--
--  D  Regel 72/13 zei "6 top_ups-rijen met wallet_debited = true" onder
--     het kopje "is er al saldo uit het niets gemaakt". Dat kopje was
--     van mij en het was verkeerd gesteld: wallet_debited = true is de
--     NORMALE staat van een storting die de klant zelf indient — de
--     wallet is afgeschreven om het ad-account te vullen. Alle zes zijn
--     klantrijen. Er is niets uit het niets gemaakt. Blok D hieronder
--     stelt de vraag zoals hij bedoeld was: een rij met wallet_debited
--     die NIET van een klant komt.
--
--  E  Regel 69/2, "bericht bij een betaalde uitbetaling: NIET
--     AANGEPAST". Nagekeken: de functie die live draait is een NIEUWERE
--     dan die in de repo staat — hij kent group_id, payout_amount en
--     payout_currency, en zijn melding telt al de werkelijke
--     payout_amount van de hele groep op in plaats van één gevraagd
--     bedrag. De regel die ik zocht bestaat daar niet meer. Dit blok
--     laat hem met rust en rapporteert alleen wat er staat, want half
--     aanpassen is erger dan niet aanpassen.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p74;
create temp table _p74(nr int, wat text, uitkomst text);

-- ── A. DE KOLOM HEET total, NIET amount ──────────────────────────────
drop function if exists public.affiliate_commission_list(timestamptz, timestamptz);

create function public.affiliate_commission_list(
  p_from timestamptz default null,
  p_to   timestamptz default null)
returns table (
  commission_id uuid,
  created_at timestamptz,
  referral_link_id uuid,
  referred_advertiser_code text,
  referred_advertiser_name text,
  kind text,
  amount numeric,
  currency text,
  status text,
  network text,
  -- Het bedrag waar de commissie OP slaat: de storting, of de factuur.
  -- Nooit de winst (rc.base_amount), nooit het percentage, nooit de
  -- inkoop — die hele keten staat op /affiliates en hoort daar alleen.
  source_amount numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $blk0$
declare
  v_uid uuid := auth.uid();
  v_aff uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select a.id into v_aff
    from public.advertisers a
   where a.user_id = v_uid
   order by a.created_at desc
   limit 1;
  if v_aff is null then
    return;
  end if;

  return query
  select
    rc.id,
    rc.created_at,
    rc.referral_link_id,
    ra.tenant_client_code::text,
    rup.full_name::text,
    coalesce(rc.source,
             case when rc.type = 'onetime' then 'onetime'
                  when rc.subscription_invoice_id is not null then 'subscription'
                  else 'topup' end)::text,
    case when rc.status = 'on_hold' then null else rc.amount end,
    upper(coalesce(rc.currency, 'EUR'))::text,
    case coalesce(rc.status, 'unpaid')
      when 'paid' then 'paid'
      when 'on_hold' then 'processing'
      when 'reversed' then 'reversed'
      else 'owed' end::text,
    -- Het netwerk, nooit het type.
    case
      when lower(coalesce(x.platform, '')) ~ '(meta|facebook)' then 'Meta'
      when lower(coalesce(x.platform, '')) ~ '(google|gdn|youtube)' then 'Google'
      when lower(coalesce(x.platform, '')) ~ 'tiktok' then 'TikTok'
      else null
    end::text,
    -- i.total, NIET i.amount. Die kolom bestaat niet en plpgsql plant de
    -- query pas bij de eerste aanroep, dus de functie liet zich prima
    -- aanmaken en gooide daarna bij elke aanroep.
    case
      when rc.topup_id is not null then t.topup_amount
      when rc.subscription_invoice_id is not null then i.total
      else null
    end::numeric
  from public.referral_commissions rc
  join public.referral_links rl on rl.id = rc.referral_link_id
  left join public.advertisers ra on ra.id = rl.referred_advertiser_id
  left join public.user_profiles rup on rup.id = ra.profile_id
  left join public.top_ups t on t.id = rc.topup_id
  left join public.ad_accounts x on x.id = t.account_id
  left join public.invoices i on i.id = rc.subscription_invoice_id
  where rl.affiliate_advertiser_id = v_aff
    and (p_from is null or rc.created_at >= p_from)
    and (p_to   is null or rc.created_at <= p_to)
  order by rc.created_at desc;
end;
$blk0$;

do $blk1$
begin
  execute 'revoke all on function public.affiliate_commission_list(timestamptz, timestamptz) from public, anon';
  execute 'grant execute on function public.affiliate_commission_list(timestamptz, timestamptz) to authenticated, service_role';
  insert into _p74 values (1, 'de commissielijst',
    'aangemaakt met i.total; de kaart Every commission werkt weer');
exception when others then
  insert into _p74 values (1, 'de commissielijst', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── A2. EN METEEN AANROEPEN, ZODAT HET NIET OP MIJN WOORD IS ─────────
--  De vorige versie liet zich óók aanmaken. Alleen een echte aanroep
--  bewijst dat de query plant.
do $blk2$
declare v_n int;
begin
  -- Draait als de plakker zelf. Die heeft geen advertisers-rij, dus de
  -- functie keert leeg terug — maar de query wordt wel geplant, en dat
  -- is precies wat hier getest wordt.
  select count(*) into v_n from public.affiliate_commission_list(null, null);
  insert into _p74 values (2, 'en hij draait ook echt',
    'aangeroepen zonder fout (' || v_n::text || ' regels voor deze inlog)');
exception when others then
  insert into _p74 values (2, 'en hij draait ook echt', 'GOOIT NOG STEEDS: ' || sqlerrm);
end
$blk2$;

-- ── B. DE TYPELIJST IS VOOR ADMINS ───────────────────────────────────
do $blk3$
begin
  execute 'drop policy if exists ad_account_types_read on public.ad_account_types';
  -- _is_admin_of bestaat al en wordt overal gebruikt. Geen enum, geen
  -- rollijst, niets om fout te doen. Nagemeten: geen enkel klantscherm
  -- leest deze tabel — alleen use-affiliate-book en use-supplier-link,
  -- allebei admin.
  execute 'create policy ad_account_types_read on public.ad_account_types
             for select to authenticated
             using (public._is_admin_of(tenant_id))';
  insert into _p74 values (3, 'wie leest de ad-account-types',
    'alleen een admin van diezelfde tenant — een affiliate en een adverteerder niet meer');
exception when others then
  insert into _p74 values (3, 'wie leest de ad-account-types', 'MISLUKT: ' || sqlerrm);
end
$blk3$;

-- ── C. HET STEIGERWERK WEG ───────────────────────────────────────────
do $blk4$
begin
  execute 'drop table if exists public._psm_run_log';
  insert into _p74 values (4, 'de rapporttabel van een oude plak',
    'weg — een tabel zonder RLS hoort niet in een schema dat PostgREST publiceert');
exception when others then
  insert into _p74 values (4, 'de rapporttabel van een oude plak', 'MISLUKT: ' || sqlerrm);
end
$blk4$;

-- ── D. DE VRAAG ZOALS HIJ BEDOELD WAS ────────────────────────────────
do $blk5$
declare v_txt text;
begin
  begin
    -- wallet_debited = true is NORMAAL voor een storting die de klant
    -- zelf indient: zijn wallet is afgeschreven om het ad-account te
    -- vullen. Verdacht is een rij die dat vlaggetje draagt en NIET van
    -- een klant komt (topup_usd leeg = een adminrij).
    select coalesce(count(*)::text, '0') ||
           ' rijen met wallet_debited maar zonder topup_usd (= niet door de klant ingediend)'
      into v_txt
      from public.top_ups
     where wallet_debited = true and topup_usd is null;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p74 values (5, 'saldo uit het niets, nu goed gevraagd', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' van de ' ||
           (select count(*)::text from public.top_ups) ||
           ' stortingen is door de klant zelf ingediend'
      into v_txt
      from public.top_ups where topup_usd is not null;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p74 values (6, 'ter vergelijking', v_txt);
end
$blk5$;

-- ── E. WAT ER IN affiliate_payout_decide STAAT (alleen lezen) ────────
do $blk6$
declare v_txt text;
begin
  begin
    select case
             when pg_get_functiondef(p.oid) ilike '%payout_amount%'
                  and pg_get_functiondef(p.oid) ilike '%group_id%'
             then 'de NIEUWERE versie draait hier (group_id, payout_amount, payout_currency); zijn melding telt de werkelijke payout_amount van de hele groep op, niet één gevraagd bedrag'
             else 'de oudere versie draait hier — dan is de melding nog het GEVRAAGDE bedrag' end
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'affiliate_payout_decide'
     limit 1;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p74 values (7, 'het bericht bij een betaalde uitbetaling',
    coalesce(v_txt, 'functie niet gevonden'));
end
$blk6$;

-- ── F. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk7$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not c.relrowsecurity
       and has_table_privilege('anon', c.oid, 'SELECT');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p74 values (8, 'tabellen zonder RLS die anon mag lezen', v_txt);

  begin
    select coalesce(string_agg(p.proname, ' · ' order by p.proname), 'geen')
      into v_txt
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.pronargs > 0
       and has_function_privilege('anon', p.oid, 'EXECUTE');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p74 values (9, 'functies die anon nog mag aanroepen',
    coalesce(v_txt, 'geen') || ' (get_invite_by_token hoort open: die draait op het aanmeldscherm)');

  begin
    select coalesce(string_agg(c.relname, ' · ' order by c.relname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname = 'a1_guard_rejection_needs_reason';
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p74 values (10, 'tabellen die een reden eisen bij afwijzen', v_txt);
end
$blk7$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p74 order by nr;
