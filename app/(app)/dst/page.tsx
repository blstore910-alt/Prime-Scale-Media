import PsmDst from "@/components/dst/psm-dst";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");
  return <PsmDst />;
}
