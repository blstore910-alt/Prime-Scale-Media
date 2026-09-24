import { createClient } from "@/lib/supabase/server";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isCompanyComplete } from "@/lib/pure-company-complete";
import CompanyOnboardingForm from "@/components/company/company-onboarding-form";
import { UserProfile } from "@/lib/types/user";
import { LogoutButton } from "@/components/auth/logout-button";
import PsmAvatar from "@/components/ui/psm-avatar";

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // .single() here was a lockout. A user can legitimately hold more than one
  // user_profiles row — accept-invite dedupes on (user_id, tenant_id), so
  // being an affiliate in one tenant and an advertiser in another produces
  // two — and .single() turns "more than one row" into an ERROR with null
  // data, not into a choice. profile was then null, this redirected to "/",
  // and "/" sent an advertiser without a company straight back here. A loop
  // with no way out except clearing cookies.
  //
  // So: read them all and honour the active profile_id cookie, which is what
  // every other guard in the app does.
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select(
      // Explicit columns, NOT advertisers(*) — see
      // lib/types/advertiser-columns.ts.
      "*, advertiser:advertisers(id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at)",
    )
    .eq("user_id", user.id);

  const profileList = (profiles ?? []) as UserProfile[];
  if (!profileList.length) {
    redirect("/onboard");
  }

  // Prefer the profile the session is actually acting as; failing that, an
  // advertiser profile, since this page exists only for advertisers.
  const profile =
    (existingProfile
      ? profileList.find((p) => (p as { id: string }).id === existingProfile)
      : undefined) ??
    profileList.find((p) => p.role === "advertiser") ??
    profileList[0];

  if (profile.role !== "advertiser") {
    redirect("/dashboard");
  }

  // The embed comes back as an array or a single row depending on the
  // relationship shape; narrow it explicitly so the type is honest.
  const advertiser = Array.isArray(profile.advertiser)
    ? profile.advertiser[0]
    : profile.advertiser;

  if (!advertiser) {
    // ── NOT A BARE DIV ────────────────────────────────────────────────
    //
    // This returned an unstyled sentence, with no shell and no
    // navigation, and it returned BEFORE the header that carries the
    // Log out button — so somebody whose advertisers row never got
    // created (signup can fail after the invite is consumed) landed on
    // a white page with one line on it and no way off except Back.
    //
    // Three places in the advertiser app send people here.
    return (
      <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm">
          <h1 className="text-lg font-bold">We can&apos;t open your account</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your sign-up finished but the account behind it was not fully
            created, so there is nothing here to fill in. This is on our
            side and we can fix it quickly — send us a message and we will
            sort it out.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                "My account did not finish setting up",
              )}`}
            >
              Message support
            </a>
            <a
              className="rounded-lg bg-muted px-4 py-2 text-sm font-semibold"
              href="/dashboard"
            >
              Back to the dashboard
            </a>
          </div>
        </div>
      </main>
    );
  }

  // Fetch company with billings
  const { data: company } = await supabase
    .from("companies")
    .select("*, billings(*)")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  // ── THE SAME PREDICATE THE REST OF THE APP USES ─────────────────────
  //
  // This had its own fourth copy of "is the company complete", and it
  // demanded `registration_no` — a field THIS PAGE'S OWN FORM does not
  // ask for. The only advertiser-facing input for it is Settings, so
  // somebody sent here by the dashboard chip could fill in every field on
  // the screen, press Save, and be sent straight back with "Please
  // complete them to access the platform" for ever.
  //
  // lib/pure-company-complete.ts is the one the gate, the checklist and
  // the chip all use. A page that redirects on a stricter rule than the
  // one it is enforcing is a trap.
  if (company && isCompanyComplete(company as never)) {
    redirect("/");
  }

  const displayName =
    profile.full_name ||
    user.user_metadata?.display_name ||
    `${user.user_metadata?.first_name ?? ""} ${
      user.user_metadata?.last_name ?? ""
    }`.trim() ||
    user.email ||
    "Unknown user";
  const userEmail = user.email ?? profile.email ?? "No email";
  const roleLabel = profile.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "User";
  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── THE FIRST THING A NEW CUSTOMER SEES OF US ────────────────
          Three grey lines of plain text against a grey bar, with a solid
          button shouting LOGOUT beside them. It reads like a debug strip,
          and it is the screen somebody lands on thirty seconds after
          creating their account.
          Now: their own mark (the same one the admin sees on every
          queue), the name with real weight, the address under it, and the
          role and joining date as a quiet pill rather than a third line
          of prose. Log out steps back to a text button — it is the one
          thing on this screen they should NOT be pressing. */}
      <div className="w-full border-b bg-gradient-to-b from-muted/40 to-background">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5 sm:px-8">
          <PsmAvatar
            seed={profile.id}
            name={displayName}
            email={userEmail}
            role={String(profile.role) === "affiliate" ? "affiliate" : "advertiser"}
            size={40}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.95rem] font-semibold leading-tight">
              {displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {userEmail}
            </p>
          </div>
          {(roleLabel || joinedDate) && (
            <span className="hidden shrink-0 rounded-full border bg-background/70 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-block">
              {[roleLabel, joinedDate ? `since ${joinedDate}` : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <LogoutButton />
        </div>
      </div>

      <div className="flex-1 bg-background flex items-center justify-center">
        <CompanyOnboardingForm
          profile={profile as UserProfile}
          advertiserId={advertiser.id}
          // The row was already read above and thrown away, so the form
          // started blank -- and an empty Website box nulls the website
          // on save. Show what is there.
          company={company as Record<string, unknown> | null}
        />
      </div>
    </div>
  );
}
