"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordStrength from "@/components/ui/password-strength";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const updatePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    password: z.string().min(12, "Password must be at least 12 characters"),
    repeatPassword: z.string().min(12, "Repeat your password"),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>;

export function UpdatePasswordForm({
  className,
  requireCurrent = false,
  email = "",
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  /** True for a session that did NOT come from a recovery link. */
  requireCurrent?: boolean;
  email?: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordFormData>({
    resolver: zodResolver(updatePasswordSchema),
  });

  const onSubmit = async (data: UpdatePasswordFormData) => {
    const supabase = createClient();
    setServerError(null);

    try {
      // ── PROVE THE CURRENT ONE FIRST ─────────────────────────────
      //
      // Only for a session that did not come from a recovery link --
      // a genuine recovery user is precisely the person who cannot
      // supply it. For everybody else, an unlocked laptop was enough
      // to take the account.
      if (requireCurrent) {
        const current = (data.currentPassword ?? "").trim();
        if (!current) {
          setServerError("Enter your current password to change it.");
          return;
        }
        const { error: checkError } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        });
        if (checkError) {
          setServerError("That current password is not right.");
          return;
        }
      }
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (error) throw error;
      router.push("/dashboard");
    } catch (error: unknown) {
      setServerError(
        error instanceof Error ? error.message : "An error occurred",
      );
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Reset Your Password</CardTitle>
          <CardDescription>
            Please enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6">
              {requireCurrent && (
                <div className="grid gap-2">
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Your current password"
                    {...register("currentPassword")}
                  />
                  <p className="text-xs text-muted-foreground">
                    You are signed in, so we ask for this before changing
                    it. If you have forgotten it, sign out and use
                    &ldquo;Forgot password&rdquo;.
                  </p>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="New password"
                  {...register("password")}
                />
                <PasswordStrength password={watch("password") ?? ""} />
                {errors.password && (
                  <p className="text-sm text-red-500">
                    {errors.password.message}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="repeatPassword">Repeat password</Label>
                <Input
                  id="repeatPassword"
                  type="password"
                  placeholder="Repeat password"
                  {...register("repeatPassword")}
                />
                {errors.repeatPassword && (
                  <p className="text-sm text-red-500">
                    {errors.repeatPassword.message}
                  </p>
                )}
              </div>
              {serverError && (
                <p className="text-sm text-red-500">{serverError}</p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save new password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
