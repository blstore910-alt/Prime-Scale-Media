// ── KLOPT HET BIJ ROCKADS? — STAP 1: WAT GEVEN ZE ONS TERUG ─────────
//
// De eigenaar, 30-09: "kun jij ook in api zien hoeveel we transferen
// naar rockads hoeveel we topuppen en hoeveel dst en of dat samen
// allemaal klopt bij rockads dat we daar niks verliezen en 2% etc."
//
// Dat is de goede vraag en hij kan bijna. Wat er tot vandaag gelezen
// werd is het SALDO, en een saldo kan niet nagerekend worden — daar
// zijn de mutaties voor nodig. Die routes bestaan bij hen (gemeten met
// een 401/404-verschil, zie lib/integrations/rockads-api.ts) en zijn
// nooit aangeroepen.
//
// WAAROM DEZE ROUTE EERST DE VORM TEVOORSCHIJN HAALT EN NIET METEEN DE
// SOM MAAKT. Hun documentatie staat niet openbaar. Ik weet dus dat
// `/wallets/{id}/transactions` bestaat, maar niet of het bedrag
// `amount`, `value` of `sum` heet, en niet of een afboeking een
// min-teken heeft of een apart type. Een optelling over een veldnaam
// die er niet is levert geen fout op maar een KEURIGE NUL, en een nul
// in een verschilberekening leest als "alles klopt". Dat is precies de
// fout die deze app al twee keer heeft gemaakt.
//
// Dus: eerst de echte sleutelnamen en een handvol echte rijen ophalen,
// die met eigen ogen lezen, en pas daarna de vergelijking bouwen op wat
// er werkelijk staat.
//
// ADMIN-GATED, en dat is niet vrijblijvend. Hier staat de naam van de
// leverancier in, en in een ad-account-mutatie zit hun commissie — ons
// inkoopbedrag. Dat mag een klant of affiliate nergens zien, ook niet
// in de JSON achter een scherm. Deze route ís die JSON.
//
// ALLEEN GET. Geen enkele aanroep hieronder kan geld verplaatsen; de
// deposit- en withdraw-endpoints van RockAds zijn met opzet niet
// geïmplementeerd.

import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { NextResponse } from "next/server";
import {
  fetchRockadsWallets,
  fetchRockadsAdAccounts,
  fetchRockadsWalletTxns,
  fetchRockadsAdAccountTxns,
  fetchRockadsInsights,
} from "@/lib/integrations/rockads-api";
import { safeErrorMessage } from "@/lib/pure-error";

export const dynamic = "force-dynamic";

/** De sleutels van de eerste rijen, zodat een veldnaam die wij missen
 *  zichtbaar wordt in plaats van stil nul te worden. */
function keysOf(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const r of rows.slice(0, 20)) {
    for (const k of Object.keys(r ?? {})) seen.add(k);
  }
  return Array.from(seen).sort();
}

export async function GET() {
  const { error } = await apiRequireAdmin();
  if (error) return error;

  if (!process.env.ROCKADS_API_KEY || !process.env.ROCKADS_API_SECRET) {
    return NextResponse.json({
      ok: false,
      why: "RockAds credentials are not set on this deployment.",
    });
  }

  try {
    const { wallets, error: wErr } = await fetchRockadsWallets();
    const { accounts, error: aErr } = await fetchRockadsAdAccounts();

    // Eén wallet en één ad-account is genoeg om de vorm te leren, en
    // houdt het bij vier aanroepen in plaats van tientallen.
    const wallet = wallets[0] ?? null;
    const account = accounts.find((a) => a.status === "approved") ?? accounts[0] ?? null;

    const wTx = wallet
      ? await fetchRockadsWalletTxns(wallet.id)
      : { txns: [], error: "no wallet to ask about" };
    const aTx = account
      ? await fetchRockadsAdAccountTxns(account.id)
      : { txns: [], error: "no ad account to ask about" };
    const ins = account
      ? await fetchRockadsInsights(account.id)
      : { rows: [], error: "no ad account to ask about" };

    return NextResponse.json({
      ok: true,
      readAt: new Date().toISOString(),
      wallets: {
        error: wErr,
        count: wallets.length,
        list: wallets.map((w) => ({
          id: w.id,
          code: w.code,
          name: w.name,
          balance: w.balance,
          currency: w.currency,
        })),
      },
      adAccounts: {
        error: aErr,
        count: accounts.length,
      },
      walletTxns: {
        askedAbout: wallet ? { id: wallet.id, currency: wallet.currency } : null,
        error: wTx.error,
        count: wTx.txns.length,
        keys: keysOf(wTx.txns.map((t) => t.raw)),
        sample: wTx.txns.slice(0, 5).map((t) => t.raw),
      },
      accountTxns: {
        askedAbout: account ? { id: account.id, name: account.name } : null,
        error: aTx.error,
        count: aTx.txns.length,
        keys: keysOf(aTx.txns.map((t) => t.raw)),
        sample: aTx.txns.slice(0, 5).map((t) => t.raw),
      },
      insights: {
        error: ins.error,
        count: ins.rows.length,
        keys: keysOf(ins.rows),
        sample: ins.rows.slice(0, 3),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, why: safeErrorMessage(err) },
      { status: 500 },
    );
  }
}
