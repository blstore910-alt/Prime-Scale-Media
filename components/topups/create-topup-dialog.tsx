import { useT } from "@/hooks/use-t";
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
  onNeedTopUp,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  account?: AdAccount | null;
  /** Zie AccountTopupForm: alleen de klantkant geeft dit mee. */
  onNeedTopUp?: () => void;
}) {
  const { t: tr } = useT();
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
          <DialogTitle>{tr("ctop.fundThisAdAccount")}</DialogTitle>
          {/* ── THE NAME BELONGS IN ONE PLACE ────────────────────────
              It was here AND in the "Ad Account" picker directly below,
              which is also where you change it -- so the code was on
              screen twice, two lines apart, and the header was the copy
              you could not act on. The picker keeps it; the header says
              what the dialog does. */}
          <DialogDescription>
            {tr("ctop.moneyMovesOutOfYour")}</DialogDescription>
        </DialogHeader>

        {open && (
          <AccountTopupForm
            account={account}
            onSuccess={() => setOpen(false)}
            onNeedTopUp={
              onNeedTopUp
                ? () => {
                    setOpen(false);
                    onNeedTopUp();
                  }
                : undefined
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
