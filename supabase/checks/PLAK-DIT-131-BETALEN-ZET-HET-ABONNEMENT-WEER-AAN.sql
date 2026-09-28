-- ════════════════════════════════════════════════════════════════════
-- PLAK 131 — zeven dagen, dan uit; betalen zet het weer aan
-- ════════════════════════════════════════════════════════════════════
--
-- De eigenaar, 28-09: "iemand moet gwn binnen 7 dagen betalen een
-- betaald abonnement en anders inactive zetten ja totdat die betaald
-- dan weer active maar dat betekent niet dat die 7 dagen gratis krijgt
-- ofzo."
--
-- WAT ER VANDAAG GEBEURT, gemeten:
--
--   1. `subscription_billing_run` maakt de factuur met
--      `due_date = now() + interval '7 days'`. Dat klopt al.
--   2. Op de vervaldag probeert hij eerst
--      `invoice_pay_from_wallet(...)`. Ook goed.
--   3. Lukt dat niet, dan zet hij de abonnementsstatus op **past_due**
--      -- niet op inactive. (`process_recurring_subscriptions` doet
--      hetzelfde.)
--   4. En als er later WEL wordt betaald, zet
--      `_on_subscription_invoice_paid` de status terug op 'active' --
--      BEHALVE als hij 'cancelled', 'paused' of **'inactive'** is. Die
--      laatste staat er ten onrechte in.
--
-- Gevolg van 3 en 4 samen: PSM0011 heeft EUR 150 betaald op een
-- abonnement dat op `inactive` stond, en het bleef inactive. Zijn
-- dashboard zegt "No subscription" boven een betaalde factuur. (De
-- eigenaar: die klant is niet echt, maar de regel eronder wel.)
--
-- WAT HET WORDT
--
--   * niet betaald na zeven dagen -> **inactive** in plaats van
--     past_due, op allebei de wegen;
--   * betaald -> **active**, ook als hij inactive stond. 'cancelled' en
--     'paused' blijven met rust: dat is een echt einde en een bewuste
--     pauze, geen wanbetaling.
--
-- EN DIE ZEVEN DAGEN ZIJN NIET GRATIS. Twee dingen zorgen daarvoor, en
-- geen van beide verandert hier:
--   * de onbetaalde factuur blijft gewoon staan en blijft verschuldigd;
--   * `next_payment_date` wordt gezet uit `period_start + interval`, en
--     NIET uit de betaaldatum -- dus te laat betalen schuift de periode
--     niet op en levert geen extra dagen op.
--
-- WAT DIT WEL BETEKENT, expliciet, zodat de eigenaar het kan
-- terugdraaien als hij het anders wil: een abonnement dat op `inactive`
-- staat wordt NIET verder gefactureerd (`subscription_billing_run`
-- factureert alleen 'active' en 'past_due'). Uitgezet is uit. De
-- openstaande factuur blijft staan; er komt alleen geen nieuwe maand
-- bij zolang hij uit staat.
--
-- Tekstchirurgie, op [[:space:]] en op oid. EEN execute per functie --
-- plak 124 had er per ongeluk twee achter elkaar en dat brak de
-- Join-knop op productie.
--
-- Plak dit hele bestand in de SQL editor. Onderaan staat EEN
-- rapporttabel.
-- ════════════════════════════════════════════════════════════════════

create temporary table if not exists _plak131 (
  n integer, stap text, uitkomst text
) on commit preserve rows;
truncate _plak131;

