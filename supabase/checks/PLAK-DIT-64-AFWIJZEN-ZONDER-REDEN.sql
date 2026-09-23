-- ════════════════════════════════════════════════════════════════════
--  PLAK 64 — afwijzen zonder reden, en de reden kan er nooit meer bij
--
--  D1 heet "verifiëren en afwijzen MET een reden, klant krijgt bericht,
--  alles gelogd". Twee gaten daarin, allebei nagerekend op de live
--  database.
--
--  GAT 1 — EEN STORTING RECHTSTREEKS AFWIJZEN.
--  De poort op `top_ups` laat een sessie de status van 'pending' naar
--  'rejected' zetten. Dat is net de overgang die geld verplaatst: de
--  trigger `refund_wallet_on_topup_rejected` zet het bedrag terug in de
--  wallet. Eén regel in de console dus, en dan:
--
--    · geen reden gevraagd (de functie eist hem, een directe schrijf niet)
--    · rejection_reason blijft leeg
--    · geen bericht aan de klant
--    · de noodrem (MAINTENANCE_MODE) doet niets
--
--  En daarna zit de rij vast: dezelfde poort weigert elke statuswijziging
--  wég van 'rejected', de admin-actie weigert heropenen, en de functie
--  weigert een rij die niet meer 'pending' is. **De reden kan er nooit
--  meer bij.** Voor die rij is "afgewezen met een reden, alles gelogd"
--  stilletjes onwaar.
--
--  GAT 2 — EEN WALLET-STORTING AFWIJZEN MET EEN LEGE REDEN.
--  `wallet_topup_admin_reject(p_topup_id, p_reason default null)` zet de
--  reden weg zonder te kijken of er iets in staat. De dialoog eist hem,
--  maar de dialoog is niet de grens. Een klant kan dus een weigering van
--  EUR 1.000 krijgen met een lege toelichting.
--
--  WAT DIT BLOK DOET
--    A  de poort op top_ups krijgt er twee regels bij: een sessie wijst
--       niet meer af (dat loopt via de functie die de reden eist en het
--       geld teruggeeft), en een storting die nog het geld van de klant
--       vasthoudt kan niet worden weggestreept in plaats van terugbetaald
--    B  een regel die voor IEDEREEN geldt -- ook voor de functies en de
--       service-sleutel: de status 'rejected' zonder reden gaat er niet
--       in. Op wallet_topups en op top_ups.
--
--  Blok A is de functie van vandaag, letterlijk, met twee stukjes erbij.
--  ad_account_withdrawals heeft helemaal geen redenkolom, dus die blijft
--  hier buiten (los op te lossen).
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p64;
create temp table _p64(nr int, wat text, uitkomst text);

-- ── A. DE POORT OP STORTINGEN ────────────────────────────────────────
create or replace function public._guard_top_ups_session_write()
returns trigger
language plpgsql
set search_path to 'public'
as $blk0$
declare
  v_allowed text[] := array['type', 'notes', 'status', 'is_deleted', 'updated_at', 'author'];
begin
  -- Hoort het account en de advertiser bij DEZE tenant? Voor iedereen,
  -- ook definer en service key: een funding op de advertiser van een
  -- andere tenant boekte commissie op DIENS link.
  if tg_op = 'INSERT' or new.advertiser_id is distinct from old.advertiser_id
     or new.tenant_id is distinct from old.tenant_id
     or new.account_id is distinct from old.account_id then
    if not exists (select 1 from public.advertisers a
                    where a.id = new.advertiser_id and a.tenant_id = new.tenant_id) then
      raise exception 'top_ups: advertiser is not in this tenant' using errcode = '42501';
    end if;
    if new.account_id is not null and not exists (
         select 1 from public.ad_accounts x
          where x.id = new.account_id and x.tenant_id = new.tenant_id) then
      raise exception 'top_ups: ad account is not in this tenant' using errcode = '42501';
    end if;
  end if;

  -- Alleen een sessie (browser of server action) is 'authenticated'.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'top_ups: only type, notes, status and is_deleted can be changed here'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status
       and coalesce(old.status, '') in ('completed', 'rejected') then
      raise exception 'top_ups: a % top-up cannot change status here', old.status
        using errcode = '42501';
    end if;

    -- NIEUW. Afwijzen verplaatst geld terug en is de klant een reden
    -- schuldig. Die overgang hoort bij de functie, niet bij een
    -- rechtstreekse schrijfactie -- want daarna kan de reden er nooit
    -- meer bij.
    if new.status = 'rejected' and coalesce(old.status, '') <> 'rejected' then
      raise exception 'top_ups: afwijzen gaat via top_up_admin_reject — die eist een reden en zet het geld terug'
        using errcode = '42501';
    end if;

    if coalesce(new.is_deleted, false) and not coalesce(old.is_deleted, false)
       and coalesce(old.status, '') = 'completed' then
      raise exception 'top_ups: a completed top-up cannot be deleted here'
        using errcode = '42501';
    end if;

    -- NIEUW. Een wachtende storting die het geld van de klant al heeft
    -- afgeschreven mag niet worden weggestreept: wegstoppen is niet
    -- teruggeven.
    if coalesce(new.is_deleted, false) and not coalesce(old.is_deleted, false)
       and coalesce(old.status, '') = 'pending'
       and coalesce(old.wallet_debited, false) then
      raise exception 'top_ups: deze storting houdt nog het geld van de klant vast. Wijs hem af — dat betaalt de wallet terug — in plaats van hem te verwijderen'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$blk0$;

