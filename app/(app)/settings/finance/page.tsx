import ExchangeRates from "@/components/settings/finance/exchange-rates";
import AdAccountTypesCard from "@/components/settings/finance/ad-account-types";
import PlansCard from "@/components/settings/finance/plans";
import React from "react";

export default function Page() {
  return (
    <>
      <ExchangeRates />
      <section className="max-w-xl mx-auto mt-6 space-y-6">
        <AdAccountTypesCard />
      </section>
      <section className="max-w-3xl mx-auto mt-6 mb-10">
        <PlansCard />
      </section>
    </>
  );
}
