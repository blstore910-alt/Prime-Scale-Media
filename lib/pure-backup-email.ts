// ── DE BACKUPMAIL ───────────────────────────────────────────────────
//
// De eigenaar, 01-10, over de eerste mail: onderwerp "PSM backup ... --
// gelukt" als platte tekst. "Maak alles wat beter en duidelijker." Dus
// dezelfde opmaak als elke andere PSM-mail (lib/pure-email-layout.ts),
// een onderwerp dat in de inbox al zegt of het goed ging, en de cijfers
// als blokken in plaats van een regel tekst.
//
// Puur: geen netwerk, getest in tests/lib/backup.test.ts.

import { emailLayout, emailPanel, emailParagraph, escapeHtml } from "@/lib/pure-email-layout";

export type BackupMailInput = {
  ok: boolean;
  file: string;
  bytes: number;
  tables: number;
  rows: number;
  storageFiles: number;
  failed: string[];
  driveOk: boolean;
  driveLink: string | null;
  driveError: string | null;
  attached: boolean;
  when: Date;
};

function datum(d: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function backupMail(i: BackupMailInput): { subject: string; html: string; text: string } {
  const dag = datum(i.when);
  const mb = (i.bytes / 1024 / 1024).toFixed(1);
  const subject = i.ok
    ? `✅ PSM backup gelukt — ${dag}`
    : `⚠️ PSM backup NIET gelukt — ${dag}`;

  const panels = [
    emailPanel("Wat er in zit", `${i.tables} tabellen · ${i.rows.toLocaleString("nl-NL")} rijen · ${i.storageFiles} bestanden`),
    emailPanel("Bestand", `${escapeHtml(i.file)} · ${mb} MB`),
    emailPanel(
      "Google Drive",
      i.driveOk ? "Opgeslagen in PSM / Backups" : `Niet gelukt: ${escapeHtml(i.driveError ?? "onbekend")}`,
    ),
  ].join("");

  const fouten = i.failed.length
    ? emailParagraph(
        `<b>Wat er misging (${i.failed.length}):</b><br>` +
          i.failed.slice(0, 20).map((f) => escapeHtml(f)).join("<br>"),
      )
    : "";

  const html = emailLayout({
    preheader: i.ok
      ? `${i.tables} tabellen en ${i.rows} rijen veilig op Drive.`
      : "Er ging iets mis met de backup van vannacht — kijk wat.",
    eyebrow: "Dagelijkse backup",
    title: i.ok ? "De backup van vannacht is gelukt" : "De backup van vannacht is niet gelukt",
    lead: i.ok
      ? "Het hele systeem staat als één zip op Google Drive: elke tabel, de logins (zonder wachtwoorden) en de bestanden."
      : "Een deel ontbreekt. Hieronder staat wat; het staat ook bij de meldingen in de app.",
    cta: i.driveLink ? { label: "Open in Google Drive", href: i.driveLink } : undefined,
    bodyHtml: panels + fouten,
    footnoteHtml:
      (i.attached ? "De zip zit als bijlage bij deze mail. " : "") +
      "Controleren: <code>npm run backup:verify -- &lt;zip&gt;</code>. Herstellen: docs/RESTORE_DRILL.md.",
  });

  const text = [
    i.ok ? "De backup van vannacht is gelukt." : "De backup van vannacht is NIET gelukt.",
    "",
    `Wanneer: ${dag}`,
    `Wat er in zit: ${i.tables} tabellen, ${i.rows} rijen, ${i.storageFiles} bestanden`,
    `Bestand: ${i.file} (${mb} MB)`,
    i.driveOk ? `Google Drive: ${i.driveLink ?? "opgeslagen"}` : `Google Drive: niet gelukt -- ${i.driveError}`,
    ...(i.failed.length ? ["", "Wat er misging:", ...i.failed.slice(0, 30).map((f) => `- ${f}`)] : []),
  ].join("\n");

  return { subject, html, text };
}
