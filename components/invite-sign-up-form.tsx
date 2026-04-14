"use client";

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
import { UserInvitation } from "@/lib/types/invite";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Controller } from "react-hook-form";

const inviteSignUpSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    repeatPassword: z.string().min(6, "Repeat your password"),
    referral_status: z.enum(["referred", "not_referred"]).optional(),
    referred_by: z.string().optional(),
    heard_from: z.string().optional(),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  })
  .superRefine((data, ctx) => {
    if (data.referral_status === "referred") {
      if (!data.referred_by || data.referred_by.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Please enter who referred you",
          path: ["referred_by"],
        });
      }
    } else if (data.referral_status === "not_referred") {
      if (!data.heard_from || data.heard_from.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Please select how you heard about us",
          path: ["heard_from"],
        });
      }
    }
  });

type InviteSignUpData = z.infer<typeof inviteSignUpSchema>;

type InviteSignUpFormProps = {
  invite: UserInvitation;
  className?: string;
};

export default function InviteSignUpForm({
  invite,
  className,
}: InviteSignUpFormProps) {
  const router = useRouter();
  const [viewPass, setViewPass] = useState({ pass: false, repeatPass: false });
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InviteSignUpData>({
    defaultValues: {
      firstName: "",
      lastName: "",
      password: "",
      repeatPassword: "",
      referral_status: undefined,
      referred_by: "",
      heard_from: "",
    },
    resolver: zodResolver(inviteSignUpSchema),
  });

  const onSubmit = async (values: InviteSignUpData) => {
    const payload = {
      email: invite.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
      tenant_id: invite.tenant_id,
      role: invite.role,
      invite,
      referral_status: values.referral_status,
      referred_by:
        values.referral_status === "referred" ? values.referred_by : null,
      heard_from:
        values.referral_status === "not_referred" ? values.heard_from : null,
    };

    try {
      const res = await fetch("/api/accept-invite/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to sign up");
      }
      router.push("/dashboard");
    } catch (error) {
      console.error("Error during sign up:", error);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Card>
        <CardHeader>
          <Image
            src="/images/psm-logo.svg"
            alt="Logo"
            height={150}
            width={150}
            className="mx-auto h-44 w-auto object-cover"
          />
          <CardTitle className="text-xl">
            Sign up to Join {invite.tenant_name}
          </CardTitle>
          <CardDescription>
            You are signing up as an <b>{invite.role}</b>. Complete the details
            below to create your account for this organization.
          </CardDescription>
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

              {/* Password */}
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={viewPass.pass ? "text" : "password"}
                    {...register("password")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-transparent"
                    onClick={() =>
                      setViewPass({ ...viewPass, pass: !viewPass.pass })
                    }
                  >
                    {viewPass.pass ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-sm text-red-500">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Repeat Password */}
              <div className="grid gap-2">
                <Label htmlFor="repeatPassword">Repeat Password</Label>
                <div className="relative">
                  <Input
                    id="repeatPassword"
                    type={viewPass.repeatPass ? "text" : "password"}
                    {...register("repeatPassword")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-transparent"
                    onClick={() =>
                      setViewPass({
                        ...viewPass,
                        repeatPass: !viewPass.repeatPass,
                      })
                    }
                  >
                    {viewPass.repeatPass ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {errors.repeatPassword && (
                  <p className="text-sm text-red-500">
                    {errors.repeatPassword.message}
                  </p>
                )}
              </div>

              {!invite.affiliate_id && (
                <div className="space-y-4">
                  <Label>Are you referred by someone?</Label>
                  <Controller
                    control={control}
                    name="referral_status"
                    render={({ field }) => (
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="referred" id="r-referred" />
                          <Label htmlFor="r-referred" className="font-normal">
                            Yes, I was referred by someone
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="not_referred" id="r-not" />
                          <Label htmlFor="r-not" className="font-normal">
                            No, I&apos;m not referred
                          </Label>
                        </div>
                      </RadioGroup>
                    )}
                  />
                  {errors.referral_status && (
                    <p className="text-sm text-red-500">
                      {errors.referral_status.message}
                    </p>
                  )}

                  {watch("referral_status") === "referred" && (
                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                      <Label htmlFor="referred_by">
                        Referral Email or Name
                      </Label>
                      <Input
                        id="referred_by"
                        placeholder="Enter email or company name"
                        {...register("referred_by")}
                      />
                      {errors.referred_by && (
                        <p className="text-sm text-red-500">
                          {errors.referred_by.message}
                        </p>
                      )}
                    </div>
                  )}

                  {watch("referral_status") === "not_referred" && (
                    <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                      <Label htmlFor="heard_from">
                        How did you hear about us?
                      </Label>
                      <Controller
                        control={control}
                        name="heard_from"
                        render={({ field }) => (
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <SelectTrigger id="heard_from">
                              <SelectValue placeholder="Select an option" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="google">Google</SelectItem>
                              <SelectItem value="tiktok">TikTok</SelectItem>
                              <SelectItem value="linkedin">LinkedIn</SelectItem>
                              <SelectItem value="facebook">Facebook</SelectItem>
                              <SelectItem value="twitter">Twitter</SelectItem>
                              <SelectItem value="friend">
                                Friend/Colleague
                              </SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.heard_from && (
                        <p className="text-sm text-red-500">
                          {errors.heard_from.message}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" className="w-full">
                {isSubmitting && <Loader2 className=" animate-spin" />}
                Join Organization
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
