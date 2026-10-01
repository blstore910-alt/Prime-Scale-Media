// ── ALLE MERKTEKENS UIT ÉÉN BRON ───────────────────────────────────
//
// app/icon.svg is het merkteken (donker vlak, witte raket MET raampje --
// de eigenaar, 01-10: "die met dot erin, maak dat overal, ook favicon").
// Dit script maakt er elke PNG uit, zodat ze nooit uit elkaar lopen:
//
//   public/icon-192.png, public/icon-512.png   PWA / startscherm
//   public/apple-touch-icon.png (180)          iPhone startscherm
//   public/badge-96.png                        pushmelding (wit, transparant)
//   public/images/psm-logo.png                 factuur-pdf
//
// De mail-afbeeldingen maakt scripts/email-assets.mjs.
//
//   node scripts/render-icons.mjs

import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("app/icon.svg");
for (const [file, size] of [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180],
]) {
  await sharp(svg, { density: 512 }).resize(size, size).png().toFile(file);
  console.log(file, size);
}

// Het pushmeldings-badge: alleen de witte raket, op transparant. Android
// kleurt hem zelf; een vlak eromheen wordt daar een wit vierkant.
const raket = svg
  .toString()
  .replace(/<rect[^>]*\/>/, "")
  .replace(/<!--[\s\S]*?-->/g, "");
await sharp(Buffer.from(raket), { density: 512 }).resize(96, 96).png().toFile("public/badge-96.png");
console.log("public/badge-96.png 96");

// Het factuurlogo (512 x 512) uit het merk-svg, en zijn korte kopie.
const logo = readFileSync("public/images/psm-logo.svg");
for (const file of ["public/images/psm-logo.png", "public/images/psm-logo-short.png"]) {
  await sharp(logo, { density: 512 }).resize(512, 512).png().toFile(file);
  console.log(file, 512);
}
