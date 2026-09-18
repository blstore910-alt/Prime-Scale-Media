"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import Link from "next/link";
import CreateSubscriptionDialog from "@/components/subscriptions/create-subscription-dialog";
import PsmSortFilter from "@/components/psm/sort-filter";
import { COMMISSION_TYPE_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { Advertiser } from "@/lib/types/advertiser";
import { formatCurrency } from "@/lib/utils";
import { Parser } from "json2csv";
import {
  Eye,
  FileDown,
  Monitor,
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
import CustomerName from "@/components/psm/customer-name";
import { useAppContext } from "@/context/app-provider";
import { useAffiliateEarnings } from "@/hooks/use-affiliate-earnings";
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

  // One definition of "the list is narrowed", used by both the empty state
  // and the Reset control, so they can never disagree about it.
  // Affiliate earnings, keyed by email — the only identifier a standalone
  // affiliate and an advertiser-as-affiliate both carry.
  const { profile: me } = useAppContext();
  const { byEmail: earningsByEmail, isError: earningsError } =
    useAffiliateEarnings(me?.tenant_id);

  const narrowed = !!search.trim() || active !== "all";
  const resetFilters = () => {
    setSort("newest");
    setActive("all");
    setSearch("");
  };

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
          <p>Plans, money and status.</p>
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
          onReset={resetFilters}
        />
        <button
          className="fexp"
          onClick={handleDownload}
          disabled={downloadingCSV}
          aria-label="Download CSV"
          title="Download CSV"
        >
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
          <div className="card" style={{ padding: 0 }}>
            <div className="tblwrap">
              <table className="tbl wide">
                <thead>
                  <tr>
                    <th>Advertiser</th>
                    <th>Plan</th>
                    <th className="r">Topups / earnings</th>
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
                      earningsByEmail={earningsByEmail}
                      earningsError={earningsError}
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
      ) : narrowed ? (
        /* "You have none" and "your filters match none" are different facts
           and have to read differently — otherwise a filter left on from
           five minutes ago looks exactly like an empty database, and the
           way out of it is not on screen. */
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No advertisers match the current search or filters.
          </p>
          <button
            className="btn ghost sm"
            style={{ marginTop: 12 }}
            onClick={resetFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No advertisers yet.
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
  earningsByEmail,
  earningsError,
}: {
  profile: Profile;
  tone: (typeof TONES)[number];
  onView: () => void;
  onCreateSubscription: (advertiserId: string) => void;
  onCommissionSetup: (advertiser: Advertiser | undefined) => void;
  earningsByEmail: Record<string, { eur: number; usd: number; links: number }>;
  earningsError: boolean;
}) {
  const { updateUserProfile, isPending } = useUpdateUserProfile();

  const advertiser = profile.advertiser?.[0];
  const isActive = profile.status === "active";

  const subscriptions = advertiser?.subscriptions;
  const hasSubscription = !!subscriptions?.length;
  const subscriptionStatus = hasSubscription
    ? subscriptions?.[0]?.status
    : null;
  // What the PLAN is, not whether it is active. The cell used to render the
  // subscription's status as a green "Active" pill, directly above the
  // account's status as an identical green "Active" pill — two pills, same
  // word, same colour, adjacent, about two different things. An amount can
  // never be mistaken for an account status.
  const sub0 = subscriptions?.[0] as
    | { status?: string; amount?: number | string | null; currency?: string | null }
    | undefined;
  const planAmount =
    sub0?.amount != null && Number.isFinite(Number(sub0.amount))
      ? `${(sub0.currency ?? "EUR").toUpperCase() === "USD" ? "$" : "€"}${Number(sub0.amount).toFixed(0)} / mo`
      : null;

  const commissionType = advertiser?.commission_type
    ? COMMISSION_TYPE_LABELS[advertiser.commission_type] ??
      advertiser.commission_type
    : null;

  const topupTotals = useMemo(
    () => getCompletedWalletTopupTotals(advertiser?.wallet_topups),
    [advertiser],
  );

  // ── Deactivating is not just an access switch ───────────────────────
  // updateUserProfile ALSO bulk-writes every one of this advertiser's
  // subscriptions to 'inactive' (actions/admin-actions.ts) — and
  // reactivating writes only the profile back, so nothing restores them.
  // One click therefore removes access AND silently ends the recurring
  // billing, and the Activate button that appears next does not undo it.
  // The admins table already asks before its equivalent; this did not.
  const [askDeactivate, setAskDeactivate] = useState(false);

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

  const askToggle = () => {
    // Reactivating is harmless, so it does not ask.
    if (!isActive) {
      toggleStatus();
      return;
    }
    setAskDeactivate(true);
  };

  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  const clientCode = advertiser?.tenant_client_code ?? "";
  const isAffiliate = (profile.role ?? "").toLowerCase() === "affiliate";
  const earnings =
    earningsByEmail[(profile.email ?? "").trim().toLowerCase()] ?? {
      eur: 0,
      usd: 0,
      links: 0,
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
          {/* Code first, name under it. The desk works in client codes —
              they are on the invoice, they prefix every payment reference,
              and they are unique where a name is not. Scanning a list for
              PSM0002 while the codes are set as small grey subtitles means
              reading the quiet line instead of the loud one.
              The email is not here: it pushed this to a third line on every
              row and is one tap away in Details, where it can be copied. */}
          <CustomerName
            clientCode={advertiser?.tenant_client_code}
            name={profile.full_name}
            full
          />
        </div>
      </td>
      <td data-label="Plan">
        {hasSubscription ? (
          <div>
            {/* The amount leads, because that is what a plan IS. A status
                word here was indistinguishable from the account status pill
                one row below it — same word, same green. A non-active plan
                still needs saying, so it keeps a pill, but only when it is
                NOT the ordinary case. */}
            {planAmount ? (
              <div style={{ fontWeight: 700 }}>{planAmount}</div>
            ) : (
              <div style={{ fontWeight: 700 }}>Subscribed</div>
            )}
            {subscriptionStatus && subscriptionStatus !== "active" && (
              <span
                className="badge pend"
                style={{
                  textTransform: "capitalize",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {subscriptionStatus}
              </span>
            )}
            {commissionType && (
              <div
                className="muted"
                style={{ fontSize: ".76rem", marginTop: 4 }}
              >
                {commissionType}
              </div>
            )}
          </div>
        ) : advertiser ? (
          <button
            className="btn ghost sm"
            onClick={stop(() => onCreateSubscription(advertiser.id))}
          >
            <Plus /> Subscription
          </button>
        ) : isAffiliate ? (
          /* An affiliate has no advertiser record because an affiliate does
             not buy anything — that is the normal shape of the row, not a
             fault, and a red badge on it read as an alarm for every affiliate
             in the list. The PLAN column answers "which plan", so it says
             which: none, and why. */
          <span className="muted" style={{ fontSize: ".86rem" }}>
            Affiliate — no plan
          </span>
        ) : (
          /* An ADVERTISER with no advertisers row is a different story: no
             wallet, no ad accounts, no subscription possible. Still stated
             plainly in the plan column rather than shouted, with the
             consequence in the tooltip. The Subscription button used to sit
             here disabled and silent, which is what "the subscription button
             doesn't work" turned out to be. */
          <span
            className="muted"
            style={{ fontSize: ".86rem" }}
            title="This profile has no advertiser record, so it has no wallet, no ad accounts and cannot hold a subscription. It needs fixing before anything can be billed."
          >
            No plan
          </span>
        )}
      </td>
      {/* An affiliate has no wallet and never tops one up — showing them
          "WALLET TOPUPS €0.00" was a column of zeros that could never be
          anything else. What they DO have is earnings, and that is the
          number the desk wants next to their name. So the cell reports
          whichever one the row actually has. */}
      {isAffiliate ? (
        <td data-label="Earnings" className="r mono">
          {earningsError ? (
            <span className="muted" title="Earnings could not be read">
              —
            </span>
          ) : (
            <>
              <div>{formatCurrency(earnings.eur, "EUR")}</div>
              <div style={{ color: "var(--faint)" }}>
                {formatCurrency(earnings.usd, "USD")}
              </div>
            </>
          )}
        </td>
      ) : (
        <td data-label="Wallet Topups" className="r mono">
          <div>{formatCurrency(topupTotals.eur, "EUR")}</div>
          <div style={{ color: "var(--faint)" }}>
            {formatCurrency(topupTotals.usd, "USD")}
          </div>
        </td>
      )}
      <td data-label="Status">
        <span
          className={`badge ${isActive ? "ok" : "due"}`}
          style={{ textTransform: "capitalize" }}
        >
          {profile.status ?? "—"}
        </span>
      </td>
      {/* .actrow keeps all four on ONE row at every width by letting them
          shrink together — a 3+1 wrap reads as an accident, and the odd one
          out looks like it belongs to the row below. Under 420px the labels
          give way to the icons, which is the only honest way to fit four
          controls in 340px without shrinking the tap target. */}
      <td data-label="Actions" className="r fullcell">
        <div className="actrow">
          <button className="btn ghost sm" onClick={stop(onView)} title="Details">
            <Eye /> <span className="alab">Details</span>
          </button>
          {/* Straight to this advertiser's ad accounts, pre-filtered by the
              client code — the same string the accounts search matches on.
              It was two screens and a retyped code away, and "show me
              everything this customer runs" is the question the desk asks
              most. Disabled without a code, because the filter would then
              land on the whole table and look like their accounts. */}
          <Link
            className={`btn ghost sm${clientCode ? "" : " disabled"}`}
            href={
              clientCode
                ? `/accounts?q=${encodeURIComponent(clientCode)}`
                : "/accounts"
            }
            onClick={(e) => {
              e.stopPropagation();
              if (!clientCode) e.preventDefault();
            }}
            aria-disabled={!clientCode}
            title={
              clientCode
                ? "Ad accounts"
                : "No client code yet — nothing to filter by"
            }
          >
            <Monitor /> <span className="alab">Accounts</span>
          </Link>
          <button
            className="btn ghost sm"
            onClick={stop(() => onCommissionSetup(advertiser))}
            title="Commission"
          >
            <HandCoins /> <span className="alab">Commission</span>
          </button>
          {/* Tinted when it is the destructive direction. On a phone this
              is the one control in the row that shows its glyph alone —
              there is not enough width for a fourth word — and an unnamed
              grey icon beside three named ones reads as a button that
              failed to render. Tinted, it reads as the stop control, which
              is what it is. Activating is not destructive and stays plain. */}
          <button
            className={"btn ghost sm" + (isActive ? " danger" : "")}
            disabled={isPending}
            onClick={stop(askToggle)}
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

          {/* Inside the cell: a <tr> may not have a non-<tr> sibling, and
              the dialog portals to the body regardless. */}
      <ConfirmModal
        open={askDeactivate}
        onOpenChange={(next) => {
          if (!next) setAskDeactivate(false);
        }}
        title="Deactivate this customer?"
        lead="They lose access — and every subscription they have is stopped with them. Activating them again does NOT bring the subscriptions back; you would have to set those up by hand."
        cta="Yes, deactivate"
        tone="danger"
        onConfirm={() => {
          setAskDeactivate(false);
          toggleStatus();
        }}
      >
        <ConfirmFact
          label="Customer"
          value={profile.advertiser?.[0]?.tenant_client_code ?? profile.email ?? "—"}
        />
        <ConfirmFact label="Also stops" value="Their subscriptions" strong />
      </ConfirmModal>
        </div>
      </td>
    </tr>
  );
}
