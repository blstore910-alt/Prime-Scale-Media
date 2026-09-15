"use client";

import CreateSubscriptionDialog from "@/components/subscriptions/create-subscription-dialog";
import PsmSortFilter from "@/components/psm/sort-filter";
import { COMMISSION_TYPE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { Advertiser } from "@/lib/types/advertiser";
import { formatCurrency } from "@/lib/utils";
import { Parser } from "json2csv";
import {
  Check,
  Eye,
  FileDown,
  HandCoins,
  Loader2,
  Plus,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import CommissionSetupDialog from "./commission-setup-dialog";
import type { Profile } from "./user-table";
import UserDetailsSheet from "./user-details-sheet";
import useUpdateUserProfile from "./use-update-user";
import useUsers from "./use-users";
import { getCompletedWalletTopupTotals } from "./wallet-topup-totals";

const chipStyle = {
  width: 36,
  height: 36,
  flex: "0 0 auto" as const,
  borderRadius: 10,
  display: "grid" as const,
  placeItems: "center" as const,
};

const TONES = ["b", "t", "g", "p"] as const;

function initials(name?: string | null) {
  if (!name) return "PS";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "PS"
  );
}

// Admin advertisers list, ported to the mockup look. Reuses the real
// `useUsers` data hook (unchanged query) and the real detail sheet +
// create-subscription + commission-setup dialogs + the updateUserProfile
// mutation hook (activate/deactivate) — presentation only.
export default function PsmAdvertisers() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState("newest");
  const [active, setActive] = useState("all"); // all | yes | no
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [downloadingCSV, setDownloadingCSV] = useState(false);

  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [advertiserId, setAdvertiserId] = useState("");
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [commissionAdvertiser, setCommissionAdvertiser] =
    useState<Advertiser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 500);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, sort, active]);

  const { profiles, total, isLoading, isError, error } = useUsers({
    sort,
    search: debounced,
    active: active === "all" ? undefined : active === "yes",
    page,
    perPage,
  });

  const rows = (profiles?.data ?? []) as Profile[];
  const totalCount = total ?? 0;
  const from = totalCount === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalCount);
  const hasPrev = page > 1;
  const hasNext = page * perPage < totalCount;

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
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Unable to export users", {
        description: err instanceof Error ? err.message : "Export failed.",
      });
    } finally {
      setDownloadingCSV(false);
    }
  };

  const openDetails = (profile: Profile) => {
    setSelectedProfile(profile);
    setDetailsOpen(true);
  };
  const openCreateSubscription = (advId: string) => {
    setAdvertiserId(advId);
    setSubscriptionOpen(true);
  };
  const openCommission = (adv: Advertiser | undefined) => {
    if (!adv) return;
    setCommissionAdvertiser(adv);
    setCommissionOpen(true);
  };

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Advertisers</h1>
          <p>Plans, wallet topups and status.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
          />
        </label>
        <PsmSortFilter
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "a-z", label: "Name A → Z" },
            { value: "z-a", label: "Name Z → A" },
            { value: "id-asc", label: "Client code — lowest first" },
            { value: "id-desc", label: "Client code — highest first" },
          ]}
          filters={[
            {
              id: "active",
              label: "Account status",
              value: active,
              onChange: setActive,
              options: [
                { value: "all", label: "All" },
                { value: "yes", label: "Active" },
                { value: "no", label: "Inactive" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setSort("newest");
            setActive("all");
            setSearch("");
          }}
        />
        <button className="fexp" onClick={handleDownload} disabled={downloadingCSV}>
          {downloadingCSV ? <Loader2 className="animate-spin" /> : <FileDown />}
          <span>Download CSV</span>
        </button>
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load advertisers. {(error as Error)?.message ?? ""}
          </p>
        </div>
      ) : rows.length ? (
        <>
          <div className="card" style={{ padding: 6 }}>
            <div className="tblwrap">
              <table className="tbl wide">
                <thead>
                  <tr>
                    <th>Advertiser</th>
                    <th>Plan</th>
                    <th className="r">Wallet Topups</th>
                    <th>Status</th>
                    <th className="r">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((profile, i) => (
                    <AdvertiserRow
                      key={profile.id}
                      profile={profile}
                      tone={TONES[i % TONES.length]}
                      onView={() => openDetails(profile)}
                      onCreateSubscription={openCreateSubscription}
                      onCommissionSetup={openCommission}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span className="muted" style={{ fontSize: ".85rem" }}>
              Showing {from}–{to} of {totalCount}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn ghost sm"
                disabled={!hasPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="btn ghost sm"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No advertisers found.
          </p>
        </div>
      )}

      <UserDetailsSheet
        open={detailsOpen}
        key={selectedProfile?.id}
        profileId={(selectedProfile?.id as string) ?? null}
        onOpenChange={() => {
          setSelectedProfile(null);
          setDetailsOpen(false);
        }}
      />
      <CreateSubscriptionDialog
        open={subscriptionOpen}
        onOpenChange={(value) => {
          setSubscriptionOpen(value);
          if (!value) setAdvertiserId("");
        }}
        defaultAdvertiserId={advertiserId}
      />
      <CommissionSetupDialog
        open={commissionOpen}
        onOpenChange={(value) => {
          setCommissionOpen(value);
          if (!value) setCommissionAdvertiser(null);
        }}
        advertiser={commissionAdvertiser}
      />
    </div>
  );
}

function AdvertiserRow({
  profile,
  tone,
  onView,
  onCreateSubscription,
  onCommissionSetup,
}: {
  profile: Profile;
  tone: (typeof TONES)[number];
  onView: () => void;
  onCreateSubscription: (advertiserId: string) => void;
  onCommissionSetup: (advertiser: Advertiser | undefined) => void;
}) {
  const { updateUserProfile, isPending } = useUpdateUserProfile();

  const advertiser = profile.advertiser?.[0];
  const clientCode = advertiser?.tenant_client_code ?? "—";
  const isActive = profile.status === "active";

  const subscriptions = advertiser?.subscriptions;
  const hasSubscription = !!subscriptions?.length;
  const subscriptionStatus = hasSubscription
    ? subscriptions?.[0]?.status
    : null;

  const commissionType = advertiser?.commission_type
    ? COMMISSION_TYPE_LABELS[advertiser.commission_type] ??
      advertiser.commission_type
    : null;

  const topupTotals = useMemo(
    () => getCompletedWalletTopupTotals(advertiser?.wallet_topups),
    [advertiser],
  );

  const toggleStatus = () => {
    updateUserProfile(
      {
        userId: profile.id,
        data: {
          status: isActive ? "inactive" : "active",
          is_active: !isActive,
        },
      },
      {
        onSuccess: () =>
          toast.success(
            `User has been ${isActive ? "deactivated" : "activated"} successfully`,
          ),
      },
    );
  };

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <tr style={{ cursor: "pointer" }} onClick={onView}>
      {/* .fullcell: on a phone this stacks under its label at full width
          instead of being squeezed into the right-hand value column, where
          an avatar plus a name plus an email wrapped into three differently
          aligned lines and read as broken. */}
      <td data-label="Advertiser" className="fullcell">
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span className={`ci ${tone}`} style={chipStyle}>
            {initials(profile.full_name)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{profile.full_name ?? "—"}</div>
            {/* Client code only. The email pushed this to a second line on
                every row and is one tap away in Details, where it can be
                copied — a list is for finding someone, not for reading their
                contact card. */}
            <div className="mono" style={{ color: "var(--faint)", fontSize: ".8rem" }}>
              {clientCode}
            </div>
          </div>
        </div>
      </td>
      <td data-label="Plan">
        {hasSubscription ? (
          <div>
            <span
              className={`badge ${subscriptionStatus === "active" ? "ok" : "pend"}`}
              style={{
                textTransform: "capitalize",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Check style={{ width: 13, height: 13 }} /> {subscriptionStatus}
            </span>
            {commissionType && (
              <div
                className="muted"
                style={{ fontSize: ".76rem", marginTop: 4 }}
              >
                {commissionType}
              </div>
            )}
          </div>
        ) : (
          <button
            className="btn ghost sm"
            disabled={!advertiser}
            onClick={stop(() => {
              if (advertiser) onCreateSubscription(advertiser.id);
            })}
          >
            <Plus /> Subscription
          </button>
        )}
      </td>
      <td data-label="Wallet Topups" className="r mono">
        <div>{formatCurrency(topupTotals.eur, "EUR")}</div>
        <div style={{ color: "var(--faint)" }}>
          {formatCurrency(topupTotals.usd, "USD")}
        </div>
      </td>
      <td data-label="Status">
        <span
          className={`badge ${isActive ? "ok" : "due"}`}
          style={{ textTransform: "capitalize" }}
        >
          {profile.status ?? "—"}
        </span>
      </td>
      {/* .actrow keeps all three on ONE row at every width by letting them
          shrink together — a 2+1 wrap reads as an accident, and the odd one
          out looks like it belongs to the row below. Under 420px the labels
          give way to the icons, which is the only honest way to fit three
          controls in 340px without shrinking the tap target. */}
      <td data-label="Actions" className="r fullcell">
        <div className="actrow">
          <button className="btn ghost sm" onClick={stop(onView)} title="Details">
            <Eye /> <span className="alab">Details</span>
          </button>
          <button
            className="btn ghost sm"
            onClick={stop(() => onCommissionSetup(advertiser))}
            title="Commission"
          >
            <HandCoins /> <span className="alab">Commission</span>
          </button>
          <button
            className="btn ghost sm"
            disabled={isPending}
            onClick={stop(toggleStatus)}
            title={isActive ? "Deactivate" : "Activate"}
          >
            {isPending ? (
              <Loader2 className="animate-spin" />
            ) : isActive ? (
              <UserX />
            ) : (
              <UserCheck />
            )}
            <span className="alab">{isActive ? "Deactivate" : "Activate"}</span>
          </button>
        </div>
      </td>
    </tr>
  );
}
