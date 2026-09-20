-- =====================================================================
-- Een opname kan niet groter zijn dan wat er op het account staat
-- =====================================================================
-- `ad_account_withdrawal_request` en `..._approve` controleren zelf
-- GEEN saldo en GEEN accountstatus. Het hele plafond zit in
-- actions/withdrawal-actions.ts -- en PostgREST zet elke public
-- function op /rest/v1/rpc/<naam>, dus elke ingelogde klant kan de RPC
-- rechtstreeks aanroepen en de actie overslaan.
--
--   supabase.rpc('ad_account_withdrawal_request',
--                { p_ad_account_id: mijn_account, p_amount: 999999 })
--
-- Er staat dan een aanvraag van USD 999.999 in de wachtrij. De
-- goedkeuring gaat in de praktijk wel door de actie heen, die opnieuw
-- rekent -- maar dat is één TypeScript-regel tussen een klant en het
-- crediteren van een wallet met geld dat er niet is. En de rij zelf is
-- dan al aangemaakt: de desk ziet een aanvraag die er niet had mogen
-- zijn en moet die met de hand afwijzen.
--
-- ── WAT HET PLAFOND IS ───────────────────────────────────────────────
--
-- Hetzelfde als `fundedUsd` in de actie: alles wat er ooit op gezet is
-- (afgeronde, niet-doorgestreepte top-ups) min alles wat er al af is
-- gevraagd (elke opname die niet rejected of cancelled is -- ook de
-- openstaande, want die zijn al vergeven).
--
-- LET OP, en dit staat ook in de actie: dit is een PLAFOND, geen saldo.
-- Geld dat bij het platform is uitgegeven staat nergens in deze
-- database. Een klant die $10.000 heeft gefund en $9.000 heeft
-- uitgegeven kan hier nog steeds $10.000 aanvragen. Dat gat sluit pas
-- als we het echte saldo bij de leverancier uitlezen; deze trigger
-- sluit alleen de helft die wij WEL weten.
--
-- ── WAAROM EEN TRIGGER ───────────────────────────────────────────────
--
-- De body van de RPC staat met de hand op de database en niet in deze
-- repo; hem vervangen vanuit de repo heeft vanavond al één keer de
-- productie plat gelegd. Een BEFORE INSERT trigger is additief, leest
-- niets van die functie, en gaat er in één regel weer af.
--
-- De service-role (auth.uid() null) gaat er wel doorheen: een
-- correctie met de hand door de eigenaar in de SQL-editor moet kunnen.
--
-- Veilig om vaker te draaien.
-- =====================================================================

set search_path = public;

create or replace function public._withdrawal_within_the_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $blk0$
declare
  v_put_on numeric := 0;
  v_taken  numeric := 0;
  v_room   numeric := 0;
  v_status text;
begin
  if new.ad_account_id is null then
    return new;
  end if;

  -- Een gesloten account geeft niets terug. Dezelfde twee statussen die
  -- de actie weigert, zodat scherm en database het eens zijn.
  select lower(coalesce(a.status, '')) into v_status
    from public.ad_accounts a
   where a.id = new.ad_account_id;
  if v_status in ('banned', 'closed') then
    raise exception
      'This ad account is closed, so nothing can be withdrawn from it.'
      using errcode = '42501';
  end if;

  begin
    select coalesce(sum(t.topup_amount), 0) into v_put_on
      from public.top_ups t
     where t.account_id = new.ad_account_id
       and t.status = 'completed'
       and coalesce(t.is_deleted, false) = false;
  exception when undefined_column then
    -- is_deleted is met de hand toegevoegd en staat in geen migratie.
    -- Zonder die kolom telt alles mee; dat is de veilige kant, want het
    -- plafond wordt er alleen hoger van als er doorgestreepte rijen
    -- zijn, en die zijn er hier niet.
    select coalesce(sum(t.topup_amount), 0) into v_put_on
      from public.top_ups t
     where t.account_id = new.ad_account_id
       and t.status = 'completed';
  end;

  select coalesce(sum(w.amount), 0) into v_taken
    from public.ad_account_withdrawals w
   where w.ad_account_id = new.ad_account_id
     and w.id is distinct from new.id
     and lower(coalesce(w.status, '')) not in ('rejected', 'cancelled');

  v_room := round((v_put_on - v_taken)::numeric, 2);

  if round(coalesce(new.amount, 0)::numeric, 2) > v_room + 0.005 then
    raise exception
      'That is more than this ad account can return. We funded % and % has already been asked back, so at most % is available.',
      to_char(v_put_on, 'FM999999990.00'),
      to_char(v_taken, 'FM999999990.00'),
      to_char(greatest(v_room, 0), 'FM999999990.00')
      using errcode = '23514';
  end if;

  return new;
end;
$blk0$;

drop trigger if exists trg_withdrawal_within_the_account
  on public.ad_account_withdrawals;
create trigger trg_withdrawal_within_the_account
  before insert on public.ad_account_withdrawals
  for each row execute function public._withdrawal_within_the_account();

-- =====================================================================
-- Het rapport — de SQL-editor toont alleen het LAATSTE resultaat
-- =====================================================================
select 1 as nr, 'plafond-trigger op ad_account_withdrawals' as item,
  case when exists (select 1 from pg_trigger
                     where tgname = 'trg_withdrawal_within_the_account'
                       and not tgisinternal)
       then 'AAN' else 'NIET AANGELEGD' end as antwoord
union all
select 2, 'wie mag de opname-RPCs aanroepen',
  coalesce((
    select string_agg(p.proname || ' -> ' ||
             coalesce(array_to_string(p.proacl, ' , '), 'default (IEDEREEN)'),
             '   |   ' order by p.proname)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('ad_account_withdrawal_request',
                         'ad_account_withdrawal_approve')
  ), 'geen van beide bestaat')
union all
-- Staat hier iets boven 0, dan is er in het verleden al meer
-- teruggevraagd dan er ooit op stond. Dat wil met de hand bekeken
-- worden; de trigger stopt alleen de volgende.
select 3, 'ad-accounts waar MEER af is gevraagd dan er ooit op stond',
  (select count(*)::text from (
     select w.ad_account_id
       from public.ad_account_withdrawals w
      where lower(coalesce(w.status, '')) not in ('rejected', 'cancelled')
      group by w.ad_account_id
     having coalesce(sum(w.amount), 0) > coalesce((
              select sum(t.topup_amount) from public.top_ups t
               where t.account_id = w.ad_account_id
                 and t.status = 'completed'), 0) + 0.005
   ) x)
union all
select 4, 'openstaande opnames nu',
  (select count(*)::text || '  |  ' ||
          to_char(coalesce(sum(amount), 0), 'FM999999990.00')
     from public.ad_account_withdrawals
    where lower(coalesce(status, '')) = 'pending')
order by nr;
