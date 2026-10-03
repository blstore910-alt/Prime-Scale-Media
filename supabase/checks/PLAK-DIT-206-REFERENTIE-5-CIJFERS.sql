-- ════════════════════════════════════════════════════════════════════
-- PLAK 206 -- de betaalreferentie nog korter: 0031-48291 (5 cijfers)
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 03-10, na plak 205 (6 cijfers): "kan ref niet nog korter?"
--
-- 5 cijfers is het kortste dat UNIEK blijft over alle klanten heen zonder
-- de Wise-matching aan te raken (die matcht op het deel na het streepje,
-- 4+ cijfers, over alle klanten). 90.000 nummers; raakt het vol, dan
-- trekt de generator na 25 pogingen er een van 7 cijfers -- hij faalt
-- nooit. Korter (4) kan alleen per klant, en dan moet de matching ook de
-- klantcode gebruiken: niet voor de livegang.
--
-- Zelfde opbouw als 205; alleen de lengte. Twee keer plakken kan.

do $blk0$
begin
  create or replace function public.generate_wallet_reference_no()
  returns bigint
  language plpgsql
  set search_path = public, pg_temp
  as $fn$
  declare
    v_ref   bigint;
    v_tries int := 0;
  begin
    loop
      v_tries := v_tries + 1;
      v_ref := floor(random() * 90000 + 10000)::bigint;   -- 5 cijfers, nooit een voorloopnul
      exit when not exists (select 1 from public.wallet_topups t where t.reference_no = v_ref::text)
            and not exists (select 1 from public.wallets w where w.reference_no = v_ref::text);
      if v_tries >= 25 then
        v_ref := floor(random() * 9000000 + 1000000)::bigint;   -- vol: 7 cijfers i.p.v. falen
        exit;
      end if;
    end loop;
    return v_ref;
  end;
  $fn$;
  revoke all on function public.generate_wallet_reference_no() from public, anon;
  grant execute on function public.generate_wallet_reference_no() to authenticated, service_role;

  create or replace function public._wallet_reference_short()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
  as $fn$
  begin
    if new.reference_no is not null
       and length(new.reference_no) > 5
       and (tg_op = 'INSERT' or new.reference_no is distinct from old.reference_no) then
      new.reference_no := public.generate_wallet_reference_no()::text;
    end if;
    return new;
  end;
  $fn$;
  revoke all on function public._wallet_reference_short() from public, anon, authenticated;
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  exists (select 1 from pg_trigger where tgname = 'trg_wallet_reference_short') as trigger_moet_true,
  (select max(length(public.generate_wallet_reference_no()::text)) from generate_series(1, 20)) as nieuwe_lengte_moet_5,
  has_function_privilege('anon', 'public.generate_wallet_reference_no()', 'execute') as anon_moet_false;
