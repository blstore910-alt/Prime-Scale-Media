# Components nothing can reach

31 components in `components/` are imported by nothing. Some are old versions
superseded by the `psm-*` ports; at least one is a FEATURE that lost its UI in
a port and needs wiring back, not deleting.

This matters because it has already cost real work today. Four fixes landed in
files no route renders — the client-code-prefixed invoice number, the
first-top-up minimum, a withdrawals badge in the sidebar, and a page subtitle.
Each looked maintained. Each changed nothing for anyone.

Regenerate the list with the script at the bottom.

## Wire it back — this is a missing feature, not dead code

| file | why |
|---|---|
| ~~`withdrawals/precharge-panel.tsx`~~ | **Wired 2026-09-17.** It lives on `/wallet-topups`, under the deposit panel — it advances wallet credit against a payment that has NOT cleared and settles when that payment is verified, so the admin doing it is already looking at that queue. It was briefly put on `/withdrawals` first, which was wrong: withdrawals is money leaving the system, this is money arriving early. |
| `wallet/wallet-exchanges-table.tsx` | The wallet EXCHANGE history. Exchanges can be made (WalletExchangeDialog is live in the advertiser app) but the record of them is not shown anywhere. |
| `settings/finance/fee-defaults.tsx` | Default fee settings. No route renders it; check against `/settings/ad-account-types`, which may have replaced it. |
| `affiliate/affiliate-dashboard.tsx` | Possibly superseded by `affiliate/aff-app.tsx`. Confirm before deleting — the affiliate surface is the least-reviewed part of the app. |

## Superseded by a psm-* port — safe to delete once confirmed

`wallets/wallets-table` · `withdrawals/withdrawals-table` ·
`subscriptions/subscriptions-table` · `topups/topups-table` ·
`topups/topup-row-old` · `ad-account-requests/ad-account-requests-table` ·
`promotions/promotions-manager` · `activity-logs/activity-log-{card,row}` ·
`commissions/commission-{card,row}` · `invoices/invoice-{card,row}` ·
`account/account-{card,row}` · `invites/invite-card` ·
`affiliate/affiliate-card` · `affiliate/referral-link-box` ·
`admin/users/user-topup-dialog` · `my-affiliates/my-affiliates-table` ·
`dashboard/{fees,profit}-stats-card`

Each has a live equivalent. They are kept for now only because deleting a
screen's last copy on a live financial app deserves one look each, not a
batch.

## Navigation shells nothing uses

`app-header` · `app-sidebar` · `mobile-nav` · `nav-user-management` ·
`header`

The live admin shell is `components/admin/adm-shell.tsx`; the advertiser and
affiliate apps carry their own. `app-sidebar` in particular received a
withdrawals badge earlier today, which reached nobody.

## Already deleted

Next.js starter leftovers (`deploy-button`, `env-var-warning`, `hero`,
`auth-button`, `chart-area-interactive`, `data-table`, `section-cards`,
`nav-documents`), the two withdrawal panels copied verbatim into
`psm-withdrawals.tsx` (`refund-panel`, `adjustment-panel`), and the six
unreachable views listed in `docs/ROUTE_MAP.md`.

## Regenerate

```bash
python - <<'PY'
import io, os, re
comps=[]
for root,_,files in os.walk("components"):
    for f in files:
        if f.endswith(".tsx"): comps.append(os.path.join(root,f).replace("\\","/"))
corpus=[]
for root in ("app","components","hooks","context","lib"):
    for r,_,files in os.walk(root):
        for f in files:
            if f.endswith((".ts",".tsx")):
                p=os.path.join(r,f).replace("\\","/")
                corpus.append((p, io.open(p,encoding="utf-8").read()))
for c in sorted(comps):
    base=os.path.basename(c)[:-4]
    if "/ui/" in c: continue
    if any(p!=c and (re.search(r'from\s+"[^"]*/'+re.escape(base)+r'"',src)
                     or re.search(r'from\s+"\./'+re.escape(base)+r'"',src))
           for p,src in corpus): continue
    print(c)
PY
```

An importer is still not a route — see `docs/ROUTE_MAP.md`.
