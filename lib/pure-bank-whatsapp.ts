// ── DE BANKGEGEVENS ALS WHATSAPP-BERICHT ────────────────────────────
//
// De eigenaar, 01-10: "alle bank details moeten voor alle admins met 1
// knop easy vindbaar zijn in de app, klikbaar, met een mooie prefilled
// WhatsApp-tekst, plug and play."
//
// Puur: neemt een rekening uit lib/bank-beneficiaries.ts en maakt de
// tekst. De uitlegregels tussen haakjes ("(Use this when sending from
// outside the US.)") horen in de app, niet in een bericht aan een klant.
//
// GEEN ad-account types of leveranciers in de tekst: die ziet een klant
// nooit (zie memory seamx-hidden-from-customers). Alleen de begunstigde
// en de bank -- dat staat al in hun eigen top-up-scherm.
//
// De betaalreferentie hoort bij een top-up-aanvraag in de app, niet bij
// de rekening: zonder die referentie kan niemand de betaling koppelen.
// Daarom zegt het bericht eerst: druk op Top up, gebruik die referentie.

export type BankLine = { label: string; value: string };
export type BankSectionLike = { title: string; items: { label: string; value: string }[] };

/** De waarde zonder de uitlegregels tussen haakjes. */
export function cleanBankValue(value: string): string {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !(l.startsWith("(") && l.endsWith(")")))
    .join(", ");
}

/** Alle regels van een rekening, opgeschoond, zonder dubbele labels. */
export function bankLines(sections: BankSectionLike[]): BankLine[] {
  const gezien = new Set<string>();
  const uit: BankLine[] = [];
  for (const s of sections) {
    for (const it of s.items) {
      const v = cleanBankValue(it.value);
      // "Transfer type"-regels zijn uitleg, geen gegeven.
      if (!v || (/^(SEPA|SWIFT)$/.test(it.label) && /preferred|use if/i.test(v))) continue;
      const sleutel = `${it.label}|${v}`;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      uit.push({ label: it.label, value: v });
    }
  }
  return uit;
}

export function bankWhatsAppText(input: {
  beneficiary: string;
  currency: string;
  sections: BankSectionLike[];
  clientCode?: string | null;
  name?: string | null;
}): string {
  const hallo = input.name?.trim() ? `Hi ${input.name.trim()}!` : "Hi!";
  const code = input.clientCode?.trim();
  const regels = bankLines(input.sections).map((l) => `${l.label}: *${l.value}*`);
  return [
    `${hallo} Here are our bank details for a ${input.currency} top-up 👇`,
    "",
    `🏦 *${input.beneficiary} — ${input.currency}*`,
    ...regels,
    "",
    "📌 *Important — the reference*",
    "1. In the app, press *Top up* and enter the amount.",
    `2. Copy the reference it shows you${code ? ` (it starts with ${code.replace(/\D+/g, "")}-)` : ""}.`,
    "3. Put exactly that reference in the description of your transfer.",
    "4. Upload the payment slip in the app.",
    "",
    "Without the reference we cannot match your payment. Any questions, just reply here 🙌",
  ].join("\n");
}

export function whatsAppLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
