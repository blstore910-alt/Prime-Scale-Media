"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import CreateExtraAdAccountDialog from "./create-extra-ad-account-dialog";
import ExtraAdAccountRow from "./extra-ad-account-row";
import useExtraAdAccounts from "./use-extra-ad-accounts";

const PER_PAGE = 20;

export default function ExtraAdAccountsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [page, setPage] = useState<number>(
    Number.parseInt(searchParams?.get("page") ?? "1", 10) || 1,
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));

    if (page > 1) {
      params.set("page", String(page));
    } else {
      params.delete("page");
    }

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pathname, router]);

  const { extraAdAccounts, total, isLoading, isError, error } =
    useExtraAdAccounts({
      page,
      perPage: PER_PAGE,
    });

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus />
            Create Extra Ad Account
          </Button>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Advertiser</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`extra-ad-account-loader-${index}`}>
                    {Array.from({ length: 3 }).map((__, cellIndex) => (
                      <LoaderCell key={`extra-ad-account-loader-cell-${cellIndex}`} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-destructive">
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">
                        Failed to load extra ad accounts.
                      </p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : extraAdAccounts.length ? (
                extraAdAccounts.map((extraAdAccount) => (
                  <ExtraAdAccountRow
                    key={extraAdAccount.id}
                    extraAdAccount={extraAdAccount}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    No extra ad accounts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {total > PER_PAGE && (
          <div className="px-2">
            <TablePagination
              total={total}
              page={page}
              perPage={PER_PAGE}
              onPageChange={(nextPage) => setPage(nextPage)}
            />
          </div>
        )}
      </div>

      <CreateExtraAdAccountDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 w-16 rounded bg-muted" />
    </TableCell>
  );
}
