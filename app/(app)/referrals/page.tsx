import { redirect } from "next/navigation";

/**
 * This route rendered the literal text "Page" — the untouched
 * create-next-app scaffold from the first commit, live under the app
 * layout for every role, for anybody who typed or bookmarked the URL.
 *
 * Nothing links to it. The screen somebody arriving here wants is
 * /my-referrals, so it goes there instead of being deleted: a bookmark or
 * a link in an old email should land somewhere useful, not on a 404.
 */
export default function Page() {
  redirect("/my-referrals");
}
