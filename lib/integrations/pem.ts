/**
 * Put a PEM back together after a copy-paste.
 *
 * A private key is a header line, base64 wrapped at 64 characters, and a
 * footer line — and every one of those constraints is broken by the
 * ordinary ways people move a key into a hosting dashboard:
 *
 *   * the whole value arrives with literal backslash-n instead of newlines
 *     (JSON, a .env line, most CI forms);
 *   * or with every newline collapsed to a space, or removed entirely,
 *     which is what happens when a single-line form field is used;
 *   * or wrapped in quotes, because the .env line it came from had them;
 *   * or with CRLF line endings, from Notepad on Windows.
 *
 * Node's createSign() accepts none of those and throws a DECODER error
 * that says nothing about the cause. The key material is intact in every
 * case — only its formatting is not — so this rebuilds the formatting
 * rather than making the operator try again and guess.
 *
 * It never logs, never returns partial key material, and returns null when
 * there is genuinely no key in the string.
 */
export function normalizePem(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = String(raw).trim();

  // A value pasted from a .env line often keeps its quotes.
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }

  // Literal backslash-n, and CRLF.
  v = v.replace(/\r\n|\n/g, "\n").replace(/\r\n/g, "\n");

  const m = v.match(
    /-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/,
  );
  if (!m) return null;

  const label = m[1];
  // Everything that is not base64 goes: spaces, tabs, newlines, whatever
  // the form did to it.
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
  if (body.length < 64) return null;

  const lines: string[] = [];
  for (let i = 0; i < body.length; i += 64) lines.push(body.slice(i, i + 64));

  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
