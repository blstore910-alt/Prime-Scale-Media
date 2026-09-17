import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import AdAccountRequestForm from "./ad-account-request-form";

interface RequestAdAccountDialogProps {
  children?: React.ReactNode;
}

export default function RequestAdAccountDialog({
  children,
}: RequestAdAccountDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Request Ad Account
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Request an ad account</DialogTitle>
          <DialogDescription>
            {/* "Submit a request for a new ad account" told the customer
                nothing they could not read off the button. What they need to
                know before filling this in is that a person picks it up —
                and no promised turnaround, because one that is missed is
                worse than none. */}
            We set it up on our verified Business Manager. You&apos;ll see it
            here as soon as it is ready.
          </DialogDescription>
        </DialogHeader>
        <AdAccountRequestForm setOpen={setOpen} />
      </DialogContent>
    </Dialog>
  );
}
