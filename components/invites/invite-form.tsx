"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import useUsers from "@/components/admin/users/use-users";
import { cn } from "@/lib/utils";
import { Checkbox } from "../ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import { Label } from "../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";

const optionalNumberInput = (schema: z.ZodNumber) =>
  z
    .preprocess((value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }

      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
      }

      return value;
    }, schema.optional())
    .optional();

const inviteBaseSchema = z.object({
  email: z.email("Please enter a valid email address"),
  role: z.string().min(1, "Please select a role"),
  assign_affiliate: z.boolean(),
  affiliate_id: z.string().optional(),
  commission_type: z.enum(["one-time", "recurring", "both"]).optional(),
  commission_rate: optionalNumberInput(z.number().min(0).max(100)),
  commission_amount: optionalNumberInput(z.number().min(0)),
});

const COMMISSION_TYPE_OPTIONS = [
  { value: "one-time", label: "One Time" },
  { value: "recurring", label: "Recurring" },
  { value: "both", label: "One Time + Recurring" },
] as const;

const parseOptionalNumber = (value: string) => {
  if (value === "") return undefined;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toNumberInputValue = (value: unknown) =>
  typeof value === "number" || typeof value === "string" ? value : "";

const inviteSchema = inviteBaseSchema.superRefine((data, ctx) => {
  if (data.assign_affiliate) {
    if (!data.affiliate_id) {
      ctx.addIssue({
        code: "custom",
        message: "Affiliate is required",
        path: ["affiliate_id"],
      });
    }
    if (!data.commission_type) {
      ctx.addIssue({
        code: "custom",
        message: "Commission type is required",
        path: ["commission_type"],
      });
    } else {
      if (data.commission_type === "one-time") {
        if (
          data.commission_amount === undefined ||
          data.commission_amount <= 0
        ) {
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
            message: "Rate must be greater than 0",
            path: ["commission_rate"],
          });
        }
      } else if (data.commission_type === "both") {
        if (
          data.commission_amount === undefined ||
          data.commission_amount <= 0
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Amount must be greater than 0",
            path: ["commission_amount"],
          });
        }
        if (data.commission_rate === undefined || data.commission_rate <= 0) {
          ctx.addIssue({
            code: "custom",
            message: "Rate must be greater than 0",
            path: ["commission_rate"],
          });
        }
      }
    }
  }
});

type InviteFormInput = z.input<typeof inviteSchema>;
type InviteFormValues = z.output<typeof inviteSchema>;

