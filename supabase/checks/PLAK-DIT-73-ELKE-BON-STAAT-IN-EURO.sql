-- ════════════════════════════════════════════════════════════════════
--  PLAK 73 — elke bon van een storting staat in euro's, wat er ook
--             gecrediteerd is
--
--  NAGEMETEN OP LIVE:
--
--      select type, currency, count(*) from invoices group by 1,2;
--      ad_account_topup | (null) | 5
--      wallet_topup     | (null) | 3
--
--  Alle acht. Geen enkele bon die deze reis ooit heeft geproduceerd
--  draagt een valuta.
--
--  WAT ER GEBEURT. Twee triggers schrijven die bon als een admin op
--  Verify drukt: create_invoice_for_wallet_topup en
--  create_invoice_on_topup_completed. Allebei zetten de valuta netjes IN
--  de items-jsonb — en allebei laten de KOLOM invoices.currency leeg.
--  En invoiceCurrencyCode() (lib/pure-invoice-currency.ts) negeert
--  items[0] met opzet en geeft "EUR" terug bij NULL, omdat dat is wat
--  invoice_pay_from_wallet doet: upper(coalesce(v_inv.currency, 'EUR')).
--
--  Dus: een admin verifieert de openstaande storting van USD 100.
--  usd_balance gaat met 100,00 omhoog, wat klopt. De bon zegt total
--  100,00, currency NULL, items[0].currency 'USD'. En de facturenlijst
--  van de klant, de rij op /invoices en de twee bevestigingsvensters
--  printen alle vier € 100,00 voor een creditering van $ 100. Tot nu toe
--  waren alle acht toevallig euro's.
--
--  EN EEN BEDRAG DOOR EEN FLOAT. Allebei de triggers doen
--  v_amount::real voordat ze in numeric(14,2) schrijven. real is float4:
--  zeven significante cijfers. Een storting van EUR 131.072,55 wordt
--  131072,54 — één cent minder dan er gecrediteerd is, op de bon die de
--  klant bewaart. Plak 17 heeft precies dat weggehaald bij de
--  abonnementstrigger en deze twee overgeslagen.
--
--  WELKE VALUTA HOORT ERBIJ. Bij een wallet-storting: die van de
--  storting. Bij een ad-account-storting hangt het ervan af wie de rij
--  heeft ingediend — topup_usd is de scheidslijn die de hele app
--  gebruikt (lib/pure-topup-landed.ts): staat hij gevuld, dan is
--  topup_amount in `currency`; staat hij leeg, dan is het een adminrij
--  en zijn de kolommen dollars.
--
--  Onderaan staat de backfill voor de acht bonnen die er al zijn.
--
--  Plak alles in één keer. Onderaan komt ÉÉN tabel.
-- ════════════════════════════════════════════════════════════════════

drop table if exists _p73;
create temp table _p73(nr int, wat text, uitkomst text);

-- ── A. DE BON VAN EEN WALLET-STORTING ────────────────────────────────
do $blk0$
begin
  execute $fn$
    create or replace function public.create_invoice_for_wallet_topup()
    returns trigger
    language plpgsql
    as $body$
    declare
      v_tenant_id  uuid;
      v_company_id uuid;
      v_amount     numeric;
      v_currency   varchar;
    begin
      v_amount   := coalesce(NEW.amount, 0);
      v_currency := upper(coalesce(NEW.currency, 'EUR'));

      select a.tenant_id into v_tenant_id
        from public.advertisers a where a.id = NEW.advertiser_id;
      select c.id into v_company_id
        from public.companies c where c.advertiser_id = NEW.advertiser_id limit 1;

      insert into public.invoices (
        tenant_id, company_id, items, sub_total, total, currency,
        advertiser_id, type, status, paid_at
      ) values (
        v_tenant_id, v_company_id,
        jsonb_build_array(jsonb_build_object(
          'name', 'Prepaid Service Balance',
          'quantity', v_amount, 'rate', 1, 'tax', 0,
          'amount', v_amount, 'currency', v_currency,
          'wallet_topup_reference_no', NEW.reference_no,
          'wallet_topup_id', NEW.id)),
        -- round(), niet ::real. real is float4 en gooit centen weg op een
        -- bedrag dat de klant bewaart.
        round(v_amount, 2), round(v_amount, 2),
        -- DE KOLOM, niet alleen de jsonb. invoiceCurrencyCode negeert
        -- items[0] met opzet, omdat invoice_pay_from_wallet dat ook doet.
        v_currency,
        NEW.advertiser_id, 'wallet_topup', 'paid', now()
      );
      return NEW;
    end
    $body$;
  $fn$;
  insert into _p73 values (1, 'de bon van een wallet-storting',
    'draagt nu zijn eigen valuta, en het bedrag gaat niet meer door een float');
