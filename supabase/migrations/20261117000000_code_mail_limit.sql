-- Anmeldecodes verschickt jetzt das Backend selbst (eigene Vorlage, eigenes SMTP).
-- Damit niemand über /login Mails an fremde Adressen auslösen kann, gilt je Konto:
-- höchstens eine Mail pro 60 Sekunden und 6 pro Stunde.
create table if not exists private.code_mail (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists code_mail_user_at on private.code_mail (user_id, at);
alter table private.code_mail enable row level security;
revoke all on private.code_mail from public, anon, authenticated;

create or replace function private.code_mail_allowed(p_uid uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('bettermaps_code_mail_' || p_uid::text));
  delete from private.code_mail where at < now() - interval '1 day';
  if exists (select 1 from private.code_mail where user_id = p_uid and at > now() - interval '60 seconds')
     or (select count(*) from private.code_mail where user_id = p_uid and at > now() - interval '1 hour') >= 6 then
    return false;
  end if;
  insert into private.code_mail (user_id) values (p_uid);
  return true;
end $$;
revoke all on function private.code_mail_allowed(uuid) from public, anon, authenticated;
grant execute on function private.code_mail_allowed(uuid) to service_role;

create or replace function public.code_mail_allowed(p_uid uuid)
returns boolean language sql security invoker set search_path = '' as $$ select private.code_mail_allowed(p_uid) $$;
revoke all on function public.code_mail_allowed(uuid) from public, anon, authenticated;
grant execute on function public.code_mail_allowed(uuid) to service_role;
