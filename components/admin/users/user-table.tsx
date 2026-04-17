"use client";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import { createClient } from "@/lib/supabase/client";
import { Advertiser } from "@/lib/types/advertiser";
import { Affiliate } from "@/lib/types/affiliate";
import { UserProfile } from "@/lib/types/user";
import { Parser } from "json2csv";
import { FileDown, Loader2, SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useUsers from "./use-users";
import UserDetailsSheet from "./user-details-sheet";
import CreateSubscriptionDialog from "@/components/subscriptions/create-subscription-dialog";
import CommissionSetupDialog from "./commission-setup-dialog";

import UserRow from "./user-row";
import TablePagination from "@/components/ui/table-pagination";
import UserCard from "./user-card";
import { useMediaQuery } from "usehooks-ts";

export interface Profile extends UserProfile {
  advertiser: Advertiser[];
  affiliate: Affiliate[];
}

export default function UserTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState({
    topup: false,
    details: false,
    subscription: false,
    commission: false,
  });
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const initialSort = searchParams?.get("sort") ?? "newest";
  const initialQ = searchParams?.get("q") ?? "";
  const initialStatus = searchParams?.get("active") ?? "all";
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "50", 10) || 10;

  const [active, setActive] = useState(initialStatus);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialQ);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const [advertiserId, setAdvertiserId] = useState<string>("");
  const [commissionAdvertiser, setCommissionAdvertiser] =
    useState<Advertiser | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));

    if (sort && sort !== "newest") {
      params.set("sort", sort);
    } else {
      params.delete("sort");
    }
    if (active && active !== "all") {
      params.set("active", active);
    } else {
      params.delete("active");
    }
    if (debouncedSearch && debouncedSearch.trim() !== "") {
      params.set("q", debouncedSearch.trim());
    } else {
      params.delete("q");
    }

    if (page && page > 1) params.set("page", String(page));
    else params.delete("page");

    if (perPage && perPage !== 10) params.set("perPage", String(perPage));
    else params.delete("perPage");

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, debouncedSearch, active]);
  // include page/perPage in URL sync
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

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(t);
  }, [search]);

  const { profiles, total, isLoading, isError, error } = useUsers({
    sort,
    search: debouncedSearch,
    active: active === "all" ? undefined : active === "yes",
    page,
    perPage,
  });

  const handleDownload = async () => {
    const fields = [
      { label: "ID", value: "id" },
      { label: "Status", value: "status" },
      { label: "Name", value: "full_name" },
      { label: "Email", value: "email" },
      { label: "Active", value: "is_active" },
      { label: "Tenant", value: "tenant.name" },
      { label: "Client Code", value: "advertiser.[0].tenant_client_code" },
      { label: "Startup Fee", value: "advertiser.[0].startup_fee" },
      { label: "Fee Status", value: "advertiser.[0].fee_status" },
      { label: "Created At", value: "created_at" },
      { label: "Updated At", value: "updated_at" },
    ];

    const opts = { fields, withBOM: true };
    const supabase = createClient();
    try {
      setDownloadingCSV(true);
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*, advertiser:advertisers(*), tenant:tenants(*)");
      if (error) throw error;

      const parser = new Parser(opts);
      const csv = parser.parse(data);

      // BLOB for download
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

  return (
    <>
      <div className="flex sm:flex-row flex-col gap-3 justify-between">
        <div className="flex gap-2">
          <Select value={active} onValueChange={setActive}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={"all"}>All</SelectItem>
              <SelectItem value="yes">Active</SelectItem>
              <SelectItem value="no">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select
            aria-label="Sort users"
            value={sort}
            onValueChange={(v) => setSort(v ?? "newest")}
          >
            <SelectTrigger className="">
              <SelectValue placeholder="Sort users" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="a-z">Name A → Z</SelectItem>
              <SelectItem value="z-a">Name Z → A</SelectItem>
              <SelectItem value="id-asc">ID ↑</SelectItem>
              <SelectItem value="id-desc">ID ↓</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <ButtonGroup>
            <Input
              placeholder="Search Users"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="outline" aria-label="Search">
              <SearchIcon />
            </Button>
          </ButtonGroup>
          <Button onClick={handleDownload}>
            {downloadingCSV ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FileDown />
            )}
            Download CSV
          </Button>
        </div>
      </div>
      {isTabletScreen ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Client Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Account Status</TableHead>
                <TableHead>Wallet Topups</TableHead>
                <TableHead>Subscription Status</TableHead>

                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: 9 }).map((_, cellIdx) => (
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
                      <p className="font-medium">Failed to load users.</p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : profiles?.data?.length ? (
                profiles.data.map((profile: Profile) => (
                  <UserRow
                    key={profile.id}
                    onCreateSubscription={(advertiserId) => {
                      setOpen((prev) => ({ ...prev, subscription: true }));
                      setAdvertiserId(advertiserId);
                    }}
                    onCommissionSetup={(advertiser) => {
                      setCommissionAdvertiser(advertiser);
                      setOpen((prev) => ({ ...prev, commission: true }));
                    }}
                    profile={profile}
                    onView={() => {
                      setSelectedProfile(profile);
                      setOpen((prev) => ({ ...prev, details: true }));
                    }}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div>
          {!isLoading && !isError && profiles?.data?.length ? (
            <div className="grid gap-4">
              {profiles.data.map((profile: Profile) => (
                <UserCard
                  key={profile.id}
                  profile={profile}
                  onCreateSubscription={(advertiserId) => {
                    setOpen((prev) => ({ ...prev, subscription: true }));
                    setAdvertiserId(advertiserId);
                  }}
                  onCommissionSetup={(advertiser) => {
                    setCommissionAdvertiser(advertiser);
                    setOpen((prev) => ({ ...prev, commission: true }));
                  }}
                  onViewDetails={() => {
                    setSelectedProfile(profile);
                    setOpen((prev) => ({ ...prev, details: true }));
                  }}
                />
              ))}
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 w-full bg-muted rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : isError ? (
            <div className="mt-4 flex items-center gap-2 text-destructive">
              <span>{error?.message}</span>
            </div>
          ) : (
            <div className="mt-4 text-center py-6 text-sm text-muted-foreground">
              No users found
            </div>
          )}
        </div>
      )}
      <div className="p-4">
        <TablePagination
          total={total ?? 0}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      </div>
      <UserDetailsSheet
        open={open.details}
        key={selectedProfile?.id}
        profileId={selectedProfile?.id as string}
        onOpenChange={() => {
          setSelectedProfile(null);
          setOpen((prev) => ({ ...prev, details: false }));
        }}
      />
      <CreateSubscriptionDialog
        open={open.subscription}
        onOpenChange={(value) => {
          setOpen((prev) => ({ ...prev, subscription: value }));
          if (!value) {
            setAdvertiserId("");
          }
        }}
        defaultAdvertiserId={advertiserId}
      />
      <CommissionSetupDialog
        open={open.commission}
        onOpenChange={(value) => {
          setOpen((prev) => ({ ...prev, commission: value }));
          if (!value) {
            setCommissionAdvertiser(null);
          }
        }}
        advertiser={commissionAdvertiser}
      />
    </>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
