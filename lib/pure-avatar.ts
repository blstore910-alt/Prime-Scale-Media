/**
 * An avatar for every person in the app, generated from who they are.
 *
 * WHY NOT AN AVATAR SERVICE. Gravatar, DiceBear, ui-avatars and the rest
 * all want an identifier in the URL — usually a hash of the email
 * address. Putting that in an <img src> sends every customer's email, in
 * hashed form, to a third party on every page load, from the customer's
 * own browser. An MD5 of an email is not anonymous; it is a lookup key
 * that several public rainbow tables already hold. We would be handing
 * our customer list to somebody else in exchange for a picture.
 *
 * It also fails shut in the wrong direction: their outage is our blank
 * circles, and their CSP entry is one more origin this app has to trust.
 *
 * So the avatar is computed here, drawn as inline SVG, and never leaves
 * the machine it renders on.
 *
 * DETERMINISTIC, and that is the point: the same person is the same
 * picture on the advertisers list, in the top-up queue and in their own
 * header, so an operator recognises a customer before reading the name.
 *
 * Pure — no React, no DOM — so it is testable, and it is tested.
 */

export type AvatarRole = "advertiser" | "affiliate" | "admin" | "unknown";

/**
 * The ten styles.
 *
 * Deliberately NOT ten variations of one idea. A picker where every
 * option is a slightly different face is not a choice, it is a slider —
 * so these differ in kind: a face, an abstract, a monogram, a pattern, a
 * mark. Whichever is chosen, it stays deterministic from the seed, so the
 * same person is the same picture everywhere in the app.
 */
export const AVATAR_STYLES = [
  "beam",     // a face: two eyes and a mouth, tilted
  "marble",   // soft overlapping blobs, organic
  "bauhaus",  // circle, bar and square on a grid
  "rings",    // concentric arcs, off-centre
  "pixel",    // a mirrored 5x5 identicon
  "mono",     // initials on a two-tone ground
  "slab",     // one big letter, offset colour block behind it
  "orbit",    // a disc with a ring and a moon
  "wave",     // stacked bands with a sine to them
  "shard",    // angular facets, cut glass
] as const;

export type AvatarStyle = (typeof AVATAR_STYLES)[number];

/** What each one is called on the picker. */
export const AVATAR_STYLE_LABELS: Record<AvatarStyle, string> = {
  beam: "Beam",
  marble: "Marble",
  bauhaus: "Bauhaus",
  rings: "Rings",
  pixel: "Pixel",
  mono: "Monogram",
  slab: "Slab",
  orbit: "Orbit",
  wave: "Wave",
  shard: "Shard",
};

export type AvatarSpec = {
  /** Background of the disc. */
  bg: string;
  /** A second, darker tone for the lower half — a face, not a flat chip. */
  bg2: string;
  /** Eyes and mouth. */
  ink: string;
  /** Degrees, -18..18. Tilts the features so two faces differ. */
  tilt: number;
  /** Vertical eye position within the 36-unit box. */
  eyeY: number;
  /** Horizontal half-distance between the eyes. */
  eyeGap: number;
  /** 0 = straight mouth, 1 = broadest smile. */
  smile: number;
  /** Mouth width in units. */
  mouthW: number;
  /** The two letters shown when initials are asked for instead of a face. */
  initials: string;

  // ── Everything the other nine styles draw from ─────────────────────
  /** Three more colours from the same family, for the abstract styles. */
  palette: [string, string, string];
  /** 0..1 knobs. Independent slices of one hash, so nothing moves in step. */
  k: [number, number, number, number, number, number];
  /** A mirrored 5x5 bitmap, 25 booleans, for the pixel style. */
  bits: boolean[];
};

/**
 * FNV-1a, 32-bit. Chosen because it is four lines, has no dependencies
 * and spreads short strings well — which is all that is being asked of
 * it. Nothing here is a security decision, so a non-cryptographic hash
 * is the right tool rather than a compromise.
 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  const s = String(seed ?? "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    // h *= 16777619, kept in 32 bits without overflowing a double.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The palettes.
 *
 * One hue family per role, so a list of mixed people reads as groups at a
 * glance — blues are customers, violets are affiliates, slate is staff —
 * while each person inside a group still has their own colour. Ordering
 * matters: consecutive entries are deliberately far apart in hue so two
 * adjacent rows never look like the same person.
 *
 * Every background is dark enough for white features at 24px, which is
 * the size these are actually used at.
 */
