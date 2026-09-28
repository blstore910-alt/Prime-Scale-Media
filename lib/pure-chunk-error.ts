// ── THE BUTTON THAT DOES NOTHING AFTER A DEPLOY ──────────────────────
//
// Walked on production, 28-09, during the block-6 journey, in two
// windows at once:
//
//   * the customer pressed "Yes, send it" on the ad-account request.
//     The confirmation closed, no request was made to the server at
//     all, no error appeared, and nothing was created. Twice.
//   * the admin pressed Review, then I'm on it, then Details on the
//     same request. None of the three opened anything. The Create Ad
//     Account form, opened earlier in the same tab, submitted and
//     wrote nothing.
//
// Both tabs had been open across several deploys. A hard reload fixed
// the customer side instantly: the identical actions then produced a
// 200 and a correct row.
//
// That is what a stale bundle looks like. Next.js names every chunk by
// a content hash, and a deploy replaces them -- so a dialog or a
// handler that has not been downloaded YET tries to fetch a file that
// is gone. The import rejects, React swallows it, and the button is
// simply inert. Nothing is logged where anybody looks and nothing is
// shown.
//
// The app already NOTICES the deploy -- AppVersionBanner has been
// telling people "Reload when you're done with what you're doing" the
// whole time. By the time that banner is up, "carrying on" is exactly
// what no longer works, and the most expensive screens in the app
// (send a request, verify a payment, approve a withdrawal) are the
// ones made of lazily loaded dialogs.
//
// So: recognise the failure, and reload rather than leave somebody
// pressing a dead button. This file is only the recognising; the
// reloading, and the one-shot guard that stops it looping, lives in
// components/chunk-reload-guard.tsx.

/**
 * The shapes a failed chunk fetch arrives in. They differ per browser
 * and per bundler, and none of them is a typed error class we can
 * instanceof, so this is string matching by necessity.
 */
const CHUNK_PATTERNS: RegExp[] = [
  // webpack / Next.js
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk/i,
  // native ESM, which is what Chrome and Safari say
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  // Safari
  /Importing a module script failed/i,
  // Firefox
  /error loading dynamically imported module/i,
  /expected expression, got '<'/i,
];

/** A chunk URL that 404s comes back as the HTML error page. */
const CHUNK_URL = /\/_next\/static\/(chunks|css)\//i;

function textOf(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  const o = err as { name?: unknown; message?: unknown; toString?: () => string };
  const name = typeof o.name === "string" ? o.name : "";
  const message = typeof o.message === "string" ? o.message : "";
  if (name || message) return `${name}: ${message}`;
  try {
    return String(err);
  } catch {
    return "";
  }
}

/**
 * True when this error means "the JavaScript this page needs is no
 * longer on the server".
 *
 * Deliberately narrow. A reload is a blunt instrument -- it throws away
 * anything not yet saved -- so it must only fire for the one fault it
 * fixes, never for an ordinary runtime error the user could recover
 * from by pressing something else.
 */
export function isChunkLoadFailure(
  err: unknown,
  sourceUrl?: string | null,
): boolean {
  const text = textOf(err);
  if (text && CHUNK_PATTERNS.some((re) => re.test(text))) return true;
  // A script tag that fails to load gives an event with no error object
  // at all -- only the URL of the file that was not there.
  if (sourceUrl && CHUNK_URL.test(sourceUrl)) return true;
  return false;
}

/** The key the one-shot guard writes, so a reload loop is impossible. */
export const CHUNK_RELOAD_KEY = "psm-chunk-reloaded";

/**
 * Whether to reload now.
 *
 * Only once per tab session, and only when the page has actually been
 * open long enough for a deploy to have happened. A chunk error in the
 * first seconds is far more likely to be a flaky network than a
 * replaced build, and reloading into the same flaky network helps
 * nobody.
 */
export const MIN_AGE_BEFORE_RELOAD_MS = 20_000;

export function shouldReloadForChunk(input: {
  alreadyReloaded: boolean;
  pageAgeMs: number;
}): boolean {
  if (input.alreadyReloaded) return false;
  return input.pageAgeMs >= MIN_AGE_BEFORE_RELOAD_MS;
}
