// ── EVERY "MESSAGE US" BUTTON IS WHATSAPP ────────────────────────────
//
// The owner, 2026-09-21: "de buttons met message moeten allemaal whatsapp
// buttons zijn en dan +31615300300". They were mailto: links, which on a
// phone with no mail app registered -- most phones, for anyone on webmail
// -- do nothing at all when pressed.
//
// wa.me takes the number in international form without the plus or any
// spaces, and a prefilled message in `text`. It opens the WhatsApp app on
// a phone and WhatsApp Web on a desktop.

/** +31 6 15300300, in the form wa.me wants. */
export const WHATSAPP_NUMBER = "31615300300";

/** The number as a person reads it. */
export const WHATSAPP_DISPLAY = "+31 6 15300300";

export function whatsappUrl(text?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  const t = (text ?? "").trim();
  return t ? `${base}?text=${encodeURIComponent(t)}` : base;
}

/**
 * Open a WhatsApp chat in a new tab. A new tab, not this one: the customer
 * is in the middle of their dashboard and should not lose it.
 */
export function openWhatsapp(text?: string): void {
  if (typeof window === "undefined") return;
  window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");
}
