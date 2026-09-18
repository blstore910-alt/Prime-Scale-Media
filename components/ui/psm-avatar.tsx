"use client";

import {
  avatarFor,
  mouthPath,
  type AvatarRole,
  type AvatarSpec,
  type AvatarStyle,
} from "@/lib/pure-avatar";

/**
 * A person's avatar, drawn here rather than fetched from anywhere.
 *
 * Inline SVG: no network request, no third party holding a hash of a
 * customer's email address, nothing to go down and nothing to add to the
 * content-security policy. See lib/pure-avatar.ts for the full argument.
 *
 * TEN STYLES, and deliberately not ten variations of one idea. A picker
 * where every option is a slightly different face is a slider, not a
 * choice — so these differ in kind: a face, an abstract, a monogram, a
 * pattern, a mark. Whichever is chosen, it stays deterministic from the
 * seed, so the same person is the same picture everywhere in the app.
 *
 * The seed should be STABLE. Pass a profile or advertiser id, not a
 * name: somebody correcting the spelling of their own name should not
 * become a different picture in a list an admin has learned to read.
 */
export default function PsmAvatar({
  seed,
  name,
  email,
  role = "unknown",
  size = 32,
  style = "beam",
  ring,
  className,
  title,
}: {
  seed: string;
  name?: string | null;
  email?: string | null;
  role?: AvatarRole;
  size?: number;
  style?: AvatarStyle;
  /** A coloured ring, for marking state (e.g. a customer who is overdue). */
  ring?: string;
  className?: string;
  title?: string;
}) {
  const a = avatarFor(seed, { role, name, email });
  // A gradient id must be unique on the page AND identical on the server
  // and in the browser, or React reports a mismatch — so it comes from the
  // seed, not from a counter and certainly not from Math.random().
  const uid = `av${Math.abs(
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
        <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a.bg} />
          <stop offset="1" stopColor={a.bg2} />
        </linearGradient>
        <clipPath id={`${uid}c`}>
          <circle cx="18" cy="18" r="18" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${uid}c)`}>
        <Style style={style} a={a} uid={uid} />
      </g>

      {ring ? (
        <circle cx="18" cy="18" r="17" fill="none" stroke={ring} strokeWidth="2" />
      ) : null}
    </svg>
  );
}

