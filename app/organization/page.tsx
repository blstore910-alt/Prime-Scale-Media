import { redirect } from "next/navigation";

/**
 * This rendered the literal string "Organization Page".
 *
 * It sits outside the (app) route group, so it is reachable by URL to
 * anyone signed in, and it is the parent of the /organization/<id> path
 * the expired-invite card used to link to. A bare div with the words
 * "Organization Page" on a production financial dashboard is the kind of
 * thing a customer screenshots.
 *
 * There is nothing for it to be: choosing which organisation you are
 * acting in is the profile switch (actions/profile-switch-actions.ts),
 * and everything else about an organisation lives behind /settings. So
 * it sends people where they were going.
 */
export default function Page() {
  redirect("/dashboard");
}
