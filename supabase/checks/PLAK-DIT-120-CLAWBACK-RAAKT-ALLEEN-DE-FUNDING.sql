-- ════════════════════════════════════════════════════════════════════
-- PLAK 120 — een ad-accountopname vordert alleen de FUNDING terug
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 28-09: "nee, abonnementscommissie pas terug als we het
-- abonnement ook refunden. Dus abo-refund moet ook kunnen."
--
-- WAT ER MIS WAS
--
-- `_claw_back_referral_commission` telt als grondslag ALLE commissie op
-- de link op:
--
--     select ... sum(rc.amount) ...
--       from public.referral_commissions rc
--      where rc.referral_link_id = v_link_id;
--
-- en vermenigvuldigt dat met het aandeel van het geld dat terugkomt.
-- Daar zit de abonnementscommissie in, en de eenmalige bonus. Geld van
-- een ad-account terughalen draait geen van beide terug.
--
-- Gemeten op een echte rij, niet bedacht. Link
-- a573fd96-1f74-4429-bd53-b0ebeeca5512 (PSM0005 bracht PSM0007 binnen)
-- draagt drie commissies: EUR 4,85 op een funding, EUR 0,11 op een
-- tweede funding, en EUR 5,00 abonnementscommissie op factuur
-- f5dd6c28. Opname 76d4833d haalde EUR 20 van AA-PSM0007-EU-01:
--
--     round(9,96 x 20/97, 2) = EUR 2,05 teruggevorderd
--
-- waarvan **EUR 1,03 abonnementscommissie** was, op een abonnement dat
-- niemand heeft terugbetaald. De affiliate betaalde; wij niet.
--
-- En scherper: een klant met EUR 10.000 wallet-omzet, een lopend
-- abonnement en EEN funding van EUR 100 (97 erop) die die 97 terugvraagt
-- krijgt `share = 97/97 = 1,0` -- honderd procent van de LEVENSLANGE
-- commissie weg, voor 1% van wat hij heeft ingelegd.
--
-- WAT HET WORDT
--
-- Bij `p_source = 'ad_account_withdrawal'` telt alleen commissie met
-- `source = 'topup'` mee -- de fundingen, precies het geld dat
-- terugkomt. Abonnement en eenmalig blijven onaangeroerd.
--
-- DE WALLET-REFUND BLIJFT ZOALS HIJ IS. Daar heeft de eigenaar niets
-- over gezegd, en zelf besluiten wat een wallet-terugbetaling hoort te
-- raken is niet aan mij.
--
-- DE CAP BLIJFT OOK ZOALS HIJ IS. `v_stand` is grondslag min alles wat
-- ooit is teruggevorderd, en `referral_clawbacks` legt niet vast welke
-- commissiesoort een rij omkeerde -- dus die kan ik niet even smal
-- maken. Gevolg: in het ergste geval wordt er te WEINIG teruggevorderd,
-- en dat is de kant op die hier gevraagd is.
--
-- WAT HIER NIET IN ZIT: de abo-refund zelf
--
-- "Abo-refund moet ook kunnen" is een nieuw ding om te bouwen, geen
-- regel om recht te zetten. Het staat uitgeschreven in
-- docs/NEXT_SESSION_FIRST.md.
--
-- Tekstchirurgie op de huidige definitie, op [[:space:]] en op oid,
-- zodat fixes van eerdere plakken blijven staan.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak120 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak120;

do $blk0$
declare
  v_oid  oid;
  v_def  text;
  v_pat  text;
  v_rep  text;
  v_args text;
