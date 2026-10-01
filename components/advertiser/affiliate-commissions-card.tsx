"use client";

import { useT } from "@/hooks/use-t";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import PlatformMark from "@/components/psm/platform-mark";
import { Ic } from "@/components/advertiser/adv-icons";
import SlideSeg from "@/components/advertiser/slide-seg";

// ── EVERY COMMISSION, AND NOTHING ABOUT OUR MARGIN ──────────────────────
//
// The owner: an advertiser who refers people "must be able to see all
// referrals in detail, per referral all his earnings and type, and sort
// -- nicely transparent". The summary table says what each customer
// brought in; this lists every single commission behind those totals, so
// every figure on the Referrals screen can be traced to its rows.
//
// It reads affiliate_commission_list (plak 39), which returns the date,
// the customer, the kind, the amount and the status -- and deliberately
// not the base or the percentage: amount / percentage is our profit.

type Row = {
  commission_id: string;
  created_at: string;
  referral_link_id: string;
  referred_advertiser_code: string | null;
  referred_advertiser_name: string | null;
  kind: string;
  amount: number | string | null;
  currency: string;
  status: string;
  /** Meta / Google / TikTok for a top-up -- the network, never the
   *  account type (plak 40). Absent before that plak. */
  network?: string | null;
  /** ── WHERE THE ELEVEN CENTS CAME FROM ────────────────────────────
   *  The owner, 23-09: "hoeveel topup er is gedaan, zeer klein subtiel
   *  ... 11 cent uitkomen". This is the top-up itself, or the invoice
   *  behind a subscription commission -- the referred customer's own
   *  figure, whose sum the affiliate already reads as "Spend driven".
   *
   *  NOT the profit, the percentage or the supplier's cut. Commission =
   *  20% x (our fee - what the supplier charges us), so the percentage
   *  beside the amount IS the profit, and a customer who knows their own
   *  fee then has our cost price. The whole chain is on the ADMIN side,
   *  on /affiliates: "20% of profit EUR 0.53 (fee EUR 3.00 - supplier 2%
   *  = EUR 2.45)". That is where it belongs, and only there.
   *
   *  Absent before plak 70. */
  source_amount?: number | string | null;
};

type Sort = "newest" | "oldest" | "largest";
type KindFilter = "all" | "topup" | "subscription" | "onetime";
type StatusFilter = "all" | "owed" | "paid";

const KIND_LABEL: Record<string, string> = {
  topup: "Top-up",
  subscription: "Subscription",
  onetime: "Welcome bonus",
};

// What the commission came from, as a mark: the network's own logo for a
// top-up (Meta, never the account type), a receipt for a plan invoice, a
// gift for the welcome bonus.
function kindMark(r: Row) {
  if (r.kind === "topup") {
    return (
      <span className="pfi">
        <PlatformMark slug={r.network ?? null} className="pmark" />
      </span>
    );
  }
  if (r.kind === "subscription") {
    return (
      <span className="pfi k-sub">
        <Ic name="i-receipt" />
      </span>
    );
  }
  return (
    <span className="pfi k-bonus">
      <Ic name="i-gift" />
    </span>
  );
}

function statusBadge(status: string) {
  if (status === "paid") return <span className="badge ok xs">Paid</span>;
  // NOT "To be paid". On a commission that came from an invoice the
  // customer has ALREADY paid, that reads as "the customer still owes
  // this" -- the owner read it exactly that way. What is waiting is OUR
  // payout to the affiliate, so say that.
  if (status === "owed")
    return <span className="badge pend xs">Awaiting payout</span>;
  if (status === "processing") return <span className="badge muted xs">Processing</span>;
  if (status === "reversed") return <span className="badge muted xs">Reversed</span>;
  return <span className="badge muted xs">{status}</span>;
}

function sumBy(rows: Row[], pick: (r: Row) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!pick(r)) continue;
    const n = Number(r.amount);
    if (!Number.isFinite(n)) continue;
    const c = String(r.currency || "EUR").toUpperCase();
    out[c] = Math.round(((out[c] ?? 0) + n) * 100) / 100;
  }
  return out;
}

// The page's lead currency first, the other on its own line under it --
// never added, and never "€12.40 + $38.75" squeezed into a cell a third of
// a phone wide. A dollar-only affiliate sees dollars, not a €0.00.
function money(m: Record<string, number>, lead: string) {
  const legs = Object.entries(m)
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .sort(([a], [b]) => (a === lead ? -1 : b === lead ? 1 : a.localeCompare(b)));
  if (!legs.length) return formatCurrency(0, lead);
  const [[c1, v1], ...rest] = legs;
  return (
    <>
      {formatCurrency(v1, c1)}
      {rest.map(([c, v]) => (
        <span className="v2" key={c}>
          {formatCurrency(v, c)}
        </span>
      ))}
    </>
  );
}

