"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState, type CSSProperties } from "react";
import { confirmWiseSuggestion } from "@/actions/wise-actions";

type WiseRow = {
  id: string;
  external_id: string;
  amount_cents: number;
  currency: string;
  reference: string | null;
  status: string;
  note: string | null;
  suggested_topup_id: string | null;
  created_at: string;
  sender_name: string | null;
  sender_iban: string | null;
};

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Map each Wise result to one of the mockup badge tones. The active
// `.psmapp` scope only ships ok/pend/due/info, so neutral results
// (unmatched/received) get the muted look inline from the shell tokens.
const NEUTRAL: CSSProperties = {
  background: "var(--panel-2)",
  color: "var(--muted)",
};
function statusBadge(status: string): { cls: string; style?: CSSProperties } {
  switch (status) {
    case "matched":
    case "confirmed":
      return { cls: "badge ok" };
    case "suggested":
      return { cls: "badge pend" };
    case "ambiguous":
      return { cls: "badge due" };
    default:
      return { cls: "badge", style: NEUTRAL };
  }
}

const clip: CSSProperties = {
  maxWidth: 180,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export default function WiseReviewPanel() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["wise-incoming", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wise_incoming_transfers")
        .select(
          "id, external_id, amount_cents, currency, reference, status, note, suggested_topup_id, created_at, sender_name, sender_iban",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WiseRow[];
    },
  });

  const confirm = useMutation({
    mutationFn: async (id: string) => {
      setActingId(id);
      const res = await confirmWiseSuggestion(id);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Deposit confirmed — topup completed, wallet credited");
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) =>
      toast.error("Confirm failed", { description: e.message }),
    onSettled: () => setActingId(null),
  });

  const rows = data ?? [];
  const suggestedCount = rows.filter((r) => r.status === "suggested").length;

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div>
        <h2
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          Bank deposits (Wise)
          {suggestedCount > 0 && (
            <span className="badge pend">{suggestedCount} to confirm</span>
          )}
        </h2>
        <p className="muted" style={{ margin: "6px 0 0", fontSize: ".92rem" }}>
          Incoming bank payments detected via Wise. During the safe-start phase
          nothing completes on its own — confirm each suggested match and the
          matching topup is credited.
        </p>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th>Amount &amp; date</th>
                <th>Reference &amp; sender</th>
                <th>Result</th>
                <th>Note</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "34px 0" }}>
                    <Loader2
                      className="animate-spin"
                      style={{ width: 20, height: 20, color: "var(--faint)" }}
                    />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="muted"
                    style={{ textAlign: "center", padding: "34px 0" }}
                  >
                    No bank deposits detected yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const badge = statusBadge(r.status);
                  return (
                    <tr key={r.id}>
                      <td data-label="Amount & date" style={{ verticalAlign: "top" }}>
                        <div className="mono" style={{ fontWeight: 700 }}>
                          {r.currency} {(r.amount_cents / 100).toFixed(2)}
                        </div>
                        <div
                          className="muted"
                          style={{ fontSize: ".75rem", whiteSpace: "nowrap" }}
                        >
                          {shortDate(r.created_at)}
                        </div>
                      </td>
                      <td data-label="Reference & sender" style={{ verticalAlign: "top" }}>
                        <div
                          className="mono"
                          style={{
                            fontSize: ".8rem",
                            fontStyle: r.reference ? "normal" : "italic",
                            color: r.reference ? "var(--ink)" : "var(--faint)",
                          }}
                        >
                          {r.reference || "no reference"}
                        </div>
                        {r.sender_name && (
                          <div className="muted" style={{ fontSize: ".75rem", ...clip }}>
                            {r.sender_name}
                          </div>
                        )}
                        {r.sender_iban && (
                          <div
                            className="mono"
                            style={{ fontSize: ".75rem", color: "var(--muted)" }}
                          >
                            {r.sender_iban}
                          </div>
                        )}
                        <div
                          className="mono"
                          style={{ fontSize: ".7rem", color: "var(--faint)", ...clip }}
                          title={r.external_id}
                        >
                          Wise: {r.external_id}
                        </div>
                      </td>
                      <td data-label="Result" style={{ verticalAlign: "top" }}>
                        <span
                          className={badge.cls}
                          style={{ textTransform: "capitalize", ...badge.style }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td data-label="Note" style={{ verticalAlign: "top" }}>
                        <div
                          className="muted"
                          style={{ fontSize: ".82rem", ...clip, maxWidth: 240 }}
                          title={r.note ?? undefined}
                        >
                          {r.note ?? "—"}
                        </div>
                      </td>
                      <td data-label="Action" className="r" style={{ verticalAlign: "top" }}>
                        {r.status === "suggested" && r.suggested_topup_id ? (
                          <button
                            className="btn sm"
                            disabled={actingId === r.id}
                            onClick={() => confirm.mutate(r.id)}
                          >
                            {actingId === r.id ? "…" : "Confirm & complete"}
                          </button>
                        ) : (
                          <span
                            className="muted"
                            style={{ fontSize: ".82rem", textTransform: "capitalize" }}
                          >
                            {r.status === "confirmed" || r.status === "matched"
                              ? "done"
                              : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
