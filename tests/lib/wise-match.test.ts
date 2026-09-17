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

  it("REFUSES a lone amount match — an amount is a coincidence", () => {
    // Ten customers can wire EUR 5.00 on the same day. If one of them has
    // filed a claim and another one's money lands first, matching on the
    // amount credits the wrong customer's wallet — and every figure
    // checks out afterwards, so nothing downstream can catch it.
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: null },
      [topup({ id: "solo" })],
    );
    assert.equal(res.matched, false);
    if (!res.matched) assert.match(res.reason, /nothing proves it is this payment/);
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

describe("reference AND amount AND date", () => {
  const claim = (over: Record<string, unknown> = {}) => ({
    id: "t1",
    reference_no: 1483181337,
    amount: 500,
    currency: "USD",
    status: "pending",
    created_at: "2026-09-17T10:00:00Z",
    ...over,
  });

  it("matches when all three agree", () => {
    const res = matchIncomingTransfer(
      {
        amount_cents: 50000,
        currency: "USD",
        reference: "1483181337",
        occurred_at: "2026-09-17T19:00:00Z",
      },
      [claim()],
    );
    assert.equal(res.matched, true);
  });

  it("refuses a claim filed two months before the payment", () => {
    // Reference plus amount alone will marry a deposit to an old unpaid
    // claim, and that is somebody else's money. Ten payments in one day
    // are fine — they carry ten different references — but a payment can
    // never settle a claim from another era.
    const res = matchIncomingTransfer(
      {
        amount_cents: 50000,
        currency: "USD",
        reference: "1483181337",
        occurred_at: "2026-09-17T19:00:00Z",
      },
      [claim({ created_at: "2026-06-01T10:00:00Z" })],
    );
    assert.equal(res.matched, false);
    if (!res.matched) assert.match(res.reason, /too far from this payment/);
  });

  it("refuses a claim filed a month after the payment", () => {
    const res = matchIncomingTransfer(
      {
        amount_cents: 50000,
        currency: "USD",
        reference: "1483181337",
        occurred_at: "2026-09-17T19:00:00Z",
      },
      [claim({ created_at: "2026-10-20T10:00:00Z" })],
    );
    assert.equal(res.matched, false);
  });

  it("allows the ordinary order: pay first, file the claim after", () => {
    // People transfer and then tell us, sometimes days later if it sat in
    // a weekend.
    const res = matchIncomingTransfer(
      {
        amount_cents: 50000,
        currency: "USD",
        reference: "1483181337",
        occurred_at: "2026-09-14T19:00:00Z",
      },
      [claim({ created_at: "2026-09-17T10:00:00Z" })],
    );
    assert.equal(res.matched, true);
  });

  it("ten payments in one day settle ten different claims", () => {
    // One person, one day, ten transfers — each with its own reference,
    // which is what the app hands out per claim. Every one of them has to
    // land on its own claim.
    const claims = Array.from({ length: 10 }, (_, i) =>
      claim({ id: `t${i}`, reference_no: 1000000000 + i }),
    );
    for (let i = 0; i < 10; i++) {
      const res = matchIncomingTransfer(
        {
          amount_cents: 50000,
          currency: "USD",
          reference: String(1000000000 + i),
          occurred_at: "2026-09-17T19:00:00Z",
        },
        claims,
      );
      assert.equal(res.matched, true);
      if (res.matched) assert.equal(res.topupId, `t${i}`);
    }
  });

  it("no date on either side does not block a reference match", () => {
    // Older rows have no occurred_at to compare against, and the
    // reference is still the strongest signal we have.
    const res = matchIncomingTransfer(
      { amount_cents: 50000, currency: "USD", reference: "1483181337" },
      [claim({ created_at: null })],
    );
    assert.equal(res.matched, true);
  });
});
