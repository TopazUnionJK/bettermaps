-- Anmeldeanfragen: Das Supabase-Konto entsteht erst bei der Freischaltung. Bis dahin gibt es nur
-- diese Anfrage – und damit auch keinen Anmeldecode.
create table if not exists private.login_request (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  ip text,
  created_at timestamptz not null default now(),
  notify_started_at timestamptz,
  notified_at timestamptz,
  decided_at timestamptz
);
create index if not exists login_request_created on private.login_request (created_at);
alter table private.login_request enable row level security;
revoke all on private.login_request from public, anon, authenticated;

-- E-Mail-Adressen stehen in auth.users klein geschrieben; so greift der Index.
create or replace function private.user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = lower(p_email) and not is_sso_user limit 1
$$;

-- Anfrage holen oder anlegen (mit Limit pro IP und gesamt, atomar). notify = Betreiber-Mail jetzt senden.
-- Eine Mail pro Anfrage; nur wenn ein Versand abbricht, nach einer Stunde erneut.
create or replace function private.login_request_open(p_email text, p_ip text)
returns table (id uuid, status text, notify boolean)
language plpgsql security definer set search_path = '' as $$
declare r private.login_request;
begin
  perform pg_advisory_xact_lock(hashtext('bettermaps_login_request'));
  select * into r from private.login_request l where l.email = lower(p_email);
  if not found then
    if (select count(*) from private.login_request l where l.created_at > now() - interval '1 hour'
          and l.ip = p_ip) >= 3
       or (select count(*) from private.login_request l where l.created_at > now() - interval '1 hour') >= 30 then
      id := null; status := 'limited'; notify := false; return next; return;
    end if;
    insert into private.login_request (email, ip) values (lower(p_email), p_ip) returning * into r;
  end if;
  notify := r.status = 'pending' and r.notified_at is null
    and (r.notify_started_at is null or r.notify_started_at < now() - interval '1 hour');
  if notify then
    update private.login_request l set notify_started_at = now() where l.id = r.id;
  end if;
  id := r.id; status := r.status; return next;
end $$;

-- Ergebnis des Versands festhalten (ok = Mail ist raus, sonst später neuer Versuch).
create or replace function private.login_request_notified(p_id uuid, p_ok boolean)
returns void language sql security definer set search_path = '' as $$
  update private.login_request set notified_at = case when p_ok then now() end,
    notify_started_at = case when p_ok then notify_started_at end where id = p_id
$$;

create or replace function private.login_request_get(p_id uuid)
returns table (email text, status text)
language sql stable security definer set search_path = '' as $$
  select email, status from private.login_request where id = p_id
$$;

-- Status setzen; gibt nur dann true zurück, wenn er sich wirklich geändert hat (kein Doppelversand).
create or replace function private.login_request_decide(p_id uuid, p_status text)
returns boolean language sql security definer set search_path = '' as $$
  with u as (update private.login_request set status = p_status, decided_at = now()
             where id = p_id and status <> p_status returning 1)
  select exists (select 1 from u)
$$;

do $$
declare f text;
begin
  foreach f in array array['login_request_open(text, text)', 'login_request_notified(uuid, boolean)',
                           'login_request_get(uuid)', 'login_request_decide(uuid, text)', 'user_id_by_email(text)'] loop
    execute format('revoke all on function private.%s from public, anon, authenticated', f);
    execute format('grant execute on function private.%s to service_role', f);
  end loop;
end $$;

-- Öffentliche Hüllen (nur service_role) für den Aufruf über PostgREST.
create or replace function public.login_request_open(p_email text, p_ip text)
returns table (id uuid, status text, notify boolean)
language sql security invoker set search_path = '' as $$ select * from private.login_request_open(p_email, p_ip) $$;
create or replace function public.login_request_notified(p_id uuid, p_ok boolean)
returns void language sql security invoker set search_path = '' as $$ select private.login_request_notified(p_id, p_ok) $$;
create or replace function public.login_request_get(p_id uuid)
returns table (email text, status text)
language sql stable security invoker set search_path = '' as $$ select * from private.login_request_get(p_id) $$;
create or replace function public.login_request_decide(p_id uuid, p_status text)
returns boolean language sql security invoker set search_path = '' as $$ select private.login_request_decide(p_id, p_status) $$;
do $$
declare f text;
begin
  foreach f in array array['login_request_open(text, text)', 'login_request_notified(uuid, boolean)',
                           'login_request_get(uuid)', 'login_request_decide(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
