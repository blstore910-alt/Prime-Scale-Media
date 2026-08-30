"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Loader2, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { requestOwnErasure, signOutAllDevices } from "@/actions/gdpr-actions";

/**
 * Two GDPR-mandated controls the user can trigger themselves:
 *
 *  - Download my data (right to portability, art. 20)
 *  - Request account deletion (right to erasure, art. 17)
 *
 * The delete flow is two-step: this button only asks the server to
 * mark the profile pending_erasure. The actual hard delete is a
 * super-admin action on the anniversary date (see the privacy doc).
 */
export default function PrivacyControls() {
  const [downloading, setDownloading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch("/api/me/export", { cache: "no-store" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `psm-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Data export downloaded");
    } catch (err) {
      toast.error("Could not download export", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDownloading(false);
    }
  }

  async function submitErasure() {
    setRequesting(true);
    try {
      const result = await requestOwnErasure();
      if (!result.ok) {
        toast.error("Erasure request failed", { description: result.error });
        return;
      }
      toast.success(
        "Erasure requested. You'll be signed out; a super-admin will finalise.",
      );
      setConfirmOpen(false);
      setTimeout(() => {
        window.location.href = "/auth/login";
      }, 1500);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Privacy</h3>
        <p className="text-sm text-muted-foreground">
          Your rights under GDPR. You can download everything we have on
          file, or ask us to delete your account.
        </p>
      </div>

      <div className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-medium">Sign out of all devices</p>
          <p className="text-sm text-muted-foreground">
            Invalidates every session on every browser and device.
            Useful if you lost a device or think someone else has access.
          </p>
        </div>
        <Button
          variant="outline"
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

      <div className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-medium">Download my data</p>
          <p className="text-sm text-muted-foreground">
            A JSON file with every record where you are the data subject
            (profile, wallet, top-ups, invoices, companies, notifications,
            invitations).
          </p>
        </div>
        <Button onClick={download} disabled={downloading}>
          {downloading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Download
        </Button>
      </div>

      <div className="rounded-lg border border-destructive/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="font-medium text-destructive">Delete my account</p>
          <p className="text-sm text-muted-foreground">
            Your login is blocked immediately. A super-admin performs the
            hard delete after the fiscal retention window. Financial
            records may be kept for 7 years by law.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
        >
          <ShieldAlert className="h-4 w-4 mr-2" />
          Request deletion
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm account deletion</DialogTitle>
            <DialogDescription>
              This immediately blocks your login and marks your profile
              for deletion. A super-admin finalises the hard delete on
              the anniversary date. You will lose access right away.
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
              Yes, request deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
