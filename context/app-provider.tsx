import { ensureInitialExchangeRates } from "@/actions/exchange-rate-actions";
import { ensureInitialFeeDefaults } from "@/actions/fee-default-actions";
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
  useEffect(() => {
    if (profile.role !== "admin") return;
    // Fire-and-forget seed; the server action validates the 3rd-party
    // response and enforces admin + tenant server-side.
    ensureInitialExchangeRates().catch(() => {
      // Non-fatal for UI; surfaced only in server logs.
    });
    ensureInitialFeeDefaults().catch(() => {
      // Same — seed missing fee_defaults so /settings/finance and topup
      // fee resolution have a baseline to work with on a fresh tenant.
    });
  }, [profile.role]);

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
