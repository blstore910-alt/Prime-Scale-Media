"use client";

import { useEffect, useRef } from "react";

/**
 * The three things a hand-rolled modal almost always forgets.
 *
 * The shells build some dialogs directly (`.modal` > `.mback` + `.mcard`)
 * rather than through Radix, and those got a backdrop click and nothing
 * else: Escape did nothing, focus stayed behind the dialog on whatever
 * opened it, and Tab walked off into the page underneath — which for a
 * keyboard or screen-reader user means the dialog is not really a dialog.
 *
 * Returns a ref to put on the dialog card.
 */
export function useModalA11y<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);
  // What had focus before the dialog opened, so it can be given back.
  const restoreTo = useRef<HTMLElement | null>(null);
  // onClose is nearly always an inline arrow at the call site, so it is a new
  // function on every render. Depending on it directly re-ran this effect
  // every time the parent rendered — and its first act is to focus the first
  // control, so typing in the second field yanked the caret back to the
  // first. Held in a ref, the effect depends only on `open`.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    restoreTo.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const card = ref.current;
    // Focus the first thing worth focusing, or the card itself. Without this
    // the next Tab starts from the page behind the dialog.
    const focusables = () =>
      Array.from(
        card?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const first = focusables()[0];
    (first ?? card)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Keep Tab inside. Cycling at the ends is what makes it a trap rather
      // than a suggestion.
      const list = focusables();
      if (list.length === 0) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !card?.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Give focus back to whatever opened the dialog, so the page does not
      // silently jump to the top when it closes.
      restoreTo.current?.focus?.();
    };
  }, [open]);

  return ref;
}
