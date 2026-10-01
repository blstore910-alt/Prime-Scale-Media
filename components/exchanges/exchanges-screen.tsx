"use client";

// ── ELKE OMWISSELING, OP EEN SCHERM ─────────────────────────────────
//
// De eigenaar, 30-09: "en waar in admin kan ik alle exchanges zien?"
// En daarna: "exchanges moet beter aligned en mooier, en elke klik
// detailed, ook conversion rate, alles, wallet before wallet after."
//
// Nergens was het antwoord op de eerste vraag. Een klant KAN wisselen
// -- `WalletExchangeDialog` staat live in de adverteerder-app -- en op
// de live database staan twee echte omwisselingen, van 21 en 24
// september. Er is nooit een scherm geweest dat ze laat zien, aan wie
// dan ook. `components/wallet/wallet-exchanges-table.tsx` bestaat wel
// maar hangt aan EEN wallet en wordt door niets geimporteerd -- regel
// 46 van docs/UNREACHABLE.md.
//
// ── DRIE DINGEN DIE DIT SCHERM ANDERS DOET DAN DE RIJ SUGGEREERT ──
//
// 1. DE KOERS KOMT NIET UIT `exchange_rate`. Die kolom draagt de
//    USD-gebaseerde REFERENTIEkoers ("1 USD = N EUR"). Op de rij van
//    24-09 staat 0,872361 naast EUR 10,00 -> USD 11,39, en 10 x
//    0,872361 is 8,72. Een koers die de twee bedragen op zijn eigen
//    regel niet verklaart is erger dan geen koers: wie hem natelt komt
//    uit op een ander bedrag en gaat een fout zoeken die er niet is.
//    Dus afgeleid uit de regel zelf -- zie `toegepasteKoers`.
//
// 2. DE FEE STAAT IN DE DOELVALUTA. `lib/pure-exchange.ts`: gross =
//    van x koers, fee = 0,6% van gross, to_amount = gross - fee. De
//    fee wordt dus over het al omgerekende bedrag geheven.
//
// 3. DE TENANT KOMT NIET VAN DE RIJ. `wallet_exchanges` heeft geen
//    `tenant_id`; de enige weg loopt via wallets -> advertisers.
//
// ── WALLET VOOR EN NA ─────────────────────────────────────────────
//
// `wallet_ledger` draagt `balance_before` en `balance_after`, maar
// `source_id` is in alle zeventien rijen LEEG -- er is dus geen
// verwijzing van een grootboekregel naar een wisselrij. De koppeling
// hieronder is daarom op wallet + valuta + het BEDRAG tot op de cent,
// binnen twee minuten. Klopt het bedrag niet exact, dan wordt er niets
// getoond in plaats van de dichtstbijzijnde regel.
//
// En de twee wissels die er nu staan krijgen sowieso niets: het
// grootboek is op 28-09 aangezet met openingsstanden, en zij zijn van
// 21 en 24 september. Dat staat er met zoveel woorden bij. Een stand
// terugrekenen uit het huidige saldo zou kloppen tot de eerstvolgende
// keer dat het niet klopt, en dan is het een verzonnen getal op een
// geldscherm.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { pageAllRows } from "@/lib/page-all-rows";
import { formatCurrency } from "@/lib/utils-pure";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, ArrowRight, Repeat } from "lucide-react";

type Rij = {
  id: string;
  created_at: string;
  from_currency: string | null;
  to_currency: string | null;
  from_amount: number | string | null;
  to_amount: number | string | null;
  exchange_rate: number | string | null;
  fee_amount: number | string | null;
  wallet_id: string | null;
  wallets: {
    advertisers: {
      tenant_client_code: string | null;
    } | null;
  } | null;
};

type LedgerRij = {
  currency: string | null;
  delta: number | string | null;
  balance_before: number | string | null;
  balance_after: number | string | null;
  occurred_at: string;
  source: string | null;
};

/** Het grootboek is op deze datum aangezet met openingsstanden. Alles
 *  ervoor heeft per definitie geen voor/na, en dat is geen fout. */
const LEDGER_VANAF = "2026-09-28";

