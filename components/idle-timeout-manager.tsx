"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
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
import { AlertTriangle } from "lucide-react";

const WARN_AFTER = 28 * 60 * 1000; // 28 minutes
const TIMEOUT_AFTER = 30 * 60 * 1000; // 30 minutes

/**
 * Zero-render mount point that wires the useIdleTimeout hook to a
 * confirmation dialog + Supabase sign-out.
 *
 * Design decisions:
 *   - 30-minute total idle window. Long enough that switching tabs
 *     for a few minutes doesn't kick you out; short enough that a
 *     laptop left open at a cafe doesn't stay logged in overnight.
 *   - "Stay signed in" button dismisses the warning; any pointer
 *     activity does the same via the underlying hook.
 *   - Sign-out uses supabase.auth.signOut() then hard-navigates to
 *     /auth/login so react state is fully cleared.
 */
export default function IdleTimeoutManager() {
  const router = useRouter();
  const [warningOpen, setWarningOpen] = useState(false);

  useIdleTimeout({
    warnAfterMs: WARN_AFTER,
    timeoutAfterMs: TIMEOUT_AFTER,
    onWarn: () => setWarningOpen(true),
    onTimeout: async () => {
      setWarningOpen(false);
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // ignore — we still want to redirect
      }
      router.replace("/auth/login?reason=idle");
    },
  });

  return (
    <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-2">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>You&apos;ll be signed out shortly</DialogTitle>
          <DialogDescription>
            You&apos;ve been inactive for a while. For security, we sign
            you out after 30 minutes of no activity. Click anywhere or
            press a key to stay signed in.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setWarningOpen(false)}>Stay signed in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
