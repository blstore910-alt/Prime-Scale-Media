// ── GOOGLE DRIVE, ZONDER EXTRA PAKKET ───────────────────────────────
//
// De eigenaar, 01-10: "Backup via drive + email -- hele systeem elke dag
// 1 backup zip" en "alle paid invoices in een maand map".
//
// Alleen fetch en node:crypto. googleapis is 90 MB aan code voor drie
// aanroepen: een token halen, een map zoeken of maken, een bestand
// uploaden.
//
// ── TWEE MANIEREN OM IN TE LOGGEN ─────────────────────────────────
//
//   1. OAuth met een refresh token (GOOGLE_OAUTH_CLIENT_ID,
//      GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN). Werkt met
//      een gewone Gmail- of Workspace-account; de bestanden staan op
//      naam van die account en tellen mee in zijn opslag. Dit is de
//      aanrader -- zie docs/BACKUP_DRIVE_SETUP.md.
//
//   2. Een service account (GOOGLE_SERVICE_ACCOUNT_JSON). Werkt ALLEEN
//      met een gedeelde Drive (Google Workspace): een service account
//      heeft sinds 2024 zelf geen opslag, dus uploaden in een gewone
//      "Mijn Drive"-map faalt met storageQuotaExceeded.
//
// GOOGLE_DRIVE_FOLDER_ID is de map waar alles onder komt.
//
// Geen sleutel verlaat deze module: een fout geeft Googles foutcode en
// een korte tekst terug, nooit een token of een header.

import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const SCOPE = "https://www.googleapis.com/auth/drive";

export type DriveConfig =
  | { ok: true; mode: "oauth" | "service"; folderId: string }
  | { ok: false; why: string };

/** Wat er ingesteld is -- zonder iets van de waarden te tonen. */
export function driveConfig(env: NodeJS.ProcessEnv = process.env): DriveConfig {
  const folderId = (env.GOOGLE_DRIVE_FOLDER_ID ?? "").trim();
  const oauth =
    !!env.GOOGLE_OAUTH_CLIENT_ID && !!env.GOOGLE_OAUTH_CLIENT_SECRET && !!env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const service = !!env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!oauth && !service)
    return { ok: false, why: "Google Drive is niet gekoppeld (geen GOOGLE_OAUTH_* en geen GOOGLE_SERVICE_ACCOUNT_JSON)." };
  if (!folderId) return { ok: false, why: "GOOGLE_DRIVE_FOLDER_ID ontbreekt." };
  return { ok: true, mode: oauth ? "oauth" : "service", folderId };
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function tokenFromServiceAccount(json: string): Promise<string> {
  let sa: { client_email?: string; private_key?: string };
  try {
    sa = JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is geen geldige JSON.");
  }
  if (!sa.client_email || !sa.private_key) throw new Error("Service account mist client_email of private_key.");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claim}`);
  const sig = b64url(signer.sign(sa.private_key));
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google gaf geen token (${res.status} ${body.error ?? ""}).`);
  return body.access_token;
}

async function tokenFromRefresh(env: NodeJS.ProcessEnv): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: String(env.GOOGLE_OAUTH_CLIENT_ID),
      client_secret: String(env.GOOGLE_OAUTH_CLIENT_SECRET),
      refresh_token: String(env.GOOGLE_OAUTH_REFRESH_TOKEN),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token)
    throw new Error(
      `Google gaf geen token (${res.status} ${body.error ?? ""}). Is de refresh token ingetrokken of verlopen?`,
    );
  return body.access_token;
}

export class Drive {
  // Geen "private token" in de constructor: node:test draait TypeScript
  // in strip-only mode, en die kent parameter properties niet.
  private token: string;
  private constructor(token: string) {
    this.token = token;
  }

  static async connect(env: NodeJS.ProcessEnv = process.env): Promise<Drive> {
    const cfg = driveConfig(env);
    if (!cfg.ok) throw new Error(cfg.why);
    const token =
      cfg.mode === "oauth"
        ? await tokenFromRefresh(env)
        : await tokenFromServiceAccount(String(env.GOOGLE_SERVICE_ACCOUNT_JSON));
    return new Drive(token);
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${this.token}` },
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 200);
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {}
      throw new Error(`Drive ${res.status}: ${msg}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** De map met deze naam onder `parentId`; gemaakt als hij er niet is. */
  async folder(name: string, parentId: string): Promise<string> {
    const q = [
      `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
      `'${parentId}' in parents`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
    ].join(" and ");
    const found = await this.call<{ files?: { id: string }[] }>(
      `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    );
    if (found.files?.[0]?.id) return found.files[0].id;
    const made = await this.call<{ id: string }>(`${API}/files?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, parents: [parentId], mimeType: "application/vnd.google-apps.folder" }),
    });
    return made.id;
  }

  /** Een pad van mappen, bv. ["Facturen", "2026", "10 Oktober"]. */
  async path(parts: string[], rootId: string): Promise<string> {
    let id = rootId;
    for (const p of parts) id = await this.folder(p, id);
    return id;
  }

  /** Bestaat er al een bestand met deze naam in de map? Dan zijn id. */
  async findFile(name: string, parentId: string): Promise<string | null> {
    const q = [`name = '${name.replace(/'/g, "\\'")}'`, `'${parentId}' in parents`, "trashed = false"].join(" and ");
    const found = await this.call<{ files?: { id: string }[] }>(
      `${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    );
    return found.files?.[0]?.id ?? null;
  }

  /** Upload in één keer (multipart). Geeft id en webViewLink terug. */
  async upload(
    name: string,
    mime: string,
    bytes: Uint8Array,
    parentId: string,
  ): Promise<{ id: string; link: string | null }> {
    const grens = `psm${Date.now().toString(36)}`;
    const meta = JSON.stringify({ name, parents: [parentId] });
    const body = Buffer.concat([
      Buffer.from(`--${grens}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
      Buffer.from(`--${grens}\r\ncontent-type: ${mime}\r\n\r\n`),
      Buffer.from(bytes),
      Buffer.from(`\r\n--${grens}--`),
    ]);
    const r = await this.call<{ id: string; webViewLink?: string }>(
      `${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
      { method: "POST", headers: { "content-type": `multipart/related; boundary=${grens}` }, body },
    );
    return { id: r.id, link: r.webViewLink ?? null };
  }
}
