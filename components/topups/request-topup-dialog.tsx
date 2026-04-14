"use client";

import { useState } from "react";
import { IconCashRegister } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AccountTopupForm from "./account-topup-form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function RequestTopupDialog({
  disabled,
  message,
}: {
  disabled?: boolean;
  message?: string;
}) {
  const [open, setOpen] = useState(false);

  const button = (
    <Button disabled={disabled}>
      <IconCashRegister />
      Request Topup
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="">
              {disabled ? (
                <div className="inline-block cursor-not-allowed">{button}</div>
              ) : (
                <DialogTrigger asChild>{button}</DialogTrigger>
              )}
            </div>
          </TooltipTrigger>
          {disabled && message && (
            <TooltipContent>
              <p>{message}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Topup</DialogTitle>
        </DialogHeader>
        {open && <AccountTopupForm onSuccess={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
