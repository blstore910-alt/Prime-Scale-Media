import React from "react";
import useExchangeRates from "./use-exchange-rates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TableIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DialogTitle } from "@radix-ui/react-dialog";
import dayjs from "dayjs";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { useAppContext } from "@/context/app-provider";
import { Badge } from "@/components/ui/badge";

export default function ExchangeRateLogs() {
  const { exchangeRates } = useExchangeRates({
    activeOnly: false,
  });
  const { profile } = useAppContext();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size={"sm"} variant={"outline"}>
          <TableIcon />
          See Logs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exchange Rates Logs</DialogTitle>
          <DialogDescription>
            Complete history of exchange rates settings
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Updated At</TableHead>
                <TableHead>Updated By</TableHead>
                <TableHead>Euro</TableHead>
                <TableHead>British Pound</TableHead>
                <TableHead>Hong Kong Dollar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exchangeRates?.map((rate) => (
                <TableRow key={rate.id}>
                  <TableCell>
                    {dayjs(rate.created_at).format(DATE_TIME_FORMAT)}{" "}
                    {rate.is_active && (
                      <Badge
                        variant={"outline"}
                        className="rounded-full text-yellow-600 border-yellow-600"
                      >
                        Current
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {profile?.id === rate.profile?.id
                      ? "You"
                      : rate.profile?.full_name || "N/A"}
                  </TableCell>
                  <TableCell>{rate.eur}</TableCell>
                  <TableCell>{rate.gbp}</TableCell>
                  <TableCell>{rate.hkd}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
