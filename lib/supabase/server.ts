import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * TRUE service-role client. It must NOT be built with createServerClient +
 * cookies: that attaches the logged-in user's JWT as the Authorization
 * header, and PostgREST then honours that JWT's role (`authenticated`)
 * over the service_role apikey — so RLS still applies and privileged
 * writes (e.g. inserting another user's profile in Create Admin, or GDPR
 * erase) get rejected with "new row violates row-level security policy".
 *
 * Using @supabase/supabase-js with only the service key and no session
 * sends the service_role key alone → RLS is bypassed as intended,
 * regardless of who is logged in.
 */
export async function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
