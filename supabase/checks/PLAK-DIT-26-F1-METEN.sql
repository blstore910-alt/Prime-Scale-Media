-- =====================================================================
-- PLAK 26 — F1 meten. LEEST ALLEEN, verandert NIETS.
-- =====================================================================
-- Vier sweeps op de affiliate-journey kwamen terug met tien dingen die
-- de repo niet kan beslissen, omdat ze op de live database staan. Dit is
-- die tien in EEN rapport, zodat het bij een keer plakken blijft.
--
-- Elke controle staat in zijn eigen blokje met een vangnet: een tabel of
-- kolom die hier niet bestaat levert een regel op die dat zegt, in
-- plaats van het hele rapport om te gooien.
--
-- Regel 1 is de belangrijkste van de hele journey. Als `wallet_topups.
-- amount` een float-type is, dan gooit `round(new.amount * pct/100, 2)`
-- in de accrual-trigger een 42883 -- round(double precision, int)
-- bestaat niet in Postgres, alleen round(numeric, int) -- en die hele
-- trigger zit in een `exception when others then raise warning`. Dan is
-- er dus NOOIT een commissie geboekt, voor niemand, zonder dat er ooit
-- iets op een scherm verscheen. Dat zou meteen verklaren waarom de twee
-- affiliates die er staan allebei op EUR 0,00 staan.
--
-- Veilig om vaker te draaien. Er wordt niets geschreven.
-- =====================================================================

set search_path = public;

create temporary table if not exists _f1 (nr int, item text, v text);
delete from _f1;

do $blk0$
declare
  v text;
  v_fn text;
