-- ════════════════════════════════════════════════════════════════════
-- PLAK 92 — de klant mag zijn eigen correcties niet zien, en "betaald"
--            wist niet meer waaruit
-- ════════════════════════════════════════════════════════════════════
--
-- GELOPEN OP PRODUCTIE VANDAAG, als PSM0005 in de klantbrowser.
--
-- 1. WAT ER MIST IN HET AFSCHRIFT
--
-- Tel elke regel op Wallet activity op: EUR 75,00. Het saldo erboven
-- zegt EUR 70,00. De audit op `wallets` laat zien waar het zit:
--
--   23-09 11:19  65,00 -> 75,00   correctie ADJ-783784, +10,00, goedgekeurd
--   23-09 11:25  75,00 -> 70,00   terugbetaling RF-951740, -5,00, goedgekeurd
--
-- Allebei echt, allebei goedgekeurd, en geen van beide heeft ergens op
-- een klantscherm een regel. De code haalt ze wél op -- maar:
--
--   wallet_adjustments  adjustments_admin_read  SELECT  _is_admin_of(tenant_id)
--   wallet_refunds      refunds_admin_read      SELECT  _is_admin_of(tenant_id)
--
-- Alleen beheerders. Dus die lees mislukt bij ELKE klant, en het
-- afschrift is stil korter dan de werkelijkheid. Deze plak geeft de
-- eigenaar van de rij leesrecht op zijn eigen correcties, precies zoals
-- ad_account_withdrawals, advertiser_perks en advertiser_plans dat al
-- doen. Schrijven blijft waar het was: niemand schrijft hier vanaf de
-- klant.
--
-- 2. "BETAALD" WIST NIET MEER WAARUIT
--
-- Plak 88 gaf `invoices` de kolom `paid_from`, en de RPC vult hem sinds
-- vanmiddag. Alles van daarvóór staat op NULL, en het scherm las NULL
-- als "niet uit de portemonnee". Dat was een bewering, geen aflezing:
--
--   factuur 121  paid_at 18-09 16:02:15   wallet 5 -> 0,00     op dezelfde seconde
--   factuur 124  paid_at 21-09 07:40:44   wallet 200 -> 195    op dezelfde seconde
--
-- Die twee kwamen wel degelijk uit de portemonnee, en de klant las dat
-- ze dat niet deden. Factuur 130 van PSM0007 is het omgekeerde: met de
-- hand op betaald gezet en geen cent bewogen.
--
-- Het staat allemaal in `audit_events`. Deze plak leidt het daaruit af:
-- bewoog het saldo van deze klant op dezelfde seconde met precies dit
-- bedrag naar beneden, dan 'wallet'; anders 'other'. Geen gok -- een
-- aflezing, en het rapport onderaan laat per factuur zien wat eruit kwam.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak92 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak92;

-- ── 1. eigen correcties lezen ────────────────────────────────────────
do $blk0$
begin
  drop policy if exists adjustments_admin_read on public.wallet_adjustments;
  create policy adjustments_admin_read on public.wallet_adjustments
    for select to authenticated
    using (
      exists (
        select 1 from public.advertisers a
         where a.id = wallet_adjustments.advertiser_id
           and a.user_id = auth.uid()
      )
      or public._is_admin_of(tenant_id)
    );
  insert into _plak92 values (0, 'wallet_adjustments leesbaar voor de eigenaar', 'geplaatst');
exception when others then
  insert into _plak92 values (0, 'wallet_adjustments leesbaar voor de eigenaar',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

do $blk1$
begin
  drop policy if exists refunds_admin_read on public.wallet_refunds;
  create policy refunds_admin_read on public.wallet_refunds
    for select to authenticated
    using (
      exists (
        select 1 from public.advertisers a
         where a.id = wallet_refunds.advertiser_id
           and a.user_id = auth.uid()
      )
      or public._is_admin_of(tenant_id)
    );
  insert into _plak92 values (1, 'wallet_refunds leesbaar voor de eigenaar', 'geplaatst');
exception when others then
  insert into _plak92 values (1, 'wallet_refunds leesbaar voor de eigenaar',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 2. hoe is elke betaalde factuur betaald ──────────────────────────
do $blk2$
declare
  v_n integer;
begin
  with beslist as (
    update public.invoices i
       set paid_from = case when exists (
             select 1
               from public.audit_events ae
               join public.wallets w on w.id::text = ae.row_id
              where ae.table_name = 'wallets'
                and w.advertiser_id = i.advertiser_id
                and ae.occurred_at between i.paid_at - interval '3 seconds'
                                       and i.paid_at + interval '3 seconds'
                and (
                  (upper(i.currency) = 'EUR'
                   and (ae.before_data ->> 'eur_balance')::numeric
                     - (ae.after_data  ->> 'eur_balance')::numeric = i.total)
                  or
                  (upper(i.currency) = 'USD'
                   and (ae.before_data ->> 'usd_balance')::numeric
                     - (ae.after_data  ->> 'usd_balance')::numeric = i.total)
                )
           ) then 'wallet' else 'other' end
     where i.status = 'paid'
       and i.paid_from is null
       and i.paid_at is not null
    returning 1
  )
  select count(*) into v_n from beslist;

  insert into _plak92 values (2, 'facturen ingevuld', v_n || ' stuks');
exception when others then
  insert into _plak92 values (2, 'facturen ingevuld',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle: lees de werkelijkheid terug ────────────────────────────
do $blk3$
declare
  v_pol integer;
  v_w   integer;
  v_o   integer;
  v_nul integer;
begin
  select count(*) into v_pol
    from pg_policies
   where tablename in ('wallet_adjustments', 'wallet_refunds')
     and cmd = 'SELECT'
     and qual like '%advertisers%';

  select count(*) filter (where paid_from = 'wallet'),
         count(*) filter (where paid_from = 'other'),
         count(*) filter (where paid_from is null)
    into v_w, v_o, v_nul
    from public.invoices where status = 'paid';

  insert into _plak92 values (3, 'stand van zaken',
    'eigen-leesrecht op ' || v_pol || '/2 tabellen | betaalde facturen: ' ||
    v_w || ' uit de portemonnee, ' || v_o || ' daarbuiten, ' ||
    v_nul || ' nog onbekend');
exception when others then
  insert into _plak92 values (3, 'stand van zaken',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ── en per abonnementsfactuur wat eruit kwam ─────────────────────────
do $blk4$
declare
  v text;
begin
  select coalesce(string_agg(x.r, ' | ' order by x.r), 'geen')
    into v
    from (
      select a.tenant_client_code || '/' || i.number || ' ' ||
             i.currency || ' ' || to_char(i.total, 'FM999990.00') || ' -> ' ||
             coalesce(i.paid_from, 'onbekend') as r
        from public.invoices i
        join public.advertisers a on a.id = i.advertiser_id
       where i.status = 'paid' and i.type = 'subscription'
    ) x;
  insert into _plak92 values (4, 'abonnementsfacturen', v);
exception when others then
  insert into _plak92 values (4, 'abonnementsfacturen', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk4$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak92 order by n;
