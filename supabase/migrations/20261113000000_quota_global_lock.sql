-- Review-Punkt 9: globales Tageslimit gegen parallele Abfragen verschiedener Nutzer absichern.
-- Gleiche Logik wie bisher, zusätzlich eine Sperre pro Tag am Anfang.
-- n < 0 bucht zurück (fehlgeschlagene Google-Abfrage); nur service_role darf aufrufen.
create or replace function private.consume_quota(uid uuid, n integer)
returns table (allowed boolean, used integer, daily_limit integer, plan text)
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  p public.profiles;
  lim integer;
  glob integer;
  cur integer;
  total integer;
begin
  if n > 0 then
    perform pg_advisory_xact_lock(hashtext('bettermaps_quota_' || today::text));
  end if;
  select * into p from public.profiles where id = uid;
  if not found then
    insert into public.profiles (id) values (uid) on conflict do nothing;
    select * into p from public.profiles where id = uid;
  end if;
  if p.plan = 'pro' and (p.pro_until is null or p.pro_until > now()) then
    select value into lim from private.settings where key = 'daily_limit_pro';
    plan := 'pro';
  else
    select value into lim from private.settings where key = 'daily_limit_free';
    plan := 'free';
  end if;
  select value into glob from private.settings where key = 'daily_limit_global';

  insert into public.usage (user_id, day) values (uid, today) on conflict do nothing;
  select u.google_calls into cur from public.usage u where u.user_id = uid and u.day = today for update;
  select coalesce(sum(u.google_calls), 0) into total from public.usage u where u.day = today;

  daily_limit := lim;
  if n > 0 and (cur + n > lim or total + n > glob) then
    allowed := false; used := cur; return next; return;
  end if;
  update public.usage u set google_calls = greatest(0, u.google_calls + n) where u.user_id = uid and u.day = today;
  allowed := true; used := greatest(0, cur + n); return next;
end $$;
revoke all on function private.consume_quota(uuid, integer) from public, anon, authenticated;
grant execute on function private.consume_quota(uuid, integer) to service_role;
