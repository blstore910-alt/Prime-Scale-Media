"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { DATE_FORMAT, DATE_TIME_FORMAT } from "@/lib/constants";
import { WalletWithAdvertiser } from "@/lib/types/wallet";
import { useAppContext } from "@/context/app-provider";
import dayjs from "dayjs";
import {
  AlertCircle,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
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
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "USD balance (high to low)", value: "usd-desc" },
  { label: "USD balance (low to high)", value: "usd-asc" },
  { label: "EUR balance (high to low)", value: "eur-desc" },
  { label: "EUR balance (low to high)", value: "eur-asc" },
];

export default function WalletsTable() {
  const { wallets, isLoading, isError, error } = useWallets();
  const { profile, isSuperAdmin } = useAppContext();
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
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
  const paginatedWallets = sortedWallets.slice(
    (page - 1) * perPage,
    page * perPage,
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Wallets</h2>
          <p className="text-sm text-muted-foreground">
            Review advertiser balances, activity, and wallet status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search client, advertiser, or wallet ID"
              className="pl-8 w-full sm:w-64"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isTabletScreen ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Client Code</TableHead>
                <TableHead>Advertiser</TableHead>
                <TableHead>USD Balance</TableHead>
                <TableHead>EUR Balance</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: 7 }).map((__, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">Failed to load wallets.</p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedWallets.length ? (
                paginatedWallets.map((wallet) => (
                  <WalletRow
                    key={wallet.id}
                    wallet={wallet}
                    onView={() => setSelectedWalletId(wallet.id)}
                    onEdit={() => setEditingWallet(wallet)}
                    onSetMinTopup={() => setMinTopupWallet(wallet)}
                    isAdmin={isAdmin}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No wallets found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : isError ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="flex flex-row items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <CardTitle className="text-base">
                  {(error as Error)?.message ?? "Failed to load wallets"}
                </CardTitle>
              </CardHeader>
            </Card>
          ) : paginatedWallets.length ? (
            paginatedWallets.map((wallet) => (
              <Card key={wallet.id}>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">
                    {wallet.advertiser?.tenant_client_code ?? "-"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {wallet.advertiser?.profile?.full_name ?? "Unknown"}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">USD Balance</span>
                    <span>{formatAmount(wallet.usd_balance)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">EUR Balance</span>
                    <span>{formatAmount(wallet.eur_balance)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Updated</span>
                    <span>
                      {wallet.updated_at
                        ? dayjs(wallet.updated_at).format(DATE_TIME_FORMAT)
                        : "-"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedWalletId(wallet.id)}
                  >
                    View details
                  </Button>
                  {isSuperAdmin && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingWallet(wallet)}
                    >
                      Edit balances
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMinTopupWallet(wallet)}
                    >
                      Set Minimum Amount
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No wallets found.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="p-4">
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      </div>

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

function WalletRow({
  wallet,
  onView,
  onEdit,
  onSetMinTopup,
  isAdmin,
}: {
  wallet: WalletWithAdvertiser;
  onView: () => void;
  onEdit: () => void;
  onSetMinTopup: () => void;
  isAdmin: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {wallet.advertiser?.tenant_client_code ?? "-"}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{wallet.advertiser?.profile?.full_name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">
            {wallet.advertiser?.profile?.email ?? "-"}
          </span>
        </div>
      </TableCell>
      <TableCell>{formatAmount(wallet.usd_balance)}</TableCell>
      <TableCell>{formatAmount(wallet.eur_balance)}</TableCell>
      <TableCell>
        {wallet.updated_at ? dayjs(wallet.updated_at).format(DATE_FORMAT) : "-"}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            aria-label="Edit wallet balances"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onView}
            aria-label="View wallet details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onSetMinTopup}>
                  Set Minimum Amount
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
