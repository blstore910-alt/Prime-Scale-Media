-- =====================================================================
-- P0: accept-invite crashed after RLS was enabled on invitations
-- =====================================================================
-- The invitations SELECT policy let the invited person read their own
-- invitation by matching email — but it did so with a subquery on
-- auth.users:
--
--     email = (select email from auth.users where id = auth.uid())
--
-- The `authenticated` role has no SELECT privilege on auth.users, so
-- once RLS was actually enabled (20260831250000) that branch could no
-- longer resolve for an invitee. The invitee's read returned nothing,
-- the accept-invite page treated the invitation as "not yours",
-- redirected to /dashboard, and a brand-new invitee (no profile yet)
-- crashed the dashboard server render → "Something went wrong".
--
-- Fix: read the email from the JWT claim instead (auth.jwt() ->> 'email'),
-- which needs no table privilege. Case-insensitive to be safe.
-- =====================================================================

set search_path = public;

drop policy if exists invitations_select_admin on public.invitations;
create policy invitations_select_admin on public.invitations
  for select using (
    _is_admin_of(tenant_id)
    or (
      email is not null
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
