import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseStatementForMatch } from "../../lib/integrations/wise-api.ts";

describe("parseStatementForMatch", () => {
  it("pulls reference + sender from the single matching credit", () => {
    const detail = parseStatementForMatch(
      {
        transactions: [
          {
            type: "CREDIT",
            amount: { value: 500, currency: "USD" },
            details: {
              paymentReference: "1483181337",
              senderName: "Jay Dunn",
              sender: { iban: "NL00 BANK 0123 4567 89" },
            },
          },
          {
            type: "DEBIT",
            amount: { value: 500, currency: "USD" },
            details: { paymentReference: "ignore-me" },
          },
        ],
      },
      50000,
    );
    assert.ok(detail);
    assert.equal(detail!.reference, "1483181337");
    assert.equal(detail!.senderName, "Jay Dunn");
    assert.equal(detail!.senderIban, "NL00BANK0123456789");
  });

  it("normalises the IBAN (strip spaces, uppercase)", () => {
    const detail = parseStatementForMatch(
      {
        transactions: [
          {
            type: "CREDIT",
            amount: { value: 300, currency: "EUR" },
            details: { sender: { iban: "de89 3704 0044 0532 0130 00" } },
          },
        ],
      },
      30000,
    );
    assert.equal(detail!.senderIban, "DE89370400440532013000");
  });

  it("returns null when no credit matches the amount", () => {
    const detail = parseStatementForMatch(
      {
        transactions: [
          { type: "CREDIT", amount: { value: 250, currency: "USD" } },
        ],
      },
      50000,
    );
    assert.equal(detail, null);
  });

  it("returns null when several credits share the amount (ambiguous)", () => {
    const detail = parseStatementForMatch(
      {
        transactions: [
          { type: "CREDIT", amount: { value: 500 }, details: { reference: "a" } },
          { type: "CREDIT", amount: { value: 500 }, details: { reference: "b" } },
        ],
      },
      50000,
    );
    assert.equal(detail, null);
  });

  it("tolerates 1-cent rounding", () => {
    const detail = parseStatementForMatch(
      {
        transactions: [
          { type: "CREDIT", amount: { value: 500.01 }, details: { reference: "x" } },
        ],
      },
      50000,
    );
    assert.ok(detail);
    assert.equal(detail!.reference, "x");
  });

  it("handles an empty statement", () => {
    assert.equal(parseStatementForMatch({}, 50000), null);
    assert.equal(parseStatementForMatch({ transactions: [] }, 50000), null);
  });
});
