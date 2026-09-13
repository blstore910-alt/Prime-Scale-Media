import { QueryClient } from "@tanstack/react-query";

// Shared React Query defaults for every role shell.
//
// Without these the client used staleTime:0 + refetchOnWindowFocus:true, so
// EVERY page / hamburger-menu navigation refetched all of that page's data
// from scratch — you saw a loading spinner each time and switching felt
// slow. A short staleTime lets revisiting a recently-seen page render
// instantly from cache, and dropping refetch-on-focus removes the jarring
// reload when you return to the tab.
//
// This does not make data stale after actions: every mutation already calls
// queryClient.invalidateQueries(...) in its onSuccess, which refetches the
// active queries immediately regardless of staleTime — so balances, queues
// and lists still update the moment you approve/submit something.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // 30s: instant re-navigation, still fresh enough
        gcTime: 5 * 60_000, // keep cached pages around for 5 min
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}
