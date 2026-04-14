"use client";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="text-center">
        <Image
          src={"/images/psm-logo.svg"}
          className="object-cover h-44 w-auto mx-auto"
          alt="PSM Logo"
        />
      </div>
    </div>
  );
}
