import ExchangesScreen from "@/components/exchanges/exchanges-screen";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  // Eigenaar, net als /ledger en /reconciliation. Dit is elke
  // omwisseling van elke klant op een pagina, en dat hoort in dezelfde
  // groep te zitten als de andere twee schermen die de hele boekhouding
  // laten zien.
  const { profile } = await requireSuperAdmin("/dashboard");

  // De tenant komt van de SESSIE, niet van de rij: `wallet_exchanges`
  // heeft geen `tenant_id`, dus het scherm joint via
  // wallets -> advertisers en heeft hem hier nodig.
  return <ExchangesScreen tenantId={profile.tenant_id as string} />;
}
