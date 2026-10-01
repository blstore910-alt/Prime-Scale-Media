/**
 * Put a string on the clipboard, by whichever route still works here.
 *
 * WHY THIS IS NOT ONE LINE. `navigator.clipboard.writeText` is the right
 * API and it is unavailable or refused in more places than it is worth
 * arguing with: any non-secure origin, an iframe without
 * `clipboard-write` in its permissions policy, several in-app browsers
 * (the ones people open a link from inside a messaging app), and older
 * Safari. It REJECTS rather than throwing synchronously, so a naive
 * `try { await ... } catch { toast.error() }` reports failure and stops.
 *
 * What that cost: the customer is on step 2 of a wallet top-up, looking
 * at an IBAN and a payment reference, and the one control that exists to
 * stop them retyping a reference by hand says "Couldn't copy — select
 * the reference and copy it by hand". A mistyped reference is a transfer
 * that matches nothing and sits on the desk until somebody works it out.
 *
 * The legacy route — a hidden textarea, select, `document.execCommand`
 * — is deprecated and still works in every one of those contexts,
 * because it is a synchronous side effect of the user's own gesture
 * rather than a permissioned API. So: try the modern one, fall back,
 * and only report failure when both have refused.
 */
export async function copyText(text: string): Promise<boolean> {
  const value = String(text ?? "");
  if (!value) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through. Not an error yet — the route below still works in
      // exactly the places this one does not.
    }
  }

  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    // Off-screen rather than hidden: display:none and visibility:hidden
    // both make the selection unavailable, and on iOS a readOnly field
    // is what stops the keyboard appearing for the split second it is
    // focused.
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    // INSIDE the open dialog, not on <body>. A modal traps focus: a
    // textarea outside it cannot be focused or selected, execCommand then
    // copies nothing and still answers true -- the owner, 01-10: "copy
    // copied de reference niet", on the top-up ticket.
    const active = document.activeElement as HTMLElement | null;
    const host =
      (active?.closest?.("[role=dialog]") as HTMLElement | null) ?? document.body;
    host.appendChild(ta);
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    host.removeChild(ta);
    // Give focus back to the button that was pressed.
    active?.focus?.({ preventScroll: true });
    return ok;
  } catch {
    return false;
  }
}
