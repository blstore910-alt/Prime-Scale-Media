import { ensureTenantBootstrap } from "@/actions/bootstrap-actions";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import {
  ActionDispatch,
  createContext,
  useContext,
  useEffect,
  useReducer,
} from "react";

type Action =
  | "open-quick-create"
  | "close-quick-create"
  | "open-invite-user"
  | "close-invite-user";

const initialState = {
  quickCreateOpen: false,
  inviteUserOpen: false,
};

const defaultContext = {
  profile: null,
  user: null,
  isSuperAdmin: false,
  state: initialState,
  dispatch: () => initialState,
};

type ContextType = {
  profile: UserProfile | null;
  user: User | null;
  isSuperAdmin: boolean;
  state: typeof initialState;
  dispatch: ActionDispatch<[action: Action]>;
};
const AppContext = createContext<ContextType>(defaultContext);

const reducer = (state: typeof initialState, action: Action) => {
  switch (action) {
    case "open-quick-create":
      return { ...state, quickCreateOpen: true };
    case "close-quick-create":
      return { ...state, quickCreateOpen: false };
    case "open-invite-user":
      return { ...state, inviteUserOpen: true };
    case "close-invite-user":
      return { ...state, inviteUserOpen: false };
    default:
      return state;
  }
};
export function AppProvider({
  profile,
  user,
  children,
}: {
  user: User;
  profile: UserProfile;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const tenant = Array.isArray(profile?.tenant)
    ? profile?.tenant?.[0]
    : profile?.tenant;
  const isSuperAdmin = tenant?.owner_id === user?.id;
  const tenantId = tenant?.id ?? null;
  useEffect(() => {
    if (profile.role !== "admin" || !tenantId) return;

    // Seeds a fresh tenant with exchange rates, fee defaults and ad-account
    // types. These only ever DO anything once, but they used to be fired as
    // three separate server actions on every single page load — and Next
    // serialises server actions per client, so they queued: measured at
    // 1.19s + 1.29s + 1.34s back to back, ~3.8s added to every cold load.
    //
    // Now: one round trip, parallel inside, and at most once per browser
    // session per tenant. sessionStorage rather than localStorage so a new
    // session still re-checks — a tenant whose seed failed must not be
    // permanently unseeded because of a flag in a browser.
    const key = `psm-bootstrap:${tenantId}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // Private mode / blocked storage: fall through and just run it.
    }

    ensureTenantBootstrap()
      .then(() => {
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // Nothing to do — worst case we re-run it next navigation.
        }
      })
      .catch(() => {
        // Non-fatal for UI; surfaced only in server logs. Deliberately NOT
        // marked done, so the next navigation retries.
      });
  }, [profile.role, tenantId]);

  return (
    <AppContext.Provider
      value={{ profile, user, isSuperAdmin, state, dispatch }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
