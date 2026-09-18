"use client";

import { createClient } from "@/lib/supabase/client";
import Copyable from "@/components/psm/copyable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";

import useUpdateAdvertiser from "@/components/advertiser/use-update-advertiser";
import { dmSans, jakarta } from "@/lib/fonts";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { AlertCircle, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import useUpdateUserProfile from "./use-update-user";
import UserAccounts from "./user-accounts";
import UserAffiliates from "./user-affiliates";

import UserSubscriptionDetails from "./user-subscription-details";
import UserWalletTopups from "./user-wallet-topups";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";

// The sheet renders in a Radix portal OUTSIDE the `.psmapp` shell, so the
// mockup's scoped classes and font variables aren't in scope here. This
// self-contained, prefixed style block re-declares the shell tokens (and
// the font vars via the next/font `*.variable` classes on the wrapper) so
// the drawer matches the mockup detail-drawer look.
const SHEET_CSS = `
.udsheet{--ground:#f4f6fc;--panel:#fff;--panel-2:#f1f4fb;--ink:#12162a;--txt-2:#5c6577;--faint:#8b93a6;
  --line:#e6e9f2;--line-2:#d8ddec;--primary:#3a6fff;--primary-600:#2f5ae6;--primary-tint:#eaf1ff;
  --win:#10b981;--win-soft:#daf5ec;--warn:#e08a00;--warn-soft:#fdeecb;--danger:#e5484d;--danger-soft:#fdecec;
  --brand:linear-gradient(135deg,#5B8DFF,#8B5CF6);
  --hd:var(--font-jakarta),system-ui,sans-serif;--bd:var(--font-dmsans),system-ui,sans-serif;
  --shadow-sm:0 10px 26px -20px rgba(20,30,80,.5);
  background:var(--ground);color:var(--ink);font-family:var(--bd);line-height:1.55;min-height:100%;
  -webkit-font-smoothing:antialiased}
.udsheet .uds-head{position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--panel) 92%,transparent);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);
  padding:16px 18px;display:flex;align-items:center;gap:12px}
.udsheet .uds-av{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-family:var(--hd);
  font-weight:800;font-size:.95rem;color:#fff;background:var(--brand);flex:0 0 auto}
.udsheet .uds-id{min-width:0;flex:1}
.udsheet .uds-nm{font-family:var(--hd);font-weight:800;font-size:1.15rem;line-height:1.2;
  font-variant-numeric:tabular-nums;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* The name is a button that turns into its own input. A pencil that only
   shows on hover would be invisible on a phone, and a separate edit row for
   one field is more chrome than the field is worth. */
.udsheet .uds-nm-btn{display:flex;align-items:center;gap:7px;width:100%;border:0;background:none;padding:0;
  cursor:pointer;font-family:inherit;font-size:inherit;font-weight:inherit;color:inherit;text-align:left;
  border-radius:8px}
.udsheet .uds-nm-btn svg{width:14px;height:14px;flex:0 0 auto;color:var(--faint);opacity:.5;transition:.12s}
.udsheet .uds-nm-btn:hover{color:var(--primary-600)}
.udsheet .uds-nm-btn:hover svg{opacity:1;color:var(--primary-600)}
@media (hover:none){.udsheet .uds-nm-btn svg{opacity:.85}}
.udsheet .uds-nm2{font-weight:700;font-size:.92rem;line-height:1.25;color:var(--txt-2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.udsheet .uds-nm-in{width:100%;font-family:var(--bd);font-weight:700;font-size:.92rem;line-height:1.25;
  border:1px solid var(--primary);border-radius:9px;padding:3px 8px;margin:-4px 0;background:var(--panel);
  color:var(--ink);box-shadow:0 0 0 3px var(--primary-tint)}
.udsheet .uds-nm-in:focus{outline:0}
.udsheet .uds-sub{display:flex;align-items:center;gap:6px;min-width:0;
  color:var(--faint);font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.udsheet .uds-dot{color:var(--line-2);flex:0 0 auto}
.udsheet .uds-cd{font-family:ui-monospace,Menlo,monospace;color:var(--txt-2)}
.udsheet .uds-x{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--panel);
  color:var(--txt-2);display:grid;place-items:center;cursor:pointer;flex:0 0 auto}
.udsheet .uds-x:hover{background:var(--panel-2)}.udsheet .uds-x svg{width:18px;height:18px}
.udsheet .uds-body{padding:18px;display:flex;flex-direction:column;gap:16px}
.udsheet .uds-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow-sm)}
.udsheet .uds-sec{font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:0 0 12px}
.udsheet .uds-kv{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.udsheet .uds-kvr{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;
  border-top:1px solid var(--line);font-size:.9rem}
.udsheet .uds-kvr:first-child{border-top:0}
.udsheet .uds-kvr .k{color:var(--faint);font-weight:600;flex:0 0 auto}
.udsheet .uds-kvr .v{font-weight:700;text-align:right;min-width:0;word-break:break-word}
.udsheet .uds-kvr .v.nowrap{white-space:nowrap}
.udsheet .uds-cgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.udsheet .uds-cgrid .full{grid-column:1 / -1}
.udsheet .uds-f .l{display:block;font-size:.72rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--faint);margin-bottom:3px}
.udsheet .uds-f .d{font-weight:600;word-break:break-word}
/* Copyable's own styles live under .psmapp, and this sheet renders in a
   Radix portal OUTSIDE that shell — so the component arrived here with no
   styling at all. Its icon dropped onto a line of its own under the value,
   at whatever size an unstyled svg takes, which is why a column of details
   read as a column of big loose buttons. Re-declared here, same as the
   shell tokens above are. */
.udsheet .copyable{display:inline-flex;align-items:baseline;gap:6px;max-width:100%;min-width:0;
  border:0;background:none;padding:0;margin:0;cursor:pointer;text-align:left;
  font-family:inherit;font-size:inherit;font-weight:inherit;color:inherit;
  border-radius:7px;transition:color .12s}
.udsheet .copyable .cv{min-width:0;overflow-wrap:anywhere}
.udsheet .copyable .ci{width:13px;height:13px;flex:0 0 auto;align-self:center;
  color:var(--faint);opacity:.45;transition:opacity .12s,color .12s}
.udsheet .copyable:hover{color:var(--primary-600)}
.udsheet .copyable:hover .ci{opacity:1;color:var(--primary-600)}
.udsheet .copyable:focus-visible{outline:0;box-shadow:0 0 0 3px var(--primary-tint)}
.udsheet .copyable.done{color:var(--win)}
.udsheet .copyable.done .ci{color:var(--win);opacity:1}
.udsheet .copyable .cfail{font-size:.68rem;color:var(--danger);font-weight:700}
@media (hover:none){.udsheet .copyable .ci{opacity:.8}}
/* Two columns at 400px gave every value about 150px, so a company name and
   an email both wrapped to three lines. One column reads in half the height. */
@media (max-width:520px){
  .udsheet .uds-cgrid{grid-template-columns:1fr}
}
.udsheet .uds-select{font-family:var(--bd);font-weight:700;font-size:.86rem;text-transform:capitalize;
  border:1px solid var(--line-2);border-radius:11px;padding:9px 34px 9px 13px;background:var(--panel);color:var(--ink);
  cursor:pointer;-webkit-appearance:none;appearance:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b93a6' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 11px center;background-size:15px}
.udsheet .uds-select:hover{border-color:var(--primary);color:var(--primary-600)}
.udsheet .uds-select:focus{outline:0;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint)}
.udsheet .uds-lbl{display:block;font-family:var(--hd);font-weight:800;font-size:.92rem;margin-bottom:8px}
.udsheet .uds-ta{width:100%;font-family:var(--bd);font-size:.92rem;border:1px solid var(--line-2);border-radius:11px;
  padding:11px 13px;background:var(--panel-2);color:var(--ink);resize:vertical;min-height:90px}
.udsheet .uds-ta:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
.udsheet .uds-btn{display:inline-flex;align-items:center;gap:8px;border:0;cursor:pointer;font-family:var(--bd);
  font-weight:700;border-radius:11px;padding:10px 16px;background:var(--primary);color:#fff;white-space:nowrap;
  box-shadow:0 12px 26px -12px rgba(58,111,255,.7);transition:.12s}
.udsheet .uds-btn:hover{transform:translateY(-1px);background:var(--primary-600)}
.udsheet .uds-btn:disabled{opacity:.6;cursor:default;transform:none}
.udsheet .uds-btn svg{width:16px;height:16px}
.udsheet .uds-muted{color:var(--txt-2);font-size:.9rem}
.udsheet .uds-spin{animation:uds-spin .8s linear infinite}
.udsheet .uds-err{display:flex;align-items:center;gap:11px;background:var(--danger-soft);border:1px solid #f3c0c2;
  border-radius:14px;padding:14px 16px;color:#8a2a2a}
.udsheet .uds-err svg{width:20px;height:20px;color:var(--danger);flex:0 0 auto}
.udsheet .uds-state{display:grid;place-items:center;min-height:220px}
@keyframes uds-spin{to{transform:rotate(360deg)}}

/* The same iOS rule the shell has. This sheet is a portal OUTSIDE
   .psmapp and re-declares the styles it needs, and this one was missed —
   so changing a user's role or writing an admin note zoomed the page
   every time, on a drawer opened from two different screens. */
@media (max-width:640px){
  .udsheet input,.udsheet select,.udsheet textarea{font-size:16px}
}
`;

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

export default function UserDetailsSheet({
  open,
  profileId,
  onOpenChange,
}: {
  open: boolean;
  profileId: string | null;
  onOpenChange: () => void;
}) {
  const supabase = createClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["user", profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from("user_profiles")
        .select(
          "*, advertiser:advertisers(*, subscriptions(amount, currency, start_date, status),  wallet_topups:wallet_topups(amount, currency, status), companies(*))",
        )
        .eq("id", profileId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profileId,
    staleTime: 1000 * 60 * 2,
  });

  const { isPending: isUpdatingAdvertiser, updateAdvertiser } =
    useUpdateAdvertiser();

  const advertiser =
    data?.advertiser && data.advertiser.length > 0 ? data.advertiser[0] : null;
  const company =
    advertiser?.companies && advertiser.companies.length > 0
      ? advertiser.companies[0]
      : null;

  const clientCode = advertiser?.tenant_client_code;

  const { updateUserProfile, isPending } = useUpdateUserProfile();
  const queryClient = useQueryClient();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [note, setNote] = useState<string>("");
  const initialNotes = advertiser?.note || "";

  useEffect(() => {
    if (advertiser?.note) {
      setNote(advertiser.note);
    }
  }, [advertiser?.note]);

  const saveName = () => {
    const next = nameDraft.trim();
    setEditingName(false);
    // A blank name is not a rename — it would leave every invoice and list
    // row showing nothing. Unchanged is not a write either.
    if (!profileId || !next || next === (data?.full_name ?? "")) {
      setNameDraft(data?.full_name ?? "");
      return;
    }
    updateUserProfile(
      { userId: profileId, data: { full_name: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["user", profileId] });
          queryClient.invalidateQueries({ queryKey: ["users"] });
          toast.success("Name updated");
        },
        onError: () => setNameDraft(data?.full_name ?? ""),
      },
    );
  };

  // ── DEACTIVATING IS NOT A DROPDOWN CHOICE ───────────────────────────
  //
  // This fired on the select's onChange, with no confirmation anywhere in
  // this file. updateUserProfile's action then bulk-writes EVERY one of
  // that advertiser's subscriptions to inactive, and activating them
  // again writes only the profile back — the subscriptions do not
  // return. The row two clicks away on the list guards exactly this with
  // a danger dialog that says so in as many words; the sheet let one
  // mis-aimed click do it.
  //
  // It also wrote `status` without `is_active`, so the header counters
  // and the Active filter — both of which read is_active — kept counting
  // the customer as live.
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const applyAccountStatus = (value: string) => {
    if (!profileId) return;
    updateUserProfile(
      {
        userId: profileId,
        data: { status: value, is_active: value === "active" },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["user", profileId],
          });
          queryClient.invalidateQueries({
            queryKey: ["users"],
          });
          toast.success("Account status updated successfully");
          setPendingStatus(null);
        },
        onError: (e: Error) => {
          toast.error("Couldn't update the account status", {
            description: e.message,
          });
          setPendingStatus(null);
        },
      },
    );
  };

  const updateAccountStatus = (value: string) => {
    if (!profileId) return;
    // Switching somebody ON is reversible and costs nothing; switching
    // them OFF ends their subscriptions and cannot be undone from here.
    if (value === "active") {
      applyAccountStatus(value);
      return;
    }
    setPendingStatus(value);
  };

  const saving = isUpdatingAdvertiser || isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={`udsheet ${jakarta.variable} ${dmSans.variable} sm:max-w-2xl w-full overflow-auto p-0 gap-0`}
      >
        <style>{SHEET_CSS}</style>
        <SheetTitle className="sr-only">User Details</SheetTitle>

        {/* Header */}
        <div className="uds-head">
          <span className="uds-av">{initials(data?.full_name)}</span>
          <div className="uds-id">
            {/* Editable in place. Names are typed by customers at signup and
                arrive wrong often enough to matter — a company in the
                first-name box, a typo, a name that has since changed — and
                this one goes on their invoices. Without this the desk either
                lives with it or edits the database by hand. */}
            {/* Client code as the title here too, name under it. Same
                reasoning as the lists: the code is what this customer is
                called on an invoice, a bank statement and a payment
                reference. The name is still the editable one — it is the
                half that arrives wrong. */}
            <div className="uds-nm">{clientCode || "No client code"}</div>
            {editingName ? (
              <input
                className="uds-nm-in"
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setNameDraft(data?.full_name ?? "");
                    setEditingName(false);
                  }
                }}
                onBlur={saveName}
                aria-label="Full name"
              />
            ) : (
              <button
                className="uds-nm2 uds-nm-btn"
                onClick={() => {
                  setNameDraft(data?.full_name ?? "");
                  setEditingName(true);
                }}
                title="Rename"
              >
                {data?.full_name || "Unnamed"}
                <Pencil aria-hidden />
              </button>
            )}
            {/* The email is off the list rows now, so this is where you
                come to get it — which makes it worth being able to take
                rather than select by hand on a phone. */}
            {/* A separator between them. They ran together as
                "PSM0005xifape4500@jobscai.com" — two identifiers printed as
                one string, which is unreadable and worse than either alone. */}
            <div className="uds-sub">
              {data?.email ? (
                <Copyable value={data.email} label="email" />
              ) : (
                "—"
              )}
            </div>
          </div>
          {saving && (
            <Loader2 className="uds-spin" style={{ width: 18, height: 18, color: "var(--faint)" }} />
          )}
          <SheetClose className="uds-x" aria-label="Close">
            <X />
          </SheetClose>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="uds-state">
            <Loader2 className="uds-spin" style={{ width: 26, height: 26, color: "var(--faint)" }} />
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="uds-body">
            <div className="uds-err">
              <AlertCircle />
              <div>
                <div style={{ fontWeight: 700 }}>Failed to load user</div>
                <div style={{ fontSize: ".85rem" }}>{error.message}</div>
              </div>
            </div>
          </div>
        )}

        {/* No data */}
        {!isLoading && !isError && !data && (
          <div className="uds-body">
            <div className="uds-card">
              <p className="uds-muted" style={{ margin: 0, textAlign: "center" }}>
                No user selected
              </p>
            </div>
          </div>
        )}

        {/* Data */}
        {!isLoading && !isError && data && (
          <div className="uds-body">
            {/* Profile / status */}
            <div className="uds-card">
              <div className="uds-kv">
                <div className="uds-kvr">
                  <span className="k">Created</span>
                  <span className="v nowrap">
                    {data.created_at
                      ? dayjs(data.created_at).format(DATE_TIME_FORMAT)
                      : "—"}
                  </span>
                </div>
                <div className="uds-kvr">
                  <span className="k">Referred By</span>
                  <span className="v">
                    {data.referral_status === "referred"
                      ? data.referred_by || "—"
                      : "Not Referred"}
                  </span>
                </div>
                <div className="uds-kvr">
                  <span className="k">Status</span>
                  <select
                    className="uds-select"
                    value={data.status ?? ""}
                    onChange={(e) => updateAccountStatus(e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Company Details */}
            <div className="uds-card">
              <div className="uds-sec">Company Details</div>
              {company ? (
                <div className="uds-cgrid">
                  <div className="uds-f">
                    <span className="l">Name</span>
                    <Copyable value={company.name} label="company name" />
                  </div>
                  <div className="uds-f">
                    <span className="l">Email</span>
                    <Copyable value={company.official_email} label="email" />
                  </div>
                  <div className="uds-f">
                    <span className="l">Phone</span>
                    <Copyable value={company.phone} label="phone" />
                  </div>
                  <div className="uds-f">
                    <span className="l">Website</span>
                    <Copyable value={company.website_url} label="website" />
                  </div>
                  <div className="uds-f">
                    <span className="l">VAT No</span>
                    {company.is_not_vat ? (
                      <div className="d">Not Applicable</div>
                    ) : (
                      <Copyable value={company.vat_no} label="VAT number" mono />
                    )}
                  </div>
                  <div className="uds-f">
                    <span className="l">Registration No</span>
                    <Copyable value={company.registration_no} label="registration number" mono />
                  </div>
                  <div className="uds-f full">
                    <span className="l">Address</span>
                    <Copyable value={company.address} label="address" />
                  </div>
                  <div className="uds-f">
                    <span className="l">Country</span>
                    <Copyable value={company.country} label="country" />
                  </div>
                  <div className="uds-f">
                    <span className="l">State</span>
                    <div className="d">{company.state || "—"}</div>
                  </div>
                  <div className="uds-f">
                    <span className="l">Zip Code</span>
                    <div className="d">{company.zipcode || "—"}</div>
                  </div>
                </div>
              ) : (
                <p className="uds-muted" style={{ margin: 0 }}>
                  No company details found.
                </p>
              )}
            </div>

            {advertiser ? (
              <>
                <UserAccounts advertiserId={advertiser.id} />
                <UserSubscriptionDetails
                  subscriptions={advertiser.subscriptions}
                />
                <UserWalletTopups walletTopups={advertiser.wallet_topups} />
                <UserAffiliates
                  advertiser={advertiser}
                  userName={data.full_name}
                />
              </>
            ) : null}

            {/* Notes */}
            <div className="uds-card">
              <label htmlFor="notes" className="uds-lbl">
                Notes
              </label>
              <textarea
                id="notes"
                className="uds-ta"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Enter notes here..."
                rows={4}
              />
              {note !== initialNotes && (
                <div style={{ textAlign: "right", marginTop: 12 }}>
                  <button
                    className="uds-btn"
                    onClick={() => {
                      if (!advertiser) return;
                      updateAdvertiser(
                        { id: advertiser.id, payload: { note } },
                        {
                          onSuccess: () => {
                            queryClient.invalidateQueries({
                              queryKey: ["user", profileId],
                            });
                            toast.success("Notes updated successfully");
                          },
                        },
                      );
                    }}
                    disabled={isUpdatingAdvertiser}
                  >
                    {isUpdatingAdvertiser ? (
                      <Loader2 className="uds-spin" style={{ width: 16, height: 16 }} />
                    ) : null}
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <ConfirmModal
          open={!!pendingStatus}
          onOpenChange={(next) => {
            if (!next && !saving) setPendingStatus(null);
          }}
          title="Switch this customer off?"
          lead="Every subscription they have is ended at the same time. Turning them back on does NOT bring those subscriptions back — you would have to create them again."
          cta="Yes, switch them off"
          tone="danger"
          busy={saving}
          busyLabel="Saving…"
          onConfirm={() => {
            if (pendingStatus) applyAccountStatus(pendingStatus);
          }}
        >
          <ConfirmFact label="Customer" value={data?.full_name ?? data?.email ?? "—"} />
          <ConfirmFact label="New status" value={pendingStatus ?? ""} />
        </ConfirmModal>

      </SheetContent>
    </Sheet>
  );
}
