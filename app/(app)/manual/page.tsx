import AdminManual from "@/components/admin/admin-manual";
import { requireAdmin } from "@/lib/auth/require-admin";

// Admin-level in-app handbook. requireAdmin() gates it to admins (super-admins
// share the admin role, so they are included). Fully static/presentational —
// no data fetching or business-table writes.
export default async function Page() {
  await requireAdmin();

  return <AdminManual />;
}
