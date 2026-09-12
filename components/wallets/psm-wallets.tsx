"use client";

import { DATE_FORMAT } from "@/lib/constants";
import { useAppContext } from "@/context/app-provider";
import { WalletWithAdvertiser } from "@/lib/types/wallet";
import dayjs from "dayjs";
import { Eye, Pencil, Search, SlidersHorizontal, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import WalletDetailsSheet from "./wallet-details-sheet";
import WalletEditDialog from "./wallet-edit-dialog";
import WalletMinTopupDialog from "./wallet-min-topup-dialog";
import useWallets from "./use-wallets";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const sortOptions = [
  { label: "Sort: Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "USD balance (high to low)", value: "usd-desc" },
  { label: "USD balance (low to high)", value: "usd-asc" },
  { label: "EUR balance (high to low)", value: "eur-desc" },
  { label: "EUR balance (low to high)", value: "eur-asc" },
];

const advName = (w: WalletWithAdvertiser) =>
  w.advertiser?.profile?.full_name ?? "Unknown";

// Admin wallets ledger, mockup look. Reuses the real useWallets data hook
// and the real details / edit-balances (wallet_admin_adjust) / min-topup
// dialogs — presentation only, no new mutations.
export default function PsmWallets() {
  const { wallets, isLoading, isError, error } = useWallets();
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [editingWallet, setEditingWallet] =
    useState<WalletWithAdvertiser | null>(null);
  const [minTopupWallet, setMinTopupWallet] =
    useState<WalletWithAdvertiser | null>(null);

  const filteredWallets = useMemo(() => {
    if (!search.trim()) return wallets;
    const term = search.trim().toLowerCase();
    return wallets.filter((wallet) => {
      const clientCode = wallet.advertiser?.tenant_client_code ?? "";
      const name = wallet.advertiser?.profile?.full_name ?? "";
      const email = wallet.advertiser?.profile?.email ?? "";
      const id = wallet.id ?? "";
      return [clientCode, name, email, id].some((value) =>
        String(value).toLowerCase().includes(term),
      );
    });
  }, [wallets, search]);

  const sortedWallets = useMemo(() => {
    const items = [...filteredWallets];
    const getAmount = (value: number | string | null | undefined) => {
      const num = Number(value ?? 0);
      return Number.isNaN(num) ? 0 : num;
    };
    switch (sort) {
      case "oldest":
        return items.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      case "usd-desc":
        return items.sort(
          (a, b) => getAmount(b.usd_balance) - getAmount(a.usd_balance),
        );
      case "usd-asc":
        return items.sort(
          (a, b) => getAmount(a.usd_balance) - getAmount(b.usd_balance),
        );
      case "eur-desc":
        return items.sort(
          (a, b) => getAmount(b.eur_balance) - getAmount(a.eur_balance),
        );
      case "eur-asc":
        return items.sort(
          (a, b) => getAmount(a.eur_balance) - getAmount(b.eur_balance),
        );
      case "newest":
      default:
        return items.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    }
  }, [filteredWallets, sort]);

  const total = sortedWallets.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, pageCount);
  const paginatedWallets = sortedWallets.slice(
    (safePage - 1) * perPage,
    safePage * perPage,
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Wallets</h1>
          <p>Review advertiser balances, activity, and wallet status.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search client, advertiser, or wallet ID"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load wallets. {(error as Error)?.message ?? String(error)}
          </p>
        </div>
      ) : paginatedWallets.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th>Reference</th>
                  <th className="r">EUR Balance</th>
                  <th className="r">USD Balance</th>
                  <th>Created</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedWallets.map((wallet) => (
                  <tr key={wallet.id}>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <span
                          className="ci b"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Wallet />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>
                            {advName(wallet)}
                          </div>
                          <div
                            style={{
                              color: "var(--faint)",
                              fontSize: ".8rem",
                            }}
                          >
                            {wallet.advertiser?.tenant_client_code ?? "—"}
                            {wallet.advertiser?.profile?.email
                              ? ` · ${wallet.advertiser.profile.email}`
                              : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="mono">
                      {wallet.reference_no ?? "—"}
                    </td>
                    <td className="r mono">{formatAmount(wallet.eur_balance)}</td>
                    <td className="r mono">{formatAmount(wallet.usd_balance)}</td>
                    <td>
                      {wallet.updated_at
                        ? dayjs(wallet.updated_at).format(DATE_FORMAT)
                        : "—"}
                    </td>
                    <td className="r">
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          className="btn ghost sm"
                          onClick={() => setEditingWallet(wallet)}
                        >
                          <Pencil /> Edit
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={() => setSelectedWalletId(wallet.id)}
                        >
                          <Eye /> Details
                        </button>
                        {isAdmin && (
                          <button
                            className="btn ghost sm"
                            onClick={() => setMinTopupWallet(wallet)}
                          >
                            <SlidersHorizontal /> Min amount
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No wallets found.
          </p>
        </div>
      )}

      {!isLoading && !isError && total > perPage && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <span className="muted" style={{ fontSize: ".85rem" }}>
            Page {safePage} of {pageCount}
          </span>
          <button
            className="btn ghost sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            className="btn ghost sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      <WalletDetailsSheet
        open={selectedWalletId !== null}
        walletId={selectedWalletId}
        onOpenChange={(open) => {
          if (!open) setSelectedWalletId(null);
        }}
      />

      <WalletEditDialog
        open={editingWallet !== null}
        wallet={editingWallet}
        onOpenChange={(open) => {
          if (!open) setEditingWallet(null);
        }}
      />

      <WalletMinTopupDialog
        open={minTopupWallet !== null}
        wallet={minTopupWallet}
        onOpenChange={(open) => {
          if (!open) setMinTopupWallet(null);
        }}
      />
    </div>
  );
}
