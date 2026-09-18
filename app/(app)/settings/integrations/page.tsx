import IntegrationStatusCard from "@/components/settings/finance/integration-status";
import RockadsPanel from "@/components/integrations/rockads-panel";

export default function Page() {
  return (
    <section className="max-w-3xl mx-auto mt-6 mb-10 flex flex-col gap-8">
      <IntegrationStatusCard />
      {/* A supplier's API, read-only. It shows what we pay them, so it
          belongs here under /settings and nowhere a customer can reach. */}
      <RockadsPanel />
    </section>
  );
}
