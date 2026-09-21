/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { Badge } from "@/components/ui/badge";
import TablePagination from "@/components/ui/table-pagination";
import { useAppContext } from "@/context/app-provider";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { InvitationStatus } from "@/lib/types/invite";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  Ban,
  CheckCircle2,
  Loader,
  TimerOff,
  XCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { userFacingErrorMessage } from "@/lib/pure-error";
import { copyText } from "@/lib/copy-text";

// Maps an invitation status to a mockup badge variant + label. Kept
// local so the shared InvitationStatusBadge (used outside the admin
// shell, e.g. /my-invites) can stay unchanged.
const INVITE_BADGE: Record<
  InvitationStatus,
  { cls: string; label: string }
> = {
  pending: { cls: "pend", label: "Pending" },
  accepted: { cls: "ok", label: "Accepted" },
  rejected: { cls: "due", label: "Rejected" },
  expired: { cls: "info", label: "Expired" },
  cancelled: { cls: "info", label: "Cancelled" },
};

// The two kinds of account an invitation can create. Written out rather
// than capitalised from the raw value, so a role nobody has seen before
// prints as itself instead of being dressed up as a known one.
const ROLE_LABEL: Record<string, string> = {
  advertiser: "Advertiser",
  affiliate: "Affiliate",
  admin: "Admin",
  super_admin: "Owner",
};

