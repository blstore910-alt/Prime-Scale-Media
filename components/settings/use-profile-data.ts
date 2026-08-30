import { createClient } from "@/lib/supabase/client";
import { Company } from "@/lib/types/company";
import { UserProfile } from "@/lib/types/user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useProfileData() {
  const query = useQuery({
    queryKey: ["profile-data"],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Not authenticated");

      // Fetch Profile
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (profileError) throw profileError;

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