const CSS = `
.psm-exc{display:flex;flex-direction:column;gap:16px}
.psm-exc{min-width:0;max-width:100%}
/* Kop en ondertitel onder elkaar: naast elkaar duwden ze de pagina op
   een telefoon breder dan het scherm (Test 4, 01-10). */
.psm-exc .phead{display:block}
.psm-exc .phead p{white-space:normal}
.psm-exc .phead h1{margin:0;font-family:var(--hd);font-weight:800;
  font-size:1.35rem;letter-spacing:-.02em;color:var(--ink)}
.psm-exc .phead p{margin:4px 0 0;color:var(--txt-2);font-size:.9rem}
.psm-exc .hero{border:1px solid var(--line);border-radius:14px;
  background:var(--panel);box-shadow:var(--shadow-sm);padding:14px 16px}
.psm-exc .hero .l{font-size:.68rem;font-weight:800;letter-spacing:.07em;
  text-transform:uppercase;color:var(--faint)}
.psm-exc .hero .v{font-family:var(--hd);font-weight:800;font-size:1.5rem;
  color:var(--ink);line-height:1.15;margin-top:2px}
.psm-exc .note{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;
  border:1px solid var(--line-2);border-radius:12px;background:var(--warn-soft);
  color:var(--warn);font-size:.84rem}
.psm-exc .note svg{width:16px;height:16px;flex:0 0 auto;margin-top:1px}
.psm-exc .card{border:1px solid var(--line);border-radius:14px;
  background:var(--panel);box-shadow:var(--shadow-sm);overflow:hidden}

/* ── UITLIJNEN ─────────────────────────────────────────────────────
   De eigenaar: "exchanges moet beter aligned."

   Het waren drie kolommen die alle drie links begonnen, dus de
   bedragen stonden onder een datum van wisselende lengte en lijnden
   nergens op uit. Nu: tekst links, GELD rechts, en table-layout:fixed
   met vaste breedtes zodat de kolommen niet meebewegen met de inhoud
   van een rij. Plus tabular-nums, want anders is een 1 smaller dan een
   8 en staan de komma's alsnog niet onder elkaar. */
.psm-exc table{width:100%;border-collapse:collapse;table-layout:fixed;
  font-size:.88rem}
.psm-exc th{padding:9px 12px;font-size:.66rem;font-weight:800;
  letter-spacing:.07em;text-transform:uppercase;color:var(--faint);
  border-bottom:1px solid var(--line);text-align:left}
.psm-exc td{padding:11px 12px;border-bottom:1px solid var(--line);
  vertical-align:middle}
.psm-exc tr:last-child td{border-bottom:0}
.psm-exc th.r,.psm-exc td.r{text-align:right}
.psm-exc col.c-when{width:34%}
.psm-exc col.c-who{width:22%}
.psm-exc col.c-swap{width:26%}
.psm-exc col.c-rate{width:18%}
.psm-exc .num{font-variant-numeric:tabular-nums;white-space:nowrap}
.psm-exc .who{font-weight:700;color:var(--ink)}
.psm-exc .quiet{color:var(--faint)}

/* Een rij die iets doet moet eruitzien alsof ze iets doet. */
.psm-exc tbody tr.klik{cursor:pointer;transition:background .12s}
.psm-exc tbody tr.klik:hover{background:var(--primary-tint)}
.psm-exc tbody tr.klik:focus-visible{outline:2px solid var(--primary);
  outline-offset:-2px}
.psm-exc .swap{display:inline-flex;align-items:center;gap:7px;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.psm-exc .swap svg{width:13px;height:13px;color:var(--faint);flex:0 0 auto}

.psm-exc .empty{padding:26px 16px;text-align:center;color:var(--txt-2)}
.psm-exc .empty svg{width:22px;height:22px;color:var(--faint)}
.psm-exc .empty b{display:block;margin:8px 0 2px;color:var(--ink);
  font-family:var(--hd)}
.psm-exc .skel{height:13px;border-radius:5px;background:var(--panel-2);
  display:inline-block;width:82px}

/* ── HET DETAIL ────────────────────────────────────────────────────
   Label links, waarde rechts, alles op een rasterlijn. Een detail dat
   je opent om een bedrag na te rekenen moet je met je vinger langs
   kunnen. */
.exc-det{display:flex;flex-direction:column;gap:14px}
.exc-det .grp{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.exc-det .grp h4{margin:0;padding:8px 12px;background:var(--panel-2);
  font-family:var(--hd);font-size:.64rem;font-weight:800;letter-spacing:.07em;
  text-transform:uppercase;color:var(--faint)}
.exc-det .ln{display:flex;align-items:baseline;gap:12px;padding:9px 12px;
  border-top:1px solid var(--line);font-size:.88rem}
.exc-det .ln .k{color:var(--txt-2);min-width:0}
.exc-det .ln .v{margin-left:auto;font-variant-numeric:tabular-nums;
  font-weight:700;color:var(--ink);white-space:nowrap}
.exc-det .ln.tot .v{color:var(--primary-600);font-size:1.02rem}
.exc-det .gap{padding:10px 12px;border-top:1px solid var(--line);
  font-size:.82rem;color:var(--txt-2);background:var(--panel-2)}

@media(max-width:560px){
  .psm-exc col.c-when{width:38%}
  .psm-exc col.c-who{width:24%}
  .psm-exc col.c-swap{width:38%}
  .psm-exc col.c-rate{width:0}
  .psm-exc th.c-rate-h,.psm-exc td.c-rate-c{display:none}
  .psm-exc td,.psm-exc th{padding:9px 8px}
  .psm-exc table{font-size:.82rem}
}
`;

