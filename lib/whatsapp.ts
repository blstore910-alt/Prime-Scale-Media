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
export function openWhatsapp(text?: string): boolean {
  if (typeof window === "undefined") return false;
  // ── DID IT ACTUALLY OPEN? ─────────────────────────────────────────
  //
  // window.open returns null when a popup blocker refuses it, which it
  // does for every call made outside a user gesture -- after an await,
  // for instance. This returned void, so callers could only assume, and
  // one of them toasted "Opening WhatsApp to send the payout request"
  // over a tab that never opened and a request that was never recorded.
  const w = window.open(whatsappUrl(text), "_blank", "noopener,noreferrer");
  return !!w;
}

// ── NIET MEER NAAR ZIJN PRIVÉNUMMER ─────────────────────────────────
//
// De eigenaar, 30-09: "zet hier bij iedereen 'message on whatsapp in
// your PSMxxx group' en haal deze button naar mij weg. Zoveel buttons
// naar mij privé weghalen, anders krijg ik straks 100 berichten per
// dag."
//
// Elke "Message us"-knop in deze app wees naar `WHATSAPP_NUMBER`, en
// dat is zijn eigen telefoon. Met elf klanten is dat elf gesprekken
// naast elkaar zonder dat iemand anders kan meelezen of overnemen --
// en met vijftig is het onwerkbaar. Elke klant heeft al een eigen
// PSM####-groep, en daar hoort het heen.
//
// WAAROM ER (NOG) GEEN LINK IS. Een WhatsApp-groep is alleen met een
// uitnodigingslink te openen, en die staat nergens: `advertisers` heeft
// geen kolom ervoor. Die kolom komt met de plak die bij deze wijziging
// hoort; tot die tijd zegt het scherm WELKE groep het is in plaats van
// een knop aan te bieden die het verkeerde doet.
//
// Dat is met opzet een zin en geen dode knop: een knop die naar de
// verkeerde plek gaat is erger dan een aanwijzing die klopt.

/** De groep waar deze klant in zit, zoals hij hem in WhatsApp ziet. */
export function groupName(clientCode?: string | null): string | null {
  const c = String(clientCode ?? "").trim();
  return c ? c : null;
}

/**
 * Wat er op een "praat met ons"-kaart hoort te staan.
 *
 * Zonder klantcode -- een affiliate, of een profiel dat nog laadt --
 * geen verzonnen groepsnaam maar de algemene zin. Een klant die naar
 * "je PSM-groep" wordt gestuurd terwijl hij er geen heeft, staat
 * stil.
 */
export function talkToUsLine(clientCode?: string | null): string {
  const g = groupName(clientCode);
  return g
    ? `Message us in your ${g} group on WhatsApp — that is where your account is handled.`
    : "Message us in your WhatsApp group — that is where your account is handled.";
}
