import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";

// Fonts from the approved mockup (onboarding-auth.html): Plus Jakarta
// Sans for headings, DM Sans for body. Scoped to the auth screens via
// the .psmauth wrapper so the rest of the app keeps Sora/Outfit until
// it is ported too.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dmsans",
  display: "swap",
});

// The rocket mark used in the mockup's logo tiles.
function Rocket() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

const AUTH_CSS = `
.psmauth{
  --panel:#fff;--panel-2:#f1f4fb;--ink:#12162a;--muted:#5c6577;--faint:#8b93a6;
  --line:#e6e9f2;--line-2:#d8ddec;--primary:#3a6fff;--primary-600:#2f5ae6;--primary-tint:#eaf1ff;
  --blue:#5B8DFF;--purple:#8B5CF6;--win:#10b981;--warn:#e08a00;--danger:#e5484d;
  --hd:var(--font-jakarta),system-ui,sans-serif;--bd:var(--font-dmsans),system-ui,sans-serif;
  --brand:linear-gradient(135deg,#5B8DFF,#8B5CF6);
  --shadow:0 30px 70px -34px rgba(20,30,80,.5);
  min-height:100svh;background:#eef2fb;color:var(--ink);font-family:var(--bd);line-height:1.55;
  -webkit-font-smoothing:antialiased;
  display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);
}
.psmauth svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.psmauth svg.ic{width:18px;height:18px}
/* brand side */
.psmauth .brand{position:relative;overflow:hidden;color:#fff;padding:44px 46px;display:flex;flex-direction:column;
  background:radial-gradient(120% 90% at 15% 0%,rgba(91,141,255,.4),transparent 55%),radial-gradient(110% 90% at 100% 100%,rgba(139,92,246,.42),transparent 52%),linear-gradient(160deg,#04050E,#0c1230 55%,#141a3c)}
.psmauth .brand .ribbon{position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent,rgba(139,92,246,.16),transparent 26%,rgba(91,141,255,.2),transparent 58%);animation:psmspin 26s linear infinite}
@keyframes psmspin{to{transform:rotate(360deg)}}
.psmauth .brand>*{position:relative}
.psmauth .logo{display:flex;align-items:center;gap:12px}
.psmauth .logo .mk{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#0c1030,#0a0e24);box-shadow:0 0 26px rgba(91,141,255,.5),0 0 0 1px rgba(91,141,255,.35)}
.psmauth .logo .mk svg{width:24px;height:24px;stroke:#fff}
.psmauth .logo b{font-family:var(--hd);font-weight:800;font-size:1.12rem;letter-spacing:-.01em}
.psmauth .logo small{display:block;font-weight:500;font-size:.72rem;color:rgba(255,255,255,.6)}
.psmauth .brand h1{font-family:var(--hd);font-weight:800;font-size:2.15rem;line-height:1.08;letter-spacing:-.02em;margin:auto 0 14px;max-width:15ch;text-wrap:balance}
.psmauth .brand h1 .g{background:linear-gradient(135deg,#9db8ff,#c9b3ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.psmauth .brand .sub{color:rgba(255,255,255,.72);font-size:1.02rem;max-width:34ch;margin:0 0 26px}
.psmauth .pts{display:flex;flex-direction:column;gap:12px;margin-bottom:8px}
.psmauth .pt{display:flex;align-items:center;gap:12px;font-size:.92rem;color:rgba(255,255,255,.9)}
.psmauth .pt .d{width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.1);display:grid;place-items:center;flex:0 0 auto;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.psmauth .pt .d svg{width:15px;height:15px;color:#a9c2ff}
/* form side */
.psmauth .side{display:flex;flex-direction:column;justify-content:center;padding:30px clamp(20px,5vw,64px);overflow-y:auto}
.psmauth .lmk{display:flex;justify-content:center;margin-bottom:18px}
.psmauth .lmk .mk{width:54px;height:54px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(135deg,#0c1030,#0a0e24);box-shadow:0 12px 30px -10px rgba(58,90,230,.6),0 0 30px rgba(91,141,255,.45),0 0 0 1px rgba(91,141,255,.32)}
.psmauth .lmk .mk svg{width:29px;height:29px;stroke:#fff}
.psmauth .card{width:100%;max-width:430px;margin:26px auto;align-self:center}
.psmauth .login-card{text-align:center}
.psmauth .login-card .field{text-align:left}
.psmauth .login-card h2{font-size:2.05rem;margin-top:2px}
.psmauth .step{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--primary-600);display:flex;align-items:center;gap:8px}
.psmauth .step::before{content:"";width:22px;height:2px;border-radius:2px;background:var(--brand)}
.psmauth h2{font-family:var(--hd);font-weight:800;font-size:1.7rem;letter-spacing:-.02em;margin:12px 0 6px;text-wrap:balance}
.psmauth .lede{color:var(--muted);font-size:.95rem;margin:0 0 22px}
.psmauth .field{margin-bottom:13px}
.psmauth .field label{display:block;font-weight:600;font-size:.82rem;margin-bottom:6px}
.psmauth .field label .opt{color:var(--faint);font-weight:500}
.psmauth .inp{position:relative}
.psmauth .inp>svg{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--faint);width:17px;height:17px}
.psmauth input,.psmauth select{width:100%;font-family:var(--bd);font-size:.94rem;border:1px solid var(--line-2);border-radius:11px;padding:12px 13px;background:var(--panel-2);color:var(--ink);transition:.14s}
.psmauth .inp input{padding-left:38px}
.psmauth input::placeholder{color:var(--faint)}
.psmauth input:focus,.psmauth select:focus{outline:0;border-color:var(--primary);background:var(--panel);box-shadow:0 0 0 3px var(--primary-tint)}
.psmauth .row2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.psmauth .btn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;cursor:pointer;font-family:var(--bd);font-weight:700;font-size:.95rem;border-radius:12px;padding:13px 16px;background:var(--brand);color:#fff;box-shadow:0 14px 30px -14px rgba(124,92,255,.75);transition:.14s;margin-top:6px}
.psmauth .btn:hover{transform:translateY(-1px);filter:brightness(1.03)}
.psmauth .btn:disabled{opacity:.65;cursor:default;transform:none;filter:none}
.psmauth .btn.ghost{background:var(--panel);color:var(--ink);border:1px solid var(--line-2);box-shadow:none}
.psmauth .btn.ghost:hover{border-color:var(--primary);color:var(--primary-600)}
.psmauth a.lnk{color:var(--primary-600);text-decoration:none;font-weight:600}
.psmauth a.lnk:hover{text-decoration:underline}
.psmauth .meta{margin-top:18px;text-align:center;color:var(--muted);font-size:.88rem}
.psmauth .err{color:var(--danger);font-size:.85rem;font-weight:600;margin:6px 0 0;text-align:left}
.psmauth .note{background:#fff7e6;border:1px solid #f0d9a8;color:#8a5a00;border-radius:11px;padding:10px 12px;font-size:.82rem;margin-bottom:14px;text-align:left}
@media(max-width:860px){.psmauth{grid-template-columns:1fr}.psmauth .brand{display:none}.psmauth .side{min-height:100svh}}
@media (prefers-reduced-motion:reduce){.psmauth *{animation:none!important}}
`;

