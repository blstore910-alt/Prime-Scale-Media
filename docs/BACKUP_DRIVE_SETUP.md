# Backups naar Google Drive — eenmalig koppelen

Twee nachtelijke taken staan klaar in de code en draaien vanzelf zodra
Drive gekoppeld is:

| tijd (UTC) | taak | wat |
|---|---|---|
| 01:30 | `/api/cron/system-backup` | het hele systeem als één zip: elke tabel, de logins, de bestanden (betaalbewijzen), plus `manifest.json` met per bestand rijen en sha256 |
| 02:00 | `/api/cron/invoice-drive` | elke **betaalde** factuur als pdf in `Facturen/<jaar>/<maand>/`, bv. `Facturen/2026/10 Oktober/0020-145 PSM0020.pdf` |

Zonder koppeling doen ze niets kapot: de factuurtaak zegt "niet
gekoppeld" en stopt, en de systeem-backup mailt je dat Drive ontbreekt
(en zet een melding bij de admin-alerts).

Op Drive ziet het er zo uit:

```
PSM (de map die jij kiest)
├── Backups
│   └── 2026
│       └── 10 Oktober
│           ├── psm-backup-2026-10-01.zip
│           └── psm-backup-2026-10-02.zip
└── Facturen
    └── 2026
        ├── 09 September
        └── 10 Oktober
            └── 0020-145 PSM0020.pdf
```

Het nummer staat voor de maand, zodat Drive de maanden op volgorde zet.
De maand is die van de **betaling**, in Amsterdamse tijd.

---

## Stap 1 — een map op Drive

1. Maak in je Google Drive een map, bv. `PSM`.
2. Open hem. De URL eindigt op `.../folders/<MAP-ID>`. Dat stuk is
   `GOOGLE_DRIVE_FOLDER_ID`.

## Stap 2 — toegang voor de app (OAuth, de aanrader)

Werkt met een gewone Gmail en met Workspace. De bestanden staan op jouw
naam en tellen mee in jouw opslag.

1. <https://console.cloud.google.com> → nieuw project, bv. `psm-backup`.
2. **APIs & Services → Library** → zoek **Google Drive API** → Enable.
3. **APIs & Services → OAuth consent screen** → External (of Internal bij
   Workspace) → vul naam en je e-mail in → bij *Test users* je eigen
   adres toevoegen → **Publish app** (anders verloopt de toegang na 7
   dagen).
4. **Credentials → Create credentials → OAuth client ID** → type *Web
   application* → bij *Authorized redirect URIs*:
   `https://developers.google.com/oauthplayground` → Create. Je krijgt
   een **Client ID** en een **Client secret**.
5. Ga naar <https://developers.google.com/oauthplayground>:
   - tandwiel rechtsboven → *Use your own OAuth credentials* → plak het
     Client ID en het secret;
   - links bij *Step 1* typ je `https://www.googleapis.com/auth/drive`
     → *Authorize APIs* → log in met de Google-account van stap 1;
   - *Step 2* → **Exchange authorization code for tokens** → kopieer de
     **Refresh token**.

## Stap 3 — in Vercel zetten

Vercel → project → **Settings → Environment Variables** → Production:

| naam | waarde |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | uit stap 2.4 |
| `GOOGLE_OAUTH_CLIENT_SECRET` | uit stap 2.4 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | uit stap 2.5 |
| `GOOGLE_DRIVE_FOLDER_ID` | uit stap 1 |
| `BACKUP_EMAIL_TO` | *optioneel* — wie de mail krijgt, komma's ertussen. Leeg = alle eigenaren |
| `BACKUP_EMAIL_ATTACH` | *optioneel* — `true` zet de zip óók als bijlage in de mail (tot 12 MB). Standaard uit: de zip bevat alle klantgegevens en logins, en een bijlage ligt daarna in elke mailbox |

Daarna **Redeploy** (env-variabelen gelden pas na een nieuwe deploy).

Plak deze waarden nergens anders in: niet in een chat, niet in een
issue, niet in de code. Alleen in Vercel.

## Stap 4 — meteen proberen in plaats van tot vannacht wachten

Vercel → project → **Settings → Cron Jobs** → bij
`/api/cron/system-backup` op **Run** drukken. Binnen een minuut:

- staat `Backups/2026/10 Oktober/psm-backup-2026-10-01.zip` in je map;
- krijg je een mail "PSM backup 2026-10-01 -- gelukt".

Daarna `/api/cron/invoice-drive` op **Run**: de eerste keer zet hij de
achterstand neer (een paar seconden per factuur; wat niet in vijf
minuten past, volgt de nacht erna).

## Alternatief — service account (alleen met Google Workspace)

Zet `GOOGLE_SERVICE_ACCOUNT_JSON` (de hele JSON) in plaats van de drie
OAuth-variabelen, en gebruik als map een map in een **gedeelde Drive**
waar het service account lid van is. In een gewone "Mijn Drive" faalt
dit: een service account heeft sinds 2024 zelf geen opslag
(`storageQuotaExceeded`).

## Als het misgaat

- De mail zegt per onderdeel wat er misging, en er komt een melding bij
  de admin-alerts (bron `backup`).
- `Drive 401` / "geen token": de refresh token is ingetrokken of de
  consent-app staat nog in *Testing* (verloopt na 7 dagen) → stap 2.3
  *Publish app*, stap 2.5 opnieuw, stap 3 bijwerken.
- `Drive 404` op de map: verkeerde `GOOGLE_DRIVE_FOLDER_ID`, of de
  account van de token heeft geen toegang tot die map.
- Een zip controleren: `npm run backup:verify -- <pad-naar-zip>` — zie
  `docs/RESTORE_DRILL.md`.
