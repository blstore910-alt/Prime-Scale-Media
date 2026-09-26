"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listPlans, upsertPlan } from "@/actions/plan-actions";
import type { Plan, PlanCurrency, PlanKind } from "@/lib/types/plan";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAppContext } from "@/context/app-provider";
import { suggestPrice } from "@/lib/pure-plan-price";
import useExchangeRates from "./use-exchange-rates";

const KINDS: PlanKind[] = ["tier", "community"];
const CURRENCIES: PlanCurrency[] = ["EUR", "USD"];

type Row = {
  id: string;
  name: string;
  kind: PlanKind;
  monthly: string;
  currency: PlanCurrency;
  /** The USD price somebody CHOSE. Empty = derive it, and say so. */
  usd: string;
  /** Percent off twelve months. Empty or 0 = this plan has no yearly. */
  yearPct: string;
  included: string;
  pct: string;
  is_active: boolean;
  updated_at: string;
  dirty: boolean;
};

/**
 * An empty box is not a zero.
 *
 * Number("") is 0, so a cleared field wrote a deliberate zero — a EUR 0
 * plan from the Add row, which creates no subscription at all. This was
 * defined inside the Save handler and not used by Add, twenty lines
 * apart; at module scope there is one of it.
 */
const blankOrNumber = (v: string) =>
  v.trim() === "" ? (undefined as unknown as number) : Number(v);

