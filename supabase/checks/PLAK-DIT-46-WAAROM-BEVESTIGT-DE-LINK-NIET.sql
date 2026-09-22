-- =====================================================================
-- PLAK 46 — waarom bevestigt de aanmeldlink niet? (ALLEEN LEZEN)
-- =====================================================================
-- De eigenaar meldde zich om 13:57 aan via de link van PSM0005, klikte
-- rond 14:20 op "Confirm your mail" en kwam op /auth/confirm ZONDER code
-- uit; inloggen zegt "Email not confirmed". Dus Supabase heeft de klik
-- niet als bevestiging geboekt. Dit leest wat Supabase zelf weet over de
-- aanmeldingen van vandaag -- geen aannames. Er wordt niets veranderd.
--
-- Tijden in Nederlandse tijd.
-- =====================================================================

create temporary table if not exists _p46 (nr int, item text, v text);
delete from _p46;

insert into _p46
select 1, 'aanmeldingen vandaag (auth.users)',
  coalesce(string_agg(format('%s | aangemaakt %s | BEVESTIGD %s | mail verstuurd %s | laatst ingelogd %s | t=%s ref=%s',
      u.email,
      to_char(u.created_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'),
      coalesce(to_char(u.email_confirmed_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'), 'NEE'),
      coalesce(to_char(u.confirmation_sent_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'), '-'),
      coalesce(to_char(u.last_sign_in_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'), '-'),
      coalesce(u.raw_user_meta_data->>'tenant_slug', '-'),
      coalesce(u.raw_user_meta_data->>'referral_code', '-')), E'\n' order by u.created_at), 'geen')
  from auth.users u
 where u.created_at > now() - interval '12 hours';

-- De PKCE-stap: bij aanmelden legt Supabase een flow_state vast; bij een
-- geslaagde klik geeft het een auth_code uit.
do $blk0$
begin
  insert into _p46
  select 2, 'PKCE flow_state van die aanmeldingen',
    coalesce(string_agg(format('%s | methode %s | aangemaakt %s | code uitgegeven %s',
        u.email, f.authentication_method,
        to_char(f.created_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'),
        coalesce(to_char(f.auth_code_issued_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'), 'NEE')), E'\n'), 'geen')
    from auth.flow_state f
    join auth.users u on u.id = f.user_id
   where u.created_at > now() - interval '12 hours';
exception when others then
  insert into _p46 values (2, 'PKCE flow_state', 'niet leesbaar: ' || sqlerrm);
end;
$blk0$;

-- Staat de bevestigingstoken nog open (= nooit gebruikt)?
do $blk1$
begin
  insert into _p46
  select 3, 'open tokens (niet gebruikt)',
    coalesce(string_agg(format('%s | %s | aangemaakt %s | begint met pkce_: %s',
        u.email, t.token_type,
        to_char(t.created_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'),
        case when t.token_hash like 'pkce_%' then 'ja' else 'nee' end), E'\n'), 'geen')
    from auth.one_time_tokens t
    join auth.users u on u.id = t.user_id
   where u.created_at > now() - interval '12 hours';
exception when others then
  insert into _p46 values (3, 'open tokens', 'niet leesbaar: ' || sqlerrm);
end;
$blk1$;

-- Wat Supabase zelf logde rond die aanmeldingen.
do $blk2$
begin
  insert into _p46
  select 4, 'auth-logboek (laatste 12 uur, die adressen)',
    coalesce(string_agg(format('%s | %s | %s',
        to_char(a.created_at at time zone 'Europe/Amsterdam', 'HH24:MI:SS'),
        a.payload->>'action', coalesce(a.payload->>'actor_username', '-')), E'\n' order by a.created_at), 'geen')
    from auth.audit_log_entries a
   where a.created_at > now() - interval '12 hours'
     and a.payload->>'actor_username' in (select email from auth.users where created_at > now() - interval '12 hours');
exception when others then
  insert into _p46 values (4, 'auth-logboek', 'niet leesbaar: ' || sqlerrm);
end;
$blk2$;

select nr, item, v as antwoord from _p46 order by nr;
