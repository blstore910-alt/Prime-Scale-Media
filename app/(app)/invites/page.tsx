import InvitesHeader from "@/components/invites/invites-header";
import InvitesTable from "@/components/invites/invites-table";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  await requireSuperAdmin("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <InvitesHeader />
          <InvitesTable />
        </div>
      </div>
    </div>
  );
}
