import { toast } from "sonner";

/**
 * Show the half of the answer that "it worked" leaves out.
 *
 * WHY THIS EXISTS. Several server actions return `{ ok: true, warning }`
 * — the write succeeded, and something the operator must act on did not.
 * The one that matters most: a top-up is verified, the customer's money
 * moves, and the automatic push to the supplier is refused (the ad
 * account is EUR while the amount is stored in USD, the account is not
 * supplier-managed, the denomination is ambiguous). No `integration_jobs`
 * row is written, so the failure trigger never fires either.
 *
 * `ActionResult.warning` is optional, so dropping it compiles, reads
 * correctly, and is invisible to every gate we have. Six call sites
 * dropped it. The admin saw a green tick, the queue went green, the ad
 * account stayed empty, and nothing anywhere said so.
 *
 * So the success toast is the wrong shape for this: it has to be the
 * warning toast, held on screen long enough to read and act on, because
 * the action it asks for is manual.
 */
export function toastResult(
  result: { warning?: string },
  successTitle: string,
  successOptions?: { description?: string },
) {
  if (result.warning) {
    toast.warning(successTitle, {
      description: result.warning,
      // Long enough to read a sentence and write the account down. A
      // four-second toast on "fund it by hand" is the same as no toast.
      duration: 15_000,
    });
    return;
  }
  toast.success(successTitle, successOptions);
}
