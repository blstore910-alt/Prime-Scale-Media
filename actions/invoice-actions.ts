"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard, type ActionResult, wroteSomething } from "./_shared";
import { safeErrorMessage } from "@/lib/pure-error";

async function requireAdminCtx() {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false as const, error: mm.error };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);

  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }

  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// invoice: admin create
// ─────────────────────────────────────────
const INVOICE_INSERT_ALLOWED = [
  "type",
  "currency",
  "total",
  "items",
  "advertiser_id",
  "company_id",
  "number",
  "notes",
] as const;

type InvoiceInsertInput = Partial<
  Record<(typeof INVOICE_INSERT_ALLOWED)[number], unknown>
>;

export async function createInvoiceAsAdmin(
  input: InvoiceInsertInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (!input.advertiser_id || typeof input.advertiser_id !== "string") {
    return { ok: false, error: "advertiser_id required" };
  }

  const { data: adv } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", input.advertiser_id)
    .maybeSingle();
  if (!adv) return { ok: false, error: "Advertiser not found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // Verify the company (when given) belongs to this tenant and advertiser —
  // don't let an admin attach an invoice to an unrelated company_id.
  if (typeof input.company_id === "string" && input.company_id.length > 0) {
    const { data: company } = await supabase
      .from("companies")
      .select("id, tenant_id, advertiser_id")
      .eq("id", input.company_id)
      .maybeSingle();
    if (!company || company.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Company not found" };
    }
    if (company.advertiser_id !== input.advertiser_id) {
      return {
        ok: false,
        error: "Company does not belong to this advertiser",
      };
    }
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of INVOICE_INSERT_ALLOWED) {
    if (col in input) cleaned[col] = input[col];
  }
  cleaned.tenant_id = profile.tenant_id;
  cleaned.status = "unpaid";

  const { data: inserted, error: insertError } = await supabase
    .from("invoices")
    .insert(cleaned)
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// invoice: admin mark paid / unpaid
// ─────────────────────────────────────────
export async function setInvoicePaidStatus(
  invoiceId: string,
  status: "paid" | "unpaid",
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof invoiceId !== "string" || invoiceId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  if (status !== "paid" && status !== "unpaid") {
    return { ok: false, error: "Invalid status", code: "invalid" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // NOTE: public.invoices has no updated_at column, so there's no
  // optimistic-concurrency version to check here — the ifUpdatedAt param
  // is accepted for call-site compatibility but not used. Selecting it
  // (or version-guarding on it) previously 400'd and made this action
  // always report "Invoice not found".
  void ifUpdatedAt;
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, tenant_id, status, type, subscription_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { ok: false, error: "Invoice not found", code: "not_found" };
  if (invoice.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  // Marking a PAID subscription invoice back to unpaid does NOT re-credit the
  // wallet (it may have been collected via invoice_pay_from_wallet), and the
  // daily billing cron re-collects any unpaid subscription invoice past its
  // due date — so the advertiser would be charged twice for one period.
  // Block that transition; a genuine reversal must go through a refund.
  //
  // The test is now "was it paid", full stop — not the type, and not
  // subscription_id.
  //
  // It started as `type === "subscription"`, which missed
  // subscription_adjustment. Narrowing to subscription_id caught that, and
  // still missed every invoice that has no subscription at all: an
  // ad_account_fee raised from the request review, or anything created from
  // the /invoices dialog, since createInvoiceAsAdmin cannot set
  // subscription_id — it is not in INVOICE_INSERT_ALLOWED. Those are paid
  // with invoice_pay_from_wallet too, so reopening one let the advertiser
  // press "Pay now" again and be debited twice.
  //
  // Nothing in the schema records HOW an invoice was paid, so "paid from the
  // wallet" cannot be told apart from "an admin ticked it by mistake". Given
  // that, refusing every paid→unpaid is the only answer that cannot cost a
  // customer money.
  //
  // It does cost something, and the cost is worth stating: correcting an
  // invoice that was marked paid in error now needs a credit note rather
  // than a toggle. Making that toggle safe means recording the payment
  // method on the invoice and allowing a reopen only for manually-marked
  // ones — a deliberate change, not a gap to leave standing.
  if (invoice.status === "paid" && status === "unpaid") {
    return {
      ok: false,
      error:
        "A paid invoice can't be marked unpaid — the wallet is never re-credited, so it could be collected a second time. Issue a refund or a credit note instead.",
      code: "invalid",
    };
  }

  // ALREADY PAID, ASKED TO BE PAID: do nothing and say it worked.
  //
  // The refusal above only covers paid -> unpaid. paid -> paid fell
  // straight through to the UPDATE, which rewrites paid_at with now() —
  // so an admin pressing "Mark paid" on an invoice the customer had
  // already settled from their wallet moved the settlement date to today.
  // That date is what reconciliation matches the wallet debit against and
  // what the dunning cron keys on, and nothing on any screen would show
  // it had moved.
  if (invoice.status === "paid" && status === "paid") {
    return { ok: true, data: null };
  }

  // Count the rows. An UPDATE that matches nothing returns no error and no
  // rows in PostgREST, so marking an invoice paid could report success while
  // the invoice stayed open — and an invoice that looks settled but is not
  // is the difference between chasing a customer and not chasing them.
  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", invoiceId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (updateError) return { ok: false, error: updateError.message };
  const wrote = wroteSomething(updated);
  if (!wrote.ok) return wrote;

  return { ok: true, data: null };
}

// ─────────────────────────────────────────────────────────────────────
// invoice: cancel one that should never have been issued
// ─────────────────────────────────────────────────────────────────────
// This exists because of the rule above it in the business: a change to
// a subscription always works in our favour, so LOWERING a price pays
// nothing back and leaves an invoice already issued standing at the old
// amount.
//
// That is right for a renegotiation and wrong for a typo. Type 2000
// instead of 200 and the correction is also a lowering -- so the
// customer is left owing 2000, the daily billing run will take it out
// of their wallet on its due date, and until now there was NO control
// anywhere in the app that could stop it. "Mark unpaid" is refused for
// paid invoices and does nothing for open ones. The only way out was
// hand-written SQL.
//
// Deliberately narrow:
//   * a PAID invoice is never touched. The money has moved, and undoing
//     that is a refund or a credit note, not a status change -- the same
//     reasoning that made paid→unpaid unconditional;
//   * the reason is required and is written into the record, because a
//     cancelled invoice with no explanation is indistinguishable from a
//     mistake six months later;
//   * period_start is cleared, so the billing run can raise that period
//     again at the right amount. Leaving it set would let the unique
//     index on (subscription_id, period_start) block the reissue, and
//     the customer would simply never be billed for that month.
// ─────────────────────────────────────────────────────────────────────
export async function voidInvoiceAsAdmin(
  invoiceId: string,
  reason: string,
): Promise<ActionResult> {
  if (typeof invoiceId !== "string" || invoiceId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const why = typeof reason === "string" ? reason.trim() : "";
  if (why.length < 3) {
    return {
      ok: false,
      error: "Say why this invoice is being cancelled — it stays on the record.",
      code: "invalid",
    };
  }
  if (why.length > 500) {
    return { ok: false, error: "That reason is too long.", code: "invalid" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // ── A COLUMN NO MIGRATION HAS ADDED ───────────────────────────────
  //
  // `notes` is in INVOICE_INSERT_ALLOWED and nothing has ever written
  // it: no migration creates it and neither create-invoice caller sends
  // it. Naming it in a select does not degrade -- PostgREST throws
  // 42703 -- and because the error was discarded the row came back null
  // and this action answered "Invoice not found". So the one control
  // that exists to stop a mistyped EUR 2000 being collected was a
  // no-op, and its message pointed the admin at the wrong problem.
  //
  // Ask for it, and on error ask again without it. Then the cancel
  // still works and only the reason has nowhere to live -- which the
  // caller is told about rather than guessing at.
  const WITH_NOTES =
    "id, tenant_id, status, total, currency, type, subscription_id, notes";
  const WITHOUT =
    "id, tenant_id, status, total, currency, type, subscription_id";
  type InvoiceRow = {
    id: string;
    tenant_id: string;
    status: string | null;
    total?: number | string | null;
    type?: string | null;
    subscription_id?: string | null;
    notes?: string | null;
  };
  let canKeepReason = true;
  let invoice: InvoiceRow | null = null;

  const first = await supabase
    .from("invoices")
    .select(WITH_NOTES)
    .eq("id", invoiceId)
    .maybeSingle();
  if (first.error) {
    canKeepReason = false;
    const retry = await supabase
      .from("invoices")
      .select(WITHOUT)
      .eq("id", invoiceId)
      .maybeSingle();
    if (retry.error) {
      return { ok: false, error: safeErrorMessage(retry.error) };
    }
    invoice = retry.data as unknown as InvoiceRow | null;
  } else {
    invoice = first.data as unknown as InvoiceRow | null;
  }

  if (!invoice) return { ok: false, error: "Invoice not found", code: "not_found" };
  if (invoice.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }

  const status = String(invoice.status ?? "").toLowerCase();
  if (status === "paid") {
    return {
      ok: false,
      error:
        "This invoice has been paid, so it cannot be cancelled — the money has already moved. Issue a refund or a credit note instead.",
      code: "invalid",
    };
  }
  if (status === "void") return { ok: true, data: null };

  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${stamp}] Cancelled: ${why}`;
  const notes = invoice.notes ? `${String(invoice.notes)}\n${line}` : line;

  const patch: Record<string, unknown> = { status: "void", period_start: null };
  if (canKeepReason) patch.notes = notes;

  const { data: updated, error: updateError } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoiceId)
    .eq("tenant_id", profile.tenant_id)
    // ── AND STILL NOT PAID AT THE MOMENT OF THE WRITE ───────────────
    //
    // The status check above is on the row we read. Between that read
    // and this write the unattended collection can call
    // invoice_pay_from_wallet: the wallet is debited, the paid-invoice
    // trigger rolls the subscription period forward -- and then this
    // would flip the now-PAID invoice to void and null its
    // period_start, freeing the unique slot so the same month is
    // raised again. The customer pays twice for one month.
    //
    // .or() rather than .neq(): PostgREST drops NULLs on neq, so an
    // invoice with no status at all would fall outside the filter and
    // the update would match nothing while reporting success.
    .or("status.is.null,status.neq.paid")
    .select("id");
  if (updateError) return { ok: false, error: safeErrorMessage(updateError) };
  const wrote = wroteSomething(updated);
  if (!wrote.ok) {
    return {
      ok: false,
      error:
        "That invoice was paid while this was open, so it has not been cancelled. Reload and look again — a paid invoice needs a refund or a credit note.",
      code: "conflict",
    };
  }

  // ── CANCELLING BUYS ONE DAY, UNLESS THE PLAN IS CORRECTED TOO ─────
  //
  // The nightly run reads subscriptions.amount and
  // subscriptions.next_payment_date. Cancelling touches NEITHER. So
  // the sequence this control was built for -- somebody types 2000
  // instead of 200, the RPC writes 2000 onto the subscription and
  // issues a 2000 invoice, an admin cancels it -- ends with the run
  // seeing amount 2000, an unmoved next_payment_date and no invoice
  // for that period, and raising a FRESH 2000 invoice the same night.
  // Due in three days, not seven, because the first-invoice rule reads
  // a void row as "they have never been billed".
  //
  // The cancel is still right; it is just not sufficient on its own,
  // and nothing on the screen said so. Look, and say it.
  const warnings: string[] = [];
  if (!canKeepReason) {
    warnings.push(
      "The reason could not be saved: this database has no invoices.notes column yet. Record it elsewhere.",
    );
  }

  if (invoice.subscription_id) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, amount, currency, status")
      .eq("id", invoice.subscription_id)
      .maybeSingle();
    const planAmount = Number(sub?.amount ?? NaN);
    const invoiceAmount = Number(invoice.total ?? NaN);
    const billable = ["active", "past_due"].includes(
      String(sub?.status ?? "").toLowerCase(),
    );
    if (
      billable &&
      Number.isFinite(planAmount) &&
      Number.isFinite(invoiceAmount) &&
      Math.abs(planAmount - invoiceAmount) < 0.005
    ) {
      warnings.push(
        `The plan is still set to ${planAmount.toFixed(2)} ${String(
          sub?.currency ?? "EUR",
        ).toUpperCase()}, so tonight's billing run will raise this same invoice again. Change the subscription amount before 03:00 if the figure was wrong.`,
      );
    }
  }

  return {
    ok: true,
    data: null,
    warning: warnings.length ? warnings.join(" ") : undefined,
  };
}
