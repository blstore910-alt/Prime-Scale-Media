// ── ONE LOOK FOR EVERY EMAIL WE SEND ────────────────────────────────────
//
// The owner, 22-09: "maak email ook meer pro, alle emails". The sign-up
// confirmation was Supabase's default ("Follow this link to confirm your
// user"), from "PSM Dashboard", and the invitation had its own look. Every
// mail now comes out of this one layout: the app's own (lib/email-sender)
// and the Supabase auth templates, which are generated from it by
// scripts/email-templates.ts and pasted into the Supabase dashboard.
//
// Mail clients are not browsers: no <style> blocks (Gmail strips them),
// no flex or grid (Outlook), so tables and inline styles. Gradients get a
// solid colour first for the clients that ignore background-image.
//
// Pure: no imports, so the template script and the tests can load it.

export type EmailCta = { label: string; href: string };

export type EmailLayoutInput = {
  /** The grey line mail apps show after the subject in the inbox list. */
  preheader: string;
  title: string;
  /** Paragraphs of trusted HTML, already escaped where they carry input. */
  bodyHtml: string;
  cta?: EmailCta;
  /** Small print under the button. Trusted HTML. */
  footnoteHtml?: string;
};

const FONT = "'Segoe UI',Helvetica,Arial,sans-serif";
const LOGO_URL = "https://app.primescalemedia.com/icon-192.png";
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

/** A paragraph in the body's own type. */
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 14px;font:400 15px/1.65 ${FONT};color:#475069;">${html}</p>`;
}

/** A soft panel for facts (a plan, an amount, a code). */
export function emailPanel(labelHtml: string, valueHtml: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">` +
    `<tr><td style="padding:14px 16px;background:#f1f4fb;border:1px solid #e3e8f4;border-radius:14px;">` +
    `<div style="font:700 11px/1.4 ${FONT};letter-spacing:.08em;text-transform:uppercase;color:#7c86a6;">${labelHtml}</div>` +
    `<div style="margin-top:6px;font:600 15px/1.6 ${FONT};color:#12162a;">${valueHtml}</div>` +
    `</td></tr></table>`
  );
}

function button(cta: EmailCta): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 10px;">` +
    `<tr><td style="border-radius:12px;background:#5a6bff;` +
    `background-image:linear-gradient(118deg,#4f83ff 0%,#6d63ff 52%,#9a6bff 100%);">` +
    `<a href="${cta.href}" target="_blank" style="display:inline-block;padding:15px 28px;` +
    `font:700 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:12px;">${cta.label}</a>` +
    `</td></tr></table>` +
    // The link in words too: some clients block buttons, and a person
    // should always be able to see where a link goes before pressing it.
    `<p style="margin:12px 0 0;font:400 12px/1.6 ${FONT};color:#8b93a6;">` +
    `Button not working? Copy this link into your browser:<br>` +
    `<a href="${cta.href}" target="_blank" style="color:#3a6fff;word-break:break-all;">${cta.href}</a></p>`
  );
}

export function emailLayout(input: EmailLayoutInput): string {
  const { preheader, title, bodyHtml, cta, footnoteHtml } = input;
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
    `<tr><td align="center" style="padding:28px 12px 36px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e8f4;border-radius:20px;overflow:hidden;">`,
    // Header: the navy of the app's own hero, the rocket, the name.
    `<tr><td style="padding:24px 28px;background:#0c1230;background-image:linear-gradient(135deg,#04050e 0%,#0c1230 55%,#1b2450 100%);">`,
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>`,
    `<td width="44" height="44" style="width:44px;height:44px;border-radius:12px;background:#0a0e24;text-align:center;vertical-align:middle;">`,
    `<img src="${LOGO_URL}" width="30" height="30" alt="" style="display:inline-block;border:0;border-radius:8px;vertical-align:middle;"></td>`,
    `<td style="padding-left:12px;vertical-align:middle;">`,
    `<div style="font:800 17px/1.2 ${FONT};color:#ffffff;letter-spacing:-.01em;">Prime Scale Media</div>`,
    `<div style="margin-top:2px;font:500 12px/1.4 ${FONT};color:#9db8ff;">Advertiser &amp; affiliate platform</div>`,
    `</td></tr></table></td></tr>`,
    // A thin band of the brand gradient under the header.
    `<tr><td style="height:4px;line-height:4px;font-size:0;background:#6d63ff;background-image:linear-gradient(90deg,#5b8dff,#8b5cf6);">&nbsp;</td></tr>`,
    // Body
    `<tr><td style="padding:30px 28px 10px;">`,
    `<h1 style="margin:0 0 14px;font:800 24px/1.25 ${FONT};color:#12162a;letter-spacing:-.02em;">${title}</h1>`,
    bodyHtml,
    cta ? button(cta) : "",
    footnoteHtml
      ? `<p style="margin:18px 0 0;font:400 13px/1.6 ${FONT};color:#8b93a6;">${footnoteHtml}</p>`
      : "",
    `</td></tr>`,
    // Footer
    `<tr><td style="padding:22px 28px 26px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #eef1f8;padding-top:18px;">`,
    `<p style="margin:0;font:500 12px/1.6 ${FONT};color:#8b93a6;">Questions? Message us on WhatsApp: `,
    `<a href="${WHATSAPP}" target="_blank" style="color:#3a6fff;text-decoration:none;font-weight:700;">+31 6 15300300</a></p>`,
    `<p style="margin:4px 0 0;font:500 12px/1.6 ${FONT};color:#aab1c4;">Prime Scale Media &middot; `,
    `<a href="https://app.primescalemedia.com" target="_blank" style="color:#aab1c4;text-decoration:none;">app.primescalemedia.com</a></p>`,
    `</td></tr></table></td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}
