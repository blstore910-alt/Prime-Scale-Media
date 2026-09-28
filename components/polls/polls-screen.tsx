"use client";

import PollAdmin from "@/components/polls/poll-admin";
import { useAppContext } from "@/context/app-provider";

/**
 * The page wrapper: the route is a server component and does the guard,
 * this reads the signed-in profile the way every other admin screen
 * does and hands the tenant to the panel.
 */
export default function PollsScreen() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;

  return (
    <div className="psmview" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="phead">
        <div>
          <h1>Polls</h1>
          <p className="cap">
            Ask your customers a question and read the answer.
          </p>
        </div>
      </div>
      {/* No tenant means the profile has not arrived yet. Rendering the
          form against a null tenant would offer an Ask button that
          cannot write. */}
      {tenantId ? <PollAdmin tenantId={tenantId} /> : null}
    </div>
  );
}
