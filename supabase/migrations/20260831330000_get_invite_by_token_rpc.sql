-- =====================================================================
-- P0: sign-up page crashed for a new (anonymous) invitee
-- =====================================================================
-- A brand-new invitee has no account yet, so /auth/sign-up?token=... is
-- hit ANONYMOUSLY. No RLS policy lets anon read `invitations`, so the
-- page's read returned null, and `new Date(invite.expires_at)` threw on
-- null → "Something went wrong" server crash.
--
-- The invite token IS the authorization here. Expose a SECURITY DEFINER
-- reader that returns the invitation (as jsonb, so column names don't
-- matter) plus the tenant name for a given token — callable by anon.
-- It only ever returns the single row whose token matches, so a caller
-- must already hold the token.
-- =====================================================================

set search_path = public;

create or replace function public.get_invite_by_token(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  -- invitations.token is a uuid in the live DB; compare as text so the
  -- param stays a plain string and a malformed token simply won't match
  -- (instead of erroring on an invalid uuid cast).
  select to_jsonb(i) || jsonb_build_object('tenant_name', t.name)
  from public.invitations i
  left join public.tenants t on t.id = i.tenant_id
  where i.token::text = p_token
  limit 1;
$$;

revoke all on function public.get_invite_by_token(text) from public;
grant execute on function public.get_invite_by_token(text) to anon, authenticated;
