"use client";

import { useT } from "@/hooks/use-t";
import { useState } from "react";

import useNotificationPreferences from "@/hooks/use-notification-preferences";
import { BILLING_EMAIL_TYPES as ALWAYS_EMAILED } from "@/lib/pure-billing-email";
import type { NotificationGroupForRole } from "@/lib/notification-catalog";
import type { NotificationType } from "@/lib/types/notification";

// ── ONE SET OF SWITCHES, TWO SHELLS ─────────────────────────────────
//
// These two lived inside components/advertiser/adv-app.tsx, so the
// affiliate portal had its own pair -- and that pair wrote
// localStorage["aff-notif-*"], which nothing in the repo reads, under the
// sentence "These alerts aren't being sent yet".
//
// They are being sent. Counted on the live database on 27-09:
// referral_commission_earned 4, affiliate_payout_paid 2, referral_joined
// 2, referral_approved 1, affiliate_approved 1 -- the most recent two
// days old. So an affiliate who switched "Commission earned" off kept
// getting it, and was told the switch was for later.
//
// Moved here rather than copied so the next fix lands in one file. Both
// shells carry .toggle-row / .t / .d / .sw and --line / --primary.

/**
 * One switch for a whole subject.
 *
 * On when ANY notice in the group is on -- because that is when the
 * customer still hears something from it. Pressing it writes every type
 * underneath, so there is no half state to puzzle over; "some on" is
 * said in words instead.
 */
export function GroupToggle({ group }: { group: NotificationGroupForRole }) {
  const { t: tr, tx } = useT();
  const { isEnabled, setPreference, setGroup, isError, isLoading } =
    useNotificationPreferences();
  const [open, setOpen] = useState(false);
  const types = group.entries.map((e) => e.type);
  const onCount = types.filter((t) => isEnabled(t)).length;
  const anyOn = onCount > 0;
  const mixed = onCount > 0 && onCount < types.length;
  const busy =
    setPreference.isPending || setGroup.isPending || isError || isLoading;

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <div className="toggle-row">
        <div>
          <div className="t">{tx(group.label)}</div>
          <div className="d">
            {isError
              ? tr("notif.weCouldnTReadYour")
              : isLoading
                ? tr("notif.readingYourSettings")
                : tx(group.description)}
          </div>
          {!isError && !isLoading ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="d"
              style={{
                marginTop: 4,
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                color: "var(--primary)",
                textDecoration: "underline",
              }}
            >
              {open
                ? tr("notif.hideTheIndividualNotices")
                : mixed
                  ? tr("notif.ofOnShowThem", { onCount: String(onCount), length: String(types.length) })
                  : types.length === 1
                    ? tr("notif.showTheOneNotice")
                    : tr("notif.showTheNotices", { length: String(types.length) })}
            </button>
          ) : null}
        </div>
        <button
          className={`sw${isError || isLoading ? "" : anyOn ? " on" : ""}`}
          disabled={busy}
          onClick={() => {
            // All of them, one way. A group that is partly on switches
            // fully off first, which is what pressing a lit switch
            // means everywhere else.
            //
            // ONE mutation, not one per type. Looping `setPreference`
            // fired ten round-trips and left the screen on a half state
            // until a reload -- see the note on setGroup. Only the ones
            // that actually differ are sent.
            const next = !anyOn;
            const todo = types.filter((t) => isEnabled(t) !== next);
            if (todo.length === 0) return;
            setGroup.mutate({ types: todo, enabled: next });
          }}
          aria-pressed={!isError && !isLoading && anyOn}
          aria-label={tx(group.label)}
        />
      </div>
      {open ? (
        <div style={{ paddingLeft: 14, paddingBottom: 6 }}>
          {group.entries.map((entry) => (
            <Toggle
              key={entry.type}
              label={tx(entry.label)}
              desc={tx(entry.description)}
              notifType={entry.type}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Toggle({
  label,
  desc,
  notifType,
}: {
  label: string;
  desc: string;
  notifType: NotificationType;
}) {
  const { t: tr } = useT();
  const { isEnabled, setPreference, isError, isLoading } =
    useNotificationPreferences();
  const on = isEnabled(notifType);
  return (
    <div className="toggle-row">
      <div>
        <div className="t">{label}</div>
        {/* ── A FAILED READ IS NOT "IT IS ON" ─────────────────────────
            The hook defaulted to an empty preference list on any
            failure, which reads as "nothing is disabled" -- so a
            customer who had switched this off saw it rendered ON. They
            either leave it and keep getting alerts they refused, or
            toggle it again and write a preference that was already
            there. Say what happened instead, and do not draw a state
            we do not have. */}
        <div className="d">
          {isError
            ? tr("notif.weCouldnTReadYour2")
            : isLoading
              ? tr("notif.readingYourSetting")
              : desc}
        </div>
        {/* ---- THIS ONE SWITCHES THE PING, NOT THE EMAIL ----------
            The three billing notices are emailed before this
            preference is even read (app/api/push/notify/route.ts,
            step 3a-ter), on purpose and in the owner's words: nobody
            should learn about a debit from their bank. The switch is
            honest about what it does now, because "Pick what's worth a
            ping" over a toggle that leaves the email running is not.
        */}
        {ALWAYS_EMAILED.has(notifType) ? (
          <div className="d" style={{ opacity: 0.85 }}>
            {tr("notif.weAlwaysEmailThisOne")}</div>
        ) : null}
      </div>
      <button
        // ---- AND NOT PRESSABLE BEFORE WE KNOW ITS STATE ----------
        // The hook starts with an empty preference list, and "no row"
        // means enabled -- so every switch renders ON until the read
        // lands. A customer who had muted something and taps it in
        // that window writes the state it was already in and watches
        // it settle to off.
        className={`sw${isError || isLoading ? "" : on ? " on" : ""}`}
        disabled={setPreference.isPending || isError || isLoading}
        onClick={() => setPreference.mutate({ type: notifType, enabled: !on })}
        aria-pressed={!isError && !isLoading && on}
        aria-label={label}
      />
    </div>
  );
}
