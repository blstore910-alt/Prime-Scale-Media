"use client";

// ── WIE IS ER NU ────────────────────────────────────────────────────
//
// De eigenaar, 01-10: "laat zien wie nu live moet zijn volgens het
// rooster, klein bovenaan het dashboard." Een regel onder de begroeting:
// wie nu dienst heeft (groene stip = de app staat bij hem open), en wie
// er hierna komt. Klik = het rooster. Zonder rooster of zonder plak 189
// staat er niets -- een lege regel zegt niets.

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getLiveNow } from "@/actions/schedule-actions";

export function LiveNow() {
  const q = useQuery({
    queryKey: ["live-now"],
    queryFn: async () => {
      const r = await getLiveNow();
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
    refetchInterval: 60_000,
  });
  const d = q.data;
  if (!d || d.plakNodig || (!d.onShift.length && !d.next)) return null;
  return (
    <Link
      href="/schedule"
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        padding: "5px 12px",
        borderRadius: 999,
        background: "var(--surface-2, rgba(91,141,255,.08))",
        border: "1px solid rgba(91,141,255,.25)",
        fontSize: 12,
        fontWeight: 600,
        textDecoration: "none",
        color: "inherit",
      }}
      title="Open the schedule"
    >
      {d.onShift.length ? (
        <>
          <span style={{ opacity: 0.7 }}>On now:</span>
          {d.onShift.map((s, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span
                style={{ width: 7, height: 7, borderRadius: 99, background: s.online ? "#16a34a" : "#cbd5e1" }}
                aria-label={s.online ? "online" : "not online"}
              />
              <b>{s.name}</b>
              <span style={{ opacity: 0.6 }}>until {s.until}</span>
            </span>
          ))}
        </>
      ) : (
        <span style={{ opacity: 0.7 }}>Nobody on shift right now</span>
      )}
      {d.next ? (
        <span style={{ opacity: 0.6 }}>
          · next {d.next.name} at {d.next.start}
        </span>
      ) : null}
    </Link>
  );
}
