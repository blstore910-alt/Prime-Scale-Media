import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";

export const runtime = "nodejs";

// ── THE INVOICE THAT COMES WITH A PAYOUT ────────────────────────────────
//
// The owner, 22-09: "invoice met referral earning auto created met zijn
// bedrijfsgegevens voor ons". An affiliate is not going to send us a
// neat invoice for a commission we calculated ourselves, so we write it
// for them — a SELF-BILLED invoice: their details as the supplier, ours
// as the customer, the payout's own number, and the exact figures that
// were transferred (including the conversion and its fee).
//
// It is generated from the payout row, so it can never drift from what
// was actually paid, and it exists the moment the payout does. The page
// prints to PDF from the browser; nothing is stored, so there is no
// second copy to go stale.
//
// Readable by the affiliate it belongs to and by an admin of the tenant.
// The read runs with the service key because the affiliate may not read
// our own company row or their commission rows directly (plak 50), so
// the check is done here, explicitly, before anything is rendered.

type PayoutRow = {
  id: string;
  tenant_id: string;
  affiliate_advertiser_id: string;
  currency: string;
  amount: number | string | null;
  commission_count: number | null;
  clawback_amount: number | string | null;
  status: string;
  reference: string | null;
  requested_at: string;
  paid_at: string | null;
  group_id?: string | null;
  payout_no?: number | null;
  payout_currency?: string | null;
  fx_rate?: number | string | null;
  fx_fee_pct?: number | string | null;
  fx_fee_amount?: number | string | null;
  payout_amount?: number | string | null;
  details?: Record<string, string> | null;
};

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: unknown, currency: string) => {
  const v = Number(n) || 0;
  const sym = String(currency).toUpperCase() === "USD" ? "$" : "€";
  return `${sym}${v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ payoutId: string }> },
) {
  try {
    const { payoutId } = await params;

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Not configured." }, { status: 500 });
    }
    const admin = createServiceClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: one, error: oneError } = await admin
      .from("affiliate_payouts")
      .select("*")
      .eq("id", payoutId)
      .maybeSingle();
    if (oneError) {
      return NextResponse.json({ error: safeErrorMessage(oneError) }, { status: 500 });
    }
    if (!one) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }
    const head = one as PayoutRow;

    // Everything asked for in the same breath is one transfer, so it is
    // one invoice.
    const groupKey = head.group_id ?? head.id;
    const { data: groupRows } = await admin
      .from("affiliate_payouts")
      .select("*")
      .or(`group_id.eq.${groupKey},id.eq.${groupKey}`)
      .eq("affiliate_advertiser_id", head.affiliate_advertiser_id);
    const rows = ((groupRows ?? [head]) as PayoutRow[]).filter(
      (r) => (r.group_id ?? r.id) === groupKey,
    );

    const { data: adv } = await admin
      .from("advertisers")
      .select("id, user_id, tenant_id, tenant_client_code")
      .eq("id", head.affiliate_advertiser_id)
      .maybeSingle();

    // ── WHO MAY SEE IT ────────────────────────────────────────────
    let allowed = adv?.user_id === user.id;
    if (!allowed) {
      const { data: profiles } = await admin
        .from("user_profiles")
        .select("role, tenant_id, is_active")
        .eq("user_id", user.id)
        .eq("tenant_id", head.tenant_id);
      allowed = (profiles ?? []).some(
        (p: { role?: string | null; is_active?: boolean | null }) =>
          String(p.role ?? "").toLowerCase() === "admin" && p.is_active !== false,
      );
    }
    if (!allowed) {
      return NextResponse.json({ error: "Not yours." }, { status: 403 });
    }

    const { data: profile } = adv?.user_id
      ? await admin
          .from("user_profiles")
          .select("full_name, email")
          .eq("user_id", adv.user_id)
          .maybeSingle()
      : { data: null };

    // Our own company: the tenant-level row an admin filled in, or the
    // env fallback the invoice PDF uses.
    const { data: issuer } = await admin
      .from("companies")
      .select("name, address, state, country, zipcode, vat_no, registration_no, official_email")
      .eq("tenant_id", head.tenant_id)
      .is("advertiser_id", null)
      .maybeSingle();

    const issuerName = issuer?.name || process.env.INVOICE_ISSUER_NAME || "Prime Scale Media";
    const issuerLines = [
      issuer?.address,
      [issuer?.state, issuer?.country, issuer?.zipcode].filter(Boolean).join(", "),
      issuer?.vat_no ? `VAT ${issuer.vat_no}` : null,
      issuer?.registration_no ? `Reg. ${issuer.registration_no}` : null,
      issuer?.official_email,
    ].filter(Boolean) as string[];

    const d = (head.details ?? {}) as Record<string, string>;
    const supplierName = d.holder || profile?.full_name || "Affiliate";
    const supplierLines = [
      d.address,
      d.taxId ? `VAT / Tax ID ${d.taxId}` : null,
      d.iban ? `IBAN ${d.iban}` : null,
      d.bic ? `BIC ${d.bic}` : null,
      d.bankName ? `${d.bankName}${d.accountNumber ? ` · ${d.accountNumber}` : ""}` : null,
      profile?.email,
      adv?.tenant_client_code ? `Partner ${adv.tenant_client_code}` : null,
    ].filter(Boolean) as string[];

    const no = head.payout_no ? `Payout #${head.payout_no}` : `Payout ${head.id.slice(0, 8)}`;
    const isPaid = head.status === "paid";
    const dateLine = isPaid ? day(head.paid_at ?? head.requested_at) : day(head.requested_at);

    const lines = rows.flatMap((r) => {
      const src = String(r.currency).toUpperCase();
      const dst = String(r.payout_currency ?? r.currency).toUpperCase();
      const out: { text: string; amount: string }[] = [
        {
          text: `Referral commission — ${r.commission_count ?? 0} ${
            (r.commission_count ?? 0) === 1 ? "commission" : "commissions"
          } in ${src}`,
          amount: money(r.amount, src),
        },
      ];
      if (Number(r.clawback_amount) > 0) {
        out.push({
          text: "Already settled against returned ad spend",
          amount: `− ${money(r.clawback_amount, src)}`,
        });
      }
      if (dst !== src) {
        out.push({
          text: `Converted to ${dst} at 1 USD = ${Number(r.fx_rate ?? 0).toFixed(4)} EUR`,
          amount: money(
            (Number(r.payout_amount) || 0) + (Number(r.fx_fee_amount) || 0),
            dst,
          ),
        });
        out.push({
          text: `Conversion fee ${Number(r.fx_fee_pct ?? 0)}%`,
          amount: `− ${money(r.fx_fee_amount, dst)}`,
        });
      }
      return out;
    });

    const totals: Record<string, number> = {};
    for (const r of rows) {
      const dst = String(r.payout_currency ?? r.currency).toUpperCase();
      totals[dst] = Math.round(((totals[dst] ?? 0) + (Number(r.payout_amount ?? r.amount) || 0)) * 100) / 100;
    }

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(no)} — ${esc(supplierName)}</title>
<style>
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:#eef1f8;color:#12162a;
    font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .sheet{max-width:820px;margin:24px auto;background:#fff;padding:44px 48px;border-radius:14px;
    box-shadow:0 20px 50px -30px rgba(20,30,80,.5)}
  .top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:32px}
  h1{font-size:1.5rem;margin:0 0 4px;letter-spacing:-.02em}
  .muted{color:#5c6577}
  .small{font-size:.86rem}
  .pill{display:inline-block;padding:4px 10px;border-radius:99px;font-size:.74rem;font-weight:700;
    background:#eaf1ff;color:#2f5ae6}
  .pill.paid{background:#e7f8f1;color:#0e8f66}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
  .parties h2{font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#8b93a6;margin:0 0 6px}
  .parties b{display:block;font-size:1rem;margin-bottom:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:22px}
  th{text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:#8b93a6;
    border-bottom:1px solid #e6e9f2;padding:0 0 8px}
  td{padding:10px 0;border-bottom:1px solid #f1f4fb;vertical-align:top}
  td.r,th.r{text-align:right}
  .totals{display:flex;justify-content:flex-end}
  .totals div{min-width:260px}
  .totals .row{display:flex;justify-content:space-between;padding:8px 0}
  .totals .row.big{border-top:2px solid #12162a;font-weight:800;font-size:1.1rem}
  .note{margin-top:26px;padding:14px 16px;border-radius:12px;background:#f7f8fd;color:#5c6577;font-size:.84rem}
  .print{position:fixed;right:18px;top:18px;background:#3a6fff;color:#fff;border:0;border-radius:10px;
    padding:10px 16px;font:inherit;font-weight:700;cursor:pointer;box-shadow:0 10px 24px -12px rgba(58,111,255,.8)}
  @media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;padding:0}.print{display:none}}
  @media (max-width:640px){
    .sheet{margin:12px;padding:22px 18px;border-radius:12px}
    .top{flex-direction:column;gap:10px}
    .top .small{text-align:left}
    h1{font-size:1.2rem}
    .parties{grid-template-columns:1fr;gap:16px}
    .totals div{min-width:0;width:100%}
    .print{position:static;display:block;width:calc(100% - 24px);margin:12px auto 0}
  }
</style></head>
<body>
<button class="print" onclick="window.print()">Save as PDF</button>
<div class="sheet">
  <div class="top">
    <div>
      <h1>Self-billed invoice</h1>
      <div class="muted small">${esc(no)} · ${esc(dateLine)}</div>
      <div style="margin-top:8px"><span class="pill ${isPaid ? "paid" : ""}">${
        isPaid ? "Paid" : "Awaiting transfer"
      }</span></div>
    </div>
    <div class="small muted" style="text-align:right">
      ${head.reference ? `Reference<br /><b>${esc(head.reference)}</b>` : ""}
    </div>
  </div>

  <div class="parties">
    <div>
      <h2>From (supplier)</h2>
      <b>${esc(supplierName)}</b>
      ${supplierLines.map((l) => `<div class="small muted">${esc(l)}</div>`).join("")}
    </div>
    <div>
      <h2>To (customer)</h2>
      <b>${esc(issuerName)}</b>
      ${issuerLines.map((l) => `<div class="small muted">${esc(l)}</div>`).join("")}
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
    <tbody>
      ${lines
        .map(
          (l) =>
            `<tr><td>${esc(l.text)}</td><td class="r">${esc(l.amount)}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals"><div>
    ${Object.entries(totals)
      .map(
        ([cur, amt]) =>
          `<div class="row big"><span>Total ${esc(cur)}</span><span>${esc(
            money(amt, cur),
          )}</span></div>`,
      )
      .join("")}
  </div></div>

  <div class="note">
    This invoice is raised by ${esc(issuerName)} on behalf of the supplier
    (self-billing) for referral commission earned through the Prime Scale
    Media partner programme. Amounts are as transferred; VAT is handled
    according to the supplier's own registration.
  </div>
</div>
</body></html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
