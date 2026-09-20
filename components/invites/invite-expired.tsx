import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { switchToProfile } from "@/actions/profile-switch-actions";

export default async function InviteExpired({
  reason,
}: {
  /** What actually went wrong, when it is not expiry. */
  reason?: string;
} = {}) {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("*, tenants(name, id)");
  // Only the ones we can actually offer. `tenants` is a left join, so a
  // profile whose tenant row is gone came back with null — and the card
  // read `profile.tenants.name[0]`, which throws and takes the whole
  // page down rather than skipping one row.
  const organisations = (profiles ?? []).filter((p) => p.tenants);
  const hasOrganizations = organisations.length > 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center space-y-6">
      {/* ── ONE CARD, FOUR DIFFERENT CAUSES ───────────────────────────
          This said "expired" for an expired invite, an already-accepted
          one, an unreadable token and a read that failed -- and for an
          accepted one the correct advice is "log in", which it never
          said. An anonymous invitee's only control here was "Create New
          Organization", which is the wrong action and, since
          /organization/new is not a public route, 307s them to a login
          they have no account for.
          So: say what is actually known, and always offer the two doors
          that work for somebody who already has an account. */}
      <div>
        <h2 className="text-2xl font-semibold">
          {reason ? "We couldn't open this invitation" : "This invitation can't be used"}
        </h2>
        <p className="text-muted-foreground max-w-md">
          {reason ??
            "It may have expired, or it may already have been accepted. If you have signed up before, log in — your account is already there."}
        </p>
      </div>

      {!hasOrganizations ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/auth/login">Log in</Link>
          </Button>
          <Button variant="secondary" asChild>
            <a href="mailto:contact@primescalemedia.com?subject=Invitation%20link">
              Ask us for a new link
            </a>
          </Button>
        </div>
      ) : null}

      {hasOrganizations ? (
        <>
          <div className="grid w-full max-w-md gap-4 text-left">
            {/* THESE CARDS WERE ALL 404s. They linked to
                /organization/<id>, and there is no [id] segment under
                app/organization — so somebody whose invite had expired,
                who already holds a profile, tapped their own organization
                and landed on the bare Next.js 404 with no shell and no
                way back. The only other control on this screen is "Create
                New Organization", which is the wrong action for an
                invitee.

                It is a profile SWITCH, which is what the link was always
                reaching for: the active profile is the `profile_id`
                cookie, and nothing in the app could change it after
                sign-up. The action re-checks the id against the session,
                so it can only ever select a profile they hold. */}
            {organisations.map((profile) => (
                <form
                  key={profile.id}
                  action={switchToProfile}
                  className="block"
                >
                  <input type="hidden" name="profile_id" value={profile.id} />
                  <button type="submit" className="block w-full text-left">
                    <Card className="transition hover:shadow-md">
                      <CardHeader className="flex flex-row items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {profile.tenants.name?.[0]?.toUpperCase() || "O"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {profile.tenants.name ?? "Your organisation"}
                        </span>
                      </CardHeader>
                    </Card>
                  </button>
                </form>
              ))}
          </div>

          <Button asChild variant="outline">
            <Link href="/organization/new">Create New Organization</Link>
          </Button>
        </>
      ) : (
        <Button asChild>
          <Link href="/organization/new">Create New Organization</Link>
        </Button>
      )}
    </div>
  );
}
