import AffiliatesTable from "@/components/affiliate/affiliate-table";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  await requireSuperAdmin("/dashboard");

  return <AffiliatesTable />;
}
