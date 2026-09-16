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
  disabled,
}: {
  firstName: string;
  eurText: string;
  usdText: string;
  onTopup: () => void;
  onExchange: () => void;
  onOpenWallet: () => void;
  disabled?: boolean;
}) {
  return (
    <section className="hero">
      {/* Decoration only — the same slow ribbon and starfield the sign-in
          screen uses, so the app opens in the brand it signed you in with.
          Both are frozen under prefers-reduced-motion (see adv-shell-css). */}
      <span className="hero-ribbon" aria-hidden="true" />
      <span className="hero-stars" aria-hidden="true" />

      <p className="hero-greet">Welcome back</p>
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
          <span className="v">{eurText}</span>
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
          <span className="v">{usdText}</span>
        </button>
      </div>

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
        <button className="hero-btn gh" onClick={onOpenWallet}>
          <Ic name="i-arrow" /> Wallet
        </button>
      </div>
    </section>
  );
}
