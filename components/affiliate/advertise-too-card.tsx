"use client";

import { useT } from "@/hooks/use-t";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { requestAdvertiserUpgrade } from "@/actions/affiliate-application-actions";
import { Ic } from "./aff-icons";

// A column plak 43 has not added yet: "not switched on", never an error
// on the affiliate's own dashboard.
const MISSING = /42703|does not exist|schema cache|PGRST20\d/i;

type UpgradeState = {
  /** Set when the owner answered, and NOT cleared on approve -- the one
   *  field that tells an approval from never having asked. */
  decidedAt: string | null;
  requestedAt: string | null;
  refusalReason: string | null;
};

/**
 * "Advertise with us too" -- the other half of an affiliate account.
 *
 * The owner, 22-09: an affiliate account is the affiliate portal only,
 * "with the option to add advertiser". Asking is one press; the owner
 * answers on /affiliates. The state comes from the affiliate's own row,
 * so a reload does not forget that they asked (the first affiliate
 * application button did exactly that).
 */
export default function AdvertiseTooCard({
  advertiserId,
}: {
  advertiserId: string | null | undefined;
}) {
  const { t: tr } = useT();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const q = useQuery<UpgradeState | null>({
    queryKey: ["affiliate-upgrade", advertiserId ?? ""],
    enabled: !!advertiserId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("upgrade_requested_at, upgrade_refusal_reason, upgrade_decided_at")
        .eq("id", advertiserId!)
        .maybeSingle();
      if (error) {
        if (MISSING.test(error.message)) return null;
        throw error;
      }
      const r = (data ?? {}) as {
        upgrade_requested_at?: string | null;
        upgrade_refusal_reason?: string | null;
        upgrade_decided_at?: string | null;
      };
      return {
        requestedAt: r.upgrade_requested_at ?? null,
        refusalReason: r.upgrade_refusal_reason ?? null,
        decidedAt: r.upgrade_decided_at ?? null,
      };
    },
  });

  // Nothing to offer until we know where they stand -- an offer over a
  // read that failed could ask somebody to request what they already did.
  // isPending, not isLoading: a switched-off query reports isLoading
  // false for ever.
  if (!advertiserId || q.isPending) return null;
  // ── AND A FAILED READ IS NOT "THIS DOES NOT EXIST" ────────────────
  //
  // This returned null on isError, so the whole feature disappeared off
  // the screen with no trace -- indistinguishable from us not offering
  // it at all.
  if (q.isError || !q.data)
    return (
      <div className="card">
        <h2>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Ic name="i-rocket" /> {" "}{tr("advtoo.advertiseWithUsToo")}</span>
        </h2>
        <p className="cap" style={{ margin: "6px 0 0" }}>
          {tr("advtoo.weCouldnTCheckThis")}{" "}
          <button
            type="button"
            style={{
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              color: "var(--primary-600)",
              font: "inherit",
              fontWeight: 700,
            }}
            onClick={() => q.refetch()}
          >
            {tr("label.req.tryAgain")}</button>
        </p>
      </div>
    );

  const requested = !!q.data.requestedAt;
  const refused = !requested && !!q.data.refusalReason;
  // ── APPROVED LOOKED EXACTLY LIKE NEVER ASKED ──────────────────────
  //
  // affiliate_upgrade_decide clears upgrade_requested_at AND
  // upgrade_refusal_reason on approve, and this card read only the
  // first two -- so the moment the owner approved, refetchOnWindowFocus
  // flipped it back to an enabled "Ask to advertise too". Pressing it
  // then answered "This is for affiliate accounts", because their role
  // had already changed. upgrade_decided_at is the third state.
  const approved = !requested && !q.data.refusalReason && !!q.data.decidedAt;
  if (approved)
    return (
      <div className="card">
        <h2>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Ic name="i-rocket" /> {" "}{tr("advtoo.advertisingIsSwitchedOn")}</span>
        </h2>
        <p className="cap" style={{ margin: "6px 0 12px" }}>
          {tr("advtoo.youCanRunYourOwn")}</p>
        <button className="btn" onClick={() => window.location.assign("/dashboard")}>
          <Ic name="i-rocket" /> {" "}{tr("advtoo.openYourAdvertiserDashboard")}</button>
      </div>
    );

  const ask = async () => {
    setBusy(true);
    try {
      const res = await requestAdvertiserUpgrade();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["affiliate-upgrade"] });
      toast.success(
        res.data.alreadySent
          ? tr("advtoo.youVeAlreadyAskedWe")
          : tr("advtoo.requestSentWeLlSet"),
      );
    } catch {
      toast.error(tr("advtoo.weCouldnTSendYour"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <Ic name="i-rocket" /> {" "}{tr("advtoo.advertiseWithUsToo")}</span>
      </h2>
      <p className="cap" style={{ margin: "6px 0 12px" }}>
        {tr("advtoo.runYourOwnAdAccounts")}</p>
      <button className="btn" disabled={busy || requested} onClick={ask}>
        <Ic name="i-rocket" />{" "}
        {busy ? tr("btn.sending") : requested ? tr("label.advtoo.requestSent") : refused ? tr("label.advtoo.askAgain") : tr("advtoo.askToAdvertiseToo")}
      </button>
      {requested ? (
        <p className="cap" style={{ margin: "10px 0 0" }}>
          {tr("advtoo.weLlLookAtIt")}</p>
      ) : refused ? (
        <p className="cap" style={{ margin: "10px 0 0" }}>
          {tr("advtoo.notThisTimeYouCan", { refusalReason: String(q.data.refusalReason) })}</p>
      ) : null}
    </div>
  );
}
