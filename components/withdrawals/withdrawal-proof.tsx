"use client";

import { useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { safeErrorMessage } from "@/lib/pure-error";
import type { SupplierLink } from "@/hooks/use-supplier-link";

// ── PROOF THAT THE MONEY CAME BACK ──────────────────────────────────
//
// The owner, 27-09: "hier wil ik bewijs zien dat medewerker geld van ad
// account terug heeft gehaald naar ons wallet, dus een screenshot bijv."
// And then: "en als geen bewijs is dan uitleg waar we het kunnen zien."
//
// Both halves are here. An admin pulls the money off the ad account in
// the supplier's own dashboard, comes back and approves, and the
// customer's wallet is credited — and until now nothing recorded that
// the first half ever happened.
//
// When there is no screenshot the card does NOT just say "none". It says
// where to go and look instead, and links there when we know the
// address, because "no proof" is only useful if it comes with the way to
// get some.

const BUCKET = "withdrawal_proofs";

export default function WithdrawalProof({
  withdrawalId,
  tenantId,
  proofPath,
  supplier,
  canAttach,
  onAttached,
}: {
  withdrawalId: string;
  tenantId: string | null | undefined;
  proofPath: string | null | undefined;
  /** For the "where to look" line when there is no screenshot yet. */
  supplier?: SupplierLink | null;
  /** False once the row is closed for good. */
  canAttach?: boolean;
  onAttached?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (!proofPath) return;
    setBusy(true);
    try {
      const { getWithdrawalProofUrl } = await import(
        "@/actions/withdrawal-proof-actions"
      );
      const res = await getWithdrawalProofUrl(proofPath);
      if (!res.ok) {
        toast.error("Couldn't open it", { description: res.error });
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (!tenantId) {
      toast.error("Couldn't attach it", {
        description: "We don't know which account this belongs to. Reload.",
      });
      return;
    }
    setBusy(true);
    try {
      // The tenant id is the first folder, because that is the predicate
      // the bucket policy tests. A path outside it is refused by storage
      // before the action is even reached — and the action checks it
      // again, because two locks on a file that proves where money went
      // is the right number.
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      const path = `${tenantId}/${withdrawalId}/${Date.now()}-${safe}`;

      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error("Couldn't upload that", {
          description: safeErrorMessage(error),
        });
        return;
      }

      const { attachWithdrawalProof } = await import(
        "@/actions/withdrawal-proof-actions"
      );
      const res = await attachWithdrawalProof(withdrawalId, path);
      if (!res.ok) {
        // The file is in the bucket but the row does not point at it.
        // Say so rather than "saved": a proof nothing references is the
        // same as no proof, and somebody has to know to try again.
        toast.error("Uploaded, but not attached", { description: res.error });
        return;
      }
      toast.success("Proof attached");
      onAttached?.();
    } finally {
      setBusy(false);
    }
  };

  if (proofPath) {
    return (
      <button
        type="button"
        className="btn ghost sm"
        onClick={open}
        disabled={busy}
        title="Open the screenshot"
      >
        {busy ? "Opening…" : "View proof"}
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
      {canAttach ? (
        <label
          className="btn ghost sm"
          style={{ cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "Uploading…" : "Attach proof"}
          <input
            type="file"
            accept="image/*,application/pdf"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              // Cleared either way, so picking the same file twice after
              // a failure still fires a change event.
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </label>
      ) : null}
      {/* ── WHERE TO LOOK WHEN THERE IS NONE ──────────────────────
          "No proof" on its own is a dead end. This is the one thing
          the row knows that the reader might not: which supplier holds
          the account, and where their dashboard is. */}
      <span
        style={{
          fontSize: ".75rem",
          color: "var(--faint)",
          textAlign: "right",
          maxWidth: "26ch",
        }}
      >
        No screenshot yet.{" "}
        {supplier?.url ? (
          <>
            Check it on{" "}
            <a
              href={supplier.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--primary-600)" }}
            >
              {supplier.label}
            </a>
            .
          </>
        ) : (
          <>Check the balance on the supplier&rsquo;s own dashboard.</>
        )}
      </span>
    </div>
  );
}
