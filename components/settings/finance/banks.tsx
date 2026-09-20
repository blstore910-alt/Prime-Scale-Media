"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bankForTypeSlug } from "@/lib/bank-routing";
import { bankInstructions } from "@/lib/bank-beneficiaries";
import { builtInBankDraft, builtInCurrencies } from "@/lib/bank-builtin";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  listBankAccounts,
  upsertBankAccount,
} from "@/actions/bank-account-actions";
import { listAdAccountTypes } from "@/actions/ad-account-type-actions";
import type { AdAccountType } from "@/lib/types/ad-account-type";
import {
  BANK_ACCOUNT_CURRENCIES,
  type BankAccount,
  type BankAccountCurrency,
} from "@/lib/types/bank-account";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// The set of editable, non-key fields on a destination. Empty string in the
// UI == cleared; the server action trims empties back to null.
type BankDraft = {
  label: string;
  beneficiary: string;
  account_no: string;
  swift_bic: string;
  bank_name: string;
  bank_address: string;
  routing_no: string;
  notes: string;
  is_active: boolean;
};

// Text fields shown in the diff summary + rendered as inputs, in order.
const TEXT_FIELDS: Array<{ key: keyof BankDraft; label: string; wide?: boolean }> = [
  { key: "label", label: "Label" },
  { key: "beneficiary", label: "Beneficiary" },
  { key: "account_no", label: "Account no / IBAN" },
  { key: "swift_bic", label: "SWIFT / BIC" },
  { key: "bank_name", label: "Bank name" },
  { key: "routing_no", label: "Routing no" },
  { key: "bank_address", label: "Bank address", wide: true },
  { key: "notes", label: "Notes", wide: true },
];

function emptyDraft(): BankDraft {
  return {
    label: "",
    beneficiary: "",
    account_no: "",
    swift_bic: "",
    bank_name: "",
    bank_address: "",
    routing_no: "",
    notes: "",
    is_active: true,
  };
}

function fromExisting(b: BankAccount | undefined): BankDraft {
  if (!b) return emptyDraft();
  return {
    label: b.label ?? "",
    beneficiary: b.beneficiary ?? "",
    account_no: b.account_no ?? "",
    swift_bic: b.swift_bic ?? "",
    bank_name: b.bank_name ?? "",
    bank_address: b.bank_address ?? "",
    routing_no: b.routing_no ?? "",
    notes: b.notes ?? "",
    is_active: b.is_active,
  };
}

function draftsEqual(a: BankDraft, b: BankDraft): boolean {
  return (
    a.label === b.label &&
    a.beneficiary === b.beneficiary &&
    a.account_no === b.account_no &&
    a.swift_bic === b.swift_bic &&
    a.bank_name === b.bank_name &&
    a.bank_address === b.bank_address &&
    a.routing_no === b.routing_no &&
    a.notes === b.notes &&
    a.is_active === b.is_active
  );
}

// What the confirm dialog needs to describe the pending change.
type PendingSave = {
  typeId: string;
  typeLabel: string;
  currency: BankAccountCurrency;
  draft: BankDraft;
  original: BankDraft;
  ifUpdatedAt?: string;
  isNew: boolean;
};

function changedLabels(pending: PendingSave): string[] {
  const out: string[] = [];
  for (const f of TEXT_FIELDS) {
    if (pending.draft[f.key] !== pending.original[f.key]) out.push(f.label);
  }
  if (pending.draft.is_active !== pending.original.is_active) {
    out.push(pending.draft.is_active ? "Active" : "Inactive");
  }
  return out;
}

