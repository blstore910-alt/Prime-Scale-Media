"use client";

import { useT } from "@/hooks/use-t";
import { copyText } from "@/lib/copy-text";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────
// Beneficiary bank routing for advertiser WALLET top-ups.
//
// Wallets are held in EUR/USD only. The recorded top-up (and the wallet
// credit) is always EUR/USD — but the advertiser may physically TRANSFER
// in a different currency to the matching bank account (e.g. pay TURLIT in
// GBP/HKD). The admin credits the EUR/USD wallet from the slip.
//
// Routing is by BANK GROUP (which ad-account family the advertiser funds):
//   • TURLIT LLC (Wise)          — Meta-EU-PSM, Google, TikTok, Taboola,
//                                  Snapchat.  Accepts EUR / USD / GBP / HKD.
//   • ZANEL ENTERPRISE (Slash /  — Meta-EU-PSM-GH.  USD only.
//     Column N.A.)
//   • MUXUE TRADE LIMITED (J.P.  — Meta-HK-Premium, Meta-HK-Business.
//     Morgan)                      Accepts EUR / USD. Airwallex = instant.
//
// All numbers here are verified against the account holders' own bank
// documents. NEVER edit an IBAN / account / routing / SWIFT without a
// re-verified source — advertisers send real money to these.
// ─────────────────────────────────────────────────────────────────────

// Types and data moved to lib/bank-beneficiaries.ts so they can be imported
// by plain-TypeScript code and covered by node --test; a unit test cannot
// import a file containing JSX. Re-exported here so every existing import of
// this module keeps working.
import {
  bankInstructions,
  type BankGroup,
  type TransferCurrency,
} from "@/lib/bank-beneficiaries";

export type {
  WalletCurrency,
  TransferCurrency,
  BankGroup,
  CurrencyCode,
} from "@/lib/bank-beneficiaries";
export { bankInstructions } from "@/lib/bank-beneficiaries";

import type { BankOverride } from "@/lib/pure-bank-override";
import { splitAddress } from "@/lib/pure-address-split";


// Canonical display order for currency chips.
const CURRENCY_ORDER: TransferCurrency[] = ["EUR", "USD", "GBP", "HKD"];

// The transfer currencies a bank group can receive, in canonical order.
export function bankTransferCurrencies(group: BankGroup): TransferCurrency[] {
  const available = bankInstructions[group === "zanel" ? "zanel" : "turlit"].accounts;
  return CURRENCY_ORDER.filter((c) => available[c]);
}

export function bankBeneficiary(group: BankGroup): string {
  return bankInstructions[group === "zanel" ? "zanel" : "turlit"].beneficiary;
}

interface BankTransferInstructionsProps {
  group: BankGroup;
  // The currency the advertiser is transferring in.
  transferCurrency: TransferCurrency;
  /**
   * Bank details the owner entered under Settings -> Banks, for this
   * group and currency. When present they REPLACE the built-in sheet.
   *
   * Replace rather than merge, deliberately. Merging would mean
   * guessing which stored column belongs behind which built-in label
   * ("IBAN", "Account number", "Account no"), and a near-miss there
   * puts a real transfer into the wrong field. When the owner has typed
   * bank details, those details are the answer.
   *
   * Absent (the normal case, and every case where the read failed or
   * two stored rows disagreed) leaves the built-in sheet exactly as it
   * was. The customer is never shown nothing, and never shown a guess.
   */
  override?: BankOverride | null;
}

