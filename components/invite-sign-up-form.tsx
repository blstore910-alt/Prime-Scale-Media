"use client";

import { scorePassword } from "@/lib/password-strength";
import { createClient } from "@/lib/supabase/client";
import { UserInvitation } from "@/lib/types/invite";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

// Marks from the approved mockup (onboarding-auth.html), matching the
// sign-in screen this form now sits one click away from.
function Rocket() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24">
      <path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a10.9 10.9 0 0 0 5.4-1.4" />
      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const inviteSignUpSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    repeatPassword: z.string().min(12, "Repeat your password"),
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

const HEARD_FROM = [
  ["google", "Google"],
  ["tiktok", "TikTok"],
  ["linkedin", "LinkedIn"],
  ["facebook", "Facebook"],
  ["twitter", "Twitter"],
  ["friend", "Friend/Colleague"],
  ["other", "Other"],
] as const;

export default function InviteSignUpForm({
  invite,
}: {
  invite: UserInvitation;
  className?: string;
}) {
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

  const password = watch("password") ?? "";
  const strength = scorePassword(password);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to sign up");
      }

      // The server created the account with an admin client, which does
      // NOT set a browser session. Sign in client-side so the cookies are
      // set before we navigate, otherwise /dashboard bounces to login.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password: values.password,
      });
      if (signInError) {
        toast.success("Account created — please log in to continue.");
        router.push("/auth/login");
        return;
      }
      toast.success("Welcome! Your account is ready.");
      // ── AN ADVERTISER NEEDS THEIR COMPANY BEFORE ANYTHING ELSE ──
      //
      // The existing-user accept path sends advertisers to
      // /complete-profile and explains why; the SIGNUP path -- the one
      // every brand-new customer takes -- sent everybody to
      // /dashboard. There they meet a red chip telling them to add
      // company details, a Top up button that is greyed, and a
      // Request one that is dead, with the form they need one more
      // click away. The layout redirects them there anyway on the
      // next navigation, so this only decides whether their first
      // screen is the blocked one or the one that unblocks it.
      router.push(
        String(invite?.role ?? "").toLowerCase() === "advertiser"
          ? "/complete-profile"
          : "/dashboard",
      );
    } catch (error) {
      console.error("Error during sign up:", error);
      toast.error(
        error instanceof Error ? error.message : "Sign up failed. Try again.",
      );
    }
  };

  return (
    <section className="card login-card signup-card">
      <div className="lmk">
        <span className="mk">
          <Rocket />
        </span>
      </div>
      <h2>Create your account</h2>
      <p className="lede">
        You were invited to join {invite.tenant_name} as an{" "}
        <b>{invite.role}</b>.
      </p>

      {/* The address the account is created for. It is not editable — it is
          what the invitation was sent to — but it must be VISIBLE, because
          this is the moment someone commits a password to it.

          It carries the role and organisation too: the lede above is hidden at
          phone width to keep this long form on one screen, and "which company
          am I joining, and as what" is not a detail to drop on the screen
          where someone creates the account. */}
      <div className="whoami">
        <MailIcon />
        <span className="t">
          <small>
            Joining {invite.tenant_name} as {invite.role}
          </small>
          <b title={invite.email}>{invite.email}</b>
        </span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="row2">
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <div className="inp">
              <UserIcon />
              <input id="firstName" placeholder="John" {...register("firstName")} />
            </div>
            {errors.firstName && (
              <p className="err">{errors.firstName.message}</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <div className="inp">
              <UserIcon />
              <input id="lastName" placeholder="Doe" {...register("lastName")} />
            </div>
            {errors.lastName && <p className="err">{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="inp haseye">
            <LockIcon />
            <input
              id="password"
              type={viewPass.pass ? "text" : "password"}
              placeholder="At least 12 characters"
              {...register("password")}
            />
            <button
              type="button"
              className="eye"
              onClick={() => setViewPass({ ...viewPass, pass: !viewPass.pass })}
              aria-label={viewPass.pass ? "Hide password" : "Show password"}
            >
              <EyeIcon off={viewPass.pass} />
            </button>
          </div>
          {/* Empty means empty: with no password typed the score is 0, every
              segment stays unfilled and the labels below stay blank. */}
          <div className="pwbar" data-score={password ? strength.score : 0}>
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} className={password && i < strength.score ? "on" : ""} />
            ))}
          </div>
          <div className="pwmeta" aria-live="polite">
            <b>{password ? strength.label : ""}</b>
            <span>{password ? strength.reasons[0] ?? "" : ""}</span>
          </div>
          {errors.password && <p className="err">{errors.password.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="repeatPassword">Repeat password</label>
          <div className="inp haseye">
            <LockIcon />
            <input
              id="repeatPassword"
              type={viewPass.repeatPass ? "text" : "password"}
              placeholder="Type it again"
              {...register("repeatPassword")}
            />
            <button
              type="button"
              className="eye"
              onClick={() =>
                setViewPass({ ...viewPass, repeatPass: !viewPass.repeatPass })
              }
              aria-label={
                viewPass.repeatPass ? "Hide password" : "Show password"
              }
            >
              <EyeIcon off={viewPass.repeatPass} />
            </button>
          </div>
          {errors.repeatPassword && (
            <p className="err">{errors.repeatPassword.message}</p>
          )}
        </div>

        {/* Only asked when the invitation doesn't already carry a referrer —
            if it does, the answer is already known and asking again invites a
            contradiction. */}
        {!invite.affiliate_id && (
          <div className="field">
            <label>Were you referred by someone?</label>
            <Controller
              control={control}
              name="referral_status"
              render={({ field }) => (
                <div className="radios" role="radiogroup">
                  <label className="radio">
                    <input
                      type="radio"
                      name="referral_status"
                      value="referred"
                      checked={field.value === "referred"}
                      onChange={() => field.onChange("referred")}
                    />
                    <span>Yes, someone referred me</span>
                  </label>
                  <label className="radio">
                    <input
                      type="radio"
                      name="referral_status"
                      value="not_referred"
                      checked={field.value === "not_referred"}
                      onChange={() => field.onChange("not_referred")}
                    />
                    <span>No, I found you another way</span>
                  </label>
                </div>
              )}
            />
            {errors.referral_status && (
              <p className="err">{errors.referral_status.message}</p>
            )}

            {watch("referral_status") === "referred" && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="referred_by">Their email or company name</label>
                <input
                  id="referred_by"
                  placeholder="name@company.com"
                  {...register("referred_by")}
                />
                {errors.referred_by && (
                  <p className="err">{errors.referred_by.message}</p>
                )}
              </div>
            )}

            {watch("referral_status") === "not_referred" && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="heard_from">How did you hear about us?</label>
                <select id="heard_from" {...register("heard_from")}>
                  <option value="">Select an option</option>
                  {HEARD_FROM.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {errors.heard_from && (
                  <p className="err">{errors.heard_from.message}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Disabled, not just a spinner. This is the button that CREATES the
            account — profile, advertiser, wallet and subscription — and it is
            the first thing a new customer ever presses, often on a phone on a
            bad connection, which is exactly when people press twice.
            react-hook-form has no re-entrancy lock of its own. */}
        <button className="btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating your account…" : "Join Prime Scale Media"}
        </button>
      </form>
    </section>
  );
}
