-- ════════════════════════════════════════════════════════════════════
-- PLAK 205 -- een kortere betaalreferentie: 0031-482913 i.p.v. 0031-0306369451
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 03-10: "references tweede gedeelte is erg lang, kun je
-- niet korter houden, is easier voor klanten".
--
-- Het tweede deel was 10 cijfers (6 van de klok + 4 willekeurig). Nu 6
-- cijfers (100000-999999), en UNIEK: wallet_topups.reference_no heeft een
-- unieke index over ALLE top-ups, dus een botsing zou een top-up laten
-- mislukken. De generator kijkt daarom in wallet_topups EN wallets of het
-- nummer al bestaat, en trekt opnieuw.
--
-- EEN plek: een BEFORE-trigger op wallets. Vijf functies maken een
-- referentie (aanmaken, roteren na een top-up, de aanmeld-route); in
-- plaats van in elk ervan te snijden, zet deze trigger elk NIEUW nummer
-- van meer dan 6 tekens om naar een kort, uniek nummer. Alleen bij een
-- WIJZIGING: wat een klant nu op zijn scherm heeft, blijft geldig tot zijn
-- volgende top-up. Oude 10-cijferige referenties blijven gewoon matchen
-- (lib/payment-reference.ts neemt het deel na het streepje, 4+ cijfers).
--
-- Twee keer plakken kan.

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
      v_ref := floor(random() * 900000 + 100000)::bigint;   -- 6 cijfers, nooit een voorloopnul
      exit when not exists (select 1 from public.wallet_topups t where t.reference_no = v_ref::text)
            and not exists (select 1 from public.wallets w where w.reference_no = v_ref::text);
      if v_tries >= 25 then
        -- 25 keer raak: de ruimte raakt vol. Dan een cijfer meer i.p.v. falen.
        v_ref := floor(random() * 9000000 + 1000000)::bigint;
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
       and length(new.reference_no) > 6
       and (tg_op = 'INSERT' or new.reference_no is distinct from old.reference_no) then
      new.reference_no := public.generate_wallet_reference_no()::text;
    end if;
    return new;
  end;
  $fn$;
  revoke all on function public._wallet_reference_short() from public, anon, authenticated;

  drop trigger if exists trg_wallet_reference_short on public.wallets;
  create trigger trg_wallet_reference_short
    before insert or update of reference_no on public.wallets
    for each row execute function public._wallet_reference_short();
end;
$blk0$;

-- ── RAPPORT ──────────────────────────────────────────────────────────
select
  exists (select 1 from pg_trigger where tgname = 'trg_wallet_reference_short') as trigger_moet_true,
  (select max(length(public.generate_wallet_reference_no()::text)) from generate_series(1, 20)) as nieuwe_lengte_moet_6,
  has_function_privilege('anon', 'public.generate_wallet_reference_no()', 'execute') as anon_moet_false;