export default function AffiliateCommissionsCard({
  enabled,
  focusCode,
  onClearFocus,
  from = null,
  to = null,
  periodLabel,
  leadCurrency = "EUR",
  payableAllTime = null,
}: {
  enabled: boolean;
  /** A referral picked in the table above -- the list narrows to them. */
  focusCode: string | null;
  onClearFocus: () => void;
  /** The period picked above the stats (yyyy-mm-dd, inclusive); null = all time. */
  from?: string | null;
  to?: string | null;
  /** "1 – 22 Sep 2026" -- said beside the totals, so they are never read as all-time. */
  periodLabel?: string;
  /** The currency the affiliate earned most in: it goes first in every sum. */
  leadCurrency?: "EUR" | "USD";
  /** What a payout would ACTUALLY be, all time, net of clawbacks -- the
   *  figure the Getting-paid card and the RPC both use. See the note by
   *  the sums below for why this card needs it. */
  payableAllTime?: { eur: number; usd: number } | null;
}) {
  const { t: tr, tx } = useT();
  const [sort, setSort] = useState<Sort>("newest");
  // Five is enough to see what is going on; the rest is one tap away.
  const [showAll, setShowAll] = useState(false);
  const PAGE = 5;
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  // The same widening as useAffiliateStats: a date is a whole local day.
  const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : null;
  const toIso = to ? new Date(`${to}T23:59:59.999`).toISOString() : null;

  const q = useQuery({
    queryKey: ["affiliate-commissions", fromIso ?? "", toIso ?? ""],
    enabled,
    refetchOnWindowFocus: true,
    // Keep the previous period on screen while the next one loads, so the
    // list does not blink empty between two pills.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("affiliate_commission_list", {
        p_from: fromIso,
        p_to: toIso,
      });
      if (error) {
        if (/PGRST202|could not find the function|does not exist/i.test(String(error.message))) {
          return { missing: true as const, rows: [] as Row[] };
        }
        throw error;
      }
      return { missing: false as const, rows: (data ?? []) as Row[] };
    },
  });

  const all = useMemo(() => q.data?.rows ?? [], [q.data]);

  const focused = useMemo(
    () => all.filter((r) => (focusCode ? r.referred_advertiser_code === focusCode : true)),
    [all, focusCode],
  );
  // The kind narrows everything below it, the three sums included. The
  // sums are the status filter: pressing one shows the rows it adds up.
  const ofKind = useMemo(
    () => (kind === "all" ? focused : focused.filter((r) => r.kind === kind)),
    [focused, kind],
  );

  const rows = useMemo(() => {
    let list = ofKind;
    if (status !== "all") list = list.filter((r) => r.status === status);
    const byTime = (r: Row) => Date.parse(r.created_at) || 0;
    list = [...list].sort((a, b) =>
      sort === "oldest"
        ? byTime(a) - byTime(b)
        : sort === "largest"
          ? (Number(b.amount) || 0) - (Number(a.amount) || 0)
          : byTime(b) - byTime(a),
    );
    return list;
  }, [ofKind, status, sort]);

  // Each sum is the sum of the rows its own button shows. Reversed and
  // still-processing rows are listed under Earned but are not money.
  const earned = sumBy(ofKind, (r) => r.status === "paid" || r.status === "owed");
  // Rows that are listed but are NOT in the sums: still being calculated,
  // or taken back. Without a line saying so, "5 commissions" over
  // "Earned EUR 38.00" looks like arithmetic that does not add up.
  const notCounted = ofKind.filter(
    (r) => r.status !== "paid" && r.status !== "owed",
  ).length;
  const owed = sumBy(ofKind, (r) => r.status === "owed");
  const paid = sumBy(ofKind, (r) => r.status === "paid");

  // ---- THE SUMS ARE OF THE ROWS; A PAYOUT IS NOT ------------------
  //
  // These three tiles are the status filter: each is the sum of the rows
  // it shows. That is right, and it is also not what will be paid -- a
  // clawback takes money back WITHOUT changing any commission row, so
  // this card said "Awaiting payout EUR 20,00" three inches above a
  // Getting-paid card reading EUR 15,96, on the same screen, EUR 4,04
  // apart. Measured on production for PSM0005.
  //
  // So the tiles stay sums of rows and one line underneath reconciles
  // them with the figure that will actually land.
  const leadKey = String(leadCurrency).toLowerCase() === "usd" ? "usd" : "eur";
  const owedListed = Number(owed[leadCurrency] ?? 0);
  const payableLead = payableAllTime
    ? Number(payableAllTime[leadKey as "eur" | "usd"] ?? 0)
    : null;
  const clawedBack =
    payableLead !== null && owedListed - payableLead > 0.005
      ? owedListed - payableLead
      : null;

  // isPending, not isLoading: react-query v5 reports isLoading FALSE for a
  // query that is switched off, so with no advertiser row this card printed
  // three confident EUR 0,00 sums and "No commission yet" for a read that
  // was never made. Every sibling read on this screen already guards this
  // way; this card was the one that was missed.
  const dash = !enabled || q.isPending || q.isError || q.data?.missing;

  return (
    <div className={`card xlist${q.isPlaceholderData ? " busy" : ""}`}>
      <div className="xl-head">
        <span className="xl-ic">
          <Ic name="i-wallet" />
        </span>
        <div className="xl-ttl">
          <h2>{tr("label.comm.everyCommission")}</h2>
          <span className="xl-sub">
            {periodLabel ?? tr("label.comm.allTime")}
            {!dash ? ` · ${rows.length} ${rows.length === 1 ? "commission" : "commissions"}` : null}
          </span>
        </div>
        <label className="xsel xl-sort">
          <select aria-label={tr("comm.sort")} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">{tr("label.comm.newest")}</option>
            <option value="oldest">{tr("label.comm.oldest")}</option>
            <option value="largest">{tr("label.comm.largest")}</option>
          </select>
          <Ic name="i-chev" />
        </label>
      </div>

      {focusCode ? (
        <div className="xl-focus">
          {tr("label.comm.only")}{" "}<b>{focusCode}</b>
          <button type="button" onClick={onClearFocus} title={tr("comm.showEveryReferralAgain")}>
            {tr("label.comm.showAll")}</button>
        </div>
      ) : null}

      {/* What it came from: one row, a thumb that glides. */}
      <SlideSeg
        tone="soft"
        className="xl-kind"
        ariaLabel="Kind"
        active={kind}
        options={(["all", "topup", "subscription", "onetime"] as KindFilter[]).map((k) => ({
          key: k,
          label: k === "all" ? tr("label.comm.all") : k === "topup" ? "Top-ups" : k === "subscription" ? tr("label.comm.plans") : "Bonus",
          onClick: () => setKind(k),
        }))}
      />

      {/* The three sums ARE the status filter: one row, each the sum of
          the rows it shows when pressed. */}
      {clawedBack !== null && !dash ? (
        <p
          className="xl-claw"
          style={{
            margin: "6px 2px 0",
            fontSize: ".8rem",
            lineHeight: 1.45,
            color: "var(--txt-2)",
          }}
        >
          {/* ── DO NOT NAME A CAUSE WE HAVE NOT ESTABLISHED ───────
              This said the difference "came back off an ad account", and
              it is two things at once:

              * `payableAllTime` is unpaid MINUS the clawbacks not yet
                attached to a payout, and `unpaid` itself already excludes
                every commission with a payout_id -- so a commission
                sitting in a request the affiliate has ALREADY made widens
                this gap and was being reported as a clawback.
              * and a clawback is not always an ad account. Of the two on
                the live database, one reads "Wallet refund RF-763569" and
                the other "Ad-account withdrawal WD-036508".

              affiliate_commission_list does not return payout_id, so this
              card cannot tell the two apart -- and saying which one it was
              is not what the sentence is for. What it owes the reader is
              the figure a payout would be. */}
          {money({ [leadCurrency]: clawedBack }, leadCurrency)} {" "}{tr("comm.ofThisIsnTFree")}{" "}
          <b>{money({ [leadCurrency]: payableLead ?? 0 }, leadCurrency)}</b>.
        </p>
      ) : null}
      <div className="xl-money" role="radiogroup" aria-label="Status">
        {(
          [
            ["all", "Earned", earned, "b"],
            ["owed", "Awaiting payout", owed, "g"],
            ["paid", "Paid", paid, "w"],
          ] as const
        ).map(([st, label, sum, tint]) => (
          <button
            key={st}
            type="button"
            role="radio"
            aria-checked={status === st}
            className={`xm ${tint}${status === st ? " on" : ""}`}
            onClick={() => setStatus(st)}
          >
            <span className="l">{tx(label)}</span>
            <span className="v">{dash ? "—" : money(sum, leadCurrency)}</span>
          </button>
        ))}
      </div>

      {!dash && notCounted ? (
        <p className="xl-note">
          {tr("comm.listedButNotCountedAbove", { notCounted: String(notCounted), v: String(notCounted === 1 ? "commission is" : "commissions are") })}</p>
      ) : null}

      {/* isLoading is FALSE for a disabled query in react-query v5, and
          this one is gated on `enabled`. So during that window the card
          fell past its error branch into the genuinely-empty sentence --
          while `dash` twenty lines up, built on `!enabled || q.isPending`,
          correctly printed a dash in the three money tiles directly
          above. One card, two answers: "we don't know" over "you have
          earned nothing", to an affiliate who is owed money. */}
      {!enabled || q.isPending ? (
        <p className="xl-empty">{tr("comm.loadingYourCommissions")}</p>
      ) : q.isError ? (
        <p className="xl-empty">
          {tr("comm.weCouldnTReadYour")}</p>
      ) : q.data?.missing ? (
        <p className="xl-empty">{tr("comm.theDetailedListIsBeing")}</p>
      ) : rows.length ? (
        (showAll ? rows : rows.slice(0, PAGE)).map((r) => {
          const reversed = r.status === "reversed";
          const n = Number(r.amount);
          return (
            <div className="xrow" key={r.commission_id}>
              {kindMark(r)}
              <span className="mid">
                <span className="nm">
                  <span className="t">{r.referred_advertiser_name || tr("label.adv.advertiser")}</span>
                </span>
                <span className="sm">
                  {[
                    dayjs(r.created_at).format("D MMM YYYY"),
                    KIND_LABEL[r.kind] ?? "Commission",
                    r.kind === "topup" && r.network ? r.network : null,
                    r.referred_advertiser_code,
                    // ── "on X" ONLY WHERE X IS REALLY THE BASE ──────
                    //
                    // Undefined until plak 70 lands. It is NOT null for a
                    // welcome bonus: the comment here said it "hangs on
                    // nothing", but affiliate_commission_list returns
                    // `i.total` for any row with a subscription_invoice_id
                    // and the bonus carries one. Measured on the live
                    // database: the one welcome bonus is EUR 10,00 and its
                    // invoice is EUR 10,00, so the row read "Welcome bonus
                    // · on EUR 10,00" -- a flat bonus dressed up as 100%
                    // of an invoice. The two figures being equal is a
                    // coincidence, which is what made it convincing.
                    //
                    // And for a top-up the figure is the TOP-UP, not the
                    // base the percentage ran on. Same database: EUR 0,11
                    // "on EUR 48,50" reads as 0,2%, where the row's own
                    // base_amount is 0,53 and the rate was 20%. The real
                    // base is not printable either -- it is what is left
                    // of our fee after the supplier's cut, so it would
                    // hand an affiliate our margin. So it says what it is:
                    // the top-up it came from.
                    //
                    // A subscription commission genuinely is a percentage
                    // of the invoice total (50% of EUR 10,00 = EUR 5,00,
                    // both rows), and that invoice is the customer's own.
                    // That one keeps "on".
                    r.kind !== "onetime" &&
                    r.source_amount !== null &&
                    r.source_amount !== undefined &&
                    Number.isFinite(Number(r.source_amount))
                      ? `${r.kind === "topup" ? "from a" : "on"} ${formatCurrency(
                          Number(r.source_amount),
                          String(r.currency || "EUR"),
                        )}${r.kind === "topup" ? " top-up" : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="rt">
                <span className={`amt${reversed ? " rev" : ""}`}>
                  {r.amount === null || r.amount === undefined || !Number.isFinite(n)
                    ? "—"
                    : formatCurrency(n, String(r.currency || "EUR"))}
                </span>
                {statusBadge(r.status)}
              </span>
            </div>
          );
        })
      ) : (
        <p className="xl-empty">
          {all.length
            ? tr("comm.nothingMatchesTheseFilters")
            : from || to
              ? tr("comm.noCommissionInThisPeriod")
              : tr("comm.noCommissionYetItAppears")}
        </p>
      )}

      {rows.length > PAGE ? (
        <button className="xl-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? tr("label.adv.showFewer") : tr("adv.viewAll", { length: String(rows.length) })}
          <Ic name="i-chev" />
        </button>
      ) : null}
    </div>
  );
}
