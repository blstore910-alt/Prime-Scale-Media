import { AdAccount } from "@/lib/types/account";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import AccountTopupForm from "./account-topup-form";

export default function CreateTopupDialog({
  open,
  setOpen,
  account,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  account?: AdAccount | null;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request New Topup</DialogTitle>
          {account?.name && (
            <DialogDescription>
              Request new topup for account: <b>{account?.name}</b>
            </DialogDescription>
          )}
        </DialogHeader>

        {open && (
          <AccountTopupForm
            account={account}
            onSuccess={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
