-- ════════════════════════════════════════════════════════════════════
-- PLAK 182 -- een teamlid krijgt geen eigen (leeg) klantaccount
-- ════════════════════════════════════════════════════════════════════
--
-- Gelopen op productie, 01-10: psm-viewer-0110@deertees.com accepteerde
-- de viewer-uitnodiging van PSM0020. De teamregel kwam er goed in --
-- maar een halve seconde EERDER had de trigger
-- create_advertiser_on_profile_insert al een eigen adverteerder
-- aangemaakt (PSM0021, met een lege wallet). De app ziet dan een
-- profiel MET eigen adverteerder en slaat het team over: de viewer
-- keek naar zijn eigen lege account in plaats van naar PSM0020.
--
-- Twee blokken:
--
--   blk0  de trigger slaat een profiel over waarvoor een openstaande
--         TEAMuitnodiging ligt (zelfde e-mail, zelfde tenant). Het
--         profiel wordt in de aanmeldroute aangemaakt VOOR de
--         uitnodiging op accepted gaat, dus "pending" is het moment.
--   blk1  PSM0021 weg -- alleen als hij nog precies zo leeg is als nu:
--         geen saldo, geen grootboek, geen factuur, geen plan, geen
--         bedrijf. Anders doet dit blok niets en zegt het waarom.
--
-- Twee keer plakken kan.

do $blk0$
begin
  create or replace function public.create_advertiser_on_profile_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  as $fn$
  begin
    if NEW.role = 'advertiser' then
      -- Een collega die alleen meekijkt, is geen nieuwe klant: geen
      -- eigen adverteerder, geen wallet, geen klantcode (plak 182).
      if exists (
        select 1 from public.invitations i
         where lower(i.email) = lower(NEW.email)
           and i.tenant_id = NEW.tenant_id
           and i.team_advertiser_id is not null
           and i.status = 'pending'
      ) then
        return NEW;
      end if;
      insert into advertisers (user_id, tenant_id, profile_id)
      values (NEW.user_id, NEW.tenant_id, NEW.id);
    end if;
    return NEW;
  end;
  $fn$;

  revoke all on function public.create_advertiser_on_profile_insert() from public, anon;
  grant execute on function public.create_advertiser_on_profile_insert() to authenticated, service_role;
end
$blk0$;

do $blk1$
declare
  v_adv uuid;
  v_hangt text;
begin
  select a.id into v_adv
    from public.advertisers a
    join public.user_profiles p on p.user_id = a.user_id
   where a.tenant_client_code = 'PSM0021'
     and p.email = 'psm-viewer-0110@deertees.com'
   limit 1;
  if v_adv is null then
    raise notice 'PSM0021 is er al niet meer -- niets gedaan';
    return;
  end if;

  select case
    when exists (select 1 from public.wallets w where w.advertiser_id = v_adv
                  and (coalesce(w.eur_balance,0) <> 0 or coalesce(w.usd_balance,0) <> 0)) then 'saldo'
    when exists (select 1 from public.wallet_ledger l join public.wallets w on w.id = l.wallet_id
                  where w.advertiser_id = v_adv) then 'grootboek'
    when exists (select 1 from public.invoices where advertiser_id = v_adv) then 'factuur'
    when exists (select 1 from public.subscriptions where advertiser_id = v_adv) then 'plan'
    when exists (select 1 from public.companies where advertiser_id = v_adv) then 'bedrijf'
    else null end
    into v_hangt;
  if v_hangt is not null then
    raise notice 'PSM0021 heeft al een %, dus NIET verwijderd -- meld het', v_hangt;
    return;
  end if;

  -- Verwijst een andere tabel er nog naar, dan weigert Postgres. Dat mag
  -- de triggerfix in blk0 niet meenemen: dan alleen een melding.
  begin
    delete from public.wallets where advertiser_id = v_adv;
    delete from public.advertisers where id = v_adv;
  exception when foreign_key_violation then
    raise notice 'PSM0021 wordt nog ergens naar verwezen (%), NIET verwijderd -- meld het', sqlerrm;
  end;
end
$blk1$;

-- ── HET ENIGE VERSLAG ───────────────────────────────────────────────
select
  (pg_get_functiondef('public.create_advertiser_on_profile_insert()'::regprocedure)
     ~ 'team_advertiser_id')                                          as trigger_slaat_teamleden_over,
  (select count(*) from public.advertisers where tenant_client_code = 'PSM0021') as psm0021_over,
  (select count(*) from public.subject_members m
     join public.user_profiles p on p.user_id = m.user_id
    where p.email = 'psm-viewer-0110@deertees.com' and m.role = 'viewer') as viewer_lidmaatschap,
  case when (pg_get_functiondef('public.create_advertiser_on_profile_insert()'::regprocedure)
               ~ 'team_advertiser_id')
         and (select count(*) from public.advertisers where tenant_client_code = 'PSM0021') = 0
       then 'OK' else 'NIET GOED -- meld het' end                       as uitkomst;
