/**
 * What state an ad account is in — and the difference between a state
 * somebody CHOSE and a state that is simply true.
 *
 * The admin form used to be a switch: on wrote 'active', off wrote
 * 'inactive'. That collapses three different situations into one word. An
 * account we switched off ourselves, an account the platform banned, and an
 * account nobody has touched since August are not the same thing: the first
 * two are decisions with a reason behind them, the third is just quiet. A
 * desk that cannot tell them apart chases the wrong one.
 *
 * So:
 *   - active / disabled / banned are CHOICES. An admin picks one, and it is
 *     stored on the row.
 *   - inactive is a FACT, derived from the account's own history: no top-up
 *     in 30 days. Nothing writes it, so nothing has to un-write it — the
 *     moment a top-up lands the account reads active again, with no cron
 *     job to run and no stale row to correct.
 *
 * Other values (paused, suspended, pending) already exist on live rows —
 * the supplier pool sync writes paused/suspended and a fresh request starts
 * as pending. They are shown as themselves and never rewritten by the form.
 */

export const INACTIVE_AFTER_DAYS = 30;

export type AdAccountStatusTone = "ok" | "pend" | "due" | "muted";

/** The three an admin may choose, in the order they belong in a menu. */
export const AD_ACCOUNT_STATUS_CHOICES = [
  {
    value: "active",
    label: "Active",
    hint: "Running. Top-ups and spend allowed.",
  },
  {
    value: "disabled",
    label: "Disabled",
    hint: "Switched off by us. No new top-ups.",
  },
  {
    value: "banned",
    label: "Banned",
    hint: "Closed by the platform. No new top-ups.",
  },
] as const;

const LABELS: Record<string, { label: string; tone: AdAccountStatusTone }> = {
  active: { label: "Active", tone: "ok" },
  inactive: { label: "Inactive", tone: "muted" },
  disabled: { label: "Disabled", tone: "due" },
  banned: { label: "Banned", tone: "due" },
  paused: { label: "Paused", tone: "pend" },
  suspended: { label: "Suspended", tone: "due" },
  pending: { label: "Pending", tone: "pend" },
  rejected: { label: "Rejected", tone: "due" },
};

export type AdAccountStatusView = {
  /** The value to render. May be "inactive" while the row says "active". */
  key: string;
  label: string;
  tone: AdAccountStatusTone;
  /** Why it reads this way, for a title attribute. Empty when obvious. */
  why: string;
  /** True when the label came from the history, not from the row. */
  derived: boolean;
};

function titleCase(v: string): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * @param status         the stored ad_accounts.status
 * @param lastActivityAt the newest COMPLETED top-up on this account, or null
 * @param openedAt       when the account started existing (start_date or
 *                       created_at) — an account created yesterday with no
 *                       top-ups yet is new, not inactive
 * @param nowMs          injected so this is testable and so a list renders
 *                       every row against the same instant
 */
export function adAccountStatusView(
  status: string | null | undefined,
  lastActivityAt: string | null | undefined,
  openedAt: string | null | undefined,
  nowMs: number,
): AdAccountStatusView {
  const raw = (status ?? "").trim().toLowerCase();
  const known = LABELS[raw];
  const base: AdAccountStatusView = known
    ? { key: raw, label: known.label, tone: known.tone, why: "", derived: false }
    : {
        key: raw || "unknown",
        label: raw ? titleCase(raw) : "Unknown",
        tone: "muted",
        why: raw ? "" : "This account has no status on its record.",
        derived: false,
      };

  // Only an ACTIVE account can be quietly inactive. A banned account is
  // banned whether or not anybody topped it up last month, and overriding
  // that label would hide the reason it stopped.
  if (raw !== "active") return base;

  const cutoff = nowMs - INACTIVE_AFTER_DAYS * 86_400_000;
  const last = lastActivityAt ? Date.parse(lastActivityAt) : NaN;
  if (Number.isFinite(last)) {
    if (last >= cutoff) return base;
    return {
      key: "inactive",
      label: "Inactive",
      tone: "muted",
      why: `No top-up in the last ${INACTIVE_AFTER_DAYS} days. The account is still open — a top-up makes it active again.`,
      derived: true,
    };
  }

  // Never topped up. That is only "inactive" once it has had the chance.
  const opened = openedAt ? Date.parse(openedAt) : NaN;
  if (Number.isFinite(opened) && opened < cutoff) {
    return {
      key: "inactive",
      label: "Inactive",
      tone: "muted",
      why: `Never topped up, and open for more than ${INACTIVE_AFTER_DAYS} days.`,
      derived: true,
    };
  }
  return base;
}