// Shared shell for every /auth screen. Ports the approved mockup
// (onboarding-auth.html): a navy PSM brand panel on the left and the
// auth flow on the right. Individual pages/forms render into .side.
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`psmauth ${jakarta.variable} ${dmSans.variable}`}>
      <style>{AUTH_CSS}</style>
      <aside className="brand">
        <div className="ribbon" />
        <div className="logo">
          <span className="mk">
            <Rocket />
          </span>
          <span>
            <b>Prime Scale Media</b>
            <small>Advertiser &amp; affiliate platform</small>
          </span>
        </div>
        <h1>
          Scale your ads with <span className="g">wallets that just work.</span>
        </h1>
        <p className="sub">
          Fund your campaigns by bank transfer, hold EUR &amp; USD, and keep
          track of every euro — all in one place.
        </p>
        <div className="pts">
          <div className="pt">
            <span className="d">
              <svg viewBox="0 0 24 24">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>{" "}
            EUR &amp; USD wallets with instant exchange
          </div>
          <div className="pt">
            <span className="d">
              <svg viewBox="0 0 24 24">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>{" "}
            One balance across all your marketing channels
          </div>
          <div className="pt">
            <span className="d">
              <svg viewBox="0 0 24 24">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>{" "}
            Every top-up verified, every cent reconciled
          </div>
        </div>
      </aside>

      <main className="side">{children}</main>
    </div>
  );
}