exception when others then
  insert into _p73 values (1, 'de bon van een wallet-storting', 'MISLUKT: ' || sqlerrm);
end
$blk0$;

-- ── B. DE BON VAN EEN AD-ACCOUNT-STORTING ────────────────────────────
do $blk1$
begin
  execute $fn$
    create or replace function public.create_invoice_on_topup_completed()
    returns trigger
    language plpgsql
    as $body$
    declare
      v_tenant_id  uuid;
      v_company_id uuid;
      v_amount     numeric;
      v_currency   varchar;
    begin
      if OLD.status is distinct from 'pending'
         or NEW.status is distinct from 'completed' then
        return NEW;
      end if;

      v_amount := coalesce(NEW.topup_amount, 0);
      -- topup_amount is USD op een ADMIN-rij en de betaalvaluta op een rij
      -- die de klant zelf indiende. topup_usd is de scheidslijn die de
      -- hele app gebruikt (lib/pure-topup-landed.ts).
      v_currency := case
                      when NEW.topup_usd is not null
                        then upper(coalesce(NEW.currency, 'EUR'))
                      else 'USD'
                    end;

      select a.tenant_id into v_tenant_id
        from public.advertisers a where a.id = NEW.advertiser_id;
      select c.id into v_company_id
        from public.companies c where c.advertiser_id = NEW.advertiser_id limit 1;

      insert into public.invoices (
        tenant_id, company_id, items, sub_total, total, currency,
        advertiser_id, type, status, paid_at
      ) values (
        v_tenant_id, v_company_id,
        jsonb_build_array(jsonb_build_object(
          'name', 'Advertising Service Credit',
          'quantity', v_amount, 'rate', 1, 'tax', 0,
          'amount', v_amount, 'currency', v_currency,
          'topup_id', NEW.id)),
        round(v_amount, 2), round(v_amount, 2), v_currency,
        NEW.advertiser_id, 'ad_account_topup', 'paid', now()
      );
      return NEW;
    end
    $body$;
  $fn$;
  insert into _p73 values (2, 'de bon van een ad-account-storting',
    'draagt nu zijn eigen valuta, bepaald op topup_usd, en geen float meer');
exception when others then
  insert into _p73 values (2, 'de bon van een ad-account-storting', 'MISLUKT: ' || sqlerrm);
end
$blk1$;

-- ── C. EN DE ACHT BONNEN DIE ER AL STAAN ─────────────────────────────
do $blk2$
declare v_n int := 0;
begin
  update public.invoices i
     set currency = upper(coalesce(i.items -> 0 ->> 'currency', 'EUR'))
   where i.currency is null
     and i.type in ('wallet_topup', 'ad_account_topup');
  get diagnostics v_n = row_count;
  insert into _p73 values (3, 'de bonnen die er al stonden',
    v_n::text || ' bijgewerkt uit hun eigen items-regel');
exception when others then
  insert into _p73 values (3, 'de bonnen die er al stonden', 'MISLUKT: ' || sqlerrm);
end
$blk2$;

-- ── D. WAT ER NU STAAT (alleen lezen) ────────────────────────────────
do $blk3$
declare v_txt text;
begin
  begin
    select coalesce(string_agg(t || ': ' || c || ' x' || n::text, ' · ' order by t, c), 'geen')
      into v_txt
      from (
        select i.type as t, coalesce(i.currency, '(leeg)') as c, count(*) as n
          from public.invoices i
         where i.type in ('wallet_topup', 'ad_account_topup')
         group by 1, 2
      ) x;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p73 values (4, 'valuta per soort bon', v_txt);

  begin
    select coalesce(count(*)::text, '0') || ' bonnen zonder valuta over de hele tabel'
      into v_txt
      from public.invoices where currency is null;
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p73 values (5, 'nog leeg', v_txt);

  begin
    select case when count(*) = 0 then 'geen'
                else count(*)::text || ' bonnen waarvan het totaal afwijkt van hun eigen regel' end
      into v_txt
      from public.invoices i
     where i.type in ('wallet_topup', 'ad_account_topup')
       and round(coalesce((i.items -> 0 ->> 'amount')::numeric, 0), 2)
           <> round(coalesce(i.total, 0), 2);
  exception when others then v_txt := 'niet te lezen: ' || sqlerrm;
  end;
  insert into _p73 values (6, 'heeft de float al centen gekost', v_txt);
end
$blk3$;

select nr as "#", wat as "wat", uitkomst as "uitkomst" from _p73 order by nr;
