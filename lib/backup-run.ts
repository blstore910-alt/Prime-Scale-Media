// ── DE DAGELIJKSE BACKUP VAN HET HELE SYSTEEM ───────────────────────
//
// De eigenaar, 01-10: "Backup via drive + email -- hele systeem elke dag
// 1 backup zip of iets".
//
// Wat er in de zip zit:
//
//   tables/<naam>.json   elke tabel en view die PostgREST kent, alle rijen
//   auth/users.json      de logins (id, e-mail, data -- geen wachtwoorden;
//                        die heeft niemand, ook wij niet)
//   storage/<bucket>/..  de bestanden: betaalbewijzen, logo's
//   manifest.json        per bestand het aantal rijen en een sha256, plus
//                        wat er misging -- zodat een herstel kan nagaan of
//                        de zip heel is
//
// Dit VERVANGT Supabase's eigen backups niet: die zijn er ook, met
// point-in-time herstel (docs/RESTORE_DRILL.md). Dit is de kopie die
// BUITEN Supabase staat, op een plek die de eigenaar zelf beheert. Als
// het Supabase-project zelf weg is, is dit wat er over is.
//
// ── DE TABELLEN KOMEN UIT POSTGREST ZELF ─────────────────────────
//
// Geen vaste lijst: een tabel die er volgende maand bijkomt, staat er
// dan vanzelf in. De lijst komt uit de OpenAPI-beschrijving die
// PostgREST op /rest/v1/ geeft aan de service-sleutel.

import JSZip from "jszip";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Drive, driveConfig } from "@/lib/google-drive";
import { sendEmail } from "@/lib/email-sender";
import { safeErrorMessage } from "@/lib/pure-error";
import {
  backupFileName,
  backupFolderPath,
  fitsInMail,
  primaryKey,
  summarize,
  tablesFromOpenApi,
  type ManifestEntry,
} from "@/lib/pure-backup";

const PAGINA = 1000;
/** Bestanden uit storage tot deze grootte samen; de rest staat in het
 *  manifest als overgeslagen, zodat het opvalt in plaats van verdwijnt. */
const MAX_STORAGE_BYTES = 150 * 1024 * 1024;

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

