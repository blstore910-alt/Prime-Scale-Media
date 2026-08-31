import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  matchIncomingTransfer,
  extractReferenceDigits,
  type PendingTopup,
} from "../../lib/integrations/wise-match.ts";

const topup = (over: Partial<PendingTopup>): PendingTopup => ({
  id: "t1",
  reference_no: 1483181337,
  amount: 500,
  currency: "USD",
  status: "pending",
  advertiser_id: "adv-1",
  ...over,
});

describe("extractReferenceDigits", () => {
  it("pulls the longest digit run", () => {
    assert.equal(extractReferenceDigits("PSM-TOPUP 1483181337"), "1483181337");
    assert.equal(extractReferenceDigits("ref: 1483181337 thanks"), "1483181337");
  });
  it("returns null when there's no long run", () => {
    assert.equal(extractReferenceDigits("thank you"), null);
    assert.equal(extractReferenceDigits(null), null);
    assert.equal(extractReferenceDigits("12"), null);
  });
});

describe("matchIncomingTransfer", () => {
  it("matches on reference + amount", () => {
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: "PSM 1483181337" },
      [topup({ id: "a" }), topup({ id: "b", reference_no: 999, amount: 500 })],
    );
    assert.equal(res.matched, true);
    if (res.matched) {
      assert.equal(res.topupId, "a");
      assert.equal(res.via, "reference");
    }
  });

  it("matches the single amount+currency candidate with no reference", () => {
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: null },
      [topup({ id: "solo" })],
    );
    assert.equal(res.matched, true);
    if (res.matched) assert.equal(res.via, "amount");
  });

  it("refuses when multiple topups share the amount and no reference", () => {
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: null },
      [topup({ id: "a" }), topup({ id: "b", reference_no: 222 })],
    );
    assert.equal(res.matched, false);
  });

  it("no match when amount differs beyond tolerance", () => {
    const res = matchIncomingTransfer(
      { amount_cents: 49900, currency: "USD", reference: "1483181337" },
      [topup({})],
    );
    assert.equal(res.matched, false);
  });

  it("allows 1 cent rounding tolerance", () => {
    const res = matchIncomingTransfer(
      { amount_cents: 50001, currency: "USD", reference: "1483181337" },
      [topup({})],
    );
    assert.equal(res.matched, true);
  });

  it("ignores non-pending and wrong-currency topups", () => {
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: "1483181337" },
      [
        topup({ id: "done", status: "completed" }),
        topup({ id: "eur", currency: "EUR" }),
      ],
    );
    assert.equal(res.matched, false);
  });

  it("prefers reference even amid several amount matches", () => {
    // Real references are 10-digit; the matcher ignores short digit
    // runs (< 4) to avoid latching onto stray numbers in bank text.
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: "ref 1483181999" },
      [
        topup({ id: "a", reference_no: 1483181111 }),
        topup({ id: "b", reference_no: 1483181999 }),
        topup({ id: "c", reference_no: 1483181222 }),
      ],
    );
    assert.equal(res.matched, true);
    if (res.matched) {
      assert.equal(res.topupId, "b");
      assert.equal(res.via, "reference");
    }
  });

  it("known sender rescues same-amount collision (no reference)", () => {
    // Two customers both have a pending $500 topup, no reference.
    // Amount alone is ambiguous, but the sender IBAN is known to be
    // advertiser adv-2 → matches theirs.
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: null },
      [
        topup({ id: "a", advertiser_id: "adv-1" }),
        topup({ id: "b", advertiser_id: "adv-2" }),
      ],
      ["adv-2"],
    );
    assert.equal(res.matched, true);
    if (res.matched) {
      assert.equal(res.topupId, "b");
      assert.equal(res.via, "sender");
    }
  });

  it("same payer, multiple accounts, same amount, no reference → review", () => {
    // One customer runs 3 accounts from the same bank, each with a
    // pending $500 topup, and sent no reference. The sender is known
    // but can't disambiguate which account → manual review.
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: null },
      [
        topup({ id: "a", advertiser_id: "adv-9" }),
        topup({ id: "b", advertiser_id: "adv-9" }),
        topup({ id: "c", advertiser_id: "adv-9" }),
      ],
      ["adv-9"],
    );
    assert.equal(res.matched, false);
  });

  it("same payer multiple accounts BUT reference given → exact match", () => {
    // Same 3-account payer, but this time the reference is included —
    // it pins the exact topup regardless of the shared bank.
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: "1483181999" },
      [
        topup({ id: "a", advertiser_id: "adv-9", reference_no: 1483181111 }),
        topup({ id: "b", advertiser_id: "adv-9", reference_no: 1483181999 }),
        topup({ id: "c", advertiser_id: "adv-9", reference_no: 1483181222 }),
      ],
      ["adv-9"],
    );
    assert.equal(res.matched, true);
    if (res.matched) {
      assert.equal(res.topupId, "b");
      assert.equal(res.via, "reference");
    }
  });
});
