"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { listCapabilities, setCapability, setOwner } from "@/actions/capability-actions";
import { CAPABILITY_GROUPS, CAPABILITIES, GRANTABLE } from "@/lib/capabilities";

/**
 * WHAT THIS PERSON IS ALLOWED TO DO.
 *
 * The owner, 26-09: "mooiste zou zijn als ik per admin wat
 * bevoegdheden kan instellen."
 *
 * ── EVERY TOGGLE SAYS WHAT IT ACTUALLY DOES ───────────────────────
 *
 * A row reading "rates.write" with a switch next to it gets flipped
 * by somebody who is guessing, and this list decides who can change
 * the exchange rate that every customer is charged on. So each one
 * carries the sentence from lib/capabilities.ts, and it says the risk
 * as well as the power.
 *
 * ── THE TWO THAT CANNOT BE GIVEN ARE SHOWN ANYWAY ─────────────────
 *
 * Handing out permissions and making somebody an owner stay with the
 * owners, always. They are in the list, greyed, with the reason —
 * because a toggle that is simply absent looks like an oversight, and
 * somebody will ask for it. One that is there and explained is a
 * decision.
 */
export default function AdminCapabilities({
  profileId,
  name,
  isOwner,
  canEdit,
  onClose,
}: {
  profileId: string;
  name: string;
  /** Already an owner: every capability follows, so the list is read-only. */
  isOwner: boolean;
  /** Only an owner may change any of this. */
  canEdit: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => {
      const res = await listCapabilities();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const mine = new Set(q.data?.byProfile[profileId] ?? []);
  const ownerNow = isOwner || (q.data?.owners ?? []).includes(profileId);

  const flip = useMutation({
    mutationFn: async (v: { capability: string; on: boolean }) => {
      const res = await setCapability({ profileId, ...v });
      if (!res.ok) throw new Error(res.error);
      return v;
    },
    onSuccess: (v) => {
      toast.success(
        v.on ? "Permission given" : "Permission taken back",
        {
          description:
            CAPABILITIES.find((c) => c.key === v.capability)?.label ?? v.capability,
        },
      );
      qc.invalidateQueries({ queryKey: ["capabilities"] });
    },
    onError: (e: Error) => toast.error("Nothing changed", { description: e.message }),
    onSettled: () => setBusy(null),
  });

  const flipOwner = useMutation({
    mutationFn: async (on: boolean) => {
      const res = await setOwner({ profileId, on });
      if (!res.ok) throw new Error(res.error);
      return on;
    },
    onSuccess: (on) => {
      toast.success(on ? `${name} is now an owner` : `${name} is no longer an owner`, {
        description: on
          ? "They can do everything you can, under their own name."
          : "Their individual permissions below apply again.",
      });
      qc.invalidateQueries({ queryKey: ["capabilities"] });
    },
    onError: (e: Error) => toast.error("Nothing changed", { description: e.message }),
    onSettled: () => setBusy(null),
  });

  return (
    <div className="cap-panel">
      <style>{CAP_CSS}</style>

      <div className="cap-head">
        <div>
          <h3>What {name} is allowed to do</h3>
          <p>
            {ownerNow
              ? "An owner can do everything, so none of these need switching on."
              : canEdit
                ? "Off by default. Anything not switched on, they cannot do."
                : "Only an owner can change these."}
          </p>
        </div>
        <button className="cap-x" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {/* ── OWNER IS ITS OWN THING ──────────────────────────────── */}
      <div className={`cap-owner${ownerNow ? " on" : ""}`}>
        <div className="t">
          <b>Owner</b>
          <span>
            Everything, including handing out the permissions below. Their
            actions appear under their own name, which is the reason to give
            somebody their own login rather than share yours.
          </span>
        </div>
        <button
          className={`cap-sw${ownerNow ? " on" : ""}`}
          disabled={!canEdit || busy === "__owner"}
          onClick={() => {
            setBusy("__owner");
            flipOwner.mutate(!ownerNow);
          }}
          aria-pressed={ownerNow}
        >
          <span />
        </button>
      </div>

      {q.isPending ? (
        <p className="cap-note">Reading the permissions…</p>
      ) : q.isError ? (
        <p className="cap-note">
          We could not read the permissions. Reload — this is not &quot;they
          have none&quot;.
        </p>
      ) : (
        CAPABILITY_GROUPS.map((group) => {
          const rows = CAPABILITIES.filter((c) => c.group === group);
          if (!rows.length) return null;
          return (
            <div className="cap-group" key={group}>
              <div className="cap-gt">{group}</div>
              {rows.map((c) => {
                const grantable = GRANTABLE.some((g) => g.key === c.key);
                const on = ownerNow || mine.has(c.key);
                return (
                  <div
                    className={`cap-row${c.ownerOnly ? " fixed" : ""}`}
                    key={c.key}
                  >
                    <div className="t">
                      <b>{c.label}</b>
                      <span>{c.what}</span>
                    </div>
                    {c.ownerOnly ? (
                      <span className="cap-lock">Owners only</span>
                    ) : (
                      <button
                        className={`cap-sw${on ? " on" : ""}`}
                        disabled={!canEdit || ownerNow || busy === c.key || !grantable}
                        title={
                          ownerNow
                            ? "An owner has this already"
                            : !canEdit
                              ? "Only an owner can change this"
                              : undefined
                        }
                        onClick={() => {
                          setBusy(c.key);
                          flip.mutate({ capability: c.key, on: !on });
                        }}
                        aria-pressed={on}
                      >
                        <span />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      <p className="cap-foot">
        Every change here is written to the audit log with your name on it, and
        so is every action the person then takes. That is the point of giving
        somebody their own login instead of sharing one.
      </p>
    </div>
  );
}

const CAP_CSS = `
  .cap-panel{background:var(--panel,#fff);border:1px solid var(--primary,#3a6fff);
    border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:14px;
    box-shadow:0 18px 40px -22px rgba(20,30,80,.45)}
  .cap-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
  .cap-head h3{margin:0;font-family:var(--hd,inherit);font-weight:800;font-size:1.05rem}
  .cap-head p{margin:3px 0 0;font-size:.83rem;color:var(--txt-2,#535e78);line-height:1.45}
  .cap-x{border:0;background:transparent;font-size:1.6rem;line-height:1;cursor:pointer;
    color:var(--faint,#818ead);padding:0 4px}

  .cap-owner{display:flex;align-items:flex-start;gap:14px;padding:14px;
    border-radius:13px;border:1px solid var(--line,#e3e8f4);
    background:var(--panel-2,#f0f4fd)}
  .cap-owner.on{border-color:#bfe9d8;background:#e7f8f1}
  .cap-owner .t,.cap-row .t{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
  .cap-owner .t b,.cap-row .t b{font-size:.92rem;font-weight:700}
  .cap-owner .t span,.cap-row .t span{font-size:.79rem;line-height:1.5;
    color:var(--txt-2,#535e78)}

  .cap-group{display:flex;flex-direction:column;gap:2px}
  .cap-gt{font-size:.72rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
    color:var(--faint,#818ead);margin-bottom:5px}
  .cap-row{display:flex;align-items:flex-start;gap:14px;padding:11px 2px;
    border-bottom:1px solid var(--line,#e3e8f4)}
  .cap-row:last-child{border-bottom:0}
  .cap-row.fixed{opacity:.62}
  .cap-lock{font-size:.72rem;font-weight:700;color:var(--faint,#818ead);
    border:1px dashed var(--line-2,#d3daec);border-radius:99px;padding:4px 10px;
    white-space:nowrap;flex:0 0 auto}

  .cap-sw{flex:0 0 auto;width:42px;height:24px;border-radius:99px;cursor:pointer;
    border:1px solid var(--line-2,#d3daec);background:var(--panel-2,#f0f4fd);
    padding:0;position:relative;transition:background .14s,border-color .14s}
  .cap-sw span{position:absolute;top:2px;left:2px;width:18px;height:18px;
    border-radius:99px;background:#fff;box-shadow:0 1px 3px rgba(20,30,80,.28);
    transition:transform .14s}
  .cap-sw.on{background:var(--primary,#3a6fff);border-color:var(--primary,#3a6fff)}
  .cap-sw.on span{transform:translateX(18px)}
  .cap-sw:disabled{cursor:not-allowed;opacity:.5}

  .cap-note{margin:0;font-size:.85rem;color:var(--txt-2,#535e78)}
  .cap-foot{margin:0;font-size:.78rem;line-height:1.5;color:var(--faint,#818ead);
    border-top:1px solid var(--line,#e3e8f4);padding-top:12px}
`;
