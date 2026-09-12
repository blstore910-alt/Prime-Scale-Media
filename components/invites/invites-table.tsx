/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

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

export default function InvitesTable() {
  const supabase = createClient();
  const { profile } = useAppContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "10", 10) || 10;
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);

  const {
    data: invitesData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["invites", page, perPage],
    queryFn: async () => {
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const { data, error, count } = await supabase
        .from("invitations")
        .select("*, sender:user_profiles(id, full_name, email)", {
          count: "exact",
        })
        .eq("tenant_id", profile?.tenant_id)
        .range(start, end)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });
  const invites = invitesData?.items ?? [];
  const total = invitesData?.total ?? 0;

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
    },
  });

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
          Error loading invites. {error.message}
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
                <th>Sender</th>
                <th>Recipient Email</th>
                <th>Status</th>
                <th>Created on</th>
                <th>Expires on</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite: any) => {
                const badge =
                  INVITE_BADGE[invite.status as InvitationStatus] ??
                  INVITE_BADGE.pending;
                return (
                  <tr key={invite.id}>
                    <td data-label="Sender">
                      <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {invite.sender?.full_name || "N/A"}
                      </div>
                      <div
                        style={{ color: "var(--faint)", fontSize: ".8rem" }}
                      >
                        {invite.sender?.email || "No email"}
                      </div>
                    </td>
                    <td data-label="Recipient Email" style={{ fontWeight: 600 }}>{invite.email || "—"}</td>
                    <td data-label="Status">
                      <span className={`badge ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td data-label="Created on">{dayjs(invite.created_at).format(DATE_TIME_FORMAT)}</td>
                    <td data-label="Expires on">{dayjs(invite.expires_at).format(DATE_TIME_FORMAT)}</td>
                    <td data-label="Action" className="r">
                      {invite.status === "pending" ? (
                        <button
                          className="btn ghost sm"
                          disabled={isPending}
                          onClick={() => handleCancelInvite(invite.id)}
                        >
                          {isPending ? "…" : "Cancel"}
                        </button>
                      ) : null}
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
