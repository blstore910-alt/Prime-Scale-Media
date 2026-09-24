-- ════════════════════════════════════════════════════════════════════
-- PLAK 96 — "Your top-up has been verified successfully", zonder bedrag
--            en zonder account
-- ════════════════════════════════════════════════════════════════════
--
-- De melding die een klant krijgt als zijn geld op een ad-account landt
-- zegt niet hoeveel en ook niet op welk account. Gelezen in het
-- meldingenscherm van PSM0005:
--
--   Top-up Completed          7 hours ago
--   Your top-up has been verified successfully.
--
-- De regel eronder, over geld dat terugkomt, zegt het wel: "What you
-- asked back from AA-PSM0005-EU-01 has landed in your wallet."
--
-- De reden is de payload. `notify_topup_completed` -- een trigger die
-- met de hand op de live database staat en in geen enkele migratie in
-- deze repo -- schrijft alleen:
--
--   { topup_id, author, approved_at }
--
-- Het scherm kan dus niets anders zeggen. Deze plak zet er het bedrag,
-- de valuta en de accountnaam bij. De app leest allebei de vormen: zit
-- het bedrag er niet in, dan staat er precies wat er nu staat.
--
-- Verder verandert er niets aan wanneer hij vuurt.
--
-- Eén toevoeging wel: staat er geen ontvanger (een adverteerder zonder
-- user_id), dan werd er een melding weggeschreven die niemand ooit ziet.
-- Die slaat hij nu over.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak96 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak96;

do $blk0$
begin
  create or replace function public.notify_topup_completed()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  declare
    v_recipient_user_id uuid;
    v_account_name      text;
    v_amount            numeric;
    v_currency          text;
  begin
    if tg_op = 'UPDATE'
       and new.status = 'completed'
       and old.status is distinct from new.status then

      -- recipient: advertiser.user_id (auth.users.id)
      select a.user_id
        into v_recipient_user_id
        from public.advertisers a
       where a.id = new.advertiser_id
       limit 1;

      -- Niemand om het tegen te zeggen: dan ook geen rij. Een melding
      -- met een lege ontvanger ziet geen mens.
      if v_recipient_user_id is null then
        return new;
      end if;

      -- Welk account, en hoeveel erop landde. `topup_usd` is de
      -- scheidslijn die lib/pure-topup-landed aanhoudt: staat hij
      -- gevuld, dan schreef de klant-RPC de rij en is `topup_amount`
      -- in `currency`; is hij leeg, dan schreef een adminpad dollars.
      select aa.name into v_account_name
        from public.ad_accounts aa
       where aa.id = new.account_id
       limit 1;

      v_amount := new.topup_amount;
      v_currency := case
        when new.topup_usd is not null then upper(coalesce(new.currency, 'EUR'))
        else 'USD'
      end;

      insert into public.notifications (
        type, recipient_user_id, tenant_id, actor_user_id, payload,
        is_read, read_at
      ) values (
        'topup_completed',
        v_recipient_user_id,
        new.tenant_id,
        null,
        jsonb_build_object(
          'topup_id', new.id,
          'author', new.author,
          'approved_at', now(),
          'amount', v_amount,
          'currency', v_currency,
          'account_name', v_account_name
        ),
        false,
        null
      );
    end if;
    return new;
  end;
  $fn$;

  -- Postgres geeft EXECUTE aan PUBLIC op elke nieuwe functie, en PUBLIC
  -- is inclusief anon. Hoort in hetzelfde blok als de create.
  revoke all on function public.notify_topup_completed() from public, anon;
  grant execute on function public.notify_topup_completed()
    to authenticated, service_role;

  insert into _plak96 values (0, 'notify_topup_completed vervangen', 'gedaan');
exception when others then
  insert into _plak96 values (0, 'notify_topup_completed vervangen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle: lees de definitie en de trigger terug ──────────────────
do $blk1$
declare
  v_has  integer;
  v_trg  integer;
  v_anon integer;
begin
  select count(*) into v_has
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'notify_topup_completed'
     and pg_get_functiondef(p.oid) ~ 'account_name';

  select count(*) into v_trg
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where p.proname = 'notify_topup_completed' and not t.tgisinternal;

  select count(*) into v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'notify_topup_completed'
     and has_function_privilege('anon', p.oid, 'execute');

  insert into _plak96 values (1, 'stand van zaken',
    'bedrag/account in de definitie: ' || v_has || '/1 | triggers die hem gebruiken: ' ||
    v_trg || ' | anon mag hem: ' || v_anon || ' (moet 0)');
exception when others then
  insert into _plak96 values (1, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── en wat de laatste melding nu draagt ──────────────────────────────
do $blk2$
declare
  v text;
begin
  select coalesce(string_agg(k, ', ' order by k), 'geen meldingen')
    into v
    from (
      select distinct k
        from public.notifications n, lateral jsonb_object_keys(n.payload) k
       where n.type = 'topup_completed'
    ) x;
  insert into _plak96 values (2, 'sleutels in bestaande meldingen',
    v || '  (bestaande regels blijven zoals ze zijn; de app leest beide vormen)');
exception when others then
  insert into _plak96 values (2, 'sleutels in bestaande meldingen',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak96 order by n;
