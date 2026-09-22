import CheckInbox from "@/components/auth/check-inbox";

// Straight into the auth shell's .side column, in its own vocabulary --
// see components/auth/check-inbox.tsx for why it is not a shadcn card.
export default function Page() {
  return <CheckInbox />;
}