async function openApi(url: string, key: string) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/openapi+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PostgREST gaf geen tabellenlijst (${res.status}).`);
  return (await res.json()) as Parameters<typeof tablesFromOpenApi>[0];
}

async function alleRijen(db: SupabaseClient, tabel: string, pk: string | null) {
  const rijen: unknown[] = [];
  for (let van = 0; ; van += PAGINA) {
    let q = db.from(tabel).select("*").range(van, van + PAGINA - 1);
    if (pk) q = q.order(pk, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rijen.push(...(data ?? []));
    if (!data || data.length < PAGINA) return rijen;
  }
}

async function bestanden(db: SupabaseClient, bucket: string, map = ""): Promise<string[]> {
  const uit: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(map, { limit: 1000, offset });
    if (error) throw new Error(error.message);
    for (const f of data ?? []) {
      const pad = map ? `${map}/${f.name}` : f.name;
      // Een map heeft geen id; een bestand wel.
      if (f.id) uit.push(pad);
      else uit.push(...(await bestanden(db, bucket, pad)));
    }
    if (!data || data.length < 1000) return uit;
  }
}

export async function ownerEmails(db: SupabaseClient): Promise<string[]> {
  const vast = (process.env.BACKUP_EMAIL_TO ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  if (vast.length) return vast;
  const { data: owners } = await db.from("tenant_owners").select("user_id");
  const ids = (owners ?? []).map((o: { user_id: string }) => o.user_id);
  if (!ids.length) return [];
  const { data: prof } = await db.from("user_profiles").select("email").in("id", ids);
  return Array.from(new Set((prof ?? []).map((p: { email: string | null }) => p.email).filter(Boolean) as string[]));
}

export async function alarm(db: SupabaseClient, detail: string) {
  try {
    const { data: tenants } = await db.from("tenants").select("id");
    for (const t of (tenants ?? []) as { id: string }[]) {
      await db.rpc("raise_integration_failure", { p_tenant_id: t.id, p_source: "backup", p_detail: detail });
    }
  } catch (e) {
    console.error("backup: alarm", safeErrorMessage(e));
  }
}

export type BackupResult = {
  ok: boolean;
  file: string;
  bytes: number;
  tables: number;
  rows: number;
  failed: string[];
  drive: { ok: boolean; link: string | null; error: string | null };
  mail: { ok: boolean; to: number; attached: boolean; error: string | null };
};

export async function runSystemBackup(
  db: SupabaseClient,
  url: string,
  key: string,
  nu: Date = new Date(),
): Promise<BackupResult> {
  const zip = new JSZip();
  const entries: ManifestEntry[] = [];

  // 1. Elke tabel
  const spec = await openApi(url, key);
  for (const t of tablesFromOpenApi(spec)) {
    const file = `tables/${t}.json`;
    try {
      const rijen = await alleRijen(db, t, primaryKey(spec, t));
      const json = JSON.stringify(rijen);
      zip.file(file, json);
      entries.push({ file, rows: rijen.length, sha256: sha(json) });
    } catch (e) {
      entries.push({ file, rows: 0, sha256: "", error: safeErrorMessage(e) });
    }
  }

  // 2. De logins
  try {
    const users: unknown[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      const lijst = data?.users ?? [];
      users.push(
        ...lijst.map((u) => ({
          id: u.id,
          email: u.email,
          phone: u.phone,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at,
          user_metadata: u.user_metadata,
          app_metadata: u.app_metadata,
        })),
      );
      if (lijst.length < 1000) break;
    }
    const json = JSON.stringify(users);
    zip.file("auth/users.json", json);
    entries.push({ file: "auth/users.json", rows: users.length, sha256: sha(json) });
  } catch (e) {
    entries.push({ file: "auth/users.json", rows: 0, sha256: "", error: safeErrorMessage(e) });
  }

  // 3. De bestanden in storage
  let opgeslagen = 0;
  try {
    const { data: buckets, error } = await db.storage.listBuckets();
    if (error) throw new Error(error.message);
    for (const b of buckets ?? []) {
      let paden: string[] = [];
      try {
        paden = await bestanden(db, b.id);
      } catch (e) {
        entries.push({ file: `storage/${b.id}/`, rows: 0, sha256: "", error: safeErrorMessage(e) });
        continue;
      }
      for (const pad of paden) {
        const file = `storage/${b.id}/${pad}`;
        if (opgeslagen > MAX_STORAGE_BYTES) {
          entries.push({ file, rows: 0, sha256: "", error: "overgeslagen: de zip is vol (150 MB aan bestanden)" });
          continue;
        }
        try {
          const { data, error: dErr } = await db.storage.from(b.id).download(pad);
          if (dErr || !data) throw new Error(dErr?.message ?? "leeg");
          const bytes = new Uint8Array(await data.arrayBuffer());
          opgeslagen += bytes.length;
          zip.file(file, bytes);
          entries.push({ file, rows: 1, sha256: sha(bytes) });
        } catch (e) {
          entries.push({ file, rows: 0, sha256: "", error: safeErrorMessage(e) });
        }
      }
    }
  } catch (e) {
    entries.push({ file: "storage/", rows: 0, sha256: "", error: safeErrorMessage(e) });
  }

  const sam = summarize(entries);
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        made_at: nu.toISOString(),
        app_version: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        tables: sam.tables,
        rows: sam.rows,
        failed: sam.failed,
        entries,
      },
      null,
      1,
    ),
  );
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const file = backupFileName(nu);

  // 4. Naar Drive
  const drive: BackupResult["drive"] = { ok: false, link: null, error: null };
  const cfg = driveConfig();
  if (!cfg.ok) drive.error = cfg.why;
  else {
    try {
      const d = await Drive.connect();
      const map = await d.path(backupFolderPath(nu), cfg.folderId);
      // Twee keer draaien op één dag geeft twee bestanden, geen overschreven.
      const naam = (await d.findFile(file, map)) ? file.replace(".zip", `-${nu.toISOString().slice(11, 16).replace(":", "")}.zip`) : file;
      const up = await d.upload(naam, "application/zip", bytes, map);
      drive.ok = true;
      drive.link = up.link;
    } catch (e) {
      drive.error = safeErrorMessage(e);
    }
  }

  // 5. De mail
  const mail: BackupResult["mail"] = { ok: false, to: 0, attached: false, error: null };
  const ok = sam.failed.length === 0 && drive.ok;
  try {
    const aan = await ownerEmails(db);
    mail.to = aan.length;
    if (!aan.length) throw new Error("geen ontvanger (BACKUP_EMAIL_TO leeg en geen eigenaar gevonden)");
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    // De zip bevat alle klantgegevens en de logins. Een bijlage ligt
    // daarna in elke mailbox en bij de mailprovider, dus alleen als de
    // eigenaar dat bewust aanzet (BACKUP_EMAIL_ATTACH=true). Standaard
    // gaat de samenvatting met de Drive-link.
    const bijlage = process.env.BACKUP_EMAIL_ATTACH === "true" && fitsInMail(bytes.length);
    const regels = [
      ok ? "De backup van vannacht is gelukt." : "De backup van vannacht is NIET helemaal gelukt.",
      "",
      `Bestand: ${file} (${mb} MB)`,
      `Tabellen: ${sam.tables}, rijen in totaal: ${sam.rows}`,
      drive.ok ? `Google Drive: ${drive.link ?? "geüpload"}` : `Google Drive: niet gelukt -- ${drive.error}`,
      bijlage
        ? "De zip zit ook als bijlage bij deze mail."
        : process.env.BACKUP_EMAIL_ATTACH === "true"
          ? "De zip is te groot voor een bijlage; hij staat op Drive."
          : "De zip staat op Drive (niet als bijlage: hij bevat alle klantgegevens).",
      ...(sam.failed.length ? ["", "Wat misging:", ...sam.failed.slice(0, 30).map((f) => `- ${f}`)] : []),
      "",
      "Herstellen: zie docs/RESTORE_DRILL.md.",
    ];
    for (const to of aan) {
      await sendEmail({
        to,
        subject: `PSM backup ${file.slice(11, 21)} -- ${ok ? "gelukt" : "LET OP"}`,
        text: regels.join("\n"),
        attachments: bijlage ? [{ filename: file, content: Buffer.from(bytes), contentType: "application/zip" }] : undefined,
      });
    }
    mail.ok = true;
    mail.attached = bijlage;
  } catch (e) {
    mail.error = safeErrorMessage(e);
  }

  if (!ok || !mail.ok) {
    await alarm(
      db,
      [
        !drive.ok ? `Drive: ${drive.error}` : null,
        sam.failed.length ? `${sam.failed.length} onderdelen misten` : null,
        !mail.ok ? `mail: ${mail.error}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 400),
    );
  }

  return { ok: ok && mail.ok, file, bytes: bytes.length, tables: sam.tables, rows: sam.rows, failed: sam.failed, drive, mail };
}
