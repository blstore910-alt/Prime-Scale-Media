import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";

// Fonts from the approved mockups: Plus Jakarta Sans for headings
// (--font-jakarta), DM Sans for body (--font-dmsans). Shared so the
// auth screens and the ported authenticated app use the same faces.
export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dmsans",
  display: "swap",
});
