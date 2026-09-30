"use client";

// ── ELKE OMWISSELING, OP EEN SCHERM ─────────────────────────────────
//
// De eigenaar, 30-09: "en waar in admin kan ik alle exchanges zien?"
//
// Nergens. Dat was het antwoord, en het is erger dan het klinkt: een
// klant KAN wisselen -- `WalletExchangeDialog` staat live in de
// adverteerder-app -- en op de live database staan twee echte
// omwisselingen, van 21 en 24 september. Er is nooit een scherm
// geweest dat ze laat zien, aan wie dan ook.
//
// `components/wallet/wallet-exchanges-table.tsx` bestaat wel, maar
// hangt aan EEN wallet en wordt door niets geïmporteerd -- het staat op
// regel 46 van docs/UNREACHABLE.md. Die is hier niet te gebruiken: de
// vraag is "alle", over alle klanten heen.
//
// ── DE TENANT KOMT NIET VAN DE RIJ ────────────────────────────────
//
// `wallet_exchanges` heeft GEEN `tenant_id`. De enige weg naar de
// tenant loopt via `wallets -> advertisers`, en die join staat er dus
// met opzet in plaats van een filter op de rij zelf. RLS dekt de lees,
// maar een scherm dat per ongeluk twee tenants door elkaar optelt is
// geen RLS-fout maar een rekenfout.
//
// ── EEN AFGEKAPTE LIJST ZIET ERUIT ALS EEN COMPLETE ───────────────
//
// Vandaag zijn het er twee. Over een jaar niet, en een lijst die stil
// bij 1.000 ophoudt telt een totaal dat nergens op slaat. Vandaar
// `pageAllRows` en een regel bovenaan zodra hij niet alles kon halen.

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { pageAllRows } from "@/lib/page-all-rows";
import { formatCurrency } from "@/lib/utils-pure";
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
  wallets: {
    advertisers: {
      tenant_client_code: string | null;
    } | null;
  } | null;
};

const CSS = `
.psm-exc{display:flex;flex-direction:column;gap:16px}
.psm-exc .phead h1{margin:0;font-family:var(--hd);font-weight:800;
  font-size:1.35rem;letter-spacing:-.02em;color:var(--ink)}
.psm-exc .phead p{margin:4px 0 0;color:var(--txt-2);font-size:.9rem;
  max-width:62ch}
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
.psm-exc table{width:100%;border-collapse:collapse;font-size:.88rem}
.psm-exc th{text-align:left;padding:9px 12px;font-size:.66rem;font-weight:800;
  letter-spacing:.07em;text-transform:uppercase;color:var(--faint);
  border-bottom:1px solid var(--line)}
.psm-exc td{padding:11px 12px;border-bottom:1px solid var(--line);
  vertical-align:middle}
.psm-exc tr:last-child td{border-bottom:0}
.psm-exc .who{font-weight:700;color:var(--ink)}
.psm-exc .code{display:block;color:var(--faint);font-size:.72rem;
  font-variant-numeric:tabular-nums}
.psm-exc .swap{display:flex;align-items:center;gap:8px;
  font-variant-numeric:tabular-nums;white-space:nowrap}
.psm-exc .swap svg{width:14px;height:14px;color:var(--faint);flex:0 0 auto}
.psm-exc .num{font-variant-numeric:tabular-nums;white-space:nowrap}
.psm-exc .quiet{color:var(--faint)}
.psm-exc .empty{padding:26px 16px;text-align:center;color:var(--txt-2)}
.psm-exc .empty svg{width:22px;height:22px;color:var(--faint)}
.psm-exc .empty b{display:block;margin:8px 0 2px;color:var(--ink);
  font-family:var(--hd)}
.psm-exc .skel{height:13px;border-radius:5px;background:var(--panel-2);
  display:inline-block;width:82px}
@media(max-width:560px){
  .psm-exc .hide-s{display:none}
  .psm-exc td,.psm-exc th{padding:9px 8px}
  .psm-exc table{font-size:.82rem}
}
`;

/** Een bedrag met zijn munt, of een streepje. Nooit een stille 0:
 *  een ontbrekend bedrag en nul euro zijn niet hetzelfde. */
function geld(v: number | string | null | undefined, munt: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return formatCurrency(n, munt || "EUR");
}

export default function ExchangesScreen({ tenantId }: { tenantId: string }) {
  const q = useQuery({
    queryKey: ["alle-exchanges", tenantId],
    queryFn: async () => {
      const supabase = createClient();
      return pageAllRows<Rij>((from, to) =>
        supabase
          .from("wallet_exchanges")
          .select(
            "id, created_at, from_currency, to_currency, from_amount, " +
              "to_amount, exchange_rate, fee_amount, " +
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
        {/* Eenendertig tekens, want deze kop klemt op EEN regel op een
            telefoon en kapt de rest af -- tests/lib/page-subtitles.test.ts
            houdt dat op 34 vast. Wat er NIET meer staat is de zin dat dit
            geen omzet is; die hoort ook niet in een ondertitel. Het woord
            "inside a wallet" doet dat werk al: geld dat van vorm verandert
            en de app niet in of uit gaat. */}
        <p>Currency swaps inside a wallet</p>
      </div>

      {/* ── EEN AFGEKAPTE LIJST ZEGT HET ZELF ──────────────────── */}
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
          <thead>
            <tr>
              <th>When</th>
              <th>Customer</th>
              <th>Swap</th>
              <th className="hide-s">Rate</th>
              <th className="hide-s">Fee</th>
            </tr>
          </thead>
          <tbody>
            {q.isPending ? (
              // Drie rijen met dezelfde hoogte als de echte, zodat het
              // blok niet groeit zodra ze landen.
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td>
                    <span className="skel" />
                  </td>
                  <td>
                    <span className="skel" />
                  </td>
                  <td>
                    <span className="skel" />
                  </td>
                  <td className="hide-s">
                    <span className="skel" />
                  </td>
                  <td className="hide-s">
                    <span className="skel" />
                  </td>
                </tr>
              ))
            ) : rijen.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  <Repeat />
                  <b>{leesfout ? "Nothing could be read" : "No exchanges yet"}</b>
                  <span>
                    {leesfout
                      ? "That is different from none — see the message above."
                      : "A customer swapping euros for dollars in their wallet shows up here."}
                  </span>
                </td>
              </tr>
            ) : (
              rijen.map((r) => {
                const adv = r.wallets?.advertisers ?? null;
                return (
                  <tr key={r.id}>
                    <td className="num quiet">
                      {new Date(r.created_at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      {/* De klantcode en niets erbij. `advertisers` heeft
                          geen naamkolom -- de naam hangt aan
                          user_profiles via profile_id -- en de code is
                          wat overal elders in deze app een klant
                          aanwijst. Een gegokte join is erger dan een
                          code die je herkent. */}
                      <span className="who">
                        {adv?.tenant_client_code ?? "Unknown"}
                      </span>
                    </td>
                    <td>
                      <span className="swap">
                        <span>{geld(r.from_amount, r.from_currency)}</span>
                        <ArrowRight />
                        <span>{geld(r.to_amount, r.to_currency)}</span>
                      </span>
                    </td>
                    <td className="num hide-s">
                      {r.exchange_rate === null || r.exchange_rate === undefined
                        ? "—"
                        : Number(r.exchange_rate).toFixed(6)}
                    </td>
                    <td className="num hide-s">
                      {geld(r.fee_amount, r.from_currency)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
