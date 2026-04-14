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
          <DialogTitle>Request Ad Account</DialogTitle>
          <DialogDescription>
            Submit a request for a new ad account.
          </DialogDescription>
        </DialogHeader>
        <AdAccountRequestForm setOpen={setOpen} />
      </DialogContent>
    </Dialog>
  );
}
