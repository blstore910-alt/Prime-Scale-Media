// ── ONE LOOK FOR EVERY EMAIL WE SEND ────────────────────────────────────
//
// The owner, 22-09: "maak email ook meer pro, alle emails" -- and then,
// on the first version: "nog niet wow, alles aligned, wow effecten, en
// logo". Every mail comes out of this one layout: the app's own
// (lib/email-sender) and the Supabase auth templates, generated from it by
// scripts/email-templates.ts and pasted into the Supabase dashboard.
//
// The WOW lives where mail clients can show it: a starfield hero that is
// an IMAGE (public/email/hero-bg.jpg) behind the real logo
// (the app's rocket tile + name, and the sign-in screen's launching rocket,
// rendered by scripts/email-assets.mjs), a glowing button, numbered steps.
// Mail clients are not browsers: no <style> blocks (Gmail strips them),
// no flex or grid, no SVG, no animation -- tables and inline styles, and a
// solid colour under every image and gradient for the clients that show
// neither.
//
// Pure: no imports, so the template script and the tests can load it.

export type EmailCta = { label: string; href: string };

export type EmailLayoutInput = {
  /** The grey line mail apps show after the subject in the inbox list. */
  preheader: string;
  /** Small caps over the title, e.g. "One step left". */
  eyebrow?: string;
  title: string;
  /** One or two sentences under the title, in the hero. Trusted HTML. */
  lead?: string;
  cta?: EmailCta;
  /** Numbered steps under the hero -- what happens after the click. */
  steps?: string[];
  /** More content under the steps. Trusted HTML, already escaped. */
  bodyHtml?: string;
  /** Small print under everything. Trusted HTML. */
  footnoteHtml?: string;
};

const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";
const ASSETS = "https://app.primescalemedia.com/email";
const WHATSAPP = "https://wa.me/31615300300";

/** For text that came from a person: names, company names, reasons. */
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A paragraph in the body's own type, centred like the rest. */
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 14px;font:400 15px/1.65 ${FONT};color:#475069;text-align:center;">${html}</p>`;
}

/** A soft panel for facts (a plan, an address change, a code). */
export function emailPanel(labelHtml: string, valueHtml: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">` +
    `<tr><td align="center" style="padding:16px 18px;background:#f4f6fd;border:1px solid #e3e8f4;border-radius:16px;">` +
    `<div style="font:700 11px/1.4 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:#7c86a6;">${labelHtml}</div>` +
    `<div style="margin-top:7px;font:700 16px/1.5 ${FONT};color:#12162a;">${valueHtml}</div>` +
    `</td></tr></table>`
  );
}

function button(cta: EmailCta): string {
  // A pill with a lit edge. The solid colour is the fallback for clients
  // that drop the gradient; the shadow is a bonus where it is supported.
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:26px auto 4px;">` +
    `<tr><td align="center" style="border-radius:999px;background:#6d63ff;` +
    `background-image:linear-gradient(118deg,#4f83ff 0%,#6d63ff 50%,#a26bff 100%);` +
    `box-shadow:0 12px 30px -8px rgba(124,92,255,.75),0 0 0 1px rgba(255,255,255,.22) inset;">` +
    `<a href="${cta.href}" target="_blank" style="display:inline-block;padding:16px 38px;` +
    `font:800 16px/1 ${FONT};letter-spacing:.01em;color:#ffffff;text-decoration:none;border-radius:999px;">` +
    `${cta.label} &rarr;</a></td></tr></table>`
  );
}

function steps(items: string[]): string {
  const cells = items
    .map(
      (label, i) =>
        `<td align="center" valign="top" width="${Math.floor(100 / items.length)}%" style="padding:0 6px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>` +
        `<td align="center" valign="middle" width="36" height="36" style="width:36px;height:36px;border-radius:999px;` +
        `background:#6d63ff;background-image:linear-gradient(135deg,#5b8dff,#8b5cf6);` +
        `font:800 15px/36px ${FONT};color:#ffffff;text-align:center;">${i + 1}</td></tr></table>` +
        `<div style="margin-top:9px;font:700 13px/1.4 ${FONT};color:#12162a;">${label}</div></td>`,
    )
    .join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">` +
    `<tr>${cells}</tr></table>`
  );
}

