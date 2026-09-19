-- =====================================================================
-- Re-homing two fixes that only ever lived in supabase/checks/.
-- =====================================================================
-- HOE DRAAI JE DIT
--   Je hoeft dit NIET te draaien — het staat al op productie. Het is
--   idempotent, dus draaien kan geen kwaad. Als je het toch doet:
--   plakken in de Supabase SQL editor en Run, als `postgres`, RLS speelt
--   geen rol.
--
-- WAAROM DIT BESTAAT
--   Deze twee fixes zijn op 18 september gedraaid vanuit
--   supabase/checks/RUN-NOW-2.sql, een bestand buiten supabase/migrations/
--   dat in geen enkel document genoemd wordt. Bevestigd aanwezig op live
--   met WAT-STAAT-ER-ECHT.sql (rij 1, 2 en 3: alle drie "JA").
--
--   Maar een herstel uit backup wordt opgebouwd uit supabase/migrations/,
--   en daar stonden ze niet in. Dan komen allebei de gaten terug, en het
--   zijn de twee zwaarste die er zijn geweest:
--
--     1  ad_account_withdrawal_request nam p_currency van de beller en
--        controleerde alleen of het USD of EUR was. Goedkeuring boekte
--        het bedrag 1-op-1 op de wallet, zonder ooit de valuta van het
--        ad-account te lezen. $1.000 opnemen als EUR gaf €1.000, waard
--        $1.163. Herhaalbaar, door de klant zelf, en de goedkeurende
--        admin ziet de NAAM van het account, niet de valuta — dus er
--        staat niets op z'n scherm dat hem tegenspreekt.
--
--     2  change_subscription_amount las het abonnement zonder slot en
--        besloot daarna over een terugbetaling. Twee tabbladen, of een
--        request die opnieuw geprobeerd wordt, lazen allebei "nog niets
--        terugbetaald" en betaalden allebei uit.
--
--   Verder verandert dit niets. Het is hetzelfde werk, op de plek waar
--   het hoort te staan.
-- =====================================================================

-- ── 1 · een opname is altijd USD ─────────────────────────────────────
-- Een trigger, niet een herschreven functie. Een trigger houdt stand
-- ongeacht waarmee de RPC wordt aangeroepen, ongeacht hoe de RPC later
-- wordt herschreven, en ongeacht wie hem aanroept.
create or replace function public._withdrawal_is_always_usd()
returns trigger
language plpgsql
as $blk1$
begin
  new.currency := 'USD';
  return new;
end;
$blk1$;

drop trigger if exists trg_withdrawal_is_always_usd
  on public.ad_account_withdrawals;
create trigger trg_withdrawal_is_always_usd
  before insert or update of currency on public.ad_account_withdrawals
  for each row execute function public._withdrawal_is_always_usd();


-- ── 2 · een terugbetaling kan niet twee keer ─────────────────────────
-- De index is de duurzame helft: een tweede identieke terugbetaling is
-- onmogelijk, ook als het slot hieronder ooit verloren gaat.
create unique index if not exists wallet_adjustments_change_refund_uq
  on public.wallet_adjustments (reference)
  where reference like 'subscription_change_refund:%';

do $blk2$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'change_subscription_amount'
     and p.prokind = 'f'
   limit 1;

  if v_src is null then
    raise notice 'change_subscription_amount bestaat niet — niets te doen.';
    return;
  end if;
  if position('for update' in v_src) > 0 then
    raise notice 'Het slot zit er al; alleen de index is gecontroleerd.';
    return;
  end if;
  if position('into v_sub' in v_src) = 0 then
    raise notice 'De select is anders geschreven — zet het slot met de hand.';
    return;
  end if;

  v_new := regexp_replace(v_src, '(into v_sub[^;]*)(;)', '\1 for update\2', '');
  if v_new = v_src then
    raise exception 'Kon het slot niet zetten — doe het met de hand.';
  end if;

  execute v_new;
  raise notice 'Het abonnement wordt nu vergrendeld voordat de terugbetaling wordt besloten.';
end;
$blk2$;
