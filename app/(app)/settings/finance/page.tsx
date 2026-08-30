import ExchangeRates from "@/components/settings/finance/exchange-rates";
import FeeDefaultsCard from "@/components/settings/finance/fee-defaults";
import React from "react";

export default function Page() {
  return (
    <>
      <ExchangeRates />
      <section className="max-w-xl mx-auto mt-6 mb-10">
        <FeeDefaultsCard />
      </section>
    </>
  );
}
