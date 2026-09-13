import { dmSans, jakarta } from "@/lib/fonts";

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

// The launching rocket that anchors the brand panel. Pure SVG so it
// stays crisp; all motion is CSS (see AUTH_CSS) and is frozen under
// prefers-reduced-motion.
function LaunchRocket() {
  return (
    <svg
      className="ship-svg"
      viewBox="0 0 120 232"
      role="img"
      aria-label="Rocket launching toward the moon"
    >
      <defs>
        <linearGradient id="psmBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f8ff" />
          <stop offset="1" stopColor="#aec4ff" />
        </linearGradient>
        <linearGradient id="psmFin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#5B8DFF" />
        </linearGradient>
        <radialGradient id="psmGlass" cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#e3edff" />
          <stop offset="0.55" stopColor="#5B8DFF" />
          <stop offset="1" stopColor="#33379e" />
        </radialGradient>
        <linearGradient id="psmFlame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2c4" />
          <stop offset="0.45" stopColor="#ffb020" />
          <stop offset="1" stopColor="#ff5a2c" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="psmFlame2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffcf5a" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* exhaust — drawn first so the nozzle overlaps it */}
      <path
        className="flame"
        d="M50 164 Q60 230 70 164 Q60 188 50 164Z"
        fill="url(#psmFlame)"
      />
      <path
        className="flame2"
        d="M55 164 Q60 214 65 164 Q60 184 55 164Z"
        fill="url(#psmFlame2)"
      />

      {/* fins */}
      <path d="M42 120 L16 158 L42 142 Z" fill="url(#psmFin)" />
      <path d="M78 120 L104 158 L78 142 Z" fill="url(#psmFin)" />

      {/* fuselage */}
      <path
        d="M60 8 C78 26 84 62 84 108 C84 134 74 152 60 152 C46 152 36 134 36 108 C36 62 42 26 60 8Z"
        fill="url(#psmBody)"
      />
      {/* gloss streak */}
      <ellipse
        cx="52"
        cy="42"
        rx="4"
        ry="15"
        fill="rgba(255,255,255,.45)"
        transform="rotate(-8 52 42)"
      />

      {/* nozzle */}
      <path d="M48 150 L72 150 L67 166 L53 166 Z" fill="#5a6699" />

      {/* window */}
      <circle cx="60" cy="60" r="15" fill="#101636" />
      <circle cx="60" cy="60" r="10" fill="url(#psmGlass)" />
      <circle cx="56" cy="56" r="3.2" fill="rgba(255,255,255,.85)" />
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
/* starfield */
.psmauth .brand .stars{position:absolute;inset:0;pointer-events:none;opacity:.85;
  background-image:
    radial-gradient(1.6px 1.6px at 12% 22%,#fff,transparent),
    radial-gradient(1.4px 1.4px at 27% 66%,rgba(255,255,255,.8),transparent),
    radial-gradient(2px 2px at 61% 16%,#cdd7ff,transparent),
    radial-gradient(1.5px 1.5px at 82% 40%,#fff,transparent),
    radial-gradient(1.4px 1.4px at 45% 82%,rgba(255,255,255,.7),transparent),
    radial-gradient(1.6px 1.6px at 72% 74%,#fff,transparent),
    radial-gradient(2px 2px at 90% 10%,#e6ebff,transparent),
    radial-gradient(1.4px 1.4px at 8% 50%,#fff,transparent),
    radial-gradient(1.5px 1.5px at 36% 34%,rgba(255,255,255,.7),transparent);
  animation:psmtwinkle 3.8s ease-in-out infinite}
@keyframes psmtwinkle{0%,100%{opacity:.45}50%{opacity:.95}}
.psmauth .brand>*{position:relative;z-index:1}
.psmauth .logo{display:flex;align-items:center;gap:12px}
.psmauth .logo .mk{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#0c1030,#0a0e24);box-shadow:0 0 26px rgba(91,141,255,.5),0 0 0 1px rgba(91,141,255,.35)}
.psmauth .logo .mk svg{width:24px;height:24px;stroke:#fff}
.psmauth .logo b{font-family:var(--hd);font-weight:800;font-size:1.12rem;letter-spacing:-.01em}
.psmauth .logo small{display:block;font-weight:500;font-size:.72rem;color:rgba(255,255,255,.6)}
/* rocket stage */
.psmauth .rocketstage{position:relative;flex:1;display:grid;place-items:center;min-height:220px;margin:10px 0 4px}
.psmauth .rocketstage .glow{position:absolute;left:50%;top:54%;width:280px;height:280px;transform:translate(-50%,-50%);
  background:radial-gradient(circle,rgba(91,141,255,.5),rgba(139,92,246,.2) 45%,transparent 70%);filter:blur(6px);
  animation:psmglow 5.5s ease-in-out infinite}
@keyframes psmglow{0%,100%{opacity:.5;transform:translate(-50%,-50%) scale(1)}50%{opacity:.85;transform:translate(-50%,-50%) scale(1.12)}}
.psmauth .rocketstage .moon{position:absolute;top:4%;right:15%;width:56px;height:56px;border-radius:50%;
  background:radial-gradient(circle at 34% 30%,#fdfcff,#cdd7ff 58%,#98a8e0);
  box-shadow:0 0 36px rgba(201,212,255,.6),inset -8px -6px 14px rgba(90,110,180,.35)}
.psmauth .rocketstage .moon::after{content:"";position:absolute;top:34%;left:24%;width:9px;height:9px;border-radius:50%;
  background:rgba(120,140,200,.35);box-shadow:16px 10px 0 -2px rgba(120,140,200,.3),4px 20px 0 -3px rgba(120,140,200,.28)}
.psmauth .ship{position:relative;z-index:1;width:118px;animation:psmbob 4.6s ease-in-out infinite;
  filter:drop-shadow(0 16px 26px rgba(91,141,255,.4))}
.psmauth .ship .ship-svg{width:100%;height:auto;display:block;stroke:none;fill:none}
@keyframes psmbob{0%,100%{transform:translateY(7px) scale(1)}50%{transform:translateY(-11px) scale(1.035)}}
.psmauth .flame{transform-box:fill-box;transform-origin:50% 0;animation:psmflame .28s ease-in-out infinite alternate}
.psmauth .flame2{transform-box:fill-box;transform-origin:50% 0;animation:psmflame2 .19s ease-in-out infinite alternate}
@keyframes psmflame{from{transform:scaleY(.82) scaleX(1.05);opacity:.9}to{transform:scaleY(1.18) scaleX(.94);opacity:1}}
@keyframes psmflame2{from{transform:scaleY(.66)}to{transform:scaleY(1.28)}}
/* ── Launch sequence: data-launching is set on .psmauth on sign-in.
   The page fades and a rocket blasts from below, up through the WHOLE
   screen and out the top, with speed lines and a flash. ~2.9s. ── */
.psmauth[data-launching]{overflow:hidden}
.psmauth[data-launching] .brand,.psmauth[data-launching] .card{animation:psmfade .45s ease forwards}
@keyframes psmfade{to{opacity:0}}
.launchfx{position:fixed;inset:0;z-index:300;pointer-events:none;opacity:0;overflow:hidden}
.psmauth[data-launching] .launchfx{opacity:1}
.launchfx .lf-rocket{position:absolute;left:50%;top:50%;width:158px;margin-top:-172px;transform:translate(-50%,118vh)}
.launchfx .lf-rocket .ship-svg{width:100%;height:auto;display:block;stroke:none;fill:none;filter:drop-shadow(0 14px 46px rgba(91,141,255,.6))}
.psmauth[data-launching] .lf-rocket{animation:lffly 2.9s cubic-bezier(.32,.12,.6,.92) forwards}
@keyframes lffly{0%{transform:translate(-50%,118vh) scale(.9);opacity:0}12%{opacity:1}94%{opacity:1}100%{transform:translate(-50%,-125vh) scale(1.32);opacity:0}}
.psmauth[data-launching] .launchfx .flame,.psmauth[data-launching] .launchfx .flame2{animation:psmflameburst .06s ease-in-out infinite alternate}
@keyframes psmflameburst{from{transform:scaleY(1.6) scaleX(1.08);opacity:1}to{transform:scaleY(3) scaleX(.9);opacity:1}}
.launchfx .lf-streaks{position:absolute;inset:0}
.launchfx .lf-streaks i{position:absolute;top:0;width:2px;height:20%;background:linear-gradient(rgba(180,205,255,.9),transparent);border-radius:2px;opacity:0}
.psmauth[data-launching] .lf-streaks i{animation:lfstreak .85s linear infinite}
@keyframes lfstreak{0%{transform:translateY(-30vh);opacity:0}25%{opacity:.6}100%{transform:translateY(135vh);opacity:0}}
.launchfx .lf-flash{position:absolute;left:50%;top:50%;width:360px;height:360px;border-radius:50%;background:radial-gradient(circle,rgba(150,180,255,.5),transparent 62%);opacity:0}
.psmauth[data-launching] .lf-flash{animation:lfflash 2.9s ease-out forwards}
@keyframes lfflash{0%{opacity:0;transform:translate(-50%,60%) scale(.4)}16%{opacity:.85;transform:translate(-50%,30%) scale(1.1)}48%{opacity:.3;transform:translate(-50%,0) scale(1.6)}100%{opacity:0;transform:translate(-50%,-40%) scale(2.4)}}
/* brand copy */
.psmauth .brand h1{font-family:var(--hd);font-weight:800;font-size:2.15rem;line-height:1.08;letter-spacing:-.02em;margin:0 0 14px;max-width:15ch;text-wrap:balance}
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
/* mobile: one continuous dark screen — the rocket hero flows straight
   into the form, no white card. Email + password sit on the brand
   background in light-on-dark controls. */
@media(max-width:860px){
  html,body{background:#080b1c}
  /* Flat, single-colour surface — no background gradient (which read as
     two tones); the rocket carries its own glow. min-height:100dvh so it
     always fills the screen when the mobile address bar moves. */
  .psmauth{grid-template-columns:1fr;align-content:center;min-height:100dvh;background:#080b1c}
  .psmauth input:-webkit-autofill,.psmauth input:-webkit-autofill:hover,.psmauth input:-webkit-autofill:focus{-webkit-text-fill-color:#fff;-webkit-box-shadow:0 0 0 1000px #191c2e inset;caret-color:#fff;transition:background-color 9999s}
  .psmauth .brand{background:transparent;padding:18px 22px 12px;min-height:auto;text-align:center;align-items:center;border-radius:0}
  .psmauth .brand .logo{align-self:center}
  .psmauth .brand .logo .mk{width:38px;height:38px}
  .psmauth .brand .logo .mk svg{width:21px;height:21px}
  .psmauth .rocketstage{min-height:118px;margin:2px 0 0;width:100%}
  .psmauth .rocketstage .moon{top:2%;right:16%;width:36px;height:36px}
  .psmauth .rocketstage .glow{width:178px;height:178px}
  .psmauth .ship{width:76px}
  .psmauth .brand h1{font-size:1.5rem;margin:6px auto 7px;max-width:18ch}
  .psmauth .brand .sub{font-size:.88rem;margin:0 auto;max-width:32ch}
  .psmauth .pts{display:none}
  /* the form has no background of its own — it flows on the same surface */
  .psmauth .side{background:transparent;min-height:auto;justify-content:flex-start;padding:2px clamp(18px,6vw,30px) 40px}
  .psmauth .card{margin:0 auto;max-width:400px}
  .psmauth .lmk{display:none}
  .psmauth .login-card{background:transparent;border:0;box-shadow:none;padding:0;margin:0 auto}
  /* light-on-dark form controls */
  .psmauth .login-card h2,.psmauth h2{font-size:1.6rem;margin:4px 0 6px;color:#fff}
  .psmauth .lede{color:rgba(255,255,255,.62);margin-bottom:20px}
  .psmauth .field label{color:rgba(255,255,255,.8)}
  .psmauth .field label .opt{color:rgba(255,255,255,.5)}
  .psmauth input,.psmauth select{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.16);color:#fff}
  .psmauth input::placeholder{color:rgba(255,255,255,.4)}
  .psmauth .inp>svg{color:rgba(255,255,255,.5)}
  .psmauth input:focus,.psmauth select:focus{background:rgba(255,255,255,.1);border-color:var(--blue);box-shadow:0 0 0 3px rgba(91,141,255,.28)}
  .psmauth .meta{color:rgba(255,255,255,.62)}
  .psmauth a.lnk{color:#9db8ff}
  .psmauth .err{color:#ff9ba0}
  .psmauth .note{background:rgba(255,214,120,.12);border-color:rgba(240,217,168,.32);color:#ffdf9e}
  .psmauth .btn.ghost{background:rgba(255,255,255,.08);color:#fff;border-color:rgba(255,255,255,.18)}
}
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

      {/* Full-screen launch effect, revealed when signing in (data-launching). */}
      <div className="launchfx" aria-hidden="true">
        <span className="lf-flash" />
        <div className="lf-streaks">
          {[10, 20, 32, 44, 56, 68, 80, 90].map((l, i) => (
            <i
              key={l}
              style={{ left: `${l}%`, animationDelay: `${(i % 5) * 0.12}s` }}
            />
          ))}
        </div>
        <div className="lf-rocket">
          <LaunchRocket />
        </div>
      </div>

      <aside className="brand">
        <div className="ribbon" aria-hidden="true" />
        <div className="stars" aria-hidden="true" />
        <div className="logo">
          <span className="mk">
            <Rocket />
          </span>
          <span>
            <b>Prime Scale Media</b>
            <small>Advertiser &amp; affiliate platform</small>
          </span>
        </div>

        <div className="rocketstage" aria-hidden="true">
          <span className="glow" />
          <span className="moon" />
          <div className="ship">
            <LaunchRocket />
          </div>
        </div>

        <div className="brandcopy">
          <h1>
            Scale your ads with <span className="g">one simple platform.</span>
          </h1>
          <p className="sub">
            Manage your advertising accounts and grow your campaigns —
            everything in one place.
          </p>
          <div className="pts">
            <div className="pt">
              <span className="d">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>{" "}
              One dashboard for all your ad accounts
            </div>
            <div className="pt">
              <span className="d">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>{" "}
              A clear overview across every channel
            </div>
            <div className="pt">
              <span className="d">
                <svg viewBox="0 0 24 24">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>{" "}
              Fast, transparent, and secure
            </div>
          </div>
        </div>
      </aside>

      <main className="side">{children}</main>
    </div>
  );
}
