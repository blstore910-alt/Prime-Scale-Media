"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlusCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import AdminCredentialsDialog from "./admin-credentials-dialog";
import CreateAdminDialog from "./create-admin-dialog";

type AdminProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  is_active: boolean | null;
  created_at: string;
};

export default function AdminsTable() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id ?? null;
  const [createOpen, setCreateOpen] = useState(false);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [pendingAdminId, setPendingAdminId] = useState<string | null>(null);

  const {
    data: admins = [],
    isLoading,
    isError,
    error,
  } = useQuery<AdminProfile[]>({
    queryKey: ["admins", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("user_profiles")
        .select("id, full_name, email, status, is_active, created_at")
        .eq("tenant_id", tenantId)
        .eq("role", "admin")
        .order("created_at", { ascending: false });

      if (profile?.id) {
        query = query.neq("id", profile.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AdminProfile[];
    },
  });

  const { mutate: toggleStatus } = useMutation({
    mutationFn: async (admin: AdminProfile) => {
      const nextStatus = admin.status === "active" ? "inactive" : "active";
      const supabase = createClient();
      const { error } = await supabase
        .from("user_profiles")
        .update({
          status: nextStatus,
          is_active: nextStatus === "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", admin.id);
      if (error) throw error;
      return nextStatus;
    },
    onSuccess: (nextStatus) => {
      queryClient.invalidateQueries({ queryKey: ["admins", tenantId] });
      toast.success(
        `Admin ${nextStatus === "active" ? "activated" : "deactivated"}.`,
      );
    },
    onError: (mutationError) => {
      toast.error("Failed to update admin.", {
        description:
          mutationError instanceof Error
            ? mutationError.message
            : "Unknown error",
      });
    },
    onSettled: () => {
      setPendingAdminId(null);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Admins</h2>
          <p className="text-sm text-muted-foreground">
            Manage admin access for this tenant.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Admin
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <TableRow key={idx} className="animate-pulse">
                  {Array.from({ length: 4 }).map((__, cellIdx) => (
                    <LoaderCell key={cellIdx} />
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-destructive py-8"
                >
                  <div role="alert" aria-live="assertive">
                    <p className="font-medium">Failed to load admins.</p>
                    <p className="mt-2 text-sm">
                      {(error as Error)?.message ?? String(error)}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : admins.length ? (
              admins.map((admin) => {
                const isActive = admin.status === "active";
                return (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      {admin.full_name ?? "-"}
                    </TableCell>
                    <TableCell>{admin.email ?? "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "capitalize",
                          isActive
                            ? "bg-green-500 hover:bg-green-600 text-white"
                            : "bg-destructive hover:bg-destructive/90 text-white",
                        )}
                      >
                        {admin.status ?? "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={isActive ? "destructive" : "default"}
                        className={cn(isActive && "text-white")}
                        disabled={pendingAdminId === admin.id}
                        onClick={() => {
                          setPendingAdminId(admin.id);
                          toggleStatus(admin);
                        }}
                      >
                        {pendingAdminId === admin.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        {isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  No admins found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CreateAdminDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          setCredentials(created);
          queryClient.invalidateQueries({ queryKey: ["admins", tenantId] });
        }}
      />

      <AdminCredentialsDialog
        open={!!credentials}
        onOpenChange={(open) => {
          if (!open) setCredentials(null);
        }}
        credentials={credentials}
      />
    </div>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
