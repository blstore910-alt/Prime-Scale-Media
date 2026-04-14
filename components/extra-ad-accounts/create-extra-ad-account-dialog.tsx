"use client";

import InputField from "@/components/form/input-field";
import SelectField from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import useCreateExtraAdAccount from "./use-create-extra-ad-account";

type AdvertiserQueryRow = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null } | { full_name: string | null }[] | null;
};

const createExtraAdAccountFormSchema = z.object({
  advertiser_id: z.string().min(1, "Advertiser is required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
});

type CreateExtraAdAccountFormValues = z.infer<
  typeof createExtraAdAccountFormSchema
>;

function getAdvertiserName(
  profile: AdvertiserQueryRow["profile"],
): string | null {
  if (Array.isArray(profile)) {
    return profile[0]?.full_name ?? null;
  }

  return profile?.full_name ?? null;
}

function getDefaultValues(): CreateExtraAdAccountFormValues {
  return {
    advertiser_id: "",
    amount: 0,
  };
}

export default function CreateExtraAdAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { profile } = useAppContext();
  const { createExtraAdAccount, isPending } = useCreateExtraAdAccount();

  const { control, handleSubmit, reset } =
    useForm<CreateExtraAdAccountFormValues>({
      defaultValues: getDefaultValues(),
      resolver: zodResolver(
        createExtraAdAccountFormSchema,
      ) as Resolver<CreateExtraAdAccountFormValues>,
    });

  const {
    data: advertisers = [],
    isLoading: isAdvertisersLoading,
    isError: isAdvertisersError,
    error: advertisersError,
  } = useQuery<AdvertiserQueryRow[]>({
    queryKey: ["advertisers", profile?.tenant_id, "extra-ad-accounts"],
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name)")
        .eq("tenant_id", profile?.tenant_id)
        .order("tenant_client_code", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as AdvertiserQueryRow[];
    },
  });

  const advertiserOptions = advertisers.map((advertiser) => {
    const fullName = getAdvertiserName(advertiser.profile) ?? "-";

    return {
      value: advertiser.id,
      label: (
        <span className="inline-flex w-full justify-between">
          <span>{advertiser.tenant_client_code ?? "-"}</span>
          <span className="ml-2">{fullName}</span>
        </span>
      ),
    };
  });

  const onSubmit = (values: CreateExtraAdAccountFormValues) => {
    createExtraAdAccount(values, {
      onSuccess: () => {
        toast.success("Extra ad account created successfully.");
        reset(getDefaultValues());
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error("Failed to create extra ad account", {
          description: error.message,
        });
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          reset(getDefaultValues());
        }

        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Extra Ad Account</DialogTitle>
          <DialogDescription>
            Add an extra ad account entry for one advertiser.
          </DialogDescription>
        </DialogHeader>

        <form
          id="extra-ad-account-form"
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
        >
          <SelectField
            label="Select Advertiser"
            name="advertiser_id"
            id="extra-ad-account-advertiser-select"
            control={control}
            options={advertiserOptions}
            placeholder={
              isAdvertisersLoading ? "Loading advertisers..." : "Select"
            }
            disabled={isAdvertisersLoading || isAdvertisersError}
          />

          {isAdvertisersError && (
            <p className="text-sm text-destructive">
              {advertisersError instanceof Error
                ? advertisersError.message
                : "Failed to load advertisers."}
            </p>
          )}

          <InputField
            label="Amount (EUR)"
            name="amount"
            id="extra-ad-account-amount"
            type="number"
            min={0}
            step="0.01"
            control={control}
          />
        </form>

        <DialogFooter>
          <Button
            form="extra-ad-account-form"
            type="submit"
            disabled={isPending || isAdvertisersLoading || isAdvertisersError}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Create Extra Ad Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
