import AdminsTable from "@/components/admins/admins-table";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  await requireSuperAdmin("/dashboard");

  return <AdminsTable />;
}
