import { sameSlug, slugKey } from "@/lib/pure-slug-key";

/**
 * The platform's own mark, wherever an ad account is shown.
 *
 * Every ad-account tile carried the same grey monitor glyph, so a list
 * of accounts gave the eye nothing to sort by — and the only thing that
 * said which platform an account runs on was a small grey line of text
 * under its code.
 *
 * The slug is matched on its WORDS, not on the exact string:
 * /settings/ad-account-types slugifies a new type from its label, so
 * "Meta-EU-Premium" is stored as `meta-eu-premium` while the seed
 * writes `eu-meta-premium`. lib/pure-slug-key exists because that
 * collision already cost two percentage points on every premium top-up.
 *
 * A type nobody has taught this file gets the neutral mark rather than
 * a guess — a wrong logo on a customer's account is worse than none.
 */
export default function PlatformMark({
  slug,
  className = "",
}: {
  slug?: string | null;
  className?: string;
}) {
  const words = slugKey(slug).split("-");
  const has = (w: string) => words.includes(w);

  if (has("meta") || sameSlug(slug, "facebook")) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className={className}
        style={{ color: "#0866FF" }}
      >
        <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973.14.6.354 1.16.636 1.621.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843.319-.269.594-.598.81-.973.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.062 2.982c1.078 0 1.94.503 2.7 1.638.762 1.14 1.25 2.902 1.25 5.03 0 1.152-.135 2.008-.416 2.616-.269.583-.687.9-1.436.9-.756 0-1.22-.279-1.917-1.096-.62-.729-1.34-1.885-2.43-3.7l-.6-1.002c-.152-.253-.292-.487-.427-.71.99-1.522 1.81-2.257 2.35-2.729.56-.487.986-.947 1.926-.947zM6.9 7.013c.702 0 1.246.22 1.856.717.507.413 1.083 1.077 1.755 1.968l-.747 1.146-.71 1.09c-1.043 1.6-1.703 2.5-2.243 3.145-.632.755-1.01.93-1.585.93-.598 0-1.014-.263-1.278-.66-.28-.42-.44-1.055-.44-1.888 0-1.94.55-3.985 1.365-5.28.63-1.001 1.354-1.268 2.027-1.268z" />
      </svg>
    );
  }

  if (has("tiktok")) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        className={className}
      >
        <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-1.79-2.46V9.8a5.68 5.68 0 1 0 4.88 5.62V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.29 4.29 0 0 1-3.24-1.48z" />
      </svg>
    );
  }

  if (has("google") || has("gdn")) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={className}>
        <path
          fill="#4285F4"
          d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.72 3.45 1.33l2.35-2.27C16.28 3.93 14.35 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-1.1z"
        />
      </svg>
    );
  }

  // Not a platform this file knows. The neutral mark, on purpose.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}
