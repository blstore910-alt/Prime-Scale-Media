import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { PLATFORMS } from "@/lib/constants";
import { AdAccount } from "@/lib/types/account";
import {
  ArrowUp,
  Check,
  CheckCircle2,
  Eye,
  MinusCircle,
  PauseCircle,
  Pencil,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";

import useUpdateAccount from "./use-update-account";

export default function AccountRow({
  account,
  onRowClick,
  onAddTopup,
  onEdit,
  onSetMinTopup,
}: {
  account: AdAccount;
  onRowClick: (id: string) => void;
  onAddTopup: (account: AdAccount) => void;
  onEdit: (account: AdAccount) => void;
  onSetMinTopup?: (account: AdAccount) => void;
}) {
  const { profile } = useAppContext();
  const [fee, setFee] = useState<number | string>(account.fee);
  const [editing, setEditing] = useState({ fee: false });
  const [isDirty, setIsDirty] = useState(false);
  const isAdmin = profile?.role === "admin";
  const { updateAccount } = useUpdateAccount();
  const initialFee = account.fee;

  const handleFeeEdit = (
    e: React.MouseEvent<HTMLTableCellElement, MouseEvent>,
  ) => {
    e.stopPropagation();
    if (!isAdmin) return;
    setEditing({ ...editing, fee: true });
  };

  const updateFee = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsDirty(false);
    updateAccount({
      id: account.id,
      payload: {
        fee: +fee,
      },
    });
  };

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    // Ignore portal-originated events (e.g. dialog clicks bubbling through React tree).
    if (!e.currentTarget.contains(e.target as Node)) return;
    onRowClick(account.id);
  };

  useEffect(() => {
    if (fee !== initialFee) {
      setIsDirty(true);
    } else {
      setIsDirty(false);
    }
  }, [fee, initialFee]);

  return (
    <TableRow
      className="group cursor-pointer"
      onClick={handleRowClick}
      key={account.id}
    >
      <TableCell>{account.advertiser?.tenant_client_code || "—"}</TableCell>
      <TableCell className="font-medium cursor-pointer group-hover:underline underline-offset-2">
        {account.name}
      </TableCell>

      {/* Advertiser info */}
      <TableCell>
        <div className="flex gap-2">
          <span>{account.advertiser?.profile?.full_name || "—"}</span>
        </div>
      </TableCell>

      <TableCell>
        {PLATFORMS.find((p) => p.value === account.platform)?.label ||
          account.platform}
      </TableCell>

      <TableCell className="cursor-pointer min-w-16" onClick={handleFeeEdit}>
        {fee}
        &nbsp;%
      </TableCell>
      <TableCell>{account.currency || "N/A"}</TableCell>
      <TableCell>
        <Badge className="capitalize" variant={"outline"}>
          {account.status === "active" ? (
            <CheckCircle2 color="green" />
          ) : account.status === "paused" ? (
            <PauseCircle color="orange" />
          ) : (
            <MinusCircle color="red" />
          )}
          {account.status}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        {isDirty ? (
          <div className="inline-flex gap-2">
            <Button
              size={"icon"}
              variant={"outline"}
              className="size-8"
              onClick={updateFee}
            >
              <Check />
            </Button>
            <Button
              size={"icon"}
              variant={"outline"}
              className="size-8"
              onClick={(e) => {
                e.stopPropagation();
                setFee(account.fee);
                setIsDirty(false);
              }}
            >
              <X />
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            {isAdmin && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(account);
                }}
                variant={"outline"}
                size={"sm"}
              >
                <Pencil />
                <span>Edit</span>
              </Button>
            )}
            {isAdmin && onSetMinTopup && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetMinTopup(account);
                }}
                variant={"outline"}
                size={"sm"}
              >
                <span>Set Topup Limit</span>
              </Button>
            )}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onRowClick(account.id);
              }}
              variant={"secondary"}
              size={"sm"}
            >
              <Eye />
              <span>View </span>
            </Button>
            {!isAdmin && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddTopup(account);
                }}
                size={"sm"}
              >
                <ArrowUp />
                <span> Topup</span>
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
