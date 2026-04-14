/* eslint-disable @typescript-eslint/no-explicit-any */

import SelectField from "@/components/form/select-field";
import TextareaField from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, UseQueryResult } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

export default function UserAffiliates({
  advertiserId,
}: {
  advertiserId: string;
}) {
  const affiliatesQuery = useQuery({
    queryKey: ["affiliates", advertiserId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("affiliates")
        .select(
          "*, affiliate:advertisers!affiliates_affiliate_user_id_fkey(*, profile:user_profiles(*))",
        )
        .eq("advertiser_id", advertiserId);
      if (error) throw error;
      return data;
    },
  });
  const { data: affiliates } = affiliatesQuery;

  const hasAffiliate = affiliates && affiliates.length > 0;

  return (
    <Card className="bg-transparent border-0 shadow-none">
      <CardContent className="p-0">
        <div className="flex items-end justify-between">
          <div>
            <CardTitle className="mb-2">Affiliate</CardTitle>
            <CardDescription> </CardDescription>
          </div>
        </div>
        {hasAffiliate && (
          <UserAffiliatesTable affiliatesQuery={affiliatesQuery} />
        )}
        {!hasAffiliate && (
          <div className="flex items-center border rounded-md justify-center p-10">
            <CreateAffiliateDialog
              affiliates={affiliates}
              advertiserId={advertiserId}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const validations = z
  .object({
    advertiser_id: z.string().min(1, { error: "Advertiser is required" }),
    affiliate_user_id: z.string().min(1, { error: "No affiliate selected" }),
    currency: z.string(),
    note: z.string().optional(),
    commission_type: z.enum(["one-time", "recurring", "both"]),
    commission_rate: z.number().min(0).max(100).optional(),
    commission_amount: z.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.commission_type === "one-time") {
      if (data.commission_amount === undefined || data.commission_amount <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Amount must be greater than 0",
          path: ["commission_amount"],
        });
      }
    } else if (data.commission_type === "recurring") {
      if (data.commission_rate === undefined || data.commission_rate <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Rate must be greater than 1",
          path: ["commission_rate"],
        });
      }
    } else if (data.commission_type === "both") {
      if (data.commission_amount === undefined || data.commission_amount <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Amount must be greater than 0",
          path: ["commission_amount"],
        });
      }
      if (data.commission_rate === undefined || data.commission_rate <= 0) {
        ctx.addIssue({
          code: "custom",
          message: "Rate must be greater than 1",
          path: ["commission_rate"],
        });
      }
    }
  });

type FormValues = z.infer<typeof validations>;

