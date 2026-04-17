"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import InputField from "@/components/form/input-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import { Label } from "../ui/label";

const inviteBaseSchema = z.object({
  email: z.email("Please enter a valid email address"),
  role: z.string().min(1, "Please select a role"),
});

type InviteFormInput = z.input<typeof inviteBaseSchema>;
type InviteFormValues = z.output<typeof inviteBaseSchema>;

export default function InviteForm() {
  const { state, dispatch } = useAppContext();
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const { tenant } = profile || {};

  const form = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteBaseSchema),
    defaultValues: {
      email: "",
      role: "advertiser",
    },
  });

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
