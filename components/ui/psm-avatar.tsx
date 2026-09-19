"use client";

import { useId } from "react";
import {
  AVATAR_HAIRS,
  AVATAR_HAIR_STYLES,
  AVATAR_SKINS,
  AVATAR_TOPS,
  autoAvatarStyle,
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
  // ── A PICTURE, AND NOT THE SAME ONE FOR EVERYBODY ───────────────────
  //
  // This was "beam" — two dots and a mouth, which at 30px in a toolbar
  // reads as a placeholder somebody forgot to replace. Then it was
  // "mono", initials, which is tidy and gives every person in a list the
  // identical treatment: a grid of two-letter tiles.
  //
  // There are ten styles in lib/pure-avatar.ts and a picker for them
  // that nothing has ever been wired to. So rather than choose one for
  // everyone, the seed chooses: seven picture styles, deterministic per
  // person, so the same customer is the same mark on every screen and in
  // every list — and an admin scanning a queue recognises them by shape
  // and colour before reading the name. Nothing is stored for it.
  //
  // An explicit `style` still wins, for a picker when one is built.
  style,
  ring,
  className,
  title,
}: {
  seed: string;
  name?: string | null;
  email?: string | null;
  role?: AvatarRole;
  size?: number;
  /** Leave unset to let the seed choose. */
  style?: AvatarStyle;
  /** A coloured ring, for marking state (e.g. a customer who is overdue). */
  ring?: string;
  className?: string;
  title?: string;
}) {
  const a = avatarFor(seed, { role, name, email });
  // ── UNIQUE PER INSTANCE, NOT PER SEED ───────────────────────────────
  //
  // The id used to be a hash of the seed alone. Stable across server and
  // browser, which is what the hydration warning needed — and NOT unique,
  // which is what SVG needs. The same person's avatar is drawn twice on
  // every advertiser screen (the sidebar and the toolbar), so both SVGs
  // declared <clipPath id="av647272945c"> and both referenced
  // url(#av647272945c). A url() reference resolves to the FIRST element
  // with that id in the document — the sidebar's — and on a phone the
  // sidebar is off-canvas. A clip-path pointing at a hidden element is an
  // EMPTY clip, so the toolbar avatar was clipped away entirely: present
  // in the DOM, 30px, opacity 1, visibility visible, painting nothing.
  // That is why the topbar showed a bell and a blank space.
  //
  // useId is unique per instance and identical on both sides of the
  // render, which is both halves of the problem. The seed hash stays on
  // the end so the ids are still readable in dev tools.
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");
  const uid = `av${instance}${Math.abs(
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
        <Style style={style ?? autoAvatarStyle(seed)} a={a} uid={uid} />
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
    // ── A head, shoulders and hair. ───────────────────────────────────
    //
    // Built to read at 28px, which is where it spends most of its life:
    // bold shapes, no outlines, no gradient inside the figure, and the
    // hair silhouette carrying nearly all of the difference between one
    // person and the next. Features are two dots and a short line —
    // anything more turns to mush at that size and to a cartoon at 96.
    //
    // Every choice comes off a different slice of the same hash, so skin
    // does not move with hair and hair does not move with the shirt.
    case "person": {
      const skin = AVATAR_SKINS[Math.floor(a.k[0] * AVATAR_SKINS.length) % AVATAR_SKINS.length];
      const hair = AVATAR_HAIRS[Math.floor(a.k[1] * AVATAR_HAIRS.length) % AVATAR_HAIRS.length];
      const top = AVATAR_TOPS[Math.floor(a.k[2] * AVATAR_TOPS.length) % AVATAR_TOPS.length];
      const cut = Math.floor(a.k[3] * AVATAR_HAIR_STYLES) % AVATAR_HAIR_STYLES;
      const eyeY = 16.4;
      const eyeDx = 3.1;
      return (
        <>
          <rect width="36" height="36" fill={grad} />
          {/* Shoulders. A wide, flat-topped shape rather than a circle:
              a circle reads as a second head under the first. */}
          <path
            d="M4.5 36c0-6.2 6-10.2 13.5-10.2S31.5 29.8 31.5 36z"
            fill={top}
          />
          {/* Neck, behind the head so no join shows. */}
          <rect x="15.6" y="20" width="4.8" height="6" rx="2.2" fill={skin} />
          <circle cx="18" cy="15.6" r="7.4" fill={skin} />
          {/* Ears, only on the cuts that do not cover them. */}
          {(cut === 0 || cut === 3 || cut === 5) && (
            <>
              <circle cx="10.5" cy="16.4" r="1.5" fill={skin} />
              <circle cx="25.5" cy="16.4" r="1.5" fill={skin} />
            </>
          )}
          {cut === 0 && (
            /* Short, with a side part. */
            <path d="M10.8 14.6c.4-5 3.6-7.4 7.2-7.4 3.9 0 7 2.6 7.2 7.4-1.6-2.2-3.4-3.2-5.2-3.4-2.6-.3-3.6 1.1-6.2 1.6-1.2.2-2.2.6-3 1.8z" fill={hair} />
          )}
          {cut === 1 && (
            /* A bob, past the jaw. */
            <path d="M9.9 17.4c0-6.6 3.4-10.2 8.1-10.2s8.1 3.6 8.1 10.2v4.2h-2.6v-7.9c-2 .9-4.1 1.3-5.5 1.3-2 0-3.9-.4-5.5-1.3v7.9H9.9z" fill={hair} />
          )}
          {cut === 2 && (
            /* A high bun. */
            <>
              <circle cx="18" cy="6.1" r="3" fill={hair} />
              <path d="M10.8 15.2c0-5.2 3.2-8 7.2-8s7.2 2.8 7.2 8c-1.4-3.2-4-4.6-7.2-4.6s-5.8 1.4-7.2 4.6z" fill={hair} />
            </>
          )}
          {cut === 3 && (
            /* Cropped, straight fringe. */
            <path d="M10.7 13.8c.5-4.4 3.6-6.6 7.3-6.6s6.8 2.2 7.3 6.6c-.3-1.3-1-2-2.1-2.2-3.2-.6-7.2-.6-10.4 0-1.1.2-1.8.9-2.1 2.2z" fill={hair} />
          )}
          {cut === 4 && (
            /* Long, falling behind the shoulders. */
            <path d="M9.6 26.4V16.2c0-6 3.6-9 8.4-9s8.4 3 8.4 9v10.2h-3V15c-1.9 1.1-3.8 1.6-5.4 1.6s-3.5-.5-5.4-1.6v11.4z" fill={hair} />
          )}
          {cut === 5 && (
            /* Coils, close to the head. */
            <>
              <circle cx="12.6" cy="11.4" r="2.6" fill={hair} />
              <circle cx="18" cy="9.4" r="3" fill={hair} />
              <circle cx="23.4" cy="11.4" r="2.6" fill={hair} />
              <circle cx="10.9" cy="15" r="2.1" fill={hair} />
              <circle cx="25.1" cy="15" r="2.1" fill={hair} />
            </>
          )}
          {cut === 6 && (
            /* Receding, with a short beard. */
            <>
              <path d="M11.4 12.9c1.1-3.8 3.6-5.7 6.6-5.7s5.5 1.9 6.6 5.7c-1.6-1.6-3.8-2.4-6.6-2.4s-5 .8-6.6 2.4z" fill={hair} />
              <path d="M11.3 16.8c.6 4.2 3.4 6.4 6.7 6.4s6.1-2.2 6.7-6.4c.5 6-2.4 9.4-6.7 9.4s-7.2-3.4-6.7-9.4z" fill={hair} opacity="0.92" />
            </>
          )}
          {/* The face, last, so no cut can cover it. */}
          <circle cx={18 - eyeDx} cy={eyeY} r="0.95" fill="#2A2118" />
          <circle cx={18 + eyeDx} cy={eyeY} r="0.95" fill="#2A2118" />
          <path
            d={`M${18 - 2} 19.4 Q18 ${19.4 + 1.5 + a.smile} ${18 + 2} 19.4`}
            stroke="#2A2118"
            strokeWidth="0.95"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
        </>
      );
    }

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
