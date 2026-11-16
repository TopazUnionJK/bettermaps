-- Review: zusätzlich je IP begrenzen (30 Code-Mails pro Stunde), damit niemand gezielt viele Konten
-- zumüllt, und fehlgeschlagene Versuche wieder austragen. Die IP wird nur gehasht gespeichert
-- und nach einem Tag gelöscht.
alter table private.code_mail add column if not exists id bigserial;
alter table private.code_mail add column if not exists ip_hash text not null default '';
create index if not exists code_mail_ip_at on private.code_mail (ip_hash, at);

drop function if exists public.code_mail_allowed(uuid);
drop function if exists private.code_mail_allowed(uuid);

-- Liefert die ID des Eintrags (zum Austragen bei Fehlern) oder null, wenn das Limit erreicht ist.
create or replace function private.code_mail_allowed(p_uid uuid, p_ip text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  h text := case when coalesce(p_ip, '') = '' then '' else encode(sha256(convert_to('code_mail|' || p_ip, 'UTF8')), 'hex') end;
  new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('bettermaps_code_mail_' || p_uid::text));
  if h <> '' then perform pg_advisory_xact_lock(hashtext('bettermaps_code_mail_ip_' || h)); end if;
  delete from private.code_mail where at < now() - interval '1 day';
  if exists (select 1 from private.code_mail where user_id = p_uid and at > now() - interval '60 seconds')
     or (select count(*) from private.code_mail where user_id = p_uid and at > now() - interval '1 hour') >= 6
     or (h <> '' and (select count(*) from private.code_mail where ip_hash = h and at > now() - interval '1 hour') >= 30) then
    return null;
  end if;
  insert into private.code_mail (user_id, ip_hash) values (p_uid, h) returning id into new_id;
  return new_id;
end $$;

create or replace function private.code_mail_undo(p_id bigint)
returns void language sql security definer set search_path = '' as $$
  delete from private.code_mail where id = p_id $$;

create or replace function public.code_mail_allowed(p_uid uuid, p_ip text)
returns bigint language sql security invoker set search_path = '' as $$ select private.code_mail_allowed(p_uid, p_ip) $$;
create or replace function public.code_mail_undo(p_id bigint)
returns void language sql security invoker set search_path = '' as $$ select private.code_mail_undo(p_id) $$;

revoke all on function private.code_mail_allowed(uuid, text) from public, anon, authenticated;
revoke all on function private.code_mail_undo(bigint) from public, anon, authenticated;
revoke all on function public.code_mail_allowed(uuid, text) from public, anon, authenticated;
revoke all on function public.code_mail_undo(bigint) from public, anon, authenticated;
grant execute on function private.code_mail_allowed(uuid, text) to service_role;
grant execute on function private.code_mail_undo(bigint) to service_role;
grant execute on function public.code_mail_allowed(uuid, text) to service_role;
grant execute on function public.code_mail_undo(bigint) to service_role;
