import type { Viewport } from "next";
import AuthShell from "@/components/auth/auth-shell";

// The invitation screens are the first thing a new customer sees: the same
// dark shell as sign-in and sign-up, not a white card on a blank page.
export const viewport: Viewport = {
  themeColor: "#080b1c",
};

export default function InviteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AuthShell>{children}</AuthShell>;
}
