-- ════════════════════════════════════════════════════════════════════
--  PLAK 49 — een koppeling ontstaat alleen via de eigenaar
--
--  WAT DIT REPAREERT (gevonden door de rechten-sweep op reis F1)
--
--  De eigenaar-poort op referral_links staat in de server action en in
--  referral_link_assign — maar NIET op de tabel. `authenticated` heeft
--  nog INSERT/UPDATE, en de RLS-policy laat elke ADMIN van de tenant
--  schrijven. Een medewerker met een admin-account kan dus met één
--  PostgREST-aanroep een koppeling aanmaken die zegt: "deze klant is
--  door mij aangebracht" — hij komt daarna in de wachtrij van de
--  eigenaar te staan alsof de klant zich via zijn link aanmeldde, en
--  één keer Goedkeuren boekt met terugwerkende kracht commissie uit.
--  Dezelfde rij sluit bovendien de échte verwijzer permanent buiten
--  ("This customer already has a referrer").
--
--  Na dit blok kan niemand de tabel nog rechtstreeks schrijven: alleen
--  de drie SECURITY DEFINER-functies (referral_link_assign,
--  referral_link_decide en de aanmelding met de service-sleutel) zetten
--  er iets in. Lezen verandert niet.
--
--  Blok B zet daar nog een slot naast: de commissiekolommen op de rij
--  zijn niet meer met de hand te veranderen.
--  Blok C leest alleen — het beantwoordt twee vragen die de sweep
--  openliet over plak 42 en plak 44.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p49;
create temp table _p49(nr int, wat text, uitkomst text);

-- ── A. SCHRIJVEN OP referral_links: ALLEEN NOG VIA DE FUNCTIES ───────
do $blk0$
declare
  v_has int;
begin
  -- De app schrijft deze tabel op drie plekken, en alle drie blijven
  -- werken: referral_link_assign en referral_link_decide zijn SECURITY
  -- DEFINER (die draaien als de eigenaar van de functie), en de
  -- aanmelding schrijft met de service-sleutel, die geen grants nodig
  -- heeft. Wat hier sneuvelt is precies de handmatige weg.
  execute 'revoke insert, update, delete on public.referral_links from authenticated';
  execute 'revoke insert, update, delete on public.referral_links from anon';

  select count(*) into v_has
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'referral_links'
     and grantee in ('authenticated','anon')
     and privilege_type in ('INSERT','UPDATE','DELETE');

  insert into _p49 values (
    1, 'referral_links: handmatig schrijven',
    case when v_has = 0 then 'DICHT — alleen nog via de functies van de eigenaar'
         else 'LET OP: er staan nog ' || v_has::text || ' schrijfrechten open' end);
exception when others then
  insert into _p49 values (1, 'referral_links: handmatig schrijven', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. DE COMMISSIEKOLOMMEN OP DE RIJ ZIJN GEEN INVULVELD ────────────
create or replace function public._guard_referral_links_session_write()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $blk1$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending') <> 'pending' then
      raise exception 'referral_links: a new referral starts pending; the owner approves it'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status
     or new.affiliate_advertiser_id is distinct from old.affiliate_advertiser_id
     or new.referred_advertiser_id is distinct from old.referred_advertiser_id
     or new.tenant_id is distinct from old.tenant_id
     or new.earnings_eur is distinct from old.earnings_eur
     or new.earnings_usd is distinct from old.earnings_usd then
    raise exception 'referral_links: approve or refuse through the owner''s action'
      using errcode = '42501';
  end if;
  -- NIEUW (plak 49): wat iemand verdient staat in commission_rules, met
  -- een datum vanaf wanneer. Deze kolommen op de rij zijn de oude weg;
  -- ze werden door geen enkele poort bewaakt, dus een admin kon er 90
  -- in zetten. Ze veranderen alleen nog via de eigenaar.
  if new.commission_type is distinct from old.commission_type
     or new.commission_pct is distinct from old.commission_pct
     or new.commission_onetime is distinct from old.commission_onetime
     or new.commission_monthly is distinct from old.commission_monthly
     or new.commission_currency is distinct from old.commission_currency then
    raise exception 'referral_links: commission terms are set in the rules, not on the link'
      using errcode = '42501';
  end if;
  return new;
end;
$blk1$;

do $blk2$
begin
  execute 'drop trigger if exists a0_guard_referral_links_session_write on public.referral_links';
  execute 'create trigger a0_guard_referral_links_session_write
             before insert or update on public.referral_links
             for each row execute function public._guard_referral_links_session_write()';
  insert into _p49 values (2, 'referral_links: commissievoorwaarden op de rij', 'alleen via de eigenaar');
exception when others then
  insert into _p49 values (2, 'referral_links: commissievoorwaarden op de rij', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── C. TWEE VRAGEN DIE DE SWEEP OPENLIET (alleen lezen) ──────────────
do $blk3$
declare
  v_trig int;
  v_ins  int;
  v_pol  text;
begin
  -- C1. Heeft plak 42 het slot op advertisers echt gezet? Dat blok zette
  --     alleen iets als geen enkele SECURITY INVOKER-functie advertisers
  --     schrijft; anders noteerde het "NIETS GEZET" en deed niets. Zonder
  --     dat slot is affiliate_status door een admin te schrijven.
  select count(*) into v_trig
    from pg_trigger
   where tgrelid = 'public.advertisers'::regclass
     and not tgisinternal
     and tgname = 'a0_guard_advertisers_session_write';

  select count(*) into v_ins
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'advertisers'
     and grantee = 'authenticated' and privilege_type in ('INSERT','DELETE');

  insert into _p49 values (
    3, 'advertisers: slot van plak 42',
    case when v_trig > 0 then 'trigger staat er' else 'TRIGGER ONTBREEKT' end
    || ' · insert/delete voor authenticated: '
    || case when v_ins = 0 then 'ingetrokken' else v_ins::text || ' rechten open' end);

  -- C2. Plak 44 ruimde alleen policies op waarvan de tekst zowel
  --     referral_links als affiliate_user_id noemt. Dit toont ELKE policy
  --     op de klanttabellen die referral_links noemt, hoe ook geschreven.
  select coalesce(string_agg(tablename || '.' || policyname, ' · ' order by tablename, policyname), 'geen')
    into v_pol
    from pg_policies
   where schemaname = 'public'
     and tablename in ('advertisers','user_profiles','wallets','top_ups','ad_accounts','invoices','wallet_topups')
     and coalesce(qual, '') || coalesce(with_check, '') like '%referral_links%';

  insert into _p49 values (4, 'policies op klanttabellen die referral_links noemen', v_pol);
end
$blk3$;

-- ── HET RAPPORT ──────────────────────────────────────────────────────
select nr as "#", wat as "wat", uitkomst as "uitkomst"
  from _p49 order by nr;