// ─────────────────────────────────────────
// One editable destination form (type × currency). Manages its own local
// draft, re-seeded whenever the persisted row changes (after a save the
// banks query is invalidated and `existing` comes back with a new
// updated_at). Save does NOT persist — it asks the parent to confirm.
// ─────────────────────────────────────────
function BankDestinationForm({
  type,
  currency,
  existing,
  onRequestSave,
  busy,
}: {
  type: AdAccountType;
  currency: BankAccountCurrency;
  existing: BankAccount | undefined;
  onRequestSave: (p: PendingSave) => void;
  busy: boolean;
}) {
  const original = useMemo(() => fromExisting(existing), [existing]);
  const [draft, setDraft] = useState<BankDraft>(original);

  // Re-seed when the persisted row identity/version changes.
  useEffect(() => {
    setDraft(original);
  }, [original]);

  const dirty = !draftsEqual(draft, original);
  const set = (patch: Partial<BankDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const inputId = (k: string) => `bank-${type.id}-${currency}-${k}`;

  return (
    <div className="rounded-md border p-3 grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{currency}</span>
          {!existing && (
            <span className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
              not set
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Active
          <Switch
            checked={draft.is_active}
            onCheckedChange={(v) => set({ is_active: v })}
            aria-label={`${type.label} ${currency} active`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) =>
          f.wide ? (
            <div key={f.key} className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor={inputId(f.key)} className="text-xs">
                {f.label}
              </Label>
              <Textarea
                id={inputId(f.key)}
                value={draft[f.key] as string}
                onChange={(e) => set({ [f.key]: e.target.value } as Partial<BankDraft>)}
                className="min-h-[52px]"
              />
            </div>
          ) : (
            <div key={f.key} className="grid gap-1.5">
              <Label htmlFor={inputId(f.key)} className="text-xs">
                {f.label}
              </Label>
              <Input
                id={inputId(f.key)}
                value={draft[f.key] as string}
                onChange={(e) => set({ [f.key]: e.target.value } as Partial<BankDraft>)}
              />
            </div>
          ),
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={!dirty || busy}
          onClick={() =>
            onRequestSave({
              typeId: type.id,
              typeLabel: type.label,
              currency,
              draft,
              original,
              ifUpdatedAt: existing?.updated_at,
              isNew: !existing,
            })
          }
        >
          Save bank
        </Button>
      </div>
    </div>
  );
}

// Where this type's money ACTUALLY goes today. The table below is not wired
// to the top-up screen yet, so every row read "no destinations set" while
// real transfers were routing perfectly well through the built-in
// beneficiaries — the page looked empty on a tenant that has been taking
// payments for weeks. Saying which built-in is in force is the difference
// between "nothing is configured" and "nothing is OVERRIDDEN".
function liveDestination(slug?: string | null): string | null {
  const group = bankForTypeSlug(slug);
  if (!group) return null;
  const cfg = bankInstructions[group];
  const currencies = Object.keys(cfg.accounts).join(" / ");
  return currencies ? `${cfg.beneficiary} (${currencies})` : cfg.beneficiary;
}

export default function BanksCard() {
  const queryClient = useQueryClient();

  const typesQuery = useQuery({
    queryKey: ["ad-account-types", "all"],
    queryFn: async () => {
      const res = await listAdAccountTypes();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const banksQuery = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const res = await listBankAccounts();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // Key: `${ad_account_type_id}|${currency}` → row.
  const bankByKey = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const b of banksQuery.data ?? []) {
      m.set(`${b.ad_account_type_id}|${b.currency}`, b);
    }
    return m;
  }, [banksQuery.data]);

  // The pending change awaiting double-confirm.
  const [pending, setPending] = useState<PendingSave | null>(null);

  const { mutate: confirmSave, isPending: saving } = useMutation({
    mutationFn: async (p: PendingSave) => {
      const res = await upsertBankAccount({
        ad_account_type_id: p.typeId,
        currency: p.currency,
        label: p.draft.label,
        beneficiary: p.draft.beneficiary,
        account_no: p.draft.account_no,
        swift_bic: p.draft.swift_bic,
        bank_name: p.draft.bank_name,
        bank_address: p.draft.bank_address,
        routing_no: p.draft.routing_no,
        notes: p.draft.notes,
        is_active: p.draft.is_active,
        ifUpdatedAt: p.ifUpdatedAt,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Bank destination saved");
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (err: Error) =>
      toast.error("Failed to save bank", { description: err.message }),
  });

  // ── Fill from what is already in force ──────────────────────────────
  // The table was empty on a tenant that has been taking payments for weeks,
  // because the destinations live in the built-in beneficiary block and this
  // page only ever read the database. Retyping an IBAN is how a digit gets
  // transposed, so the rows are written FROM the built-ins rather than by
  // hand. It never touches a row that already exists — an admin's edit is a
  // decision, and this is only here to stop the page starting from nothing.
  const fillable = useMemo(() => {
    const out: { typeId: string; typeLabel: string; currency: string }[] = [];
    for (const t of typesQuery.data ?? []) {
      const group = bankForTypeSlug(t.slug);
      if (!group) continue;
      for (const currency of builtInCurrencies(group)) {
        if (!(BANK_ACCOUNT_CURRENCIES as string[]).includes(currency)) continue;
        if (bankByKey.has(`${t.id}|${currency}`)) continue;
        out.push({ typeId: t.id, typeLabel: t.label, currency });
      }
    }
    return out;
  }, [typesQuery.data, bankByKey]);

  const [fillOpen, setFillOpen] = useState(false);
  const { mutate: runFill, isPending: filling } = useMutation({
    mutationFn: async () => {
      let written = 0;
      // Sequential on purpose. Each one is a separate guarded write, and a
      // failure half way should leave the rows before it saved and say how
      // far it got, rather than a pile of parallel errors nobody can read.
      for (const f of fillable) {
        const group = bankForTypeSlug(
          (typesQuery.data ?? []).find((t) => t.id === f.typeId)?.slug,
        );
        if (!group) continue;
        const draft = builtInBankDraft(group, f.currency);
        if (!draft) continue;
        const res = await upsertBankAccount({
          ad_account_type_id: f.typeId,
          currency: f.currency as BankAccount["currency"],
          ...draft,
          is_active: true,
        });
        if (!res.ok) {
          throw new Error(
            `${written} written, then ${f.typeLabel} ${f.currency} failed: ${res.error}`,
          );
        }
        written += 1;
      }
      return written;
    },
    onSuccess: (written) => {
      toast.success(
        `${written} destination${written === 1 ? "" : "s"} filled from the built-in details`,
      );
      setFillOpen(false);
      queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (err: Error) =>
      toast.error("Fill stopped", { description: err.message }),
  });

  const isLoading = typesQuery.isLoading || banksQuery.isLoading;
  const isError = typesQuery.isError || banksQuery.isError;
  const errorMessage =
    (typesQuery.error as Error | undefined)?.message ??
    (banksQuery.error as Error | undefined)?.message;
  const types = typesQuery.data ?? [];
  const changed = pending ? changedLabels(pending) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banks</CardTitle>
        <CardDescription>
          Beneficiary bank destinations per ad-account type and currency
          (EUR / USD / HKD).{" "}
          <strong>
            Not yet wired to the advertiser top-up screen — it currently shows
            the built-in beneficiaries, so edits here don’t change what
            advertisers see.
          </strong>{" "}
          Use this to prepare the destinations; ask an engineer to switch the
          top-up flow over to them. Changes still ask for a double-confirm.
        </CardDescription>
        {/* ── NOT WHILE THE BANKS READ IS BROKEN ────────────────────
            bankByKey is built from banksQuery.data ?? [], and `fillable`
            skips a destination only when that map already has it. So a
            FAILED banks read made every destination "fillable" -- and
            this banner sits in the header, outside the isError branch in
            the body, so it rendered directly above the red error with
            the promise "existing rows are left alone", computed from the
            query that failed. runFill passes no ifUpdatedAt, and
            versionMatches(x, undefined) is true, so the UPDATE is
            unguarded: a hand-corrected IBAN overwritten by the built-in
            details, and a toast saying it worked. */}
        {fillable.length > 0 && !banksQuery.isError && !banksQuery.isLoading && (
          <div className="mt-3 rounded-lg border bg-card p-3 text-sm">
            <p className="m-0">
              <strong>{fillable.length}</strong> destination
              {fillable.length === 1 ? " is" : "s are"} in force through the
              built-in beneficiaries but not recorded here yet.
            </p>
            {fillOpen ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  Writes real account numbers, copied from the built-in
                  details. Existing rows are left alone.
                </span>
                <Button size="sm" onClick={() => runFill()} disabled={filling}>
                  {filling && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Yes, fill {fillable.length}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFillOpen(false)}
                  disabled={filling}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => setFillOpen(true)}
              >
                Fill from the built-in details
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="p-6 flex items-center justify-center h-40">
            <Loader2 className="animate-spin" />
          </div>
        ) : isError ? (
          <div className="p-6 flex items-center justify-center h-40">
            <p className="text-destructive">{errorMessage}</p>
          </div>
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No ad-account types yet. Add one under Ad account types first, then
            set its bank destinations here.
          </p>
        ) : (
          /* One <details> per ad-account type, closed by default. Every type
             carries THREE full bank forms — label, beneficiary, IBAN, SWIFT,
             bank name, routing, address — so eight types is twenty-four
             forms, and the page was a mile of identical empty fields with no
             way to find the one you came for. Closed, the row says which
             currencies are set and which are not, which is the question you
             actually arrive with. A type that already has a destination
             opens on its own, because that is the one worth glancing at. */
          <div className="grid gap-2">
            {types.map((type) => {
              const set = BANK_ACCOUNT_CURRENCIES.filter((c) =>
                bankByKey.get(`${type.id}|${c}`),
              );
              return (
                <details
                  key={type.id}
                  open={set.length > 0}
                  className="group rounded-lg border bg-card"
                >
                  {/* One row on a wide screen, two on a phone. Everything
                      used to sit on a single flex line with the status hint
                      pinned right and shrink-0, so the NAME was the only
                      thing that could give way: "Meta-HK-Business-Green"
                      broke across three lines inside a 75px column while a
                      "no destinations set" hint sat comfortably beside it.
                      The name is the thing you are looking for, so it gets
                      the width and the hint drops below. */}
                  <summary className="flex cursor-pointer list-none items-start gap-2 px-3.5 py-3 text-sm hover:bg-accent/40 sm:items-center">
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 sm:mt-0" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
                      <span className="font-semibold">{type.label}</span>
                      {!type.is_active && (
                        <span className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          inactive
                        </span>
                      )}
                      <span
                        className={
                          "text-xs sm:ml-auto sm:text-right " +
                          (set.length === 0
                            ? "text-muted-foreground"
                            : "font-medium text-foreground")
                        }
                      >
                        {set.length === 0
                          ? liveDestination(type.slug)
                            ? `built-in → ${liveDestination(type.slug)}`
                            : "no destination"
                          : set.join(" · ")}
                      </span>
                    </div>
                  </summary>
                  <div className="grid gap-3 border-t p-3.5">
                    {BANK_ACCOUNT_CURRENCIES.map((currency) => (
                      <BankDestinationForm
                        key={`${type.id}-${currency}`}
                        type={type}
                        currency={currency}
                        existing={bankByKey.get(`${type.id}|${currency}`)}
                        onRequestSave={setPending}
                        busy={saving}
                      />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Double-confirm — the ONLY path that persists a bank change. */}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm bank change</DialogTitle>
            <DialogDescription>
              {pending && (
                <>
                  You&apos;re about to change the bank destination for{" "}
                  <span className="font-medium text-foreground">
                    {pending.typeLabel}
                  </span>{" "}
                  ·{" "}
                  <span className="font-medium text-foreground">
                    {pending.currency}
                  </span>
                  . Note: this destination is not yet shown to advertisers
                  (the top-up screen uses the built-in beneficiaries) — double-check
                  the IBAN/account before confirming anyway.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {pending && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm grid gap-1.5">
              <div className="grid grid-cols-[110px_1fr] gap-x-3">
                <span className="text-muted-foreground">Type</span>
                <span>{pending.typeLabel}</span>
                <span className="text-muted-foreground">Currency</span>
                <span>{pending.currency}</span>
                <span className="text-muted-foreground">Label</span>
                <span>{pending.draft.label || "—"}</span>
                <span className="text-muted-foreground">Account / IBAN</span>
                <span className="font-mono break-all">
                  {pending.draft.account_no || "—"}
                </span>
              </div>
              <div className="pt-1 text-xs text-muted-foreground">
                {pending.isNew
                  ? "New destination (nothing set before)."
                  : changed.length
                    ? `Changing: ${changed.join(", ")}.`
                    : "No field changes."}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => pending && confirmSave(pending)}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, save bank
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
