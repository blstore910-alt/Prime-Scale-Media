# SeamX (Supplier 1) API — contract & adapter mapping

Source: SeamX Postman collection "Api Documentation" (v `latest`), captured
2026-09-12. SeamX is our ad-account supplier — internal only, **never**
surface the name to advertisers/affiliates. Adapter: `lib/integrations/supplier1.ts`.

## Auth & base

- **Base URL (LIVE-CONFIRMED 2026-09-12): `https://app.gradyn.io/api`**
  (SeamX = Gradyn). Endpoints resolve to `https://app.gradyn.io/api/v1/...`.
  Env vars the adapter reads: `SUPPLIER1_BASE_URL`, `SUPPLIER1_AUTH_TOKEN`,
  `SUPPLIER1_MODE=live`.
- **Auth header:** a raw token (not `Bearer`) — but the **casing is
  inconsistent and matters**:
  - `GET /v1/adaccounts` (list) accepts **only lowercase `authtoken`**;
    camelCase `authToken` there **500s** (server-side HTML crash).
  - Balance and every other endpoint use camelCase **`authToken`**.
  - The adapter's `seamxFetch` sends `authToken` by default and lowercase
    `authtoken` for the list call.
- Paths are versioned under `/v1`. Note the supplier's own spelling
  `/v1/withdrawls` (no "a").

## Endpoints

| # | Name | Method | Path | Body |
|---|------|--------|------|------|
| 1 | Get All Ad Accounts | GET | `/v1/adaccounts` | — (paginated) |
| 2 | Get Ad Account | GET | `/v1/adaccounts/{id}` | — |
| 3 | Request Ad Account | POST | `/v1/adaccounts` | see below (per platform) |
| 4 | Search Ad Accounts | GET | `/v1/adaccounts/search?q=` | — |
| 5 | Get Ad Account Topups | GET | `/v1/adaccounts/{id}/topups` | — |
| 6 | Calculate Location Fee (DST) | POST | `/v1/adaccounts/calculate-fee` | `{ad_account_id, country, amount}` |
| 7 | Get Ad Account Spend & Taxes | GET | `/v1/adaccounts/{id}/spend-taxes?start_date=&end_date=` | — |
| 8 | Get Ad Account Tax Entries | GET | `/v1/adaccounts/{id}/tax-entries?kind=&from=&to=` | — |
| 9 | Get Tax Summary | GET | `/v1/adaccounts/tax-summary?include_zero=0` | — |
| 10 | Charge Wallet | POST | `/v1/wallets/charge` | `{amount, currency, reference_number_type}` |
| 11 | Get Balance | GET | `/v1/wallets/balance` | — |
| 12 | Get All Topups | GET | `/v1/topups` | — |
| 13 | Get Topup | GET | `/v1/topups/{id}` | — |
| 14 | Request Topup | POST | `/v1/topups` | `{ad_account_id, amount, currency}` |
| 15 | Request Withdrawl | POST | `/v1/withdrawls` | `{ad_account_id, amount, destination:"wallet"}` |
| 16 | Get Withdrawl | GET | `/v1/withdrawls/{id}` | — |

### Ad account shape (1/2/4)
`{ ad_account_id, account_platform: "tiktok"|"meta"|"google", account_name,
currency, time_zone, account_status: "accepted"|"pending", fee_percentage,
countries: [], created_at, (meta only: meta_account_id, meta_bm_id) }`
plus `pagination: {page, per_page, total, total_pages}` on lists.
**There is no per-ad-account balance field, and no per-account balance
endpoint.** Balance is wallet-level only (#11).

### Request Ad Account body (3) — differs per platform
- tiktok: `{account_type:"tiktok", timezone, currency, countries:"AX,AF", tiktok_id, website_url, email, note, ad_accounts_count}`
- meta: `{account_type:"meta", timezone, currency, website_url, business_manager_id, meta_account_type, ad_accounts_count, personal_profile_link}`
- google: `{account_type:"google", timezone, currency, website_url, email, note, ad_accounts_count}`

### Get Balance (11)
`{ data: { usd_balance, eur_balance, tax_reserve:{usd,eur}, available_balance:{usd,eur} } }`

### Topup shapes
- list (12) / per-account (5): `{ id, amount, currency, status:"pending"|"approved", created_at, metadata:{ad_account_id, ad_account_name} }`
- single (13): adds `total_amount, topup_amount, topup_fee, description` — **SeamX computes the topup fee server-side.**
- request (14) response: `{ data:{id, amount, currency, status, created_at, metadata}, message }`

### Calculate Location Fee (6) — the DST module
`{ data: { ad_account_id, location_fee_percentage, country, fee_source,
topup_amount, existing_fee_percentage, existing_fee_amount,
location_fee_amount, advertising_amount_before_location_fee,
advertising_amount_after_location_fee, total_tax_amount } }`

## Mapping to `Supplier1Adapter` (only the 4 functions we already have)

| Our method | SeamX endpoint | Maps? |
|---|---|---|
| `listAdAccounts()` | GET `/v1/adaccounts` (follow `pagination`) | ✅ — but `balance_cents` is not available (drop / 0) |
| `pushTopup({external_ad_account_id, amount_cents, currency})` | POST `/v1/topups {ad_account_id, amount, currency}` | ✅ (amount is major units, not cents) |
| `pushWithdraw({external_ad_account_id, amount_cents, currency})` | POST `/v1/withdrawls {ad_account_id, amount, destination:"wallet"}` | ✅ |
| `getBalance(externalAdAccountId)` | GET `/v1/adaccounts/{id}` → `current_balance` | ✅ per-account balance DOES exist (Postman sample omitted it) |

Notes for the live implementation (when key arrives):
- SeamX amounts are **major units** (e.g. `10`, `100.44`), our adapter speaks
  `_cents` — convert at the boundary.
- SeamX returns a `topup_fee` it computed itself (#13). Decide whether our
  fee display should mirror SeamX's or stay our `topup_fee_pct` — must agree.
- Idempotency: the collection shows no idempotency header; our worker passes
  an `idempotency_key`. Confirm with SeamX whether they dedup, else we rely on
  our `integration_jobs` dedup only.
- The DST `calculate-fee` endpoint (#6) is the location-fee/tax module noted
  in the roadmap — separate from the 4 adapter methods; wire only if/when we
  build the DST feature (not now).

## Resolved / still open
- ✅ Base URL: `https://app.gradyn.io/api`. ✅ Key works (balance returns live
  data). ✅ List works with lowercase `authtoken`. ✅ Per-account balance maps.
- Open: confirm `pushTopup`/`pushWithdraw` amounts are per-currency major units
  (assumed yes) and whether Gradyn dedups repeated requests (no idempotency
  header documented — we rely on our `integration_jobs` dedup).
- Note: some accounts return `fee_percentage` 0 or 2 and `account_status`
  `deleted` — filter/skip `deleted` when syncing if needed.
