import PollsScreen from "@/components/polls/polls-screen";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  // Owner only, like /affiliates. A poll goes out to every customer in
  // the book under the company's name — the same class of thing as a
  // price, so the same guard. See actions/poll-actions.ts.
  await requireSuperAdmin("/dashboard");

  return <PollsScreen />;
}