-- ── 1. betalen zet het weer aan ─────────────────────────────────────
do $blk0$
declare
  v_oid oid;
  v_def text;
  v_pat text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid'
   limit 1;

  if v_oid is null then
    insert into _plak131 values (0, 'betalen zet het weer aan',
      'AFGEBROKEN: _on_subscription_invoice_paid bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if v_def !~ '''inactive''' then
    insert into _plak131 values (0, 'betalen zet het weer aan',
      'inactive stond al niet in de uitzonderingslijst -- niets gedaan');
    return;
  end if;

  -- Alleen 'inactive' uit de lijst; cancelled en paused blijven.
  v_pat := 'status[[:space:]]+in[[:space:]]*\([[:space:]]*''cancelled''[[:space:]]*,[[:space:]]*''paused''[[:space:]]*,[[:space:]]*''inactive''[[:space:]]*\)';

  if not (v_def ~ v_pat) then
    insert into _plak131 values (0, 'betalen zet het weer aan',
      'FOUT: de uitzonderingslijst is niet herkend -- niets gewijzigd. Stuur me pg_get_functiondef van deze functie.');
    return;
  end if;

  execute regexp_replace(
    v_def, v_pat,
    'status in (''cancelled'', ''paused'')  -- inactive hoort hier NIET: uitgezet wegens niet betalen gaat weer aan zodra er betaald is (eigenaar, 28-09)');

  insert into _plak131 values (0, 'betalen zet het weer aan',
    'een betaalde factuur zet een inactive abonnement weer op active');
exception when others then
  insert into _plak131 values (0, 'betalen zet het weer aan',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk0$;

-- ── 2. na zeven dagen uit, in de nachtelijke run ────────────────────
do $blk1$
declare
  v_oid oid;
  v_def text;
  v_pat text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run'
   limit 1;

  if v_oid is null then
    insert into _plak131 values (1, 'de nachtelijke run',
      'AFGEBROKEN: subscription_billing_run bestaat niet');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('zeven dagen om, dus uit' in v_def) > 0 then
    insert into _plak131 values (1, 'de nachtelijke run',
      'stond er al -- niets gedaan');
    return;
  end if;

  v_pat := 'update[[:space:]]+public\.subscriptions[[:space:]]+set[[:space:]]+status[[:space:]]*=[[:space:]]*''past_due''';

  if not (v_def ~ v_pat) then
    insert into _plak131 values (1, 'de nachtelijke run',
      'FOUT: de past_due-schrijf is niet herkend -- niets gewijzigd');
    return;
  end if;

  execute regexp_replace(
    v_def, v_pat,
    '-- zeven dagen om, dus uit' || chr(10) ||
    '        update public.subscriptions set status = ''inactive''');

  insert into _plak131 values (1, 'de nachtelijke run',
    'een mislukte incasso op de vervaldag zet het abonnement op inactive');
exception when others then
  insert into _plak131 values (1, 'de nachtelijke run',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk1$;

-- ── 3. en in de oudere weg, die er ook nog is ───────────────────────
do $blk2$
declare
  v_oid oid;
  v_def text;
  v_pat text;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'process_recurring_subscriptions'
   limit 1;

  if v_oid is null then
    insert into _plak131 values (2, 'de oudere weg',
      'bestaat niet -- niets te doen');
    return;
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position('zeven dagen om, dus uit' in v_def) > 0 then
    insert into _plak131 values (2, 'de oudere weg', 'stond er al -- niets gedaan');
    return;
  end if;

  v_pat := 'set[[:space:]]+status[[:space:]]*=[[:space:]]*''past_due''[[:space:]]*,';

  if not (v_def ~ v_pat) then
    insert into _plak131 values (2, 'de oudere weg',
      'FOUT: de past_due-schrijf is niet herkend -- niets gewijzigd');
    return;
  end if;

  execute regexp_replace(
    v_def, v_pat,
    '-- zeven dagen om, dus uit' || chr(10) ||
    '               set status = ''inactive'',');

  insert into _plak131 values (2, 'de oudere weg',
    'zet nu ook inactive in plaats van past_due');
exception when others then
  insert into _plak131 values (2, 'de oudere weg',
    'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk2$;

-- ── controle ────────────────────────────────────────────────────────
do $blk3$
declare
  v_paid   boolean;
  v_run    boolean;
  v_old    boolean;
  v_shift  boolean;
  v_stand  text;
begin
  select position('''inactive''' in pg_get_functiondef(p.oid)) = 0
    into v_paid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid';

  select position('zeven dagen om, dus uit' in pg_get_functiondef(p.oid)) > 0
    into v_run
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscription_billing_run';

  select coalesce(bool_or(position('zeven dagen om, dus uit' in pg_get_functiondef(p.oid)) > 0), true)
    into v_old
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'process_recurring_subscriptions';

  -- De periode mag NIET opschuiven door laat te betalen. Dit hoort
  -- true te blijven: hij rekent uit period_start, niet uit now().
  select position('period_start' in pg_get_functiondef(p.oid)) > 0
    into v_shift
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_on_subscription_invoice_paid';

  select coalesce(string_agg(s.status || ' ' || s.n, ', ' order by s.n desc), 'geen')
    into v_stand
    from (select status, count(*) as n from public.subscriptions group by 1) s;

  insert into _plak131 values (3, 'stand van zaken',
    'betalen zet weer aan: ' || coalesce(v_paid, false)::text
    || ' | nachtrun zet inactive: ' || coalesce(v_run, false)::text
    || ' | oudere weg ook: ' || coalesce(v_old, false)::text
    || ' | periode schuift niet op: ' || coalesce(v_shift, false)::text || ' (moet true)');
  insert into _plak131 values (4, 'abonnementen nu', v_stand);
exception when others then
  insert into _plak131 values (3, 'stand van zaken', 'FOUT ' || sqlstate || ': ' || sqlerrm);
end
$blk3$;

-- ════════════════════════════════════════════════════════════════════
-- HET RAPPORT — de editor toont alleen deze laatste tabel.
-- ════════════════════════════════════════════════════════════════════
select n as "#", stap as "wat", uitkomst as "uitkomst"
  from _plak131 order by n;
