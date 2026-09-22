// Renders the images the emails use, from the SAME drawings the app uses:
// the rocket tile of the app's logo and the launching rocket of the sign-in
// screen (components/auth/auth-shell.tsx). Mail clients show no SVG, so
// they become PNGs, sharp on a phone and light enough for a mail.
//
//   node scripts/email-assets.mjs
//
// Writes public/email/rocket-mark.png and public/email/launch.png.

import sharp from "sharp";

// ── the app's logo tile: navy, a thin blue ring, the white rocket ───────
// The tile IS the image, edge to edge: no halo baked in. A soft glow baked
// into a PNG turned into a hazy dark square around the tile in the mail
// (the owner: "raket glow erg lelijk"). Where a client supports it, the
// glow comes from box-shadow in the layout instead.
const mark = `
<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141a48"/>
      <stop offset="1" stop-color="#0a0e24"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="88" height="88" rx="22" fill="url(#tile)"/>
  <rect x="0.75" y="0.75" width="86.5" height="86.5" rx="21.3" fill="none" stroke="#5B8DFF" stroke-opacity=".6" stroke-width="1.5"/>
  <g transform="translate(18 18) scale(2.1667)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
  </g>
</svg>`;

// ── the launch: glow, moon, the sign-in screen's rocket with its flame ──
const launch = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="300" viewBox="0 0 360 300">
  <defs>
    <radialGradient id="glow" cx=".5" cy=".55" r=".5">
      <stop offset="0" stop-color="#5B8DFF" stop-opacity=".55"/>
      <stop offset=".5" stop-color="#8B5CF6" stop-opacity=".22"/>
      <stop offset="1" stop-color="#8B5CF6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="moon" cx=".34" cy=".3" r=".75">
      <stop offset="0" stop-color="#fdfcff"/>
      <stop offset=".58" stop-color="#cdd7ff"/>
      <stop offset="1" stop-color="#98a8e0"/>
    </radialGradient>
    <radialGradient id="moonglow" cx=".5" cy=".5" r=".5">
      <stop offset=".45" stop-color="#c9d4ff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#c9d4ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="smoke" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#e2e6f8" stop-opacity=".5"/>
      <stop offset=".6" stop-color="#96a2c8" stop-opacity=".22"/>
      <stop offset="1" stop-color="#96a2c8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="psmBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6f8ff"/><stop offset="1" stop-color="#aec4ff"/>
    </linearGradient>
    <linearGradient id="psmFin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#5B8DFF"/>
    </linearGradient>
    <radialGradient id="psmGlass" cx=".4" cy=".35" r=".75">
      <stop offset="0" stop-color="#e3edff"/><stop offset=".55" stop-color="#5B8DFF"/><stop offset="1" stop-color="#33379e"/>
    </radialGradient>
    <linearGradient id="psmFlame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff2c4"/><stop offset=".45" stop-color="#ffb020"/><stop offset="1" stop-color="#ff5a2c" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="psmFlame2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffcf5a" stop-opacity=".15"/>
    </linearGradient>
  </defs>
  <ellipse cx="180" cy="160" rx="170" ry="140" fill="url(#glow)"/>
  <circle cx="286" cy="58" r="40" fill="url(#moonglow)"/>
  <circle cx="286" cy="58" r="23" fill="url(#moon)"/>
  <circle cx="279" cy="54" r="4" fill="#7888c8" fill-opacity=".35"/>
  <circle cx="293" cy="64" r="3" fill="#7888c8" fill-opacity=".3"/>
  <ellipse cx="150" cy="276" rx="46" ry="18" fill="url(#smoke)"/>
  <ellipse cx="210" cy="278" rx="50" ry="17" fill="url(#smoke)"/>
  <ellipse cx="180" cy="286" rx="62" ry="14" fill="url(#smoke)"/>
  <g transform="translate(126 6) scale(0.9)">
    <path d="M50 164 Q60 262 70 164 Q60 190 50 164Z" fill="url(#psmFlame)"/>
    <path d="M55 164 Q60 226 65 164 Q60 186 55 164Z" fill="url(#psmFlame2)"/>
    <path d="M42 120 L16 158 L42 142 Z" fill="url(#psmFin)"/>
    <path d="M78 120 L104 158 L78 142 Z" fill="url(#psmFin)"/>
    <path d="M60 8 C78 26 84 62 84 108 C84 134 74 152 60 152 C46 152 36 134 36 108 C36 62 42 26 60 8Z" fill="url(#psmBody)"/>
    <ellipse cx="52" cy="42" rx="4" ry="15" fill="#ffffff" fill-opacity=".45" transform="rotate(-8 52 42)"/>
    <path d="M48 150 L72 150 L67 166 L53 166 Z" fill="#5a6699"/>
    <circle cx="60" cy="60" r="15" fill="#101636"/>
    <circle cx="60" cy="60" r="10" fill="url(#psmGlass)"/>
    <circle cx="56" cy="56" r="3.2" fill="#ffffff" fill-opacity=".85"/>
  </g>
  <g fill="#ffffff">
    <circle cx="40" cy="60" r="1.6" fill-opacity=".9"/><circle cx="78" cy="140" r="1.2" fill-opacity=".7"/>
    <circle cx="320" cy="170" r="1.4" fill-opacity=".8"/><circle cx="250" cy="220" r="1.1" fill-opacity=".6"/>
    <circle cx="96" cy="30" r="1.1" fill-opacity=".7"/><circle cx="60" cy="230" r="1.3" fill-opacity=".6"/>
  </g>
</svg>`;

// Sized for their place in the mail: the mark shows at 48px, the launch at
// 250px -- 3x and 2x are plenty, and a mail should stay light.
await sharp(Buffer.from(mark), { density: 72 * 3 })
  .resize(144, 144)
  .png({ compressionLevel: 9 })
  .toFile("public/email/rocket-mark.png");
await sharp(Buffer.from(launch), { density: 72 * 3 })
  .resize(500)
  .png({ compressionLevel: 9 })
  .toFile("public/email/launch.png");
const a = await sharp("public/email/rocket-mark.png").metadata();
const b = await sharp("public/email/launch.png").metadata();
console.log("rocket-mark", a.width, a.height, "launch", b.width, b.height);