export default function InviteForm() {
  const { state, dispatch } = useAppContext();
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const { tenant } = profile || {};

  const form = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "advertiser",
      assign_affiliate: false,
      affiliate_id: "",
      commission_type: "one-time",
      commission_rate: undefined,
      commission_amount: undefined,
    },
  });

  const [openAffiliate, setOpenAffiliate] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);

  const { profiles, isLoading: isLoadingUsers } = useUsers({
    search: debouncedSearchTerm,
    perPage: 50,
  });

  const assignAffiliate = form.watch("assign_affiliate");
  const commissionType = form.watch("commission_type");

  async function onSubmit(values: InviteFormValues) {
    try {
      form.clearErrors();
      setLoading(true);
      const { data: user } = await supabase.auth.getUser();

      if (values.email === user.user?.user_metadata.email) {
        form.setError("email", {
          message: `You can't send an invite to yourself`,
        });
        return;
      }

      const res = await fetch("/api/send-invite", {
        body: JSON.stringify({
          email: values.email,
          role: values.role,
          tenant_id: profile?.tenant_id,
          tenant_name: tenant?.name,
          sender_profile_id: profile?.id,
          // Affiliate fields
          ...(values.assign_affiliate && {
            affiliate_id: values.affiliate_id,
            commission_type: values.commission_type,
            commission_rate:
              values.commission_type === "recurring" ||
              values.commission_type === "both"
                ? values.commission_rate
                : null,
            commission_amount:
              values.commission_type === "one-time" ||
              values.commission_type === "both"
                ? values.commission_amount
                : null,
          }),
        }),
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }

      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        queryClient.invalidateQueries({ queryKey: ["invites"] });
        form.reset();
        dispatch("close-invite-user");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "");
    } finally {
      setLoading(false);
    }
  }
  const advertisers = profiles?.data?.filter((user) => user.advertiser?.length);
  return (
    <Dialog
      open={state.inviteUserOpen}
      onOpenChange={() => dispatch("close-invite-user")}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a Member</DialogTitle>
          <DialogDescription>
            You can add a member in your organization by sending an invite to
            his email address.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label className="mb-2">Assigned Client Code</Label>
              <InputGroup className="cursor-not-allowed">
                <InputGroupAddon className="border-r pr-2">
                  {tenant?.initials}
                </InputGroupAddon>
                <InputGroupInput
                  value={String(
                    (tenant?.last_client_code as number) + 1,
                  ).padStart(6, "0")}
                  disabled
                />
              </InputGroup>
            </div>

            <InputField
              control={form.control}
              id="invite-email"
              name="email"
              label="Email"
              placeholder="user@example.com"
              type="email"
            />

            {/* Affiliate Section */}
            {/* <FormField
              control={form.control}
              name="assign_affiliate"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Assign Affiliate</FormLabel>
                    <FormDescription>
                      Assign an affiliate to this user for commission tracking.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            /> */}

            {assignAffiliate && (
              <div className="space-y-4">
                {/*                 
                <FormField
                  control={form.control}
                  name="affiliate_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Select Affiliate</FormLabel>
                      <Popover
                        open={openAffiliate}
                        onOpenChange={setOpenAffiliate}
                      >
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between",
                                !field.value && "text-muted-foreground",
                              )}
                            >
                              {field.value
                                ? advertisers?.find(
                                    (user) =>
                                      user.advertiser?.[0]?.id === field.value,
                                  )?.full_name || "Select affiliate"
                                : "Select affiliate"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="p-0">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search affiliate..."
                              value={searchTerm}
                              onValueChange={setSearchTerm}
                            />
                            <CommandList>
                              {isLoadingUsers ? (
                                <div className="py-6 text-center text-sm text-muted-foreground">
                                  Loading users...
                                </div>
                              ) : (
                                <>
                                  <CommandEmpty>No user found.</CommandEmpty>
                                  <CommandGroup>
                                    {advertisers?.map((user) => (
                                      <CommandItem
                                        value={user.full_name}
                                        key={user.id}
                                        onSelect={() => {
                                          const affiliateId =
                                            user.advertiser?.[0]?.id;
                                          if (!affiliateId) return;

                                          form.setValue(
                                            "affiliate_id",
                                            affiliateId,
                                          );
                                          setOpenAffiliate(false);
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            user.advertiser?.[0]?.id ===
                                              field.value
                                              ? "opacity-100"
                                              : "opacity-0",
                                          )}
                                        />
                                        {
                                          user.advertiser?.[0]
                                            ?.tenant_client_code
                                        }
                                        {": "}
                                        {user.full_name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <SelectField
                  control={form.control}
                  id="invite-commission-type"
                  name="commission_type"
                  label="Commission Type"
                  placeholder="Select commission type"
                  options={[...COMMISSION_TYPE_OPTIONS]}
                />

                <div className="flex  gap-4 items-start">
                  
                  {(commissionType === "one-time" ||
                    commissionType === "both") && (
                    <FormField
                      control={form.control}
                      name="commission_amount"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Commission Amount</FormLabel>
                          <FormControl>
                            <InputGroup>
                              <InputGroupAddon>€</InputGroupAddon>
                              <InputGroupInput
                                type="number"
                                placeholder="0.00"
                                step={0.1}
                                value={toNumberInputValue(field.value)}
                                onChange={(e) => {
                                  field.onChange(
                                    parseOptionalNumber(e.target.value),
                                  );
                                }}
                              />
                            </InputGroup>
                          </FormControl>
                          <FormDescription>
                            Fixed amount in euros.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {(commissionType === "recurring" ||
                    commissionType === "both") && (
                    <FormField
                      control={form.control}
                      name="commission_rate"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Commission Rate (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step={0.1}
                              placeholder="0-100"
                              value={toNumberInputValue(field.value)}
                              onChange={(e) => {
                                field.onChange(
                                  parseOptionalNumber(e.target.value),
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
                </div> */}
              </div>
            )}

            {/* Actions */}
            <DialogFooter>
              <Button type="submit">
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send />
                )}
                Send Invite
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