begin
  -- 1 ── Het kolomtype waar de hele commissie op hangt ---------------
  begin
    insert into _f1 values (1,
      'wallet_topups.amount type  (float = de accrual gooit 42883 en wordt stil geslikt)',
      coalesce((select format_type(a.atttypid, a.atttypmod)
                  from pg_attribute a
                 where a.attrelid = to_regclass('public.wallet_topups')
                   and a.attname = 'amount' and a.attnum > 0),
               'tabel of kolom bestaat niet'));
  exception when others then
    insert into _f1 values (1, 'wallet_topups.amount type', 'MISLUKT: ' || sqlerrm);
  end;

  begin
    insert into _f1 values (2,
      'referral_commissions.amount type  (real = sommen lopen van de cent af)',
      coalesce((select format_type(a.atttypid, a.atttypmod)
                  from pg_attribute a
                 where a.attrelid = to_regclass('public.referral_commissions')
                   and a.attname = 'amount' and a.attnum > 0),
               'tabel of kolom bestaat niet'));
  exception when others then
    insert into _f1 values (2, 'referral_commissions.amount type', 'MISLUKT: ' || sqlerrm);
  end;

  -- 3 ── Is er ooit een commissie geboekt ----------------------------
  begin
    insert into _f1 values (3,
      'commissierijen die er staan  (0 bij een tenant met referrals bevestigt regel 1)',
      coalesce((select count(*)::text from public.referral_commissions), 'tabel bestaat niet'));
  exception when others then
    insert into _f1 values (3, 'commissierijen', 'tabel bestaat niet');
  end;

  -- 4 ── Leest de view als de BELLER of als zijn eigenaar ------------
  --     Staat security_invoker uit, dan is elke RLS op referral_links
  --     sier: de view geeft dan alles, ook uit andere tenants.
  begin
    insert into _f1 values (4,
      'views lezen als de beller (security_invoker)',
      coalesce((select string_agg(c.relname || '=' ||
                 case when array_to_string(coalesce(c.reloptions, '{}'), ',')
                           ilike '%security_invoker=on%'
                      then 'ja' else 'NEE - RLS op de brontabel wordt omzeild' end,
                 E'\n' order by c.relname)
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public'
                   and c.relname in ('referral_links_with_details',
                                     'referral_commissions_with_details',
                                     'top_ups_view')),
               'geen van die views bestaat'));
  exception when others then
    insert into _f1 values (4, 'security_invoker', 'MISLUKT: ' || sqlerrm);
  end;

  -- 5 ── Wie mag die view lezen --------------------------------------
  begin
    insert into _f1 values (5,
      'wie mag referral_links_with_details LEZEN',
      coalesce((select string_agg(distinct coalesce(g.rolname, 'PUBLIC'), ', ')
                  from pg_class c
                  join pg_namespace n on n.oid = c.relnamespace
                  cross join lateral aclexplode(
                    coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
                  left join pg_roles g on g.oid = a.grantee
                 where n.nspname = 'public'
                   and c.relname = 'referral_links_with_details'
                   and a.privilege_type = 'SELECT'
                   and coalesce(g.rolname, 'PUBLIC') in ('anon','authenticated','PUBLIC')),
               'niemand buiten postgres/service_role'));
  exception when others then
    insert into _f1 values (5, 'leesrecht op de view', 'MISLUKT: ' || sqlerrm);
  end;

  -- 6 ── Schrijfrechten op de vier tabellen van deze journey ---------
  begin
    insert into _f1 values (6,
      'schrijfrechten (authenticated/anon) op de F1-tabellen',
      coalesce((select string_agg(x.obj || ': ' || x.privs, E'\n' order by x.obj)
                  from (
        select c.relname::text as obj,
               string_agg(distinct a.privilege_type::text, ', '
                          order by a.privilege_type::text) as privs
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          cross join lateral aclexplode(
            coalesce(c.relacl, acldefault('r'::"char", c.relowner))) a
          left join pg_roles g on g.oid = a.grantee
         where n.nspname = 'public'
           and c.relname in ('referral_links','referral_commissions',
                             'affiliates','referral_clawbacks')
           and a.privilege_type in ('INSERT','UPDATE','DELETE')
           and coalesce(g.rolname,'PUBLIC') in ('anon','authenticated','PUBLIC')
         group by c.relname) x),
               'geen - alles al dicht'));
  exception when others then
    insert into _f1 values (6, 'schrijfrechten', 'MISLUKT: ' || sqlerrm);
  end;

  -- 7 ── De RPC die met een willekeurige invite-id je eigen plan zet --
  begin
    insert into _f1 values (7,
      'create_subscription_from_invite: wie mag hem AANROEPEN  (beide bellers gebruiken de service-client)',
      coalesce((select string_agg(distinct coalesce(g.rolname,'PUBLIC'), ', ')
                  from pg_proc p
                  join pg_namespace n on n.oid = p.pronamespace
                  cross join lateral aclexplode(
                    coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
                  left join pg_roles g on g.oid = a.grantee
                 where n.nspname = 'public'
                   and p.proname = 'create_subscription_from_invite'
                   and a.privilege_type = 'EXECUTE'
                   and coalesce(g.rolname,'PUBLIC') in ('anon','authenticated','PUBLIC')),
               'niemand buiten service_role - goed'));
  exception when others then
    insert into _f1 values (7, 'execute op create_subscription_from_invite', 'MISLUKT: ' || sqlerrm);
  end;

  -- 8 ── Komt de referral-link van de affiliate aan bij de aanmelding -
  --     De link wordt gebouwd met de code zoals hij in de kolom staat,
  --     en bij het bevestigen ge-upper-cased en exact vergeleken.
  begin
    insert into _f1 values (8,
      'klantcodes die NIET al in hoofdletters staan  (referral valt stil weg)',
      (select count(*) filter (where tenant_client_code <> upper(tenant_client_code))::text
              || ' van ' || count(*)::text
         from public.advertisers where tenant_client_code is not null));
  exception when others then
    insert into _f1 values (8, 'hoofdlettercheck klantcodes', 'MISLUKT: ' || sqlerrm);
  end;

  begin
    insert into _f1 values (9,
      'klantcodes die door MEER dan een adverteerder gedeeld worden  (breekt de e-mailbevestiging)',
      (select count(*)::text from (
         select tenant_client_code from public.advertisers
          where tenant_client_code is not null
          group by tenant_client_code having count(*) > 1) d));
  exception when others then
    insert into _f1 values (9, 'dubbele klantcodes', 'MISLUKT: ' || sqlerrm);
  end;

  -- 10 ── Wat er aan links staat en in welke staat --------------------
  begin
    insert into _f1 values (10,
      'referral_links per status',
      coalesce((select string_agg(s || '=' || n::text, ' | ' order by s)
                  from (select coalesce(status,'(null)') as s, count(*) as n
                          from public.referral_links group by 1) x),
               'geen links'));
  exception when others then
    insert into _f1 values (10, 'links per status', 'status-kolom ontbreekt of tabel bestaat niet');
  end;

  begin
    insert into _f1 values (11,
      'adverteerders met MEER dan een referral-link  (commissie wordt dan dubbel geboekt)',
      (select count(*)::text from (
         select referred_advertiser_id from public.referral_links
          group by referred_advertiser_id having count(*) > 1) d));
  exception when others then
    insert into _f1 values (11, 'dubbele links', 'MISLUKT: ' || sqlerrm);
  end;

  -- 12 ── De affiliate-rol die structureel geen advertisers-rij heeft -
  begin
    insert into _f1 values (12,
      'profielen met rol affiliate ZONDER advertisers-rij  (hun hele portaal is een vaste nul)',
      (select count(*)::text from public.user_profiles up
        where up.role = 'affiliate'
          and not exists (select 1 from public.advertisers a
                           where a.user_id = up.user_id)));
  exception when others then
    insert into _f1 values (12, 'affiliate-rol zonder advertiser', 'MISLUKT: ' || sqlerrm);
  end;

  -- 13 ── Welke van de drie clawback-versies staat er echt -----------
  begin
    v_fn := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname = '_claw_back_referral_commission' limit 1), '');
    insert into _f1 values (13, 'welke clawback-versie staat live',
      case when v_fn = '' then 'functie bestaat niet'
           when position('v_gross * v_share' in v_fn) > 0
             then '20260920240000 - aandeel maal LEVENSLANG; kan tot 100% van de commissie terugpakken'
           when position('ad_account_withdrawal' in v_fn) > 0
             then '20260920150000 - aandeel maal de REST; pakt na de eerste opname te weinig'
           else '20260918230000 of ouder - USD-opname tegen USD-WALLET-volume; bij een EUR-klant nul' end);
  exception when others then
    insert into _f1 values (13, 'clawback-versie', 'MISLUKT: ' || sqlerrm);
  end;

  -- 14 ── Klopt de stats-RPC met zichzelf ----------------------------
  begin
    v_fn := coalesce((select pg_get_functiondef(p.oid) from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                       where n.nspname = 'public'
                         and p.proname = 'affiliate_referral_stats' limit 1), '');
    insert into _f1 values (14, 'affiliate_referral_stats: meldt openstaand / trekt clawback af / HEEFT die join',
      case when v_fn = '' then 'functie bestaat niet' else
        (case when position('unpaid_eur' in v_fn) > 0 then 'openstaand:ja' else 'openstaand:NEE - de uitbetaalvraag gaat over BRUTO' end)
        || ' / ' ||
        (case when position('cb.eur' in v_fn) > 0 then 'trekt af:ja' else 'trekt af:nee' end)
        || ' / ' ||
        (case when position('referral_clawbacks c' in v_fn) > 0 then 'join:ja'
              when position('cb.eur' in v_fn) > 0 then 'join:ONTBREEKT - de RPC klapt bij elke aanroep'
              else 'join:n.v.t.' end) end);
  exception when others then
    insert into _f1 values (14, 'stats-RPC', 'MISLUKT: ' || sqlerrm);
  end;

  -- 15 ── Waar een uitbetaling uberhaupt over zou gaan ----------------
  begin
    insert into _f1 values (15,
      'commissie die nog openstaat  EUR / USD',
      (select round(coalesce(sum(amount::numeric) filter
                 (where upper(coalesce(currency,'EUR')) = 'EUR'
                    and coalesce(status,'unpaid') <> 'paid'), 0), 2)::text
              || ' / ' ||
              round(coalesce(sum(amount::numeric) filter
                 (where upper(coalesce(currency,'')) = 'USD'
                    and coalesce(status,'unpaid') <> 'paid'), 0), 2)::text
         from public.referral_commissions));
  exception when others then
    insert into _f1 values (15, 'openstaande commissie', 'tabel of status-kolom ontbreekt');
  end;

  -- 16 ── Aanvragen die niemand kan beantwoorden ---------------------
  begin
    insert into _f1 values (16,
      'affiliate-aanvragen ingediend / verschillende aanvragers',
      (select count(*)::text || ' / ' ||
              count(distinct n.payload ->> 'applicant_profile_id')::text
         from public.notifications n where n.type = 'affiliate_application'));
  exception when others then
    insert into _f1 values (16, 'aanvragen', 'MISLUKT: ' || sqlerrm);
  end;
end;
$blk0$;

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen dit
-- =====================================================================
select nr, item, v as antwoord from _f1 order by nr;
