"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  confirmWiseSuggestion,
  refreshWiseDepositDetails,
  rematchWiseDeposits,
  setWiseDepositArchived,
} from "@/actions/wise-actions";
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
  archived_at: string | null;
  description: string | null;
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
/**
 * What each deposit's state is CALLED on screen.
 *
 * The column holds six words and two of them mean the same thing to the
 * person reading: 'suggested' is a match this feed found and is waiting for
 * you to confirm, and 'matched' is the same thing from before the
 * safe-start phase existed (and from an auto-settle run). Printing the raw
 * column put both on the screen, so the same situation appeared under two
 * names and you had to know the schema to tell that they were one.
 *
 * So: what state is it in, in words about MONEY.
 *   Match found  — we think we know which top-up this is. Nothing credited.
 *   Credited     — the top-up was completed and the wallet has the money.
 *   Needs a look — several top-ups fit and we refuse to guess.
 *   No match     — nothing pending fits it (yet: Re-check asks again).
 */
function statusView(status: string): {
  label: string;
  cls: string;
  style?: CSSProperties;
} {
  switch (status) {
    case "confirmed":
    case "completed":
      return { label: "Credited", cls: "badge ok" };
    case "matched":
    case "suggested":
      return { label: "Match found", cls: "badge pend" };
    case "ambiguous":
      return { label: "Needs a look", cls: "badge due" };
    case "unmatched":
      return { label: "No match", cls: "badge", style: NEUTRAL };
    default:
      return { label: "Received", cls: "badge", style: NEUTRAL };
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
          "id, external_id, amount_cents, currency, reference, status, note, suggested_topup_id, created_at, sender_name, sender_iban, archived_at, description",
        )
        .order("created_at", { ascending: false })
        // 100 was less than the table holds — live has 229 — so the
        // "show N more" button below promised 92 more while 129 were not
        // fetched at all and could not be reached from this screen by any
        // means. The cap is now well above the real count; the PREVIEW cap
        // (REST_PREVIEW) is what keeps the page short.
        .limit(500);
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
  // ── Ask the matcher again ─────────────────────────────────────────
  // The webhook matches a deposit ONCE, when it lands, against whatever
  // was pending at that second. Customers transfer first and file the
  // claim afterwards, so "no pending topup with matching amount" is very
  // often a stale answer rather than a wrong one — and nothing ever
  // re-asked. This does, on every visit, and it only ever writes a
  // SUGGESTION: the money still moves on your Confirm.
  const rematch = useMutation({
    mutationFn: async () => {
      const res = await rematchWiseDeposits();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      if (d.withdrawn > 0) {
        toast.message(
          d.withdrawn === 1
            ? "1 old match withdrawn"
            : `${d.withdrawn} old matches withdrawn`,
          {
            description:
              "They were matched on the amount alone, which is not proof of whose money it is. Match those by hand.",
          },
        );
      }
      if (d.suggested > 0) {
        toast.success(
          d.suggested === 1
            ? "1 deposit now matches a pending top-up"
            : `${d.suggested} deposits now match a pending top-up`,
          { description: "Confirm each one to credit the wallet." },
        );
      }
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't re-check the deposits", {
        description: e.message,
      }),
  });

  // Once per mount, and only when there is something to re-check. Quiet on
  // purpose: a toast for "nothing changed" on every page view is noise.
  const sweptRef = useRef(false);
  useEffect(() => {
    if (sweptRef.current || isLoading) return;
    const open = allRows.some(
      (r) =>
        r.status === "unmatched" ||
        r.status === "ambiguous" ||
        r.status === "received",
    );
    if (!open) return;
    sweptRef.current = true;
    rematch.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [isLoading, allRows.length]);

  // WHOSE money the match says this is. A "Confirm & complete" button
  // credits a specific customer's wallet, and the row it sat on named the
  // amount, the time and a status — nothing about the person. The admin had
  // to take the machine's word for it, which is the one thing a
  // confirmation step exists to avoid.
  const suggestedIds = Array.from(
    new Set(
      (data ?? [])
        .map((r) => r.suggested_topup_id)
        .filter((v): v is string => !!v),
    ),
  ).sort();
  const { data: matchedTo } = useQuery<
    Record<string, { code: string; name: string; reference: string }>
  >({
    queryKey: ["wise-matched-topups", suggestedIds],
    enabled: suggestedIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select(
          "id, reference_no, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name))",
        )
        .in("id", suggestedIds);
      if (error) throw error;
      const out: Record<
        string,
        { code: string; name: string; reference: string }
      > = {};
      for (const row of data ?? []) {
        const r = row as {
          id: string;
          reference_no: string | number | null;
          advertiser?:
            | {
                tenant_client_code?: string | null;
                profile?: { full_name?: string | null } | null;
              }
            | Array<{
                tenant_client_code?: string | null;
                profile?: { full_name?: string | null } | null;
              }>
            | null;
        };
        const a = Array.isArray(r.advertiser) ? r.advertiser[0] : r.advertiser;
        const prof = Array.isArray(a?.profile) ? a?.profile[0] : a?.profile;
        out[r.id] = {
          code: (a?.tenant_client_code ?? "").trim(),
          name: (prof?.full_name ?? "").trim(),
          reference: String(r.reference_no ?? ""),
        };
      }
      return out;
    },
  });

  // Ask Wise what it knows about the ones we recorded blind. Context
  // only — reference, sender, description — never a status or a match.
  const refresh = useMutation({
    mutationFn: async () => {
      const res = await refreshWiseDepositDetails();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (d) => {
      if (d.filled > 0) {
        toast.success(
          `Filled in ${d.filled} deposit${d.filled === 1 ? "" : "s"}`,
          {
            description:
              d.withReference > 0
                ? `${d.withReference} now carry the payer's reference — Re-check matches to use them.`
                : "Sender and description only; no reference was on file.",
          },
        );
      } else {
        toast.message("Nothing new from Wise", {
          description: d.reason ?? "These deposits already have what Wise has.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
      queryClient.invalidateQueries({ queryKey: ["wise-ingest-status"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't reach Wise", { description: e.message }),
  });

  // Archived rows are out of the way, not gone. The toggle brings them
  // back with every field intact.
  const [showArchived, setShowArchived] = useState(false);
  const archive = useMutation({
    mutationFn: async (v: { id: string; archived: boolean }) => {
      const res = await setWiseDepositArchived(v.id, v.archived);
      if (!res.ok) throw new Error(res.error);
      return v;
    },
    onSuccess: (v) => {
      toast.success(v.archived ? "Put aside" : "Back in the queue");
      queryClient.invalidateQueries({ queryKey: ["wise-incoming"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't move that deposit", { description: e.message }),
  });

  const suggestedCount = allRows.filter((r) => r.status === "suggested").length;

  // Rendering all 100 made this page 28,000px tall on a phone — 35 screens of
  // scrolling, and the handful of deposits that actually need a decision were
  // buried among dozens of unmatched ones the admin can do nothing about.
  // Anything needing action comes first and is always shown; the rest is
  // capped behind a count the admin can open.
  const REST_PREVIEW = 8;
  const [showAll, setShowAll] = useState(false);
  // The archived ones are a separate view, not a longer fold. The fold
  // ("show N more with nothing to confirm") hides every quiet row
  // INCLUDING the ones that still need a person, which is why the queue
  // could not be worked down.
  const archivedCount = allRows.filter((r) => !!r.archived_at).length;
  const live = allRows.filter((r) =>
    showArchived ? !!r.archived_at : !r.archived_at,
  );
  const needsAction = live.filter((r) => r.status === "suggested");
  const rest = live.filter((r) => r.status !== "suggested");
  const restShown = showAll ? rest : rest.slice(0, REST_PREVIEW);
  const rows = [...needsAction, ...restShown];
  const hiddenCount = rest.length - restShown.length;

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div>
        {/* Title and its action on ONE line, the way every other screen in
            this app puts them. marginLeft:auto inside a wrapping h2 dropped
            the button onto a line of its own, floating between the heading
            and the sentence that explains it. */}
        <div className="phead">
          <h2
            style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
          >
            Bank deposits (Wise)
            {suggestedCount > 0 && (
              <span className="badge pend">{suggestedCount} to confirm</span>
            )}
          </h2>
          <div className="actrow">
            {archivedCount > 0 && (
              <button
                className={`btn ${showArchived ? "" : "ghost"} sm`}
                onClick={() => setShowArchived((v) => !v)}
                title="Deposits somebody put aside. Nothing is deleted — every field is still here."
              >
                {showArchived
                  ? "Back to the queue"
                  : `Archived (${archivedCount})`}
              </button>
            )}
            <button
              className="btn ghost sm"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
              title="Ask Wise for the reference, sender and description of the deposits that arrived without them"
            >
              {refresh.isPending ? "Asking Wise…" : "Fetch details from Wise"}
            </button>
            <button
              className="btn ghost sm"
              disabled={rematch.isPending}
              onClick={() => rematch.mutate()}
              title="Match the deposits with no match against the top-ups that are pending right now"
            >
              {rematch.isPending ? "Re-checking…" : "Re-check matches"}
            </button>
          </div>
        </div>
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
                    {showArchived
                      ? "Nothing archived."
                      : "No bank deposits detected yet."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const badge = statusView(r.status);
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
                            style={{
                              fontSize: ".75rem",
                              color: "var(--txt-2)",
                              // An IBAN is one unbreakable 34-character
                              // token; its three siblings in this cell were
                              // clipped and this one was missed, so each
                              // deposit card became a sideways-scrolling
                              // strip on a phone.
                              ...clip,
                            }}
                            title={r.sender_iban ?? undefined}
                          >
                            {r.sender_iban}
                          </div>
                        )}
                        {/* What Wise itself says about this credit. This
                            used to be the only line here besides the
                            reference, and it showed OUR OWN idempotency key
                            (balanceId:occurredAt:amount) as if it were
                            sender information. The key is still available
                            on hover, where an internal id belongs. */}
                        {r.description ? (
                          <div
                            className="muted"
                            style={{ fontSize: ".75rem", ...clip, maxWidth: 220 }}
                            title={r.description}
                          >
                            {r.description}
                          </div>
                        ) : null}
                        <div
                          className="mono"
                          style={{ fontSize: ".7rem", color: "var(--faint)", ...clip }}
                          title={`Wise id: ${r.external_id}`}
                        >
                          {r.external_id}
                        </div>
                      </td>
                      <td data-label="Result" style={{ verticalAlign: "top" }}>
                        <span
                          className={badge.cls}
                          style={badge.style}
                          title={r.status}
                        >
                          {badge.label}
                        </span>
                        {/* WHOSE wallet Confirm would credit. */}
                        {r.suggested_topup_id && matchedTo?.[r.suggested_topup_id] ? (
                          <div style={{ marginTop: 5 }}>
                            <div
                              style={{
                                fontFamily: "var(--hd)",
                                fontWeight: 800,
                                fontSize: ".82rem",
                                letterSpacing: "-.01em",
                              }}
                            >
                              {matchedTo[r.suggested_topup_id].code || "No code"}
                            </div>
                            <div
                              className="muted"
                              style={{ fontSize: ".75rem", ...clip, maxWidth: 170 }}
                              title={matchedTo[r.suggested_topup_id].name}
                            >
                              {matchedTo[r.suggested_topup_id].name || "—"}
                            </div>
                            <div
                              className="mono"
                              style={{ fontSize: ".7rem", color: "var(--faint)" }}
                            >
                              ref {matchedTo[r.suggested_topup_id].reference || "—"}
                            </div>
                          </div>
                        ) : null}
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
                      <td
                        data-label="Action"
                        className="r fullcell"
                        style={{ verticalAlign: "top" }}
                      >
                        {/* One row, both actions, same size — they were a
                            button and then a button in its own div with a
                            top margin, so they stacked and stepped. */}
                        <div className="actrow" style={{ flexWrap: "wrap" }}>
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
                        {/* Put it aside. 231 deposits, most of them old
                            test payments of 0.01 that will never match
                            anything, and no way to clear one out of the way
                            — so the one that mattered sat in a list of two
                            hundred that did not. Archiving is reversible
                            and loses nothing. */}
                        <button
                          className="btn ghost sm"
                          disabled={archive.isPending}
                          onClick={() =>
                            archive.mutate({
                              id: r.id,
                              archived: !r.archived_at,
                            })
                          }
                          title={
                            r.archived_at
                              ? "Put it back in the queue"
                              : "Move it to Archived — nothing is deleted"
                          }
                        >
                          {r.archived_at ? <ArchiveRestore /> : <Archive />}
                          {r.archived_at ? "Unarchive" : "Archive"}
                        </button>
                        </div>
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
      <button
        className="btn ghost sm"
        onClick={() => setOpen(true)}
        title="Pick the top-up this payment settles"
      >
        <Link2 /> Match
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
        <span
          className="muted"
          style={{
            fontSize: ".82rem",
            textAlign: "left",
            // The cell is text-align:right and about 300px wide in card
            // mode, so this sentence ran out of the card and took the
            // Cancel button with it.
            overflowWrap: "anywhere",
          }}
        >
          Nothing pending matches this amount.
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
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          // A flex-end row that overflows spills out of its START edge, so
          // without wrapping the Cancel button left the card entirely.
          flexWrap: "wrap",
        }}
      >
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
