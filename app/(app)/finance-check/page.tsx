import FinanceCheckScreen from "@/components/finance-check/finance-check-screen";
import { requireFinanceReviewer } from "@/lib/auth/require-finance-reviewer";

export default async function Page() {
  // The owner, plus the one admin the owner designated. Not every
  // admin: this page puts every customer's money side by side, and it
  // is deliberately a wider view than running a single queue needs.
  //
  // Nothing on the page approves anything — see the note on the
  // component. Whoever checks does not decide.
  await requireFinanceReviewer("/dashboard");

  return <FinanceCheckScreen />;
}
