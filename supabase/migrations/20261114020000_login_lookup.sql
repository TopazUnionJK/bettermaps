-- Anmeldung erst nach Freischaltung: Das Backend muss zu einer E-Mail-Adresse das Konto finden.
create or replace function private.user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke all on function private.user_id_by_email(text) from public, anon, authenticated;
grant execute on function private.user_id_by_email(text) to service_role;

create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql stable security invoker set search_path = '' as $$
  select private.user_id_by_email(p_email)
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
