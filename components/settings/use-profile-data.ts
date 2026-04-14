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

      // Fetch Advertiser associated with profile
      const { data: advertiser, error: advertiserError } = await supabase
        .from("advertisers")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();

      if (advertiserError) throw advertiserError;

      let company: Company | null = null;

      if (advertiser) {
        // Fetch Company associated with advertiser
        const { data: companyData, error: companyError } = await supabase
          .from("companies")
          .select("*")
          .eq("advertiser_id", advertiser.id)
          .maybeSingle(); // Use maybeSingle as company might not exist yet

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
      profileId,
      profileUpdates,
      companyUpdates,
      advertiserId,
    }: {
      profileId: string;
      profileUpdates: Partial<UserProfile>;
      companyUpdates: Partial<Company>;
      advertiserId?: string;
    }) => {
      const supabase = createClient();

      // Update Profile
      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase
          .from("user_profiles")
          .update(profileUpdates)
          .eq("id", profileId);

        if (profileError) throw profileError;
      }

      // Upsert Company
      if (advertiserId && Object.keys(companyUpdates).length > 0) {
        // Fetch profile to get tenant_id if we don't have it
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("tenant_id")
          .eq("id", profileId)
          .single();

        if (!profile) throw new Error("Profile not found");

        const fullPayload = {
          ...companyUpdates,
          advertiser_id: advertiserId,
          tenant_id: profile.tenant_id,
          user_profile_id: profileId,
        };

        // Check if company exists for this advertiser
        const { data: existingCompany } = await supabase
          .from("companies")
          .select("id")
          .eq("advertiser_id", advertiserId)
          .maybeSingle();

        if (existingCompany) {
          const { error: companyError } = await supabase
            .from("companies")
            .update(fullPayload)
            .eq("advertiser_id", advertiserId);
          if (companyError) throw companyError;
        } else {
          const { error: companyError } = await supabase
            .from("companies")
            .insert(fullPayload);
          if (companyError) throw companyError;
        }
      }
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
