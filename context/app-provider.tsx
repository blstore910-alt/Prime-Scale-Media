import { getExchangeRate } from "@/lib/get-exchange-rates";
import { createClient } from "@/lib/supabase/client";
import { UserProfile } from "@/lib/types/user";
import { formatRate } from "@/lib/utils";
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
    const initialExchangeRatesSetup = async () => {
      const supabase = createClient();
      try {
        const { data: exchangeRates } = await supabase
          .from("exchange_rates")
          .select("*")
          .eq("is_active", true)
          .maybeSingle();

        if (exchangeRates) return;

        const usdRates = await getExchangeRate("USD");
        const { error } = await supabase.from("exchange_rates").upsert({
          currency: "USD",
          hkd: formatRate(usdRates.usd.hkd),
          gbp: formatRate(usdRates.usd.gbp),
          eur: formatRate(usdRates.usd.eur),
          updated_at: new Date().toISOString(),
          is_active: true,
          tenant_id: profile.tenant_id,
          updated_by: user.id,
        });
        if (error) throw error;
      } catch (error) {
        console.error("Error setting up initial exchange rates:", error);
      }
    };

    if (profile.role === "admin") initialExchangeRatesSetup();
  }, [profile.tenant_id, user.id, profile.role]);

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
