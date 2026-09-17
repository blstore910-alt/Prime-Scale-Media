"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * One confirmation, asked the same way everywhere.
 *
 * WHY THIS EXISTS AS A MODAL AND NOT A PANEL
 * Every place that moved money used to do it on the first click, or asked
 * with a bordered panel at the BOTTOM of a long form — which you only see if
 * you happen to have scrolled that far. A confirmation you can miss is not a
 * confirmation. This takes over the screen: nothing else is clickable until
 * the customer answers.
 *
 * It renders in its own portal, so it is safe to open on top of another
 * dialog (the ad-account request does exactly that) — the later portal sits
 * above the earlier one, Escape closes the top layer first, and the form
 * underneath keeps every value the customer typed.
 *
 * WHAT A GOOD BODY LOOKS LIKE
 * The facts of what is about to happen, in the customer's own units: the
 * amount, where it comes from, where it goes, and whether it can be undone.
 * Not a restatement of the button. Use `<ConfirmFact>` for the rows.
 */
export default function ConfirmModal({
  open,
  onOpenChange,
  title,
  lead,
  children,
  cta,
  busy = false,
  busyLabel,
  cancelLabel = "Go back",
  tone = "default",
  onConfirm,
  disabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One sentence under the title. What is about to happen, plainly. */
  lead?: React.ReactNode;
  /** The facts. Usually a few <ConfirmFact> rows. */
  children?: React.ReactNode;
  cta: string;
  busy?: boolean;
  busyLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never close under the customer while the write is in flight: the
        // dialog vanishing is indistinguishable from the action having been
        // cancelled, and the money moves anyway.
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {lead ? <DialogDescription>{lead}</DialogDescription> : null}
        </DialogHeader>

        {children ? (
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            {children}
          </div>
        ) : null}

        {/* Cancel first in the DOM so a keyboard lands on it, and the
            confirm is the one you have to reach for. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={busy || disabled}
            onClick={onConfirm}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? (busyLabel ?? "Working…") : cta}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One label / value line inside a confirmation. */
export function ConfirmFact({
  label,
  value,
  strong = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 first:pt-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? "text-right font-semibold tabular-nums"
            : "text-right tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}
