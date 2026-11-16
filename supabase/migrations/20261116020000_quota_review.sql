-- Review: fehlende Limits sperren statt freigeben; Rückbuchung trifft den richtigen Tag.
create or replace function private.consume_quota(uid uuid, n integer)
returns table (allowed boolean, used integer, quota_limit integer, plan text, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  month_start date := date_trunc('month', (now() at time zone 'Europe/Berlin'))::date;
  p public.profiles;
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

  plan := case when p.plan in ('plus', 'pro') and (p.plan_until is null or p.plan_until > now()) then p.plan else 'free' end;
  quota_limit := coalesce(p.monthly_limit, (select s.value from private.settings s where s.key = 'monthly_limit_' || plan), 0);
  select value into glob from private.settings where key = 'daily_limit_global';
  glob := coalesce(glob, 0); -- fehlende Einstellung: lieber gar nicht als unbegrenzt

  insert into public.usage (user_id, day) values (uid, today) on conflict do nothing;
  perform 1 from public.usage u where u.user_id = uid and u.day = today for update; -- Sperre je Nutzer
  select coalesce(sum(u.google_calls), 0) into cur from public.usage u where u.user_id = uid and u.day >= month_start;
  select coalesce(sum(u.google_calls), 0) into total from public.usage u where u.day = today;

  reason := '';
  if n > 0 and cur + n > quota_limit then
    allowed := false; used := cur; reason := 'user'; return next; return;
  end if;
  if n > 0 and total + n > glob then
    allowed := false; used := cur; reason := 'global'; return next; return;
  end if;
  if n < 0 then
    -- Rückbuchung beim jüngsten Tag dieses Monats mit Abfragen (auch wenn Mitternacht dazwischen lag)
    update public.usage u set google_calls = u.google_calls - 1
      where u.user_id = uid and u.day = (select max(x.day) from public.usage x
        where x.user_id = uid and x.day >= month_start and x.google_calls > 0);
  elsif n > 0 then
    update public.usage u set google_calls = u.google_calls + n where u.user_id = uid and u.day = today;
  end if;
  select coalesce(sum(u.google_calls), 0) into used from public.usage u where u.user_id = uid and u.day >= month_start;
  allowed := true; return next;
end $$;
