"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  saveCommissionRules,
  type CommissionRuleChange,
} from "@/actions/commission-rule-actions";
import {
  onetimeAtLevel,
  pctAtLevel,
  resolveCommissionRule,
  type CommissionRule,
  type CommissionSource,
} from "@/lib/pure-commission-rules";
import type { AdAccountTypeRow } from "@/hooks/use-affiliate-book";

// A sentinel no advertiser id can equal, so resolving "the default" never
// matches an affiliate's own rule.
const NOBODY = "00000000-0000-0000-0000-000000000000";

type Field = {
  key: string;
  source: CommissionSource;
  type: string | null;
  label: string;
};

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `${Number(n.toFixed(3))}%`;
}

function parsePct(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim().replace(",", ".");
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false };
  return { ok: true, value: Math.round(n * 1000) / 1000 };
}

/**
 * What a blank field falls back to: the same resolution the accrual does,
 * with this exact level taken out.
 */
function inherited(
  rules: readonly CommissionRule[],
  affiliateId: string | null,
  f: Field,
): { pct: number | null; from: string } {
  const without = rules.filter(
    (r) =>
      !(
        r.source === f.source &&
        (r.affiliate_advertiser_id ?? null) === affiliateId &&
        (f.type
          ? !!r.ad_account_type && r.ad_account_type === f.type
          : !r.ad_account_type)
      ),
  );
  const res = resolveCommissionRule(without, {
    affiliateAdvertiserId: affiliateId ?? NOBODY,
    source: f.source,
    typeSlug: f.type,
  });
  if (!res) return { pct: null, from: "nothing — earns nothing" };
  const from =
    res.level === "own-all"
      ? "their rule for all types"
      : res.level === "default-type"
        ? "the default for this type"
        : res.level === "default-all"
          ? f.type
            ? "the default for all types"
            : "the default"
          : "their own rule";
  return { pct: res.pct, from };
}

