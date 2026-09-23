"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { requestOwnErasure, signOutAllDevices } from "@/actions/gdpr-actions";

/**
 * Two controls the customer can trigger themselves: end every session,
 * and ask for the account to be deleted.
 *
 * The delete flow is two-step: this button only asks the server to
 * mark the profile pending_erasure. The actual hard delete is a
 * super-admin action on the anniversary date (see the privacy doc).
 *
 * ── "DOWNLOAD MY DATA" IS DELIBERATELY NOT HERE ──────────────────────
 *
 * The owner asked for it to go: a raw JSON dump is not something a
 * customer of this product wants, and it made this block three long
 * paragraphs on a phone. `/api/me/export` and `exportOwnData` are
 * untouched, so putting the button back is one card.
 *
 * ── AND THERE WAS A SECOND HEADING ──────────────────────────────────
 *
 * Both shells wrap this in a card already headed "Your data" with a
 * sentence under it, and this component printed "Privacy" with a second
 * sentence saying nearly the same thing. `heading` lets /profile, which
 * has no wrapper, keep one.
 */
export default function PrivacyControls({
  heading = true,
}: {
  heading?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  // Has this person already asked? A column plak 36 adds; until then the
  // read fails on the missing column and we simply do not know -- the
  // button stays, and the server answers "already sent" if it was.
  const requested = useQuery({
    queryKey: ["erasure-requested", profile?.id ?? ""],
    enabled: !!profile?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("erasure_requested_at")
        .eq("id", profile!.id)
        .maybeSingle();
      // ── A MISSING COLUMN, NOT ANY FAILURE ──────────────────────────
      //
      // `return null` here turned every failed read into a confident
      // "you never asked", so the card told somebody who HAD asked that
      // we would review their request and left the button live. The
      // missing-column tolerance the comment above describes is
      // deliberate and stays; the blanket swallow does not.
      if (error) {
        if (/42703|does not exist|schema cache/i.test(error.message)) return null;
        throw error;
      }
      return ((data as { erasure_requested_at?: string | null } | null)
        ?.erasure_requested_at ?? null) as string | null;
    },
  });
  const requestedAt = requested.data ?? null;

  async function submitErasure() {
    setRequesting(true);
    // ── try/finally WITH NO catch ─────────────────────────────────────
    //
    // If requestOwnErasure() threw -- a network drop, a server error --
    // finally cleared the busy flag and nothing else happened: no toast,
    // no message, the dialog still open. The button did nothing at all,
    // silently, on the control a customer uses to ask for their account
    // to be erased. That is the one place where "it looked like nothing
    // happened" is least acceptable.
    try {
      const result = await requestOwnErasure();
      if (!result.ok) {
        toast.error("Your request was not sent", { description: result.error });
        return;
      }
      // A REQUEST, not a lock: they stay signed in. The owner approves or
      // declines it, and they hear back either way.
      toast.success(
        result.data.alreadySent ? "You already asked" : "Request sent",
        { description: "We'll contact you before anything is deleted." },
      );
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["erasure-requested"], exact: false });
    } catch (err) {
      toast.error("Erasure request failed", {
        description:
          err instanceof Error
            ? err.message
            : "Something went wrong. Nothing was sent — try again.",
      });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="space-y-3">
      {heading ? (
        <div>
          <h3 className="text-lg font-semibold">Your data</h3>
          <p className="text-sm text-muted-foreground">
            Sign out everywhere, or ask us to delete your account.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">Sign out of all devices</p>
          <p className="text-sm text-muted-foreground">
            Ends every session, everywhere.
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={async () => {
            setSigningOutAll(true);
            try {
              const result = await signOutAllDevices();
              if (!result.ok) {
                toast.error("Sign-out failed", { description: result.error });
                return;
              }
              toast.success("All sessions ended. Signing you out.");
              setTimeout(() => {
                window.location.href = "/auth/login";
              }, 1000);
            } finally {
              setSigningOutAll(false);
            }
          }}
          disabled={signingOutAll}
        >
          {signingOutAll ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Sign out everywhere
        </Button>
      </div>

      <div className="rounded-lg border border-destructive/40 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-destructive">Delete my account</p>
          {/* A request we review, not a switch (the owner, 21-09: "moet
              een request komen bij admin, daarna pas"). No legal claims:
              "7 years by law" was one nobody here had checked. */}
          <p className="text-sm text-muted-foreground">
            {requestedAt
              ? `You asked on ${dayjs(requestedAt).format("D MMM YYYY")}. We'll contact you before anything is deleted.`
              : "We review your request and contact you. Your account stays open until then."}
          </p>
        </div>
        <Button
          variant="destructive"
          className="shrink-0"
          onClick={() => setConfirmOpen(true)}
          disabled={!!requestedAt}
        >
          <ShieldAlert className="h-4 w-4 mr-2" />
          {requestedAt ? "Request sent" : "Request deletion"}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ask us to delete your account?</DialogTitle>
            <DialogDescription>
              We review your request and contact you. Nothing is deleted,
              and you stay signed in, until then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={requesting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitErasure}
              disabled={requesting}
            >
              {requesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
