"use client";

import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { DATE_FORMAT } from "@/lib/constants";
import PsmSortFilter from "@/components/psm/sort-filter";
import CustomerName from "@/components/psm/customer-name";
import { formatCurrency } from "@/lib/utils";
import dayjs from "dayjs";
import {
  ArrowRight,
  Loader2,
  MinusCircle,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  ReceiptText,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useAppContext } from "@/context/app-provider";
import ChangeSubscriptionAmountDialog from "./change-subscription-amount-dialog";
import CreateSubscriptionDialog from "./create-subscription-dialog";
import { formatSubscriptionDate } from "./subscription-utils";
import { Subscription, SubscriptionStatus } from "./types";
import useSubscriptions from "./use-subscriptions";
import useUpdateSubscriptionStatus from "./use-update-subscription-status";

const PER_PAGE = 20;

const advName = (s: Subscription) => s.advertiser?.profile?.full_name || "—";
const initial = (s: Subscription) =>
  (s.advertiser?.profile?.full_name || "?").trim().charAt(0).toUpperCase() ||
  "?";

// ── WHICH PLAN, NOT JUST HOW MUCH ────────────────────────────────────
//
// The list showed an amount and nothing else, so "EUR 5.00" and
// "EUR 150.00" were the only way to tell a Prime customer from a
// starter one — and two customers on the same price are
// indistinguishable. PostgREST hands a to-one embed back as an object
// and a to-many as an array, and which of the two this relationship
// reads as depends on how the FK is declared on live; both are
// accepted here rather than betting on one.
const planName = (s: Subscription): string | null => {
  const holder = s.advertiser?.plan;
  const row = Array.isArray(holder) ? holder[0] : holder;
  const plan = row?.plan;
  const one = Array.isArray(plan) ? plan[0] : plan;
  const name = String(one?.name ?? "").trim();
  return name || null;
};

const statusCls = (s: SubscriptionStatus) => {
  if (s === "active") return "ok";
  if (s === "past_due") return "due";
  if (s === "paused") return "pend";
  return "due"; // inactive
};