/** The ten drawings. Each takes the same spec and paints the whole disc. */
function Style({
  style,
  a,
  uid,
}: {
  style: AvatarStyle;
  a: AvatarSpec;
  uid: string;
}) {
  const [c1, c2, c3] = a.palette;
  const [k0, k1, k2, k3, k4, k5] = a.k;
  const grad = `url(#${uid}g)`;

  switch (style) {
    // ── A face. Two eyes and a mouth, tilted, on a soft gradient. ─────
    case "beam":
      return (
        <>
          <rect width="36" height="36" fill={grad} />
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
        </>
      );

    // ── Soft overlapping blobs. Organic, no two alike. ────────────────
    case "marble":
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          <circle cx={6 + k0 * 24} cy={4 + k1 * 20} r={13 + k2 * 7} fill={a.bg} opacity="0.95" />
          <circle cx={10 + k3 * 22} cy={16 + k4 * 18} r={10 + k5 * 8} fill={c1} opacity="0.8" />
          <circle cx={2 + k4 * 30} cy={24 + k0 * 12} r={8 + k1 * 6} fill={c2} opacity="0.65" />
        </>
      );

    // ── Circle, bar and square on a grid. Flat, primary, deliberate. ──
    case "bauhaus":
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          <rect
            x="0"
            y={k0 < 0.5 ? 0 : 18}
            width="36"
            height="18"
            fill={a.bg}
          />
          <circle cx={9 + k1 * 18} cy={9 + k2 * 18} r={7 + k3 * 3} fill={c1} />
          <rect
            x={k4 < 0.5 ? 0 : 20}
            y={k5 < 0.5 ? 20 : 0}
            width="16"
            height="16"
            fill={c2}
          />
        </>
      );

    // ── Concentric arcs, off-centre. A ripple. ────────────────────────
    case "rings": {
      const cx = 12 + k0 * 12;
      const cy = 12 + k1 * 12;
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          {[15, 11, 7, 3].map((r, i) => (
            <circle
              key={r}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={[a.bg, c1, c2, c3][i]}
              strokeWidth={3.2}
            />
          ))}
        </>
      );
    }

    // ── A mirrored 5x5 bitmap. The classic identicon, tidied. ─────────
    case "pixel":
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          {a.bits.map((on, i) =>
            on ? (
              <rect
                key={i}
                x={(i % 5) * 7.2}
                y={Math.floor(i / 5) * 7.2}
                width="7.2"
                height="7.2"
                fill={i % 3 === 0 ? c1 : a.bg}
              />
            ) : null,
          )}
        </>
      );

    // ── Initials on a two-tone ground. The quiet one. ─────────────────
    case "mono":
      return (
        <>
          <rect width="36" height="36" fill={grad} />
          <path d="M0 36 L36 0 L36 36 Z" fill={c1} opacity="0.35" />
          <text
            x="18"
            y="18.5"
            textAnchor="middle"
            dominantBaseline="central"
            fill={a.ink}
            fontSize="13"
            fontWeight="800"
            fontFamily="var(--hd, system-ui), system-ui, sans-serif"
            letterSpacing="0.3"
          >
            {a.initials}
          </text>
        </>
      );

    // ── One big letter with a colour block offset behind it. ──────────
    case "slab":
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          <rect
            x={k0 < 0.5 ? 0 : 14}
            y="0"
            width="22"
            height="36"
            fill={c1}
            opacity="0.9"
          />
          <text
            x="18"
            y="19"
            textAnchor="middle"
            dominantBaseline="central"
            fill={a.ink}
            fontSize="21"
            fontWeight="800"
            fontFamily="var(--hd, system-ui), system-ui, sans-serif"
          >
            {a.initials.slice(0, 1)}
          </text>
        </>
      );

    // ── A disc with a ring and a moon. ────────────────────────────────
    case "orbit": {
      const ang = k0 * Math.PI * 2;
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          <ellipse
            cx="18"
            cy="18"
            rx="15"
            ry={5 + k1 * 5}
            fill="none"
            stroke={c1}
            strokeWidth="2"
            transform={`rotate(${-30 + k2 * 60} 18 18)`}
          />
          <circle cx="18" cy="18" r={8 + k3 * 2} fill={a.bg} />
          <circle
            cx={18 + Math.cos(ang) * 14}
            cy={18 + Math.sin(ang) * 8}
            r="3"
            fill={c2}
          />
        </>
      );
    }

    // ── Stacked bands with a sine to them. ────────────────────────────
    case "wave": {
      const band = (y: number, fill: string, amp: number) =>
        `M0 ${y} C 9 ${y - amp}, 27 ${y + amp}, 36 ${y} L36 36 L0 36 Z`;
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          <path d={band(10 + k0 * 6, a.bg, 4 + k1 * 4)} />
          <path d={band(18 + k2 * 6, c1, 4 + k3 * 4)} />
          <path d={band(26 + k4 * 5, c2, 3 + k5 * 4)} />
        </>
      );
    }

    // ── Angular facets. Cut glass. ────────────────────────────────────
    case "shard": {
      const x = 8 + k0 * 20;
      const y = 6 + k1 * 24;
      return (
        <>
          <rect width="36" height="36" fill={a.bg2} />
          <polygon points={`0,0 36,0 ${x},${y}`} fill={a.bg} />
          <polygon points={`36,0 36,36 ${x},${y}`} fill={c1} opacity="0.92" />
          <polygon points={`36,36 0,36 ${x},${y}`} fill={c2} opacity="0.85" />
          <polygon points={`0,36 0,0 ${x},${y}`} fill={c3} opacity="0.75" />
        </>
      );
    }
  }
}
