"use client";

import useUpdateAdvertiser from "@/components/advertiser/use-update-advertiser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/constants";
import { Advertiser } from "@/lib/types/advertiser";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  COMMISSION_TYPE_OPTIONS,
  type CommissionType,
  getCommissionFieldVisibility,
  normalizeCommissionType,
} from "./commission-setup-utils";

type CommissionState = {
  commission_type: CommissionType;
  commission_pct: string;
  commission_onetime: string;
  commission_monthly: string;
  commission_currency: string;
};

function toInputValue(value?: number | string | null) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildInitialValues(advertiser: Advertiser | null): CommissionState {
  return {
    commission_type: normalizeCommissionType(advertiser?.commission_type),
    commission_pct: toInputValue(advertiser?.commission_pct),
    commission_onetime: toInputValue(advertiser?.commission_onetime),
    commission_monthly: toInputValue(advertiser?.commission_monthly),
    commission_currency: advertiser?.commission_currency ?? "EUR",
  };
}

function toNumberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function CommissionSetupDialog({
  open,
  onOpenChange,
  advertiser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advertiser: Advertiser | null;
}) {
  const { updateAdvertiser, isPending } = useUpdateAdvertiser();
  const [initialValues, setInitialValues] = useState<CommissionState>(() =>
    buildInitialValues(advertiser),
  );
  const [commissionType, setCommissionType] = useState<CommissionType>(
    initialValues.commission_type,
  );
  const [commissionPct, setCommissionPct] = useState(
    initialValues.commission_pct,
  );
  const [commissionOnetime, setCommissionOnetime] = useState(
    initialValues.commission_onetime,
  );
  const [commissionMonthly, setCommissionMonthly] = useState(
    initialValues.commission_monthly,
  );
  const [commissionCurrency, setCommissionCurrency] = useState(
    initialValues.commission_currency,
  );

  useEffect(() => {
    if (!open) return;
    const nextValues = buildInitialValues(advertiser);
    setInitialValues(nextValues);
    setCommissionType(nextValues.commission_type);
    setCommissionPct(nextValues.commission_pct);
    setCommissionOnetime(nextValues.commission_onetime);
    setCommissionMonthly(nextValues.commission_monthly);
    setCommissionCurrency(nextValues.commission_currency);
  }, [open, advertiser]);

  const {
    showPct: enablePct,
    showOnetime: enableOnetime,
    showMonthly: enableMonthly,
    showCurrency: enableCurrency,
  } = getCommissionFieldVisibility(commissionType);

  const isDirty = useMemo(() => {
    return (
      commissionType !== initialValues.commission_type ||
      commissionPct !== initialValues.commission_pct ||
      commissionOnetime !== initialValues.commission_onetime ||
      commissionMonthly !== initialValues.commission_monthly ||
      commissionCurrency !== initialValues.commission_currency
    );
  }, [
    commissionType,
    commissionPct,
    commissionOnetime,
    commissionMonthly,
    commissionCurrency,
    initialValues,
  ]);

  const handleSave = () => {
    if (!advertiser) return;
    const payload = {
      commission_type: commissionType,
      commission_pct: enablePct ? toNumberOrNull(commissionPct) : null,
      commission_onetime: enableOnetime
        ? toNumberOrNull(commissionOnetime)
        : null,
      commission_monthly: enableMonthly
        ? toNumberOrNull(commissionMonthly)
        : null,
      commission_currency: enableCurrency ? commissionCurrency : null,
    };

    updateAdvertiser(
      { id: advertiser.id, payload },
      {
        onSuccess: () => {
          toast.success("Commission setup updated.");
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("Failed to update commission setup.", {
            description: error.message,
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-xl"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Commission Setup</DialogTitle>
          <DialogDescription>
            Configure commission rules for this advertiser.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Commission Type</Label>
            <Select
              value={commissionType}
              onValueChange={(value) =>
                setCommissionType(value as CommissionType)
              }
            >
              <SelectTrigger className="w-full text-left">
                <SelectValue placeholder="Select commission type" />
              </SelectTrigger>
              <SelectContent>
                {COMMISSION_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="commission_pct">Commission Percent</Label>
              <Input
                id="commission_pct"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                placeholder="0.00"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                disabled={!enablePct}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commission_monthly">Commission Monthly</Label>
              <Input
                id="commission_monthly"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={commissionMonthly}
                onChange={(e) => setCommissionMonthly(e.target.value)}
                disabled={!enableMonthly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commission_onetime">Commission One Time</Label>
              <Input
                id="commission_onetime"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={commissionOnetime}
                onChange={(e) => setCommissionOnetime(e.target.value)}
                disabled={!enableOnetime}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commission_currency">Commission Currency</Label>
              <Select
                value={commissionCurrency}
                onValueChange={setCommissionCurrency}
                disabled={!enableCurrency}
              >
                <SelectTrigger id="commission_currency">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isDirty || isPending}>
            {isPending ? <Loader2 className="animate-spin mr-2" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
