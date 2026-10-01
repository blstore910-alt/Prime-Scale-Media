#!/usr/bin/env node
// ── IS DEZE BACKUP HEEL? ────────────────────────────────────────────
//
//   npm run backup:verify -- C:\pad\naar\psm-backup-2026-10-01.zip
//
// Leest de zip, rekent van elk bestand de sha256 opnieuw uit en houdt
// die tegen manifest.json. Telt per tabel de rijen na. Print één tabel
// en eindigt met exit 1 als er ook maar één bestand niet klopt -- een
// backup die je pas bij het herstel wantrouwt, is er een te laat.
//
// Raakt geen database en geen netwerk.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import JSZip from "jszip";

const pad = process.argv[2];
if (!pad) {
  console.error("Gebruik: npm run backup:verify -- <pad-naar-zip>");
  process.exit(2);
}

const zip = await JSZip.loadAsync(readFileSync(pad));
const manRaw = await zip.file("manifest.json")?.async("string");
if (!manRaw) {
  console.error("Geen manifest.json in deze zip -- dit is geen PSM-backup, of hij is kapot.");
  process.exit(1);
}
const man = JSON.parse(manRaw);
let fout = 0;
const regels = [];
for (const e of man.entries) {
  if (e.error) {
    regels.push([e.file, "-", "AL FOUT BIJ MAKEN", e.error]);
    continue;
  }
  const f = zip.file(e.file);
  if (!f) {
    fout++;
    regels.push([e.file, e.rows, "ONTBREEKT", ""]);
    continue;
  }
  const bytes = await f.async("uint8array");
  const sha = createHash("sha256").update(bytes).digest("hex");
  let rijen = e.rows;
  if (e.file.endsWith(".json")) {
    try {
      rijen = JSON.parse(Buffer.from(bytes).toString("utf8")).length;
    } catch {
      rijen = "?";
    }
  }
  const ok = sha === e.sha256 && (rijen === e.rows || !e.file.endsWith(".json"));
  if (!ok) fout++;
  if (!e.file.startsWith("storage/") || !ok) regels.push([e.file, rijen, ok ? "OK" : "KLOPT NIET", ok ? "" : `verwacht ${e.rows} rijen`]);
}
const opslag = man.entries.filter((e) => e.file.startsWith("storage/") && !e.error).length;
regels.push([`storage/ (${opslag} bestanden)`, "", "zie boven als er iets mis was", ""]);

const w = [52, 8, 22];
console.log(`Backup van ${man.made_at}  ·  versie ${String(man.app_version ?? "?").slice(0, 7)}`);
console.log("bestand".padEnd(w[0]), "rijen".padStart(w[1]), " ", "uitkomst".padEnd(w[2]), "detail");
for (const [a, b, c, d] of regels) console.log(String(a).padEnd(w[0]).slice(0, w[0]), String(b).padStart(w[1]), " ", String(c).padEnd(w[2]), d);
console.log("");
console.log(fout ? `${fout} bestand(en) kloppen niet. Deze backup NIET gebruiken zonder uitzoeken.` : `Alles klopt: ${man.tables} tabellen, ${man.rows} rijen.`);
process.exit(fout ? 1 : 0);
