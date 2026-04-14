import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

type UseUsersParams = {
  role?: string;
  sort?: string;
  search?: string;
  active?: boolean | undefined;
  page?: number;
  perPage?: number;
};

export default function useUsers({
  sort = "newest",
  search = "",
  active,
  page = 1,
  perPage = 10,
}: UseUsersParams = {}) {
  const queryKey = ["users", { sort, search, active, page, perPage }];
  const { profile } = useAppContext();
  const {
    data: profiles,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      let query = supabase
        .from("user_profiles")
        .select(
          `
        *,
        advertiser:advertisers(*, wallet_topups:wallet_topups(amount, currency, status), subscriptions(status))
      `,
          { count: "exact" },
        )
        .neq("role", "admin")
        .neq("user_id", user?.user?.id)
        .eq("tenant_id", profile?.tenant_id);

      // Active filter
      if (active !== undefined) {
        query = query.eq("is_active", active);
      }
      // Search filter
      if (search && search.trim().length > 0) {
        const term = `*${search.trim()}*`;

        query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
      }

      // map sort key to column + direction
      const sortMap: Record<string, { column: string; ascending: boolean }> = {
        newest: { column: "created_at", ascending: false },
        oldest: { column: "created_at", ascending: true },
        "a-z": { column: "full_name", ascending: true },
        "z-a": { column: "full_name", ascending: false },
        "id-asc": { column: "id", ascending: true },
        "id-desc": { column: "id", ascending: false },
      };

      const sortOption = sortMap[sort] ?? sortMap["newest"];
      query = query.order(sortOption.column, {
        ascending: sortOption.ascending,
      });

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      const { data, count, error } = await query.range(start, end);
      if (error) throw error;

      return { data, count };
    },
  });

  return { profiles, total: profiles?.count ?? 0, isLoading, isError, error };
}
