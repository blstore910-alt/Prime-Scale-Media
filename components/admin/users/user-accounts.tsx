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
              <TableHeader className="bg-background">
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
              {/* ── "NONE" ONLY WHEN WE ACTUALLY READ NONE ────────────
                  This panel sits outside both guards above, so it
                  printed "No ad accounts found" UNDERNEATH the spinner
                  while the read was in flight, and underneath the red
                  error line when the read had failed: two statements
                  about the same customer, on the same screen,
                  disagreeing. `accounts` is undefined in both of those
                  and in the paused case; only an array that came back
                  means none. */}
              <p className="text-center text-muted-foreground">
                {accounts === undefined
                  ? "We couldn't read this customer's ad accounts. This is NOT the same as having none."
                  : "No ad accounts found"}
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
