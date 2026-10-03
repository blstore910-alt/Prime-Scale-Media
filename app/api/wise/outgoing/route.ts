import { NextResponse } from "next/server";
import { apiRequireOwner } from "@/lib/auth/api-require-admin";
import { fetchWiseOutgoingTransfers } from "@/lib/integrations/wise-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/wise/outgoing?days=60
 *
 * Owners only. What we PAID through Wise, grouped by recipient name and
 * currency pair: count and totals. Built to see how the Muxue (Bestads)
 * payments look before booking them into the supplier balance
 * automatically -- what the recipient is called, and whether the money
 * arrives as USD or as EUR. No account numbers, no references.
 */
export async function GET(req: Request) {
  const { error: authError } = await apiRequireOwner();
  if (authError) return authError;

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 60) || 60, 1), 365);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const r = await fetchWiseOutgoingTransfers({ sinceIso: since });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });

  const groups = new Map<string, { recipient: string; pair: string; count: number; source: number; target: number; statuses: Record<string, number>; last: string }>();
  for (const t of r.transfers) {
    const recipient = t.recipientName ?? "(unknown)";
    const pair = `${t.sourceCurrency}->${t.targetCurrency}`;
    const key = `${recipient}|${pair}`;
    const g = groups.get(key) ?? { recipient, pair, count: 0, source: 0, target: 0, statuses: {}, last: "" };
    g.count += 1;
    g.source += t.sourceValue;
    g.target += t.targetValue;
    g.statuses[t.status] = (g.statuses[t.status] ?? 0) + 1;
    if (t.created > g.last) g.last = t.created;
    groups.set(key, g);
  }
  return NextResponse.json(
    {
      ok: true,
      days,
      transfers: r.transfers.length,
      groups: [...groups.values()]
        .map((g) => ({ ...g, source: Math.round(g.source * 100) / 100, target: Math.round(g.target * 100) / 100 }))
        .sort((a, b) => b.count - a.count),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