export function BankTransferInstructions({
  group,
  transferCurrency,
  override = null,
}: BankTransferInstructionsProps) {
  const { t: tr } = useT();
  const detail = bankInstructions[group === "zanel" ? "zanel" : "turlit"].accounts[transferCurrency];

  if (!detail) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-600 p-3 text-sm text-yellow-700">
        {tr("bank.doesNotAcceptPleaseChoose", { beneficiary: String(bankInstructions[group === "zanel" ? "zanel" : "turlit"].beneficiary), transferCurrency: String(transferCurrency) })}</div>
    );
  }

  // ── ONE CARD FOR WHO, TILES FOR THE REST ──────────────────────────
  // De eigenaar, 01-10: "kijk hoeveel witruimte verticaal ... zo kaal en
  // lelijk". The sheet was one row per value, full width, each with an
  // uppercase heading above it -- eight rows and three headings before
  // the reference, on a 375px screen two full scrolls.
  //
  // Now: the two things typed into every banking app (who, and the
  // account number / IBAN) sit on one dark card at the top, large; the
  // rest are half-width tiles, two to a row. Long values (an address)
  // take the full row. Every value that can be copied still has its own
  // always-visible copy button -- that has not changed.
  type Item = { label: string; value: string; copyable?: boolean; group?: string };
  const all: Item[] = override
    ? (
        [
          ["Beneficiary Name", override.beneficiary, true],
          ["Account number / IBAN", override.account_no, true],
          ["SWIFT / BIC", override.swift_bic, true],
          ["Bank name", override.bank_name, false],
          ["Routing number", override.routing_no, true],
          ["Bank address", override.bank_address, false],
          ["Note", override.notes, false],
        ] as const
      )
        // Only what was filled in: an empty row reads as "leave blank".
        .filter(([, value]) => !!value)
        .map(([label, value, copyable]) => ({ label, value: String(value), copyable }))
    : detail.sections.flatMap((s, i) =>
        s.items.map((it) => ({ ...it, group: i === 0 ? undefined : s.title })),
      );
  // An address becomes its parts, each with its own copy button -- the
  // way a banking app asks for it (de eigenaar, 01-10).
  const expanded: Item[] = all.flatMap((it) => {
    if (!/address/i.test(it.label)) return [it];
    const parts = splitAddress(it.value);
    if (!parts) return [it];
    return parts.map((p) => ({ label: p.label, value: p.value, copyable: true, group: it.label }));
  });

  const isHero = (it: Item) =>
    !it.group && it.copyable && /holder|beneficiary name|account number|iban/i.test(it.label);
  const hero = expanded.filter(isHero).slice(0, 3);
  const rest = expanded.filter((it) => !hero.includes(it));

  // Keep the section headings that carry meaning ("US transfers" vs
  // "International") as one small line above their tiles; drop the rest.
  const groups: { title?: string; items: Item[] }[] = [];
  for (const it of rest) {
    const last = groups[groups.length - 1];
    if (last && last.title === it.group) last.items.push(it);
    else groups.push({ title: it.group, items: [it] });
  }
  const meaningful = (t?: string) => !!t && /transfer|international|us |address/i.test(t);

  return (
    <div className="flex flex-col gap-3">
      <div className="tpx-bank">
        <div className="tpx-bank-top">
          <em>{override?.label || tr("label.bank.bankDetails")}</em>
          <span>{transferCurrency}</span>
        </div>
        <p className="tpx-bank-desc">{detail.description}</p>
        {hero.map((it) => (
          <CopyRow key={it.label} item={it} variant="hero" />
        ))}
        {/* ── EVERYTHING ON ONE CARD ─────────────────────────────────
            De eigenaar, 01-10: "dit kan toch allemaal in de mooie card".
            The rest sits in the same card, two to a row, smaller. A group
            with nothing to copy (SEPA preferred / SWIFT otherwise) is
            dropped: the line at the top of the card already says it. */}
        {groups
          .filter((g) => g.items.some((it) => it.copyable))
          .map((g, gi) => (
            <div key={gi} className="tpx-bank-grid">
              {meaningful(g.title) ? <em className="tpx-bank-sub">{g.title}</em> : null}
              {g.items.map((it) => (
                <CopyRow key={it.label} item={it} variant="mini" />
              ))}
            </div>
          ))}
        {/* The one sentence that stops a deposit being rejected -- on the
            card it is about, not loose between two cards. */}
        <p className="tpx-bank-foot">{tr("bank.useTheExactAccountHolder")}</p>
      </div>
    </div>
  );
}

/** Values that have to be read character by character. */
const MONO_LABELS = /iban|bic|swift|account number|routing|sort code|reference|branch code/i;

function CopyRow({
  item,
  variant,
}: {
  item: { label: string; value: string; copyable?: boolean };
  variant: "hero" | "mini";
}) {
  const { t: tr } = useT();
  const [copied, setCopied] = useState(false);
  const { label, value, copyable } = item;

  // ── DO NOT SAY "COPIED" WITHOUT CHECKING ───────────────────────────
  // writeText rejects routinely (mobile Safari outside a gesture, a PWA,
  // a denied permission). Being told an IBAN copied when it did not
  // means pasting whatever was on the clipboard before into a payment.
  const handleCopy = async () => {
    const cleanValue = value.split("\n(")[0];
    try {
      if (!(await copyText(cleanValue))) throw new Error("copy refused");
      setCopied(true);
      toast.success(label + " copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(
        "Couldn't copy - select the " +
          label.toLowerCase() +
          " and copy it by hand.",
      );
    }
  };

  const wide =
    variant === "mini" &&
    (value.length > 22 || value.includes("\n") || (MONO_LABELS.test(label) && value.length > 9));
  const body = (
    <div>
      <span className="tpx-lbl">{label}</span>
      <span className={cn("tpx-val", MONO_LABELS.test(label) && !/\s[a-z]/i.test(value) && "tpx-mono")}>{value}</span>
    </div>
  );
  const button = copyable ? (
    <button
      type="button"
      className="tpx-copy"
      data-done={copied}
      onClick={handleCopy}
      aria-label={tr("bank.copy", { label: String(label) })}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  ) : null;

  return (
    <div className={variant === "mini" ? "tpx-bank-row tpx-mini" : "tpx-bank-row"} data-wide={wide}>
      {body}
      {button}
    </div>
  );
}

// (MUXUE / Airwallex weg: er gaat niets meer heen, en de naam laadde bij elke klant.)
