"use client";

import { avatarFor, mouthPath, type AvatarRole } from "@/lib/pure-avatar";

/**
 * A person's avatar, drawn here rather than fetched from anywhere.
 *
 * Inline SVG: no network request, no third party holding a hash of a
 * customer's email address, nothing to go down and nothing to add to the
 * content-security policy. See lib/pure-avatar.ts for the full argument.
 *
 * TWO SHAPES.
 *   face     — the default. A friendly mark that an operator recognises
 *              faster than they read a name, which is what an avatar is
 *              for in a queue of eighty rows.
 *   initials — for dense tables and for anywhere the face would be under
 *              20px, where two letters simply carry more.
 *
 * The seed should be STABLE. Pass a profile or advertiser id, not a name:
 * somebody correcting the spelling of their own name should not become a
 * different face in a list an admin has learned to read.
 */
export default function PsmAvatar({
  seed,
  name,
  email,
  role = "unknown",
  size = 32,
  variant = "face",
  ring,
  className,
  title,
}: {
  seed: string;
  name?: string | null;
  email?: string | null;
  role?: AvatarRole;
  size?: number;
  variant?: "face" | "initials";
  /** A coloured ring, for marking state (e.g. a customer who is overdue). */
  ring?: string;
  className?: string;
  title?: string;
}) {
  const a = avatarFor(seed, { role, name, email });
  const id = `av${Math.abs(
    // A gradient id must be unique per avatar on the page, and it has to
    // be the SAME on the server and in the browser or React complains
    // about the mismatch — so it comes from the seed, not from a counter
    // and certainly not from Math.random().
    seed.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7),
  )}`;

  const label = name || email || "Account";

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 36 36"
      role="img"
      aria-label={`${label} avatar`}
      style={{ flex: "0 0 auto", display: "block", borderRadius: "50%" }}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.bg} />
          <stop offset="1" stopColor={a.bg2} />
        </linearGradient>
      </defs>

      <circle cx="18" cy="18" r="18" fill={`url(#${id})`} />

      {variant === "initials" ? (
        <text
          x="18"
          y="18"
          textAnchor="middle"
          dominantBaseline="central"
          fill={a.ink}
          fontSize="13"
          fontWeight="800"
          fontFamily="var(--hd, system-ui), system-ui, sans-serif"
          letterSpacing="0.2"
        >
          {a.initials}
        </text>
      ) : (
        <g transform={`rotate(${a.tilt} 18 20)`}>
          <circle cx={18 - a.eyeGap} cy={a.eyeY} r="1.9" fill={a.ink} />
          <circle cx={18 + a.eyeGap} cy={a.eyeY} r="1.9" fill={a.ink} />
          <path
            d={mouthPath(a)}
            stroke={a.ink}
            strokeWidth="1.9"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}

      {ring ? (
        <circle
          cx="18"
          cy="18"
          r="17"
          fill="none"
          stroke={ring}
          strokeWidth="2"
        />
      ) : null}
    </svg>
  );
}
