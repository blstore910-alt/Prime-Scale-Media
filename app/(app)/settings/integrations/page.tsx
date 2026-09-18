import IntegrationStatusCard from "@/components/settings/finance/integration-status";
import RockadsPanel from "@/components/integrations/rockads-panel";

export default function Page() {
  // px-4: without a side gutter the cards touched both edges on a phone,
  // and anything a pixel too wide spilled off the screen.
  return (
    <section className="max-w-3xl mx-auto mt-6 mb-10 flex min-w-0 flex-col gap-8 px-4">
      <IntegrationStatusCard />
      {/* A supplier's API, read-only. It shows what we pay them, so it
          belongs here under /settings and nowhere a customer can reach. */}
      <RockadsPanel />
    </section>
  );
}
