-- ════════════════════════════════════════════════════════════════════
--  PLAK 78 — uitbetaalgegevens die BLIJVEN staan
--
--  DE EIGENAAR (23-09): "haal die whatsapp button weg bij settings, hij
--  moet gewoon hier kunnen opslaan als standaard voor new requests."
--
--  WAT ER STOND. De kaart Payout details op Settings hield zes velden —
--  inclusief een IBAN — in gewone useState, en de enige knop eronder
--  opende WhatsApp met de getypte tekst erin. Er werd niets bewaard. Een
--  herlaadbeurt gooide alles weg, en de dialoog onder Wallet vroeg het
--  daarna nog een keer.
--
--  WAT ER NODIG IS. Eén plek waar die gegevens staan, zodat de dialoog
--  ze voorinvult bij elke nieuwe aanvraag. Dat is één kolom op de eigen
--  rij van de klant.
--
--  WAAROM JSONB EN NIET ZES KOLOMMEN. Het is precies de vorm die
--  affiliate_payouts.details al draagt, en de uitbetaaldialoog leest ze
--  daar al uit. Eén vorm, twee plekken, geen vertaling ertussen.
--
--  WIE MAG EROP SCHRIJVEN. Alleen de eigenaar van de rij, en alleen deze
--  ene kolom. Een adverteerder mag zijn eigen bankgegevens zetten; hij
--  mag met datzelfde recht niet aan zijn commissietarief of aan
--  startup_fee komen. De wachter hieronder kijkt daarom naar WELKE
--  kolommen veranderen, niet alleen naar wie er schrijft.
--
--  EN BANKGEGEVENS ZIJN PERSOONSGEGEVENS. De kolom staat NIET in de
--  klantenlijst die admins standaard lezen; hij wordt alleen opgehaald
--  door de klant zelf en door de uitbetaalwachtrij die hem nodig heeft
--  om geld over te maken.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p78;
create temp table _p78(nr int, wat text, uitkomst text);

-- ── A. DE KOLOM ──────────────────────────────────────────────────────
do $blk0$
begin
  alter table public.advertisers
    add column if not exists payout_details jsonb;
  insert into _p78 values (1, 'waar de gegevens staan',
    'advertisers.payout_details toegevoegd (jsonb, dezelfde vorm als affiliate_payouts.details)');
exception when others then
  insert into _p78 values (1, 'waar de gegevens staan', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. DE KLANT MAG ZIJN EIGEN BANKGEGEVENS ZETTEN, MEER NIET ────────
--  advertisers heeft al a0_guard_advertisers_session_write met een
--  kolomlijst voor admins. Deze wachter staat ernaast en gaat over de
--  KLANT die zijn eigen rij bijwerkt: precies één kolom, en alleen als
--  het echt zijn eigen rij is.
create or replace function public._guard_advertiser_self_payout_details()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $blk1$
declare
  v_uid  uuid := auth.uid();
  v_self boolean;
  v_new  jsonb := to_jsonb(new);
  v_old  jsonb := to_jsonb(old);
  v_col  text;
begin
  -- Alleen sessies. Een definer-functie of de service-sleutel draait
  -- hier niet doorheen (current_user is dan niet 'authenticated'), en
  -- die hebben hun eigen poorten.
  if current_user <> 'authenticated' then
    return new;
  end if;

  v_self := (old.user_id is not null and old.user_id = v_uid);
  if not v_self then
    -- Niet zijn eigen rij: deze wachter zegt er niets over, de andere
    -- wachters en RLS doen hun werk.
    return new;
  end if;

  -- Zijn eigen rij. Dan mag er PRECIES één kolom veranderen.
  for v_col in select key from jsonb_each_text(v_new) loop
    if v_new -> v_col is distinct from v_old -> v_col
       and v_col not in ('payout_details', 'updated_at') then
      raise exception 'Je kunt hier alleen je uitbetaalgegevens wijzigen (% is van ons).', v_col
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$blk1$;

do $blk2$
begin
  execute 'revoke all on function public._guard_advertiser_self_payout_details() from public, anon';
  execute 'grant execute on function public._guard_advertiser_self_payout_details() to authenticated, service_role';
  execute 'drop trigger if exists a2_guard_advertiser_self_payout_details on public.advertisers';
  execute 'create trigger a2_guard_advertiser_self_payout_details
             before update on public.advertisers
             for each row execute function public._guard_advertiser_self_payout_details()';
  insert into _p78 values (2, 'wat de klant zelf mag wijzigen',
    'alleen payout_details op zijn eigen rij — elke andere kolom wordt geweigerd met de naam erbij');
exception when others then
  insert into _p78 values (2, 'wat de klant zelf mag wijzigen', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── C. EN HIJ MAG HEM SCHRIJVEN ──────────────────────────────────────
--  advertisers verleent `authenticated` vandaag geen UPDATE (elke
--  mutatie loopt via een server action of een RPC). Voor deze ene kolom
--  is dat ook zo: de server action schrijft hem, met een eigenaarscheck.
--  Dit blok controleert alleen dat het zo IS en zegt het hardop.
do $blk3$
declare v_txt text;
begin
  select case when has_column_privilege('authenticated', 'public.advertisers', 'payout_details', 'UPDATE')
              then 'LET OP: authenticated mag deze kolom rechtstreeks schrijven'
              else 'goed: alleen via de server action, niet rechtstreeks uit de browser' end
    into v_txt;
  insert into _p78 values (3, 'wie schrijft hem', v_txt);
exception when others then
  insert into _p78 values (3, 'wie schrijft hem', 'niet te lezen: ' || sqlerrm);
end
$blk3$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk4$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(c.relname || '.' || a.attname, ' · '), 'niet gevonden')
      into v_txt
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'advertisers'
       and a.attname = 'payout_details' and a.attnum > 0 and not a.attisdropped;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p78 values (4, 'de kolom bestaat', v_txt);

  begin
    select coalesce(string_agg(t.tgname, ' · ' order by t.tgname), 'geen')
      into v_txt
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'advertisers' and not t.tgisinternal;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p78 values (5, 'wat er op advertisers vuurt', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' klanten hebben al uitbetaalgegevens bewaard'
      into v_txt
      from public.advertisers
     where payout_details is not null and payout_details <> '{}'::jsonb;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p78 values (6, 'hoeveel er al staan', v_txt);
end
$blk4$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p78 order by nr;
