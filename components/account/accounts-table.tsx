/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { PLATFORMS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { useQuery } from "@tanstack/react-query";
import { Parser } from "json2csv";
import { ClipboardList, FileDown, Filter, Loader2, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import CreateTopupDialog from "../topups/create-topup-dialog";
import BulkTopupAdAccountsDialog from "../topups/bulk-ad-accounts-topup-dialog";
import { Button } from "../ui/button";
import AccountCard from "./account-card";
import AdvertiserAccountCard from "./advertiser-account-card";
import { AccountDetailsSheet } from "./account-details-sheet";
import AccountRow from "./account-row";
import CreateAccountDialog from "./create-account-dialog";
import { useAppContext } from "@/context/app-provider";
import RequestAdAccountDialog from "./request-ad-account-dialog";
import AdvertiserAdAccountRequestsDialog from "../ad-account-requests/advertiser-ad-account-requests-dialog";
import UpdateAccountDialog from "./update-account-dialog";
import AccountMinTopupDialog from "./account-min-topup-dialog";

export default function AccountsTable() {
  const { profile } = useAppContext();
  const supabase = createClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const isTabletScreen = useMediaQuery("(min-width: 768px)");

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

  const {
    data: accountsData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["ad-accounts", page, perPage],
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
      console.error(error);
    } finally {
      setDownloadingCSV(false);
    }
  };

  const isAdvertiser = profile?.role === "advertiser";
  const hasAdvertiserAccounts = (advertiserAccounts?.length ?? 0) > 0;
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
      <div className="flex sm:items-center gap-2 sm:gap-3">
        <Input
          placeholder={
            isAdvertiser
              ? "Search accounts..."
              : "Search client, account or advertiser..."
          }
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full sm:max-w-xs"
        />

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <Popover>
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
                  <Button size="sm" onClick={() => {}}>
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {!isAdvertiser && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="sm:w-auto sm:px-3"
                onClick={handleDownload}
                aria-label="Download CSV"
              >
                {downloadingCSV ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                <span className="hidden sm:inline ml-1">Download CSV</span>
              </Button>
              <CreateAccountDialog />
            </>
          )}
          {isAdvertiser && (
            <>
              {!isAdvertiserAccountsLoading && hasAdvertiserAccounts && (
                <BulkTopupAdAccountsDialog
                  accounts={advertiserAccounts ?? []}
                />
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
                  <span className="hidden sm:inline ml-1">
                    Pending Requests
                  </span>
                </Button>
              </AdvertiserAdAccountRequestsDialog>
            </>
          )}
        </div>
      </div>
      {/* Advertiser Card View */}
      {isAdvertiser ? (
        isLoading ? (
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
            {paginatedAccounts.map((account: any) => (
              <AdvertiserAccountCard
                key={account.id}
                account={account}
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
        )
      ) : /* Admin Table / Mobile Card View */
      isTabletScreen ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Client Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Advertiser Name</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: 7 }).map((_, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">Failed to load accounts.</p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedAccounts.length > 0 ? (
                paginatedAccounts.map((account: any) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    onRowClick={handleAccountClick}
                    onAddTopup={setAccount}
                    onEdit={setAccountToEdit}
                    onSetMinTopup={setAccountToMinTopup}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p>No Ad Accounts Found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : isLoading ? (
        Array.from({ length: 5 }).map((_, idx) => (
          <div key={idx} className="animate-pulse">
            <div className="h-1p bg-muted"></div>
          </div>
        ))
      ) : isError ? (
        <div>
          <p className="text-center text-destructive">{error?.message}</p>
        </div>
      ) : accounts?.length ? (
        paginatedAccounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onView={handleAccountClick}
            onEdit={setAccountToEdit}
            onSetMinTopup={setAccountToMinTopup}
          />
        ))
      ) : (
        <div className="h-48 text-center flex flex-col items-center justify-center gap-4">
          <p>No Ad Accounts Found</p>
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
    </div>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
