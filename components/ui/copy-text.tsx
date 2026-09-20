"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────
// Text that copies itself when you click it
// ─────────────────────────────────────────────────────────────────────
// An ad-account name and a BM id are retyped into somebody else's
// dashboard, character for character, and getting one character wrong
// funds the wrong account. Selecting them by hand on a phone means a
// long-press and two drag handles that reliably catch the line above.
//
// No copy icon: an icon beside every id in a table of twenty rows is
// twenty pieces of furniture, and it puts the target somewhere other
// than the thing you are looking at. The value IS the button.
//
// navigator.clipboard is undefined on http:// and throws when the
// document is not focused, so there is a fallback and a failure path
// that says so instead of silently doing nothing -- a copy that
// quietly failed is worse than no copy, because you paste whatever was
// on the clipboard before.
// ─────────────────────────────────────────────────────────────────────

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea route.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyText({
  value,
  label,
  what,
  className,
  mono,
}: {
  /** What lands on the clipboard. */
  value?: string | null;
  /** What is printed, when that differs from what is copied. */
  label?: string | null;
  /** Named in the tooltip and for screen readers, e.g. "BM ID". */
  what?: string;
  className?: string;
  mono?: boolean;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const text = (value ?? "").trim();
  const shown = (label ?? value ?? "").trim();

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      // These live inside clickable rows; copying must not also open a
      // drawer behind the click.
      e.stopPropagation();
      e.preventDefault();
      if (!text) return;
      const ok = await writeClipboard(text);
      setState(ok ? "done" : "failed");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), ok ? 1100 : 2200);
    },
    [text],
  );

  // Nothing to copy is not a button. A dash that reacts to a click
  // promises something it cannot do.
  if (!shown) return <span className={className}>—</span>;
  if (!text) return <span className={className}>{shown}</span>;

  return (
    <button
      type="button"
      onClick={copy}
      className={`copytext${mono ? " mono" : ""}${
        state !== "idle" ? " " + state : ""
      }${className ? " " + className : ""}`}
      title={
        state === "failed"
          ? "Could not copy — select it by hand"
          : `Copy ${what ?? "this"}`
      }
      aria-label={`Copy ${what ?? shown}`}
    >
      <span className="ct-v">{shown}</span>
      <span className="ct-f" aria-live="polite">
        {state === "done" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </button>
  );
}