export default function InvitesTable() {
  const supabase = createClient();
  const { profile } = useAppContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  // ── CLAMPED ──────────────────────────────────────────────────────
  //
  // ?perPage=5000 asks PostgREST for .range(0,4999) and gets its 1,000
  // -- while Math.ceil(total / 5000) is 1, so TablePagination returns
  // null and the screen shows a thousand rows with NO pager, no row
  // count and no notice. Somebody works the list to the bottom and
  // reports the ledger settled with two thousand rows untouched.
  const initialPerPage = Math.min(
    100,
    Math.max(5, parseInt(searchParams?.get("perPage") ?? "10", 10) || 10),
  );
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);

  const {
    data: invitesData,
    isLoading,
    isError,
    error,
  } = useQuery({
    // ── THE TENANT BELONGS IN THE KEY ──────────────────────────────
    //
    // Every sibling keys by tenant; this one did not, while the query
    // itself filters .eq("tenant_id", ...). The QueryClient is a module
    // singleton with a 30s staleTime and switchToProfile ends in a soft
    // redirect, so a consultant moving from tenant A to tenant B read
    // TENANT A's invitations -- recipient emails and all -- under
    // tenant B's header. Cancel then went to the right row id, so they
    // revoked a tenant-A invitation from a screen labelled B.
    queryKey: ["invites", profile?.tenant_id, page, perPage],
    queryFn: async () => {
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const { data, error, count } = await supabase
        .from("invitations")
        .select("*, sender:user_profiles(id, full_name, email)", {
          count: "exact",
        })
        .eq("tenant_id", profile?.tenant_id)
        // Newest first, THEN a unique tiebreaker -- the order of these
        // calls is the sort priority, so id has to come second or it
        // becomes the primary key of the sort and the list stops being
        // chronological. Same reason as the audit and activity lists:
        // one timestamp is not a stable order, so a page boundary can
        // repeat a row and skip another.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(start, end);
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });
  const invites = invitesData?.items ?? [];
  const total = invitesData?.total ?? 0;

  // The client code is NOT on the invitation — it is assigned when the
  // advertiser row is created at signup, so a pending invite genuinely does
  // not have one yet. (The send dialog shows "PSM 000005" as a preview of the
  // next number, which is a preview and not a promise: invite two people and
  // whoever signs up first takes it.) So look the real code up for the
  // invitees who have actually joined, and leave the rest honestly blank.
  //
  // Scoped to the emails on THIS page, so the query stays ten rows wide
  // however many advertisers the tenant has.
  const pageEmails = invites
    .map((i: any) => i.email)
    .filter((e: unknown): e is string => typeof e === "string" && e.length > 0);

  const { data: codeByEmail, isError: codeByEmailError } = useQuery({
    queryKey: ["invite-client-codes", profile?.tenant_id, pageEmails.join(",")],
    enabled: pageEmails.length > 0 && !!profile?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisers")
        .select("tenant_client_code, profile:user_profiles!inner(email)")
        .eq("tenant_id", profile?.tenant_id)
        .in("profile.email", pageEmails);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as any[]) {
        const email = Array.isArray(row.profile)
          ? row.profile[0]?.email
          : row.profile?.email;
        if (email && row.tenant_client_code) {
          map[String(email).toLowerCase()] = String(row.tenant_client_code);
        }
      }
      return map;
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));
    if (page && page > 1) params.set("page", String(page));
    else params.delete("page");
    if (perPage && perPage !== 10) params.set("perPage", String(perPage));
    else params.delete("perPage");
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage]);
  const queryClient = useQueryClient();

  const { mutate: updateInvite, isPending } = useMutation<unknown, Error, any>({
    mutationKey: ["cancel-invite"],
    mutationFn: async ({ inviteId }) => {
      const { cancelInvitation } = await import("@/actions/invite-actions");
      const result = await cancelInvitation(inviteId, "cancelled");
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
      setCancelling(null);
      toast.success("Invitation cancelled");
    },
    // A REFUSAL HAS TO BE AUDIBLE. There was no onError and no success
    // toast, and the modal closes itself before the mutation runs — so a
    // tenant guard, MAINTENANCE_MODE or a stale row produced absolutely
    // nothing on screen. The admin walked away believing the link was
    // dead while the recipient could still accept it.
    onError: (e: Error) =>
      toast.error("Couldn't cancel that invite", {
        description: e.message,
      }),
  });

  // Cancelling kills the recipient's existing link — there is no un-cancel,
  // only sending a fresh invite. And `isPending` is one table-wide flag, so
  // during the write every row's Cancel greys out and the operator cannot
  // see which one they hit.
  const [cancelling, setCancelling] = useState<{
    id: string;
    email?: string | null;
  } | null>(null);

  const handleCancelInvite = (inviteId: string) => {
    updateInvite({ inviteId });
  };

  if (isLoading) {
    return <p className="muted">Loading…</p>;
  }

  if (isError) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Error loading invites. {/* userFacingErrorMessage, per CLAUDE.md. make-query-client already
                routes the TOAST for this same query through it; the card
                underneath printed the unsanitised original, so one
                failure gave two different messages and the raw one
                carried PostgREST's details/hint. */}
          {" "}
          {userFacingErrorMessage(error, "Give it a reload.")}
        </p>
      </div>
    );
  }

  if (!invites || invites.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          {"You've not sent any invites yet."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th>Client code</th>
                <th>Sender</th>
                <th>Recipient Email</th>
                {/* ── THE TWO DATES NEXT TO EACH OTHER ──────────────
                    On a phone this table becomes a two-up card, and with
                    Status sitting between them "Created on" paired with
                    Status while "Expires on" was left alone on its own
                    row. Those two dates are read TOGETHER -- how long is
                    left -- and the one thing between them was a pill. */}
                <th>Created on</th>
                <th>Expires on</th>
                {/* ── WHAT KIND OF INVITE THIS IS ───────────────────
                    The list showed who sent it, to whom, and when, and
                    never said whether the person was being invited as an
                    advertiser or as an affiliate. Those are two entirely
                    different accounts -- one gets a plan, a wallet and a
                    subscription, the other a referral link -- and the
                    only way to find out was to wait for them to sign up
                    and see what appeared. */}
                <th>Type</th>
                <th>Status</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite: any) => {
                // ── EXPIRY IS A DATE, NOT A STATUS ────────────────
                //
                // The badge was a pure lookup on the stored column, and
                // NOTHING in this app ever writes status='expired' --
                // the action allows it, the only call site hardcodes
                // "cancelled", and there is no sweeper. Expiry IS
                // enforced, at accept time, at 7 days. So an invite
                // sent on the 1st read "Pending" on the 20th with a
                // live Cancel button: the owner did not re-send, the
                // recipient got "this invitation has expired", and each
                // blamed the other for twelve days. The date is
                // rendered two columns away and compared to nothing.
                const expiredNow =
                  invite.status === "pending" &&
                  !!invite.expires_at &&
                  new Date(invite.expires_at).getTime() < Date.now();
                const badge = expiredNow
                  ? INVITE_BADGE.expired
                  : (INVITE_BADGE[invite.status as InvitationStatus] ??
                    INVITE_BADGE.pending);
                const code = invite.email
                  ? codeByEmail?.[String(invite.email).toLowerCase()]
                  : undefined;
                return (
                  <tr key={invite.id}>
                    <td data-label="Client code">
                      {code ? (
                        <span style={{ fontWeight: 800 }}>{code}</span>
                      ) : (
                        // A POSITIVE CLAIM FROM A QUERY THAT MAY NOT
                        // HAVE RUN. "Assigned when the invitee signs up"
                        // says this person has not signed up -- and on a
                        // failed lookup it says that about somebody who
                        // has, which ends in chasing or re-inviting a
                        // customer who already has an account.
                        <span
                          className="muted"
                          title={
                            codeByEmailError
                              ? "We couldn't check whether this invite has been accepted."
                              : "Assigned when the invitee signs up"
                          }
                        >
                          {codeByEmailError ? "?" : "—"}
                        </span>
                      )}
                    </td>
                    <td data-label="Sender">
                      <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {invite.sender?.full_name || "N/A"}
                      </div>
                    </td>
                    {/* The recipient IS the invite's identity, so it stays
                        — with an ellipsis rather than a hard cut. */}
                    <td data-label="Recipient Email" style={{ fontWeight: 600 }}>
                      <div className="oneline" title={invite.email || undefined}>
                        {invite.email || "—"}
                      </div>
                    </td>
                    <td data-label="Created on">{dayjs(invite.created_at).format(DATE_TIME_FORMAT)}</td>
                    <td data-label="Expires on">{dayjs(invite.expires_at).format(DATE_TIME_FORMAT)}</td>
                    <td data-label="Type">
                      {ROLE_LABEL[String(invite.role ?? "").toLowerCase()] ?? (
                        /* An unrecognised role prints AS IT IS. A blank
                           cell, or a confident "Advertiser" over a value
                           nobody has seen before, is how a wrong account
                           type gets created and nobody notices. */
                        <span className="muted">
                          {String(invite.role ?? "—")}
                        </span>
                      )}
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td data-label="Action" className="r">
                      {invite.status === "pending" ? (
                        /* ── AND A WAY TO GET THE LINK ────────────────
                           The only action on a pending invite was Cancel.
                           So when the email did not arrive -- spam, a
                           typo in the address, a corporate filter -- the
                           admin saw "Pending" and had nothing: no link,
                           no resend, no way to read the token. The only
                           move left was to cancel and send a second
                           invite to the same address and hope.

                           The token IS the authorization, and it is
                           already on the row this table selects. Handing
                           it to the admin who created the invitation
                           costs nothing and closes the dead end: they
                           can paste it into a chat, a different mailbox,
                           or read it out. Same URL the email carries. */
                        <div className="actrow">
                          <button
                            className="btn ghost sm"
                            onClick={async () => {
                              const token = String(
                                (invite as { token?: string | null }).token ?? "",
                              );
                              if (!token) {
                                toast.error(
                                  "This invitation has no link on it — cancel it and send a fresh one.",
                                );
                                return;
                              }
                              const link = `${window.location.origin}/invite/accept?token=${token}`;
                              const ok = await copyText(link);
                              // copyText can fail -- an insecure origin, a
                              // browser that refuses without a gesture it
                              // recognises. Saying "Copied" either way is
                              // how somebody pastes an empty clipboard to
                              // a customer.
                              toast[ok ? "success" : "error"](
                                ok
                                  ? "Invite link copied — it works until it expires or is cancelled."
                                  : "Couldn't copy. Select the address bar link manually instead.",
                              );
                            }}
                          >
                            Copy link
                          </button>
                          <button
                            className="btn ghost sm"
                            disabled={isPending}
                            onClick={() => setCancelling(invite)}
                          >
                            {isPending ? "…" : "Cancel"}
                          </button>
                        </div>
                      ) : (
                        /* An accepted or cancelled invite has no action, and
                           an empty cell under an "ACTION" label is a label
                           for nothing. Say there is nothing. */
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 && (
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      )}

      <ConfirmModal
        open={!!cancelling}
        onOpenChange={(next) => {
          if (!next) setCancelling(null);
        }}
        title="Cancel this invitation?"
        lead="The link you sent them stops working. There is no un-cancel — you would have to send a new invite."
        cta="Yes, cancel it"
        tone="danger"
        busy={isPending}
        busyLabel="Cancelling…"
        onConfirm={() => {
          // Do NOT close first. ConfirmModal refuses to close while busy,
          // which is the whole point of its busy prop — closing before the
          // mutation threw that away and made the failure invisible.
          if (cancelling) handleCancelInvite(cancelling.id);
        }}
      >
        <ConfirmFact label="Invited" value={cancelling?.email ?? "—"} />
      </ConfirmModal>
    </>
  );
}

export function InvitationStatusBadge({
  status,
}: {
  status: InvitationStatus;
}) {
  const statusConfig: Record<
    InvitationStatus,
    { label: string; icon: React.ElementType; color: string }
  > = {
    pending: {
      label: "Pending",
      icon: Loader,
      color: "text-amber-600",
    },
    accepted: {
      label: "Accepted",
      icon: CheckCircle2,
      color: "text-emerald-600",
    },
    rejected: {
      label: "Rejected",
      icon: XCircle,
      color: "text-red-600",
    },
    expired: {
      label: "Expired",
      icon: TimerOff,
      color: "text-gray-600",
    },
    cancelled: {
      label: "Cancelled",
      icon: Ban,
      color: "text-slate-600",
    },
  };

  const { label, icon: Icon, color } = statusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1.5 font-medium tracking-wide border-border",
        "text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", color)} />
      {label}
    </Badge>
  );
}
