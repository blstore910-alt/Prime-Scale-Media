# Do this first, next session

Work that is understood, scoped and ready to execute — parked only because
something more urgent was in front of it. Start here rather than re-deriving
it.

---

## 1. The silent-write sweep (18 sites left) — START HERE

**Why this is first:** it is the bug class that cost the most time to find,
because it does not look like a bug. The screen says it worked.

An UPDATE that matches **no rows** is not an error in PostgREST. It returns
`{ error: null, data: null }`. So this — the shape used in almost every
action in this repo —

```ts
const { error } = await supabase.from("t").update({ … }).eq("id", id);
if (error) return { ok: false, error: error.message };
return { ok: true, data: null };
```

reports **success for a write that never happened**. RLS refusing the write
looks exactly like this. So does a row another admin moved or deleted, and so
does an `id` that no longer matches. The UI then shows a success toast,
invalidates its query, refetches, and renders the old value.

That is how `updateUserProfile` shipped: deactivating an advertiser said
"User has been deactivated successfully" and the menu item said "Deactivate
User" again, every time. Found only because a human noticed the button never
changed.

**The fix**, per site:

```ts
const { data: rows, error } = await supabase
  .from("t").update({ … }).eq("id", id)
  .select("id");                       // ← ask for the rows back
if (error) return { ok: false, error: error.message };
const wrote = wroteSomething(rows);    // ← actions/_shared.ts
if (!wrote.ok) return wrote;
```

`wroteSomething()` already exists in `actions/_shared.ts`.

**Already done** (do not redo): `updateUserProfile`, `setSubscriptionStatus`, and
all four in `company-actions.ts` — those are customer-facing, so a saved
company or billing address that silently did not save is the customer's
problem, not only the desk's.

### Remaining

| site | function | table | note |
|---|---|---|---|
| `actions/ad-account-actions.ts:277` | `updateAdAccountAsAdmin()` | `ad_accounts` | single row |
| `actions/ad-account-actions.ts:338` | `rejectAdAccountRequest()` | `ad_account_requests` | single row |
| `actions/ad-account-actions.ts:395` | `setAdAccountRequestStatus()` | `ad_account_requests` | single row |
| `actions/ad-account-actions.ts:442` | `createAdAccountFromRequest()` | `ad_account_requests` | single row |
| `actions/ad-account-type-actions.ts:178` | `upsertAdAccountType()` | `ad_account_types` | single row |
| `actions/admin-actions.ts:136` | `toggleAdminStatus()` | `user_profiles` | single row |
| `actions/admin-actions.ts:159` | `toggleAdminStatus()` | `user_profiles` | single row |
| `actions/admin-actions.ts:340` | `updateAffiliate()` | `affiliates` | single row |
| `actions/admin-actions.ts:376` | `approveAffiliate()` | `affiliates` | single row |
| `actions/admin-actions.ts:418` | `rejectAffiliate()` | `affiliates` | single row |
| `actions/admin-actions.ts:495` | `setAffiliateCommission()` | `affiliates` | single row |
| `actions/admin-actions.ts:566` | `updateAdvertiser()` | `advertisers` | single row |
| `actions/admin-actions.ts:646` | `setAdvertiserCommission()` | `advertisers` | single row |
| `actions/bank-account-actions.ts:167` | `upsertBankAccount()` | `bank_accounts` | single row |
| `actions/invite-actions.ts:91` | `cancelInvitation()` | `invitations` | single row |
| `actions/supplier-pool-actions.ts:328` | `assignSupplierAdAccount()` | `supplier_ad_accounts` | single row |
| `actions/supplier-pool-actions.ts:344` | `assignSupplierAdAccount()` | `supplier_ad_accounts` | single row |
| `actions/tenant-actions.ts:149` | `createTenantForCurrentUser()` | `user_profiles` | single row |

**The money and legal ones are done** — `invoice-actions`, `referral-actions`,
`exchange-rate-actions`, `topup-actions` and `gdpr-actions` all count their
rows now. What is left is admin CRUD: a stale label rather than a wrong
number, which is why it is second.

**Judge each one, do not run a regex over the file.** A few updates in this
repo are legitimately allowed to match nothing — bulk deactivations filtered
with `.in(...)`, and anything written as "set this if it isn't already". Those
want a comment saying so, not a guard.

**Re-run the detector afterwards:**

```bash
python - <<'PY'
import io,os,re
for root,_,files in os.walk("actions"):
    for f in sorted(files):
        if not f.endswith(".ts"): continue
        p=os.path.join(root,f).replace("\\","/")
        s=io.open(p,encoding="utf-8").read()
        for m in re.finditer(r'\.from\("([a-z_]+)"\)\s*\n?\s*\.update\(', s):
            if ".select(" in s[m.start():m.start()+430]: continue
            print(f"{p}:{s[:m.start()].count(chr(10))+1}  {m.group(1)}")
PY
```

---

## 2. Verify on the live database

Two read-only checks written but never run. Paste into the Supabase SQL
editor (one statement at a time — the editor only shows the last result).

- `supabase/checks/zero-amount-topups.sql` — did the broken bulk dialog
  actually write any $0 rows before it was fixed? A `pending` one can simply
  be corrected; a `verified` one means an ad account was credited nothing
  while the advertiser was charged, and needs a wallet adjustment.
- `supabase/checks/integration-jobs-insert.sql` — can `enqueue.ts` insert at
  all? It uses the CALLER's RLS-bound client, so if `integration_jobs` has RLS
  on with no INSERT policy, auto-push can never queue anything and simply goes
  quiet. Worth knowing before pushing one top-up live, not after.
- `supabase/checks/invite-expiry.sql` — an invite created 21:07 displayed an
  expiry of 19:07. Two hours is exactly the Amsterdam summer offset, which is
  the signature of one column being `timestamp` and the other `timestamptz`.
  `accept-invite` decides validity by comparing those, so a zone-less value
  kills every invitation two hours early in summer.

---

## 3. Still open from Wave 3/4

- An existing user can never accept an **affiliate** invite: a trigger rejects
  `role='affiliate'` *after* the invitation has already been consumed, so the
  link is burned and the account is not created. Live-schema dependent — the
  affiliate leg of J1 settles it.
- `subscription_waiver` perk rolls the period forward, but the same cron run
  still auto-debits the invoice already issued for that period
  (`supabase/migrations/20260901400000_advertiser_perks.sql:426`).
- Never answered: is the **−€270,85 DST reserve** normal or new?
- Deferred: an `advertiser_topup_totals` view. The admin advertiser list
  embeds every advertiser's whole `wallet_topups` collection to sum it in the
  browser.

---

## 4. Definition of done for the sweeps

Two consecutive waves with no surviving finding above medium. Not yet reached:
every wave so far has found real faults in the same day's work, including in
the fixes themselves.
