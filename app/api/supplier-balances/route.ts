// ── WHAT WE HOLD AT THE SUPPLIERS, RIGHT NOW ────────────────────────
//
// The owner, 29-09: "kunnen we in ons dashboard ook easy on balance
// zien wat we momenteel usd en eur hebben bij rockads en bij seamx."
//
// ADMIN-GATED, and it stays that way. A supplier balance is cost data:
// it names the suppliers, and the SeamX line exposes the tax they hold
// back from us. Neither belongs anywhere a customer or an affiliate can
// reach — not in the UI, not in the JSON behind it. This route is the
// JSON behind it, so the guard is the whole point.
//
// An employee admin DOES see it, deliberately. It is not profit — it is
// whether a top-up they are about to verify can actually be pushed
// today. An admin who cannot see the credit behind the queue is an
// admin verifying blind.
//
// WHY BOTH SUPPLIERS IN ONE ROUTE, AND WHY NEITHER CAN HIDE THE OTHER.
// Two fetches to two third parties, and each can be slow, off or down
// independently. `allSettled`, not `all`: with `all` a RockAds timeout
// takes the SeamX figure down with it, and the screen would say nothing
// is known when half of it is.

import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { NextResponse } from "next/server";
import { fetchRockadsWallets } from "@/lib/integrations/rockads-api";
import { getSupplier1Adapter } from "@/lib/integrations/supplier1";
import { isSupplier1Live } from "@/lib/integrations/autopush";
import { safeErrorMessage } from "@/lib/pure-error";
import {
  rockadsHoldings,
  seamxHoldings,
  totalHoldings,
  type SupplierHolding,
} from "@/lib/pure-supplier-holdings";

// Live figures. A cached supplier balance is worse than none: it is the
// number somebody funds against, and it would be stale by exactly as
// long as the cache.
export const dynamic = "force-dynamic";

const rockadsOn = () =>
  !!process.env.ROCKADS_API_KEY && !!process.env.ROCKADS_API_SECRET;
const seamxOn = () =>
  !!process.env.SUPPLIER1_BASE_URL && !!process.env.SUPPLIER1_AUTH_TOKEN;

async function rockads(): Promise<SupplierHolding> {
  const base = { supplier: "RockAds" } as const;
  if (!rockadsOn()) {
    return { ...base, status: "off", error: null, lines: [] };
  }
  try {
    const { wallets, error } = await fetchRockadsWallets();
    if (error) return { ...base, status: "error", error, lines: [] };
    const { lines, skipped } = rockadsHoldings(wallets);
    return {
      ...base,
      status: "ok",
      // Not an error — the read worked. But a wallet we could not place
      // on a currency line is money missing from the figure, and saying
      // so is the difference between a total and a total-ish.
      error: skipped
        ? `${skipped} wallet${skipped === 1 ? "" : "s"} had no currency and are not in these figures.`
        : null,
      lines,
    };
  } catch (err) {
    return { ...base, status: "error", error: safeErrorMessage(err), lines: [] };
  }
}

// ── THE MOCK ANSWERS `ok: true` WITH FIVE THOUSAND DOLLARS ─────────
//
// getSupplier1Adapter() hands back the MOCK unless SUPPLIER1_MODE is
// exactly "live", and the default is mock. The mock's getWalletBalance
// returns USD 5,000 / EUR 2,000 with a 3% reserve and no indication
// whatsoever that it is invented. Reported as "ok" this would put fake
// supplier credit on the dashboard of the one person who decides
// whether a top-up can be funded — the exact fault class this app has
// spent the week closing, and the most expensive version of it.
//
// So the mode is read here, and mock figures come back as `demo`. They
// are still shown, because knowing the mock is on is worth more than a
// blank panel, but they are labelled and they are kept out of the
// total.
async function seamx(): Promise<SupplierHolding> {
  const base = { supplier: "SeamX" } as const;
  const live = isSupplier1Live();
  if (live && !seamxOn()) {
    return { ...base, status: "off", error: null, lines: [] };
  }
  try {
    const res = await getSupplier1Adapter().getWalletBalance();
    if (!res.ok) {
      return { ...base, status: "error", error: res.error, lines: [] };
    }
    return {
      ...base,
      status: live ? "ok" : "demo",
      error: live
        ? null
        : "SUPPLIER1_MODE is not 'live', so these are the mock adapter's figures, not SeamX's.",
      lines: seamxHoldings(res.data),
    };
  } catch (err) {
    return { ...base, status: "error", error: safeErrorMessage(err), lines: [] };
  }
}

export async function GET() {
  const { error } = await apiRequireAdmin();
  if (error) return error;

  // Neither of these rejects — both resolve to a status — but allSettled
  // guarantees that even a throw inside the guard clauses cannot turn
  // one slow supplier into a 500 for both.
  const settled = await Promise.allSettled([rockads(), seamx()]);
  const suppliers: SupplierHolding[] = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          supplier: i === 0 ? "RockAds" : "SeamX",
          status: "error",
          error: safeErrorMessage(s.reason),
          lines: [],
        },
  );

  const total = totalHoldings(suppliers);
  return NextResponse.json({
    suppliers,
    total: total.lines,
    // False means one supplier did not answer, so the sum below is not
    // everything we hold. The panel prints "at least" rather than a
    // figure that reads as complete.
    totalComplete: total.complete,
    readAt: new Date().toISOString(),
  });
}
