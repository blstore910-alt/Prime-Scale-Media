// ── DE REKENREGELS VAN DE BACKUP, LOS VAN DRIVE EN DATABASE ─────────
//
// Alles hier is puur, zodat tests/lib/backup.test.ts het kan toetsen
// zonder netwerk: welke map, welke bestandsnaam, welke tabellen, en of
// een zip in een mail past.

const MAANDEN = [
  "Januari", "Februari", "Maart", "April", "Mei", "Juni",
  "Juli", "Augustus", "September", "Oktober", "November", "December",
];

/** Jaar en maand zoals ze in Amsterdam zijn -- niet in UTC. Een factuur
 *  betaald op 1 februari om 00:30 Amsterdamse tijd is in UTC nog
 *  31 januari, en hoort toch in de map van februari. De map volgt de
 *  kalender van de eigenaar. */
export function amsterdamYmd(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), day: get("day") };
}

/** "10 Oktober": het nummer vooraan, zodat Drive de maanden op volgorde
 *  zet in plaats van alfabetisch (april, augustus, december, ...). */
export function maandMap(m: number): string {
  return `${String(m).padStart(2, "0")} ${MAANDEN[m - 1] ?? "?"}`;
}

export function backupFolderPath(d: Date): string[] {
  const { y, m } = amsterdamYmd(d);
  return ["Backups", String(y), maandMap(m)];
}

export function backupFileName(d: Date): string {
  const { y, m, day } = amsterdamYmd(d);
  return `psm-backup-${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}.zip`;
}

export function invoiceFolderPath(paidAt: Date): string[] {
  const { y, m } = amsterdamYmd(paidAt);
  return ["Facturen", String(y), maandMap(m)];
}

/** "0020-145 PSM0020.pdf". Alleen tekens die op elk systeem mogen. */
export function invoiceFileName(number: string | number | null, clientCode: string | null, id: string): string {
  const veilig = (s: string) => s.replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/\s+/g, " ").trim();
  const nr = number != null && String(number).trim() ? veilig(String(number)) : id.slice(0, 8);
  const code = clientCode ? ` ${veilig(clientCode)}` : "";
  return `${nr}${code}.pdf`;
}

/** Past de zip als bijlage? Brevo neemt tot 20 MB per mail; we blijven
 *  er ruim onder, want base64 maakt een bijlage een derde groter. */
export const MAX_ATTACH_BYTES = 12 * 1024 * 1024;
export function fitsInMail(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_ATTACH_BYTES;
}

type OpenApi = {
  definitions?: Record<string, { properties?: Record<string, { description?: string }> }>;
};

/** Alle tabellen en views die PostgREST kent, op naam. Een naam die met
 *  een liggend streepje begint is een interne kopie (zoals
 *  _view_backup_20260918) en hoort niet in een backup van het systeem. */
export function tablesFromOpenApi(spec: OpenApi): string[] {
  return Object.keys(spec.definitions ?? {})
    .filter((t) => !t.startsWith("_"))
    .sort();
}

/** De primaire sleutel, als PostgREST hem markeert met <pk/>. Gebruikt
 *  om stabiel te pagineren; zonder sleutel wordt er niet gesorteerd. */
export function primaryKey(spec: OpenApi, table: string): string | null {
  const props = spec.definitions?.[table]?.properties ?? {};
  for (const [col, p] of Object.entries(props)) if ((p.description ?? "").includes("<pk/>")) return col;
  return null;
}

export type ManifestEntry = { file: string; rows: number; sha256: string; error?: string };

/** De mail-samenvatting: wat er in zit en wat er misging, in gewone taal. */
export function summarize(entries: ManifestEntry[]): { tables: number; rows: number; failed: string[] } {
  return {
    tables: entries.filter((e) => e.file.startsWith("tables/")).length,
    rows: entries.reduce((s, e) => s + (e.rows || 0), 0),
    failed: entries.filter((e) => e.error).map((e) => `${e.file}: ${e.error}`),
  };
}