export function emailLayout(input: EmailLayoutInput): string {
  const { preheader, eyebrow, title, lead, cta, bodyHtml, footnoteHtml } = input;
  return [
    `<!doctype html>`,
    `<html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">`,
    `<title>${title}</title></head>`,
    `<body style="margin:0;padding:0;background:#eef2fb;">`,
    // Preheader: shown in the inbox list, hidden in the mail itself.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2fb;">`,
    `<tr><td align="center" style="padding:28px 12px 40px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e8f4;border-radius:24px;overflow:hidden;box-shadow:0 30px 60px -34px rgba(20,30,80,.45);">`,

    // ── HERO: the starfield, the logo, the title, the button ────────────
    `<tr><td align="center" background="${ASSETS}/hero-bg.jpg" bgcolor="#0c1230" ` +
      `style="padding:34px 28px 36px;background-color:#0c1230;background-image:url('${ASSETS}/hero-bg.jpg');` +
      `background-size:cover;background-position:center;text-align:center;">`,
    // The app's own lockup -- the rocket tile and the name, as in the
    // app's header -- then the sign-in screen's rocket, launching to the moon.
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>`,
    `<td valign="middle" style="padding-right:8px;"><img src="${ASSETS}/rocket-mark.png" width="60" height="60" alt="" ` +
      `style="display:block;width:60px;height:60px;border:0;"></td>`,
    `<td valign="middle" style="text-align:left;">` +
      `<div style="font:800 18px/1.2 ${FONT};letter-spacing:-.01em;color:#ffffff;">Prime Scale Media</div>` +
      `<div style="margin-top:2px;font:500 12px/1.4 ${FONT};color:#9db8ff;">Advertiser &amp; affiliate platform</div></td>`,
    `</tr></table>`,
    `<img src="${ASSETS}/launch.png" width="250" alt="" ` +
      `style="display:block;margin:6px auto 0;width:250px;max-width:72%;height:auto;border:0;">`,
    eyebrow
      ? `<div style="margin:4px 0 0;"><span style="display:inline-block;padding:6px 14px;border-radius:999px;` +
        `background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);` +
        `font:800 11px/1 ${FONT};letter-spacing:.2em;text-transform:uppercase;color:#ffd98a;">${eyebrow}</span></div>`
      : "",
    `<h1 style="margin:${eyebrow ? 14 : 8}px 0 0;font:800 30px/1.2 ${FONT};letter-spacing:-.02em;color:#ffffff;text-align:center;">${title}</h1>`,
    lead
      ? `<p style="margin:12px auto 0;max-width:420px;font:400 16px/1.6 ${FONT};color:#c9d4ff;text-align:center;">${lead}</p>`
      : "",
    cta ? button(cta) : "",
    `</td></tr>`,
    // A thin band of the brand gradient under the hero.
    `<tr><td style="height:4px;line-height:4px;font-size:0;background:#6d63ff;background-image:linear-gradient(90deg,#5b8dff,#8b5cf6,#18b8ce);">&nbsp;</td></tr>`,

    // ── BODY ─────────────────────────────────────────────────────────────
    `<tr><td align="center" style="padding:30px 28px 6px;text-align:center;">`,
    input.steps?.length
      ? `<div style="margin:0 0 16px;font:800 11px/1.4 ${FONT};letter-spacing:.16em;text-transform:uppercase;color:#7c86a6;">What happens next</div>` +
        steps(input.steps)
      : "",
    bodyHtml ?? "",
    cta
      ? // The link in words too: some clients block buttons, and a person
        // should always be able to see where a link goes before pressing it.
        `<p style="margin:6px 0 0;font:400 12px/1.6 ${FONT};color:#8b93a6;text-align:center;">` +
        `Button not working? Copy this link into your browser:<br>` +
        `<a href="${cta.href}" target="_blank" style="color:#3a6fff;word-break:break-all;">${cta.href}</a></p>`
      : "",
    footnoteHtml
      ? `<p style="margin:16px 0 0;font:400 13px/1.6 ${FONT};color:#8b93a6;text-align:center;">${footnoteHtml}</p>`
      : "",
    `</td></tr>`,

    // ── FOOTER ───────────────────────────────────────────────────────────
    `<tr><td align="center" style="padding:24px 28px 30px;text-align:center;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-top:1px solid #eef1f8;padding-top:22px;text-align:center;">`,
    `<div style="font:600 13px/1.5 ${FONT};color:#475069;">Questions? We answer on WhatsApp.</div>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:12px auto 0;"><tr>`,
    `<td align="center" style="border-radius:999px;background:#1faa53;">`,
    `<a href="${WHATSAPP}" target="_blank" style="display:inline-block;padding:10px 20px;font:800 13px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px;">`,
    `Message us &middot; +31 6 15300300</a></td></tr></table>`,
    `<div style="margin-top:18px;font:500 12px/1.6 ${FONT};color:#aab1c4;">Prime Scale Media &middot; `,
    `<a href="https://app.primescalemedia.com" target="_blank" style="color:#aab1c4;text-decoration:none;">app.primescalemedia.com</a></div>`,
    `</td></tr></table></td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}
