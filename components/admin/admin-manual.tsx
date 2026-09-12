import {
  ArrowUpRight,
  BookOpen,
  Coins,
  Download,
  FileText,
  Gift,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";

// In-app ADMIN HANDBOOK. Static, presentational how-to reference for the
// day-to-day admin workflows, rendered inside the admin shell (.psmapp /
// .psmview) so it uses the same PSM_APP_CSS tokens and classes as the real
// queues. No data fetching, no mutations — the page-level requireAdmin()
// guard is the only server work.

type Tone = "ok" | "pend" | "due" | "info";

type Note = { label: string; tone: Tone; text: string };

type Section = {
  id: string;
  title: string;
  icon: LucideIcon;
  path: string; // where it lives in the sidebar
  intro: string;
  steps: string[];
  notes?: Note[];
};

const SECTIONS: Section[] = [
  {
    id: "wallet-topups",
    title: "Wallet top-ups",
    icon: Upload,
    path: "Money › Wallet Topups",
    intro:
      "Advertisers pay by bank transfer and upload a slip; the money only reaches their wallet once you verify it here. Always match the amount and reference against the bank before crediting.",
    steps: [
      "Open Money › Wallet Topups. The queue defaults to Pending. Use the search box for a reference, and the status / currency selectors to narrow the list.",
      "Click a card (not a button) to open the full details sheet, or click Slip to view the uploaded payment slip and confirm the transfer really landed.",
      "Verify — opens the approve dialog. Confirm to credit the wallet through the verify RPC. The amount and currency shown are what will be credited.",
      "Reject — opens the reject dialog. A reason is required; the advertiser sees it and the wallet is not credited.",
      "Precharge — advance-credit the wallet now, before the transfer clears. Use it only when you can see the money is genuinely on its way; it settles automatically when you later verify the same top-up.",
    ],
    notes: [
      {
        label: "Reason required",
        tone: "due",
        text: "Rejecting always needs a reason — it is shown to the advertiser.",
      },
      {
        label: "Check first",
        tone: "pend",
        text: "Verify credits real money. Confirm against the bank statement and the slip before you click.",
      },
    ],
  },
  {
    id: "ad-topups",
    title: "Ad-account top-ups",
    icon: Coins,
    path: "Money › Ad-account Topups",
    intro:
      "This queue moves money from an advertiser wallet onto an ad account, minus the effective fee. Verifying is where the fee is applied, so review it before confirming.",
    steps: [
      "Open Money › Ad-account Topups. Search by advertiser, client code or top-up number and filter by status (Pending / Completed).",
      "Click Verify to open the top-up invoice. It shows the amount received, the fee percentage and the resulting net credit, recalculated live.",
      "The Fee field defaults to the advertiser plan fee. Leave it untouched to charge the plan default; change it only to override the fee for this single top-up.",
      "Click Verify Payment to confirm. The server is authoritative — an untouched fee sends no override, a changed fee rewrites the charge for this top-up only.",
      "Use Reject for a bad transfer, or Details for a read-only view of any row.",
    ],
    notes: [
      {
        label: "Fee override",
        tone: "info",
        text: "Editing the fee only affects this top-up; it does not change the advertiser plan.",
      },
    ],
  },
  {
    id: "requests",
    title: "Ad-account requests",
    icon: FileText,
    path: "Customers › Account Requests",
    intro:
      "Advertisers request new ad accounts here. Approving sets the account up on our Business Manager (typically live in 3–12h). The sidebar badge shows how many are waiting.",
    steps: [
      "Open Customers › Account Requests. Sort by newest / oldest and use the status filter (Pending, Payment pending, In progress, Completed, Rejected, Cancelled).",
      "Click Review on a request to open the decision dialog, or Details for a read-only sheet.",
      "Create invoice — bill the setup / first charge for the request when payment is due before provisioning.",
      "Create ad account — provision the account from the request once it is ready to go live.",
      "Reject — decline the request with a reason.",
    ],
    notes: [
      {
        label: "Order matters",
        tone: "info",
        text: "Invoice first when the request should be paid before the account is created; the status filter tracks where each one is.",
      },
    ],
  },
  {
    id: "advertisers",
    title: "Advertisers",
    icon: Users,
    path: "Customers › Advertisers",
    intro:
      "The full customer list for your tenant, with plan, wallet-top-up totals and account status. This is your starting point for looking a customer up.",
    steps: [
      "Open Customers › Advertisers. Search by name or email, sort (newest, oldest, A→Z, Z→A, by ID) and filter by Active / Inactive.",
      "Click any row to open the details sheet with the customer's full profile and history.",
      "Plan column: an existing subscription shows as a status badge; if there is none, click + Subscription to create one.",
      "Commission — open the commission-setup dialog to configure how this advertiser earns referral commission.",
      "Activate / Deactivate — toggles the account. A deactivated customer keeps their data but loses access until reactivated.",
      "Download CSV — exports the whole user list (with client code, fees and status) for offline reporting.",
    ],
    notes: [
      {
        label: "Access control",
        tone: "pend",
        text: "Deactivating signs a customer out of the app — use it when an account should be frozen, not deleted.",
      },
    ],
  },
  {
    id: "wallets",
    title: "Wallets",
    icon: Wallet,
    path: "Money › Wallets",
    intro:
      "The balance ledger — every advertiser's EUR and USD wallet. Reads are for review; the edit action sets a balance directly, so treat it as a last resort.",
    steps: [
      "Open Money › Wallets. Search by client code, advertiser, email or wallet ID and sort by date or by balance (high/low, per currency).",
      "Details — opens the wallet activity sheet to see how a balance was reached.",
      "Edit — sets the EUR / USD balance directly. A reason (min. 3 characters) is required and the change is logged.",
      "Min amount — sets the minimum top-up allowed for that wallet.",
    ],
    notes: [
      {
        label: "Prefer adjustments",
        tone: "due",
        text: "For a correction, prefer a wallet Adjustment (owner-approved, on Withdrawals) over a direct balance edit — it leaves a reviewable trail.",
      },
    ],
  },
  {
    id: "withdrawals",
    title: "Withdrawals, refunds & adjustments",
    icon: Download,
    path: "Money › Withdrawals",
    intro:
      "Four tabs behind one screen. Approvals here move money, so verify before acting. Refunds and adjustments follow an admin-requests → owner-approves flow.",
    steps: [
      "Withdrawals — advertisers pull an ad-account balance back to their wallet. Approve to credit their wallet immediately, or Reject. This one you can complete as an admin.",
      "Refunds — when a customer leaves, refund their wallet balance to their bank. Click Request refund and fill in the payout details. The super-admin (tenant owner) approves before money moves; until then it shows awaiting owner.",
      "Adjustments — request a +/- correction to a wallet balance with a reason. Again, the super-admin approves before the balance changes.",
      "Precharge — advance wallet credit before a payment clears, then Settle once the money arrives. The banner totals outstanding advances across all customers.",
    ],
    notes: [
      {
        label: "Super-admin approves",
        tone: "info",
        text: "Refunds and adjustments are requests only for admins — the owner approves them (see the escalation section).",
      },
      {
        label: "Moves money",
        tone: "pend",
        text: "Approving a withdrawal or settling a precharge changes a live balance. Double-check the amount and payee.",
      },
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    icon: RefreshCw,
    path: "Money › Subscriptions",
    intro:
      "Recurring monthly plans for advertisers. Create new ones, and pause or disable existing ones; changing the monthly amount is reserved for the super-admin.",
    steps: [
      "Open Money › Subscriptions. Search by advertiser and filter by status (Active / Inactive / Paused) or start date.",
      "New Subscription — opens the create dialog to set up a monthly plan for an advertiser.",
      "On an inactive plan, click Activate to start billing; on a running plan use Pause / Unpause or Disable.",
      "Amount — changes the monthly charge. This control is visible to the super-admin only.",
    ],
    notes: [
      {
        label: "Super-admin only",
        tone: "info",
        text: "Editing the monthly amount is owner-restricted; admins can create, pause, unpause and disable.",
      },
    ],
  },
  {
    id: "promotions",
    title: "Promotions & perks",
    icon: Gift,
    path: "More › Promotions",
    intro:
      "Grant advertisers perks — free ad-account requests, a subscription waiver or discount, or a top-up-fee waiver / discount — and revoke them when they no longer apply.",
    steps: [
      "Open More › Promotions. Under Grant a perk, pick the advertiser and the perk kind.",
      "Fill the kind-specific field: a count for free ad-account requests, or a percentage for a discount. Add an optional expiry (leave empty for open-ended) and a note.",
      "Click Grant perk to apply it.",
      "The table below lists active and recent perks; filter by status / kind, and click Revoke to end an active perk.",
    ],
    notes: [
      {
        label: "Coming soon",
        tone: "pend",
        text: "Perks marked coming soon are stored now but not yet enforced automatically — apply them manually until they go live.",
      },
    ],
  },
  {
    id: "escalate",
    title: "When to escalate to the super-admin",
    icon: ShieldCheck,
    path: "Owner group (super-admin only)",
    intro:
      "Some surfaces belong to the tenant owner. If you hit one of these, hand it to a super-admin rather than working around it.",
    steps: [
      "Refund & adjustment approval — you can request them; only the owner approves and moves the money.",
      "Reconciliation — the does-everything-add-up view. If a balance looks wrong, do not hand-edit; raise it here with the owner.",
      "Finance settings — bank destinations, fees and tenant configuration are owner-only.",
      "Admins & invites, activity and audit logs — managing other admins and reviewing the full audit trail is owner-only.",
    ],
    notes: [
      {
        label: "Do not hand-edit",
        tone: "due",
        text: "If money does not reconcile, escalate — a manual balance edit hides the discrepancy instead of fixing it.",
      },
    ],
  },
];

const GOLDEN_RULES = [
  "Reads are safe. Any action that moves money or changes a customer record is logged — act deliberately.",
  "Always check the payment slip and the bank before verifying a wallet top-up.",
  "Every rejection needs a reason. The advertiser sees it, so make it clear.",
  "Refunds and adjustments are requests — the super-admin approves before money moves.",
  "If a balance does not add up, do not hand-edit it. Escalate to the super-admin and check Reconciliation.",
];

const MANUAL_CSS = `
.psm-manual{display:flex;flex-direction:column;gap:18px}
.psm-manual .lead{color:var(--muted);font-size:.95rem;max-width:72ch;margin:0}
.psm-manual .toc{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:4px}
.psm-manual .toc a{display:flex;align-items:center;gap:11px;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2);color:var(--ink);font-weight:600;font-size:.88rem;transition:.14s}
.psm-manual .toc a:hover{border-color:var(--primary);color:var(--primary-600);background:var(--primary-tint);transform:translateY(-1px)}
.psm-manual .toc a .num{width:24px;height:24px;flex:0 0 auto;border-radius:7px;display:grid;place-items:center;background:var(--panel);border:1px solid var(--line-2);font-family:var(--hd);font-weight:800;font-size:.78rem;color:var(--primary-600)}
.psm-manual section{scroll-margin-top:84px;display:flex;flex-direction:column;gap:12px}
.psm-manual .sec-h{display:flex;align-items:center;gap:12px}
.psm-manual .sec-h h2{margin:0}
.psm-manual .sec-h .num{margin-left:auto;font-family:var(--hd);font-weight:800;font-size:.9rem;color:var(--faint)}
.psm-manual .path{display:inline-flex;align-items:center;gap:7px;font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--primary-600);background:var(--primary-tint);border:1px solid #cfe0ff;border-radius:99px;padding:5px 11px;align-self:flex-start}
.psm-manual ol.steps{counter-reset:step;list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:11px}
.psm-manual ol.steps>li{position:relative;padding-left:40px;font-size:.92rem;line-height:1.5}
.psm-manual ol.steps>li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:-1px;width:27px;height:27px;border-radius:8px;background:var(--brand);color:#fff;font-family:var(--hd);font-weight:800;font-size:.82rem;display:grid;place-items:center;box-shadow:0 8px 18px -10px rgba(124,92,255,.7)}
.psm-manual .notes{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.psm-manual .note{display:flex;align-items:flex-start;gap:10px;font-size:.86rem;line-height:1.45;color:var(--muted)}
.psm-manual .note .badge{flex:0 0 auto;margin-top:1px}
.psm-manual .rules{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.psm-manual .rules>li{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--line);font-size:.9rem;line-height:1.5}
.psm-manual .rules>li:first-child{border-top:0}
.psm-manual .rules>li .dot{width:20px;height:20px;flex:0 0 auto;margin-top:1px;border-radius:6px;background:var(--win-soft);color:#0e8f66;display:grid;place-items:center;font-weight:800;font-size:.7rem}
.psm-manual .backtop{align-self:flex-start;font-size:.8rem;font-weight:700;color:var(--faint)}
.psm-manual .backtop:hover{color:var(--primary-600)}
`;

export default function AdminManual() {
  return (
    <div
      className="psmview psm-manual"
      id="manual-top"
    >
      <style>{MANUAL_CSS}</style>

      <div className="phead">
        <div>
          <h1>Admin handbook</h1>
          <p>How to run the day-to-day admin desk — the money queues, customer records and where each control lives.</p>
        </div>
      </div>

      {/* Intro + what to expect */}
      <div className="card">
        <div className="sec-h" style={{ marginBottom: 10 }}>
          <span className="pfi">
            <BookOpen />
          </span>
          <h2>Before you start</h2>
        </div>
        <p className="lead">
          This handbook is the working reference for admins. Each section says
          where the tool lives in the sidebar, what it does, and the exact steps
          to run it. Reading data is always safe — but anything that moves money
          or changes a customer record is logged, so work deliberately. Controls
          in the Owner group are for the super-admin; the last section covers
          when to hand something over.
        </p>
      </div>

      {/* Table of contents / anchor nav */}
      <div className="card">
        <div className="sec-h" style={{ marginBottom: 10 }}>
          <h2>Jump to a workflow</h2>
        </div>
        <nav className="toc" aria-label="Handbook sections">
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`}>
              <span className="num">{i + 1}</span>
              {s.title}
            </a>
          ))}
        </nav>
      </div>

      {/* Workflow sections */}
      {SECTIONS.map((s, i) => {
        const Icon = s.icon;
        return (
          <section key={s.id} id={s.id}>
            <div className="card">
              <div className="sec-h">
                <span className="pfi">
                  <Icon />
                </span>
                <h2>{s.title}</h2>
                <span className="num">{i + 1}</span>
              </div>
              <span className="path" style={{ marginTop: 12 }}>
                {s.path}
              </span>
              <p className="lead" style={{ marginTop: 12 }}>
                {s.intro}
              </p>

              <ol className="steps" style={{ marginTop: 16 }}>
                {s.steps.map((step, si) => (
                  <li key={si}>{step}</li>
                ))}
              </ol>

              {s.notes && s.notes.length > 0 && (
                <div className="notes" style={{ marginTop: 16 }}>
                  {s.notes.map((n, ni) => (
                    <div className="note" key={ni}>
                      <span className={`badge ${n.tone}`}>{n.label}</span>
                      <span>{n.text}</span>
                    </div>
                  ))}
                </div>
              )}

              <a className="backtop" href="#manual-top" style={{ marginTop: 14 }}>
                ↑ Back to top
              </a>
            </div>
          </section>
        );
      })}

      {/* Golden rules */}
      <div className="card">
        <div className="sec-h" style={{ marginBottom: 12 }}>
          <span className="pfi">
            <ShieldCheck />
          </span>
          <h2>Golden rules</h2>
        </div>
        <ul className="rules">
          {GOLDEN_RULES.map((rule, i) => (
            <li key={i}>
              <span className="dot">
                <ArrowUpRight style={{ width: 12, height: 12 }} />
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
