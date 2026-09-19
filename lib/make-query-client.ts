import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { userFacingErrorMessage } from "@/lib/pure-error";

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

// How long to stay quiet about the same failing query. A broken read that
// retries would otherwise stack identical toasts.
const TOAST_WINDOW_MS = 15_000;

export function makeQueryClient() {
  const lastToastAt = new Map<string, number>();

  return new QueryClient({
    // Every query in the app destructures `data` and most ignore isError, so a
    // failed read used to be INVISIBLE: an expired token, an RLS denial or a
    // dropped connection left `data` undefined and each consumer fell back to
    // a zero/empty value indistinguishable from the truth — a €0 wallet
    // balance, "no ad accounts yet", an empty verification queue. Silence is
    // the wrong default when the numbers are money. A per-screen error state
    // is still better where it matters; this is the floor beneath them.
    queryCache: new QueryCache({
      onError: (error, query) => {
        // Background probes (health polling) opt out: their failure is not
        // something the user can act on, and a toast for it would train
        // people to dismiss the toasts that do matter.
        if (query.meta?.silent) return;

        const key = JSON.stringify(query.queryKey);
        const now = Date.now();
        const last = lastToastAt.get(key) ?? 0;
        if (now - last < TOAST_WINDOW_MS) return;
        lastToastAt.set(key, now);

        // safeErrorMessage is the LOG-safe helper — its own docblock says
        // so. It strips Supabase's details/hint/row before they reach a log
        // file; it does nothing about the message itself. So this handler,
        // which fires for every failed query in every role shell, was
        // putting "column plans_1.features does not exist" and "permission
        // denied for table wallets" straight in front of the customer.
        //
        // That is almost certainly how a customer read a PostgREST error
        // "across their own dashboard": not one screen, this one line,
        // once per query key.
        toast.error("Couldn't load some data", {
          description: userFacingErrorMessage(
            error,
            "We couldn't load part of this page. Reload to try again.",
          ),
        });
      },
    }),
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
