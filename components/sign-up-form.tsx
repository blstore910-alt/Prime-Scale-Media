"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { safeErrorMessage } from "@/lib/pure-error";
import { scorePassword } from "@/lib/password-strength";

// ── THE SIGN-UP BEHIND A REFERRAL LINK ──────────────────────────────────
//
// The owner, 22-09: "the referral screen is not readable, and the GUI is
// not nice". It was the shadcn Card/Input set, which puts a WHITE card
// inside the dark /auth shell -- and the shell's own input rule then
// paints white-on-white fields you cannot see. The invite sign-up was
// moved off that set for exactly this reason; this is the same form in
// the same vocabulary (app/auth/layout.tsx), so the two screens a new
// customer can land on look like one product.

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
function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" />
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

const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    email: z.string().trim().email("Enter a valid email address"),
    password: z.string().min(12, "Password must be at least 12 characters"),
    repeatPassword: z.string().min(12, "Repeat your password"),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

type SignUpFormData = z.infer<typeof signUpSchema>;

export function SignUpForm({
  referralCode,
  tenantSlug,
}: {
  referralCode?: string | null;
  tenantSlug?: string | null;
}) {
  const router = useRouter();
  const [show, setShow] = useState({ pass: false, repeat: false });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    mode: "onBlur",
    defaultValues: { firstName: "", lastName: "", email: "", password: "", repeatPassword: "" },
  });

  const password = watch("password") ?? "";
  const strength = scorePassword(password);

  const onSubmit = async (data: SignUpFormData) => {
    try {
      const supabase = createClient();
      // ── BACK THROUGH /auth/confirm, WITH THE LINK'S OWN t AND ref ──
      // With Supabase's default template the confirmation lands on this
      // address with ?code=..., and only /auth/confirm turns that into a
      // profile, a wallet and the referral -- the home page does none of it.
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
      // Supabase answers a sign-up for a known address with a user that has
      // NO identities and no error (so nobody can probe which addresses
      // exist) -- and sends no email. Saying "check your inbox" for a mail
      // that never comes is the worst answer.
      if (signUpData?.user && (signUpData.user.identities ?? []).length === 0) {
        toast.error("This email already has an account", {
          description: "Sign in instead — or use “Forgot password” if you can't.",
        });
        return;
      }
      // For "Check your inbox": where the mail went, and where a resend
      // should point. sessionStorage, not the URL -- an address in a query
      // string ends up in logs.
      try {
        sessionStorage.setItem("psm_signup_email", data.email);
        sessionStorage.setItem("psm_signup_redirect", confirmUrl.toString());
      } catch {
        // Private mode: the next screen works without them.
      }
      router.push("/auth/sign-up-success");
    } catch (error) {
      console.error(safeErrorMessage(error));
      toast.error("Sign up failed", { description: safeErrorMessage(error) });
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
      <p className="lede">Run your ad accounts with Prime Scale Media.</p>

      {/* The link worked, and says so. The code is the one in the address
          the person clicked -- nothing here that the link did not carry. */}
      {referralCode ? (
        <div className="whoami">
          <GiftIcon />
          <span className="t">
            <small>Invited by a partner</small>
            <b>Referral code {referralCode}</b>
          </span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="row2">
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <div className="inp">
              <UserIcon />
              <input
                id="firstName"
                autoComplete="given-name"
                placeholder="John"
                {...register("firstName")}
              />
            </div>
            {errors.firstName && <p className="err">{errors.firstName.message}</p>}
          </div>
          <div className="field">
            <label htmlFor="lastName">Last name</label>
            <div className="inp">
              <UserIcon />
              <input
                id="lastName"
                autoComplete="family-name"
                placeholder="Doe"
                {...register("lastName")}
              />
            </div>
            {errors.lastName && <p className="err">{errors.lastName.message}</p>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <div className="inp">
            <MailIcon />
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              {...register("email")}
            />
          </div>
          {errors.email && <p className="err">{errors.email.message}</p>}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="inp haseye">
            <LockIcon />
            <input
              id="password"
              type={show.pass ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 12 characters"
              {...register("password")}
            />
            <button
              type="button"
              className="eye"
              onClick={() => setShow((s) => ({ ...s, pass: !s.pass }))}
              aria-label={show.pass ? "Hide password" : "Show password"}
            >
              <EyeIcon off={show.pass} />
            </button>
          </div>
          {/* Empty means empty: nothing typed, every segment unfilled. */}
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
              type={show.repeat ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Type it again"
              {...register("repeatPassword")}
            />
            <button
              type="button"
              className="eye"
              onClick={() => setShow((s) => ({ ...s, repeat: !s.repeat }))}
              aria-label={show.repeat ? "Hide password" : "Show password"}
            >
              <EyeIcon off={show.repeat} />
            </button>
          </div>
          {errors.repeatPassword && <p className="err">{errors.repeatPassword.message}</p>}
        </div>

        {/* Disabled while it runs: people press twice on a slow phone. */}
        <button className="btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating your account…" : "Create my account"}
        </button>
      </form>

      <p className="meta">
        Already have an account?{" "}
        <Link className="lnk" href="/auth/login">
          Log in
        </Link>
      </p>
    </section>
  );
}
