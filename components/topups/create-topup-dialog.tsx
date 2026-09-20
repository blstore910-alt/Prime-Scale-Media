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
      {/* ── ONE SCROLLER, NOT TWO ────────────────────────────────────
          DialogContent carries overflow-y-auto with a max height, and
          the form inside carried its own max-h + overflow-y-auto. Both
          scrolled: two bars side by side, and a fling that could land
          in the wrong one.
          The dialog becomes a column that does not scroll, the body
          inside it takes the space that is left and scrolls, and the
          footer sits under it. min-h-0 is the part that makes a flex
          child allowed to be shorter than its content. */}
      <DialogContent className="flex flex-col overflow-hidden gap-0">
        <DialogHeader className="space-y-1 pb-1">
          <DialogTitle>Fund this ad account</DialogTitle>
          {account?.name ? (
            <DialogDescription asChild>
              {/* The name is a code, so it must not break mid-code --
                  "AA-" on one line and "PSM0005-EU-01" on the next is
                  how it read. A chip keeps it whole and makes it the
                  thing the sentence is about. */}
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>Money moves from your wallet to</span>
                <span className="inline-flex max-w-full items-center rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[0.78rem] font-semibold tracking-tight text-foreground">
                  <span className="truncate">{account.name}</span>
                </span>
              </div>
            </DialogDescription>
          ) : null}
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
