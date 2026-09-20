import { createClient } from "@/lib/supabase/client";
import { Company } from "@/lib/types/company";
import { UserProfile } from "@/lib/types/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppContext } from "@/context/app-provider";

export function useProfileData() {
  // ── THE PROFILE THE REST OF THE APP IS USING ──────────────────────
  //
  // This resolved the OLDEST user_profiles row and claimed that
  // "matches the app-layout's tie-breaker". It does not: every server
  // guard and every action resolves the active profile through the
  // `profile_id` cookie that switchToProfile sets, and the app context
  // carries that same profile.
  //
  // So for somebody who holds profiles in two tenants, this screen read
  // tenant A's company -- name, VAT number, registration number, billing
  // address -- seeded the form with it, and on save sent ALL of those
  // fields to an action that resolves tenant B. One corrected phone
  // number overwrote tenant B's invoice header with tenant A's details.
  //
  // The context profile is the one thing that cannot disagree with the
  // server, because it is read from the same cookie.
  const { profile: activeProfile } = useAppContext();
  const query = useQuery({
    queryKey: ["profile-data", activeProfile?.id ?? null],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      // Fetch Profile. A user can legitimately have more than one
      // user_profiles row (multi-tenant access) — .single() throws
      // 406 in that case. Take the oldest row (first created_at)
      // which matches the app-layout's tie-breaker, so both surfaces
      // resolve to the same profile.
      // By id when the context knows which profile is active; by
      // user_id only as a fallback for a first render before the
      // context has resolved, and then still deterministic.
      const base = supabase.from("user_profiles").select("*");
      const { data: profile, error: profileError } = activeProfile?.id
        ? await base.eq("id", activeProfile.id).maybeSingle()
        : await base
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) throw new Error("Profile not found");

      // Fetch Advertiser associated with profile (only exists for
      // advertisers; admins/super-admins have no advertiser row).
      const { data: advertiser, error: advertiserError } = await supabase
        .from("advertisers")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();

      if (advertiserError) throw advertiserError;

      let company: Company | null = null;

      if (advertiser) {
        // Advertiser: their own company (advertiser-scoped row).
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("advertiser_id", advertiser.id)
          .maybeSingle();
        if (companyError) throw companyError;
        company = companyData;
      } else if (profile.role === "admin" && profile.tenant_id) {
        // Admin: the tenant-level company row (advertiser_id NULL).
        // Shown on issued invoices and referral commission emails.
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("tenant_id", profile.tenant_id)
          .is("advertiser_id", null)
          .maybeSingle();
        if (companyError) throw companyError;
        company = companyData;
      }

      return { profile: profile as UserProfile, advertiser, company };
    },
  });

  return query;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      profileUpdates,
      companyUpdates,
    }: {
      profileId: string;
      profileUpdates: Partial<UserProfile>;
      companyUpdates: Partial<Company>;
      advertiserId?: string;
    }) => {
      const { updateOwnProfileAndCompany } = await import(
        "@/actions/company-actions"
      );
      const result = await updateOwnProfileAndCompany({
        profile: profileUpdates,
        company: companyUpdates,
      });
      if (!result.ok) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["profile-data"] });
    },
    onError: (error) => {
      toast.error("Failed to update profile: " + error.message);
    },
  });
}
