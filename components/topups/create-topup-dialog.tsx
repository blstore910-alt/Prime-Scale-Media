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
          <DialogTitle>Fund this ad account</DialogTitle>
          {account?.name && (
            <DialogDescription>
              Money moves from your wallet to: <b>{account?.name}</b>
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
