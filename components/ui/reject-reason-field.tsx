"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  rejectTemplates,
  type RejectContext,
} from "@/lib/pure-reject-reasons";

// ─────────────────────────────────────────────────────────────────────
// The rejection reason, with a starting sentence per ordinary case
// ─────────────────────────────────────────────────────────────────────
// This text is printed on the customer's own screen, beside money they
// tried to move. Typed fresh each time, in a queue of twenty, it comes
// out as "no valid pop" -- which tells the customer nothing about what
// happened or what to do next, and is the kind of thing that turns into
// a support message an hour later.
//
// A chip fills the box; the admin then edits it. Nothing is forced and
// nothing is locked: it is a starting point, not a form.
// ─────────────────────────────────────────────────────────────────────

export function RejectReasonField({
  context,
  value,
  onChange,
  disabled,
  id = "rejection-reason",
}: {
  context: RejectContext;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const templates = rejectTemplates(context);

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Rejection reason</Label>
      {templates.length > 0 ? (
        <div className="rjchips">
          {templates.map((t) => (
            <button
              key={t.short}
              type="button"
              disabled={disabled}
              // Replaces rather than appends. Two half-reasons stitched
              // together read worse than either one, and an admin who
              // wants both can edit -- the box is right underneath.
              onClick={() => onChange(t.text)}
              className={"rjchip" + (value === t.text ? " on" : "")}
              title={t.text}
            >
              {t.short}
            </button>
          ))}
        </div>
      ) : null}
      <Textarea
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Pick a reason above, or write your own. The customer reads this."
      />
      <p className="text-xs text-muted-foreground">
        This is shown to the customer. Say what was wrong and what they
        can do about it.
      </p>
    </div>
  );
}
