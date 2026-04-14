import { TableCell, TableRow } from "@/components/ui/table";
import {
  formatExtraAdAccountAmount,
  formatExtraAdAccountCreatedAt,
  getAdvertiserName,
} from "./extra-ad-accounts-utils";
import { ExtraAdAccount } from "./types";

function getClientCode(extraAdAccount: ExtraAdAccount) {
  return extraAdAccount.advertiser?.tenant_client_code ?? "-";
}

export default function ExtraAdAccountRow({
  extraAdAccount,
}: {
  extraAdAccount: ExtraAdAccount;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">
            {getAdvertiserName(extraAdAccount.advertiser?.profile ?? null)}
          </span>
          <span className="text-xs text-muted-foreground">
            {getClientCode(extraAdAccount)}
          </span>
        </div>
      </TableCell>
      <TableCell className="font-mono">
        € {formatExtraAdAccountAmount(extraAdAccount.amount)}
      </TableCell>
      <TableCell>
        {formatExtraAdAccountCreatedAt(extraAdAccount.created_at)}
      </TableCell>
    </TableRow>
  );
}
