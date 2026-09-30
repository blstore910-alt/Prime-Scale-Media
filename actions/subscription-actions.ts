"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import dayjs from "dayjs";
import { checkVersion, maintenanceGuard, wroteSomething } from "./_shared";
import { isTenantOwner } from "@/lib/auth/is-tenant-owner";

type ActionResult<T = null> =
  // `warning` is a success that came with something the caller has to
  // be told -- here: the subscription exists but the plan's included
  // accounts and top-up rate did not get saved. Surfaced by
  // toastResult(), the same way the withdrawal actions do it.
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: string };

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

const ALLOWED_SUB_STATUS = [
  "active",
  "inactive",
  "cancelled",
  "past_due",
  "paused",
] as const;
type SubscriptionStatus = (typeof ALLOWED_SUB_STATUS)[number];

// ─────────────────────────────────────────
// createSubscriptionAsAdmin
// ─────────────────────────────────────────
type CreateSubInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
  start_date: string;
  /**
   * The catalogue plan this subscription is for, when one was picked.
   * Optional because a subscription can be a bare monthly amount with
   * no plan behind it — that is how several live rows were made.
   */
  plan_id?: string | null;
};

export async function createSubscriptionAsAdmin(
  input: CreateSubInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // ── THE SAME GATE REPRICING HAS ───────────────────────────────────
  //
  // changeSubscriptionAmount is owner-only, with a comment saying a
  // hidden button is not a boundary. These two are the side door round
  // it: disable the EUR 99 plan (the duplicate guard then no longer
  // matches), create a new one at EUR 5, activate it. Three calls, all
  // at requireAdminCtx, and the customer has been repriced by somebody
  // who is not allowed to reprice. Setting a status also starts and
  // stops a recurring charge on its own.
  {
    const { data: ownerRow } = await supabase
      .from("tenants")
      .select("owner_id")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (
      !ownerRow ||
      !(await isTenantOwner(supabase, profile.tenant_id, profile.user_id))
    ) {
      return {
        ok: false,
        error:
          "Only the account owner can start, stop or price a subscription. Ask them to make this change.",
      };
    }
  }

  if (
    typeof input.advertiser_id !== "string" ||
    input.advertiser_id.length === 0
  ) {
    return { ok: false, error: "advertiser_id required" };
  }
  if (input.currency !== "EUR" && input.currency !== "USD") {
    return { ok: false, error: "Invalid currency" };
  }
  // ── ZERO IS A REAL PRICE HERE ────────────────────────────────────
  //
  // The owner, 28-09: "NSA moet wel een plan, maar dan 0 eu in onze
  // app -- zij betalen zelf aan de NSA academy per maand, niet aan
  // ons. Zijn zeer weinig mensen met een 0-euro plan, maar die zijn er
  // wel."
  //
  // So a free plan is a real customer on a real plan, and it has to be
  // settable. What it does NOT have is anything to bill monthly, which
  // is exactly what the invite path already decided: it writes the
  // plan and then `if v_fee <= 0 then return` before touching
  // subscriptions.
  //
  // Same rule here. Zero is allowed; below zero is not a price.
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Amount cannot be negative" };
  }
  const startDate = dayjs(input.start_date);
  if (!startDate.isValid()) {
    return { ok: false, error: "Invalid start_date" };
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

  // ── A SUBSCRIPTION IS NOT A PLAN ──────────────────────────────────
  //
  // The dialog lets the owner pick a plan and used it for one thing:
  // filling in the amount. Nothing wrote `advertiser_plans`, which is
  // the row that carries `included_ad_accounts` and `topup_fee_pct` --
  // so a customer set up this way was billed the monthly fee and got
  // NEITHER their included ad accounts NOR the top-up rate their plan
  // says. Their first ad-account request cost EUR 50 that the plan had
  // already covered.
  //
  // The invite path writes both, and has since the beginning; this one
  // was never taught to. Same columns and the same `on conflict` as
  // create_subscription_from_invite, deliberately -- two ways of
  // writing the same thing that look slightly different is how two
  // customers on one plan end up billed differently.
  //
  // Written BEFORE the subscription, because on a free plan it is the
  // only thing written -- and because a plan that saved while the
  // subscription failed is recoverable, whereas the other way round
  // bills somebody for nothing.
  // ── AND IT HAS TO BE AN RPC ──────────────────────────────────────
  //
  // I wrote this as a plain .upsert first, and the button said "Plan
  // set". Nothing was written. `advertiser_plans` has exactly ONE
  // policy on this database -- advertiser_plans_read_own, SELECT --
  // and no insert or update policy at all, so PostgREST writes
  // nothing and returns no error. RLS gives back zero rows rather
  // than raising; that is the trap this whole codebase has been
  // swept for, and I walked into it in new code.
  //
  // The only thing that writes that table today is
  // create_subscription_from_invite, a SECURITY DEFINER function --
  // which is exactly why an invited customer has a plan and a
  // referred one does not. So: the same shape, in plak 116, and the
  // result is CHECKED rather than assumed.
  // ── ELK ABONNEMENT KRIJGT EEN PLAN ───────────────────────────────
  //
  // De eigenaar, 30-09: "iedereen die we abbo geven, ook al is
  // handmatig, moet wel een naam krijgen toch? Anders klopt er niks
  // van."
  //
  // Hij heeft gelijk, en het is niet cosmetisch. Zonder planrij weet de
  // app niet hoeveel ad-accounts inbegrepen zijn en welke opwaardeerfee
  // geldt. Gemeten op PSM0020 -- een abonnement van EUR 75 zonder plan:
  // hij betaalde EUR 50 voor een ad-accountaanvraag die een plan
  // waarschijnlijk had inbegrepen, en zijn fee kwam ergens anders
  // vandaan. Zijn kaart zei terecht "No plan set" naast "Active".
  //
  // WAAROM OP HET BEDRAG EN NIET OP EEN VASTE STANDAARD. "Zet er dan
  // gewoon Prime op" zou op PSM0020 EUR 200 beweren boven een
  // abonnement van EUR 75 -- precies het "dan klopt er niks van" dat
  // hij wil vermijden. De plannen van deze tenant hebben allemaal een
  // eigen prijs (NSA 0, Flex 75, Launch 150, Prime 200), dus het
  // bedrag WIJST het plan aan. EUR 75 is Flex, en dat is ook echt wat
  // die klant heeft.
  //
  // Alleen bij een EXACTE treffer op bedrag en valuta, en alleen als er
  // precies EEN plan op past. Twee plannen van hetzelfde bedrag is een
  // keuze die een mens moet maken, en dan blijft het veld leeg met de
  // waarschuwing hieronder -- raden is hier erger dan niets doen.
  let planId = input.plan_id ?? null;
  if (!planId) {
    const { data: passend } = await supabase
      .from("plans")
      .select("id, name")
      .eq("tenant_id", profile.tenant_id)
      .eq("currency", input.currency)
      .eq("monthly_fee", input.amount)
      .eq("is_active", true)
      .limit(2);
    if ((passend ?? []).length === 1) planId = String(passend![0].id);
  }

  let warning: string | undefined;
  if (planId) {
    const { data: planned, error: planErr } = await supabase.rpc(
      "advertiser_plan_set",
      { p_advertiser_id: input.advertiser_id, p_plan_id: planId },
    );
    if (planErr) {
      // 42883: plak 116 is not pasted yet. Say that rather than
      // handing somebody PostgREST's sentence about a signature.
      warning =
        (planErr as { code?: string }).code === "42883"
          ? "Setting a plan on a customer is not switched on yet — ask us to run the migration. The monthly amount was still saved."
          : `The plan's included accounts and top-up rate were not saved onto this customer: ${planErr.message}`;
    } else if (!planned) {
      // A refusal that came back as nothing. Never a silent success on
      // a row that decides what a customer is charged.
      warning =
        "The plan did not save onto this customer, so their included ad accounts and top-up rate are not set. Try again, or tell us.";
    }
  }

  // ── A FREE PLAN HAS NOTHING TO SUBSCRIBE TO ──────────────────────
  //
  // The plan is on the customer now: their included ad accounts and
  // their top-up rate are set, and the gate on the customer's own
  // screen reads either row. A subscription would be a recurring
  // charge of nothing -- a row the billing run collects every month
  // for zero, and an "Activate" button that means nothing.
  //
  // Exactly what create_subscription_from_invite does, in the same
  // order.
  if (amount <= 0) {
    // planId en niet input.plan_id: een gratis plan matcht op bedrag 0,
    // en dan is er wel degelijk een plan gevonden.
    if (!planId) {
      return {
        ok: false,
        error:
          "A subscription of nothing needs a plan behind it — pick the plan this customer is on.",
      };
    }
    // On a free plan the snapshot is the ONLY thing that happens. If
    // it did not save, nothing did -- and "Plan set" would be a plain
    // untruth. A warning beside a green tick is for a success with a
    // caveat; this is a failure.
    if (warning) return { ok: false, error: warning };
    return { ok: true, data: { id: "" } };
  }

  // ── THE SAME SET THE BILLING RUN BILLS ──────────────────────────────
  //
  // This looked for `active` only, and the nightly run collects from
  // `active` AND `past_due`. So: a customer's plan cannot be collected
  // one night and is set past_due; an admin opens New subscription, this
  // guard finds no active row and lets it through; the activate guard
  // below finds none either. Two rows now exist, the run raises two
  // invoices, and the auto-debit takes both from one wallet — EUR 198 a
  // month for a EUR 99 plan. The customer's dashboard reads the newest
  // row only, so they see one plan and one charge.
  const BILLABLE = ["active", "past_due"];
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("advertiser_id", input.advertiser_id)
    .in("status", BILLABLE)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "past_due"
          ? "This advertiser already has a subscription — it is past due, which still bills. Settle or stop that one first."
          : "Advertiser already has an active subscription",
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("subscriptions")
    .insert({
      advertiser_id: input.advertiser_id,
      tenant_id: profile.tenant_id,
      currency: input.currency,
      amount,
      start_date: startDate.toISOString(),
      status: "inactive",
      // DUE ON THE START DATE, not a month after it.
      //
      // The billing run only selects a subscription whose
      // next_payment_date has arrived, so starting the clock a month
      // ahead meant an admin-created subscription raised no invoice for
      // thirty days: the customer's dashboard read "No subscription
      // invoice due" with Pay disabled, and the ad-account Request button
      // stayed disabled behind it because it waits on a PAID subscription
      // invoice. 20260918180000 closed exactly this for the invite path
      // and its backfill was a one-shot update, so every new
      // admin-created subscription kept landing in the same gap.
      next_payment_date: startDate.toISOString(),
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, data: { id: inserted.id }, warning };
}

// ─────────────────────────────────────────
// setSubscriptionStatus
// ─────────────────────────────────────────
export async function setSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (
    typeof subscriptionId !== "string" ||
    subscriptionId.length === 0
  ) {
    return { ok: false, error: "Invalid input" };
  }
  if (!ALLOWED_SUB_STATUS.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // ── THE SAME GATE REPRICING HAS ───────────────────────────────────
  //
  // changeSubscriptionAmount is owner-only, with a comment saying a
  // hidden button is not a boundary. These two are the side door round
  // it: disable the EUR 99 plan (the duplicate guard then no longer
  // matches), create a new one at EUR 5, activate it. Three calls, all
  // at requireAdminCtx, and the customer has been repriced by somebody
  // who is not allowed to reprice. Setting a status also starts and
  // stops a recurring charge on its own.
  {
    const { data: ownerRow } = await supabase
      .from("tenants")
      .select("owner_id")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (
      !ownerRow ||
      !(await isTenantOwner(supabase, profile.tenant_id, profile.user_id))
    ) {
      return {
        ok: false,
        error:
          "Only the account owner can start, stop or price a subscription. Ask them to make this change.",
      };
    }
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, tenant_id, advertiser_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // ── One active subscription per advertiser, on ACTIVATION too ───────
  // createSubscriptionAsAdmin refuses a second while another is active —
  // but it inserts as 'inactive', and this function had no such check. So
  // New → New → Activate → Activate leaves TWO active rows, and
  // subscription_billing_run invoices both every month, while the
  // customer's own screen reads `order by start_date desc limit 1` and
  // shows only the newer plan. They are billed twice and can only see —
  // and only pay — one of them.
  if (status === "active" && sub.advertiser_id) {
    // past_due too, for the reason given on the create path above: a
    // past_due subscription is still being billed, so activating a second
    // one beside it doubles the charge.
    const { data: others } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("advertiser_id", sub.advertiser_id)
      .in("status", ["active", "past_due"])
      .neq("id", subscriptionId)
      .limit(1);
    if ((others ?? []).length > 0) {
      return {
        ok: false,
        error:
          "This advertiser already has an active subscription. Stop that one first — two active plans bill them twice.",
      };
    }
  }

  if (!(await checkVersion(supabase, "subscriptions", subscriptionId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This subscription was changed by someone else. Reload and retry.",
    };
  }

  const { data: rows, error } = await supabase
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// changeSubscriptionAmount — mid-term plan change
// ─────────────────────────────────────────
// Delegates to the change_subscription_amount RPC, which voids/reissues
// the current period's invoice (or reconciles a paid one) and updates
// the subscription. The RPC re-checks admin authority server-side; the
// tenant guard here is defense in depth.
export async function changeSubscriptionAmount(
  subscriptionId: string,
  newAmount: number,
  newCurrency?: "EUR" | "USD",
  ifUpdatedAt?: string,
  // Paying cash back on a downgrade is a DECISION, not a default. The RPC
  // defaults to false; this parameter is how an admin asks for it.
  /**
   * ── KEPT SO CALLERS DO NOT BREAK, AND IGNORED ───────────────────
   *
   * The owner's rule (2026-09-20): lowering a plan NEVER returns
   * money, and the new terms apply from the moment it is saved. The
   * dialog's refund pill is gone; this parameter is accepted and
   * forced to false below, because a server action is reachable
   * without the form and a rule that lives only on a screen is not a
   * rule.
   */
  refund?: boolean,
): Promise<ActionResult<{ action: string }>> {
  if (typeof subscriptionId !== "string" || subscriptionId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const amount = Number(newAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Amount must be zero or positive" };
  }
  // ZERO IS NOT A PLAN. Setting a subscription to 0 issued an unpaid
  // invoice for 0, and invoice_pay_from_wallet refuses it — "Invoice has
  // no payable amount". So the customer's Pay now produced a red toast
  // every single time, the nightly auto-debit hit the same refusal and
  // parked them in past_due with a dunning notice, and nothing could ever
  // clear it. Meanwhile their dashboard read "Nothing to pay right now."
  // directly above a €0.00 row badged Due.
  //
  // A customer who should not be billed has their subscription DISABLED,
  // which is a state the screen can act on. Free-by-plan is expressed at
  // the invite, where amount 0 correctly creates no subscription at all.
  // Rounds to the cent, because the column does. `=== 0` let 0.004
  // through both this guard and its twin on the dialog, and the row
  // then stored 0.00 -- producing exactly the state this refusal
  // exists to prevent.
  if (Math.abs(amount) < 0.005) {
    return {
      ok: false,
      error:
        "A subscription cannot be zero — an invoice for nothing cannot be paid, and it would park this customer as past due for ever. Disable the subscription instead.",
    };
  }
  if (newCurrency && newCurrency !== "EUR" && newCurrency !== "USD") {
    return { ok: false, error: "Invalid currency" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, tenant_id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return { ok: false, error: "Subscription not found" };
  if (sub.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // SUPER-ADMIN ONLY, and this is the second of three gates.
  //
  // Repricing a plan is not an edit, it is a decision about what somebody
  // pays — and on a downgrade it can hand money back. The Amount button
  // was already hidden from a plain admin, but a hidden button is not a
  // boundary: the action is reachable by name, and both it and the RPC
  // tested only for role 'admin'. An employee could reprice any customer.
  //
  // Super-admin here means what it means everywhere in this app: the
  // owner of the tenant.
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", sub.tenant_id)
    .maybeSingle();
  if (
    !tenantRow ||
    !(await isTenantOwner(supabase, profile.tenant_id, profile.user_id))
  ) {
    return {
      ok: false,
      error:
        "Only the account owner can change what a customer pays. Ask them to make this change.",
    };
  }

  if (!(await checkVersion(supabase, "subscriptions", subscriptionId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This subscription was changed by someone else. Reload and retry.",
    };
  }

  const { data, error } = await supabase.rpc("change_subscription_amount", {
    // FALSE, always. See the note on the parameter: a downgrade pays
    // nothing back. What the RPC still does on this path — voiding an
    // UNCOLLECTED adjustment for the period, so the customer is not
    // billed for a price they are no longer on — is not a refund and
    // is unaffected: nothing leaves us.
    p_refund: false,
    p_subscription_id: subscriptionId,
    p_new_amount: amount,
    p_new_currency: newCurrency ?? null,
  });
  if (error) return { ok: false, error: error.message };

  const action =
    (data as { action?: string } | null)?.action ?? "updated";
  return { ok: true, data: { action } };
}
