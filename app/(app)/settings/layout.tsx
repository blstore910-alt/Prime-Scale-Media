import SettingsNavbar from "@/components/settings/navbar";

import React from "react";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main>
      <SettingsNavbar />
      {children}
    </main>
  );
}
