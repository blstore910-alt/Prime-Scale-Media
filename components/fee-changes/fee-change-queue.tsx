"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { safeErrorMessage } from "@/lib/pure-error";

// ── THE OWNER DECIDES A PRICE, SO THE OWNER NEEDS A SCREEN ───────────
//
// The owner, 27-09: "als admin de fee moet aanpassen dan moet de request
// bij a super admin belanden, niet aanpassen dan niet."
//
// The refusal and the request both shipped the same evening; the place
// to answer one did not. A queue that exists only as a notification is a
// queue nobody works — the notice scrolls away and the row sits in
// `fee_change_requests` for ever, while an admin who asked a fair
// question concludes that asking does not work.
//
// Owner-only, by the route guard AND by the RPC (`fee_change_decide`
// checks `tenants.owner_id` itself). Employee admins can READ the table
// — deliberately, so whoever asked can watch their own request — and can
// change nothing.

type Row = {
  id: string;
  ad_account_id: string;
  current_fee: number | string | null;
  requested_fee: number | string | null;
  reason: string | null;
  status: string;
  created_at: string;
  decision_reason: string | null;
  // PostgREST embeds come back as EITHER an object or an array depending
  // on how it reads the relationship, so both shapes are handled. Reading
  // only one leaves a raw UUID on screen.
  ad_account?: { name?: string | null } | { name?: string | null }[] | null;
};

const first = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

// numeric arrives as a STRING over PostgREST.
const pct = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmtPct = (v: unknown) => {
  const n = pct(v);
  return n === null ? "no rate of its own" : `${n}%`;
};

export default function FeeChangeQueue() {
  const { profile, isSuperAdmin } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;
  const qc = useQueryClient();

  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [why, setWhy] = useState("");

  const q = useQuery<Row[]>({
    queryKey: ["fee-change-requests", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("fee_change_requests")
        .select(
          "id, ad_account_id, current_fee, requested_fee, reason, status, created_at, decision_reason, ad_account:ad_accounts(name)",
        )
        .eq("tenant_id", tenantId)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(100);
      // 42P01 means plak 111 has not been pasted. That is a feature that
      // is not switched on yet, not a broken screen — see CLAUDE.md on
      // reading a column a migration has not added.
      if (error) {
        if ((error as { code?: string }).code === "42P01") return [];
        throw error;
      }
      return (data ?? []) as unknown as Row[];
    },
  });

  const decide = useMutation({
    mutationFn: async (input: {
      id: string;
      approve: boolean;
      reason?: string;
    }) => {
      const { decideFeeChange } = await import("@/actions/fee-change-actions");
      const res = await decideFeeChange({
        requestId: input.id,
        approve: input.approve,
        reason: input.reason,
      });
      if (!res.ok) throw new Error(res.error);
      return input.approve;
    },
    onSuccess: (approved) => {
      toast.success(approved ? "Approved — the fee is changed" : "Refused");
      qc.invalidateQueries({ queryKey: ["fee-change-requests"] });
      // The account's own screens read the fee, and so does the queue
      // badge on the dashboard.
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-details"] });
      qc.invalidateQueries({ queryKey: ["pending-counts"] });
      setRejecting(null);
      setWhy("");
    },
    onError: (e: Error) => {
      toast.error("That did not go through", { description: e.message });
    },
    onSettled: () => setActing(null),
  });

  const rows = q.data ?? [];
  const open = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  // isPending, not isLoading: isLoading is false for a disabled query,
  // which would render as "loaded, and there is nothing".
  if (q.isPending) {
    return <p className="muted">Looking for fee changes…</p>;
  }
  // RLS returns zero rows rather than raising, so a refused read looks
  // like an empty queue. A real error has to say so instead.
  if (q.isError) {
    return (
      <p className="muted">
        We couldn&rsquo;t read the fee changes: {safeErrorMessage(q.error)}
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Fee changes</h2>
        <p className="muted" style={{ marginTop: 4, fontSize: ".85rem" }}>
          What a customer is charged is yours to set. An admin who needs a
          different rate asks here; nothing changes until you say yes.
        </p>
      </div>

      {open.length === 0 ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 20,
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Nothing waiting on you.</p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: ".85rem" }}>
            Admins can already set a customer&rsquo;s plan rate or the
            account type&rsquo;s own rate without asking. Anything else
            lands here.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {open.map((r) => {
            const name = first(r.ad_account)?.name ?? r.ad_account_id;
            const busy = acting === r.id;
            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: 14,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: "1.05rem", marginTop: 2 }}>
                    {fmtPct(r.current_fee)}{" "}
                    <span className="muted">&rarr;</span>{" "}
                    <strong>{fmtPct(r.requested_fee)}</strong>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: ".9rem" }}>{r.reason}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn ghost sm"
                    disabled={busy || !isSuperAdmin}
                    title={
                      isSuperAdmin
                        ? "Refuse, with a reason"
                        : "Only the owner decides a price"
                    }
                    onClick={() => {
                      setRejecting(r);
                      setWhy("");
                    }}
                  >
                    Refuse
                  </button>
                  <button
                    className="btn sm"
                    disabled={busy || !isSuperAdmin}
                    title={
                      isSuperAdmin
                        ? "Approve and change the fee now"
                        : "Only the owner decides a price"
                    }
                    onClick={() => {
                      setActing(r.id);
                      decide.mutate({ id: r.id, approve: true });
                    }}
                  >
                    {busy ? "Working…" : `Approve ${fmtPct(r.requested_fee)}`}
                  </button>
                </div>
                {!isSuperAdmin && (
                  <p className="muted" style={{ margin: 0, fontSize: ".75rem" }}>
                    Waiting on the owner. You will get a notice either way.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>
            Already answered ({done.length})
          </summary>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {done.map((r) => (
              <div
                key={r.id}
                style={{ fontSize: ".85rem", display: "grid", gap: 2 }}
              >
                <span>
                  <strong>{first(r.ad_account)?.name ?? r.ad_account_id}</strong>{" "}
                  {fmtPct(r.current_fee)} &rarr; {fmtPct(r.requested_fee)} —{" "}
                  {r.status}
                </span>
                {r.decision_reason && (
                  <span className="muted">{r.decision_reason}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {rejecting && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Refuse this fee change"
          onClick={(e) => {
            if (e.target === e.currentTarget && !decide.isPending) {
              setRejecting(null);
            }
          }}
        >
          <div className="w-full max-w-sm space-y-3 rounded-lg bg-background p-4 shadow-lg">
            <h3 className="text-sm font-semibold">Refuse this change</h3>
            {/* A refusal without a reason teaches the person who asked
                nothing, and they ask again next week. Same rule as money
                leaving the business. */}
            <p className="text-xs text-muted-foreground">
              They will read this. Say what the rate should be instead, or
              why not.
            </p>
            <textarea
              rows={3}
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                className="btn ghost sm"
                disabled={decide.isPending}
                onClick={() => setRejecting(null)}
              >
                Cancel
              </button>
              <button
                className="btn sm"
                disabled={decide.isPending || why.trim().length < 3}
                onClick={() => {
                  setActing(rejecting.id);
                  decide.mutate({
                    id: rejecting.id,
                    approve: false,
                    reason: why.trim(),
                  });
                }}
              >
                {decide.isPending ? "Sending…" : "Refuse"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