do $blk1$
begin
  -- De trigger bestaat al en wijst naar deze functie; dit is alleen een
  -- controle dat hij er inderdaad staat.
  if exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
              where c.relname = 'top_ups' and not t.tgisinternal
                and t.tgfoid = 'public._guard_top_ups_session_write()'::regprocedure) then
    insert into _p64 values (1, 'poort op stortingen',
      'bijgewerkt — een sessie wijst niet meer af, en een wachtende storting met het geld van de klant erin kan niet worden weggestreept');
  else
    execute 'create trigger a0_guard_top_ups_session_write
               before insert or update on public.top_ups
               for each row execute function public._guard_top_ups_session_write()';
    insert into _p64 values (1, 'poort op stortingen', 'functie bijgewerkt EN trigger opnieuw aangehaakt (hij stond er niet)');
  end if;
exception when others then
  insert into _p64 values (1, 'poort op stortingen', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── B. GEEN WEIGERING ZONDER REDEN, VOOR IEDEREEN ────────────────────
--  Deze kent geen uitzondering voor de functies: ook wallet_topup_admin_
--  reject, de service-sleutel en een toekomstig script moeten een reden
--  meegeven. De klant krijgt hem te zien; leeg is geen antwoord.
create or replace function public._guard_rejection_needs_reason()
returns trigger
language plpgsql
set search_path to 'public'
as $blk2$
begin
  if coalesce(new.status, '') = 'rejected'
     and coalesce(old.status, '') <> 'rejected'
     and coalesce(btrim(new.rejection_reason), '') = '' then
    raise exception 'een weigering heeft een reden nodig — de klant krijgt hem te zien'
      using errcode = '22023';
  end if;
  return new;
end;
$blk2$;

do $blk3$
declare
  v_tab  text;
  v_done text := '';
begin
  foreach v_tab in array array['wallet_topups', 'top_ups'] loop
    begin
      execute format('drop trigger if exists a1_guard_rejection_needs_reason on public.%I', v_tab);
      execute format('create trigger a1_guard_rejection_needs_reason
                        before update on public.%I
                        for each row execute function public._guard_rejection_needs_reason()', v_tab);
      v_done := v_done || v_tab || ' · ';
    exception when others then
      v_done := v_done || v_tab || ' MISLUKT (' || sqlerrm || ') · ';
    end;
  end loop;
  insert into _p64 values (2, 'weigering zonder reden', rtrim(v_done, ' ·'));
end
$blk3$;

-- ── C. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk4$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname || ': ' || t.tgname, ' · ' order by c.relname, t.tgname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and (t.tgname like 'a0_guard%' or t.tgname like 'a1_guard%');
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p64 values (3, 'alle poorten', v_txt);

  begin
    select coalesce(count(*)::text || ' afgewezen zonder reden in de database', '?')
      into v_txt
      from (
        select 1 from public.top_ups
         where status = 'rejected' and coalesce(btrim(rejection_reason), '') = ''
        union all
        select 1 from public.wallet_topups
         where status = 'rejected' and coalesce(btrim(rejection_reason), '') = ''
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p64 values (4, 'bestaande rijen', v_txt);
end
$blk4$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p64 order by nr;
