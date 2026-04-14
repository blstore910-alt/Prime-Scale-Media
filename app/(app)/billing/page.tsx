"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

const billingFormSchema = z.object({
  sameAsCompany: z.boolean(),
  address: z.string().min(1, "Address is required"),
  country: z.string().min(1, "Country is required"),
  state: z.string().min(1, "State is required"),
  zipcode: z.string().min(1, "Zipcode is required"),
});

type BillingFormValues = z.infer<typeof billingFormSchema>;

const defaultValues: BillingFormValues = {
  sameAsCompany: false,
  address: "",
  country: "",
  state: "",
  zipcode: "",
};

export default function BillingPage() {
  const form = useForm<BillingFormValues>({
    resolver: zodResolver(billingFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const sameAsCompany = form.watch("sameAsCompany");

  useEffect(() => {
    if (sameAsCompany) {
      // Mock copying data from company
      form.setValue("address", "1234 Main St (Company)");
      form.setValue("country", "United States");
      form.setValue("state", "California");
      form.setValue("zipcode", "90210");
    } else {
      // Optionally clear or leave as is
    }
  }, [sameAsCompany, form]);

  function onSubmit(data: BillingFormValues) {
    console.log(data);
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 sm:px-10 space-y-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Billing Settings
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage your billing information and address.
        </p>
      </div>

      <Separator />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
          <section className="space-y-6">
            <h3 className="text-lg font-medium">Billing Address</h3>

            <FormField
              control={form.control}
              name="sameAsCompany"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Use Company Address</FormLabel>
                    <FormDescription>
                      Billing address will be the same as your company details.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="1234 Main St" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="United States" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State / Province</FormLabel>
                    <FormControl>
                      <Input placeholder="California" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zipcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zip / Postal Code</FormLabel>
                    <FormControl>
                      <Input placeholder="90210" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <div className="flex justify-end">
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
