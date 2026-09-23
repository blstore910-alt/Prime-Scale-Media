-- ════════════════════════════════════════════════════════════════════
--  PLAK 65 — DST: wekelijks doorbelasten, met de hand
--
--  WAT DIT IS. RockAds schrijft DST (digital services tax) van ONS saldo
--  af. Het is dus eerst onze kost, en die hoort per klant doorbelast te
--  worden — wekelijks, want zo komt hij binnen. Vandaag gebeurt dat
--  nergens: er is alleen een tabel met tarieven per land en een knop die
--  ze laat zien.
--
--  Dit blok zet het fundament neer voor de HANDMATIGE weg: een admin
--  vult per klant een periode en het spend per land in, de app rekent de
--  DST uit, zet hem apart als "gereserveerd", en zet hem daarna om in
--  een factuur die uit de wallet betaald wordt — net als een gewone
--  maandfactuur. De API-weg (als RockAds het per account teruggeeft) kan
--  later dezelfde tabel vullen.
--
--  WAT ERIN KOMT
--    A  de tabel dst_charges, met het bedrag, de grondslag, het land,
--       het tarief en de periode — allemaal zichtbaar voor de klant zelf,
--       want het is zijn eigen kost. Wat er NIET in staat is wie onze
--       leverancier is; die naam komt nergens voor.
--    B  RLS: een admin van de tenant leest alles, een adverteerder
--       alleen zijn eigen regels
--    C  op tabelniveau dicht voor een sessie — schrijven gaat via de
--       functies hieronder, nooit rechtstreeks
--    D  twee functies: één om een regel vast te leggen (gereserveerd),
--       één om een of meer regels om te zetten in een factuur
--    E  audit en updated_at, zoals elke geldtabel hier
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p65;
create temp table _p65(nr int, wat text, uitkomst text);

-- ── A. DE TABEL ──────────────────────────────────────────────────────
do $blk0$
begin
  create table if not exists public.dst_charges (
    id            uuid primary key default gen_random_uuid(),
    tenant_id     uuid not null references public.tenants(id) on delete cascade,
    advertiser_id uuid not null references public.advertisers(id) on delete cascade,
    account_id    uuid references public.ad_accounts(id) on delete set null,
    period_start  date not null,
    period_end    date not null,
    country_code  text not null,
    country_name  text,
    rate_pct      numeric(6,3) not null,
    base_amount   numeric(14,2) not null,
    currency      text not null default 'EUR',
    dst_amount    numeric(14,2) not null,
    status        text not null default 'reserved',
    invoice_id    uuid references public.invoices(id) on delete set null,
    note          text,
    created_by    uuid,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint dst_charges_status_chk
      check (status in ('reserved', 'charged', 'cancelled')),
    constraint dst_charges_period_chk check (period_end >= period_start),
    constraint dst_charges_amounts_chk
      check (base_amount >= 0 and dst_amount >= 0 and rate_pct >= 0)
  );

  create index if not exists dst_charges_tenant_status_idx
    on public.dst_charges (tenant_id, status, period_end desc);
  create index if not exists dst_charges_advertiser_idx
    on public.dst_charges (advertiser_id, period_end desc);

  insert into _p65 values (1, 'tabel', 'dst_charges staat er, met twee indexen');
