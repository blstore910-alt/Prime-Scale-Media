import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  backupFileName,
  backupFolderPath,
  fitsInMail,
  invoiceFileName,
  invoiceFolderPath,
  maandMap,
  primaryKey,
  summarize,
  tablesFromOpenApi,
} from "../../lib/pure-backup";
import { driveConfig } from "../../lib/google-drive";

test("de maandmap telt vooraan, zodat Drive op volgorde zet", () => {
  assert.equal(maandMap(1), "01 Januari");
  assert.equal(maandMap(10), "10 Oktober");
  assert.equal(maandMap(12), "12 December");
});

test("de map volgt Amsterdam, niet UTC", () => {
  // 31 januari 23:30 UTC is in Amsterdam al 1 februari 00:30
  assert.deepEqual(invoiceFolderPath(new Date("2026-01-31T23:30:00Z")), ["Facturen", "2026", "02 Februari"]);
  // 31 oktober 22:30 UTC is in Amsterdam (wintertijd) 23:30, nog oktober
  assert.deepEqual(invoiceFolderPath(new Date("2026-10-31T22:30:00Z")), ["Facturen", "2026", "10 Oktober"]);
  assert.deepEqual(backupFolderPath(new Date("2026-10-01T02:00:00Z")), ["Backups", "2026", "10 Oktober"]);
  assert.equal(backupFileName(new Date("2026-10-01T02:00:00Z")), "psm-backup-2026-10-01.zip");
});

test("de factuurnaam is veilig en zegt welke klant", () => {
  assert.equal(invoiceFileName("0020-145", "PSM0020", "abcdef1234"), "0020-145 PSM0020.pdf");
  assert.equal(invoiceFileName(145, null, "abcdef1234"), "145.pdf");
  assert.equal(invoiceFileName(null, "PSM0020", "abcdef1234"), "abcdef12 PSM0020.pdf");
  assert.equal(invoiceFileName("a/b\\c", "PSM:1", "x"), "a-b-c PSM-1.pdf");
});

test("tabellen uit de OpenAPI-lijst, zonder interne kopieën", () => {
  const spec = {
    definitions: {
      wallets: { properties: { id: { description: "Note:\nThis is a Primary Key.<pk/>" }, balance: {} } },
      invoices: { properties: { id: { description: "<pk/>" } } },
      _view_backup_20260918: { properties: {} },
      audit_events_monthly_stats: { properties: { month: {} } },
    },
  };
  assert.deepEqual(tablesFromOpenApi(spec), ["audit_events_monthly_stats", "invoices", "wallets"]);
  assert.equal(primaryKey(spec, "wallets"), "id");
  assert.equal(primaryKey(spec, "audit_events_monthly_stats"), null);
});

test("een zip past in een mail tot 12 MB, en een lege nooit", () => {
  assert.equal(fitsInMail(0), false);
  assert.equal(fitsInMail(5 * 1024 * 1024), true);
  assert.equal(fitsInMail(13 * 1024 * 1024), false);
});

test("de samenvatting telt rijen en noemt wat misging", () => {
  const s = summarize([
    { file: "tables/wallets.json", rows: 14, sha256: "x" },
    { file: "tables/invoices.json", rows: 0, sha256: "", error: "timeout" },
    { file: "auth/users.json", rows: 27, sha256: "y" },
  ]);
  assert.equal(s.tables, 2);
  assert.equal(s.rows, 41);
  assert.deepEqual(s.failed, ["tables/invoices.json: timeout"]);
});

test("Drive zegt wat er ontbreekt, zonder waarden te tonen", () => {
  const leeg = driveConfig({} as NodeJS.ProcessEnv);
  assert.equal(leeg.ok, false);
  const geenMap = driveConfig({ GOOGLE_SERVICE_ACCOUNT_JSON: "{}" } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual(geenMap, { ok: false, why: "GOOGLE_DRIVE_FOLDER_ID ontbreekt." });
  const oauth = driveConfig({
    GOOGLE_OAUTH_CLIENT_ID: "a",
    GOOGLE_OAUTH_CLIENT_SECRET: "b",
    GOOGLE_OAUTH_REFRESH_TOKEN: "c",
    GOOGLE_DRIVE_FOLDER_ID: "f",
  } as unknown as NodeJS.ProcessEnv);
  assert.deepEqual(oauth, { ok: true, mode: "oauth", folderId: "f" });
  assert.ok(!JSON.stringify(oauth).includes("\"b\""));
});