const PALETTES: Record<AvatarRole, string[]> = {
  advertiser: ["#3A6FFF", "#5B8DFF", "#2563EB", "#4F46E5", "#0EA5E9", "#1D4ED8"],
  affiliate: ["#8B5CF6", "#A855F7", "#7C3AED", "#C026D3", "#6D28D9", "#9333EA"],
  admin: ["#0F172A", "#334155", "#475569", "#1E293B", "#0B1020", "#3F3F46"],
  unknown: ["#0FBF8F", "#F5A524", "#FF6B8A", "#2DD4BF", "#F26D3D", "#6366F1"],
};

/** A hex colour moved toward black by `amount` (0..1). */
export function darken(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!m) return "#000000";
  const n = parseInt(m[1], 16);
  const k = Math.min(1, Math.max(0, amount));
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * (1 - k))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * Two letters from a name, or from an email when there is no name.
 *
 * "Prime Scale Media" -> PS. "barisdemir@..." -> BA, because one letter
 * in a circle is not an identity and a "?" is worse — it reads as an
 * error when the only thing missing is a display name.
 */
export function initialsFrom(
  name: string | null | undefined,
  email?: string | null,
): string {
  const clean = String(name ?? "").trim();
  if (clean) {
    const parts = clean.split(/\s+/).filter(Boolean);
    // The FIRST TWO words, not first-and-last. "Baris Demir" is BD either
    // way, but "Prime Scale Media" is PS rather than PM, and "Anna Maria
    // de Vries" is AM rather than AD. Company names are half of what goes
    // through here and first-and-last serves them badly.
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const local = String(email ?? "").split("@")[0].replace(/[^a-z]/gi, "");
  if (local) return local.slice(0, 2).toUpperCase();
  return "··";
}

/**
 * The avatar for a seed.
 *
 * `seed` should be something STABLE — a profile id, not a name, because
 * a person who corrects the spelling of their own name should not become
 * a different face in the queue an admin has learned to read.
 */
export function avatarFor(
  seed: string,
  opts?: {
    role?: AvatarRole;
    name?: string | null;
    email?: string | null;
  },
): AvatarSpec {
  const role: AvatarRole = opts?.role ?? "unknown";
  const palette = PALETTES[role] ?? PALETTES.unknown;
  const h = hashSeed(seed);

  // Independent slices of one hash, so two features never move together.
  const pick = (shift: number, mod: number) => (h >>> shift) % mod;

  const bg = palette[pick(0, palette.length)];

  // Three more from the same family, each a different distance away, so
  // an abstract style reads as one person's colours rather than as
  // confetti.
  const at = (n: number) => palette[(pick(0, palette.length) + n) % palette.length];

  // The pixel grid is MIRRORED: 15 decisions become 25 cells, and the
  // symmetry is what makes an identicon read as a mark rather than as
  // noise. Column 3 and 4 echo 1 and 0.
  const bits: boolean[] = [];
  for (let row = 0; row < 5; row += 1) {
    const left = [0, 1, 2].map((col) => ((h >>> (row * 3 + col)) & 1) === 1);
    bits.push(left[0], left[1], left[2], left[1], left[0]);
  }

  return {
    bg,
    bg2: darken(bg, 0.28),
    ink: "#FFFFFF",
    tilt: pick(5, 37) - 18,
    eyeY: 14 + pick(11, 4),
    eyeGap: 4 + pick(15, 3),
    smile: (pick(19, 5) + 1) / 5,
    mouthW: 9 + pick(23, 6),
    initials: initialsFrom(opts?.name, opts?.email),
    palette: [at(1), at(2), at(3)],
    k: [
      pick(3, 100) / 100,
      pick(7, 100) / 100,
      pick(13, 100) / 100,
      pick(17, 100) / 100,
      pick(21, 100) / 100,
      pick(25, 100) / 100,
    ],
    bits,
  };
}

/**
 * The mouth, as an SVG path.
 *
 * A quadratic curve whose control point drops with `smile`. At smile 0 it
 * is a straight line, which is a face that looks bored rather than a face
 * that looks broken — so even the flattest draw is a deliberate one.
 */
export function mouthPath(spec: AvatarSpec, cy = 24): string {
  const half = spec.mouthW / 2;
  const x1 = 18 - half;
  const x2 = 18 + half;
  const dip = 1 + spec.smile * 5;
  return `M ${x1} ${cy} Q 18 ${cy + dip} ${x2} ${cy}`;
}
