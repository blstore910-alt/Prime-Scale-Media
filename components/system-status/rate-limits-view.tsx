"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold leading-none">Rate limits</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Top 25 active buckets in the last hour. High counts mean either
            legitimate load or someone hammering an endpoint.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      ) : isError || !data?.length ? (
        <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
          No active rate-limit buckets.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Ceiling (est.)</TableHead>
                <TableHead>Window started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((b) => {
                const ceiling = CEILING_HINTS[bucketKind(b.key)] ?? null;
                const near =
                  ceiling !== null && b.count / ceiling >= 0.8;
                return (
                  <TableRow key={b.key}>
                    <TableCell className="font-mono text-xs break-all max-w-[24rem]">
                      {b.key}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {near ? (
                        <Badge variant="destructive">{b.count}</Badge>
                      ) : (
                        b.count
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {ceiling ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(b.window_start).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
