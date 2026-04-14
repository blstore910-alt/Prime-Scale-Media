export async function getExchangeRate(
  from: string,
  to?: string,
  amount?: number,
) {
  try {
    const fromCurrency = from.toLocaleLowerCase();
    const toCurrency = to?.toLocaleLowerCase();
    const res = await fetch(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${fromCurrency}.json`,
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch rate: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    let rate;
    if (toCurrency) {
      rate = data[fromCurrency][toCurrency];

      if (!rate) throw new Error(`Rate for ${from} not found`);
    }

    return to ? (amount ? amount * rate.toFixed(2) : rate.toFixed(2)) : data;
  } catch (error) {
    console.error("Exchange API Error:", error);
    throw error;
  }
}
