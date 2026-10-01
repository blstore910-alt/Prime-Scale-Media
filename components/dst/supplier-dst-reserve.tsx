"use client";

// ── WHAT THE SUPPLIERS HOLD BACK FOR TAX ────────────────────────────
//
// The owner, 29-09: "en je kan miss ook van rockads en seamx in de dst
// verwerken?"
//
// Part of it, and the answer to the rest belongs on this screen rather
// than in a message, because this is where somebody will next wonder.
//
// WHAT A DST LINE NEEDS is the SPEND per customer, per country, per
// week. Neither supplier will tell us. Falkyn exposes three endpoints
// (top-ups, withdrawals, wallet balance) and RockAds two (wallets,
// ad-accounts); there is no statistics, insights or reporting endpoint
// on either. So the weekly lines on this screen are still typed.
//
// WHAT THEY DO REPORT is this: Falkyn states a wallet balance AND a
// spendable balance, and the gap between them is the tax they are
// holding back off our own money. That is a real DST figure from a real
// supplier, it is OUR cost, and until now nobody could see it without
// logging into their site. RockAds reports no tax figure at all.
//
// WHY THE GAP CANNOT BE CLOSED BY ARITHMETIC EITHER. Spend is
// derivable in principle -- top-ups we pushed in, minus the balance
// now, minus withdrawals -- but every one of our twelve ad accounts is
// missing the supplier's own account id (`ad_accounts.metadata` holds
// Facebook BM fields and nothing else), so there is no way to line our
// account up with their balance. That mapping is the blocker, and it is
// a one-time job on the data, not a change to this code.

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical, Landmark } from "lucide-react";
import { formatCurrency } from "@/lib/utils-pure";
import type { SupplierHolding } from "@/lib/pure-supplier-holdings";

type Payload = {
  suppliers: SupplierHolding[];
  total: { currency: string; total: number }[];
  totalComplete: boolean;
  readAt: string;
};

export default function SupplierDstReserve() {
  // Same query key as the dashboard panel, so opening both does not ask
  // two third parties twice and the two screens can never disagree.
  const q = useQuery<Payload>({
    queryKey: ["supplier-balances"],
    queryFn: async () => {
      const res = await fetch("/api/supplier-balances", { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not read the supplier balances (${res.status}).`);
      return (await res.json()) as Payload;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const suppliers = q.data?.suppliers ?? [];
  const reserving = suppliers.filter((s) =>
    s.lines.some((l) => l.heldBack !== null),
  );
  const broken = suppliers.filter((s) => s.status === "error");

  // Nothing held back and nothing wrong is a clean desk, and a card that
  // says so every day is a card people stop reading -- the same rule the
  // chase banner above this one follows.
  if (q.isPending || (!reserving.length && !broken.length)) return null;

  return (
    <div className="mb-4 rounded-xl border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-muted text-muted-foreground">
          <Landmark className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold">
            What the suppliers are holding back for tax
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Our cost, sitting at the supplier — not something we can recharge
            from here. The lines below are what we charge customers.
          </p>

          <div className="mt-2.5 flex flex-col gap-1.5">
            {/* GROUPED BY SUPPLIER, not one flat list of lines.
                Walked on production, 29-09: Falkyn holds back in both
                currencies, so a line per currency printed "Falkyn /
                TEST DATA" twice and the card read as two different
                suppliers. The name is the heading; the currencies sit
                under it. */}
            {reserving.map((s) => (
              <div key={s.supplier} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{s.supplier}</span>
                  {s.status === "demo" ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
                      test data
                    </span>
                  ) : null}
                </div>
                {s.lines
                  .filter((l) => l.heldBack !== null)
                  .map((l) => (
                    <div
                      key={l.currency}
                      className="flex flex-wrap items-baseline gap-x-2 border-l-2 pl-2.5 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {l.currency}
                      </span>
                      <span className="ml-auto font-semibold tabular-nums">
                        {formatCurrency(l.heldBack!, l.currency)}
                      </span>
                      <span className="w-full text-xs text-muted-foreground">
                        of {formatCurrency(l.total, l.currency)} on the wallet;{" "}
                        {formatCurrency(l.available ?? l.total, l.currency)}{" "}
                        spendable.
                      </span>
                    </div>
                  ))}
              </div>
            ))}

            {broken.map((s) => (
              <p
                key={s.supplier}
                className="m-0 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="mt-px h-3.5 w-3.5 flex-none" />
                <span>
                  {s.supplier} did not answer, so we do not know what it is
                  holding. {s.error}
                </span>
              </p>
            ))}
          </div>

          {reserving.some((s) => s.status === "demo") ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50/60 p-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/5 dark:text-amber-400">
              <FlaskConical className="mt-px h-3.5 w-3.5 flex-none" />
              <span>
                Falkyn is on the mock adapter, so that figure is invented and
                identical every time. Set SUPPLIER1_MODE to &quot;live&quot; to
                read the real reserve.
              </span>
            </p>
          ) : null}

          {/* THE ANSWER TO THE QUESTION, ON THE SCREEN WHERE IT IS ASKED.
              Somebody looking at a tax figure from a supplier will
              reasonably assume the weekly lines can come from there too.
              They cannot, and saying so here saves the next person the
              afternoon it took to establish it. */}
          <p className="mt-2 text-xs text-muted-foreground">
            This is the only DST figure either supplier reports. Neither has an
            endpoint for spend per account, so the weeks below are still
            entered by hand.
          </p>
        </div>
      </div>
    </div>
  );
}
