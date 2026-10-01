import { strict as assert } from "node:assert";
import { test } from "node:test";
import { bankLines, bankWhatsAppText, cleanBankValue, whatsAppLink } from "../../lib/pure-bank-whatsapp";
import { bankInstructions } from "../../lib/bank-beneficiaries";

test("de uitlegregel tussen haakjes gaat eruit, het adres blijft", () => {
  assert.equal(cleanBankValue("TRWIUS35XXX\n(Use this when sending from outside the US.)"), "TRWIUS35XXX");
  assert.equal(cleanBankValue("Wise US Inc\n108 W 13th St\nUnited States"), "Wise US Inc, 108 W 13th St, United States");
});

test("TURLIT EUR: IBAN en BIC staan erin, de SEPA-uitleg niet", () => {
  const r = bankLines(bankInstructions.turlit.accounts.EUR!.sections);
  assert.ok(r.some((l) => l.label === "IBAN" && l.value === "BE86967511906550"));
  assert.ok(r.some((l) => l.value === "TRWIBEB1XXX"));
  assert.ok(!r.some((l) => /preferred/i.test(l.value)));
});

test("het bericht noemt de klant, de referentie-stap, en nooit een leverancier of type", () => {
  for (const g of ["turlit", "zanel"] as const) {
    for (const [cur, acc] of Object.entries(bankInstructions[g]!.accounts)) {
      const t = bankWhatsAppText({
        beneficiary: bankInstructions[g]!.beneficiary,
        currency: cur,
        sections: acc!.sections,
        clientCode: "PSM0022",
        name: "Baris",
      });
      assert.match(t, /^Hi Baris!/);
      assert.match(t, /starts with 0022-/);
      assert.match(t, /press \*Top up\*/);
      assert.doesNotMatch(t, /seamx|falkyn|rockads|bestads|gradyn|meta-|premium|business/i);
    }
  }
});

test("de WhatsApp-link codeert de tekst", () => {
  assert.equal(whatsAppLink("a b&c"), "https://wa.me/?text=a%20b%26c");
});
