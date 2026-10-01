import AdminManual from "@/components/admin/admin-manual";
import StaffHandbook from "@/components/admin/staff-handbook";
import { requireAdmin } from "@/lib/auth/require-admin";

// Admin-level in-app handbook. requireAdmin() gates it to admins (super-admins
// share the admin role, so they are included). Fully static/presentational —
// no data fetching or business-table writes.
//
// De eigenaar, 01-10: "10x duidelijker, voor iemand met nul kennis, met een
// taalkiezer". Bovenaan het nieuwe handboek (wat/waarom/hoe/let op, in elke
// taal); daaronder de oude naslag per scherm, voor wie een knop zoekt.
export default async function Page() {
  await requireAdmin();

  return (
    <>
      <StaffHandbook />
      <div className="mx-auto w-full max-w-4xl px-4 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:px-6">
        Reference — screen by screen
      </div>
      <AdminManual />
    </>
  );
}