exception when others then
  insert into _p65 values (1, 'tabel', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. WIE MAG WAT ZIEN ──────────────────────────────────────────────
do $blk1$
begin
  execute 'alter table public.dst_charges enable row level security';

  execute 'drop policy if exists "dst admins all" on public.dst_charges';
  execute 'create policy "dst admins all" on public.dst_charges
             for all to authenticated
             using (public._is_admin_of(tenant_id))
             with check (public._is_admin_of(tenant_id))';

  -- De klant ziet zijn eigen regels: het is zijn eigen kost, en hij
  -- hoort te kunnen narekenen waar het vandaan komt.
  execute 'drop policy if exists "dst advertiser reads own" on public.dst_charges';
  execute 'create policy "dst advertiser reads own" on public.dst_charges
             for select to authenticated
             using (exists (select 1
                              from public.advertisers a
                              join public.user_profiles up on up.id = a.profile_id
                             where a.id = dst_charges.advertiser_id
                               and up.user_id = auth.uid()))';

  insert into _p65 values (2, 'zichtbaarheid',
    'admin van de tenant ziet alles; een adverteerder alleen zijn eigen regels');
exception when others then
  insert into _p65 values (2, 'zichtbaarheid', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── C. GEEN RECHTSTREEKSE SCHRIJFACTIES ──────────────────────────────
do $blk2$
begin
  execute 'revoke insert, update, delete on public.dst_charges from authenticated, anon';
  execute 'grant select on public.dst_charges to authenticated';
  insert into _p65 values (3, 'schrijven',
    'alleen via de functies hieronder — een sessie kan de tabel niet rechtstreeks schrijven');
exception when others then
  insert into _p65 values (3, 'schrijven', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── D1. EEN REGEL VASTLEGGEN ─────────────────────────────────────────
create or replace function public.dst_charge_record(
  p_advertiser_id uuid,
  p_period_start  date,
  p_period_end    date,
  p_country_code  text,
  p_base_amount   numeric,
  p_rate_pct      numeric default null,
  p_currency      text default 'EUR',
  p_account_id    uuid default null,
  p_note          text default null
)
returns public.dst_charges
language plpgsql
security definer
set search_path to 'public'
as $blk3$
declare
  v_admin   record;
  v_rate    numeric;
  v_country text;
  v_row     public.dst_charges%rowtype;
begin
  select * into v_admin from public._require_profile('admin');

  if not exists (select 1 from public.advertisers a
                  where a.id = p_advertiser_id and a.tenant_id = v_admin.tenant_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_period_end < p_period_start then
    raise exception 'De periode loopt achteruit.' using errcode = '22023';
  end if;
  if coalesce(p_base_amount, 0) <= 0 then
    raise exception 'Vul het spend over deze periode in.' using errcode = '22023';
  end if;

  -- Het tarief komt uit de landentabel tenzij de admin er zelf een geeft.
  select tr.rate_pct, tr.country_name into v_rate, v_country
    from public.tax_rates tr
   where tr.tenant_id = v_admin.tenant_id
     and upper(tr.country_code) = upper(btrim(p_country_code))
     and coalesce(tr.is_active, true)
   limit 1;
  v_rate := coalesce(p_rate_pct, v_rate);
  if v_rate is null then
    raise exception 'Geen tarief voor % — vul er zelf een in of zet het land in de tarieventabel.',
      upper(btrim(p_country_code)) using errcode = '22023';
  end if;

  insert into public.dst_charges
    (tenant_id, advertiser_id, account_id, period_start, period_end,
     country_code, country_name, rate_pct, base_amount, currency,
     dst_amount, status, note, created_by)
  values
    (v_admin.tenant_id, p_advertiser_id, p_account_id, p_period_start, p_period_end,
     upper(btrim(p_country_code)), v_country, v_rate, round(p_base_amount, 2),
     upper(coalesce(p_currency, 'EUR')),
     round(round(p_base_amount, 2) * v_rate / 100, 2), 'reserved',
     nullif(btrim(coalesce(p_note, '')), ''), v_admin.profile_id)
  returning * into v_row;

  return v_row;
end;
$blk3$;

-- ── D2. GERESERVEERDE REGELS OMZETTEN IN EEN FACTUUR ─────────────────
create or replace function public.dst_charge_invoice(p_ids uuid[])
returns public.invoices
language plpgsql
security definer
set search_path to 'public'
as $blk4$
declare
  v_admin    record;
  v_adv      uuid;
  v_cur      text;
  v_total    numeric := 0;
  v_items    jsonb := '[]'::jsonb;
  v_invoice  public.invoices%rowtype;
  r          record;
  v_n        int := 0;
begin
  select * into v_admin from public._require_profile('admin');

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'Geen regels gekozen.' using errcode = '22023';
  end if;

  for r in
    select * from public.dst_charges
     where id = any(p_ids)
       and tenant_id = v_admin.tenant_id
       and status = 'reserved'
     order by period_start, country_code
     for update
  loop
    if v_adv is null then
      v_adv := r.advertiser_id;
      v_cur := r.currency;
    elsif r.advertiser_id <> v_adv then
      raise exception 'Alle regels op één factuur moeten van dezelfde klant zijn.'
        using errcode = '22023';
    elsif r.currency <> v_cur then
      raise exception 'Alle regels op één factuur moeten in dezelfde valuta staan.'
        using errcode = '22023';
    end if;

    v_total := v_total + r.dst_amount;
    v_n := v_n + 1;
    v_items := v_items || jsonb_build_object(
      'description', 'Digital services tax ' || coalesce(r.country_name, r.country_code) ||
                     ' (' || to_char(r.period_start, 'DD-MM') || ' t/m ' ||
                     to_char(r.period_end, 'DD-MM-YYYY') || ')',
      'base', r.base_amount,
      'rate_pct', r.rate_pct,
      'amount', r.dst_amount
    );
  end loop;

  if v_n = 0 then
    raise exception 'Niets te factureren — die regels staan niet meer op gereserveerd.'
      using errcode = '22023';
  end if;

  insert into public.invoices
    (tenant_id, advertiser_id, type, status, total, currency, items, due_date)
  values
    (v_admin.tenant_id, v_adv, 'dst', 'pending', round(v_total, 2), v_cur, v_items,
     (now() + interval '7 days')::date)
  returning * into v_invoice;

  update public.dst_charges
     set status = 'charged', invoice_id = v_invoice.id, updated_at = now()
   where id = any(p_ids)
     and tenant_id = v_admin.tenant_id
     and status = 'reserved';

  return v_invoice;
end;
$blk4$;

do $blk5$
begin
  execute 'revoke all on function public.dst_charge_record(uuid,date,date,text,numeric,numeric,text,uuid,text) from public, anon';
  execute 'grant execute on function public.dst_charge_record(uuid,date,date,text,numeric,numeric,text,uuid,text) to authenticated, service_role';
  execute 'revoke all on function public.dst_charge_invoice(uuid[]) from public, anon';
  execute 'grant execute on function public.dst_charge_invoice(uuid[]) to authenticated, service_role';
  insert into _p65 values (4, 'functies',
    'dst_charge_record (vastleggen) en dst_charge_invoice (factureren) — alleen voor een ingelogde admin');
exception when others then
  insert into _p65 values (4, 'functies', 'MISLUKT: ' || sqlerrm);
end
$blk5$;

-- ── E. AUDIT EN UPDATED_AT ───────────────────────────────────────────
do $blk6$
begin
  begin
    execute 'drop trigger if exists trg_touch_dst_charges on public.dst_charges';
    execute 'create trigger trg_touch_dst_charges before update on public.dst_charges
               for each row execute function public._touch_updated_at()';
  exception when others then null;
  end;
  begin
    execute 'drop trigger if exists trg_audit_dst_charges on public.dst_charges';
    execute 'create trigger trg_audit_dst_charges after insert or update or delete on public.dst_charges
               for each row execute function public._audit_row_change()';
  exception when others then null;
  end;
  insert into _p65 values (5, 'audit en updated_at',
    (select coalesce(string_agg(t.tgname, ' · ' order by t.tgname), 'GEEN')
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where c.relname = 'dst_charges' and not t.tgisinternal));
exception when others then
  insert into _p65 values (5, 'audit en updated_at', 'MISLUKT: ' || sqlerrm);
end
$blk6$;

-- ── F. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk7$
declare v_txt text;
begin
  begin
    select 'insert=' || has_table_privilege('authenticated', 'public.dst_charges', 'INSERT')::text ||
           ' · update=' || has_table_privilege('authenticated', 'public.dst_charges', 'UPDATE')::text ||
           ' · select=' || has_table_privilege('authenticated', 'public.dst_charges', 'SELECT')::text
      into v_txt;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p65 values (6, 'wat een sessie mag', v_txt);

  begin
    select coalesce(string_agg(tr.country_code || ' ' || tr.rate_pct::text || '%', ' · '
                               order by tr.sort_order, tr.country_code), 'geen tarieven')
      into v_txt
      from public.tax_rates tr
      join public.tenants t on t.id = tr.tenant_id
     where t.name = 'Prime Scale Media' and coalesce(tr.is_active, true);
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p65 values (7, 'tarieven die klaarstaan', v_txt);
end
$blk7$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p65 order by nr;
