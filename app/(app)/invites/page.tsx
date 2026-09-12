import InvitesHeader from "@/components/invites/invites-header";
import InvitesTable from "@/components/invites/invites-table";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  await requireSuperAdmin("/dashboard");

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <InvitesHeader />
      <InvitesTable />
    </div>
  );
}
