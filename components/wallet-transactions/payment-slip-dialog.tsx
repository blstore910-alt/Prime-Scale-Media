"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

export default function PaymentSlipDialog({
  open,
  onOpenChange,
  paymentSlipUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentSlipUrl: string | null | undefined;
}) {
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
  const isImage =
    paymentSlipUrl && imageExtensions.has(getExtension(paymentSlipUrl));

  const handleEnlarge = () => {
    if (!paymentSlipUrl) return;
    window.open(paymentSlipUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async () => {
    if (!paymentSlipUrl) return;
    try {
      const response = await fetch(paymentSlipUrl, { mode: "cors" });
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
      link.href = paymentSlipUrl;
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
          {paymentSlipUrl ? (
            isImage ? (
              <img
                src={paymentSlipUrl}
                alt="Payment slip"
                className="w-full max-h-[60vh] object-contain rounded-md bg-background"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Preview not available for this file type.
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              No payment slip uploaded.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isImage && (
            <Button
              variant="outline"
              type="button"
              onClick={handleEnlarge}
              disabled={!paymentSlipUrl}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Fullscreen
            </Button>
          )}
          <Button
            type="button"
            onClick={handleDownload}
            disabled={!paymentSlipUrl}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
