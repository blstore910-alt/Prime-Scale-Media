import PartnerAdmin from "@/components/partners/partner-admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  // Admin en niet alleen de eigenaar: een partner toevoegen raakt geen
  // geld en geen klantgegevens, en het is precies het soort klus dat de
  // co-pilot moet kunnen doen als de eigenaar weg is. De server action
  // erachter toetst zelf opnieuw -- deze poort is voor het scherm, niet
  // de grens.
  await requireAdmin("/dashboard");
  return <PartnerAdmin />;
}
