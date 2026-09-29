import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isTenantOwner } from "@/lib/auth/is-tenant-owner";
import { safeErrorMessage } from "@/lib/pure-error";
import {
  payoutInvoiceLines,
  payoutInvoiceTotals,
} from "@/lib/pure-payout-invoice";
import { buildSelfBilledInvoiceHtml } from "@/lib/invoice-pdf";
import {
  payoutGroupKey,
  payoutRef,
  payoutSequence,
  type PayoutRefRow,
} from "@/lib/pure-payout-ref";

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

    // ── WHO MAY SEE IT: THE AFFILIATE, OR THE OWNER ───────────────
    //
    // This allowed ANY admin of the tenant, and the page it stands in
    // for does not. `affiliate_payouts` has exactly one policy --
    // `affiliate_payouts_select` -- and it is
    // `tenants.owner_id = auth.uid() OR advertisers.user_id = auth.uid()`.
    // There is no admin branch. This route reads with the service key,
    // so RLS never runs and the route WAS the policy; it was wider than
    // the thing it replaced.
    //
    // What that hands over is not a figure: the invoice renders the
    // affiliate's IBAN, BIC, bank name, account number, tax id and
    // address out of the `details` jsonb. Measured 28-09: four admin
    // profiles, two of them not the owner.
    //
    // And `status`, not only `is_active`. Every other guard in this app
    // -- _is_admin_of, _require_profile, requireAdmin,
    // resolveAdminContext, apiRequireAdmin -- tests both, because
    // updateUserProfile allows the two columns to be set separately.
    let allowed = adv?.user_id === user.id;
    if (!allowed) {
      // One owner used to be the only owner, and this PDF carries
      // the affiliate's IBAN, BIC, tax id and address — a partner
      // being refused it would be a puzzling place to find out.
      // See lib/auth/is-tenant-owner.ts.
      const isOwner = await isTenantOwner(admin, head.tenant_id, user.id);
      if (isOwner) {
        const { data: profiles } = await admin
          .from("user_profiles")
          .select("role, tenant_id, is_active, status")
          .eq("user_id", user.id)
          .eq("tenant_id", head.tenant_id);
        allowed = (profiles ?? []).some(
          (p: {
            role?: string | null;
            is_active?: boolean | null;
            status?: string | null;
          }) =>
            String(p.role ?? "").toLowerCase() === "admin" &&
            p.is_active !== false &&
            String(p.status ?? "active").toLowerCase() !== "inactive",
        );
      }
    }
    if (!allowed) {
      // The SAME answer as a payout id that does not exist. A 403 here
      // and a 404 above tells a caller which random UUIDs are real.
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
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

    // ── THE SUPPLIER IS THEIR COMPANY, IF THEY HAVE ONE ───────────
    //
    // The owner, 28-09: "moet een invoice ontstaan van zijn bedrijf
    // naar turlit toe". This only ever read the payout's own `details`
    // jsonb — the account holder, typed into the request dialog — and
    // never the affiliate's `companies` row, where their registered
    // name, address, VAT number and registration number actually live.
    //
    // On a self-billed invoice the supplier is the legal entity, not
    // the name on a bank account (they can differ, and payout #3 was
    // sent back for exactly that). So the company row leads where it
    // exists, and what the affiliate typed fills the gaps — which is
    // what happens for PSM0008 today, who has no company row at all.
    //
    // The bank line stays either way: it is how the transfer was made,
    // and it belongs on the document that records it.
    const { data: supplierCo } = adv?.id
      ? await admin
          .from("companies")
          .select("name, address, state, country, zipcode, vat_no, registration_no")
          .eq("advertiser_id", adv.id)
          .maybeSingle()
      : { data: null };

    const d = (head.details ?? {}) as Record<string, string>;
    const supplierName =
      supplierCo?.name || d.holder || profile?.full_name || "Affiliate";
    const coAddress = supplierCo
      ? [
          supplierCo.address,
          [supplierCo.state, supplierCo.country, supplierCo.zipcode]
            .filter(Boolean)
            .join(", "),
        ].filter(Boolean)
      : [];
    const supplierLines = [
      ...(coAddress.length ? coAddress : [d.address]),
      supplierCo?.vat_no
        ? `VAT ${supplierCo.vat_no}`
        : d.taxId
          ? `VAT / Tax ID ${d.taxId}`
          : null,
      supplierCo?.registration_no ? `Reg. ${supplierCo.registration_no}` : null,
      // The holder only when it is NOT the company name — otherwise it
      // is the same line twice.
      supplierCo?.name && d.holder && d.holder.trim() !== supplierCo.name.trim()
        ? `Paid to ${d.holder}`
        : null,
      d.iban ? `IBAN ${d.iban}` : null,
      d.bic ? `BIC ${d.bic}` : null,
      d.bankName ? `${d.bankName}${d.accountNumber ? ` · ${d.accountNumber}` : ""}` : null,
      profile?.email,
      adv?.tenant_client_code ? `Partner ${adv.tenant_client_code}` : null,
    ].filter(Boolean) as string[];

    // ── A REFUSED PAYOUT HAS NO INVOICE ───────────────────────────
    //
    // Hiding the button is not enough: this URL is /api/payouts/<id>/
    // invoice and the affiliate owns the id — it is in their own
    // dialog, and anyone who opened it once has it in their history.
    //
    // `status` has four values and only two of them describe money
    // that is going somewhere. For the other two this route rendered
    // a self-billed invoice, raised by us in the affiliate's name,
    // headed "Awaiting transfer" — for a request we had already
    // refused with a reason.
    if (head.status === "rejected" || head.status === "cancelled") {
      return NextResponse.json(
        {
          error:
            head.status === "rejected"
              ? "This payout request was not approved, so there is no invoice for it."
              : "This payout request was withdrawn, so there is no invoice for it.",
        },
        { status: 409 },
      );
    }

    // ── THE DOCUMENT NUMBER IS A SUB-SERIES PER PARTNER ───────────
    //
    // The owner, 28-09: "hun mogen niet zien tenant payouts alleen per
    // affiliate". `payout_no` is house-wide, so printing it tells this
    // supplier how many payouts everyone else received in between. The
    // reference becomes PSM0008-02: still unique across the house,
    // still sequential within one supplier, silent about the rest.
    // lib/pure-payout-ref.ts has the reasoning and the tests.
    const { data: mine } = adv?.id
      ? await admin
          .from("affiliate_payouts")
          .select("id, group_id, requested_at, created_at")
          .eq("affiliate_advertiser_id", adv.id)
      : { data: null };
    const seq = payoutSequence((mine ?? []) as PayoutRefRow[]);
    const ref = payoutRef(
      adv?.tenant_client_code,
      seq.get(payoutGroupKey(head as PayoutRefRow)),
    );

    const isPaid = head.status === "paid";
    const dateLine = isPaid ? day(head.paid_at ?? head.requested_at) : day(head.requested_at);

    // ---- THE LINES HAVE TO ADD UP TO THE TOTAL --------------------
    //
    // The arithmetic lives in lib/pure-payout-invoice.ts, where the two
    // shapes that cannot be produced on this tenant -- a clawback, and
    // a conversion -- are covered by tests instead of by a real
    // transfer. This file only formats what comes back.
    const lines = payoutInvoiceLines(rows).map((l) => ({
      text: l.text,
      amount:
        l.amount < 0
          ? `− ${money(-l.amount, l.currency)}`
          : money(l.amount, l.currency),
    }));
    const totals = payoutInvoiceTotals(rows);

    // The same document we send customers -- same stylesheet, same
    // frame, same table and summary. No logo: on a self-billed invoice
    // the supplier is the affiliate, and our mark at the top made it
    // read as our paper. The owner, 28-09:
    // "invoice moet mooier stijl net als wat wij naar klanten geven dit
    // is lelijk geen echte invoice". Only the heading and the direction
    // of the parties differ, because on a self-billed invoice the
    // affiliate supplies and we buy.
    const html = buildSelfBilledInvoiceHtml(
      {
        reference: ref ?? (head.payout_no ? `#${head.payout_no}` : head.id.slice(0, 8)),
        paid: isPaid,
        date: dateLine,
        bankReference: head.reference ?? null,
        supplier: { name: supplierName, lines: supplierLines },
        customer: { name: issuerName, lines: issuerLines },
        lines,
        totals: Object.entries(totals).map(([cur, amt]) => ({
          label: `Total ${cur}`,
          amount: money(amt, cur),
        })),
      },
    );

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
