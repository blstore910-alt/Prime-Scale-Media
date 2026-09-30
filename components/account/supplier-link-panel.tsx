"use client";

// ── WELK ACCOUNT BIJ DE LEVERANCIER IS DIT ──────────────────────────
//
// De eigenaar, 30-09: "stel het is een API ad account, dan dus alleen
// wat er live op dat ad acc staat als max refundable."
//
// Zonder dit paneel kan dat niet, en dat was de verrassing van vandaag:
// de leverancier houdt 98 ad-accounts voor ons vast en geeft er per
// stuk een saldo bij, wij hebben er 13 in de database, en er is tussen
// die twee GEEN ENKELE koppeling. Automatisch matchen kan niet -- onze
// `bm_id`s zijn testwaarden en twee accounts delen er zelfs een. Dus
// kiest een mens, eenmalig per account.
//
// ── ADMIN-ONLY, EN DAT IS NIET COSMETISCH ─────────────────────────
//
// Hier staat de naam van de leverancier en het saldo dat wij bij hen
// aanhouden. Dat mag een klant nergens zien. Dit paneel wordt alleen
// gemount in de `!isAdvertiser`-tak van de detaillade, en de twee
// server-acties erachter zijn allebei admin-gated -- want een render-
// poort is geen grens.
//
// ── WAT HET TOONT EN WAAROM ───────────────────────────────────────
//
// De lijst laat OOK zien wat al aan een ander account van ons hangt,
// met die naam erbij. Een keuzelijst die het bezette weglaat maakt van
// een dubbele koppeling een onzichtbaar probleem; nu zie je meteen dat
// je iemand anders zijn account pakt.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link2, Link2Off, RefreshCw, AlertTriangle } from "lucide-react";
import {
  listSupplierAdAccounts,
  linkAdAccountToSupplier,
} from "@/actions/supplier-link-actions";
import { formatCurrency } from "@/lib/utils-pure";

export default function SupplierLinkPanel({
  adAccountId,
  adAccountName,
}: {
  adAccountId: string;
  adAccountName: string;
}) {
  const qc = useQueryClient();
  const [openList, setOpenList] = useState(false);
  const [filter, setFilter] = useState("");

  // Pas ophalen als iemand de lijst opent: het is een aanroep naar een
  // derde partij, en die hoort niet te lopen omdat er een lade opengaat.
  const lijst = useQuery({
    queryKey: ["supplier-choices"],
    enabled: openList,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await listSupplierAdAccounts();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const koppel = useMutation({
    mutationFn: async (externalId: string | null) => {
      const res = await linkAdAccountToSupplier({ adAccountId, externalId });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: (_d, externalId) => {
      toast.success(
        externalId ? "Linked to the supplier account" : "Link removed",
      );
      setOpenList(false);
      // Het saldo op het Approve-scherm hangt hieraan.
      void qc.invalidateQueries({ queryKey: ["supplier-choices"] });
      void qc.invalidateQueries({ queryKey: ["withdraw-live-balance"] });
      void qc.invalidateQueries({ queryKey: ["ad-account-live-balance"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const huidige =
    lijst.data?.accounts.find((a) => a.alreadyLinkedTo === adAccountName) ??
    null;

  const zichtbaar = (lijst.data?.accounts ?? []).filter((a) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      a.name.toLowerCase().includes(q) ||
      a.platformAccountId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-[var(--faint)]" />
        <span className="text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--faint)]">
          Supplier account
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() => {
            setOpenList((v) => !v);
            if (!openList) void lijst.refetch();
          }}
        >
          {openList ? "Close" : huidige ? "Change" : "Link one"}
        </Button>
      </div>

      <p className="mt-2 text-xs text-[var(--txt-2)]">
        {huidige ? (
          <>
            Linked to <b>{huidige.name}</b> — the live balance is read from
            there, and it caps what can be withdrawn.
          </>
        ) : (
          <>
            Not linked. The withdrawal ceiling falls back to what we funded,
            and the balance has to be checked by hand.
          </>
        )}
      </p>

      {openList ? (
        <div className="mt-3">
          {lijst.isPending ? (
            <p className="text-xs text-[var(--faint)]">
              Asking the supplier…
            </p>
          ) : lijst.isError ? (
            <p className="flex items-start gap-2 text-xs text-[var(--danger)]">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              {/* De fout van de leverancier, want dit is een adminscherm
                  en de admin moet weten of het aan de sleutel ligt of
                  aan hun kant. */}
              <span>{(lijst.error as Error).message}</span>
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search by name or platform id"
                  className="h-8 w-full rounded-lg border border-[var(--line-2)] bg-[var(--panel)] px-2 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => void lijst.refetch()}
                  aria-label="Refresh the list"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1.5 text-[0.68rem] text-[var(--faint)]">
                {/* Het TOTAAL erbij, niet alleen wat er staat: zonder dat
                    ziet een gefilterde lijst er hetzelfde uit als een
                    afgekapte. */}
                {zichtbaar.length} of {lijst.data?.total ?? 0} at the supplier
              </p>

              <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--line)]">
                {zichtbaar.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--faint)]">
                    Nothing matches that.
                  </p>
                ) : (
                  zichtbaar.map((a) => {
                    const vanIemandAnders =
                      !!a.alreadyLinkedTo &&
                      a.alreadyLinkedTo !== adAccountName;
                    const ditIsHem = a.alreadyLinkedTo === adAccountName;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={koppel.isPending || vanIemandAnders}
                        onClick={() => koppel.mutate(a.id)}
                        className="flex w-full items-center gap-2 border-b border-[var(--line)] px-2.5 py-2 text-left last:border-b-0 hover:bg-[var(--primary-tint)] disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-[var(--ink)]">
                            {a.name}
                          </span>
                          <span className="block truncate text-[0.66rem] text-[var(--faint)]">
                            {a.platformAccountId || "no platform id"} ·{" "}
                            {a.status}
                            {vanIemandAnders ? (
                              <> · already on {a.alreadyLinkedTo}</>
                            ) : ditIsHem ? (
                              <> · linked to this one</>
                            ) : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--ink)]">
                          {formatCurrency(a.balance, a.currency || "USD")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              {huidige ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 gap-1.5 px-2 text-xs text-[var(--danger)]"
                  disabled={koppel.isPending}
                  onClick={() => koppel.mutate(null)}
                >
                  <Link2Off className="h-3.5 w-3.5" />
                  Unlink
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
