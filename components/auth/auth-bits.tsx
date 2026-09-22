"use client";

import { useState } from "react";

// The small pieces every screen in the auth shell uses, in the shell's own
// vocabulary (components/auth/auth-shell.tsx): the rocket mark, the field
// icons, a password field with show/hide. Line icons take the shell's
// stroke rule, so they carry no colour of their own.

export function RocketMark() {
  return (
    <div className="lmk">
      <span className="mk">
        <svg viewBox="0 0 24 24">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      </span>
    </div>
  );
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect width="18" height="11" x="3" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
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

/** A password input with the lock icon and a show/hide eye. */
export function PasswordInput(
  // ComponentProps, not InputHTMLAttributes: it carries `ref`, which
  // react-hook-form's register() hands over (a plain prop in React 19).
  props: React.ComponentProps<"input"> & { id: string },
) {
  const [show, setShow] = useState(false);
  return (
    <div className="inp haseye">
      <LockIcon />
      <input {...props} type={show ? "text" : "password"} />
      <button
        type="button"
        className="eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
      >
        <EyeIcon off={show} />
      </button>
    </div>
  );
}

/** The round badge at the top of a status screen: an envelope, a clock, a warning. */
export function StatusBadge({
  tone,
  children,
}: {
  tone: "mail" | "warn" | "ok";
  children: React.ReactNode;
}) {
  return (
    <div className={`inbox${tone === "warn" ? " warn" : tone === "ok" ? " ok" : ""}`} aria-hidden="true">
      {children}
      {tone === "mail" ? <span className="ping" /> : null}
    </div>
  );
}
