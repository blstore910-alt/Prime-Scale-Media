"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { getSignedPaymentSlipUrl } from "@/actions/payment-slip-actions";
import { useEffect, useState } from "react";

export default function PaymentSlipDialog({
  open,
  onOpenChange,
  paymentSlipUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The stored value: a bucket PATH for new slips, or a full URL for
  // legacy rows. Either way we resolve it to a viewable URL below.
  paymentSlipUrl: string | null | undefined;
}) {
  // The bucket is private, so the stored path isn't directly viewable.
  // Resolve it to a short-lived signed URL when the dialog opens.
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open || !paymentSlipUrl) {
      setResolvedUrl(null);
      return;
    }
    setResolving(true);
    getSignedPaymentSlipUrl(paymentSlipUrl)
      .then((res) => {
        if (cancelled) return;
        setResolvedUrl(res.ok ? res.data.url : null);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, paymentSlipUrl]);

  const imageExtensions = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "bmp",
    "svg",
  ]);
  const getExtension = (url: string) => {
    try {
      const parsed = new URL(url);
      const filename = parsed.pathname.split("/").pop() ?? "";
      return filename.split(".").pop()?.toLowerCase() ?? "";
    } catch {
      const withoutQuery = url.split("?")[0] ?? "";
      const filename = withoutQuery.split("/").pop() ?? "";
      return filename.split(".").pop()?.toLowerCase() ?? "";
    }
  };
  // Detect image type from the stored path (stable) rather than the
  // signed URL (carries query params).
  const isImage =
    paymentSlipUrl && imageExtensions.has(getExtension(paymentSlipUrl));

  const handleEnlarge = () => {
    if (!resolvedUrl) return;
    window.open(resolvedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async () => {
    if (!resolvedUrl) return;
    try {
      const response = await fetch(resolvedUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "payment-slip";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      const link = document.createElement("a");
      link.href = resolvedUrl;
      link.download = "payment-slip";
      link.click();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payment Slip</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-muted/20 p-3">
          {!paymentSlipUrl ? (
            <p className="text-sm text-muted-foreground">
              No payment slip uploaded.
            </p>
          ) : resolving ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !resolvedUrl ? (
            <p className="text-sm text-destructive">
              Couldn&apos;t load this slip. It may have been removed, or you
              don&apos;t have access.
            </p>
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded slip of unknown dimensions inside a modal; next/image would need width/height guess
            <img
              src={resolvedUrl}
              alt="Payment slip"
              className="w-full max-h-[60vh] object-contain rounded-md bg-background"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Preview not available for this file type.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isImage && (
            <Button
              variant="outline"
              type="button"
              onClick={handleEnlarge}
              disabled={!resolvedUrl}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Fullscreen
            </Button>
          )}
          <Button
            type="button"
            onClick={handleDownload}
            disabled={!resolvedUrl}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
