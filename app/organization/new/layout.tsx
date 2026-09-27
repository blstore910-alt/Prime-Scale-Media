import { Toaster } from "@/components/ui/sonner";

// Same hole as /complete-profile, same reason: this route is outside
// every shell that mounts a <Toaster>, and components/onboard/
// organization-form.tsx reports both its failure and its success through
// one ("Organization created — redirecting", and the server's refusal at
// eight seconds). Without this the form was silent either way.

export default function NewOrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster position="top-right" />
    </>
  );
}
