import { Toaster } from "@/components/ui/sonner";

// ── SOMEWHERE FOR THE ANSWER TO LAND ────────────────────────────────
//
// /complete-profile sits outside app/(app)/ and outside app/auth/, and it
// had no layout at all. There are four <Toaster> mounts in this repo --
// the admin, advertiser and affiliate shells, and the auth shell -- and
// none of them covers this route. app/layout.tsx has none either.
//
// So every toast on this page rendered nowhere. company-onboarding-form
// reports EVERYTHING through toasts: "Company information saved!",
// "Failed to save company information", "Profile or Advertiser ID
// missing", "Draft restored". A customer fills in twelve fields on the
// one mandatory form of the whole signup, presses Save & Continue, and
// on a refusal -- an RLS denial, MAINTENANCE_MODE, a missing advertiser
// row -- the spinner stops, nothing navigates, and not one word appears.
//
// This is the same fault the auth shell was written up for in its own
// comment ("geen melding van error, niks"), one screen later in the same
// journey. Found by the blok 4 dead-ends sweep; the missing layout was
// confirmed by listing the directory.
//
// Nothing else belongs here. The page draws its own frame.

export default function CompleteProfileLayout({
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
