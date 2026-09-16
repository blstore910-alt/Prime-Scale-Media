import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { safeIlikeTerm } from "@/lib/utils/search";
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
        advertiser:advertisers(*, wallet_topups:wallet_topups(amount, currency, status), subscriptions(status, amount, currency))
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
      // Search filter (sanitised for PostgREST .or() filter DSL)
      if (search && search.trim().length > 0) {
        const term = safeIlikeTerm(search);
        if (term.length > 0) {
          query = query.or(
            `full_name.ilike."*${term}*",email.ilike."*${term}*"`,
          );
        }
      }

      // map sort key to column + direction
      //
      // "code-asc"/"code-desc" order by the advertiser's CLIENT CODE, on the
      // embedded advertisers row. They used to order by user_profiles.id — a
      // UUID — which produces an order with no meaning to anybody: TA, PA,
      // JR, HA, AA, JD. The options were labelled as sorting by client code,
      // so the control was promising one thing and doing another, which is
      // worse than not offering it.
      const sortMap: Record<
        string,
        { column: string; ascending: boolean; foreignTable?: string }
      > = {
        newest: { column: "created_at", ascending: false },
        oldest: { column: "created_at", ascending: true },
        "a-z": { column: "full_name", ascending: true },
        "z-a": { column: "full_name", ascending: false },
        "code-asc": {
          column: "tenant_client_code",
          ascending: true,
          foreignTable: "advertisers",
        },
        "code-desc": {
          column: "tenant_client_code",
          ascending: false,
          foreignTable: "advertisers",
        },
      };

      const sortOption = sortMap[sort] ?? sortMap["newest"];
      query = query.order(sortOption.column, {
        ascending: sortOption.ascending,
        ...(sortOption.foreignTable
          ? { foreignTable: sortOption.foreignTable }
          : {}),
        // Advertisers without a code yet ("—" on screen) go last in both
        // directions: an empty value is not the smallest value, it is a
        // missing one, and floating it to the top buries the real codes.
        nullsFirst: false,
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