export default function PlansCard() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    // The query filters by tenant (the server action resolves it from
    // the profile_id cookie) and the key did not, so after a profile
    // switch this rendered the OTHER tenant's rows as fact for the
    // cache's lifetime -- 30s of staleTime. Nothing was ever written
    // cross-tenant (the action re-checks), but the list on screen was
    // somebody else's. use-exchange-rates.ts next door already keys on
    // the tenant and carries the same note; these did not follow.
    queryKey: ["plans", profile?.tenant_id ?? null, "all"],
    queryFn: async () => {
      const res = await listPlans();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const initial = useMemo<Row[]>(
    () =>
      (data ?? []).map((p: Plan) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        monthly: String(p.monthly_fee).replace(/\.00$/, ""),
        currency: p.currency,
        // Absent because nobody set one, OR because the migration has not
        // been applied yet — both mean "derive it", and both look the same
        // from here, which is exactly right.
        usd:
          p.monthly_fee_usd === null || p.monthly_fee_usd === undefined
            ? ""
            : String(p.monthly_fee_usd).replace(/\.00$/, ""),
        yearPct:
          p.yearly_discount_pct === null || p.yearly_discount_pct === undefined
            ? ""
            : String(p.yearly_discount_pct).replace(/\.00$/, ""),
        included: String(p.included_ad_accounts),
        pct: String(p.topup_fee_pct).replace(/\.00$/, ""),
        is_active: p.is_active,
        updated_at: p.updated_at,
        dirty: false,
      })),
    [data],
  );
  // ── A REFETCH MUST NOT EAT WHAT SOMEBODY IS TYPING ───────────────
  //
  // `useEffect(() => setRows(initial), [initial])` looks harmless and is
  // not: `initial` is a useMemo over the query's data, so ANY refetch
  // hands back a new array identity and this blew away every edit in
  // progress — every typed value and every `dirty` flag — with no
  // message, leaving "Save changes" disabled again.
  //
  // It is reproducible without leaving the screen: edit a fee on an
  // existing row, then use the Add form at the bottom. The add
  // succeeds, invalidate() fires, the active query refetches, and the
  // earlier edit is gone. refetchOnReconnect also defaults to true, so
  // a network blip does the same. This is the screen that sets what
  // customers are charged.
  //
  // So: rows from the server are adopted only while NOTHING is dirty.
  // Once somebody is typing, the screen is theirs until they save or
  // reload — which is the same rule CLAUDE.md states for every long
  // form in this app ("never lose typing").
  const [rows, setRows] = useState<Row[]>(initial);
  useEffect(() => {
    setRows((current) => {
      if (current.some((r) => r.dirty)) return current;
      return initial;
    });
  }, [initial]);

  const [nName, setNName] = useState("");
  const [nKind, setNKind] = useState<PlanKind>("community");
  const [nMonthly, setNMonthly] = useState("0");
  const [nCurrency, setNCurrency] = useState<PlanCurrency>("EUR");
  const [nIncluded, setNIncluded] = useState("1");
  const [nPct, setNPct] = useState("5");

  const patch = (i: number, p: Partial<Row>) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...p, dirty: true };
      return next;
    });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["plans"] });

  const { mutate: saveAll, isPending: saving } = useMutation({
    mutationFn: async () => {
      const dirty = rows.filter((r) => r.dirty);
      for (const r of dirty) {
        // SEND A PRICE ONLY WHEN IT CHANGED. The per-currency columns come
        // from a migration applied by hand; sending them on every save
        // would make renaming a plan fail on a database that has not got
        // them yet. An admin who did not touch the price should never meet
        // a migration error.
        const was = initial.find((x) => x.id === r.id);
        const prices: {
          monthly_fee_eur?: number | null;
          monthly_fee_usd?: number | null;
          yearly_discount_pct?: number | null;
        } = {};
        // "" means "no price chosen" -> null, which is derived. It is not
        // the same as 0, which means free, so an empty box must never
        // arrive as a zero.
        if (was && r.usd !== was.usd) {
          prices.monthly_fee_usd = r.usd.trim() === "" ? null : Number(r.usd);
        }
        if (was && r.yearPct !== was.yearPct) {
          prices.yearly_discount_pct =
            r.yearPct.trim() === "" ? null : Number(r.yearPct);
        }

        // ── THE MONTHLY BOX IS THE PRICE IN THE PLAN'S OWN CURRENCY ──
        //
        // And it has to be written into that currency's PIN as well,
        // because that is what everything downstream reads first:
        // `monthlyIn` in lib/pure-plan-price.ts takes monthly_fee_eur /
        // monthly_fee_usd and only falls back to monthly_fee when the
        // pin is null. Migration 20260918300000 backfilled the pin for
        // every existing plan, so on this database the pin is never
        // null and the fallback is dead.
        //
        // The effect, before this: change Prime from 200 to 210, get
        // "Saved 1 plan(s)", reload and see 210 -- and every customer
        // invited after that is still put on a EUR 200 subscription.
        // For ever, and the same in reverse for a price cut. The invite
        // form shows both figures on one screen and disagrees with
        // itself: the plan chip prints monthly_fee, the Monthly box is
        // prefilled from the pin.
        //
        // There is no separate EUR box, so for a EUR plan the mirror is
        // unconditional. For a USD plan there IS one, so a deliberate
        // edit of it in the same save wins.
        if (was && r.monthly !== was.monthly) {
          const v = r.monthly.trim() === "" ? null : Number(r.monthly);
          if (String(r.currency).toUpperCase() === "USD") {
            if (prices.monthly_fee_usd === undefined) {
              prices.monthly_fee_usd = v;
            }
          } else {
            prices.monthly_fee_eur = v;
          }
        }

        // ── AND THE SAME RULE FOR THE THREE BOXES ABOVE ──────────────
        //
        // `Number("")` is 0, so a cleared Monthly box arrived at the
        // server as a deliberate price of zero — and the server's own
        // guard could not tell the difference either. An empty box is
        // "you did not type a price", which is an error worth showing;
        // 0 is "free", which is a decision. Sending the raw string keeps
        // them apart, because the server now refuses a blank by name.
        //
        // This is the rule the per-currency price six lines up already
        // states in its own comment. It just was not applied to the
        // fields underneath it.

        const res = await upsertPlan({
          id: r.id,
          name: r.name.trim(),
          kind: r.kind,
          monthly_fee: blankOrNumber(r.monthly),
          currency: r.currency,
          ...prices,
          included_ad_accounts: blankOrNumber(r.included),
          topup_fee_pct: blankOrNumber(r.pct),
          is_active: r.is_active,
          ifUpdatedAt: r.updated_at,
        });
        if (!res.ok) throw new Error(res.error);
      }
      return dirty.length;
    },
    onSuccess: (n) => {
      toast.success(n === 0 ? "No changes to save" : `Saved ${n} plan(s)`);
      // ── AND LET GO OF THE ROW ────────────────────────────────────
      //
      // `dirty` was never cleared. The adopt-effect above deliberately
      // refuses fresh server rows while anything is dirty — so the
      // row kept the updated_at it had BEFORE the save, while the
      // trigger on the table had just bumped the real one. The next
      // Save sent the stale stamp as ifUpdatedAt and was refused with
      // "This plan was changed elsewhere. Reload and try again." —
      // changed by nobody but the same admin, one press earlier.
      //
      // Walked: Prime 200 -> 210, Save ("Saved 1 plan(s)"), the button
      // stays lit, Save again -> refused, and every further edit to
      // that row is refused until a full page reload. This is the
      // screen that prices what every new customer is invited on.
      setRows((prev) => prev.map((r) => ({ ...r, dirty: false })));
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Failed to save plans", { description: e.message }),
  });

  const { mutate: add, isPending: adding } = useMutation({
    mutationFn: async () => {
      const res = await upsertPlan({
        name: nName.trim(),
        kind: nKind,
        // blankOrNumber, like the Save path thirty lines up. Number("")
        // is 0, so a cleared box here minted a EUR 0 plan — and a plan
        // priced at zero creates no subscription at all, which is the
        // walkthrough's own known limitation. The helper exists in this
        // file precisely so a blank arrives as undefined.
        monthly_fee: blankOrNumber(nMonthly),
        currency: nCurrency,
        included_ad_accounts: blankOrNumber(nIncluded),
        topup_fee_pct: blankOrNumber(nPct),
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Plan added");
      setNName("");
      setNMonthly("0");
      setNIncluded("1");
      setNPct("5");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Failed to add plan", { description: e.message }),
  });

  const anyDirty = rows.some((r) => r.dirty);
  const sym = (c: PlanCurrency) => (c === "USD" ? "$" : "€");

  // EUR -> USD, from the tenant's OWN active rate rather than a provider.
  // The row is stored USD-based (1 USD = `eur` EUR), so the rate we want is
  // its reciprocal. This is only ever used to SUGGEST a price — the number
  // that gets charged is the one in the box.
  const { exchangeRates } = useExchangeRates({ activeOnly: true });
  const eurToUsd = useMemo(() => {
    const row = (exchangeRates ?? []).find(
      (r) => String(r.currency).toUpperCase() === "USD",
    );
    const eur = Number(row?.eur);
    return Number.isFinite(eur) && eur > 0 ? 1 / eur : null;
  }, [exchangeRates]);

  // Six tracks plus gaps exceed a phone's width, and the horizontal scroller
  // that used to hold them meant dragging the grid left and right to read it
  // — with the column you were editing reliably off screen.
  //
  // Below sm each plan is a small card with its fields labelled; from sm up
  // it is the same six-column grid, with the floor that stops the name
  // column collapsing to 0px.
  const TRACKS =
    "sm:grid-cols-[minmax(130px,1fr)_84px_84px_96px_64px_64px_60px_48px]";
  const cols =
    `grid grid-cols-2 items-start gap-x-3 gap-y-2 rounded-lg border p-3 ${TRACKS} sm:min-w-[700px] sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:p-0`;
  const lab = "text-xs text-muted-foreground sm:hidden";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plans &amp; Communities</CardTitle>
        <CardDescription>
          Billing presets used to pre-fill an advertiser at invite time —
          monthly fee, included ad accounts, and default topup fee. The USD
          price is one you choose, not a conversion — €200 a month is $225,
          not $226.14; leave it empty and we suggest one. Tiers (Launch/Prime/Flex) and
          communities (e.g. NSA = free). Editable; changing a preset never
          touches existing advertisers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : isError ? (
          <p className="text-destructive">{(error as Error)?.message}</p>
        ) : (
          <div className="grid gap-3 sm:overflow-x-auto">
            <div className="hidden sm:grid grid-cols-[minmax(130px,1fr)_84px_84px_96px_64px_64px_60px_48px] gap-2 items-center min-w-[700px] text-xs text-muted-foreground border-b pb-1">
              <span>Name</span>
              <span>Kind</span>
              <span className="text-right">Monthly</span>
              <span className="text-right">USD price</span>
              <span className="text-right">Incl.</span>
              <span className="text-right">Fee %</span>
              <span className="text-right">Year %</span>
              <span className="text-right">On</span>
            </div>
            {/* ── AN EMPTY LIST HAS TO SAY SO ──────────────────────
                Without this the owner sees the column header and then
                straight to the Add form -- no line, no distinction
                between "this tenant has none" and "the read came back
                with nothing". The action returns `data ?? []`, which is
                exactly the null-data-no-error case this repo guards
                against by name elsewhere. Live has four of these, so an
                empty list here is always worth a sentence. */}
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No plans yet. Add one below — until there is an active
                plan, a new customer signs up with no subscription and is
                never invoiced.
              </p>
            ) : null}
            {rows.map((r, i) => (
              <div key={r.id} className={cols}>
                <label className="col-span-2 grid gap-1 sm:col-span-1">
                  <span className={lab}>Name</span>
                  <Input
                    value={r.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Kind</span>
                <select
                  value={r.kind}
                  onChange={(e) => patch(i, { kind: e.target.value as PlanKind })}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Monthly</span>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {sym(r.currency)}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={r.monthly}
                      className="text-right"
                      onChange={(e) => patch(i, { monthly: e.target.value })}
                    />
                  </div>
                </label>
                {/* THE PRICE IN USD, chosen rather than converted. The
                    empty box is honest: it means nobody has decided, and
                    the placeholder shows what we would advise — €200 at
                    today's rate is $226.14, and the advice is $225,
                    because that is a price and the other is a sum. */}
                <label className="grid gap-1">
                  <span className={lab}>USD price / mo</span>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={r.usd}
                      className="text-right"
                      placeholder={
                        r.currency === "USD"
                          ? "—"
                          : (suggestPrice(r.monthly, eurToUsd) ?? "auto")
                              .toString()
                      }
                      onChange={(e) => patch(i, { usd: e.target.value })}
                    />
                  </div>
                  {r.currency !== "USD" &&
                  r.usd.trim() === "" &&
                  suggestPrice(r.monthly, eurToUsd) !== null ? (
                    <button
                      type="button"
                      className="justify-self-end text-[11px] text-primary underline-offset-2 hover:underline"
                      onClick={() =>
                        patch(i, {
                          usd: String(suggestPrice(r.monthly, eurToUsd)),
                        })
                      }
                    >
                      use ${suggestPrice(r.monthly, eurToUsd)}
                    </button>
                  ) : null}
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Included accounts</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={r.included}
                    className="text-right"
                    onChange={(e) => patch(i, { included: e.target.value })}
                  />
                </label>
                <label className="grid gap-1">
                  <span className={lab}>Topup fee %</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={r.pct}
                    className="text-right"
                    onChange={(e) => patch(i, { pct: e.target.value })}
                  />
                </label>
                {/* Percent off twelve months. Empty is not 0% — it means
                    this plan has no yearly option and the Monthly/Yearly
                    pill does not appear for it. */}
                <label className="grid gap-1">
                  {/* ── NOT WIRED YET, AND SAYING SO ─────────────
                      The card used to claim this "turns on a yearly
                      term for that plan". It does not: the column is
                      saved and read by nothing. planPrice is only ever
                      called with "month", nothing sets
                      billing_period to 'year', and the migration that
                      added it says in its own header that applying it
                      alone changes nothing for anybody. A setting that
                      appears to work and does not is worse than one
                      that is plainly parked. */}
                  <span className={lab}>Yearly % off (not in use yet)</span>
                  <Input
                    type="number"
                    min="0"
                    max="99"
                    step="1"
                    value={r.yearPct}
                    className="text-right"
                    placeholder="—"
                    onChange={(e) => patch(i, { yearPct: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-2 sm:justify-end sm:pr-2">
                  <input
                    type="checkbox"
                    checked={r.is_active}
                    aria-label={`${r.name} active`}
                    className="h-4 w-4"
                    onChange={(e) => patch(i, { is_active: e.target.checked })}
                  />
                  <span className={lab}>Active</span>
                </label>
              </div>
            ))}

            <div className="mt-2 border-t pt-3 grid gap-2 sm:overflow-x-auto">
              <Label className="text-xs text-muted-foreground">Add a plan</Label>
              <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(140px,1fr)_90px_90px_70px_70px_auto] sm:min-w-[560px] sm:gap-2">
                <Input
                  className="col-span-2 sm:col-span-1"
                  value={nName}
                  placeholder="e.g. VIP"
                  onChange={(e) => setNName(e.target.value)}
                />
                <select
                  value={nKind}
                  onChange={(e) => setNKind(e.target.value as PlanKind)}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <select
                    value={nCurrency}
                    onChange={(e) =>
                      setNCurrency(e.target.value as PlanCurrency)
                    }
                    className="h-9 rounded-md border border-input bg-transparent px-1 text-xs"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="0"
                    value={nMonthly}
                    placeholder="Monthly fee"
                    className="text-right"
                    onChange={(e) => setNMonthly(e.target.value)}
                  />
                </div>
                <Input
                  type="number"
                  min="0"
                  value={nIncluded}
                  placeholder="Included"
                  className="text-right"
                  onChange={(e) => setNIncluded(e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={nPct}
                  placeholder="Fee %"
                  className="text-right"
                  onChange={(e) => setNPct(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="col-span-2 sm:col-span-1"
                  disabled={adding}
                  onClick={() => add()}
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={!anyDirty || saving} onClick={() => saveAll()}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}
