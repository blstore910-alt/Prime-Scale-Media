/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import TablePagination from "@/components/ui/table-pagination";
import { PLATFORMS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { safeErrorMessage } from "@/lib/pure-error";
import { useQuery } from "@tanstack/react-query";
import { Parser } from "json2csv";
import {
  Check,
  ClipboardList,
  Eye,
  FileDown,
  Filter,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import CreateTopupDialog from "../topups/create-topup-dialog";
import BulkTopupAdAccountsDialog from "../topups/bulk-ad-accounts-topup-dialog";
import { Button } from "../ui/button";
import AdvertiserAccountCard from "./advertiser-account-card";
import { AccountDetailsSheet } from "./account-details-sheet";
import CreateAccountDialog from "./create-account-dialog";
import { useAppContext } from "@/context/app-provider";
import RequestAdAccountDialog from "./request-ad-account-dialog";
import AdvertiserAdAccountRequestsDialog from "../ad-account-requests/advertiser-ad-account-requests-dialog";
import UpdateAccountDialog from "./update-account-dialog";
import AccountMinTopupDialog from "./account-min-topup-dialog";
import useUpdateAccount from "./use-update-account";

// Admin Ad Accounts monolith, ported to the mockup look (.psmapp shell,
// injected by AdminShell). Reuses the exact data hooks, search/platform/
// status/fee filters, pagination, and every dialog (create / edit / set
// min-topup / details / topup) — presentation only, no new data writes.
// The advertiser branch is kept intact below (the router redirects
// advertisers to the single-page app, so it is not normally reached, but
// nothing is dropped).
export default function AccountsTable() {
  const { profile } = useAppContext();
  const supabase = createClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );

  const [account, setAccount] = useState<AdAccount | null>(null);
  const [accountToEdit, setAccountToEdit] = useState<AdAccount | null>(null);
  const [accountToMinTopup, setAccountToMinTopup] = useState<AdAccount | null>(
    null,
  );
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "10", 10) || 10;
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);

  // client-side controls
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [maxFee, setMaxFee] = useState<number>(100);
  const [filterOpen, setFilterOpen] = useState(false);

  // "You have none" and "your filters match none" are different facts and
  // must read differently — otherwise a stray filter looks like data loss.
  const resetFilters = () => {
    setSearch("");
    setPlatformFilter(null);
    setStatusFilter(null);
    setMaxFee(100);
  };

  const {
    data: accountsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    // No page/perPage in the key. This query deliberately fetches the whole
    // set once, because search, platform, status and fee filtering all happen
    // in the browser below (and paging is a client-side slice). Keying on the
    // page meant every pagination click minted a fresh cache entry, so
    // staleTime never applied and each click was another full-table round
    // trip for the same rows it already had.
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select(
          `*,
          advertiser:advertisers(
            tenant_client_code,
            profile:user_profiles(
              full_name,
              email
            )
          )
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { items: data ?? [], total: (data ?? []).length };
    },
  });

  const accounts = accountsData?.items ?? [];

  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const { data: advertiserAccounts, isLoading: isAdvertiserAccountsLoading } =
    useQuery<AdAccount[]>({
      queryKey: ["advertiser-ad-accounts", advertiserId],
      queryFn: async () => {
        if (!advertiserId) return [];
        const { data, error } = await supabase
          .from("ad_accounts")
          .select("*")
          .eq("advertiser_id", advertiserId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as AdAccount[];
      },
      enabled: Boolean(advertiserId) && profile?.role === "advertiser",
    });

  // client-side filtering & searching
  const filteredAccounts = accounts.filter((a: any) => {
    // search across client code, account name, advertiser name
    const clientCode = String(
      a.advertiser?.tenant_client_code ?? "",
    ).toLowerCase();
    const accountName = String(a.name ?? "").toLowerCase();
    const advName = String(
      a.advertiser?.profile?.full_name ?? "",
    ).toLowerCase();
    const q = search.trim().toLowerCase();
    const matchesSearch =
      q === "" ||
      clientCode.includes(q) ||
      accountName.includes(q) ||
      advName.includes(q);

    const matchesPlatform =
      !platformFilter || platformFilter === "all"
        ? true
        : a.platform === platformFilter;

    const matchesStatus =
      !statusFilter || statusFilter === "all"
        ? true
        : a.status === statusFilter;

    const matchesFee = typeof a.fee === "number" ? a.fee <= maxFee : true;

    return matchesSearch && matchesPlatform && matchesStatus && matchesFee;
  });

  const paginatedAccounts = filteredAccounts.slice(
    (page - 1) * perPage,
    (page - 1) * perPage + perPage,
  );

  const totalFiltered = filteredAccounts.length;
  // Distinguishes the two empty states below.
  const hasAnyAccounts = accounts.length > 0;

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));
    if (page && page > 1) params.set("page", String(page));
    else params.delete("page");
    if (perPage && perPage !== 10) params.set("perPage", String(perPage));
    else params.delete("perPage");
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage]);

  const handleAccountClick = (id: string) => {
    setSelectedAccountId((prev) => (prev === id ? null : id));
  };

  const handleDownload = async () => {
    const fields = [
      { label: "ID", value: "id" },
      { label: "Name", value: "name" },
      { label: "Platform", value: "platform" },
      { label: "Status", value: "status" },
      { label: "Fee", value: "fee" },
      { label: "Fee Status", value: "fee_status" },
      { label: "Advertiser Name", value: "advertiser.profile.full_name" },
      { label: "Advertiser Email", value: "advertiser.profile.email" },
      { label: "Start Date", value: "start_date" },
      { label: "Created At", value: "created_at" },
      { label: "Updated At", value: "updated_at" },
    ];

    const opts = { fields, withBOM: true };
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select(
          "*, advertiser:advertisers(*, profile:user_profiles(*)), tenant:tenants(*)",
        );
      if (error) throw error;
      const parser = new Parser(opts);
      const csv = parser.parse(data);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(safeErrorMessage(error));
    } finally {
      setDownloadingCSV(false);
    }
  };

  const isAdvertiser = profile?.role === "advertiser";
  const hasAdvertiserAccounts = (advertiserAccounts?.length ?? 0) > 0;

  // Shared dialogs — mounted regardless of role; they portal outside the
  // .psmapp shell, so they keep working unchanged.
  const dialogs = (
    <>
      <CreateTopupDialog
        account={account}
        open={account !== null}
        setOpen={() => setAccount(null)}
      />
      <UpdateAccountDialog
        account={accountToEdit}
        open={accountToEdit !== null}
        onOpenChange={(open) => {
          if (!open) setAccountToEdit(null);
        }}
      />
      <AccountMinTopupDialog
        account={accountToMinTopup}
        open={accountToMinTopup !== null}
        onOpenChange={(open) => {
          if (!open) setAccountToMinTopup(null);
        }}
      />
      <AccountDetailsSheet
        accountId={selectedAccountId}
        open={selectedAccountId !== null}
        setOpen={() => setSelectedAccountId(null)}
      />
    </>
  );

  // ------------------------------------------------------------------
  // Advertiser view (legacy). Kept intact so no advertiser flow is lost.
  // ------------------------------------------------------------------
  if (isAdvertiser) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
        <div className="flex sm:items-center gap-2 sm:gap-3">
          <Input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:max-w-xs"
          />

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="sm:w-auto sm:px-3"
                  aria-label="Filters"
                >
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Filters</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-sm mb-1 block">Platform</label>
                    <Select onValueChange={(v) => setPlatformFilter(v || null)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {PLATFORMS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm mb-1 block">Status</label>
                    <Select onValueChange={(v) => setStatusFilter(v || null)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">active</SelectItem>
                        <SelectItem value="paused">paused</SelectItem>
                        <SelectItem value="inactive">inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm mb-1 block">
                      Max Fee: {maxFee}%
                    </label>
                    <div className="w-full">
                      <Slider
                        value={[maxFee]}
                        min={0}
                        max={100}
                        onValueChange={(v: number[]) => setMaxFee(v[0] ?? 0)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPlatformFilter(null);
                        setStatusFilter(null);
                        setMaxFee(100);
                      }}
                    >
                      Reset
                    </Button>
                    <Button size="sm" onClick={() => setFilterOpen(false)}>
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {!isAdvertiserAccountsLoading && hasAdvertiserAccounts && (
              <BulkTopupAdAccountsDialog accounts={advertiserAccounts ?? []} />
            )}
            <RequestAdAccountDialog>
              <Button
                size="icon"
                className="sm:w-auto sm:px-3"
                aria-label="Request Ad Account"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Request New</span>
              </Button>
            </RequestAdAccountDialog>
            <AdvertiserAdAccountRequestsDialog>
              <Button
                variant="outline"
                size="icon"
                className="sm:w-auto sm:px-3"
                aria-label="View Requests"
              >
                <ClipboardList className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Pending Requests</span>
              </Button>
            </AdvertiserAdAccountRequestsDialog>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="animate-pulse rounded-lg border p-3">
                <div className="h-4 bg-muted rounded w-1/3 mb-2" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div>
            <p className="text-center text-destructive">{error?.message}</p>
          </div>
        ) : paginatedAccounts.length > 0 ? (
          <div className="flex flex-col gap-3">
            {paginatedAccounts.map((acc: any) => (
              <AdvertiserAccountCard
                key={acc.id}
                account={acc}
                onView={handleAccountClick}
                onAddTopup={setAccount}
              />
            ))}
          </div>
        ) : (
          <div className="h-48 text-center flex flex-col items-center justify-center gap-4">
            <p>No Ad Accounts Found</p>
            <div className="flex items-center gap-2">
              <RequestAdAccountDialog />
              <AdvertiserAdAccountRequestsDialog />
            </div>
          </div>
        )}

        <div className="p-4 pb-16">
          <TablePagination
            total={totalFiltered}
            page={page}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>

        {dialogs}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Admin view — mockup look.
  // ------------------------------------------------------------------
  const hasFilters =
    Boolean(platformFilter) ||
    Boolean(statusFilter) ||
    maxFee < 100 ||
    Boolean(search.trim());

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Ad Accounts</h1>
          <p>
            Create accounts, assign advertisers, set fees, and manage account
            status.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn ghost"
            onClick={handleDownload}
            aria-label="Download CSV"
          >
            {downloadingCSV ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileDown />
            )}
            Download CSV
          </button>
          <CreateAccountDialog>
            <button className="btn grad" aria-label="Create new account">
              <Plus /> Create New
            </button>
          </CreateAccountDialog>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search client, account or advertiser…"
          />
        </label>
        <select
          value={platformFilter ?? "all"}
          onChange={(e) => {
            setPlatformFilter(e.target.value === "all" ? null : e.target.value);
            setPage(1);
          }}
          aria-label="Platform"
        >
          <option value="all">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter ?? "all"}
          onChange={(e) => {
            setStatusFilter(e.target.value === "all" ? null : e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="inactive">Inactive</option>
        </select>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontFamily: "var(--bd)",
            fontWeight: 600,
            fontSize: ".84rem",
            color: "var(--muted)",
            border: "1px solid var(--line-2)",
            borderRadius: 11,
            padding: "8px 13px",
            background: "var(--panel)",
          }}
        >
          Max fee&nbsp;
          <b style={{ color: "var(--ink)" }}>{maxFee}%</b>
          <input
            type="range"
            min={0}
            max={100}
            value={maxFee}
            onChange={(e) => {
              setMaxFee(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Maximum fee"
            style={{ accentColor: "var(--primary)", width: 120 }}
          />
        </label>
        {hasFilters && (
          <button
            className="btn ghost sm"
            onClick={() => {
              setPlatformFilter(null);
              setStatusFilter(null);
              setMaxFee(100);
              setSearch("");
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load accounts.{" "}
            {(error as Error)?.message ?? String(error)}
          </p>
        </div>
      ) : paginatedAccounts.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Client Code</th>
                  <th>Account Name</th>
                  <th>Advertiser</th>
                  <th>Platform</th>
                  <th className="r">Fee</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAccounts.map((acc: any) => (
                  <PsmAdminAccountRow
                    key={acc.id}
                    account={acc}
                    onRowClick={handleAccountClick}
                    onEdit={setAccountToEdit}
                    onSetMinTopup={setAccountToMinTopup}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* An empty screen is the first one a new tenant sees, so it should
           teach rather than report. It also has to distinguish "you have
           none yet" from "your filters match none" — otherwise someone with
           a stray filter concludes their accounts are gone. */
        <div className="card" style={{ textAlign: "center", padding: "34px 20px" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>
            {hasAnyAccounts
              ? "No ad accounts match these filters"
              : "No ad accounts yet"}
          </p>
          <p
            className="muted"
            style={{ margin: "6px auto 16px", maxWidth: 380, fontSize: ".9rem" }}
          >
            {hasAnyAccounts
              ? "Clear the search, platform, status or max-fee filter to see the rest."
              : "Allocate one from the Account Pool, or create it by hand if it isn't supplier-managed."}
          </p>
          {hasAnyAccounts ? (
            <button className="btn ghost sm" onClick={resetFilters}>
              Clear filters
            </button>
          ) : (
            <Link className="btn sm" href="/account-pool">
              Open the Account Pool
            </Link>
          )}
        </div>
      )}

      <TablePagination
        total={totalFiltered}
        page={page}
        perPage={perPage}
        onPageChange={(p) => setPage(p)}
      />

      {dialogs}
    </div>
  );
}

// Admin ad-account row in the mockup look. Ports account-row.tsx faithfully:
// clickable row (opens details), inline fee-edit machinery + the
// useUpdateAccount mutation, and the Edit / Set Topup Limit / View actions.
function PsmAdminAccountRow({
  account,
  onRowClick,
  onEdit,
  onSetMinTopup,
}: {
  account: AdAccount;
  onRowClick: (id: string) => void;
  onEdit: (account: AdAccount) => void;
  onSetMinTopup: (account: AdAccount) => void;
}) {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const { updateAccount } = useUpdateAccount();
  const initialFee = account.fee;
  const [fee, setFee] = useState<number | string>(account.fee);
  const [editing, setEditing] = useState({ fee: false });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setIsDirty(fee !== initialFee);
  }, [fee, initialFee]);

  const handleFeeEdit = (e: React.MouseEvent<HTMLTableCellElement>) => {
    e.stopPropagation();
    if (!isAdmin) return;
    setEditing({ ...editing, fee: true });
  };

  const updateFee = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsDirty(false);
    updateAccount({
      id: account.id,
      payload: {
        fee: +fee,
      },
    });
  };

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    // Ignore portal-originated events (e.g. dialog clicks bubbling through the React tree).
    if (!e.currentTarget.contains(e.target as Node)) return;
    onRowClick(account.id);
  };

  const platformLabel =
    PLATFORMS.find((p) => p.value === account.platform)?.label ??
    account.platform;

  const statusCls =
    account.status === "active"
      ? "ok"
      : account.status === "paused"
        ? "pend"
        : "due";

  return (
    <tr onClick={handleRowClick} style={{ cursor: "pointer" }}>
      <td data-label="Client Code" className="mono">{account.advertiser?.tenant_client_code || "—"}</td>
      <td data-label="Account Name" style={{ fontWeight: 600 }}>{account.name}</td>
      <td data-label="Advertiser">{account.advertiser?.profile?.full_name || "—"}</td>
      <td data-label="Platform">
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 9 }}
        >
          <span className="pfi">
            <Monitor />
          </span>
          {platformLabel}
        </span>
      </td>
      <td
        data-label="Fee"
        className="r"
        onClick={handleFeeEdit}
        style={{ cursor: isAdmin ? "pointer" : "default" }}
      >
        {fee}%
      </td>
      <td data-label="Currency">{account.currency || "N/A"}</td>
      <td data-label="Status">
        <span
          className={`badge ${statusCls}`}
          style={{ textTransform: "capitalize" }}
        >
          {account.status}
        </span>
      </td>
      <td data-label="Actions" className="r">
        {isDirty ? (
          <div
            style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
          >
            <button
              className="btn ghost sm"
              aria-label="Save fee"
              onClick={updateFee}
            >
              <Check />
            </button>
            <button
              className="btn ghost sm"
              aria-label="Cancel fee edit"
              onClick={(e) => {
                e.stopPropagation();
                setFee(account.fee);
                setIsDirty(false);
              }}
            >
              <X />
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            {isAdmin && (
              <button
                className="btn ghost sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(account);
                }}
              >
                <Pencil /> Edit
              </button>
            )}
            {isAdmin && (
              <button
                className="btn ghost sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetMinTopup(account);
                }}
              >
                <SlidersHorizontal /> Set Topup Limit
              </button>
            )}
            <button
              className="btn ghost sm"
              onClick={(e) => {
                e.stopPropagation();
                onRowClick(account.id);
              }}
            >
              <Eye /> View
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
