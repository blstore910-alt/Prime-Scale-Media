-- ════════════════════════════════════════════════════════════════════
-- PLAK 140 — DRIE GATEN IN DE GROOTBOEKTRIGGER
-- ════════════════════════════════════════════════════════════════════
--
-- De trigger die het grootboek vult heeft nog nooit een echte beweging
-- gezien (gemeten 29-09: 10 regels, allemaal `opening`). Voordat hij
-- dat wel doet, drie dingen die hem stuk zouden maken.
--
-- ── 1. EEN HALVE CENT BREEKT DE BETALING, EN DAARNA ELKE VOLGENDE ──
--
-- De regel rekent zo:
--
--   delta          := round(nieuw - oud, 2)
--   balance_before := round(oud, 2)
--   balance_after  := round(nieuw, 2)
--
-- en de tabel eist `delta <> 0` plus
-- `round(balance_before + delta, 2) = round(balance_after, 2)`.
--
-- Gemeten in Postgres: gaat een saldo van 0,006 naar 0,012, dan is
-- delta 0,01, before 0,01 en after 0,01 -- en 0,01 + 0,01 is niet
-- 0,01. De insert faalt met 23514, de hele wallet-update rolt terug,
-- en de RPC gooit een fout naar de klant. Zijn top-up mislukt.
--
-- Erger: dat saldo blijft daarna op drie decimalen staan, dus ELKE
-- volgende beweging op die portemonnee faalt op dezelfde manier, tot
-- iemand het met de hand rondt in de SQL-editor.
--
-- Hoe komt er een derde decimaal in? 17 van de 18 functies die een
-- saldo schrijven ronden niet af, en de kolommen zijn `numeric` zonder
-- schaal. Eén `p_amount = 100.005` is genoeg. Er is er vandaag geen
-- een -- alle 18 saldi staan op 2 decimalen -- dus dit is een grendel,
-- geen brand.
--
-- DE FIX: reken de delta uit de AFGERONDE saldi.
--
--   delta := round(nieuw, 2) - round(oud, 2)
--
-- Dan geldt before + delta = after altijd, per constructie. En is die
-- delta nul, dan is er in centen niets gebeurd: geen regel, geen fout,
-- de betaling gaat door.
--
-- ── 2. DE NAAM VAN DE VEROORZAKER VALT WEG BIJ ÉÉN PUNT ────────────
--
-- Plak 126 haalt de naam uit de aanroepstapel als een RPC geen hint
-- zet. Dat is belangrijk, want gemeten: GEEN ENKELE van de 18
-- geldfuncties zet een hint. De stapel is het enige wat er is.
--
-- Hij ontleedt met  'function ([a-zA-Z0-9_]+)\('  en dat kan niet over
-- een punt heen. Gemeten:
--
--   PL/pgSQL function invoice_pay_from_wallet(uuid)          -> ok
--   PL/pgSQL function public.invoice_pay_from_wallet(uuid)   -> NULL
--
-- Postgres zet dat schema ervoor zodra de functie bij het compileren
-- niet in het `search_path` zichtbaar is. Gebeurt dat, dan gaat niet
-- één regel naar `unknown` maar ALLEMAAL, tegelijk, en dan hebben we
-- van elke geldbeweging wel het DAT en van geen enkele het WAAROM.
--
-- DE FIX: een optioneel schema voor de naam, en de naam eruit.
-- Daarmee krijgen alle 18 functies in één keer hun naam in `source`,
-- zonder dat er een van hoeft te worden aangeraakt.
--
-- ── 3. EEN PORTEMONNEE DIE MÉT GELD WORDT AANGEMAAKT ───────────────
--
-- De trigger is `after update of eur_balance, usd_balance`. Een insert
-- met een saldo erin schrijft dus geen regel, en de openingsvulling
-- van plak 125 draait maar één keer. Die portemonnee staat daarna voor
-- altijd rood in de controle, en niets kan dat opheffen behalve een
-- handmatige service-role-insert.
--
-- Vandaag kan het niet gebeuren: beide kolommen hebben default 0 en
-- geen enkel pad geeft een saldo mee bij het aanmaken. Ook dit is een
-- grendel.
--
-- ── WAT DIT NIET DOET ──────────────────────────────────────────────
--
-- Niets aan bestaande regels, niets aan saldi. De functie wordt
-- vervangen en de trigger opnieuw gehangen; daarna staat er precies
-- evenveel in het grootboek als ervoor.
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
  begin
    -- 1. De expliciete hint, als een RPC hem zet. Die wint: een naam
    --    die iemand gekozen heeft zegt meer dan een stapel.
    v_src := nullif(btrim(coalesce(current_setting('psm.ledger_source', true), '')), '');
    v_sid := nullif(btrim(coalesce(current_setting('psm.ledger_source_id', true), '')), '');
    v_rsn := nullif(btrim(coalesce(current_setting('psm.ledger_reason', true), '')), '');

    -- 2. Anders: vraag Postgres wie er belde.
    --
    --    pg_context geeft regels als
    --      PL/pgSQL function _wallet_ledger_record() line 12 at SQL statement
    --      SQL statement "update public.wallets set eur_balance = ..."
    --      PL/pgSQL function invoice_pay_from_wallet(uuid) line 84 at ...
    --
    --    en soms met het schema ervoor:
    --      PL/pgSQL function public.invoice_pay_from_wallet(uuid) line 84
    --
    --    Dat schema is optioneel gemaakt. Zonder die aanpassing gaf de
    --    tweede vorm NULL terug en ging ELKE regel tegelijk naar
    --    'unknown' -- niet een, allemaal.
    --
    --    De eerste functienaam die niet van dit grootboek zelf is, is
    --    de veroorzaker. Alles staat in een blok met een eigen
    --    exception: mislukt het lezen of het ontleden, dan valt hij
    --    terug op 'unknown' en gaat de regel gewoon door. Een grootboek
    --    mag nooit een betaling tegenhouden omdat het de naam niet kon
    --    vinden.
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
    -- De delta komt uit de AFGERONDE saldi, niet uit het afgeronde
    -- verschil. Zo geldt before + delta = after altijd, en een
    -- beweging kleiner dan een halve cent schrijft geen regel in
    -- plaats van de hele betaling af te breken.
    --
    -- Bij een INSERT bestaat `old` niet; dan is het saldo van 0
    -- gekomen.
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
         v_rsn, auth.uid());
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
         v_rsn, auth.uid());
    end if;

    return new;
  end;
