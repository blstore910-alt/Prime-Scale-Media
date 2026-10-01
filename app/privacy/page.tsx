// ── DE PRIVACYVERKLARING, OPENBAAR ──────────────────────────────────
//
// Google eist een openbare privacy-URL om de backup-koppeling (Google
// Drive, docs/BACKUP_DRIVE_SETUP.md) te kunnen publiceren, en
// primescalemedia.com had er geen (01-10: /privacy en /privacy-policy
// gaven allebei 404). De inhoud volgt docs/PRIVACY_AND_DATA_LIFECYCLE.md
// -- wat we opslaan, waarom, hoe lang -- in de woorden van een klant.
//
// Staat in lib/supabase/update-session.ts bij de publieke routes: wie
// hem leest heeft geen account.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — Prime Scale Media",
};

const S = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "48px 20px 80px", lineHeight: 1.6, color: "#1b1f3a" },
  h1: { fontSize: "2rem", fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 6px" },
  sub: { color: "#5b6280", margin: "0 0 32px" },
  h2: { fontSize: "1.15rem", fontWeight: 800, margin: "32px 0 8px" },
  li: { margin: "4px 0" },
} as const;

export default function PrivacyPage() {
  return (
    <main style={{ background: "#fff", minHeight: "100vh" }}>
      <div style={S.wrap}>
        <h1 style={S.h1}>Privacy policy</h1>
        <p style={S.sub}>Prime Scale Media · app.primescalemedia.com · last updated 1 October 2026</p>

        <p>
          This policy explains what personal data the Prime Scale Media app collects, why, how long we keep it,
          and what you can ask us to do with it. We do not sell personal data to anyone.
        </p>

        <h2 style={S.h2}>What we collect</h2>
        <ul>
          <li style={S.li}><b>Account:</b> your name, e-mail address and a password (stored only as a secure hash).</li>
          <li style={S.li}><b>Company:</b> company name, VAT number, address, phone and billing details, used for your invoices.</li>
          <li style={S.li}><b>Financial records:</b> wallet balances, top-ups, ad-account fundings, withdrawals, invoices and the payment slips you upload.</li>
          <li style={S.li}><b>Activity log:</b> which user changed what and when, so every change to money can be traced.</li>
          <li style={S.li}><b>Notifications:</b> if you allow push notifications, the technical address your browser gives us for them.</li>
          <li style={S.li}><b>Security:</b> IP addresses, briefly, to protect sign-in and other sensitive actions against abuse.</li>
          <li style={S.li}><b>Cookies:</b> only what is needed to keep you signed in and to remember which referral link you came from.</li>
        </ul>

        <h2 style={S.h2}>Why we use it</h2>
        <ul>
          <li style={S.li}>To provide the service you signed up for: your wallet, ad accounts, invoices and support (performance of a contract).</li>
          <li style={S.li}>To keep financial records as the law requires (legal obligation).</li>
          <li style={S.li}>To protect the service and your account against fraud and abuse (legitimate interest).</li>
        </ul>
        <p>We do not send marketing e-mail from this app.</p>

        <h2 style={S.h2}>Who processes it for us</h2>
        <ul>
          <li style={S.li}><b>Supabase</b> — database, sign-in and file storage.</li>
          <li style={S.li}><b>Vercel</b> — hosting of the app.</li>
          <li style={S.li}><b>Brevo</b> — transactional e-mail (invitations, invoices, password resets).</li>
          <li style={S.li}><b>Wise</b> and our banks — to match incoming bank transfers to your top-ups.</li>
          <li style={S.li}><b>Google Drive</b> — to store our own encrypted-at-rest backups and invoice copies. The app never accesses your Google account.</li>
        </ul>

        <h2 style={S.h2}>How long we keep it</h2>
        <ul>
          <li style={S.li}>Financial records, invoices, payment slips and the activity log: 7 years, as Dutch tax law requires.</li>
          <li style={S.li}>Your account: until you ask us to delete it. Afterwards your profile is anonymised; the financial records above are kept for their legal period.</li>
          <li style={S.li}>Security data (IP addresses in rate limits): at most 24 hours.</li>
          <li style={S.li}>Push notification addresses: until your browser stops accepting them.</li>
        </ul>

        <h2 style={S.h2}>Your rights</h2>
        <p>
          You can ask to see, correct or delete your personal data, or object to how we use it. In the app, go to
          Settings → Your data to request deletion, or e-mail us. We answer within 30 days. You can also complain to
          the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).
        </p>

        <h2 style={S.h2}>Contact</h2>
        <p>
          Prime Scale Media — <a href="mailto:contact@primescalemedia.com">contact@primescalemedia.com</a>
        </p>
      </div>
    </main>
  );
}
