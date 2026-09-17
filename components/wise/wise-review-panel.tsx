"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState, type CSSProperties } from "react";
import { confirmWiseSuggestion } from "@/actions/wise-actions";
import { wiseIngestStatus } from "@/actions/integration-actions";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

// fromNow() is a plugin, not a built-in — without this it throws.
dayjs.extend(relativeTime);

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
  color: "var(--txt-2)",
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

// What the feed can and cannot do right now, in one line. Every deposit in
// this list read "no reference" and there was nothing on the screen to say
// whether the senders left the field blank or whether we simply cannot read
// it — those need opposite responses, and guessing wrong wastes a day.
function WiseIngestBar() {
  const { data } = useQuery({
    queryKey: ["wise-ingest-status"],
    queryFn: () => wiseIngestStatus(),
    staleTime: 60_000,
  });
  if (!data?.ok) return null;

  const ago = data.newestReceivedAt
    ? dayjs(data.newestReceivedAt).fromNow()
    : null;
  const bits: { label: string; tone: "ok" | "pend" | "due" }[] = [
    data.webhookConfigured
      ? { label: "Webhook on", tone: "ok" }
      : {
          label: "Webhook NOT configured — no deposit can arrive",
          tone: "due",
        },
    data.readTokenConfigured
      ? { label: "References readable", tone: "ok" }
      : { label: "No read token — references stay blank", tone: "pend" },
    data.autoSettle
      ? { label: "AUTO-SETTLE ON", tone: "due" }
      : { label: "Manual confirm", tone: "ok" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        marginTop: 10,
      }}
    >
      {bits.map((b) => (
        <span key={b.label} className={`badge ${b.tone}`}>
          {b.label}
        </span>
      ))}
      <span className="muted" style={{ fontSize: ".8rem" }}>
        {data.total} deposits · {data.withReference} with a reference
        {ago ? ` · last received ${ago}` : " · none received yet"}
      </span>
    </div>
  );
}

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

  const allRows = data ?? [];
  const suggestedCount = allRows.filter((r) => r.status === "suggested").length;

  // Rendering all 100 made this page 28,000px tall on a phone — 35 screens of
  // scrolling, and the handful of deposits that actually need a decision were
  // buried among dozens of unmatched ones the admin can do nothing about.
  // Anything needing action comes first and is always shown; the rest is
  // capped behind a count the admin can open.
  const REST_PREVIEW = 8;
  const [showAll, setShowAll] = useState(false);
  const needsAction = allRows.filter((r) => r.status === "suggested");
  const rest = allRows.filter((r) => r.status !== "suggested");
  const restShown = showAll ? rest : rest.slice(0, REST_PREVIEW);
  const rows = [...needsAction, ...restShown];
  const hiddenCount = rest.length - restShown.length;

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
        <WiseIngestBar />
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
                            style={{ fontSize: ".75rem", color: "var(--txt-2)" }}
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
                        ) : r.status === "confirmed" || r.status === "matched" ? (
                          <span
                            className="muted"
                            style={{ fontSize: ".82rem" }}
                          >
                            done
                          </span>
                        ) : (
                          /* An unmatched deposit used to show a dash — a row
                             in a money queue that nobody could do anything
                             about, which is how a queue quietly stops being
                             worked. The matcher fails for ordinary reasons (a
                             missing reference, a bank that stripped it, two
                             top-ups for the same amount), and a person can
                             see straight away what it belongs to. */
                          <ManualMatch
                            transferId={r.id}
                            amountCents={r.amount_cents}
                            currency={r.currency}
                            tenantId={tenantId}
                            busy={actingId === r.id}
                            onDone={() => {
                              queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
                              queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
                              queryClient.invalidateQueries({ queryKey: ["wallets"] });
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {hiddenCount > 0 && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
            <button
              className="btn ghost sm"
              onClick={() => setShowAll(true)}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Show {hiddenCount} more deposit{hiddenCount === 1 ? "" : "s"} with
              nothing to confirm
            </button>
          </div>
        )}
        {showAll && rest.length > REST_PREVIEW && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line)" }}>
            <button
              className="btn ghost sm"
              onClick={() => setShowAll(false)}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Show fewer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Match a deposit to a pending top-up by hand.
 *
 * Only offers top-ups the confirm step will actually accept: same currency,
 * same amount to the cent. A picker full of choices that will be refused is
 * worse than no picker — it teaches you to expect an error. When there is
 * nothing it could be, it says so, which is itself the useful answer: the
 * money arrived and no customer has told us to expect it.
 */
function ManualMatch({
  transferId,
  amountCents,
  currency,
  tenantId,
  busy,
  onDone,
}: {
  transferId: string;
  amountCents: number;
  currency: string;
  tenantId: string | null;
  busy: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["wise-match-candidates", transferId, tenantId],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const amount = Number(amountCents) / 100;
      const { data, error } = await supabase
        .from("wallet_topups")
        .select(
          "id, amount, currency, created_at, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name))",
        )
        // Scoped to this tenant like every other admin query on this table.
        // RLS should already do it, but a list that credits money is not the
        // place to find out that it does not — and `ilike` rather than `eq`
        // because currency is free text: a row stored as "eur" would have
        // been invisible here and looked like "nobody is expecting this".
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .ilike("currency", String(currency))
        // A cent either way, the same tolerance the automatic matcher uses.
        .gte("amount", amount - 0.01)
        .lte("amount", amount + 0.01)
        .order("created_at", { ascending: true })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        amount: number;
        currency: string;
        created_at: string;
        advertiser?: {
          tenant_client_code?: string | null;
          profile?: { full_name?: string | null } | null;
        } | null;
      }>;
    },
  });

  const submit = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const { matchWiseToTopup } = await import("@/actions/wise-actions");
      const res = await matchWiseToTopup(transferId, picked);
      if (!res.ok) throw new Error(res.error);
      toast.success("Matched — the top-up is credited");
      setOpen(false);
      setPicked("");
      onDone();
    } catch (e) {
      toast.error("Couldn't match this deposit", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button className="btn ghost sm" onClick={() => setOpen(true)}>
        Match…
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {isLoading ? (
        <span className="muted" style={{ fontSize: ".82rem" }}>
          Looking…
        </span>
      ) : candidates.length === 0 ? (
        <span className="muted" style={{ fontSize: ".82rem", textAlign: "left" }}>
          No pending top-up for this amount. Nobody is expecting it.
        </span>
      ) : (
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          aria-label="Top-up to match"
        >
          <option value="">Pick a top-up…</option>
          {candidates.map((c) => {
            const p = Array.isArray(c.advertiser)
              ? c.advertiser[0]
              : c.advertiser;
            const prof = Array.isArray(p?.profile) ? p?.profile[0] : p?.profile;
            const who =
              [p?.tenant_client_code, prof?.full_name].filter(Boolean).join(" · ") ||
              "Unknown advertiser";
            return (
              <option key={c.id} value={c.id}>
                {who} — {dayjs(c.created_at).format("D MMM")}
              </option>
            );
          })}
        </select>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          className="btn ghost sm"
          onClick={() => {
            setOpen(false);
            setPicked("");
          }}
          disabled={saving}
        >
          Cancel
        </button>
        {candidates.length > 0 && (
          <button
            className="btn sm"
            onClick={submit}
            disabled={!picked || saving || busy}
          >
            {saving ? "…" : "Match & credit"}
          </button>
        )}
      </div>
    </div>
  );
}
