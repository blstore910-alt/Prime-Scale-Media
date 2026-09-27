"use client";

import { Ic } from "./adv-icons";

/**
 * The top of the advertiser dashboard.
 *
 * It replaces three separate things that were all saying the same number: two
 * of the four stat tiles (Wallet balance, USD balance), the "Your wallets"
 * section further down the page, and the wallet chip in the top bar. An
 * advertiser opens this app to see what they can spend; that answer was
 * scattered across a screen and a half of flat white tiles.
 *
 * The two balances are shown side by side as equals and never added together —
 * summing them would mean picking a rate and presenting the result as fact,
 * and the rate belongs to the exchange screen where it is stated.
 */
export default function BalanceHero({
  firstName,
  eurText,
  usdText,
  onTopup,
  onExchange,
  onOpenWallet,
  onOpenAccounts,
  disabled,
  disabledReason,
  loading,
  returning,
}: {
  firstName: string;
  eurText: string;
  usdText: string;
  onTopup: () => void;
  onExchange: () => void;
  onOpenWallet: () => void;
  onOpenAccounts: () => void;
  disabled?: boolean;
  /** Why the two buttons are dead. A dead control with no reason is the
   *  fault this app has fixed three times elsewhere. */
  disabledReason?: string | null;
  /** The wallet has not been read yet. */
  loading?: boolean;
  /**
   * Have they been here before?
   *
   * "Welcome back" was unconditional, and finalizeSignup sends a brand-new
   * account straight to this screen -- so the first sentence somebody ever
   * read in this app welcomed them back to a place they had never been.
   * Undefined means we do not know yet, and then the neutral greeting is
   * the safe one: "Welcome" is never wrong, "Welcome back" can be.
   */
  returning?: boolean;
}) {
  return (
    <section className="hero">
      {/* Decoration only — the same slow ribbon and starfield the sign-in
          screen uses, so the app opens in the brand it signed you in with.
          Both are frozen under prefers-reduced-motion (see adv-shell-css). */}
      <span className="hero-ribbon" aria-hidden="true" />
      <span className="hero-stars" aria-hidden="true" />

      <p className="hero-greet">{returning ? "Welcome back" : "Welcome"}</p>
      <h1 className="hero-h">{firstName}</h1>

      <div className="hero-bal">
        <button
          type="button"
          className="hero-w"
          onClick={onOpenWallet}
          aria-label={`EUR wallet, ${eurText}. Open wallet`}
        >
          <span className="l">
            <i style={{ background: "#5B8DFF" }} />
            EUR wallet
          </span>
          {/* A balance that has not been read yet is not zero. Printing "€0"
              and replacing it a moment later with the real figure is both a
              flicker and, for a second, a lie. */}
          <span className={`v${loading ? " skel" : ""}`}>
            {loading ? "" : eurText}
          </span>
        </button>
        <button
          type="button"
          className="hero-w"
          onClick={onOpenWallet}
          aria-label={`USD wallet, ${usdText}. Open wallet`}
        >
          <span className="l">
            <i style={{ background: "#8B5CF6" }} />
            USD wallet
          </span>
          <span className={`v${loading ? " skel" : ""}`}>
            {loading ? "" : usdText}
          </span>
        </button>
      </div>

      {/* ── SAY WHY, ON THE CARD ─────────────────────────────────────
          Top up and Exchange go dead when there is no wallet row yet or
          the company is incomplete, and nothing said so -- on the
          customer's own dashboard, on the two controls that put money
          in. A title would not have helped: this is a phone app and a
          title does not fire on a disabled button anyway. */}
      {disabled && disabledReason ? (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: ".82rem",
            opacity: 0.85,
          }}
        >
          {disabledReason}
        </p>
      ) : null}

      <div className="hero-a">
        <button className="hero-btn" onClick={onTopup} disabled={disabled}>
          <Ic name="i-plus" /> Top up
        </button>
        <button
          className="hero-btn gh"
          onClick={onExchange}
          disabled={disabled}
        >
          <Ic name="i-swap" /> Exchange
        </button>
        {/* Not "Wallet" — the two balances above ARE the wallet, and a third
            button going where they already go is a control that repeats
            itself. From here the next thing anyone does with funded money is
            put it on an ad account. */}
        <button className="hero-btn gh" onClick={onOpenAccounts}>
          {/* "Accounts", not "Ad accounts". The icon belongs beside the
              label — that is what makes a row of three read as a row of
              three rather than as three words — and the only reason it
              was being dropped on a narrow phone was this third label
              being two words. Under the wallet balance, in an app whose
              only accounts are ad accounts, one word says it. */}
          <Ic name="i-ad" /> Accounts
        </button>
      </div>
    </section>
  );
}