export default function CommissionRulesEditor({
  open,
  onOpenChange,
  affiliate,
  rules,
  types,
  canEdit: canEditAsOwner,
  notSwitchedOn = false,
  approve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null edits the DEFAULT for every affiliate. */
  affiliate: { id: string; label: string } | null;
  rules: CommissionRule[];
  types: AdAccountTypeRow[];
  /** Only the owner can save; the server refuses anyone else too. */
  canEdit: boolean;
  /** The rules table is not in the database yet: nobody can save. */
  notSwitchedOn?: boolean;
  /**
   * APPROVING an application (the owner, 22-09: "als ik approve doe moet er
   * een modal komen met de rules, default pre-filled"). The fields start at
   * what this affiliate would earn -- the defaults -- so the rate is chosen
   * at the moment of approving. Only a field changed away from the default
   * becomes their own rule; the rest keeps following the default. The
   * button approves, with or without changes.
   */
  approve?: { onApprove: () => Promise<void> };
}) {
  // Two different reasons a field is locked, and the owner must be told
  // the right one: walking it, the owner read "Only the account owner can
  // change earning rules" -- about themselves -- when the real reason was
  // that the table had not been pasted yet.
  const canEdit = canEditAsOwner && !notSwitchedOn;
  const queryClient = useQueryClient();
  const affiliateId = affiliate?.id ?? null;

  // ── PER ACCOUNT TYPE, NO "ALL TYPES" ROW ──────────────────────────
  // The owner, walking it: "all acc types mag niet bestaan, heb ik niks
  // aan". Every rate is set per type. The engine still understands an
  // all-types version (older rows); this editor folds one into the types
  // on the next save and clears it, so nothing invisible keeps applying.
  const fields = useMemo<Field[]>(() => {
    const list: Field[] = [];
    const shown = types
      .filter((t) => t.is_active !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const t of shown) {
      list.push({ key: `topup|${t.slug}`, source: "topup", type: t.slug, label: t.label });
    }
    list.push({
      key: "subscription|*",
      source: "subscription",
      type: null,
      label: "Every plan",
    });
    // The first top-up of each new customer can have its own share --
    // 0% = that fee is all ours (the owner, for the NSA community).
    list.push({
      key: "first_topup|*",
      source: "first_topup",
      type: null,
      label: "First top-up",
    });
    return list;
  }, [types]);

  // What is set at each exact level now -- the starting value of a field.
  const initial = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const f of fields) {
      m[f.key] = pctAtLevel(rules, {
        affiliateAdvertiserId: affiliateId,
        source: f.source,
        typeSlug: f.type,
      });
    }
    return m;
  }, [fields, rules, affiliateId]);

  // An all-types version at THIS level, if one is still standing.
  const legacyAll = useMemo(
    () =>
      pctAtLevel(rules, {
        affiliateAdvertiserId: affiliateId,
        source: "topup",
        typeSlug: null,
      }),
    [rules, affiliateId],
  );

  const approving = !!approve;
  // An affiliate's editor shows NUMBERS, not grey placeholders: every field
  // starts at what they earn now (their own rate, or the default). The owner:
  // "default pre filled". Only a field moved away from the default becomes
  // their own rule.
  const prefill = approving || affiliateId !== null;
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const d: Record<string, string> = {};
    for (const f of fields) {
      // A type with no rate of its own starts at the all-types rate, if
      // one stands: saving then writes it onto the type, where it is
      // visible, and the all-types version is cleared.
      let v =
        initial[f.key] ?? (f.source === "topup" && f.type ? legacyAll : null);
      // Start from what they earn now -- the default where they have no rule.
      if (prefill && (v === null || v === undefined)) {
        v = inherited(rules, affiliateId, f).pct;
      }
      d[f.key] = v === null || v === undefined ? "" : String(v);
    }
    setDraft(d);
  }, [open, fields, initial, legacyAll, prefill, rules, affiliateId]);

  const parsed = useMemo(() => {
    const out: Record<string, { ok: boolean; value: number | null }> = {};
    for (const f of fields) {
      const p = parsePct(draft[f.key] ?? "");
      out[f.key] = p.ok ? { ok: true, value: p.value } : { ok: false, value: null };
    }
    return out;
  }, [draft, fields]);

  // ── THE ONE-TIME BONUS ───────────────────────────────────────────
  // A fixed amount, once per referred customer, when their first top-up
  // is verified. Its own field: an amount with a currency, not a %.
  const initialOnetime = useMemo(
    () => onetimeAtLevel(rules, { affiliateAdvertiserId: affiliateId }),
    [rules, affiliateId],
  );
  const [onetimeDraft, setOnetimeDraft] = useState<{ amount: string; currency: string }>({
    amount: "",
    currency: "EUR",
  });
  const onetimeInheritedForPrefill = useMemo(() => {
    const without = rules.filter(
      (r) => !(r.source === "onetime" && (r.affiliate_advertiser_id ?? null) === affiliateId),
    );
    const res = resolveCommissionRule(without, {
      affiliateAdvertiserId: affiliateId ?? NOBODY,
      source: "onetime",
    });
    return res && res.amount !== null ? { amount: res.amount, currency: res.currency ?? "EUR" } : null;
  }, [rules, affiliateId]);
  useEffect(() => {
    if (!open) return;
    const start = initialOnetime ?? (prefill ? onetimeInheritedForPrefill : null);
    setOnetimeDraft({
      amount: start ? String(start.amount) : "",
      currency: start?.currency ?? "EUR",
    });
  }, [open, initialOnetime, prefill, onetimeInheritedForPrefill]);
  const onetimeParsed = (() => {
    const t = onetimeDraft.amount.trim().replace(",", ".");
    if (t === "") return { ok: true as const, value: null as number | null };
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return { ok: false as const, value: null };
    return { ok: true as const, value: Math.round(n * 100) / 100 };
  })();
  const onetimeInherited = (() => {
    const without = rules.filter(
      (r) => !(r.source === "onetime" && (r.affiliate_advertiser_id ?? null) === affiliateId),
    );
    const res = resolveCommissionRule(without, {
      affiliateAdvertiserId: affiliateId ?? NOBODY,
      source: "onetime",
    });
    return res && res.amount !== null ? { amount: res.amount, currency: res.currency ?? "EUR" } : null;
  })();
  const onetimeSameAsDefault =
    prefill &&
    initialOnetime === null &&
    onetimeParsed.ok &&
    onetimeParsed.value === (onetimeInherited?.amount ?? null) &&
    (onetimeParsed.value === null || onetimeDraft.currency === (onetimeInherited?.currency ?? "EUR"));
  const onetimeChanged =
    !onetimeSameAsDefault &&
    onetimeParsed.ok &&
    (onetimeParsed.value !== (initialOnetime?.amount ?? null) ||
      (onetimeParsed.value !== null &&
        onetimeDraft.currency !== (initialOnetime?.currency ?? "EUR")));

  const invalid = fields.some((f) => !parsed[f.key]?.ok) || !onetimeParsed.ok;

  // Only what moved. The server stores each as a new version from now.
  const changes = useMemo(() => {
    const list: Array<CommissionRuleChange & { label: string; before: number | null }> = [];
    for (const f of fields) {
      const p = parsed[f.key];
      if (!p?.ok) continue;
      const before = initial[f.key] ?? null;
      if (p.value === before) continue;
      // Approving: a field left at the default stays ON the default -- it
      // is not copied into an own rule that would stop following it.
      if (prefill && before === null && p.value === inherited(rules, affiliateId, f).pct) continue;
      list.push({
        source: f.source,
        adAccountType: f.type,
        pct: p.value,
        label:
          f.source === "subscription"
            ? "Subscriptions"
            : f.source === "first_topup"
              ? "No commission on first top-ups"
              : f.label,
        before,
      });
    }
    if (legacyAll !== null && list.length > 0) {
      list.push({
        source: "topup",
        adAccountType: null,
        pct: null,
        label: "All account types (removed; set per type now)",
        before: legacyAll,
      });
    }
    return list;
  }, [fields, parsed, initial, legacyAll, prefill, rules, affiliateId]);

  const onetimeLine = (v: { amount: number; currency: string } | null) =>
    v ? `${v.currency} ${v.amount.toFixed(2)}` : "—";
  const changeCount = changes.length + (onetimeChanged ? 1 : 0);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      // Approving without changing anything: approve, keep the defaults.
      if (approve && changeCount === 0) {
        await approve.onApprove();
        return { effectiveFrom: new Date().toISOString(), approvedOnly: true as const };
      }
      const res = await saveCommissionRules({
        affiliateAdvertiserId: affiliateId,
        changes: [
          ...changes.map(({ source, adAccountType, pct }) => ({
            source,
            adAccountType,
            pct,
          })),
          ...(onetimeChanged
            ? [
                {
                  source: "onetime" as const,
                  adAccountType: null,
                  pct: null,
                  amount: onetimeParsed.value,
                  currency: onetimeDraft.currency,
                },
              ]
            : []),
        ],
      });
      if (!res.ok) throw new Error(res.error);
      // The rules first, then the approval: a rate saved for somebody who
      // is not approved yet is harmless; an approval without the rate the
      // owner just typed would not be.
      if (approve) {
        try {
          await approve.onApprove();
        } catch (e) {
          // Saying "the rules were not saved" here is false, and it
          // invites a second press that writes a second rule version.
          throw new Error(
            `The rules are saved, but the approval did not go through: ${
              e instanceof Error ? e.message : "unknown error"
            } They are still waiting; try Approve again.`,
          );
        }
      }
      return res.data;
    },
    onSuccess: (data) => {
      if (approve) {
        toast.success(`${affiliate?.label ?? "They"} ${affiliate ? "is" : "are"} an affiliate now`, {
          description:
            changeCount > 0
              ? `Their link is live, with their own rate from ${dayjs(data.effectiveFrom).format("D MMM YYYY, HH:mm")}.`
              : "Their link is live, on your default rates.",
        });
        queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["affiliates-waiting"], exact: false });
        onOpenChange(false);
        return;
      }
      toast.success("Rules saved", {
        description: `They apply from ${dayjs(data.effectiveFrom).format("D MMM YYYY, HH:mm")}. Commission already earned has not changed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["affiliate-book"], exact: false });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("The rules were not saved", { description: err.message });
    },
  });

  const title = approve
    ? `Approve ${affiliate?.label ?? "this affiliate"}`
    : affiliate
      ? `What ${affiliate.label} earns`
      : "Default earning rules";

  const renderField = (f: Field) => {
    const inh = inherited(rules, affiliateId, f);
    const p = parsed[f.key];
    const blank = (draft[f.key] ?? "").trim() === "";
    return (
      <div key={f.key} className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0 pt-2">
          <div className="text-sm font-medium truncate">{f.label}</div>
          <div className="text-xs text-muted-foreground">
            {!p?.ok ? (
              "Between 0 and 100"
            ) : !affiliate ? (
              blank ? "Earns nothing here" : "Default for everyone"
            ) : blank ? (
              inh.pct === null ? "Earns nothing here" : `Uses the default (${fmtPct(inh.pct)})`
            ) : initial[f.key] !== null && p.value === initial[f.key] ? (
              <span className="font-medium text-primary">
                Own rate{inh.pct !== null && inh.pct !== p.value ? ` · default ${fmtPct(inh.pct)}` : ""}
              </span>
            ) : p.value === inh.pct ? (
              "Default"
            ) : (
              <span className="font-medium text-primary">
                Own rate from now{inh.pct !== null ? ` · default ${fmtPct(inh.pct)}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Input
            aria-label={`${f.label} percentage`}
            className={`w-24 text-right ${p && !p.ok ? "border-destructive" : ""}`}
            inputMode="decimal"
            placeholder={inh.pct === null ? "—" : String(inh.pct)}
            value={draft[f.key] ?? ""}
            disabled={!canEdit || isPending}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [f.key]: e.target.value }))
            }
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {approve ? (
              <>
                What they earn, filled in with your defaults. Change anything
                to give them their own rate — what you leave as it is keeps
                following the default. Approving switches their referral
                link on.
              </>
            ) : (
              <>
                {affiliate
                  ? "What they earn now. Change a number to give them their own rate."
                  : "What every affiliate earns, unless they have their own rate."}{" "}
                Changes count from the moment you save; what is already
                earned never changes.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {notSwitchedOn ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            Saving rules is not switched on in the database yet. You can
            look at them, not change them.
          </div>
        ) : !canEditAsOwner ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            Only the account owner can change earning rules.
          </div>
        ) : null}

        <section className="space-y-1">
          <h4 className="text-sm font-semibold">Top-ups — share of our profit</h4>
          <p className="text-xs text-muted-foreground">
            Profit is our fee minus what the supplier charges us on the
            amount that lands. A top-up that makes no profit earns nothing.
          </p>
          <div className="divide-y">
            {fields.filter((f) => f.source === "topup").map(renderField)}
          </div>
        </section>

        <section className="space-y-1">
          <h4 className="text-sm font-semibold">
            Subscriptions — share of every paid invoice
          </h4>
          <div className="divide-y">
            {fields.filter((f) => f.source === "subscription").map(renderField)}
          </div>
        </section>

        {/* ── A TICK, NOT A PERCENTAGE ─────────────────────────────
            The owner: "0% klinkt als een rare regel, maak er gewoon een
            vinkje van". Stored as a first_topup rule of 0% (ticked) or a
            cleared one (unticked) -- the engine does not change. */}
        <section className="space-y-1">
          {(() => {
            const key = "first_topup|*";
            const ticked = (draft[key] ?? "").trim() === "0";
            const fromDefault =
              affiliate && initial[key] === null
                ? resolveCommissionRule(rules, {
                    affiliateAdvertiserId: NOBODY,
                    source: "first_topup",
                  })
                : null;
            return (
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={ticked}
                  disabled={!canEdit || isPending}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [key]: e.target.checked ? "0" : "" }))
                  }
                />
                <span>
                  <span className="font-medium">
                    No commission on a new customer&apos;s first top-up
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    That first fee is all ours; every top-up after it earns
                    as set above.
                    {fromDefault && fromDefault.pct === 0 && !ticked
                      ? " The default already does this for everyone."
                      : ""}
                  </span>
                </span>
              </label>
            );
          })()}
        </section>

        <section className="space-y-1">
          <h4 className="text-sm font-semibold">One-time bonus</h4>
          <p className="text-xs text-muted-foreground">
            A fixed amount, once per referred customer, when their first
            top-up is verified.
          </p>
          <div className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0 pt-2">
              <div className="text-sm font-medium">Per new customer</div>
              <div className="text-xs text-muted-foreground">
                {onetimeDraft.amount.trim() === ""
                  ? onetimeInherited
                    ? `Blank — uses ${onetimeLine(onetimeInherited)} from the default`
                    : "Blank — no bonus"
                  : !onetimeParsed.ok
                    ? "Between 0 and 100,000"
                    : affiliate
                      ? "Their own rule"
                      : "Default"}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                aria-label="One-time bonus currency"
                className="h-10 rounded-md border bg-background px-2 text-sm"
                value={onetimeDraft.currency}
                disabled={!canEdit || isPending}
                onChange={(e) => setOnetimeDraft((d) => ({ ...d, currency: e.target.value }))}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
              <Input
                aria-label="One-time bonus amount"
                className={`w-24 text-right ${onetimeParsed.ok ? "" : "border-destructive"}`}
                inputMode="decimal"
                placeholder={onetimeInherited ? String(onetimeInherited.amount) : "—"}
                value={onetimeDraft.amount}
                disabled={!canEdit || isPending}
                onChange={(e) => setOnetimeDraft((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>
          </div>
        </section>

        {changeCount > 0 ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">From the moment you save:</p>
            <ul className="mt-1 space-y-0.5">
              {changes.map((c) => (
                <li key={`${c.source}|${c.adAccountType ?? "*"}`}>
                  {c.source === "first_topup"
                    ? `${c.label}: ${c.before === 0 ? "on" : "off"} → ${c.pct === 0 ? "on" : "off"}`
                    : `${c.label}: ${fmtPct(c.before)} → ${
                        c.pct === null ? "blank (uses the next rule down)" : fmtPct(c.pct)
                      }`}
                </li>
              ))}
              {onetimeChanged ? (
                <li>
                  One-time bonus: {onetimeLine(initialOnetime)} →{" "}
                  {onetimeParsed.value === null
                    ? "blank (uses the default)"
                    : onetimeLine({ amount: onetimeParsed.value, currency: onetimeDraft.currency })}
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit ? (
            <Button
              onClick={() => mutate()}
              disabled={isPending || invalid || (!approve && changeCount === 0)}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {approve
                ? changeCount > 0
                  ? "Approve with these rules"
                  : "Approve on the default rules"
                : "Save rules"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
