"use client";

import Image from "next/image";
import { useEffect } from "react";
import { Button } from "../ui/button";
import { Download, XIcon } from "lucide-react";

export default function PaymentSlipPreview({
  src,
  alt,
  open,
  onClose,
}: {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  if (!open) return null;

  const handleDownload = async () => {
    const response = await fetch(src);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "payment-slip";
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <Button
        className="absolute top-5 right-5"
        variant={"outline"}
        size={"icon"}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <XIcon className="size-8" />
      </Button>

      <Button
        className="absolute bottom-10 -translate-x-1/2 left-1/2 "
        variant={"secondary"}
        onClick={(e) => {
          e.stopPropagation();
          handleDownload();
        }}
      >
        <Download />
        Download
      </Button>

      <Image
        src={src}
        alt={alt || "Lightbox Image"}
        width={1600}
        height={1200}
        className="max-w-[95vw] max-h-[95vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
