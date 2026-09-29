-- ════════════════════════════════════════════════════════════════════
-- PLAK 152 — EEN UITBETAALDE COMMISSIE MAG NIET MEE VERDWIJNEN
-- ════════════════════════════════════════════════════════════════════
--
-- WAT ER MIS IS
--
-- `referral_commissions` heeft geen eigen `advertiser_id`. Hij hangt
-- aan zijn affiliate via `referral_link_id`, en die staat op CASCADE.
-- Net als `subscription_id`, `topup_id` en
-- `subscription_invoice_id`.
--
-- Gevolg: verwijder een affiliate en zijn hele commissiegeschiedenis
-- gaat mee. Ook de UITBETAALDE. Gemeten vandaag: alle 6 commissies in
-- de database (EUR 99,96, allemaal `paid`) en alle 4 uitbetalingen
-- (EUR 170,92) hangen aan de testaccounts en zouden in één opdracht
-- verdwijnen. Er staat nergens een rem.
--
-- Bij die zestien maakt dat niets uit -- het is nepdata. Het
-- MECHANISME is het probleem: over een half jaar een echte affiliate
-- verwijderen doet precies hetzelfde, met geld dat wij hem betaald
-- hebben en dat in de boekhouding hoort te blijven staan.
--
-- ── WAAROM SET NULL ALLEEN NIET GENOEG IS ─────────────────────────
--
-- De rij op SET NULL zetten laat hem staan, maar dan weet niemand
-- meer van wie hij was: de link WAS de enige verwijzing naar de
-- affiliate. Je houdt een bedrag over zonder naam, en dat is bijna
-- net zo waardeloos als weg.
--
-- Een factuur lost dit al goed op: die draagt zijn tegenpartij bij
-- zich in plaats van er alleen naar te wijzen. Dus doet een commissie
-- dat nu ook -- de klantcode en de naam van de affiliate, vastgelegd
-- op het moment dat hij wordt geboekt. Dat is hoe een financiële
-- vastlegging een verwijdering overleeft.
--
-- ── WAT DIT DOET ──────────────────────────────────────────────────
--
--   1. Twee kolommen erbij: `affiliate_code`, `affiliate_name`
--   2. Teruggevuld voor alles wat er nu staat
--   3. Een trigger die ze invult bij elke nieuwe commissie
--   4. Vier CASCADEs worden SET NULL
--
-- `tenant_id` blijft CASCADE, en dat hoort: gaat de hele organisatie
-- weg, dan gaat alles weg.
-- ════════════════════════════════════════════════════════════════════

-- De naam op de auditregel. In de SQL-editor is auth.uid() leeg.
select set_config(
  'request.headers',
  json_build_object('x-psm-actor',
                    '8bd9b91b-c07b-4aae-9bd5-2aff773ab082')::text,
  true);

-- ── 1. DE TWEE KOLOMMEN ────────────────────────────────────────────
alter table public.referral_commissions
  add column if not exists affiliate_code text,
  add column if not exists affiliate_name text;

comment on column public.referral_commissions.affiliate_code is
  'De klantcode van de affiliate, vastgelegd bij het boeken. Staat hier zodat de regel leesbaar blijft als de affiliate ooit wordt verwijderd -- net als een factuur zijn tegenpartij draagt.';

-- ── 2. TERUGVULLEN ─────────────────────────────────────────────────
update public.referral_commissions rc
   set affiliate_code = a.tenant_client_code,
       affiliate_name = coalesce(up.full_name, up.email, a.tenant_client_code)
  from public.referral_links rl
  join public.advertisers a on a.id = rl.affiliate_advertiser_id
  left join public.user_profiles up on up.id = a.profile_id
 where rl.id = rc.referral_link_id
   and rc.affiliate_code is null;

-- ── 3. EN VOORTAAN VANZELF ─────────────────────────────────────────
create or replace function public._commission_carry_affiliate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk0$
begin
  if new.affiliate_code is null and new.referral_link_id is not null then
    select a.tenant_client_code,
           coalesce(up.full_name, up.email, a.tenant_client_code)
      into new.affiliate_code, new.affiliate_name
      from public.referral_links rl
      join public.advertisers a on a.id = rl.affiliate_advertiser_id
      left join public.user_profiles up on up.id = a.profile_id
     where rl.id = new.referral_link_id;
  end if;
  return new;
end
$blk0$;

revoke all on function public._commission_carry_affiliate() from public, anon;
grant execute on function public._commission_carry_affiliate() to service_role;

drop trigger if exists commission_carry_affiliate on public.referral_commissions;
create trigger commission_carry_affiliate
  before insert on public.referral_commissions
  for each row execute function public._commission_carry_affiliate();

-- ── 4. DE VIER CASCADES ────────────────────────────────────────────
-- Een commissie is een financiële vastlegging. Hij hoort te blijven
-- staan als datgene waar hij naar verwijst verdwijnt, precies zoals
-- een factuur blijft staan als de klant weggaat.
do $blk1$
declare
  r record;
begin
  for r in
    select con.conname,
           (select a.attname from unnest(con.conkey) k
              join pg_attribute a on a.attrelid = con.conrelid
                                 and a.attnum = k
             limit 1) as kolom,
           tgt.relname as doel
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_class tgt on tgt.oid = con.confrelid
     where con.contype = 'f'
       and src.relname = 'referral_commissions'
       and con.confdeltype = 'c'
       and tgt.relname in ('referral_links', 'subscriptions',
                           'top_ups', 'invoices')
  loop
    execute format(
      'alter table public.referral_commissions drop constraint %I',
      r.conname);
    execute format(
      'alter table public.referral_commissions add constraint %I ' ||
      'foreign key (%I) references public.%I(id) on delete set null',
      r.conname, r.kolom, r.doel);
    raise notice 'op SET NULL gezet: % (%)', r.kolom, r.doel;
  end loop;
end
$blk1$;

-- ── EEN RAPPORT, HELEMAAL ONDERAAN ─────────────────────────────────
-- `nog_cascade` hoort 0 te zijn en `zonder_naam` ook.
select
  'plak 152 geplaatst'                                        as wat,
  (select count(*) from public.referral_commissions)::text    as commissies,
  (select count(*) from public.referral_commissions
    where affiliate_code is null)::text                       as zonder_naam,
  (select count(*) from pg_constraint con
     join pg_class src on src.oid = con.conrelid
     join pg_class tgt on tgt.oid = con.confrelid
    where con.contype = 'f'
      and src.relname = 'referral_commissions'
      and con.confdeltype = 'c'
      and tgt.relname <> 'tenants')::text                     as nog_cascade,
  (select count(*) from pg_trigger
    where tgrelid = 'public.referral_commissions'::regclass
      and tgname = 'commission_carry_affiliate')::text        as trigger_staat_er;
