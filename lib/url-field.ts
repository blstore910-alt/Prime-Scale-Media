/**
 * Website fields that do not make you type "https://".
 *
 * Six forms in this app validated with `z.string().url()`, which REJECTS
 * "acme.com". That is a refusal for something we can simply fix ourselves:
 * nobody says their website with the scheme out loud, and being told "Invalid
 * URL" for the address printed on your own business card is the kind of small
 * insult that makes a form feel hostile.
 *
 * So: accept what people type, and store something well-formed.
 */

/** Adds https:// when no scheme is present. Leaves an existing scheme alone. */
export function normaliseUrl(input: string | null | undefined): string {
  const v = (input ?? "").trim();
  if (!v) return "";
  // Any scheme at all is left as typed, not just http(s) — including ones
  // with no "//", like mailto:. Prefixing those produced
  // "https://mailto:a@b.com", which the URL parser happily accepts as host
  // b.com with "mailto:a" as USERINFO, so a mail address validated as a
  // website and got stored as one. Left alone, isUrlLike rejects it on the
  // protocol.
  //
  // No dot in the scheme charset, deliberately: otherwise "acme.com:8080"
  // reads as scheme "acme.com" rather than a host with a port.
  if (/^[a-z][a-z0-9+-]*:/i.test(v)) return v;
  // Protocol-relative ("//acme.com") is a scheme decision, not a hostname.
  if (v.startsWith("//")) return `https:${v}`;
  return `https://${v}`;
}

/**
 * True when the value looks like a web address once normalised. An empty
 * string is true — "no website" is a valid answer, and whether the field is
 * required is the schema's business, not this function's.
 */
export function isUrlLike(input: string | null | undefined): boolean {
  const v = normaliseUrl(input);
  if (!v) return true;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  if (host === "localhost") return true;
  // Require at least one dot and a plausible TLD, so a bare word like
  // "website" is rejected instead of becoming https://website.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(
    host,
  );
}

export const URL_FIELD_MESSAGE = "Enter a valid website, for example acme.com";

/**
 * The href to put on a link, or null when there is nothing safe to link to.
 *
 * Found 28-09 on the ad-account request screens. Five places render a
 * customer-typed website straight into `href={value}`, and the request form
 * does not normalise what it stores. So somebody who typed "acme.com" — the
 * spelling this app deliberately accepts — gets a RELATIVE link: the admin
 * reviewing the request clicks it and lands on
 * app.primescalemedia.com/acme.com, a 404 inside our own app. The one thing
 * the link exists for (look at their site before approving) silently does
 * not work, and it looks like the customer gave a dead address.
 *
 * And the same href takes "javascript:..." just as happily. That is
 * customer-supplied text executing on an ADMIN's session, on a screen whose
 * whole purpose is that an admin opens things strangers typed. React warns
 * about it; it does not stop it.
 *
 * So: normalise it (which adds the scheme), then hold it to the same bar the
 * forms use — http/https and a real-looking host. Anything else gets no link,
 * and the caller still prints the text so the admin can see what was typed.
 */
export function safeExternalHref(
  input: string | null | undefined,
): string | null {
  const v = normaliseUrl(input);
  if (!v) return null;
  if (!isUrlLike(v)) return null;
  return v;
}
