# 🏢 Multi-Tenant White Label Platform — Final Hierarchy & System Model

## 1. SUPER ADMIN (Platform Level)

✅ **Can:**

- Manage all white labels (tenants)
- Create new tenants and assign Admins
- View all tenants’ KPIs and data
- Adjust global settings, fees, limits, roles
- Access full audit logs (every action tracked)

❌ **Cannot:**

- Interact directly with tenant users (read-only)
- Approve or modify top-ups (done inside tenants)

---

## 2. TENANT (White Label Business)

Each tenant is fully separate with its own branding, data, and users.  
Inside each tenant we have: **Admin**, **Managers**, and **Users**.

### 2.1 ADMIN (Tenant Owner)

✅ **Can:**

- Full control inside their tenant only
- Dashboard with KPIs:
  - Daily Profit + Calendar view
  - Daily Spend + Calendar view
  - Filter by payment type (Top-Ups / Subscriptions / Extra Ad Accounts)
- Add / edit / remove Managers
- Add new Users (each gets unique PSM ID e.g. `PSM1456`)
- See all logs (Top-Ups, Balances, Commissions)
- View complete affiliate/referral tree
- Mark payouts as "Paid Outside" (log only)

❌ **Cannot:**

- Access other tenants
- Change global platform settings

---

### 2.2 MANAGER (Tenant Employee)

✅ **Can:**

- See all Top-Up requests submitted by Users
- Open each request, view POP (proof of payment) + description
- Manually input approved amount
- Update status (Approved / Pending / Rejected)
- View all user data inside the tenant (no edits)
- Support role: can respond to tickets or KYC checks

❌ **Cannot:**

- Add or delete Admins or Tenants
- Edit tenant settings or global configs

---

### 2.3 USER (Merged: Advertiser + Affiliate)

✅ **Can:**

- View personal dashboard:
  - Balance, Top-Up logs, Commission logs, PSM ID
- Create new Top-Up:
  - Upload POP (proof of payment)
  - Add short description
  - Submit for Manager approval
- Referral system (Affiliate module):
  - Generate personal referral link
  - Refer new Users (user → user chain)
  - Earn logged commission for referrals (no real payout)
  - See referral list + total commissions + top-up volume
- Every User automatically has:
  - Unique PSM number (e.g. `PSM1456`)
  - Access to Affiliate tab

❌ **Cannot:**

- Approve or edit top-ups
- See other users’ data
- Trigger real payouts (all handled outside system)

---

## 3. AFFILIATE SYSTEM (GLOBAL MODULE)

- Visible for every role (Admin, Manager, User)
- Logs referrals, commissions, and referral trees
- No real payments — only logs for visibility
- Payouts are marked manually as “Paid Outside”
- Users can invite both Advertisers and Affiliates (same type of user)
- Affiliate tree supports multi-level view if needed (Tier 1 / Tier 2)

---

## 4. SYSTEM LOGIC

- Entire platform functions as a logbook (tracking & reporting only)
- No real transactions or payouts occur inside the app
- All balances, top-ups, commissions are manually logged by Managers/Admins
- Real actions (payments, payouts, invoices) happen outside

---

## 5. FLOW EXAMPLE

1️⃣ Admin adds new User → system auto-generates PSM number  
2️⃣ User uploads POP + description → Top-Up request created  
3️⃣ Manager reviews → inputs approved amount → status updated  
4️⃣ Admin dashboard auto-updates KPIs (spend, profit, volume)  
5️⃣ User can invite new users via referral link → system logs commissions

---

## 6. DATA & SECURITY

- Each tenant fully isolated (no data cross-access)
- Super Admin has read-only overview of all tenants
- All actions (top-up approval, edits, status change, role change) logged in audit log
- MFA and session limits required for Admin & Super Admin logins
