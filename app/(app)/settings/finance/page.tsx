import ExchangeRates from "@/components/settings/finance/exchange-rates";

// Finance = exchange rates only. Ad-account types, plans and integrations
// each have their own settings tab now (they aren't "finance").
export default function Page() {
  return <ExchangeRates />;
}