/** Een bedrag met zijn munt, of een streepje. Nooit een stille 0: een
 *  ontbrekend bedrag en nul euro zijn niet hetzelfde. */
function geld(v: number | string | null | undefined, munt: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatCurrency(n, munt || "EUR");
}

/**
 * De koers zoals hij op DEZE regel is toegepast, uit de regel zelf.
 *
 * `exchange_rate` in de tabel is de USD-gebaseerde referentiekoers en
 * verklaart de twee bedragen op een EUR->USD-regel niet. Deze wel,
 * want hij komt eruit: pure-exchange rekent gross = van x koers,
 * fee = 0,6% van gross, naar = gross - fee. Dus koers = (naar+fee)/van.
 * Nagerekend op beide rijen: (11,39+0,07)/10 = 1,1460 en
 * (56,98+0,34)/50 = 1,1464.
 */
function toegepasteKoers(r: Rij): number | null {
  const van = Number(r.from_amount);
  const naar = Number(r.to_amount);
  const feeRuw = Number(r.fee_amount ?? 0);
  const fee = Number.isFinite(feeRuw) ? feeRuw : 0;
  if (!Number.isFinite(van) || !Number.isFinite(naar) || van <= 0) return null;
  const koers = (naar + fee) / van;
  return Number.isFinite(koers) && koers > 0 ? koers : null;
}

