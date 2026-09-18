import { redirect } from "next/navigation";

/**
 * This was a placeholder form with a dead Save button.
 *
 * `onSubmit` was `// TODO: wire submit` with an empty body and no toast,
 * so pressing "Save Changes" produced no write, no error and no feedback
 * — on a page headed "Billing Settings", asking for an address that goes
 * on invoices. It also prefilled mock American data ("1234 Main St
 * (Company)", "California", "90210") when the "same as company" box was
 * ticked.
 *
 * Nothing in the app links to it: every href, url:, router.push and
 * redirect was checked and none points here. It was reachable by URL and
 * by anything anyone had bookmarked, which is exactly the population that
 * would trust it.
 *
 * The real billing screen is the advertiser app's billing view, and the
 * billing ADDRESS is collected by /complete-profile, which is the only
 * form that writes both `companies` and `billings`. So this sends people
 * to the real one instead of letting them type into a form that throws
 * their work away.
 */
export default function Page() {
  redirect("/dashboard?view=billing");
}
