import { AccountDetailsSheet } from "@/components/account/account-details-sheet";
import BulkTopupAdAccountsDialog from "@/components/topups/bulk-ad-accounts-topup-dialog";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MinusCircle, PauseCircle } from "lucide-react";
import { useState } from "react";

export default function UserAccounts({
  advertiserId,
}: {
  advertiserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const {
    data: accounts,
    isLoading,
    error,
    isError,
  } = useQuery<AdAccount[]>({
    queryKey: ["ad-accounts", advertiserId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("advertiser_id", advertiserId);
      if (error) throw error;
      return (data ?? []) as AdAccount[];
    },
  });

  const handleRowClick = (accountId: string) => {
    setOpen(true);
    setSelectedAccountId(accountId);
  };

  return (
    <Card className="bg-transparent border-0 shadow-none">
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Ad Accounts</CardTitle>
            <CardDescription></CardDescription>
          </div>
          {(accounts?.length ?? 0) > 0 && (
            <BulkTopupAdAccountsDialog accounts={accounts ?? []} />
          )}
        </div>

        {isLoading && (
          <div className="text-center py-4">
            <Loader2 className="animate-spin inline" />
          </div>
        )}
        {isError && (
          <div className="text-center py-4">
            <p className="text-center text-muted-foreground">
              {(error as Error)?.message}
            </p>
          </div>
        )}

        <div className="mt-4 border rounded-lg">
          {accounts?.length ? (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableCell>Account Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Fee</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts?.map((account) => (
                  <TableRow
                    onClick={() => handleRowClick(account.id)}
                    key={account.id}
                  >
                    <TableCell>{account.name}</TableCell>
                    <TableCell className="capitalize">
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
                    <TableCell>{account.fee}%</TableCell>

                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-4">
              <p className="text-center text-muted-foreground">
                No ad accounts found
              </p>
            </div>
          )}
        </div>
      </CardContent>
      <AccountDetailsSheet
        accountId={selectedAccountId}
        open={open}
        setOpen={() => {
          setOpen(false);
          setSelectedAccountId(null);
        }}
      />
    </Card>
  );
}
