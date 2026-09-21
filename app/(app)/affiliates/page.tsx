import AffiliatesBook from "@/components/affiliate/affiliates-book";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  await requireSuperAdmin("/dashboard");

  // One row per AFFILIATE, and ?a=<advertiser id> opens one of them --
  // see components/affiliate/affiliates-book.tsx. The per-link table this
  // replaced is kept only until nothing links to it.
  return <AffiliatesBook />;
}
