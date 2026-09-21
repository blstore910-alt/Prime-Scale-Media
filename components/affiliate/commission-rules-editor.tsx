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
}) {
  // Two different reasons a field is locked, and the owner must be told
  // the right one: walking it, the owner read "Only the account owner can
  // change earning rules" -- about themselves -- when the real reason was
  // that the table had not been pasted yet.
  const canEdit = canEditAsOwner && !notSwitchedOn;
  const queryClient = useQueryClient();
  const affiliateId = affiliate?.id ?? null;

  const fields = useMemo<Field[]>(() => {
    const list: Field[] = [
      { key: "topup|*", source: "topup", type: null, label: "All account types" },
    ];
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

  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    const d: Record<string, string> = {};
    for (const f of fields) {
      const v = initial[f.key];
      d[f.key] = v === null || v === undefined ? "" : String(v);
    }
    setDraft(d);
  }, [open, fields, initial]);

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
  useEffect(() => {
    if (!open) return;
    setOnetimeDraft({
      amount: initialOnetime ? String(initialOnetime.amount) : "",
      currency: initialOnetime?.currency ?? "EUR",
    });
  }, [open, initialOnetime]);
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
  const onetimeChanged =
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
      list.push({
        source: f.source,
        adAccountType: f.type,
        pct: p.value,
        label: f.source === "subscription" ? "Subscriptions" : f.label,
        before,
      });
    }
    return list;
  }, [fields, parsed, initial]);

  const onetimeLine = (v: { amount: number; currency: string } | null) =>
    v ? `${v.currency} ${v.amount.toFixed(2)}` : "—";
  const changeCount = changes.length + (onetimeChanged ? 1 : 0);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
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
      return res.data;
    },
    onSuccess: (data) => {
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

  const title = affiliate ? `What ${affiliate.label} earns` : "Default earning rules";

  const renderField = (f: Field) => {
    const inh = inherited(rules, affiliateId, f);
    const p = parsed[f.key];
    const blank = (draft[f.key] ?? "").trim() === "";
    return (
      <div key={f.key} className="flex items-start justify-between gap-3 py-2">
        <div className="min-w-0 pt-2">
          <div className="text-sm font-medium truncate">{f.label}</div>
          <div className="text-xs text-muted-foreground">
            {blank
              ? inh.pct === null
                ? "Blank — earns nothing here"
                : `Blank — uses ${fmtPct(inh.pct)} from ${inh.from}`
              : !p?.ok
                ? "Between 0 and 100"
                : affiliate
                  ? "Their own rule"
                  : "Default"}
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
            {affiliate
              ? "Their own rules. A blank field uses the default."
              : "For every affiliate who has no rule of their own."}{" "}
            A change applies from the moment you save, to every future
            top-up and paid invoice of all their referred customers.
            Commission already earned never changes.
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
                  {c.label}: {fmtPct(c.before)} →{" "}
                  {c.pct === null ? "blank (uses the next rule down)" : fmtPct(c.pct)}
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
              disabled={isPending || invalid || changeCount === 0}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save rules
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