function datum(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── HET DETAIL ──────────────────────────────────────────────────────

function Detail({ r, onClose }: { r: Rij; onClose: () => void }) {
  const koers = toegepasteKoers(r);
  const van = Number(r.from_amount);
  const naar = Number(r.to_amount);
  const fee = Number(r.fee_amount ?? 0);
  const bruto = koers !== null && Number.isFinite(van) ? van * koers : null;

  // De grootboekregels rond deze wissel. Op wallet + valuta + het
  // BEDRAG tot op de cent, binnen twee minuten -- `source_id` is in
  // deze tabel nooit gevuld, dus een harde verwijzing is er niet.
  const ledger = useQuery({
    queryKey: ["exc-ledger", r.id],
    enabled: !!r.wallet_id,
    queryFn: async () => {
      const supabase = createClient();
      const t = new Date(r.created_at).getTime();
      const { data, error } = await supabase
        .from("wallet_ledger")
        .select("currency, delta, balance_before, balance_after, occurred_at, source")
        .eq("wallet_id", r.wallet_id!)
        .gte("occurred_at", new Date(t - 120_000).toISOString())
        .lte("occurred_at", new Date(t + 120_000).toISOString())
        .returns<LedgerRij[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  /** De regel die bij deze kant hoort, of niets. Exact op de cent --
   *  de dichtstbijzijnde pakken zou een ander bedrag als dit bedrag
   *  presenteren. */
  const kant = (munt: string | null, verwachteDelta: number) =>
    (ledger.data ?? []).find(
      (l) =>
        (l.currency ?? "").toUpperCase() === (munt ?? "").toUpperCase() &&
        Math.abs(Number(l.delta) - verwachteDelta) < 0.005,
    ) ?? null;

  const af = kant(r.from_currency, -van);
  const bij = kant(r.to_currency, naar);
  const voorLedger = r.created_at < LEDGER_VANAF;

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {geld(r.from_amount, r.from_currency)} →{" "}
            {geld(r.to_amount, r.to_currency)}
          </DialogTitle>
        </DialogHeader>

        <div className="exc-det">
          <style>{CSS}</style>

          <div className="grp">
            <h4>The swap</h4>
            <div className="ln">
              <span className="k">When</span>
              <span className="v">{datum(r.created_at)}</span>
            </div>
            <div className="ln">
              <span className="k">Customer</span>
              <span className="v">
                {r.wallets?.advertisers?.tenant_client_code ?? "Unknown"}
              </span>
            </div>
            <div className="ln">
              <span className="k">Taken from the wallet</span>
              <span className="v">{geld(r.from_amount, r.from_currency)}</span>
            </div>
          </div>

          <div className="grp">
            <h4>How it was worked out</h4>
            <div className="ln">
              <span className="k">
                Conversion rate · 1 {r.from_currency} buys
              </span>
              <span className="v">
                {koers === null
                  ? "—"
                  : `${koers.toFixed(4)} ${r.to_currency ?? ""}`}
              </span>
            </div>
            <div className="ln">
              <span className="k">Before the fee</span>
              <span className="v">
                {bruto === null ? "—" : geld(bruto, r.to_currency)}
              </span>
            </div>
            <div className="ln">
              {/* De fee staat in de DOELvaluta: pure-exchange heft hem
                  over het al omgerekende bedrag. */}
              <span className="k">Exchange fee (0.6%)</span>
              <span className="v">− {geld(r.fee_amount, r.to_currency)}</span>
            </div>
            <div className="ln tot">
              <span className="k">Landed in the other wallet</span>
              <span className="v">{geld(r.to_amount, r.to_currency)}</span>
            </div>
            {bruto !== null &&
            Math.abs(bruto - fee - naar) > 0.011 ? (
              <div className="gap">
                These three do not add up to the amount that landed. That
                is worth looking at — the figures above are read straight
                from the row.
              </div>
            ) : null}
          </div>

          <div className="grp">
            <h4>Wallet before and after</h4>
            {ledger.isPending ? (
              <div className="ln">
                <span className="k">Reading the ledger…</span>
              </div>
            ) : voorLedger ? (
              <div className="gap">
                The ledger was switched on on 28 Sep 2026 with opening
                balances, and this swap is older — so there is no
                before/after for it. Working it back from today&apos;s
                balance would be a made-up figure on a money screen.
              </div>
            ) : af || bij ? (
              <>
                {af ? (
                  <div className="ln">
                    <span className="k">{af.currency}</span>
                    <span className="v">
                      {geld(af.balance_before, af.currency)} →{" "}
                      {geld(af.balance_after, af.currency)}
                    </span>
                  </div>
                ) : null}
                {bij ? (
                  <div className="ln">
                    <span className="k">{bij.currency}</span>
                    <span className="v">
                      {geld(bij.balance_before, bij.currency)} →{" "}
                      {geld(bij.balance_after, bij.currency)}
                    </span>
                  </div>
                ) : null}
                {!af || !bij ? (
                  <div className="gap">
                    Only one side of this swap could be matched in the
                    ledger to the cent. The other is left out rather than
                    guessed.
                  </div>
                ) : null}
              </>
            ) : (
              <div className="gap">
                No ledger movement matches this swap to the cent. The
                ledger records what changed a balance; a row that cannot
                be matched exactly is left out instead of approximated.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── HET SCHERM ──────────────────────────────────────────────────────

export default function ExchangesScreen({ tenantId }: { tenantId: string }) {
  const [gekozen, setGekozen] = useState<Rij | null>(null);

  const q = useQuery({
    queryKey: ["alle-exchanges", tenantId],
    queryFn: async () => {
      const supabase = createClient();
      return pageAllRows<Rij>((from, to) =>
        supabase
          .from("wallet_exchanges")
          .select(
            "id, created_at, from_currency, to_currency, from_amount, " +
              "to_amount, exchange_rate, fee_amount, wallet_id, " +
              "wallets!inner(advertisers!inner(tenant_client_code))",
          )
          .eq("wallets.advertisers.tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .range(from, to)
          // De gegenereerde types kennen deze geneste embed niet en
          // vallen terug op GenericStringError[]. `returns` zegt wat er
          // echt uit komt; de vorm is nagekeken op de live database met
          // dezelfde join in SQL.
          .returns<Rij[]>(),
      );
    },
  });

  const rijen = q.data?.rows ?? [];
  const afgekapt = !!q.data?.truncated;
  const leesfout = q.error
    ? (q.error as Error).message
    : (q.data?.error ?? null);

  return (
    <div className="psmview psm-exc">
      <style>{CSS}</style>

      <div className="phead">
        <h1>Exchanges</h1>
        {/* Kort, want deze kop klemt op EEN regel op een telefoon --
            tests/lib/page-subtitles.test.ts houdt dat op 34 tekens. */}
        <p>Currency swaps inside a wallet</p>
      </div>

      {afgekapt ? (
        <div className="note">
          <AlertTriangle />
          <span>
            There is more history than this page reads in one pass. The
            list below is the most recent part — not all of it.
          </span>
        </div>
      ) : null}

      {leesfout ? (
        <div className="note">
          <AlertTriangle />
          <span>
            <b>The exchanges could not be read.</b> This is NOT an empty
            list — reload before concluding anything from it. {leesfout}
          </span>
        </div>
      ) : null}

      <div className="hero">
        <div className="l">Exchanges on record</div>
        <div className="v">
          {q.isPending ? (
            <span className="skel" />
          ) : leesfout ? (
            "—"
          ) : (
            rijen.length + (afgekapt ? "+" : "")
          )}
        </div>
      </div>

      <div className="card">
        <table>
          <colgroup>
            <col className="c-when" />
            <col className="c-who" />
            <col className="c-swap" />
            <col className="c-rate" />
          </colgroup>
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th className="r">Swap</th>
              <th className="r c-rate-h">Rate</th>
            </tr>
          </thead>
          <tbody>
            {q.isPending ? (
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td>
                    <span className="skel" />
                  </td>
                  <td>
                    <span className="skel" />
                  </td>
                  <td className="r">
                    <span className="skel" />
                  </td>
                  <td className="r c-rate-c">
                    <span className="skel" />
                  </td>
                </tr>
              ))
            ) : rijen.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  <Repeat />
                  <b>{leesfout ? "Nothing could be read" : "No exchanges yet"}</b>
                  <span>
                    {leesfout
                      ? "That is different from none — see the message above."
                      : "A customer swapping euros for dollars shows up here."}
                  </span>
                </td>
              </tr>
            ) : (
              rijen.map((r) => {
                const koers = toegepasteKoers(r);
                return (
                  <tr
                    key={r.id}
                    className="klik"
                    tabIndex={0}
                    role="button"
                    onClick={() => setGekozen(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setGekozen(r);
                      }
                    }}
                  >
                    <td className="num quiet">{datum(r.created_at)}</td>
                    <td>
                      {/* De klantcode en niets erbij. `advertisers` heeft
                          geen naamkolom -- de naam hangt aan
                          user_profiles via profile_id -- en de code is
                          wat overal elders in deze app een klant
                          aanwijst. Een gegokte join is erger dan een
                          code die je herkent. */}
                      <span className="who">
                        {r.wallets?.advertisers?.tenant_client_code ??
                          "Unknown"}
                      </span>
                    </td>
                    <td className="r">
                      <span className="swap">
                        <span>{geld(r.from_amount, r.from_currency)}</span>
                        <ArrowRight />
                        <span>{geld(r.to_amount, r.to_currency)}</span>
                      </span>
                    </td>
                    <td className="r num c-rate-c">
                      {koers === null ? "—" : koers.toFixed(4)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {gekozen ? (
        <Detail r={gekozen} onClose={() => setGekozen(null)} />
      ) : null}
    </div>
  );
}
