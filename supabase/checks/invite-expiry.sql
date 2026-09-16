-- =====================================================================
-- Why does an invite created at 21:07 say it expires at 19:07?
-- =====================================================================
-- Read-only.
--
-- app/api/send-invite/route.ts sets expires_at to now + 48 hours exactly:
--
--   const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
--
-- and the invites table renders created_at and expires_at with the SAME
-- dayjs().format() call. So the two hours have to be in the DATA, not the
-- display — and two hours is exactly the Amsterdam summer offset, which is
-- the signature of one column being `timestamp` (no time zone) while the
-- other is `timestamptz`.
--
-- It matters beyond the cosmetic: app/api/accept-invite/route.ts decides
-- whether a link is still valid with
--
--   if (new Date(invitation.expires_at) < new Date())
--
-- so if the stored value lacks a zone, every invitation dies two hours early
-- in summer and one hour early in winter — and a customer who opens the link
-- on the second evening is told it has expired when it has not.
-- =====================================================================

select
  column_name,
  data_type,                       -- expect BOTH 'timestamp with time zone'
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'invitations'
  and column_name in ('created_at', 'expires_at')
order by column_name;

-- ---------------------------------------------------------------------
-- Run separately: the actual gap on the newest invitations. Expect 48:00:00.
-- ---------------------------------------------------------------------
-- select email,
--        created_at,
--        expires_at,
--        expires_at - created_at as gap
--   from public.invitations
--  order by created_at desc
--  limit 5;
