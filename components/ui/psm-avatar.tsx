"use client";

import { useId } from "react";
import {
  AVATAR_HAIRS,
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

/**
 * A colour moved towards white, for the lit side of the disc.
 *
 * The mirror of `darken` in lib/pure-avatar.ts, which already gives us
 * the shaded side. Hex in, hex out; anything it cannot parse comes back
 * unchanged rather than as black.
 */
function lighten(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
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
      // ── ONE FIGURE ───────────────────────────────────────────────────
      //
      // This drew seven different heads — a bob, a bun, coils, a beard —
      // and at 28px in a toolbar and 36px in a menu the same person read
      // as two different people. Variety in the SHAPE is what did that.
      //
      // So: one silhouette, always. Head, shoulders, a simple crop, the
      // headset. What tells two colleagues apart is colour — skin, hair
      // and shirt, each off its own slice of the hash — which is enough
      // to pick somebody out of a list and not enough to make the same
      // person look like somebody else at another size.
      const skin = AVATAR_SKINS[Math.floor(a.k[0] * AVATAR_SKINS.length) % AVATAR_SKINS.length];
      const hair = AVATAR_HAIRS[Math.floor(a.k[1] * AVATAR_HAIRS.length) % AVATAR_HAIRS.length];
      const top = AVATAR_TOPS[Math.floor(a.k[2] * AVATAR_TOPS.length) % AVATAR_TOPS.length];
      return (
        <>
          <rect width="36" height="36" fill={grad} />
          {/* Shoulders. Wide and flat-topped — a circle here reads as a
              second head under the first. */}
          <path
            d="M4.5 36c0-6.2 6-10.2 13.5-10.2S31.5 29.8 31.5 36z"
            fill={top}
          />
          {/* Neck behind the head, so no join shows. */}
          <rect x="15.6" y="20" width="4.8" height="6" rx="2.2" fill={skin} />
          <circle cx="18" cy="15.6" r="7.4" fill={skin} />
          {/* A short crop. One shape, sitting on top of the head rather
              than around it, so the headset band can cross it cleanly. */}
          <path
            d="M10.7 14.2c.5-4.6 3.6-7 7.3-7s6.8 2.4 7.3 7c-.4-1.6-1.2-2.5-2.4-2.8-3.2-.8-6.6-.8-9.8 0-1.2.3-2 1.2-2.4 2.8z"
            fill={hair}
          />
          {/* Eyes and a hint of a mouth. Two dots and a short line is all
              that survives at 28px; anything more turns to mush there and
              to a cartoon at 96. */}
          <circle cx="14.9" cy="16.4" r="0.95" fill="#2A2118" />
          <circle cx="21.1" cy="16.4" r="0.95" fill="#2A2118" />
          <path
            d="M16 19.4Q18 21.1 20 19.4"
            stroke="#2A2118"
            strokeWidth="0.95"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />

          {/* The headset, over everything, which is how one is worn.
              Charcoal rather than black: against the darker hair colours
              pure black loses the shape entirely. */}
          <path
            d="M9.9 15.8a8.1 8.1 0 0 1 16.2 0"
            fill="none"
            stroke="#2E3346"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <rect x="8.2" y="14.2" width="3.4" height="5.4" rx="1.7" fill="#2E3346" />
          <rect x="24.4" y="14.2" width="3.4" height="5.4" rx="1.7" fill="#2E3346" />
          <rect x="9.1" y="15.5" width="1.6" height="2.8" rx="0.8" fill={top} opacity="0.9" />
          <rect x="25.3" y="15.5" width="1.6" height="2.8" rx="0.8" fill={top} opacity="0.9" />
          {/* The boom stops short of the mouth — drawn all the way, the
              two shapes merge at small sizes and read as a beard. */}
          <path
            d="M9.9 19.2c0 2.6 1.6 4.1 3.4 4.6"
            fill="none"
            stroke="#2E3346"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <circle cx="13.7" cy="23.9" r="1.05" fill="#2E3346" />
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

    // -- INITIALS, AS A POLISHED TOKEN ---------------------------------
    //
    // This was a flat disc with a diagonal wedge across it and two
    // letters on top, and beside a brand built on a glowing rocket it
    // read as the placeholder you get before a picture loads. The owner
    // has called it ugly on the toolbar and again in the advertiser
    // list, which is where it is seen most.
    //
    // Same idea -- initials, one treatment for everybody, colour off the
    // seed so a list stays scannable -- drawn as an object rather than a
    // swatch: light falling from the top left, a darker pool bottom
    // right, a specular sweep across the upper third, and a hairline rim
    // so it sits ON the surface instead of in it. The letters carry a
    // soft shadow, which is what stops white-on-mid-blue going muddy at
    // 28px.
    //
    // Everything comes from the seed's own two colours, so an advertiser,
    // an affiliate and an admin each keep their own family and nothing
    // here has to be told what the brand palette is.
    case "mono":
      return (
        <>
          <defs>
            {/* The body: the seed colour lifted towards white where the
                light hits, dropping to its own dark end in the corner. */}
            <radialGradient id={`${uid}s`} cx="0.32" cy="0.26" r="0.92">
              <stop offset="0" stopColor={lighten(a.bg, 0.34)} />
              <stop offset="0.52" stopColor={a.bg} />
              <stop offset="1" stopColor={a.bg2} />
            </radialGradient>
            {/* The sweep. Opaque at the top, gone by the middle -- a
                highlight that reaches the bottom reads as fog. */}
            <linearGradient id={`${uid}h`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
              <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.06" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect width="36" height="36" fill={`url(#${uid}s)`} />
          {/* A wash of the next palette colour, bottom right, so two
              people on neighbouring rows differ by more than hue. */}
          <circle cx="30" cy="31" r="14" fill={c1} opacity="0.22" />
          <path d="M0 0 H36 V15 C27 21 9 21 0 15 Z" fill={`url(#${uid}h)`} />
          <text
            x="18"
            y="19"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#0B1020"
            fillOpacity="0.32"
            fontSize="14.5"
            fontWeight="800"
            fontFamily="var(--hd, system-ui), system-ui, sans-serif"
            letterSpacing="0.6"
          >
            {a.initials}
          </text>
          <text
            x="18"
            y="18.2"
            textAnchor="middle"
            dominantBaseline="central"
            fill={a.ink}
            fontSize="14.5"
            fontWeight="800"
            fontFamily="var(--hd, system-ui), system-ui, sans-serif"
            letterSpacing="0.6"
          >
            {a.initials}
          </text>
          {/* The rim, drawn INSIDE the clip so it is never clipped away:
              bright where the light is, a darker line outside it to seat
              the disc on a pale panel. */}
          <circle
            cx="18"
            cy="18"
            r="17.2"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.34"
            strokeWidth="1.1"
          />
          <circle
            cx="18"
            cy="18"
            r="17.9"
            fill="none"
            stroke="#0B1020"
            strokeOpacity="0.18"
            strokeWidth="1.4"
          />
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
