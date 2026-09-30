import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  landedOnAccount,
  sumLandedByCurrency,
} from "../../lib/pure-topup-landed.ts";

describe("landedOnAccount — whose row is it", () => {
  it("a customer row is in the account's own currency", () => {
    // top_up_create_for_advertiser: EUR 100 at 3% on a EUR account.
    const row = {
      currency: "EUR",
      topup_amount: 97,
      topup_usd: 111.19,
    };
    assert.deepEqual(landedOnAccount(row), { amount: 97, currency: "EUR" });
  });

  it("an admin row has no topup_usd, and its topup_amount is dollars", () => {
    // calculateTopupAmount converts first, so 97 would be wrong here.
    const row = { currency: "EUR", topup_amount: 1104.65 };
    assert.deepEqual(landedOnAccount(row), {
      amount: 1104.65,
      currency: "USD",
    });
  });

  it("a USD customer row stays USD", () => {
    const row = { currency: "USD", topup_amount: 970, topup_usd: 970 };
    assert.deepEqual(landedOnAccount(row), { amount: 970, currency: "USD" });
  });

  it("an unreadable amount is null, never zero", () => {
    assert.equal(landedOnAccount({ topup_amount: null }).amount, null);
    assert.equal(landedOnAccount({ topup_amount: "" }).amount, null);
    assert.equal(landedOnAccount(null).amount, null);
  });

  it("a zero topup_usd does not make the row an admin row", () => {
    // 0 is a real value the customer path can write; only absence means
    // "an admin wrote this".
    const row = { currency: "EUR", topup_amount: 100, topup_usd: 0 };
    assert.equal(landedOnAccount(row).currency, "EUR");
  });
});

describe("sumLandedByCurrency — a sum across currencies is not a number", () => {
  it("keeps the currencies apart", () => {
    const rows = [
      { currency: "EUR", topup_amount: 97, topup_usd: 111.19 },
      { currency: "EUR", topup_amount: 3, topup_usd: 3.44 },
      { currency: "USD", topup_amount: 500, topup_usd: 500 },
      { currency: "EUR", topup_amount: 1104.65 }, // admin row -> USD
    ];
    assert.deepEqual(sumLandedByCurrency(rows), {
      EUR: 100,
      USD: 1604.65,
    });
  });

  it("skips what it cannot read rather than counting it as nothing", () => {
    const rows = [
      { currency: "EUR", topup_amount: 50, topup_usd: 57 },
      { currency: "EUR", topup_amount: null, topup_usd: 1 },
    ];
    assert.deepEqual(sumLandedByCurrency(rows), { EUR: 50 });
  });
});

describe("de rij print het netto in de valuta die het ECHT is", () => {
  // 30-09, gemeten op productie: bij EUR 200,00 binnen staat
  // top_ups.topup_amount op 190,00 en fee_amount op 10,00 -- euro's,
  // geen dollars. De comment in topup-row.tsx beweerde het
  // tegenovergestelde ("topup_amount / fee_amount are USD, always"),
  // wat alleen voor de ADMINroute geldt, en de kolom stond hard op
  // "USD". Dus las een beheerder $190,00 naast een fee van EUR 10,00
  // op dezelfde regel, op de tabel die hij bekijkt vlak voordat hij
  // geld op een ad-account zet.
  //
  // De regel: in die rij bepaalt landedOnAccount() de valuta, nergens
  // een letterlijke.
  // Alleen de twee DUBBELZINNIGE velden. `eur_value`, `eur_topup` en
  // `amount_usd` dragen hun valuta in de kolomnaam, en die mogen dus
  // wel een letterlijke hebben -- dat is geen aanname maar een feit
  // over de kolom.
  it("zet geen valuta vast op topup_amount of fee_amount", () => {
    const bron = readFileSync("components/topups/topup-row.tsx", "utf8");
    const code = bron
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const hard = [
      ...code.matchAll(
        /formatCurrency\(\s*[^)]*?\b(?:topup_amount|fee_amount)\b[^)]*?,\s*"(?:USD|EUR)"\s*,?\s*\)/g,
      ),
    ].map((m) => m[0].replace(/\s+/g, " "));
    assert.deepEqual(
      hard,
      [],
      "topup-row.tsx zet een valuta vast in plaats van hem uit " +
        "landedOnAccount() te halen. Op een klantrij is topup_amount " +
        "de BETAALvaluta, niet USD. Gevonden: " + hard.join(" | "),
    );
  });

  it("een klantrij in euro's landt in euro's, een adminrij in dollars", () => {
    // topup_usd gezet = klantrij: topup_amount staat in row.currency.
    assert.deepEqual(
      landedOnAccount({ currency: "EUR", topup_amount: 190, topup_usd: 216.45 }),
      { amount: 190, currency: "EUR" },
    );
    // Geen topup_usd = adminrij: topup_amount is al USD.
    assert.deepEqual(
      landedOnAccount({ currency: "EUR", topup_amount: 190, topup_usd: null }),
      { amount: 190, currency: "USD" },
    );
  });
});
