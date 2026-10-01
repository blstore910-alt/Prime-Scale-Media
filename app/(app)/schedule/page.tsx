import StaffSchedule from "@/components/admin/staff-schedule";
import { requireAdmin } from "@/lib/auth/require-admin";

// Het rooster van de admins. Zie plak 189.
export default async function Page() {
  await requireAdmin("/dashboard");
  return (
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
      <StaffSchedule />
    </div>
  );
}
