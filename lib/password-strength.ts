/**
 * Small, dependency-free password strength scorer.
 *
 * We already enforce a hard 12-char minimum on the server (see
 * /api/accept-invite/signup and /api/admins/create). The scorer is a
 * client-side UX signal only — it helps users pick something better
 * than "aaaaaaaaaaaa" but never becomes the security bar.
 *
 * Scoring dimensions:
 *   - length: 12+ chars = 1 pt, 16+ = 2, 20+ = 3
 *   - class variety: lowercase / uppercase / digit / symbol = 1 pt each
 *   - repetition: subtract 1 pt if any character repeats 4+ in a row
 *   - common: subtract 2 pt if the password contains a common word
 *
 * Total is clamped to [0, 5]. UI maps that to Very weak / Weak /
 * Okay / Good / Strong / Very strong.
 */

const COMMON_WORDS = [
  "password",
  "welcome",
  "admin",
  "login",
  "letmein",
  "qwerty",
  "abcdef",
  "12345",
  "prime",
  "scale",
  "media",
];

export type StrengthResult = {
  score: 0 | 1 | 2 | 3 | 4 | 5;
  label:
    | "Very weak"
    | "Weak"
    | "Okay"
    | "Good"
    | "Strong"
    | "Very strong";
  reasons: string[];
};

export function scorePassword(pw: string): StrengthResult {
  const reasons: string[] = [];
  let score = 0;

  if (!pw || pw.length === 0) {
    return { score: 0, label: "Very weak", reasons: ["Empty"] };
  }

  // Length
  if (pw.length >= 12) score += 1;
  else reasons.push("Use at least 12 characters");
  if (pw.length >= 16) score += 1;
  if (pw.length >= 20) score += 1;

  // Character class variety
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  if (classes >= 3) score += 1;
  else reasons.push("Mix upper, lower, digits, and symbols");
  if (classes === 4) score += 1;

  // Repetition penalty
  if (/(.)\1{3,}/.test(pw)) {
    score -= 1;
    reasons.push("Avoid long runs of the same character");
  }

  // Common-word penalty
  const lower = pw.toLowerCase();
  if (COMMON_WORDS.some((w) => lower.includes(w))) {
    score -= 2;
    reasons.push("Avoid common words like ‘password’ or the product name");
  }

  const clamped = Math.min(5, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4 | 5;
  const label = [
    "Very weak",
    "Weak",
    "Okay",
    "Good",
    "Strong",
    "Very strong",
  ][clamped] as StrengthResult["label"];

  return { score: clamped, label, reasons };
}
