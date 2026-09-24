"use client";

import { setReferralLinkStatus } from "@/actions/referral-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { formatCurrency } from "@/lib/utils";

// Approve / reject control for a referral link. Only interactive
// while the link is pending; once active or rejected it just shows
// the state. Approving a link is what lets commission start accruing
// (the DB trigger only pays out on 'active' links). Mockup look —
// wiring unchanged.
export default function ReferralStatusAction({
  referralLinkId,
  status,
  affiliateName,
  referredName,
  rateLine,
}: {
  referralLinkId: string;
  status: string | null;
  /** For the confirmation, so it names who it is about. */
  affiliateName?: string | null;
  referredName?: string | null;
  /** What this affiliate is ACTUALLY paid, in words, resolved from
   *  `commission_rules` -- their own level where they have one, the
   *  organisation's otherwise. NOT `referral_links.commission_pct`; see
   *  the note on `noRate` below. Null means no rule applies. */
  rateLine?: string | null;
}) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<
    "active" | "rejected" | null
  >(null);

  const [reason, setReason] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: async (next: "active" | "rejected") => {
      setPendingAction(next);
      const res = await setReferralLinkStatus(
        referralLinkId,
        next,
        undefined,
        next === "rejected" ? reason : null,
      );
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (decision, next) => {
      // The affiliate table keys on "referral-links-with-details"; other
      // views key on "affiliates". Invalidate both so the row refetches.
      queryClient.invalidateQueries({ queryKey: ["referral-links-with-details"] });
      queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["commissions"], exact: false });
      setReason("");
      if (next === "rejected") {
        toast.success("Referral refused");
        return;
      }
      // Say what approving booked, so the number can be checked against
      // the Commissions list of this affiliate.
      const legs = [
        decision?.bookedEur ? formatCurrency(decision.bookedEur, "EUR") : null,
        decision?.bookedUsd ? formatCurrency(decision.bookedUsd, "USD") : null,
      ].filter(Boolean);
      toast.success("Referral approved", {
        description: legs.length
          ? `${legs.join(" + ")} booked for what this customer already did.`
          : "Nothing to book yet — commission starts with their next top-up or paid invoice.",
      });
    },
    onError: (err: Error) => {
      toast.error("Couldn't update affiliate", { description: err.message });
    },
    onSettled: () => setPendingAction(null),
  });

  // ── BOTH OF THESE ARE ONE-WAY, AND THEY SIT 8px APART ──────────────
  //
  // Reject flips the link to `rejected`, and on refetch the controls
  // disappear entirely — this component renders buttons only while the
  // status is pending, and setReferralLinkStatus is called from nowhere
  // else. There is no path back to pending or active anywhere in the
  // app. The commission trigger gates on `active`, so the affiliate
  // silently stops earning on every future top-up.
  //
  // Approve is the same shape in the other direction: it starts accrual
  // against real spend. Neither should happen on a mis-aimed click.
  const [asking, setAsking] = useState<"active" | "rejected" | null>(null);

  // ── THE RATE THAT PAYS, NOT THE ONE ON THE ROW ──────────────────
  //
  // This printed `referral_links.commission_pct`, and that column is not
  // what the live accrual reads: `_book_topup_commission` ->
  // `_topup_commission_calc` -> `_commission_rule_at` all resolve
  // against `commission_rules`, and only the legacy wallet_topups
  // trigger still looks at the link.
  //
  // Measured on production: both live links carry 10.000, and every row
  // they have booked is 20% of top-up profit and 50% of a paid invoice
  // -- which is exactly what commission_rules holds. So the
  // confirmation stated a rate nobody is paid at.
  //
  // Worse, the branch below told the owner that approving earns the
  // affiliate NOTHING whenever the link had no rate -- and the one
  // pending link on this tenant has none, while the organisation's own
  // rules would pay them 20%, 50% and a EUR 10 one-off. The opposite of
  // true, on the screen where it is decided.
  const noRate = !rateLine;

  const current = (status ?? "active").toLowerCase();

  // ── "WE COULD NOT READ IT" IS NOT "ACTIVE" ────────────────────────
  //
  // `?? "active"` above is the right default for a database where the
  // column does not exist. It is the wrong answer for a read that
  // failed, and the two arrived here as the same undefined -- so a
  // pending affiliate got a green Active badge and no buttons, on the
  // only screen that can approve one.
  if (current === "unknown") {
    return (
      <span
        className="badge pend"
        title="We couldn't read this link's status. Reload before approving or rejecting anything."
      >
        Unknown
      </span>
    );
  }

  if (current === "active") {
    return <span className="badge ok">Active</span>;
  }
  if (current === "rejected") {
    return <span className="badge due">Rejected</span>;
  }

  // pending → show approve / reject
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
      }}
    >
      <button
        className="btn ghost sm"
        disabled={isPending}
        onClick={() => setAsking("rejected")}
      >
        {isPending && pendingAction === "rejected" ? "…" : "Refuse"}
      </button>
      <button
        className="btn sm"
        disabled={isPending}
        onClick={() => setAsking("active")}
      >
        {isPending && pendingAction === "active" ? "…" : "Approve"}
      </button>

      <ConfirmModal
        open={!!asking}
        onOpenChange={(next) => {
          if (!next && !isPending) setAsking(null);
        }}
        title={
          asking === "rejected" ? "Refuse this referral?" : "Approve this referral?"
        }
        lead={
          asking === "rejected"
            ? "The affiliate earns nothing from this customer. The customer stays yours; you can set a referrer for them later."
            : noRate
              ? "We couldn't work out what this affiliate is paid — no commission rule applies to them, at their own level or the organisation's. Approving would earn them nothing. Set a rule first."
              : "The affiliate earns from this customer from now on — and everything the customer already did since they signed up is booked straight away, with the rules as they are now."
        }
        cta={asking === "rejected" ? "Yes, refuse" : "Yes, approve"}
        tone={asking === "rejected" ? "danger" : undefined}
        busy={isPending}
        busyLabel="Saving…"
        disabled={asking === "rejected" && !reason.trim()}
        onConfirm={() => {
          if (asking) mutate(asking);
          setAsking(null);
        }}
      >
        <ConfirmFact label="Affiliate" value={affiliateName ?? "—"} />
        <ConfirmFact label="Referred customer" value={referredName ?? "—"} />
        {asking === "active" ? (
          <ConfirmFact
            label="What they get paid"
            value={rateLine ?? "no rule applies — they earn nothing"}
            strong
          />
        ) : null}
        {asking === "rejected" ? (
          <label style={{ display: "grid", gap: 6, marginTop: 10, fontSize: ".86rem" }}>
            <span style={{ fontWeight: 600 }}>Why (kept on record)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. they were already our customer"
              style={{
                border: "1px solid var(--line-2, #e5e7eb)",
                borderRadius: 10,
                padding: "8px 10px",
                font: "inherit",
                resize: "vertical",
              }}
            />
          </label>
        ) : null}
      </ConfirmModal>
    </div>
  );
}