begin
  select p.oid, pg_get_function_identity_arguments(p.oid)
    into v_oid, v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = '_claw_back_referral_commission'
   limit 1;

  if v_oid is null then
    insert into _plak120 values (0, 'grondslag',
      'AFGEBROKEN: _claw_back_referral_commission bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('alleen de funding' in v_def) > 0 then
    insert into _plak120 values (0, 'grondslag', 'stond er al -- niets gedaan');
    return;
  end if;

  -- De where van de GRONDSLAG-som. De clawback-som drie regels lager
  -- leest referral_clawbacks en heeft een andere alias (cb), dus deze
  -- match is eenduidig.
  v_pat :=
    'from[[:space:]]+public\.referral_commissions[[:space:]]+rc[[:space:]]+where[[:space:]]+rc\.referral_link_id[[:space:]]*=[[:space:]]*v_link_id;';

  if not (v_def ~ v_pat) then
    insert into _plak120 values (0, 'grondslag',
      'FOUT: de grondslag-som is niet herkend -- niets gewijzigd. Stuur me pg_get_functiondef van deze functie.');
    return;
  end if;

  v_rep :=
    'from public.referral_commissions rc' || chr(10) ||
    '   where rc.referral_link_id = v_link_id' || chr(10) ||
    '     -- alleen de funding' || chr(10) ||
    '     --' || chr(10) ||
    '     -- De eigenaar, 28-09: abonnementscommissie komt pas terug als' || chr(10) ||
    '     -- wij het abonnement ook terugbetalen. Geld van een ad-account' || chr(10) ||
    '     -- terughalen draait het abonnement niet terug en de eenmalige' || chr(10) ||
    '     -- bonus evenmin, dus die horen niet in de grondslag.' || chr(10) ||
    '     --' || chr(10) ||
    '     -- Gemeten voor deze wijziging: van EUR 2,05 die op een echte' || chr(10) ||
    '     -- rij werd teruggevorderd was EUR 1,03 abonnementscommissie.' || chr(10) ||
    '     --' || chr(10) ||
    '     -- De wallet-terugbetaling blijft rekenen zoals hij rekende.' || chr(10) ||
    '     and (coalesce(p_source, '''') <> ''ad_account_withdrawal''' || chr(10) ||
    '          or coalesce(rc.source, '''') = ''topup'');';

  execute regexp_replace(v_def, v_pat, v_rep);

  -- Postgres geeft EXECUTE aan PUBLIC op een hergemaakte functie.
  execute 'revoke all on function public._claw_back_referral_commission('
       || v_args || ') from public, anon';
  execute 'grant execute on function public._claw_back_referral_commission('
       || v_args || ') to authenticated, service_role';

  insert into _plak120 values (0, 'grondslag',
    'een ad-accountopname rekent nu alleen over commissie met source = topup');
exception when others then
  insert into _plak120 values (0, 'grondslag', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── controle ────────────────────────────────────────────────────────
do $blk1$
declare
  v_ok    boolean;
  v_anon  boolean;
  v_wat   text;
begin
  select position('alleen de funding' in pg_get_functiondef(p.oid)) > 0,
         has_function_privilege('anon', p.oid, 'execute')
    into v_ok, v_anon
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_claw_back_referral_commission';

  -- Wat er vandaag al is teruggevorderd, en hoeveel daarvan over een
  -- abonnement ging. Dit corrigeert die rijen NIET -- ze staan er, en
  -- terugdraaien is geld verplaatsen, niet een regel rechtzetten.
  select coalesce(
    'teruggevorderd tot nu toe: ' ||
    coalesce(sum(cb.amount), 0)::text || ' over ' || count(*)::text || ' rij(en)', 'nog niets')
    into v_wat
    from public.referral_clawbacks cb
   where cb.source = 'ad_account_withdrawal';

  insert into _plak120 values (1, 'stand van zaken',
    'grondslag versmald: ' || coalesce(v_ok, false)::text ||
    ' | anon mag uitvoeren: ' || coalesce(v_anon, false)::text || ' (moet false)');
  insert into _plak120 values (2, 'bestaande rijen (niet aangeraakt)', v_wat);
exception when others then
  insert into _plak120 values (1, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak120 order by n;
