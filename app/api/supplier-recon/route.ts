// ── KLOPT HET BIJ ROCKADS? ──────────────────────────────────────────
//
// De eigenaar, 30-09: "kun jij ook in api zien hoeveel we transferen
// naar rockads hoeveel we topuppen en hoeveel dst en of dat samen
// allemaal klopt bij rockads dat we daar niks verliezen en 2% etc."
// En daarna: "normaal betalen we 2% bij rockads alle ad accounts
// alleen dst is hoger percentage natuurlijk."
//
// Tot vandaag las deze app van RockAds alleen het SALDO. Een saldo is
// een foto; nakijken doe je met de mutaties. Die routes bestaan bij hen
// en zijn nooit aangeroepen — gemeten met een 401/404-verschil, zie
// lib/integrations/rockads-api.ts.
//
// ── WAT ER TERUGKOMT, NAGEKEKEN OP EEN ECHT ANTWOORD ──────────────
//
// Elke mutatie draagt hun eigen kosten mee, en dat is precies het
// getal waar de vraag over gaat:
//
//     type              debit | credit
//     kind              transfer2adaccount, …
//     amount            "149.73"      (string, altijd)
//     commission_rate   "2"
//     commission_amount "2.99"        1,997% — de 2% klopt
//     card_fee_rate / card_fee / total_fee
//     ad_account        { id, account_id, name, alias_name }
//
// ── DRIE DINGEN DIE DEZE ROUTE MET OPZET NIET DOET ────────────────
//
// 1. HIJ TELT GEEN VALUTA BIJ ELKAAR. Elke wallet heeft zijn eigen
//    munt en ze worden apart opgeteld, of niet. Dat is dezelfde fout
//    die "Money involved $85,940.06" op /finance-check zette.
//
// 2. HIJ MAAKT VAN EEN MISLUKTE LEES GEEN NUL. Elk getal is een getal
//    of null. Een nul in een verschilberekening leest als "alles
//    klopt", en dat is het gevaarlijkste antwoord dat er is.
//
// 3. HIJ VERZWIJGT EEN AFGEKAPTE LIJST NIET. Als hun API pagineert en
//    wij lezen alleen de eerste pagina, dan klopt elke som hieronder
//    niet en ziet hij er precies zo uit als een die wel klopt. Daarom
//    staat `mogelijkAfgekapt` erbij.
//
// ADMIN-GATED. Hier staat de leveranciersnaam in en hun commissie —
// ons inkoopbedrag. Dat mag geen klant of affiliate zien, ook niet in
// de JSON achter een scherm. Deze route ís die JSON.
//
// ALLEEN GET. De deposit- en withdraw-endpoints van RockAds blijven
// ongeschreven, om de reden die bovenaan de adapter staat.

import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { NextResponse } from "next/server";
import {
  fetchRockadsWallets,
  fetchRockadsWalletTxns,
  type RockadsTxn,
} from "@/lib/integrations/rockads-api";
import { safeErrorMessage } from "@/lib/pure-error";

export const dynamic = "force-dynamic";

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const cent = (x: number) => Math.round(x * 100) / 100;

type Groep = {
  soort: string;
  aantal: number;
  bedrag: number;
  commissie: number;
  kaartkosten: number;
  overigeKosten: number;
  /**
   * ELKE tariefwaarde die hierin voorkwam. Eén afwijkend tarief mag
   * niet wegvallen in een gemiddelde — dat is het hele punt.
   */
  tarieven: string[];
  vanaf: string | null;
  tot: string | null;
};

