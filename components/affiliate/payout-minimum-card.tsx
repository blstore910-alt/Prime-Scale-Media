"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { setAffiliatePayoutMinimum } from "@/actions/payout-minimum-actions";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  MAX_PAYOUT_MIN,
  STANDING_PAYOUT_MIN,
  isReleased,
  payoutMinimumFor,
} from "@/lib/pure-payout-min";

/**
 * When THIS affiliate may ask to be paid.
 *
 * The owner, 22-09: "200 usd of 200 eur ondergrens", per transfer, per
 * currency. The owner, 25-09: "ik wil pas payout vanaf 200 eu, of tenzij
 * admin het vrijgeeft, super admin". The rule stands; this is the
 * exception to it, and only the owner can set one — it decides when money
 * leaves the company.
 *
 * Blank is not zero. Blank means "the standing rule"; zero means "this one
 * may ask for any amount". Two different decisions, kept apart all the way
 * down to the column — see lib/pure-payout-min.ts.
 */
export default function PayoutMinimumCard({
  advertiserId,
  canEdit,
}: {
  advertiserId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // A separate key from the customer card's, deliberately: two observers
  // on ONE key with different SHAPES hand each other the wrong object,
  // which is what crashed /users this morning. Same column, two readers,
  // two keys.
  const q = useQuery<{ value: number | string | null; supported: boolean }>({
    queryKey: ["affiliate-payout-min-admin", advertiserId],
    queryFn: async () => {
      const supabase = createClient();
      const r = await supabase
        .from("advertisers")
        .select("payout_min_override")
        .eq("id", advertiserId)
        .maybeSingle();
      if (!r.error) {
        return {
          value:
            (r.data as { payout_min_override?: number | string | null } | null)
              ?.payout_min_override ?? null,
          supported: true,
        };
      }
      // The column arrives with plak 98 and migrations are pasted by hand.
      // Until it lands this says so, instead of the whole affiliate page
      // dying on a column that is not there yet.
      if ((r.error as { code?: string } | null)?.code === "42703") {
        return { value: null, supported: false };
      }
      throw r.error;
    },
  });

  const raw = q.data?.value ?? null;
  const supported = q.data?.supported ?? true;
  const effective = payoutMinimumFor(raw);
  const released = isReleased(raw);

  const save = async (value: number | null) => {
    setSaving(true);
    try {
      const res = await setAffiliatePayoutMinimum({
        affiliateAdvertiserId: advertiserId,
        minimum: value,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: ["affiliate-payout-min-admin", advertiserId],
      });
      // The customer's own card reads the same column under its own key.
      await queryClient.invalidateQueries({
        queryKey: ["affiliate-payout-min", advertiserId],
      });
      setEditing(false);
      toast.success(
        value === null
          ? `Back on the standing ${STANDING_PAYOUT_MIN} per currency`
          : `They can ask from ${value} per currency`,
      );
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const t = draft.trim().replace(",", ".");
    if (t === "") {
      void save(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > MAX_PAYOUT_MIN) {
      toast.error(`A minimum is between 0 and ${MAX_PAYOUT_MIN}.`);
      return;
    }
    void save(Math.round(n * 100) / 100);
  };

  if (q.isError) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Could not read what this affiliate may ask for. That is not the same
          as &ldquo;no exception&rdquo; — reload before you change anything.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h2>Can ask for a payout from</h2>
          <p className="cap" style={{ margin: "4px 0 0" }}>
            {q.isPending ? (
              "Reading…"
            ) : !supported ? (
              <>
                The exception needs plak 98 in the SQL editor. Everyone is on
                the standing {STANDING_PAYOUT_MIN} per currency until then.
              </>
            ) : released ? (
              <>
                <b>
                  {formatCurrency(effective, "EUR")} /{" "}
                  {formatCurrency(effective, "USD")}
                </b>{" "}
                — released by the owner. The standing rule is{" "}
                {STANDING_PAYOUT_MIN} per transfer, per currency.
              </>
            ) : (
              <>
                <b>
                  {formatCurrency(STANDING_PAYOUT_MIN, "EUR")} /{" "}
                  {formatCurrency(STANDING_PAYOUT_MIN, "USD")}
                </b>{" "}
                — the standing rule, per transfer, per currency.
              </>
            )}
          </p>
        </div>
        {canEdit && supported ? (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {released ? (
              <button
                className="btn ghost sm"
                type="button"
                disabled={saving}
                onClick={() => void save(null)}
              >
                Put back to {STANDING_PAYOUT_MIN}
              </button>
            ) : null}
            <button
              className="btn sm"
              type="button"
              disabled={saving}
              onClick={() => {
                setDraft(released ? String(effective) : "");
                setEditing((v) => !v);
              }}
            >
              {editing ? "Cancel" : released ? "Change" : "Release"}
            </button>
          </div>
        ) : null}
      </div>

      {editing && canEdit && supported ? (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--line, #e6e9f2)",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: ".8rem" }}>
              Minimum per currency
            </span>
            <input
              className="inp"
              inputMode="decimal"
              autoFocus
              placeholder={String(STANDING_PAYOUT_MIN)}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              style={{ width: 150 }}
            />
          </label>
          <button
            className="btn sm"
            type="button"
            disabled={saving}
            onClick={submit}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <span
            className="muted"
            style={{ fontSize: ".8rem", flex: "1 1 240px" }}
          >
            Leave it empty for the standing {STANDING_PAYOUT_MIN}. Zero lets
            them ask for any amount. It applies to both currencies, and the
            request itself is still checked on the server.
          </span>
        </div>
      ) : null}
    </div>
  );
}
