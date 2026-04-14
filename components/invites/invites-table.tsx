/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { useAppContext } from "@/context/app-provider";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { InvitationStatus } from "@/lib/types/invite";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Loader,
  Loader2,
  MoreVerticalIcon,
  TimerOff,
  XCircle,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import InviteCard from "./invite-card";
import { useMediaQuery } from "usehooks-ts";

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
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
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
    mutationFn: async ({ inviteId, payload }) => {
      const { error, data } = await supabase
        .from("invitations")
        .update(payload)
        .eq("id", inviteId)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
  });

  const handleCancelInvite = (inviteId: string) => {
    updateInvite({ inviteId, payload: { status: "cancelled" } });
  };

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  // --- Error state ---
  if (isError) {
    return (
      <Card className="p-6 flex items-center gap-2 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>Error loading accounts: {error.message}</span>
      </Card>
    );
  }

  // --- Empty state ---
  if (!invites || invites.length === 0) {
    return (
      <Card className="p-6 text-muted-foreground text-center">
        {"You've not send any invites yet."}
      </Card>
    );
  }

  return (
    <>
      {isTabletScreen ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Sender</TableHead>
                <TableHead>Recipient Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created on</TableHead>
                <TableHead>Expires on</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite: any) => (
                <TableRow key={invite.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {invite.sender?.full_name || "N/A"}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {invite.sender?.email || "No email"}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="font-medium cursor-pointer hover:underline underline-offset-2">
                    {invite.email || "—"}
                  </TableCell>

                  <TableCell>
                    <InvitationStatusBadge
                      status={invite.status as InvitationStatus}
                    />
                  </TableCell>

                  <TableCell>
                    {dayjs(invite.created_at).format(DATE_TIME_FORMAT)}
                  </TableCell>
                  <TableCell>
                    {dayjs(invite.expires_at).format(DATE_TIME_FORMAT)}
                  </TableCell>

                  <TableCell>
                    {!["accepted", "cancelled"].includes(invite.status) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
                            size="icon"
                          >
                            {isPending ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <MoreVerticalIcon />
                            )}
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end" className="w-36">
                          {invite.status === "pending" && (
                            <DropdownMenuItem
                              onClick={() => handleCancelInvite(invite.id)}
                              className="text-destructive"
                            >
                              Cancel Invite
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div>
          {invites?.length ? (
            <div className="grid gap-4">
              {invites.map((invite: any) => (
                <InviteCard
                  key={invite.id}
                  invite={invite}
                  onCancel={(id?: string) => {
                    if (id) handleCancelInvite(id);
                  }}
                />
              ))}
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <Card className="p-6 text-muted-foreground text-center">
              {"You've not send any invites yet."}
            </Card>
          )}
        </div>
      )}
      {/* pagination */}
      <div className="p-4">
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      </div>
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
