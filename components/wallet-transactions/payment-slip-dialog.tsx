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
  // ── "COULDN'T LOAD THIS SLIP" BEFORE ANYTHING WAS ASKED ───────────
  //
  // This started false and was only set true inside the effect. On the
  // render where `open` flips true, resolving is still false and
  // resolvedUrl is still null, so the component committed the
  // destructive branch — "Couldn't load this slip. It may have been
  // removed, or you don't have access." — with no request yet made, and
  // Radix animates the panel in over ~200ms behind it. On the one piece
  // of evidence an admin reads before crediting money.
  const [resolving, setResolving] = useState(
    () => !!open && !!paymentSlipUrl,
  );
  const [downloading, setDownloading] = useState(false);
  // An <img> that fails renders as an empty bordered box — which is exactly
  // what a white-on-transparent slip looks like too. Without this you
  // cannot tell "it loaded and you cannot see it" from "it did not load".
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open || !paymentSlipUrl) {
      setResolvedUrl(null);
      return;
    }
    setResolving(true);
    setImgFailed(false);
    getSignedPaymentSlipUrl(paymentSlipUrl)
      .then((res) => {
        if (cancelled) return;
        setResolvedUrl(res.ok ? res.data.url : null);
      })
      // A thrown server action -- a dropped connection, a redeploy
      // mid-call -- was an unhandled rejection. The text ended up right
      // by way of .finally; the console did not.
      .catch(() => {
        if (!cancelled) setResolvedUrl(null);
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
    if (!resolvedUrl || downloading) return;
    // A large slip takes seconds and the button said nothing, so the
    // obvious response was to press it again and start a second fetch.
    setDownloading(true);
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
      // ── AND THE FALLBACK TOOK THE ADMIN OUT OF THE APP ───────────
      //
      // resolvedUrl is on the Supabase origin, not ours, so the browser
      // ignores `download` on a cross-origin anchor. With no target,
      // this navigated the CURRENT tab to the raw slip: the queue, its
      // filter and its page gone, and Back remounts the whole shell.
      // It fires on any blip, and on a signed URL past its 300s life —
      // which this dialog never re-signs.
      const link = document.createElement("a");
      link.href = resolvedUrl;
      link.download = "payment-slip";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payment Slip</DialogTitle>
        </DialogHeader>

        {/* A CHECKERBOARD, not a white panel. Customers upload slips as
            PNGs straight from their banking app, and a transparent or
            white-on-transparent image on a white background is invisible —
            the admin sees an empty frame and concludes the preview is
            broken. Against a checkerboard you can see both the image and
            its transparency. */}
        <div
          className="rounded-md border p-3"
          style={{
            backgroundColor: "#eceff6",
            backgroundImage:
              "linear-gradient(45deg,#dfe4ef 25%,transparent 25%,transparent 75%,#dfe4ef 75%)," +
              "linear-gradient(45deg,#dfe4ef 25%,transparent 25%,transparent 75%,#dfe4ef 75%)",
            backgroundSize: "18px 18px",
            backgroundPosition: "0 0, 9px 9px",
          }}
        >
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
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded slip of unknown dimensions inside a modal; next/image would need width/height guess */}
              <img
                src={resolvedUrl}
                alt="Payment slip"
                onError={() => setImgFailed(true)}
                className="w-full max-h-[60dvh] object-contain rounded-md"
                style={{ display: imgFailed ? "none" : undefined }}
              />
              {imgFailed && (
                <p className="text-sm text-destructive">
                  This file did not load as an image. Download it to open it
                  in something else.
                </p>
              )}
            </>
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
            disabled={!resolvedUrl || downloading}
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {downloading ? "Downloading…" : "Download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
