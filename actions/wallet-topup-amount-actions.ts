"use server";

// ── EEN ANDER BEDRAG BIJSCHRIJVEN, DOOR TWEE ADMINS ─────────────────
//
// Plak 194. De eigenaar, 01-10: "iemand heeft de referentie goed maar te
// weinig overgemaakt -- kunnen we het echte bedrag bijschrijven? Altijd
// geverifieerd door een 2de admin; lager mag, hoger moet een super
// admin."
//
// De regels zelf staan in de database (wallet_topup_propose_amount /
// _confirm_amount / _cancel_proposal); dit zijn de deuren ernaartoe, via
// resolveAdminContext (maintenance, read-only-schakelaar, rol).

import { resolveAdminContext, type ActionResult } from "./_shared";
import { safeErrorMessage } from "@/lib/pure-error";
import { notifyWalletTopupVerified } from "./wallet-topup-notify-actions";

const PLAK = "This needs a database update (plak 194) first.";
const ontbreekt = (e: { message?: string; code?: string } | null) =>
  !!e && (e.code === "PGRST202" || /does not exist|schema cache|could not find/i.test(String(e.message ?? "")));

export async function proposeWalletTopupAmount(input: {
  topupId: string;
  amount: number | string;
  reason: string;
}): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const amount = Math.round(Number(input?.amount) * 100) / 100;
  if (!input?.topupId || !(amount > 0)) return { ok: false, error: "Enter the amount that actually arrived." };
  const { error } = await auth.ctx.supabase.rpc("wallet_topup_propose_amount", {
    p_topup_id: input.topupId,
    p_amount: amount,
    p_reason: String(input?.reason ?? "").slice(0, 300),
  });
  if (error) return { ok: false, error: ontbreekt(error) ? PLAK : safeErrorMessage(error) };
  return { ok: true, data: null };
}

/** De tweede admin bevestigt: het ontvangen bedrag gaat de wallet in. */
export async function confirmWalletTopupAmount(topupId: string): Promise<ActionResult<{ notifyProblem: string | null }>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!topupId) return { ok: false, error: "Invalid input" };
  const { error } = await auth.ctx.supabase.rpc("wallet_topup_confirm_amount", { p_topup_id: topupId });
  if (error) return { ok: false, error: ontbreekt(error) ? PLAK : safeErrorMessage(error) };
  // Dezelfde melding als een gewone Verify -- die leest het bedrag uit de
  // rij, en dat is nu het ontvangen bedrag. Na het schrijven, best effort.
  let notifyProblem: string | null = null;
  try {
    const n = await notifyWalletTopupVerified(topupId);
    if (!n.ok) notifyProblem = n.error;
  } catch (e) {
    notifyProblem = safeErrorMessage(e);
  }
  return { ok: true, data: { notifyProblem } };
}

export async function cancelWalletTopupAmount(topupId: string): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!topupId) return { ok: false, error: "Invalid input" };
  const { error } = await auth.ctx.supabase.rpc("wallet_topup_cancel_proposal", { p_topup_id: topupId });
  if (error) return { ok: false, error: ontbreekt(error) ? PLAK : safeErrorMessage(error) };
  return { ok: true, data: null };
}

export type TopupProposal = {
  topupId: string;
  proposedAmount: number;
  reason: string;
  byId: string;
  byName: string;
  at: string;
};

/** De open voorstellen in de wachtrij, met wie ze deed. Leeg zonder plak 194. */
export async function listWalletTopupProposals(): Promise<
  ActionResult<{ proposals: TopupProposal[]; me: string; plakNodig: boolean }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;
  const { data, error } = await supabase
    .from("wallet_topups")
    .select("id, proposed_amount, proposed_reason, proposed_by, proposed_at")
    .eq("tenant_id", profile.tenant_id)
    .eq("status", "pending")
    .not("proposed_amount", "is", null);
  if (error) {
    if (ontbreekt(error) || /proposed_/.test(String(error.message ?? ""))) {
      return { ok: true, data: { proposals: [], me: profile.id as string, plakNodig: true } };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }
  const rijen = (data ?? []) as { id: string; proposed_amount: number | string; proposed_reason: string | null; proposed_by: string; proposed_at: string }[];
  const ids = Array.from(new Set(rijen.map((r) => r.proposed_by)));
  const namen = new Map<string, string>();
  if (ids.length) {
    const { data: pr } = await supabase.from("user_profiles").select("id, full_name, email").in("id", ids);
    for (const p of (pr ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      namen.set(p.id, (p.full_name ?? "").trim() || (p.email ?? "").split("@")[0]);
    }
  }
  return {
    ok: true,
    data: {
      me: profile.id as string,
      plakNodig: false,
      proposals: rijen.map((r) => ({
        topupId: r.id,
        proposedAmount: Number(r.proposed_amount),
        reason: r.proposed_reason ?? "",
        byId: r.proposed_by,
        byName: namen.get(r.proposed_by) ?? "an admin",
        at: r.proposed_at,
      })),
    },
  };
}
