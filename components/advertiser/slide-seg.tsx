"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

// ── ONE ROW OF CHOICES, AND A THUMB THAT GLIDES TO THE CHOSEN ONE ───────
//
// The owner, 22-09, about the period picker: "moet op 1 rij, iets super
// moois" -- after a bar that cut its last option off and a grid of two
// rows. So: one row, every choice in view, and the chosen one lit by a
// thumb that slides over to it. The thumb is measured from the buttons
// themselves, so it lands on the right one at any width and in any font.

export type SlideOpt = {
  key: string;
  label: ReactNode;
  onClick: () => void;
  /** Only from 640px up, where the row has room for it. */
  wide?: boolean;
  className?: string;
  ariaLabel?: string;
  /** For an option that opens something rather than picks a value. */
  ariaExpanded?: boolean;
};

export default function SlideSeg({
  options,
  active,
  fallback,
  ariaLabel,
  tone = "brand",
  className = "",
}: {
  options: SlideOpt[];
  /** The option the thumb sits on. */
  active: string;
  /** Where the thumb sits when `active` is not in the row at this width. */
  fallback?: string;
  ariaLabel: string;
  /** brand: a gradient thumb and white text. soft: a white thumb on grey. */
  tone?: "brand" | "soft";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const bar = ref.current;
    if (!bar) return;
    const find = (k: string) => {
      const el = bar.querySelector<HTMLElement>(`[data-k="${k}"]`);
      return el && el.offsetWidth > 0 ? el : null;
    };
    const el = find(active) ?? (fallback ? find(fallback) : null);
    // The lit button is marked on the element itself: React does not own
    // this attribute, so a re-render never wipes it between two placings.
    bar.querySelectorAll<HTMLElement>("[data-k]").forEach((b) => {
      if (b === el) b.setAttribute("data-lit", "");
      else b.removeAttribute("data-lit");
    });
    if (!el) {
      bar.style.setProperty("--tw", "0px");
      return;
    }
    bar.style.setProperty("--tx", `${el.offsetLeft}px`);
    bar.style.setProperty("--tw", `${el.offsetWidth}px`);
    // No glide on the first paint -- the thumb appears where it belongs.
    if (!bar.dataset.ready) requestAnimationFrame(() => (bar.dataset.ready = "1"));
  }, [active, fallback]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    // A wider screen shows the wide-only options, a web font changes a
    // label's width: either moves the buttons, and the thumb follows.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => place()) : null;
    ro?.observe(bar);
    bar.querySelectorAll<HTMLElement>("[data-k]").forEach((b) => ro?.observe(b));
    document.fonts?.ready.then(() => place()).catch(() => {});
    return () => ro?.disconnect();
  }, [place]);

  return (
    <div className={`sseg ${tone} ${className}`.trim()} role="radiogroup" aria-label={ariaLabel} ref={ref}>
      <span className="sseg-thumb" aria-hidden="true">
        {/* A new key per choice restarts the sheen: one sweep per pick. */}
        <span className="sseg-shine" key={active} />
      </span>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          data-k={o.key}
          role={o.ariaExpanded === undefined ? "radio" : undefined}
          aria-checked={o.ariaExpanded === undefined ? active === o.key : undefined}
          aria-expanded={o.ariaExpanded}
          aria-label={o.ariaLabel}
          className={`sseg-opt${o.wide ? " wide" : ""}${o.className ? ` ${o.className}` : ""}`}
          onClick={o.onClick}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
