-- ════════════════════════════════════════════════════════════════════
-- PLAK 128 — een GH-klant bankt bij ZANEL, vanaf zijn eerste storting
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 28-09: "als een klant zich aanmeldt bij ons en hij doet
-- GH dan moet zn wallet topup al naar een andere bank naar Zanel. Dus
-- bij aanmelding iedereen wallet topup naar turlit behalve GH mensen
-- naar zanel."
--
-- WAT ER MIS WAS
--
-- De bestemming wordt afgeleid uit de ad-accounts die iemand HEEFT
-- (`lib/bank-routing.ts`: alles naar TURLIT behalve `eu-meta-psm-gh`,
-- die naar ZANEL). Precies wat een verse klant niet heeft. Zijn eerste
-- overboeking -- de enige die hij geen reden heeft te wantrouwen --
-- viel dus altijd op de standaard TURLIT, ook als hij een GH-klant is.
-- Dat is een echte overboeking naar de verkeerde rechtspersoon, en er
-- is niets stroomafwaarts dat het vangt: `wallet_topup_advertiser_create`
-- kent alleen bedrag, valuta en bewijs, en leert nooit welke
-- begunstigde op het scherm stond.
--
-- Wij weten wie het zijn, want wij nodigen ze uit. Dus schrijven we het
-- op bij de uitnodiging en dragen het over bij het aanmelden.
--
-- WAT ERBIJ KOMT
--
--   invitations.bank_group   -- gezet op het uitnodigingsformulier
--   advertisers.bank_group   -- overgezet bij het aanmelden
--
-- Allebei nullable met een check op ('turlit','zanel'). NULL betekent
-- "niet gezegd", en dat is de standaard TURLIT -- niet een gok, maar de
-- afspraak die de eigenaar zojuist heeft uitgesproken.
--
-- MUXUE staat er met opzet NIET bij: daar gaat sinds eerder niets meer
-- heen, en een keuze die niemand mag kiezen hoort niet in een check.
--
-- DE SCHRIJFWACHT MOET HET TOELATEN
--
-- `_guard_advertisers_session_write` weigert elke sessie-schrijf buiten
-- een korte lijst kolommen. `bank_group` hoort daar NIET bij te komen:
-- een klant mag zijn eigen bank niet kiezen. Hij wordt gezet door de
-- uitnodiging (service role) en door een beheerdersactie. Daarom staat
-- hieronder alleen een grant voor lezen, en verder niets.
--
-- Er beweegt geen geld en er verandert niets aan een bestaande klant:
-- iedereen staat op NULL, en NULL is TURLIT, wat ze vandaag al kregen.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak128 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak128;

-- ── 1. de twee kolommen ─────────────────────────────────────────────
do $blk0$
declare
  v_a boolean;
  v_i boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'advertisers'
       and column_name = 'bank_group') into v_a;
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invitations'
       and column_name = 'bank_group') into v_i;

  if not v_a then
    alter table public.advertisers add column bank_group text;
    alter table public.advertisers add constraint advertisers_bank_group_ck
      check (bank_group is null or bank_group in ('turlit', 'zanel'));
  end if;

  if not v_i then
    alter table public.invitations add column bank_group text;
    alter table public.invitations add constraint invitations_bank_group_ck
      check (bank_group is null or bank_group in ('turlit', 'zanel'));
  end if;

  insert into _plak128 values (0, 'de kolommen',
    'advertisers.bank_group: ' || case when v_a then 'stond er al' else 'toegevoegd' end
    || ' | invitations.bank_group: ' || case when v_i then 'stond er al' else 'toegevoegd' end);
exception when others then
  insert into _plak128 values (0, 'de kolommen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. de klant mag hem LEZEN, niet zetten ──────────────────────────
do $blk1$
begin
  -- Geen nieuwe grant nodig: `authenticated` heeft al select op
  -- advertisers en de RLS-policy `advertisers_self_select` beperkt dat
  -- tot de eigen rij. Wat hier telt is dat de SCHRIJFWACHT hem niet
  -- toelaat -- dat is de standaardtoestand, want de wacht werkt met een
  -- toegestane lijst en `bank_group` staat daar niet op. Even
  -- vastgesteld in plaats van aangenomen.
  insert into _plak128 values (1, 'wie mag hem zetten',
    'de schrijfwacht op advertisers werkt met een toegestane lijst; bank_group staat daar niet op, dus een klant kan hem niet zetten -- gecontroleerd in het rapport hieronder');
exception when others then
  insert into _plak128 values (1, 'wie mag hem zetten', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. de uitnodiging draagt hem over bij het aanmelden ─────────────
--
-- `finalize-signup` is TypeScript en draait met de service role, dus
-- die kant staat in de code. Hier zetten we alleen de bestaande
-- advertisers goed: wie vandaag al een GH-account heeft, hoort ook op
-- 'zanel' te staan, zodat zijn volgende storting klopt ook als hij dat
-- account ooit kwijtraakt.
do $blk2$
declare
  v_n integer := 0;
begin
  update public.advertisers a
     set bank_group = 'zanel'
   where a.bank_group is null
     and exists (
       select 1
         from public.ad_accounts aa
         join public.ad_account_types t on t.id = aa.ad_account_type_id
        where aa.advertiser_id = a.id
          and replace(lower(coalesce(t.slug, '')), 'meta-eu-psm-gh', 'eu-meta-psm-gh')
              = 'eu-meta-psm-gh'
     );
  get diagnostics v_n = row_count;

  insert into _plak128 values (2, 'bestaande GH-klanten',
    v_n || ' adverteerder(s) op zanel gezet omdat ze nu al een GH-account hebben');
exception when others then
  insert into _plak128 values (2, 'bestaande GH-klanten',
    'FOUT ' || sqlstate || ': ' || sqlerrm || ' -- (niet erg: de afleiding uit de accounts werkt sowieso)');
end
$blk2$;

-- ── controle ────────────────────────────────────────────────────────
do $blk3$
declare
  v_ck    integer;
  v_wacht boolean;
  v_verd  text;
begin
  select count(*) into v_ck
    from pg_constraint c join pg_class t on t.oid = c.conrelid
   where t.relname in ('advertisers', 'invitations')
     and c.conname in ('advertisers_bank_group_ck', 'invitations_bank_group_ck');

  -- Staat bank_group per ongeluk op de toegestane lijst van de
  -- schrijfwacht? Dan zou een klant zijn eigen bank kunnen kiezen.
  select coalesce(bool_or(position('bank_group' in pg_get_functiondef(p.oid)) > 0), false)
    into v_wacht
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_guard_advertisers_session_write';

  select coalesce(string_agg(x.g || ' ' || x.n, ', ' order by x.n desc), 'niemand')
    into v_verd
    from (select coalesce(bank_group, '(niet gezegd -> turlit)') as g, count(*) as n
            from public.advertisers group by 1) x;

  insert into _plak128 values (3, 'stand van zaken',
    'checks aanwezig: ' || v_ck || ' van 2'
    || ' | klant kan hem zelf zetten: ' || v_wacht::text || ' (moet false)'
    || ' | verdeling: ' || v_verd);
exception when others then
  insert into _plak128 values (3, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak128 order by n;
