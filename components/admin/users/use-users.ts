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
  role,
  sort = "newest",
  search = "",
  active,
  page = 1,
  perPage = 10,
}: UseUsersParams = {}) {
  // `role` was in the parameter type and then thrown away, so every caller
  // asking for one kind of person got all of them. An advertiser and an
  // affiliate share almost no column — a plan, a wallet and a top-up total
  // mean nothing for somebody who never buys anything — so one list of both
  // had half its cells wrong whichever way it was labelled.
  const queryKey = ["users", { role, sort, search, active, page, perPage }];
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

      if (role) query = query.eq("role", role);

      // Active filter
      if (active !== undefined) {
        query = query.eq("is_active", active);
      }
      // Search filter (sanitised for PostgREST .or() filter DSL)
      if (search && search.trim().length > 0) {
        const term = safeIlikeTerm(search);
        if (term.length > 0) {
          // ── THE CLIENT CODE IS WHAT THE DESK SEARCHES BY ────────────
          //
          // The comment forty lines down says "Searching by client code
          // still works". It did not: tenant_client_code sits on the
          // EMBEDDED advertisers row, and PostgREST cannot filter a
          // parent by an embedded column from inside .or() — the filter
          // would narrow the embed instead. So every screen that links
          // here with ?q=PSM0005 (the subscriptions list, the requests
          // queue, the accounts table) landed on "No customers match
          // your current search or filters", which reads as "that
          // customer does not exist".
          //
          // Resolved with one small lookup first: the advertisers whose
          // code matches, then their user_ids added to the same .or().
          // A lookup that fails narrows nothing rather than hiding
          // everybody.
          const { data: byCode } = await supabase
            .from("advertisers")
            .select("user_id")
            .eq("tenant_id", profile?.tenant_id)
            .ilike("tenant_client_code", `%${search.trim()}%`)
            .limit(200);
          const codeIds = Array.from(
            new Set(
              (byCode ?? [])
                .map((a) => String((a as { user_id?: string }).user_id ?? ""))
                .filter(Boolean),
            ),
          );

          const clauses = [
            `full_name.ilike."*${term}*"`,
            `email.ilike."*${term}*"`,
          ];
          if (codeIds.length > 0) {
            clauses.push(`user_id.in.(${codeIds.join(",")})`);
          }
          query = query.or(clauses.join(","));
        }
      }

      // Sort keys that the DATABASE can actually order by.
      //
      // "Client code" is gone, and this is the second time it has been wrong:
      // first it silently ordered by user_profiles.id (a UUID — TA, PA, JR,
      // HA, AA, JD), then my fix passed foreignTable, which postgrest-js
      // turns into `advertisers.order=` — a directive for ordering the
      // EMBEDDED rows, not the parent. The parent query then went out with no
      // ORDER BY at all, which is worse than the original bug: `.range()`
      // paging an unordered result can repeat a row on page 2 and skip
      // another entirely.
      //
      // PostgREST cannot order a parent by a column on a to-one embed, and
      // tenant_client_code lives on advertisers. Offering the option while it
      // cannot work is worse than not offering it — a control that lies about
      // what it does is the thing being removed here. Searching by client
      // code still works, which is what people actually reach for.
      const sortMap: Record<string, { column: string; ascending: boolean }> = {
        newest: { column: "created_at", ascending: false },
        oldest: { column: "created_at", ascending: true },
        "a-z": { column: "full_name", ascending: true },
        "z-a": { column: "full_name", ascending: false },
      };

      const sortOption = sortMap[sort] ?? sortMap["newest"];
      query = query
        .order(sortOption.column, { ascending: sortOption.ascending })
        // A stable tiebreaker. Without one, rows sharing a created_at or a
        // name have no defined order between pages, so paging can show the
        // same advertiser twice and never show another.
        .order("id", { ascending: true });

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      const { data, count, error } = await query.range(start, end);
      if (error) throw error;

      return { data, count };
    },
  });

  return { profiles, total: profiles?.count ?? 0, isLoading, isError, error };
}
