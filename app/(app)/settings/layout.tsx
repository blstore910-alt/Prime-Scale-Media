import SettingsNavbar from "@/components/settings/navbar";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

import React from "react";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin("/dashboard");

  return (
    <main>
      <SettingsNavbar />
      {children}
    </main>
  );
}
