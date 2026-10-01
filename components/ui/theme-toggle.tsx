"use client";

import { useT } from "@/hooks/use-t";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// ── ONE BUTTON, THREE SHELLS ────────────────────────────────────────
//
// The owner, 27-09: "we moeten ook 1 easy knop rechtsboven hebben voor
// light dark mode", and then "donkere modus is prima toch maar, admin
// moet ook mooier, alles en iedereen."
//
// It borrows `tool ic-btn`, which is what the bell and the hamburger in
// every topbar already are, so it sits in the row without a single new
// style. The palette it switches to lives in lib/shell-dark-css.ts.
//
// WHY THE MOUNT GUARD
//
// next-themes cannot know the stored choice on the server, so the first
// client render has to match the server's HTML or React throws a
// hydration mismatch. Rendering a same-sized placeholder keeps the
// toolbar from jumping a pixel on every page load, which is the usual
// cost of the usual `return null`.

export default function ThemeToggle({
  className = "tool ic-btn",
}: {
  /** The shell's own button class. Defaults to the one all three use. */
  className?: string;
}) {
  const { t: tr } = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const dark = resolvedTheme === "dark";

  if (!ready) {
    // Same box, no icon: the row must not reflow when this wakes up.
    return (
      <span className={className} aria-hidden="true" style={{ opacity: 0 }} />
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme(dark ? "light" : "dark")}
      // The label says what pressing it DOES, not what is on screen —
      // "Dark mode" on a button that turns it off is the coin-flip every
      // one of these gets wrong.
      aria-label={dark ? tr("theme.switchToLightMode") : tr("theme.switchToDarkMode")}
      title={dark ? tr("label.theme.lightMode") : tr("label.theme.darkMode")}
      aria-pressed={dark}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
