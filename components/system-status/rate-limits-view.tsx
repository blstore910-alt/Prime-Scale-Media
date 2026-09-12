"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

type Bucket = {
  key: string;
  count: number;
  window_start: string;
};

/**
 * Small super-admin panel showing the busiest rate-limit buckets.
 * `rate_limit_buckets` is global (not tenant-scoped) so this needs
 * the caller to already be a super-admin — enforced by the parent
 * page's requireSuperAdmin().
 *
 * Refreshes every 30 seconds. Highlights buckets over 80% of their
 * apparent limit — a heuristic since we don't record the ceiling in
 * the row, so we estimate by comparing the count to typical values
 * (60 for heartbeat / client-error-log; 20 for send-invite /
 * push-subscribe; 10 for signup / gdpr-export; 5 for accept-invite).
 */
const CEILING_HINTS: Record<string, number> = {
  heartbeat: 60,
  "client-error-log": 60,
  "send-invite": 20,
  "push-subscribe": 20,
  "accept-invite": 10,
  "gdpr-export": 10,
  signup: 5,
};

function bucketKind(key: string): string {
  return key.split(":")[0] ?? key;
}

// Mockup-only table chrome, scoped under .psm-rl. Reuses the shell's ported
// .tbl / .tblwrap / .tbl.wide / .badge / .card classes (already the approved
// mockup styling) and only adds the panel header layout + a couple of cell
// tweaks. The wide table lives inside .tblwrap (overflow-x:auto) so the page
// body never scrolls sideways.
const RATE_CSS = `
.psm-rl .rlhead{margin-bottom:14px}
.psm-rl .rlsub{color:var(--muted);font-size:.82rem;margin:5px 0 0;max-width:64ch}
.psm-rl .tblwrap{overflow-x:auto}
.psm-rl .empty{height:96px;display:grid;place-items:center;color:var(--muted);font-size:.86rem}
.psm-rl .keycell{font-family:ui-monospace,Menlo,monospace;font-size:.78rem;word-break:break-all;max-width:24rem}
.psm-rl .win{font-family:ui-monospace,Menlo,monospace;font-size:.78rem;color:var(--faint);white-space:nowrap}
.psm-rl .est{font-size:.78rem;color:var(--faint)}
`;

export default function RateLimitsView() {
  const { profile } = useAppContext();

  const { data, isLoading, isError } = useQuery<Bucket[]>({
    queryKey: ["rate-limit-buckets", profile?.id],
    enabled: !!profile?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      // Only rows still inside their window (last hour). Order by count desc.
      const cutoff = new Date(Date.now() - 3600_000).toISOString();
      const { data, error } = await supabase
        .from("rate_limit_buckets")
        .select("key, count, window_start")
        .gte("window_start", cutoff)
        .order("count", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as Bucket[];
    },
  });

  return (
    <section className="psm-rl card">
      <style>{RATE_CSS}</style>

      <div className="rlhead">
        <h2>Rate limits</h2>
        <p className="rlsub">
          Top 25 active buckets in the last hour. High counts mean either
          legitimate load or someone hammering an endpoint.
        </p>
      </div>

      {isLoading ? (
        <div className="empty">Loading…</div>
      ) : isError || !data?.length ? (
        <div className="empty">No active rate-limit buckets.</div>
      ) : (
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th>Key</th>
                <th className="r">Count</th>
                <th className="r">Ceiling (est.)</th>
                <th>Window started</th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => {
                const ceiling = CEILING_HINTS[bucketKind(b.key)] ?? null;
                const near = ceiling !== null && b.count / ceiling >= 0.8;
                return (
                  <tr key={b.key}>
                    <td className="keycell">{b.key}</td>
                    <td className="r">
                      {near ? (
                        <span className="badge due">{b.count}</span>
                      ) : (
                        b.count
                      )}
                    </td>
                    <td className="r est">{ceiling ?? "-"}</td>
                    <td className="win">
                      {new Date(b.window_start).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
