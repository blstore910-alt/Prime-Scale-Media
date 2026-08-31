import ExchangeRates from "@/components/settings/finance/exchange-rates";
import AdAccountTypesCard from "@/components/settings/finance/ad-account-types";
import React from "react";

export default function Page() {
  return (
    <>
      <ExchangeRates />
      <section className="max-w-xl mx-auto mt-6 mb-10">
        <AdAccountTypesCard />
      </section>
    </>
  );
}