function CreateAffiliateDialog({
  advertiserId,
  affiliates,
}: {
  advertiserId: string;
  affiliates: any[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    defaultValues: {
      advertiser_id: advertiserId,
      affiliate_user_id: "",
      commission_type: "one-time",
      commission_rate: undefined,
      commission_amount: undefined,
      currency: "EUR",
      note: "",
    },
    resolver: zodResolver(validations),
  });
  const { data: advertisers } = useQuery({
    queryKey: ["advertisers"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("*, profile:user_profiles(*)");
      if (error) throw error;
      return data;
    },
  });
  const { profile } = useAppContext();

  const { mutate: createAffiliate, isPending } = useMutation({
    mutationKey: ["create-affiliate"],
    mutationFn: async (values: FormValues) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("affiliates")
        .insert({ ...values, tenant_id: profile?.tenant_id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Affiliate assigned successfully.");
      setOpen(false);
    },
    onError: (error) => {
      toast.error(`Error assigning affiliate`, { description: error.message });
    },
  });

  const options = advertisers?.map((advertiser) => {
    const {
      id,
      tenant_client_code,
      profile: { full_name },
    } = advertiser;
    return {
      value: id,
      label: (
        <span className="inline-flex w-full justify-between">
          <span>{tenant_client_code}:</span>
          &nbsp;
          <span>{`${full_name}`}</span>&nbsp;&nbsp;
        </span>
      ),
    };
  });

  const filteredOptions = options
    ?.filter((option) => option.value !== advertiserId)
    .filter(
      (option) => !affiliates?.some((aff) => aff.affiliate.id === option.value),
    );

  const handleCreateAffiliate = (values: FormValues) => {
    createAffiliate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={"sm"}>
          <UserPlus />
          Assign Affiliate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Assign Affiliate</DialogTitle>
        <DialogDescription>
          Assign affiliate to this advertiser
        </DialogDescription>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(handleCreateAffiliate)}
          >
            {filteredOptions && (
              <SelectField
                control={form.control}
                id="user-select"
                name="affiliate_user_id"
                label="Select Affiliate"
                options={filteredOptions}
                placeholder="Select"
              />
            )}

            {/* Commission Type */}
            <FormField
              control={form.control}
              name="commission_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commission Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select commission type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="one-time">
                        One Time Commission
                      </SelectItem>
                      <SelectItem value="recurring">
                        Recurring Commission
                      </SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              {/* Conditional Amount/Rate */}
              {(form.watch("commission_type") === "one-time" ||
                form.watch("commission_type") === "both") && (
                <FormField
                  control={form.control}
                  name="commission_amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission Amount</FormLabel>
                      <FormControl>
                        <InputGroup>
                          <InputGroupAddon>€</InputGroupAddon>
                          <InputGroupInput
                            type="number"
                            placeholder="0.00"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(
                                value === "" ? undefined : Number(value),
                              );
                            }}
                          />
                        </InputGroup>
                      </FormControl>
                      <FormDescription>Fixed amount in euros.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {(form.watch("commission_type") === "recurring" ||
                form.watch("commission_type") === "both") && (
                <FormField
                  control={form.control}
                  name="commission_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="0-100"
                          step={0.1}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(
                              value === "" ? undefined : Number(value),
                            );
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Percentage of recurring payments.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
            <TextareaField
              control={form.control}
              name="note"
              id="note"
              label="Note"
              placeholder="Enter note"
            />
            <div className="text-end">
              <Button disabled={isPending} type="submit">
                {isPending && <Loader2 className="animate-spin" />}
                Assign Affiliate
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function UserAffiliatesTable({
  affiliatesQuery,
}: {
  affiliatesQuery: UseQueryResult<any[], Error>;
}) {
  const { data: affiliates, isLoading, isError, error } = affiliatesQuery;

  const filteredAffiliates = affiliates?.filter(
    (afl) => afl.status !== "deleted",
  );

  return (
    <div className="border rounded-lg mt-4">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Client Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Commission Type</TableHead>
            <TableHead>Commission Recurring</TableHead>
            <TableHead>Commission One Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5}>
                <Loader2 className="animate-spin mx-auto" />
              </TableCell>
            </TableRow>
          )}
          {isError && (
            <TableRow>
              <TableCell colSpan={5}>
                <p className="text-muted-foreground text-center">
                  {error.message}
                </p>
              </TableCell>
            </TableRow>
          )}
          {!filteredAffiliates?.length && !isLoading && (
            <TableRow>
              <TableCell colSpan={5}>
                <p className="text-muted-foreground text-center">
                  No affiliates assigned.
                </p>
              </TableCell>
            </TableRow>
          )}

          {filteredAffiliates
            ?.filter((afl) => afl.status !== "deleted")
            .map((affiliate) => (
              <TableRow key={affiliate.id}>
                <TableCell>{affiliate.affiliate.tenant_client_code}</TableCell>
                <TableCell>{affiliate.affiliate.profile.full_name}</TableCell>
                <TableCell className="capitalize">
                  {affiliate.commission_type || "N/A"}
                </TableCell>
                <TableCell>
                  {affiliate.commission_type === "recurring" ||
                  affiliate.commission_type === "both" ? (
                    <span>{affiliate.commission_rate}%</span>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  {affiliate.commission_type === "one-time" ||
                  affiliate.commission_type === "both" ? (
                    <span>
                      {CURRENCY_SYMBOLS[affiliate.currency]}
                      {affiliate.commission_amount
                        ? Number(affiliate.commission_amount).toFixed(2)
                        : "0.00"}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">N/A</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
