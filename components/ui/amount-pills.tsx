"use client";

/**
 * Four amounts, one tap.
 *
 * Every figure on these screens has to be typed, on a phone, with a
 * numeric keypad, into a box that is the only thing between a customer
 * and a bank transfer. The amounts people actually send cluster: a
 * thousand, three, five, ten. Typing "10000" and getting "1000" because
 * a zero did not register is a transfer that is short by a factor of
 * ten, and nothing downstream can tell the difference.
 *
 * A pill above the ceiling is shown disabled rather than hidden: a row
 * that changes length as the balance moves is harder to aim at than one
 * that does not, and "greyed out" says WHY it cannot be pressed, which
 * an absent pill does not.
 */

const PRESETS = [1000, 3000, 5000, 10000] as const;

export default function AmountPills({
  currency,
  max,
  onPick,
  disabled,
}: {
  /** "EUR" | "USD" — only used for the symbol. */
  currency: string;
  /** The most that can be picked, when there is a ceiling. */
  max?: number | null;
  onPick: (amount: number) => void;
  disabled?: boolean;
}) {
  const sym = String(currency ?? "EUR").toUpperCase() === "USD" ? "$" : "€";
  const ceiling =
    typeof max === "number" && Number.isFinite(max) && max > 0 ? max : null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {PRESETS.map((v) => {
        const tooBig = ceiling !== null && v > ceiling;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled || tooBig}
            onClick={() => onPick(v)}
            title={
              tooBig
                ? `More than the ${sym}${ceiling.toLocaleString("en-US")} available`
                : undefined
            }
            className="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:border-ring hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {sym}
            {v.toLocaleString("en-US")}
          </button>
        );
      })}
      {ceiling !== null ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(Number(ceiling.toFixed(2)))}
          className="rounded-full border border-dashed px-3 py-1.5 text-sm font-medium transition-colors hover:border-ring hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40"
        >
          All {sym}
          {ceiling.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </button>
      ) : null}
    </div>
  );
}
