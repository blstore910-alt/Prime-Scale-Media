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
  // ── AND IT STILL SAYS WHO ASKED ────────────────────────────────────
  //
  // Blok 11's closing test is one sentence: no line in `audit_events`
  // may say GEEN ACTOR for something a human did. Measured 28-09, five
  // invoices marked paid in the same second, four more voided, and
  // every `tenants` settings save — all with no actor at all.
  //
  // The cause is right above this line. `_audit_row_change` takes its
  // actor from `auth.uid()`, and a service-role client deliberately
  // sends no user JWT, so there is no uid to take. Every privileged
  // write is therefore anonymous in the audit log, which is the one
  // place the answer is supposed to live.
  //
  // `set local` cannot help: supabase-js sends each call as its own
  // request, so a GUC set in one does not reach the next. PostgREST
  // does expose the REQUEST HEADERS as a setting though, for every
  // statement of that request — so the actor travels as a header and
  // the trigger reads it there when auth.uid() is null (plak 132).
  //
  // Read here rather than passed in by each caller: every one of the
  // ~40 admin writes would have to remember, and the one that forgets
  // is the one that matters. Best-effort on purpose — a failure to
  // work out who is asking must never stop a privileged write, and the
  // trigger falls back to null, which is exactly today's behaviour.
  let actor = "";
  try {
    const session = await createClient();
    const { data } = await session.auth.getUser();
    actor = data?.user?.id ?? "";
  } catch {
    actor = "";
  }

  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      // NOT the Authorization header: that would hand PostgREST a
      // user JWT, which it honours over the service_role key, and the
      // whole reason this client exists is to bypass RLS. A custom
      // header carries the name without carrying the role.
      ...(actor ? { global: { headers: { "x-psm-actor": actor } } } : {}),
    },
  );
}