function groepeer(txns: RockadsTxn[]): Groep[] {
  const map = new Map<string, Groep>();
  for (const t of txns) {
    const r = t.raw;
    const soort = `${String(r.type ?? "?")} / ${String(r.kind ?? "?")}`;
    let g = map.get(soort);
    if (!g) {
      g = {
        soort,
        aantal: 0,
        bedrag: 0,
        commissie: 0,
        kaartkosten: 0,
        overigeKosten: 0,
        tarieven: [],
        vanaf: null,
        tot: null,
      };
      map.set(soort, g);
    }
    g.aantal += 1;
    g.bedrag += n(r.amount);
    g.commissie += n(r.commission_amount);
    g.kaartkosten += n(r.card_fee);
    g.overigeKosten += n(r.total_fee);
    const tarief = String(r.commission_rate ?? "");
    if (tarief && !g.tarieven.includes(tarief)) g.tarieven.push(tarief);
    const d = String(r.created_at ?? "");
    if (d) {
      if (!g.vanaf || d < g.vanaf) g.vanaf = d;
      if (!g.tot || d > g.tot) g.tot = d;
    }
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      bedrag: cent(g.bedrag),
      commissie: cent(g.commissie),
      kaartkosten: cent(g.kaartkosten),
      overigeKosten: cent(g.overigeKosten),
      tarieven: g.tarieven.sort(),
    }))
    .sort((a, b) => b.bedrag - a.bedrag);
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
    if (wErr) {
      return NextResponse.json({ ok: false, why: wErr, wallets: null });
    }

    const perWallet = [];
    for (const w of wallets) {
      const { txns, error: tErr } = await fetchRockadsWalletTxns(w.id);
      if (tErr) {
        perWallet.push({
          wallet: { code: w.code, name: w.name, currency: w.currency },
          saldoNu: w.balance,
          error: tErr,
          // Geen enkel getal, want we weten niets.
          groepen: null,
          controle: null,
        });
        continue;
      }

      const groepen = groepeer(txns);
      const erin = groepen
        .filter((g) => g.soort.startsWith("credit"))
        .reduce((s, g) => s + g.bedrag, 0);
      const eruit = groepen
        .filter((g) => g.soort.startsWith("debit"))
        .reduce((s, g) => s + g.bedrag, 0);
      const commissie = groepen.reduce((s, g) => s + g.commissie, 0);

      // Elk tarief dat NIET 2 is, met naam en toenaam. De eigenaar zegt
      // dat het overal 2% hoort te zijn; dit is de plek waar een
      // uitzondering zichtbaar wordt in plaats van te verdwijnen in een
      // gemiddelde.
      const afwijkendeTarieven = Array.from(
        new Set(
          txns
            .map((t) => String(t.raw.commission_rate ?? ""))
            .filter((r) => r !== "" && r !== "2" && r !== "2.00"),
        ),
      ).sort();

      // En de rijen waar het BEDRAG niet bij het tarief past. Eén cent
      // afronding is geen fout; meer wel.
      const rekenfouten = txns
        .filter((t) => {
          const bedrag = n(t.raw.amount);
          const tarief = n(t.raw.commission_rate);
          const geheven = n(t.raw.commission_amount);
          if (!bedrag || !tarief) return false;
          return Math.abs(bedrag * (tarief / 100) - geheven) > 0.011;
        })
        .slice(0, 10)
        .map((t) => ({
          id: t.id,
          bedrag: t.raw.amount,
          tarief: t.raw.commission_rate,
          geheven: t.raw.commission_amount,
          hoortTeZijn: cent(n(t.raw.amount) * (n(t.raw.commission_rate) / 100)),
          op: t.raw.created_at,
        }));

      perWallet.push({
        wallet: { code: w.code, name: w.name, currency: w.currency },
        saldoNu: w.balance,
        error: null,
        mutaties: txns.length,
        // Een rond getal is verdacht: dan is het waarschijnlijk een
        // paginagrootte en niet het echte aantal.
        mogelijkAfgekapt: [50, 100, 200, 250, 500, 1000].includes(txns.length),
        groepen,
        controle: {
          erinGeboekt: cent(erin),
          eruitGeboekt: cent(eruit),
          commissieBetaald: cent(commissie),
          // Wat het saldo zou moeten zijn als deze lijst compleet is.
          saldoVolgensMutaties: cent(erin - eruit),
          verschilMetSaldo: cent(w.balance - (erin - eruit)),
          afwijkendeTarieven,
          rekenfouten,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      readAt: new Date().toISOString(),
      uitleg:
        "Alleen de RockAds-kant. Wat wij vanaf onze eigen bank naar hen " +
        "hebben overgemaakt weet alleen ons eigen boek, en dat is leeg " +
        "(bank_ledger_entries, 0 rijen).",
      wallets: perWallet,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, why: safeErrorMessage(err) },
      { status: 500 },
    );
  }
}