$blk0$;

-- De rechten terug. Postgres geeft EXECUTE aan PUBLIC op een functie
-- die opnieuw is aangemaakt, en PUBLIC is inclusief anon -- ook bij een
-- triggerfunctie, die niemand rechtstreeks hoort te kunnen aanroepen.
revoke all on function public._wallet_ledger_record() from public, anon;
grant execute on function public._wallet_ledger_record() to service_role;

-- ── DE TRIGGER OOK OP INSERT ───────────────────────────────────────
drop trigger if exists wallet_ledger_record on public.wallets;
create trigger wallet_ledger_record
  after insert or update of eur_balance, usd_balance
  on public.wallets
  for each row
  execute function public._wallet_ledger_record();

-- ── EEN REGEL HOORT BIJ EEN PORTEMONNEE ────────────────────────────
-- Er stond geen foreign key op wallet_ledger.wallet_id (gemeten: 0
-- constraints van dat type). De dagelijkse controle loopt van `wallets`
-- NAAR de regels, dus een regel waarvan de portemonnee weg is komt daar
-- nooit langs: het verwijderen van een gevulde portemonnee wist zijn
-- eigen alarm. Nagerekend op de echte data -- laat de portemonnee met
-- EUR 340,00 aan regels weg en de controle zegt "de boeken kloppen".
--
-- `on delete restrict`, met opzet: een grootboek hoort te WEIGEREN dat
-- de tegenhanger verdwijnt. Cascade zou de regels meenemen en dat is
-- precies het bewijsmateriaal.
--
-- Dit breekt het bestaande opruimpad niet. Plak 86 verwijdert alleen
-- portemonnees met saldo nul en zonder tenant, en gemeten 29-09: er
-- zijn 11 lege portemonnees en daarvan heeft er GEEN EEN een
-- grootboekregel. Een lege portemonnee weggooien blijft dus gewoon
-- werken; een gevulde niet meer, en dat is het punt.
do $blk1$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.wallet_ledger'::regclass
       and contype = 'f'
  ) then
    alter table public.wallet_ledger
      add constraint wallet_ledger_wallet_fk
      foreign key (wallet_id) references public.wallets(id)
      on delete restrict;
    raise notice 'foreign key geplaatst';
  else
    raise notice 'foreign key stond er al';
  end if;
exception when others then
  -- Staan er al weesregels, dan kan de key er niet op. Dat is zelf het
  -- alarm: meld het en ga door, zodat de rest van de plak wel landt.
  raise notice 'foreign key NIET geplaatst: %', sqlerrm;
end
$blk1$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
select
  'plak 140 geplaatst'                                          as wat,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = '_wallet_ledger_record'
      and position('[a-zA-Z0-9_]+\.' in pg_get_functiondef(p.oid)) > 0
  )::text                                                       as schema_in_de_regex,
  (select count(*) from pg_trigger
    where tgrelid = 'public.wallets'::regclass
      and tgname = 'wallet_ledger_record'
      and (tgtype & 4) = 4)::text                               as vuurt_ook_op_insert,
  (select count(*) from pg_constraint
    where conrelid = 'public.wallet_ledger'::regclass
      and contype = 'f')::text                                  as foreign_key,
  (select count(*) from public.wallet_ledger l
    where not exists (select 1 from public.wallets w
                       where w.id = l.wallet_id))::text          as weesregels,
  (select has_function_privilege('anon',
            'public._wallet_ledger_record()', 'execute')::text)  as anon_mag_nog;
