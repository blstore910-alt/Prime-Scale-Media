"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TOPUP_TYPES } from "@/lib/constants";
import { Filter, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function TopupsFilters({
  type,
  setType,
  source,
  setSource,
  status,
  setStatus,
  sort,
  setSort,
}: {
  type: string;
  setType: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const [localType, setLocalType] = useState(type);
  const [localStatus, setLocalStatus] = useState(status);
  const [localSort, setLocalSort] = useState(sort);

  const applyFilters = () => {
    setType(localType);
    setStatus(localStatus);
    setSort(localSort);
    setOpen(false);
  };

  const isApplied =
    type !== "all" || source !== "all" || status !== "all" || sort !== "newest";

  const clearFilters = () => {
    setType("all");
    setSource("all");
    setStatus("all");
    setSort("newest");
    // also update local values so dialog shows cleared state
    setLocalType("all");
    setLocalStatus("all");
    setLocalSort("newest");
    setOpen(false);
  };

  useEffect(() => {
    // when dialog opens, sync local state with external props
    if (open) {
      setLocalType(type);
      setLocalSort(sort);
    }
  }, [open, type, source, status, sort]);

  return (
    <>
      {/* Desktop Filters */}
      <div className="hidden md:flex flex-wrap gap-2 items-center">
        <Select value={type} onValueChange={(v) => setType(v ?? "all")}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TOPUP_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => setStatus(v ?? "all")}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>

        <Select
          aria-label="Sort topups"
          value={sort}
          onValueChange={(v) => setSort(v ?? "newest")}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="amount-desc">Amount high → low</SelectItem>
            <SelectItem value="amount-asc">Amount low → high</SelectItem>
            <SelectItem value="amount-usd-desc">
              Amount USD high → low
            </SelectItem>
            <SelectItem value="amount-usd-asc">
              Amount USD low → high
            </SelectItem>
            <SelectItem value="account-asc">Account A → Z</SelectItem>
            <SelectItem value="account-desc">Account Z → A</SelectItem>
            <SelectItem value="number-asc">Topup # Asc</SelectItem>
            <SelectItem value="number-desc">Topup # Desc</SelectItem>
            <SelectItem value="fee-desc">Fee high → low</SelectItem>
            <SelectItem value="fee-asc">Fee low → high</SelectItem>
          </SelectContent>
        </Select>
        {isApplied && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Mobile Filters*/}
      <div className="md:hidden gap-2">
        {isApplied && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X />
            Clear
          </Button>
        )}
        <Button size="icon" variant="outline" onClick={() => setOpen(true)}>
          <Filter />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-2">
            <Select
              value={localType}
              onValueChange={(v) => setLocalType(v ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TOPUP_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localStatus}
              onValueChange={(v) => setLocalStatus(v ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={localSort}
              onValueChange={(v) => setLocalSort(v ?? "newest")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="amount-desc">Amount high → low</SelectItem>
                <SelectItem value="amount-asc">Amount low → high</SelectItem>
                <SelectItem value="amount-usd-desc">
                  Amount USD high → low
                </SelectItem>
                <SelectItem value="amount-usd-asc">
                  Amount USD low → high
                </SelectItem>
                <SelectItem value="account-asc">Account A → Z</SelectItem>
                <SelectItem value="account-desc">Account Z → A</SelectItem>
                <SelectItem value="number-asc">Topup # Asc</SelectItem>
                <SelectItem value="number-desc">Topup # Desc</SelectItem>
                <SelectItem value="fee-desc">Fee high → low</SelectItem>
                <SelectItem value="fee-asc">Fee low → high</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyFilters}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
