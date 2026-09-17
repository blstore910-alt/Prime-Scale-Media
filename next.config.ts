import type { NextConfig } from "next";

// Content-Security-Policy: report-only by default so we don't break
// production on a mis-listed source. Flip the header name to
// `Content-Security-Policy` (no -Report-Only suffix) after a week
// of clean reports.
//
// Sources we know are needed:
//   - Supabase (auth + REST + realtime + storage)
//   - Google Fonts (if used by shadcn — we allow it defensively)
//   - self for everything else
//
// `unsafe-inline` on script-src is required by Next.js's runtime
// scripts unless we adopt the strict-dynamic + nonce pattern (bigger
// change; do post-launch).
const supabaseHost = "https://*.supabase.co";
// react-international-phone renders country flags as twemoji SVGs from
// cdnjs (components/form/phone-input-field.tsx, used by company onboarding
// and the profile form). The policy is report-only today, so the flags load
// and the violations are merely logged — 223 of them the first time someone
// scrolls the country dropdown. Enforcing the policy without this line
// would break every flag in the app.
const twemojiHost = "https://cdnjs.cloudflare.com";
// "Apply Latest Rates" on /settings/finance fetches the reference rates
// straight from the browser (lib/get-exchange-rates.ts via
// components/settings/finance/exchange-rates.tsx). Enforcing the policy
// without this line would break that button silently — the fetch rejects
// and the handler's catch reports a generic failure.
//
// It would be better off behind the server action that already imports the
// same helper: a rate that prices real money should not be pulled by an
// admin's browser from an unauthenticated CDN, where a poisoned response is
// a wrong rate on every conversion. Listed here so the button survives
// enforcement; moving it server-side is the actual fix.
const ratesHost = "https://cdn.jsdelivr.net";
const supabaseWs = "wss://*.supabase.co";
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `img-src 'self' data: blob: ${supabaseHost} ${twemojiHost}`,
  `connect-src 'self' ${supabaseHost} ${supabaseWs} ${ratesHost}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `worker-src 'self' blob:`,
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "jifolefpyfasbhoqgjsg.supabase.co", pathname: "*/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "off",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: csp,
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
