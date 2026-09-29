-- ════════════════════════════════════════════════════════════════════
-- PLAK 146 — HET GROOTBOEK MOET DE NAAM OOK OPSCHRIJVEN
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- Plak 132 repareerde de actor voor `audit_events`: de naam van wie
-- iets doet reist mee als een header (`x-psm-actor`) en de trigger
-- leest hem, ook bij een service-role schrijf waar `auth.uid()` met
-- opzet leeg is.
--
-- `_wallet_ledger_record` -- de trigger die het GROOTBOEK vult -- heeft
-- die reparatie niet gekregen. Hij leest nog kaal `auth.uid()`.
--
-- Vandaag valt dat niet op: elke menselijke walletbeweging loopt via
-- de sessieclient, dus `auth.uid()` klopt. Maar zodra één walletschrijf
-- via `createAdminClient()` gaat -- en dat is de voorgeschreven manier
-- voor admin-CRUD in dit project -- dan noemt `audit_events` de naam
-- en zegt `wallet_ledger` "niemand". Over dezelfde handeling. En het
-- grootboek is juist het ding waar je naar kijkt als er geld weg is.
--
-- Met twee eigenaren (plak 143) telt dat dubbel: "wie heeft dit
-- gedaan" is dan een vraag die over twee verschillende mensen kan
-- gaan.
--
-- ── WAT DIT DOET ──────────────────────────────────────────────────
--
-- Dezelfde coalesce die plak 132 in het auditlog zette, nu ook hier.
-- Eerst `auth.uid()`; is die leeg, dan de header. Is die er ook niet
-- -- een cron, een webhook -- dan blijft het leeg, en dat hoort ook,
-- want daar is geen mens.
--
-- Verder verandert er niets. De rest van de functie is die van plak
-- 140, regel voor regel: de delta uit afgeronde saldi, het optionele
-- schema in de stapelnaam, en de INSERT-tak.
-- ════════════════════════════════════════════════════════════════════

create or replace function public._wallet_ledger_record()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk0$
  declare
    v_src   text;
    v_sid   text;
    v_rsn   text;
    v_stack text;
    v_line  text;
    v_ob    numeric;
    v_nb    numeric;
    v_d     numeric;
    v_who   uuid;
  begin
    -- ── WIE ────────────────────────────────────────────────────────
    -- auth.uid() als er een sessie is. Anders de header die
    -- createAdminClient meestuurt (plak 132). Anders niemand, en dan
    -- IS er ook niemand: dat is een cron of een webhook.
    --
    -- In een begin/exception, want een grootboek mag nooit een
    -- betaling tegenhouden omdat het de naam niet kon lezen.
    begin
      v_who := coalesce(
        auth.uid(),
        nullif(btrim(coalesce(
          (current_setting('request.headers', true))::json ->> 'x-psm-actor',
          '')), '')::uuid
      );
    exception when others then
      v_who := auth.uid();
    end;

    -- 1. De expliciete hint, als een RPC hem zet. Die wint: een naam
    --    die iemand gekozen heeft zegt meer dan een stapel.
    v_src := nullif(btrim(coalesce(current_setting('psm.ledger_source', true), '')), '');
    v_sid := nullif(btrim(coalesce(current_setting('psm.ledger_source_id', true), '')), '');
    v_rsn := nullif(btrim(coalesce(current_setting('psm.ledger_reason', true), '')), '');

    -- 2. Anders: vraag Postgres wie er belde. Het schema is optioneel,
    --    want zonder dat viel bij één punt ELKE regel tegelijk terug
    --    op 'unknown' (plak 140).
    if v_src is null then
      begin
        get diagnostics v_stack = pg_context;
        select m[1] into v_line
          from regexp_matches(
                 coalesce(v_stack, ''),
                 'function (?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\(', 'g') as m
         where m[1] not in ('_wallet_ledger_record', '_wallet_ledger_append_only')
         limit 1;
        v_src := nullif(btrim(coalesce(v_line, '')), '');
      exception when others then
        v_src := null;
      end;
    end if;

    -- ── EUR ────────────────────────────────────────────────────────
    -- De delta uit de AFGERONDE saldi, zodat before + delta = after
    -- altijd geldt en een halve cent de betaling niet breekt.
    v_ob := round(coalesce(case when tg_op = 'INSERT' then 0
                                else old.eur_balance end, 0), 2);
    v_nb := round(coalesce(new.eur_balance, 0), 2);
    v_d  := v_nb - v_ob;
    if v_d <> 0 then
      insert into public.wallet_ledger
        (tenant_id, advertiser_id, wallet_id, currency, delta,
         balance_before, balance_after, source, source_id, reason, actor_user_id)
      values
        (new.tenant_id, new.advertiser_id, new.id, 'EUR',
         v_d, v_ob, v_nb,
         coalesce(v_src, case when tg_op = 'INSERT' then 'opening'
                              else 'unknown' end),
         case when v_sid ~ '^[0-9a-fA-F-]{36}$' then v_sid::uuid else null end,
         v_rsn, v_who);
    end if;

    -- ── USD ────────────────────────────────────────────────────────
    v_ob := round(coalesce(case when tg_op = 'INSERT' then 0
                                else old.usd_balance end, 0), 2);
    v_nb := round(coalesce(new.usd_balance, 0), 2);
    v_d  := v_nb - v_ob;
    if v_d <> 0 then
      insert into public.wallet_ledger
        (tenant_id, advertiser_id, wallet_id, currency, delta,
         balance_before, balance_after, source, source_id, reason, actor_user_id)
      values
        (new.tenant_id, new.advertiser_id, new.id, 'USD',
         v_d, v_ob, v_nb,
         coalesce(v_src, case when tg_op = 'INSERT' then 'opening'
                              else 'unknown' end),
         case when v_sid ~ '^[0-9a-fA-F-]{36}$' then v_sid::uuid else null end,
         v_rsn, v_who);
    end if;

    return new;
  end;
$blk0$;

-- De rechten terug. Postgres geeft EXECUTE aan PUBLIC op een functie
-- die opnieuw is aangemaakt, en PUBLIC is inclusief anon -- ook bij een
-- triggerfunctie, die niemand rechtstreeks hoort te kunnen aanroepen.
revoke all on function public._wallet_ledger_record() from public, anon;
grant execute on function public._wallet_ledger_record() to service_role;

-- De trigger hangt er al sinds plak 140 en blijft ongemoeid; `create
-- or replace function` vervangt alleen de inhoud.

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
select
  'plak 146 geplaatst'                                       as wat,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_wallet_ledger_record'
      and position('x-psm-actor' in pg_get_functiondef(p.oid)) > 0)::text
                                                             as leest_de_header,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_audit_row_change'
      and position('x-psm-actor' in pg_get_functiondef(p.oid)) > 0)::text
                                                             as auditlog_ook,
  (select count(*) from pg_trigger
    where tgrelid = 'public.wallets'::regclass
      and tgname = 'wallet_ledger_record'
      and (tgtype & 4) = 4)::text                            as vuurt_op_insert,
  (select has_function_privilege('anon',
            'public._wallet_ledger_record()', 'execute')::text) as anon_mag;
