"use client";

import { toggleAdminStatus } from "@/actions/admin-actions";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
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
  last_seen_at: string | null;
};

function formatLastSeen(iso: string | null): {
  label: string;
  fresh: boolean;
} {
  if (!iso) return { label: "Never", fresh: false };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { label: "Never", fresh: false };
  const ageMinutes = (Date.now() - t) / 60000;
  if (ageMinutes < 6) return { label: "Active now", fresh: true };
  if (ageMinutes < 60)
    return { label: `${Math.round(ageMinutes)}m ago`, fresh: true };
  if (ageMinutes < 60 * 24)
    return { label: `${Math.round(ageMinutes / 60)}h ago`, fresh: false };
  return {
    label: `${Math.round(ageMinutes / 60 / 24)}d ago`,
    fresh: false,
  };
}

// Admins management, ported to the mockup look. Reuses the real admins
// query + toggleAdminStatus mutation and the create / credentials
// dialogs — presentation only.
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
        .select(
          "id, full_name, email, status, is_active, created_at, last_seen_at",
        )
        .eq("tenant_id", tenantId)
        .eq("role", "admin")
        .order("created_at", { ascending: false });

      // The caller IS listed. Excluding yourself made the page say "No
      // admins found" to the only admin there is — false, and it hid the one
      // fact an owner needs from this screen: whether anyone else has the
      // keys. The self row simply carries no deactivate control; you cannot
      // lock yourself out, and the action refuses it anyway.

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AdminProfile[];
    },
  });

  const { mutate: toggleStatus } = useMutation({
    mutationFn: async (admin: AdminProfile) => {
      const result = await toggleAdminStatus(admin.id);
      if (!result.ok) throw new Error(result.error);
      return result.data.status;
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
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Admins</h1>
          <p>Admin access for this tenant.</p>
        </div>
        <div className="pacts">
          <button className="btn" onClick={() => setCreateOpen(true)}>
            <UserPlus /> <span className="blab">Create Admin</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load admins. {(error as Error)?.message ?? String(error)}
          </p>
        </div>
      ) : admins.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => {
                  const isActive = admin.status === "active";
                  const isSelf = admin.id === profile?.id;
                  const lastSeen = formatLastSeen(admin.last_seen_at);
                  return (
                    <tr key={admin.id}>
                      <td data-label="Name" style={{ fontWeight: 700 }}>
                        {admin.full_name ?? "-"}
                        {isSelf && (
                          <span
                            className="badge"
                            style={{ marginLeft: 8, fontWeight: 700 }}
                          >
                            You
                          </span>
                        )}
                      </td>
                      {/* An email column has to show the email, so this one
                          ellipsizes rather than being dropped — but it must
                          not cut off mid-address the way it did. */}
                      <td data-label="Email">
                        <div className="oneline" title={admin.email ?? undefined}>
                          {admin.email ?? "-"}
                        </div>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${isActive ? "ok" : "due"}`}
                          style={{ textTransform: "capitalize" }}
                        >
                          {admin.status ?? "unknown"}
                        </span>
                      </td>
                      <td data-label="Last seen">
                        <span
                          style={{
                            fontSize: ".8rem",
                            fontWeight: lastSeen.fresh ? 700 : 500,
                            color: lastSeen.fresh
                              ? "var(--win)"
                              : "var(--faint)",
                          }}
                          title={admin.last_seen_at ?? "Never seen"}
                        >
                          {lastSeen.label}
                        </span>
                      </td>
                      <td data-label="Action" className="r fullcell">
                        {isSelf ? (
                          <span className="muted" style={{ fontSize: ".82rem" }}>
                            You can&apos;t change your own access
                          </span>
                        ) : (
                        <button
                          className={`btn sm${isActive ? " ghost" : ""}`}
                          disabled={pendingAdminId === admin.id}
                          onClick={() => {
                            const verb = isActive ? "Deactivate" : "Activate";
                            if (
                              !window.confirm(
                                `${verb} ${admin.full_name ?? admin.email ?? "this admin"}? ${
                                  isActive
                                    ? "They lose access immediately."
                                    : "They regain admin access."
                                }`,
                              )
                            )
                              return;
                            setPendingAdminId(admin.id);
                            toggleStatus(admin);
                          }}
                        >
                          {pendingAdminId === admin.id ? (
                            <Loader2
                              className="animate-spin"
                              style={{ width: 14, height: 14 }}
                            />
                          ) : null}
                          {isActive ? "Deactivate" : "Activate"}
                        </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No admins found.
          </p>
        </div>
      )}

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
