import { redirectCustomersToTheirShell } from "@/lib/auth/customer-shell-redirect";

// A customer reaching this page gets no navigation at all — see the note
// on redirectCustomersToTheirShell. Admins keep it.
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectCustomersToTheirShell("notif");
  return <>{children}</>;
}
