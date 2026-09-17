# Team accounts — several people on one advertiser, and on one affiliate

Requested 2026-09-17: an advertiser should be able to put colleagues on
their account, with fewer rights, and optionally scoped to some of their ad
accounts. Extended the same day: **affiliates too.** Same shape as the competitor screen the request came with:
Members / Invitations, a Role column, a Status column, an "Ad accounts"
column reading "All accounts" or a subset, and an Invite member button.

**Not started.** This note exists so it is designed before it is built,
because the dangerous part is not the UI.

## Why this is not a screen

Today "an advertiser" and "a user" are the same row. Every advertiser-facing
policy resolves ownership the same way:

```sql
exists (select 1 from advertisers a
         where a.id = <table>.advertiser_id and a.user_id = auth.uid())
```

`advertisers.user_id` is the one link. Adding a second person to an
advertiser means that test is wrong on **every advertiser-readable table** —
wallets, wallet_topups, top_ups, ad_accounts, ad_account_requests,
ad_account_withdrawals, invoices, subscriptions, referral_links,
referral_commissions, notifications, companies. Miss one and a colleague
either cannot see their own company's data, or worse, the membership test is
written loosely and one advertiser reads another's.

## Affiliates need the same thing, and it is the same work

An affiliate is the same shape of problem with a different table: every
affiliate-facing policy resolves ownership through `referral_links` and
`affiliates` against `auth.uid()`. So the design below is written twice, once
per subject, and the membership helper takes the subject id whichever table
it comes from:

```sql
create table subject_members (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null check (subject_kind in ('advertiser','affiliate')),
  subject_id   uuid not null,
  tenant_id    uuid not null references tenants(id),
  user_id      uuid not null references auth.users(id),
  role         text not null check (role in ('owner','manager','viewer')),
  created_at   timestamptz not null default now(),
  unique (subject_kind, subject_id, user_id)
);
```

One table, one helper, two subjects — rather than two parallel sets of
tables that drift. The roles differ in what they gate: for an affiliate
there is no wallet and no withdrawal, so `manager` is "see referrals and
earnings, cannot change payout details" and `viewer` is read-only.

The per-ad-account scoping has no affiliate equivalent; an affiliate's
equivalent narrowing would be per referral link, which nobody has asked for
and should not be built on speculation.

## Shape

```sql
create table advertiser_members (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references advertisers(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','manager','viewer')),
  -- NULL = every ad account. A row per account otherwise.
  created_at timestamptz not null default now(),
  unique (advertiser_id, user_id)
);

create table advertiser_member_accounts (
  member_id uuid not null references advertiser_members(id) on delete cascade,
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  primary key (member_id, ad_account_id)
);
```

One SECURITY DEFINER helper replaces the ownership test everywhere:

```sql
create or replace function _member_of_advertiser(p_advertiser uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from advertiser_members m
     where m.advertiser_id = p_advertiser and m.user_id = auth.uid()
  );
$$;
```

Then every advertiser policy becomes `_member_of_advertiser(advertiser_id)`,
and the existing `advertisers.user_id` owner keeps working because a backfill
inserts one `owner` member row per advertiser.

Roles, minimum viable:

| role | can |
|---|---|
| owner | everything the advertiser can do today, incl. inviting and removing members and requesting withdrawals |
| manager | request ad accounts, request top-ups, see invoices — but NOT withdrawals, NOT member management, NOT company/billing details |
| viewer | read only: balances, accounts, spend |

Ad-account scoping applies on top and only narrows: a viewer scoped to two
accounts sees those two.

## Order of work

1. Tables + the helper + the backfill, with the old `user_id` test left in
   place alongside (`or a.user_id = auth.uid()`), so nothing breaks while the
   policies are migrated one at a time.
2. Rewrite each advertiser policy to the helper. **One table per migration**,
   each verified against live before the next.
3. Invitations: reuse `invitations`, adding `advertiser_id` and `member_role`
   so the accept path creates a member row instead of an advertiser.
4. Server actions for invite / change role / remove / scope, all
   owner-gated on the advertiser, all column-allowlisted.
5. The screen, last.
6. Role enforcement in the ACTIONS too, not only in RLS — a manager must be
   refused a withdrawal by the server action, with a reason, not by an empty
   result set.

## Cost and risk

Roughly 12 tables of policy work plus the invite flow and the UI. The risk
is not the feature, it is step 2: every policy rewritten on a live database
holding real balances, where a mistake is either a lockout or a leak. It
wants its own session with nothing else in it, and each policy verified
against live before the next one is touched — the same way the
`user_profiles` UPDATE policy turned out to be missing entirely on 2026-09-17
while the repo migration said otherwise.

Related: `docs/ROUTE_MAP.md`, `supabase/checks/user-profiles-update-policy.sql`.
