import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  parseStatementForMatch,
  referenceFromDescription,
} from "../../lib/integrations/wise-api.ts";

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

describe("the description Wise actually sends", () => {
it("a reference Wise only wrote in prose is still found", () => {
  // 231 deposits on this account, none with a reference — because Wise
  // reports SEPA references in the description ("… with reference X") and
  // leaves details.paymentReference null. The reference was sitting right
  // there in words the whole time.
  assert.equal(
    referenceFromDescription(
      "Received money from JOHN DOE with reference 0005-6164655424",
    ),
    "0005-6164655424",
  );
  assert.equal(
    referenceFromDescription("Sent from Barclays. Reference: 6164655424"),
    "6164655424",
  );
});

it("prose with no reference does not invent one", () => {
  // The description also carries the SENDER'S NAME and the amount, so a
  // loose "longest run of digits" would return a fragment of an account
  // number or a date and hand the matcher a confident wrong answer.
  assert.equal(referenceFromDescription("Received money from JOHN DOE"), null);
  assert.equal(
    referenceFromDescription("Card transaction 12/09/2026 EUR 5.00"),
    null,
  );
  assert.equal(referenceFromDescription(null), null);
  assert.equal(referenceFromDescription(""), null);
});

it("the statement parser keeps the description it read", () => {
  const d = parseStatementForMatch(
    {
      transactions: [
        {
          type: "CREDIT",
          amount: { value: 5, currency: "EUR" },
          details: {
            description: "Received money from JOHN DOE with reference 0005-6164655424",
          },
        },
      ],
    },
    500,
  );
  assert.ok(d);
  assert.equal(d!.reference, "0005-6164655424");
  assert.match(d!.description ?? "", /JOHN DOE/);
});
});

describe("more than one credit of the same amount", () => {
  const line = (date: string, ref: string) => ({
    type: "CREDIT",
    amount: { value: 5, currency: "EUR" },
    date,
    details: { paymentReference: ref },
  });

  it("picks the one nearest the moment the webhook reported", () => {
    // This used to give up, and on a real account that is the NORMAL case:
    // dozens of 0.01 test payments mean almost every enrichment returned
    // null, which is why 231 deposits arrived with no reference at all.
    const d = parseStatementForMatch(
      {
        transactions: [
          line("2026-09-17T10:00:00Z", "1111111111"),
          line("2026-09-17T19:01:30Z", "2222222222"),
          line("2026-09-16T08:00:00Z", "3333333333"),
        ],
      },
      500,
      "2026-09-17T19:01:32Z",
    );
    assert.ok(d);
    assert.equal(d!.reference, "2222222222");
  });

  it("still refuses when two are within a minute of each other", () => {
    // Genuinely indistinguishable. Guessing here would attach one payer's
    // reference to another payer's money.
    const d = parseStatementForMatch(
      {
        transactions: [
          line("2026-09-17T19:01:30Z", "2222222222"),
          line("2026-09-17T19:01:50Z", "4444444444"),
        ],
      },
      500,
      "2026-09-17T19:01:32Z",
    );
    assert.equal(d, null);
  });

  it("refuses when the webhook gave no time to compare against", () => {
    const d = parseStatementForMatch(
      {
        transactions: [
          line("2026-09-17T10:00:00Z", "1111111111"),
          line("2026-09-17T19:01:30Z", "2222222222"),
        ],
      },
      500,
    );
    assert.equal(d, null);
  });
});
