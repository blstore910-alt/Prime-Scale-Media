import { test } from "node:test";
import assert from "node:assert/strict";
import {
  replayBalance,
  type WalletTopupAuditEvent,
} from "../../lib/wallet-recovery-pure.ts";

const W = "wallet-1";
const OTHER = "wallet-2";

function evt(
  before: WalletTopupAuditEvent["before_data"],
  after: WalletTopupAuditEvent["after_data"],
): WalletTopupAuditEvent {
  return { action: before && after ? "UPDATE" : after ? "INSERT" : "DELETE", before_data: before, after_data: after };
}

test("replayBalance — empty stream → zero balance, 0 events", () => {
  const r = replayBalance([], W);
  assert.deepEqual(r, { usd: 0, eur: 0, eventCount: 0 });
});

test("replayBalance — ignores events for other wallets", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(
      { wallet_id: OTHER, status: "pending", amount: 100, currency: "EUR" },
      { wallet_id: OTHER, status: "completed", amount: 100, currency: "EUR" },
    ),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.eventCount, 0);
  assert.equal(r.eur, 0);
});

test("replayBalance — pending → completed = +amount", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(
      { wallet_id: W, status: "pending", amount: 300, currency: "EUR" },
      { wallet_id: W, status: "completed", amount: 300, currency: "EUR" },
    ),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.eur, 300);
  assert.equal(r.usd, 0);
});

test("replayBalance — completed → rejected = -amount", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(
      { wallet_id: W, status: "pending", amount: 500, currency: "USD" },
      { wallet_id: W, status: "completed", amount: 500, currency: "USD" },
    ),
    evt(
      { wallet_id: W, status: "completed", amount: 500, currency: "USD" },
      { wallet_id: W, status: "rejected", amount: 500, currency: "USD" },
    ),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.usd, 0);
});

test("replayBalance — multiple approvals sum", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(
      { wallet_id: W, status: "pending", amount: 100, currency: "EUR" },
      { wallet_id: W, status: "completed", amount: 100, currency: "EUR" },
    ),
    evt(
      { wallet_id: W, status: "pending", amount: 250, currency: "EUR" },
      { wallet_id: W, status: "completed", amount: 250, currency: "EUR" },
    ),
    evt(
      { wallet_id: W, status: "pending", amount: 400, currency: "USD" },
      { wallet_id: W, status: "completed", amount: 400, currency: "USD" },
    ),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.eur, 350);
  assert.equal(r.usd, 400);
  assert.equal(r.eventCount, 3);
});

test("replayBalance — pending → rejected is a no-op", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(
      { wallet_id: W, status: "pending", amount: 100, currency: "EUR" },
      { wallet_id: W, status: "rejected", amount: 100, currency: "EUR" },
    ),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.eur, 0);
  assert.equal(r.usd, 0);
  assert.equal(r.eventCount, 1);
});

test("replayBalance — undo reverses a completion", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(
      { wallet_id: W, status: "pending", amount: 100, currency: "EUR" },
      { wallet_id: W, status: "completed", amount: 100, currency: "EUR" },
    ),
    evt(
      { wallet_id: W, status: "completed", amount: 100, currency: "EUR" },
      { wallet_id: W, status: "pending", amount: 100, currency: "EUR" },
    ),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.eur, 0);
});

test("replayBalance — INSERT with status=pending is a no-op", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(null, {
      wallet_id: W,
      status: "pending",
      amount: 999,
      currency: "EUR",
    }),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.eur, 0);
});

test("replayBalance — string amounts (JSONB) parse cleanly", () => {
  const events: WalletTopupAuditEvent[] = [
    evt(
      { wallet_id: W, status: "pending", amount: "300.50", currency: "EUR" },
      { wallet_id: W, status: "completed", amount: "300.50", currency: "EUR" },
    ),
  ];
  const r = replayBalance(events, W);
  assert.equal(r.eur, 300.5);
});