// Admin subscriptions queue, ported to the mockup look. Reuses the real
// data hook + the real create / change-amount dialogs and the
// setSubscriptionStatus mutation (activate/pause/disable/unpause) —
// presentation only, no new data writes.
export default function PsmSubscriptions() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus | "all">("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { isSuperAdmin, profile } = useAppContext();

  // HOW MANY ARE ACTUALLY RUNNING. The page showed a list and a total, and
  // "how many people are we billing" — the first question anybody has on
  // this screen — meant counting rows by eye or setting a filter and
  // reading the pagination. Counted independently of the filter, because
  // these describe the book, not the current view.
  const { data: statusCounts } = useQuery({
    queryKey: ["subscription-status-counts", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      const one = async (st: string) => {
        const { count, error } = await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", profile?.tenant_id)
          .eq("status", st);
        return error ? null : (count ?? 0);
      };
      const [active, pastDue, paused, inactive] = await Promise.all([
        one("active"),
        one("past_due"),
        one("paused"),
        one("inactive"),
      ]);
      return { active, pastDue, paused, inactive };
    },
  });
  const [amountEditSub, setAmountEditSub] = useState<Subscription | null>(null);

  useEffect(() => setPage(1), [status, date]);

  const { subscriptions, total, isLoading, isError, error } = useSubscriptions({
    status,
    date,
    page,
    perPage: PER_PAGE,
  });

  const {
    updateSubscriptionStatus,
    pendingSubscriptionId,
    isPending: isStatusUpdating,
  } = useUpdateSubscriptionStatus();

  // ── Ask first ───────────────────────────────────────────────────────
  // These are four icon-only buttons in one table row — the highest
  // misclick surface in the app — and each of them writes the column
  // subscription_billing_run() bills on. Activate starts a recurring
  // monthly charge against a customer; Disable stops their plan and our
  // revenue. Neither said a word before doing it.
  const [ask, setAsk] = useState<{
    title: string;
    lead: string;
    cta: string;
    danger?: boolean;
    facts: Array<[string, string]>;
    run: () => void;
  } | null>(null);

  const askStatus = (
    s2: { id: string; amount?: number | string | null; currency?: string | null;
          advertiser?: { tenant_client_code?: string | null } | null },
    nextStatus: SubscriptionStatus,
    words: { title: string; lead: string; cta: string; danger?: boolean; done: string },
  ) => {
    const adv = Array.isArray(s2.advertiser) ? s2.advertiser[0] : s2.advertiser;
    setAsk({
      title: words.title,
      lead: words.lead,
      cta: words.cta,
      danger: words.danger,
      facts: [
        ["Customer", adv?.tenant_client_code ?? "—"],
        [
          "Monthly",
          `${String(s2.currency ?? "EUR").toUpperCase() === "USD" ? "$" : "€"}${Number(s2.amount ?? 0).toFixed(2)}`,
        ],
      ],
      run: () => updateStatus(s2.id, nextStatus, words.done),
    });
  };

  const updateStatus = (
    subscriptionId: string,
    nextStatus: SubscriptionStatus,
    successMessage: string,
  ) => {
    updateSubscriptionStatus(
      { subscriptionId, status: nextStatus },
      {
        onSuccess: () => toast.success(successMessage),
        onError: (updateError) =>
          toast.error("Failed to update subscription", {
            description: updateError.message,
          }),
      },
    );
  };

  // ── THE SEARCH ONLY EVER SAW THE PAGE ──────────────────────────────
  //
  // useSubscriptions pages server-side at 20 and the term is not in its
  // query key, so this filtered the twenty rows already on screen. On a
  // tenant of 140, typing PSM0042 printed "No subscriptions match
  // "PSM0042"." with the pager beneath it still reading "Page 1 of 7".
  //
  // The owner concludes there is no plan and opens New Subscription --
  // and createSubscriptionAsAdmin only blocks a duplicate when the
  // existing row is active or past_due. PSM0042's is PAUSED, so the
  // insert succeeds: two subscription rows, two invoices a month, two
  // auto-debits from one wallet.
  //
  // Until the term reaches the query, say what this actually is rather
  // than stating a negative about the whole book.
  const q = search.trim().toLowerCase();
  const rows = subscriptions.filter((s) => {
    if (!q) return true;
    return (
      (s.advertiser?.profile?.full_name ?? "").toLowerCase().includes(q) ||
      (s.advertiser?.profile?.email ?? "").toLowerCase().includes(q) ||
      (s.advertiser?.tenant_client_code ?? "").toLowerCase().includes(q)
    );
  });
  const searchIsPageOnly = !!q && total > subscriptions.length;

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <style>{`
        .planpill{display:inline-block;padding:3px 10px;border-radius:999px;
          border:1px solid var(--line-2);background:var(--primary-tint);
          color:var(--primary-600);font-weight:700;font-size:.78rem;
          white-space:nowrap}
        .permo{margin-left:4px;color:var(--faint);font-weight:600;
          font-size:.74rem}
        /* One line: started, arrow, next due. The arrow is what makes
           the pair read as a period rather than as two dates. */
        .billrange{display:inline-flex;align-items:center;gap:7px;
          white-space:nowrap;font-variant-numeric:tabular-nums}
        .billrange svg{width:13px;height:13px;color:var(--faint);
          flex:0 0 auto}
        .billrange b{font-weight:800}
        .custlink{display:block;text-decoration:none;color:inherit;
          border-radius:10px}
        .custlink:hover{color:var(--primary-600)}
      `}</style>

      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Subscriptions</h1>
          <p>Recurring monthly plans.</p>
          {/* A dash, never a zero: a count we could not read must not read
              as "nobody is being billed". */}
          {statusCounts ? (
            <p className="subcounts">
              <span className="on">
                {statusCounts.active === null ? "—" : statusCounts.active}{" "}
                active
              </span>
              {/* NULL IS NOT ZERO, AND `? :` CANNOT TELL THEM APART.
                  `active` got this right two lines up; these three used
                  truthiness, so a count we could not read rendered as
                  nothing at all -- and "who owes us money" reading as
                  "nobody does" is the one of the four that gets acted
                  on. A dash when unknown, hidden only at a real zero. */}
              {statusCounts.pastDue === null ? (
                <span className="due">— past due</span>
              ) : statusCounts.pastDue > 0 ? (
                <span className="due">{statusCounts.pastDue} past due</span>
              ) : null}
              {statusCounts.paused === null ? (
                <span>— paused</span>
              ) : statusCounts.paused > 0 ? (
                <span>{statusCounts.paused} paused</span>
              ) : null}
              {statusCounts.inactive === null ? (
                <span>— inactive</span>
              ) : statusCounts.inactive > 0 ? (
                <span>{statusCounts.inactive} inactive</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="pacts">
          {/* ── A BUTTON THAT ALWAYS FAILS IS NOT A BUTTON ───────────
              createSubscriptionAsAdmin and setSubscriptionStatus are
              both owner-only on the server ("Only the account owner can
              start, stop or price a subscription"), and this page is
              requireAdmin. So an employee admin could press New
              Subscription, read a confirmation naming the customer and
              the monthly figure, confirm it — and get a red toast. Only
              the Amount button was gated; the other four were not.

              Hidden rather than disabled: a disabled control on a desk
              screen reads as "not right now", and this is "not you,
              ever". The note says which. */}
          {isSuperAdmin ? (
            <button className="btn grad" onClick={() => setIsCreateOpen(true)}>
              <Plus /> <span className="blab">New Subscription</span>
            </button>
          ) : (
            <span className="cap" style={{ alignSelf: "center" }}>
              Plans are the owner&apos;s to start, price and stop.
            </span>
          )}
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search advertiser…"
          />
        </label>
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: (v) => setStatus(v as SubscriptionStatus | "all"),
              options: [
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "past_due", label: "Past due" },
                { value: "inactive", label: "Inactive" },
                { value: "paused", label: "Paused" },
                // ── A STATUS THE APP WRITES AND COULD NOT LIST ──────
                // setSubscriptionStatus allows 'cancelled' and the
                // billing engine treats it as terminal, but there was
                // no option for it -- so an admin who cancelled a
                // subscription could never find it again except under
                // "All statuses".
                { value: "cancelled", label: "Cancelled" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          extraActive={!!date}
          extra={
            <>
              <label className="flab" htmlFor="sub-start">
                Started on or after
              </label>
              <input
                id="sub-start"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Start date"
                className="fpanel-date"
              />
            </>
          }
          onReset={() => {
            setStatus("all");
            setDate("");
            setSearch("");
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load subscriptions.{" "}
            {(error as Error)?.message ?? String(error)}
          </p>
        </div>
      ) : rows.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th>Plan</th>
                  <th className="r">Amount</th>
                  {/* Started and next-due on ONE line. They are two ends
                      of the same fact and they were two stacked rows on
                      a phone, which pushed the status and every button
                      below the fold. */}
                  <th>Billing period</th>
                  <th>Status</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const pending =
                    isStatusUpdating && pendingSubscriptionId === s.id;
                  return (
                    <tr key={s.id}>
                      <td data-label="Advertiser" className="fullcell">
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
                              fontWeight: 800,
                              flex: "0 0 auto",
                            }}
                          >
                            {initial(s)}
                          </span>
                          {/* Code first, name beneath — the desk works in
                              client codes, and this list was the other way
                              round. */}
                          {/* The code is a link. An admin looking at a
                              plan almost always wants the customer
                              behind it, and this list was a dead end —
                              they had to go to Users and type the code
                              they were already looking at. */}
                          {s.advertiser?.tenant_client_code ? (
                            <Link
                              href={`/users?q=${encodeURIComponent(
                                s.advertiser.tenant_client_code,
                              )}`}
                              className="custlink"
                            >
                              <CustomerName
                                clientCode={s.advertiser.tenant_client_code}
                                name={advName(s)}
                                full
                              />
                            </Link>
                          ) : (
                            <CustomerName
                              clientCode={s.advertiser?.tenant_client_code}
                              name={advName(s)}
                              full
                            />
                          )}
                        </div>
                      </td>
                      <td data-label="Plan">
                        {planName(s) ? (
                          <span className="planpill">{planName(s)}</span>
                        ) : (
                          <span className="muted">No plan set</span>
                        )}
                      </td>
                      <td data-label="Amount" className="r mono">
                        {formatCurrency(
                          Number(s.amount ?? 0),
                          s.currency || "EUR",
                        )}
                        <span className="permo">/mo</span>
                      </td>
                      <td data-label="Billing period">
                        <span className="billrange">
                          <span>{formatSubscriptionDate(s.start_date)}</span>
                          <ArrowRight />
                          <b>
                            {s.next_payment_date
                              ? dayjs(s.next_payment_date).format(DATE_FORMAT)
                              : "—"}
                          </b>
                        </span>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`badge ${statusCls(s.status)}`}
                          style={{ textTransform: "capitalize" }}
                        >
                          {s.status}
                        </span>
                      </td>
                      {/* .actrow: equal widths on ONE line. flexWrap here
                          meant three buttons of three different widths broke
                          onto three separate rows on a phone — on every
                          subscription in the list. */}
                      <td data-label="Actions" className="r fullcell">
                        <div className="actrow">
                          {/* The plan's own history. Every question that
                              starts "did they pay" ends on the invoices
                              list filtered to this customer, and there
                              was no way there from here. */}
                          {s.advertiser?.tenant_client_code && (
                            <Link
                              className="btn ghost sm"
                              href={`/invoices?q=${encodeURIComponent(
                                s.advertiser.tenant_client_code,
                              )}`}
                            >
                              <ReceiptText />{" "}
                              <span className="alab">Invoices</span>
                            </Link>
                          )}
                          {/* Same rule as the header button: the
                              server refuses all four for a
                              non-owner. */}
                          {isSuperAdmin && (
                            <button
                              className="btn ghost sm"
                              onClick={() => setAmountEditSub(s)}
                              disabled={pending}
                              title="Change the monthly amount (super-admin)"
                            >
                              <Pencil /> <span className="alab">Amount</span>
                            </button>
                          )}

                          {isSuperAdmin && (
                            <>
                            {s.status === "inactive" && (
                              <button
                                className="btn sm"
                                title="Activate"
                                aria-label="Activate"
                                onClick={() =>
                                  askStatus(s, "active", {
                                    title: "Start billing this customer?",
                                    lead: "It begins a recurring monthly charge. If this plan was paused or stopped, the billing run starts from its stored next-payment date and walks forward — so every month it was off is invoiced on the next pass and auto-debited from the wallet. Move the next payment date first if you do not want that.",
                                    cta: "Yes, activate it",
                                    done: "Subscription activated successfully.",
                                  })
                                }
                                disabled={pending}
                              >
                                {pending ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <PlayCircle />
                                )}
                                <span className="alab">Activate</span>
                              </button>
                            )}

                            {/* PAST DUE GETS THE SAME CONTROLS AS ACTIVE.
                                Dunning writes this status, the billing run
                                keeps retrying the auto-debit every day while
                                it holds — and the action row rendered
                                buttons only for active, inactive and paused,
                                so the one subscription the desk most needs to
                                stop had no buttons at all. */}
                            {(s.status === "active" ||
                              s.status === "past_due") && (
                              <>
                                {/* titled: .alab is display:none below 420px and
                                    then only the icon is left, so without this
                                    the button has no accessible name at all. */}
                                <button
                                  className="btn ghost sm"
                                  title="Pause"
                                  aria-label="Pause"
                                  onClick={() =>
                                  askStatus(s, "paused", {
                                    title: "Pause this subscription?",
                                    // "Anything already unpaid stays unpaid"
                                    // was false. The auto-debit pass filters
                                    // on 'cancelled' alone, so an invoice
                                    // already issued is still taken out of
                                    // the customer's wallet on its due date —
                                    // pausing stops NEW invoices, not the
                                    // collection of old ones.
                                    lead: "No new invoices are raised while it is paused. An invoice that has already been issued is still collected from their wallet on its due date — void it first if that is not what you want.",
                                    cta: "Yes, pause it",
                                    done: "Subscription paused successfully.",
                                  })
                                }
                                  disabled={pending}
                                >
                                  {pending ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <PauseCircle />
                                  )}
                                  <span className="alab">Pause</span>
                                </button>
                                <button
                                  className="btn ghost sm"
                                  title="Disable"
                                  aria-label="Disable"
                                  onClick={() =>
                                  askStatus(s, "inactive", {
                                    title: "Stop this plan?",
                                    // "It does not backfill" was false.
                                    // next_payment_date is never moved, so on
                                    // reactivation generation resumes from the
                                    // stale date and walks forward through
                                    // every month that was skipped, raising
                                    // and auto-debiting each one. A plan off
                                    // for three months is billed for three.
                                    // ...AND IT REACTIVATES ITSELF. When
                                    // that already-issued invoice IS
                                    // collected, the paid-invoice trigger
                                    // sets the subscription back to active
                                    // and rolls the period forward — so
                                    // "billing stops" is true until the
                                    // first successful debit and false
                                    // afterwards. Said out loud until the
                                    // SQL is fixed.
                                    lead: "No new invoice is raised. But an invoice already issued is still collected from the wallet on its due date — and when that collection succeeds the subscription currently switches itself back to active and carries on monthly. Check their open invoices first.",
                                    cta: "Yes, stop it",
                                    danger: true,
                                    done: "Subscription disabled successfully.",
                                  })
                                }
                                  disabled={pending}
                                  style={{
                                    color: "var(--danger)",
                                    borderColor: "var(--danger)",
                                  }}
                                >
                                  {pending ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <MinusCircle />
                                  )}
                                  <span className="alab">Disable</span>
                                </button>
                              </>
                            )}

                            {s.status === "paused" && (
                              <button
                                className="btn sm"
                                onClick={() =>
                                  askStatus(s, "active", {
                                    title: "Start billing this customer?",
                                    lead: "It begins a recurring monthly charge. If this plan was paused or stopped, the billing run starts from its stored next-payment date and walks forward — so every month it was off is invoiced on the next pass and auto-debited from the wallet. Move the next payment date first if you do not want that.",
                                    cta: "Yes, activate it",
                                    done: "Subscription activated successfully.",
                                  })
                                }
                                disabled={pending}
                              >
                                {pending ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <PlayCircle />
                                )}
                                Unpause
                              </button>
                            )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          {/* "You have none" and "your filters match none" are different
              facts. On a billing screen the first one reads as "nobody is
              being charged", which is a sentence nobody should see because
              a status chip was left set. */}
          <p className="muted" style={{ margin: 0 }}>
            {search && searchIsPageOnly
              ? `No subscriptions on THIS PAGE match “${search}” — the search only looks at the ${subscriptions.length} rows loaded, and there are ${total}. Page through, or narrow with the status filter first.`
              : search
                ? `No subscriptions match “${search}”.`
                : status !== "all" || date
                  ? "No subscriptions match the filters you have set."
                  : "No subscriptions yet."}
          </p>
          {search || status !== "all" || date ? (
            <button
              className="btn ghost sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                setSearch("");
                setStatus("all");
                setDate("");
              }}
            >
              Clear the search and filters
            </button>
          ) : null}
        </div>
      )}

      {total > PER_PAGE && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <span className="muted" style={{ fontSize: ".85rem" }}>
            Page {page} of {totalPages}
          </span>
          <button
            className="btn ghost sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <button
            className="btn ghost sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      )}

      <CreateSubscriptionDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <ChangeSubscriptionAmountDialog
        subscription={amountEditSub}
        open={!!amountEditSub}
        onOpenChange={(value) => {
          if (!value) setAmountEditSub(null);
        }}
      />

      <ConfirmModal
        open={!!ask}
        onOpenChange={(next) => {
          if (!next) setAsk(null);
        }}
        title={ask?.title ?? ""}
        lead={ask?.lead}
        cta={ask?.cta ?? "Confirm"}
        tone={ask?.danger ? "danger" : "default"}
        busy={isStatusUpdating}
        busyLabel="Saving…"
        onConfirm={() => {
          const a = ask;
          setAsk(null);
          a?.run();
        }}
      >
        {(ask?.facts ?? []).map(([k, v]) => (
          <ConfirmFact key={k} label={k} value={v} strong={k === "Monthly"} />
        ))}
      </ConfirmModal>
    </div>
  );
}
