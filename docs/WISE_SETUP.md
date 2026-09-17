# Turning the Wise deposit feed on

**Current state, read off production on 2026-09-17:** no webhook is
configured, so every delivery Wise attempts is answered `401` and no deposit
can arrive. 229 deposits are in the table, none carry a reference, and the
newest was received on 12 September. Wise retries a failing endpoint for a
while and then stops — which is why this looks like "nothing has come in"
rather than an error.

The status line at the top of the Bank deposits panel on `/wallet-topups`
says which of the three pieces are in place. It reads the environment, never
a token's value.

## 1. Let deliveries in — pick ONE

Both routes hand off to the same processor. Either is enough.

**Shared secret (simpler).** Wise refuses query parameters on a delivery
URL, so the secret is a path segment.

```
WISE_WEBHOOK_SECRET=<a long random string you generate>
```

Delivery URL to give Wise:

```
https://app.primescalemedia.com/api/webhooks/wise/<that same string>
```

`GET` on that URL answers `{"ok":true,"endpoint":"wise-webhook"}` when the
secret matches and `404` when it does not — so you can check it from a
browser without sending anything. The 404 is deliberate: a wrong guess must
not reveal that the path exists.

**RSA signature (what Wise documents).**

```
WISE_PUBLIC_KEY=<Wise's public key, PEM, including the BEGIN/END lines>
```

Delivery URL:

```
https://app.primescalemedia.com/api/webhooks/wise
```

## 2. Let the reference be read

```
WISE_API_TOKEN=<read-scoped personal token>
```

The `balances#credit` payload usually carries only amount, currency, a
balance id and a timestamp — **not** the reference the customer typed. With
this token the processor fetches the balance statement for a ±36h window
around the credit and takes the reference and sender off the matching line.
Without it every deposit reads "no reference" and every match has to be made
by hand, which is exactly what the 229 rows look like now.

Read scope is enough. Nothing in the app writes to Wise.

## 3. Leave this one alone

```
WISE_AUTO_SETTLE=      # empty / false
```

False means a matched deposit is recorded as a SUGGESTION and an admin
confirms it before a wallet is credited. That is the safe-start behaviour and
the status line shows "Manual confirm" while it holds.

## Checking it worked

1. `/wallet-topups` — the status line should read **Webhook on**,
   **References readable**, **Manual confirm**.
2. Send a small transfer with a reference of the shape `<client digits>-<topup
   reference>`, e.g. `0005-4839`. The matcher understands that shape
   deliberately: `lib/payment-reference.ts` takes the half AFTER the dash,
   because the longest-digit-run rule would otherwise read the six-digit
   client code as the reference and send every prefixed payment to manual
   review.
3. The deposit appears in the panel with its reference and sender, and — if a
   pending top-up matches on amount and currency — a suggestion to confirm.
4. "last received" in the status line is the honest liveness signal. If it
   stops moving, deliveries are failing again.

## Why not the poller

`WISE_MODE` governs an incoming-transfers *poller* that is not wired up;
`testWiseConnection()` on `/settings/integrations` exercises that adapter and
therefore says nothing about whether real money is arriving. The webhook is
the live path. `wiseIngestStatus()` reports on the webhook.

## Strict Customer Authentication (SCA) — why references were empty

Wise puts SCA in front of **statement reads** on this account. Probed on
2026-09-17: `profiles HTTP 200 (2)`, `statement HTTP 422`, and an
`x-2fa-approval` header on the response. A plain `Authorization: Bearer`
request can never get past that, which is why 231 deposits arrived with no
reference, no sender and no description — the webhook payload is thin and
the statement lookup that was meant to fill the gap was being refused.

It is passable, and the app already does its half.

1. **Make a key pair** (any machine, once):

   ```bash
   openssl genrsa -out wise-private.pem 2048
   openssl rsa -in wise-private.pem -pubout -out wise-public.pem
   ```

2. **Register the public half with Wise**: log in, Settings → API tokens →
   *Manage public keys* → upload `wise-public.pem`. It attaches to the
   account, not to one token.

3. **Put the private half in Vercel** as `WISE_API_PRIVATE_KEY` — the whole
   PEM including the `-----BEGIN PRIVATE KEY-----` lines. Vercel accepts a
   multi-line value; if your paste collapses the newlines into `
`, that
   is handled too. Redeploy.

4. Press **Fetch details from Wise** on /wallet-topups. The app sends the
   request, Wise answers with a challenge, the app signs the challenge with
   the private key and repeats the request. The toast reports which of
   those steps worked: `SCA asked · signed`, `no signing key`, or `key
   unusable`.

**Keep the private key private.** It is the second factor for reads on a
real bank account. It lives only in Vercel's environment; nothing logs it,
and the probe never returns it.

**If you would rather not**: nothing breaks. Deposits still arrive, the
match still works whenever a payer includes the reference in a way the
webhook payload carries, and everything else is matched by hand — which is
the safest path anyway, since an amount alone is never accepted as proof of
whose money it is.
