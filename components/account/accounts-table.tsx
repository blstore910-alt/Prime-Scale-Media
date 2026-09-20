/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { toast } from "sonner";
import PsmSortFilter from "@/components/psm/sort-filter";
import { firstName } from "@/lib/display-name";
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
import TablePagination from "@/components/ui/table-pagination";
import { PLATFORMS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { safeErrorMessage } from "@/lib/pure-error";
import { csvSafe } from "@/lib/csv-safe";
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
import { useAccountSpend } from "@/hooks/use-account-spend";
import UserDetailsSheet from "@/components/admin/users/user-details-sheet";
import { CopyText } from "@/components/ui/copy-text";
import { adAccountStatusView } from "@/lib/ad-account-status";
import { downloadCsv } from "@/lib/download-blob";

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
  // Seeded from the URL so another screen can hand this one a subject:
  // the advertiser list links here with the client code, which is exactly
  // what the search below matches on. Local state afterwards — the admin
  // can clear or retype it like any other search.
  const [search, setSearch] = useState(searchParams?.get("q") ?? "");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  // Filtering on a fee ceiling was a filter nobody reaches for; SORTING by
  // fee is what you actually want when scanning a list of accounts. Numbers
  // are the useful sort keys here, so they lead.
  const [sort, setSort] = useState("newest");
  const [filterOpen, setFilterOpen] = useState(false);

  // The scrim catches clicks; Escape is the other way out of a panel, and
  // leaving it out is the difference between a control and a trap.
  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filterOpen]);

  // "You have none" and "your filters match none" are different facts and
  // must read differently — otherwise a stray filter looks like data loss.
  const resetFilters = () => {
    setSearch("");
    setPlatformFilter(null);
    setStatusFilter(null);
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
      // ── PAGED, BECAUSE THE CAP IS SILENT ────────────────────────
      //
      // There was no .limit(), which does not mean "all of them": it
      // means PostgREST's default ceiling of 1,000 rows, returned with
      // no error and no marker. Every filter, count and CSV on this
      // screen is computed in the browser from this array, so past a
      // thousand accounts the whole page would be quietly wrong -- the
      // tiles, the search, the export -- with nothing saying so.
      //
      // And a unique tiebreaker after created_at: Postgres gives no
      // defined order among rows sharing a timestamp, and a batch of
      // accounts created in the same second straddles a page boundary,
      // so a row could appear twice or vanish.
      const PAGE = 1000;
      const rows: unknown[] = [];
      for (let from = 0; from < 50_000; from += PAGE) {
        const { data, error } = await supabase
          .from("ad_accounts")
          .select(
            `*,
            advertiser:advertisers(
              tenant_client_code,
              profile:user_profiles(
                id,
                full_name,
                email
              )
            )
          `,
          )
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < PAGE) break;
      }
      return { items: rows, total: rows.length };
    },
  });

  const accounts = accountsData?.items ?? [];

  // What is on each account, and when it last moved. One query for the
  // whole page rather than one per row.
  // isLoading as well. The spend query pages top_ups AND
  // ad_account_withdrawals, so it is always slower than the accounts
  // list -- and for those one to four seconds an account holding
  // $48,500 read "Funded (USD) $0.00" with the tooltip "Nothing funded
  // on this account yet", indistinguishable from an empty account, on
  // the only balance figure an admin reads before approving a
  // withdrawal. It also drives the Status badge, which without it
  // declares every account opened over thirty days ago "Inactive —
  // never topped up".
  const {
    byAccount: spendByAccount,
    isError: spendBroken,
    isLoading: spendLoading,
  } = useAccountSpend(profile?.tenant_id);
  const spendError = spendBroken || spendLoading;
  // Every row judged against the SAME instant, so a list cannot show two
  // accounts on different sides of the 30-day line because it took a
  // moment to render.
  const nowMs = Date.now();

  // Clicking the ADVERTISER on a row opens that advertiser's own record —
  // the same sheet the Advertisers screen uses, with the PSM number, the
  // copyable email and the full company block. It was only reachable from
  // one screen, so from here you got the ACCOUNT's details and a thin
  // "Advertiser Information" section at the bottom of it.
  const [advProfileId, setAdvProfileId] = useState<string | null>(null);

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

    return matchesSearch && matchesPlatform && matchesStatus;
  });

  // Sorting happens after filtering and before paging. Numeric keys sort
  // numerically (a string compare would put 9% above 10%); text keys use
  // localeCompare so accented names land where a reader expects.
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const txt = (v: unknown) => String(v ?? "");
  const sortedAccounts = [...filteredAccounts].sort((a: any, b: any) => {
    switch (sort) {
      case "fee-desc":
        return num(b.fee) - num(a.fee);
      case "fee-asc":
        return num(a.fee) - num(b.fee);
      case "name-asc":
        return txt(a.name).localeCompare(txt(b.name));
      case "client-asc":
        return txt(a.advertiser?.tenant_client_code).localeCompare(
          txt(b.advertiser?.tenant_client_code),
        );
      case "oldest":
        return txt(a.created_at).localeCompare(txt(b.created_at));
      case "newest":
      default:
        return txt(b.created_at).localeCompare(txt(a.created_at));
    }
  });


  const paginatedAccounts = sortedAccounts.slice(
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
    // The flag existed, was reset, and was READ by the spinner — and
    // was never actually set, so the spinner was dead code and the
    // button was never disabled. An admin clicks, sees nothing happen,
    // and clicks again; each press fires a full unpaginated select.
    setDownloadingCSV(true);
    // ── EVERY CUSTOMER-CONTROLLED CELL GOES THROUGH csvSafe ───────────
    //
    // Excel and Sheets evaluate a cell that starts with = + - @ as a
    // formula. lib/csv-safe.ts exists for this and was used by two of the
    // nine exports; json2csv's default formatter only QUOTES, which does
    // not stop it. `full_name` is validated as min(2) and nothing else, so
    // a customer setting their name to =HYPERLINK(...) has that run when
    // an admin opens the file.
    //
    // Currency is here too: this is a mixed USD/EUR book and the column
    // simply was not exported, while "Fee" is a PERCENTAGE under a
    // money-shaped header. Both are labelled now.
    const fields = [
      { label: "ID", value: "id" },
      { label: "Name", value: (r: Record<string, unknown>) => csvSafe(r.name) },
      { label: "Platform", value: "platform" },
      { label: "Status", value: "status" },
      { label: "Currency", value: "currency" },
      { label: "Fee %", value: "fee" },
      { label: "Fee Status", value: "fee_status" },
      {
        label: "Advertiser Name",
        value: (r: Record<string, unknown>) =>
          csvSafe(
            (
              (r.advertiser as { profile?: { full_name?: unknown } } | null)
                ?.profile?.full_name
            ) ?? "",
          ),
      },
      {
        label: "Advertiser Email",
        value: (r: Record<string, unknown>) =>
          csvSafe(
            (
              (r.advertiser as { profile?: { email?: unknown } } | null)
                ?.profile?.email
            ) ?? "",
          ),
      },
      { label: "Start Date", value: "start_date" },
      { label: "Created At", value: "created_at" },
      { label: "Updated At", value: "updated_at" },
    ];

    const opts = { fields, withBOM: true };
    try {
      // ── WHAT YOU SEE IS WHAT YOU DOWNLOAD ───────────────────────
      //
      // This re-read the table with no filter at all, so an admin
      // looking at three Meta accounts for PSM0005 pressed Download and
      // got every ad account in the tenant -- truncated at PostgREST's
      // 1,000-row ceiling, in a file headed exactly like a complete
      // one. Search, platform, status and sort are applied in the
      // browser above, so the honest export is the array the screen is
      // already showing. It cannot disagree with the screen, and it
      // cannot be short without the screen being short too.
      const csv = new Parser(opts).parse(
        sortedAccounts as unknown as Record<string, unknown>[],
      );

      // It is the AD ACCOUNTS export. "users.csv" is what an admin then
      // emails to someone, or opens next to the real users export.
      // downloadCsv, because this was a detached anchor with a URL
      // revoked on the next line: Firefox ignored the click outright and
      // the button did nothing, silently. See lib/download-blob.
      downloadCsv(csv, "ad-accounts.csv");
    } catch (error) {
      // And say so. A failure that only reaches the console is a
      // button that does nothing, from where the operator is sitting.
      toast.error("Couldn't build the export", {
        description: safeErrorMessage(error),
      });
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
        onSetMinTopup={isAdvertiser ? undefined : setAccountToMinTopup}
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
                        {/* The statuses that are actually STORED.
                            "inactive" was offered and can never match — it
                            is derived from the top-up history, nothing
                            writes it — so the filter returned an empty list
                            while the table visibly showed accounts badged
                            Inactive. Meanwhile disabled and banned, the two
                            an admin can actually set, could not be filtered
                            for at all. */}
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                        <SelectItem value="banned">Banned</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPlatformFilter(null);
                        setStatusFilter(null);
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

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* Header actions sit ON the title row, the same shape the dashboard
          uses. Stacked underneath, the title block plus a full-width button
          row measured 99px against 48px on every other admin page — a whole
          extra record's worth of screen, on the one page where you want to
          see records. The CSV label collapses to its icon on a phone: it is
          the secondary action and its icon is unambiguous. */}
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Ad Accounts</h1>
          <p>Assign accounts and set fees.</p>
        </div>
        <div className="pacts">
          <button
            className="btn ghost"
            onClick={handleDownload}
            disabled={downloadingCSV}
            aria-label="Download CSV"
            title={downloadingCSV ? "Building the file…" : "Download CSV"}
          >
            {downloadingCSV ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileDown />
            )}
            <span className="blab">Download CSV</span>
          </button>
          <CreateAccountDialog>
            <button className="btn grad" aria-label="Create new account">
              <Plus /> <span className="blab">Create New</span>
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
            placeholder="Search accounts…"
          />
        </label>
        {/* Everything that shapes the list — sort and both filters — lives
            behind ONE control, with a count so you can see at a glance that
            something is narrowing the results. A row of loose selects reads
            as a form and, on a phone, ate three full-width lines. */}
        <PsmSortFilter
          sort={sort}
          onSortChange={(v) => {
            setSort(v);
            setPage(1);
          }}
          sortOptions={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "fee-desc", label: "Fee — highest first" },
            { value: "fee-asc", label: "Fee — lowest first" },
            { value: "name-asc", label: "Account name A → Z" },
            { value: "client-asc", label: "Client code A → Z" },
          ]}
          filters={[
            {
              id: "platform",
              label: "Platform",
              value: platformFilter ?? "all",
              onChange: (v) => {
                setPlatformFilter(v === "all" ? null : v);
                setPage(1);
              },
              options: [
                { value: "all", label: "All platforms" },
                ...PLATFORMS.map((pl) => ({ value: pl.value, label: pl.label })),
              ],
            },
            {
              id: "status",
              label: "Status",
              value: statusFilter ?? "all",
              onChange: (v) => {
                setStatusFilter(v === "all" ? null : v);
                setPage(1);
              },
              options: [
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
                // Stored statuses only — "inactive" is derived from the
                // top-up history and matches no row. See the note on the
                // advertiser filter above.
                { value: "disabled", label: "Disabled" },
                { value: "banned", label: "Banned" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            resetFilters();
            setSort("newest");
            setPage(1);
          }}
        />
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
                  {/* "Funded", not "Spend". This is the money PUT ON the
                      account minus what has been withdrawn from it — it
                      has nothing to do with what was spent on ads, which
                      we do not hold. Calling it Spend made an admin read
                      it as the customer's advertising, when the question
                      it actually answers is "is there anything on here". */}
                  <th className="r nw">Funded (USD)</th>
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
                    spend={spendByAccount[acc.id]}
                    spendUnknown={spendError}
                    nowMs={nowMs}
                    onOpenAdvertiser={setAdvProfileId}
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
              ? "Clear the search, platform or status filter to see the rest."
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

      {/* The advertiser behind a row, in the same sheet the Advertisers
          screen uses. */}
      <UserDetailsSheet
        open={!!advProfileId}
        profileId={advProfileId}
        onOpenChange={() => setAdvProfileId(null)}
      />
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
  spend,
  spendUnknown = false,
  nowMs,
  onOpenAdvertiser,
}: {
  account: AdAccount;
  onRowClick: (id: string) => void;
  onEdit: (account: AdAccount) => void;
  spend?: { usd: number; count: number; lastAt: string | null };
  spendUnknown?: boolean;
  nowMs: number;
  onOpenAdvertiser: (profileId: string) => void;
}) {
  const { profile, isSuperAdmin } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const { updateAccount, isPending: savingFee } = useUpdateAccount();
  const initialFee = account.fee;
  const [fee, setFee] = useState<number | string>(account.fee);
  const [editing, setEditing] = useState({ fee: false });
  const [isDirty, setIsDirty] = useState(false);

  // Compare NUMERICALLY. The input gives a string, the row gives a number,
  // so after a successful save "12" !== 12 kept isDirty true — the row stayed
  // in Save/Cancel mode forever and its Edit and View buttons never came
  // back. An empty box is not "changed to nothing", it is nothing yet.
  useEffect(() => {
    const typed = String(fee).trim();
    setIsDirty(typed !== "" && Number(typed) !== Number(initialFee));
  }, [fee, initialFee]);

  // When the row refetches after a save, adopt the value the server now
  // holds. Without this the local string lingers and fights the fresh row.
  useEffect(() => {
    setFee(initialFee);
  }, [initialFee]);

  const handleFeeEdit = (e: React.MouseEvent<HTMLTableCellElement>) => {
    e.stopPropagation();
    // The fee is a price and prices are the owner's -- the server now
    // says so too. An employee admin opening this cell would type a
    // number and then be refused, which is worse than not opening.
    if (!isAdmin || !isSuperAdmin) return;
    setEditing({ ...editing, fee: true });
  };

  const updateFee = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // An empty box used to write 0. `+""` is 0, so clearing the field and
    // pressing the tick — which is what someone does when they mean to
    // abandon the edit — silently set the account's fee to 0%, and that fee
    // is our own margin. A blank is not a zero; if you want 0% you type it.
    const typed = String(fee).trim();
    const parsed = Number(typed);
    if (typed === "" || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Enter a fee between 0 and 100.");
      return;
    }
    // Leave edit mode straight away — the save nearly always succeeds and
    // waiting on the round trip makes the cell feel stuck. But the cell then
    // renders LOCAL state, so if the write is refused it would sit there
    // showing a fee the account does not have. Put the old value back when
    // that happens; the hook raises the toast that says why.
    // ── DO NOT CLOSE THE EDITOR BEFORE THE WRITE LANDS ──────────────
    //
    // This set isDirty false and closed the cell first, and React
    // batches all three -- so the first render where `savingFee` is
    // true is the render in which the button is already unmounted.
    // `disabled={savingFee}` could never evaluate on a mounted node,
    // and the cell printed local state with nothing saying a write was
    // in flight.
    //
    // The editor now stays until the mutation settles. The optimistic
    // close was there because the round trip makes the cell feel stuck;
    // the disabled tick and the spinner are what that was really asking
    // for, and they only work if the row is still there.
    updateAccount(
      {
        id: account.id,
        payload: { fee: parsed },
        // The fee IS the margin, and this cell is the one place two
        // admins are most likely to be looking at the same number.
        ifUpdatedAt: account.updated_at,
      },
      {
        onError: () => {
          setFee(initialFee);
          setIsDirty(false);
          setEditing({ fee: false });
        },
        onSuccess: () => {
          setIsDirty(false);
          setEditing({ fee: false });
        },
      },
    );
  };

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    // Ignore portal-originated events (e.g. dialog clicks bubbling through the React tree).
    if (!e.currentTarget.contains(e.target as Node)) return;
    onRowClick(account.id);
  };

  const platformLabel =
    PLATFORMS.find((p) => p.value === account.platform)?.label ??
    account.platform;

  // Not a three-way if on the raw column any more. An account we switched
  // off, one the platform banned and one nobody has touched since August
  // were all drawn as the same red pill; see lib/ad-account-status.ts.
  const statusView = adAccountStatusView(
    account.status,
    spend?.lastAt ?? null,
    account.start_date ?? account.created_at ?? null,
    nowMs,
  );
  const statusCls = statusView.tone;

  return (
    <tr onClick={handleRowClick} style={{ cursor: "pointer" }}>
      <td data-label="Client Code" className="mono">
        <CopyText
          value={account.advertiser?.tenant_client_code}
          what="PSM number"
          mono
        />
      </td>
      {/* ── THE TWO THINGS THAT GET RETYPED ────────────────────────
          The account name and the BM id are what an admin carries
          into a supplier's dashboard, character for character, and
          one wrong character funds somebody else's account. Both
          copy on click. The BM id was on no grid at all -- it lived
          in a detail sheet two clicks away -- so it was read off a
          screen and typed from memory. */}
      <td data-label="Account Name" className="clip">
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>
            <CopyText value={account.name} what="account name" />
          </span>
          {account.bm_id ? (
            <span style={{ fontSize: ".72rem", color: "var(--faint)" }}>
              BM{" "}
              <CopyText value={String(account.bm_id)} what="BM ID" mono />
            </span>
          ) : null}
        </div>
      </td>
      {/* First name only. A list cell is for recognising someone at a
          glance, and a full name pushed the two-up card wider than the
          column it sits in. The full name is in the detail sheet. */}
      <td data-label="Advertiser" className="clip">
        {/* The advertiser, not just their name: this opens their record.
            Stops the click reaching the row, which opens the ACCOUNT. */}
        {(account.advertiser?.profile as { id?: string } | undefined)?.id ? (
          <button
            className="custbtn"
            title={`Open ${account.advertiser?.profile?.full_name ?? "this advertiser"}`}
            onClick={(e) => {
              e.stopPropagation();
              const pid = (
                account.advertiser?.profile as { id?: string } | undefined
              )?.id;
              if (pid) onOpenAdvertiser(pid);
            }}
          >
            <span style={{ textDecoration: "underline dotted" }}>
              {firstName(account.advertiser?.profile?.full_name) || "—"}
            </span>
          </button>
        ) : (
          <span title={account.advertiser?.profile?.full_name ?? undefined}>
            {firstName(account.advertiser?.profile?.full_name) || "—"}
          </span>
        )}
      </td>
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
      {/* The inline fee editor was half-built: the `fee` state, the isDirty
          tracking and the Save/Cancel buttons in the actions cell all
          existed, but `editing.fee` was set and never read, so no input ever
          rendered. The cell showed a pointer cursor, swallowed the click and
          did nothing — an affordance that promised an editor and delivered
          silence. The input is the missing piece; everything else already
          worked. */}
      <td
        data-label="Fee"
        className="r"
        onClick={editing.fee ? undefined : handleFeeEdit}
        style={{ cursor: isAdmin && !editing.fee ? "pointer" : "default" }}
      >
        {editing.fee && isAdmin ? (
          <span className="feeedit" onClick={(e) => e.stopPropagation()}>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={fee}
              autoFocus
              onChange={(e) => setFee(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setFee(initialFee);
                  setEditing({ fee: false });
                }
              }}
              // Clicking away is the third way out of an editor, after Save
              // and Escape, and it was the one that left the cell showing an
              // empty box with the real fee nowhere on screen until the next
              // refetch.
              //
              // The relatedTarget check is load-bearing, not defensive:
              // blur fires BEFORE the click that caused it, so clicking Save
              // would otherwise reset the value and unmount the button
              // before its own handler ever ran — the editor would look
              // tidy and never save anything. Focus moving to something
              // inside this same row (Save, Cancel) is not leaving.
              // …and relatedTarget is NULL on Safari and iOS when focus moves
              // to a button — WebKit does not focus buttons on click. So the
              // check above passed straight through there and discarded the
              // edit on the one browser where it matters most, which is the
              // opposite of what it was written to prevent. When we are not
              // told where focus went, look at where it actually landed on
              // the next tick instead of assuming it left.
              onBlur={(e) => {
                const row = e.currentTarget.closest("tr");
                const to = e.relatedTarget as HTMLElement | null;
                if (to) {
                  if (to.closest("tr") === row) return;
                  setFee(initialFee);
                  setEditing({ fee: false });
                  return;
                }
                setTimeout(() => {
                  const active = document.activeElement as HTMLElement | null;
                  if (active && row && row.contains(active)) return;
                  setFee(initialFee);
                  setEditing({ fee: false });
                }, 0);
              }}
              aria-label="Fee percentage"
            />
            <span className="pct">%</span>
          </span>
        ) : (
          `${fee}%`
        )}
      </td>
      <td data-label="Currency" className="nw">
        {account.currency || "N/A"}
      </td>
      {/* Total put ON this account, in USD — top_ups amounts are USD
          whatever the customer paid in. A read failure shows a dash, never
          a zero: "nothing was ever topped up" and "we could not ask" are
          not the same sentence. */}
      <td
        data-label="Spend"
        className="r mono nw"
        title={
          spendUnknown
            ? "We couldn't load top-ups just now."
            : spend
              ? `${spend.count} completed top-up${spend.count === 1 ? "" : "s"}${
                  spend.lastAt
                    ? `, last on ${new Date(spend.lastAt).toLocaleDateString()}`
                    : ""
                }`
              : "Nothing funded on this account yet."
        }
      >
        {/* USD, always, and said so in the heading. top_ups.topup_amount
            is stored in USD by construction whatever the customer paid
            in — so a dollar figure beside "CURRENCY EUR" is correct and
            reads as a mistake unless the column says which it is. */}
        {spendUnknown ? "—" : `$${(spend?.usd ?? 0).toFixed(2)}`}
      </td>
      <td data-label="Status" className="nw">
        <span
          className={`badge ${statusCls}`}
          title={statusView.why || undefined}
        >
          {statusView.label}
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
              // The tick carried no pending state at all -- and updateFee
              // closes the editor optimistically, so there was nothing on
              // screen to say the write was still in flight either.
              disabled={savingFee}
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
                setEditing({ fee: false });
              }}
            >
              <X />
            </button>
          </div>
        ) : (
          /* Two equal buttons on ONE row. It was three, wrapping onto two
             rows at unequal widths, on every single record. "Set Topup
             Limit" is a rarely-touched setting, not a row action — it lives
             in the account's own detail sheet now, next to the other
             settings, which is where you go when you want to change a spec
             rather than scan a list. */
          <div className="actrow">
            {isAdmin && (
              // titled, because .alab is display:none below 420px and then the
              // icon is all that is left — a button with no accessible name.
              <button
                className="btn ghost sm"
                title="Edit"
                aria-label="Edit"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(account);
                }}
              >
                <Pencil /> <span className="alab">Edit</span>
              </button>
            )}
            <button
              className="btn ghost sm"
              title="View"
              aria-label="View"
              onClick={(e) => {
                e.stopPropagation();
                onRowClick(account.id);
              }}
            >
              <Eye /> <span className="alab">View</span>
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
