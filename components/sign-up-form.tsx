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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { safeErrorMessage } from "@/lib/pure-error";

const signUpSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    repeatPassword: z.string().min(12, "Repeat your password"),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

type SignUpFormData = z.infer<typeof signUpSchema>;

export function SignUpForm({
  className,
  referralCode,
  tenantSlug,

  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  referralCode?: string | null;
  tenantSlug?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    mode: "onBlur",
  });

  const onSubmit = async (data: SignUpFormData) => {
    try {
      // ── BACK THROUGH /auth/confirm, WITH THE LINK'S OWN t AND ref ──
      // This was the bare origin. With Supabase's default template the
      // confirmation lands on the redirect with ?code=..., and only
      // /auth/confirm turns that into a profile, a wallet and the
      // referral -- the home page does none of it.
      const confirmUrl = new URL("/auth/confirm", window.location.origin);
      if (tenantSlug) confirmUrl.searchParams.set("t", tenantSlug);
      if (referralCode) confirmUrl.searchParams.set("ref", referralCode);

      const { data: signUpData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: confirmUrl.toString(),
          data: {
            display_name: `${data.firstName} ${data.lastName}`,
            first_name: data.firstName,
            last_name: data.lastName,
            referral_code: referralCode ?? null,
            tenant_slug: tenantSlug ?? null,
          },
        },
      });
      if (error) throw error;
      // ── AN ADDRESS THAT ALREADY HAS AN ACCOUNT ──────────────────────
      // Supabase answers a sign-up for a known address with a user that
      // has NO identities and no error (so nobody can probe which
      // addresses exist) -- and sends no email. The form then said
      // "check your inbox" for a mail that never comes.
      if (signUpData?.user && (signUpData.user.identities ?? []).length === 0) {
        toast.error("This email already has an account", {
          description: "Sign in instead — or use “Forgot password” if you can't.",
        });
        return;
      }
      router.push("/auth/sign-up-success");
    } catch (error) {
      console.error(safeErrorMessage(error));
      toast.error("Sign up failed", { description: safeErrorMessage(error) });
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-6">
              <div className="flex gap-6">
                {/* First Name */}
                <div className="grid gap-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    {...register("firstName")}
                  />

                  {errors.firstName && (
                    <p className="text-sm text-red-500">
                      {errors.firstName.message}
                    </p>
                  )}
                </div>

                {/* Last Name */}
                <div className="grid gap-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    {...register("lastName")}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-red-500">
                      {errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...register("password")}
                />
                <PasswordStrength password={watch("password") ?? ""} />
                {errors.password && (
                  <p className="text-sm text-red-500">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Repeat Password */}
              <div className="grid gap-2">
                <Label htmlFor="repeatPassword">Repeat Password</Label>
                <Input
                  id="repeatPassword"
                  type="password"
                  {...register("repeatPassword")}
                />
                {errors.repeatPassword && (
                  <p className="text-sm text-red-500">
                    {errors.repeatPassword.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  "Sign up"
                )}
              </Button>
            </div>

            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link href="/auth/login" className="underline underline-offset-4">
                Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
