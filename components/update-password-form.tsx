"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { createClient } from "@/lib/supabase/client";
import { scorePassword } from "@/lib/password-strength";
import { PasswordInput, RocketMark } from "@/components/auth/auth-bits";

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

// In the shell's vocabulary (components/auth/auth-shell.tsx): the shadcn
// card here was a white box on the dark auth page. Behaviour unchanged.
export function UpdatePasswordForm({
  requireCurrent = false,
  email = "",
}: {
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
    defaultValues: { currentPassword: "", password: "", repeatPassword: "" },
  });

  const password = watch("password") ?? "";
  const strength = scorePassword(password);

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
      setServerError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    }
  };

  return (
    <section className="card login-card">
      <RocketMark />
      <h2>{requireCurrent ? "Change your password" : "Choose a new password"}</h2>
      <p className="lede">
        {email ? (
          <>
            For <b>{email}</b>. At least 12 characters.
          </>
        ) : (
          "At least 12 characters."
        )}
      </p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {requireCurrent && (
          <div className="field">
            <label htmlFor="currentPassword">Current password</label>
            <PasswordInput
              id="currentPassword"
              autoComplete="current-password"
              placeholder="Your current password"
              {...register("currentPassword")}
            />
            <p className="hint">
              You are signed in, so we ask for this before changing it. Forgotten it? Sign out and
              use &ldquo;Forgot password&rdquo;.
            </p>
          </div>
        )}
        <div className="field">
          <label htmlFor="password">New password</label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 12 characters"
            {...register("password")}
          />
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
          <label htmlFor="repeatPassword">Repeat new password</label>
          <PasswordInput
            id="repeatPassword"
            autoComplete="new-password"
            placeholder="Type it again"
            {...register("repeatPassword")}
          />
          {errors.repeatPassword && <p className="err">{errors.repeatPassword.message}</p>}
        </div>
        {serverError && <p className="err">{serverError}</p>}
        <button className="btn" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </section>
  );
}
