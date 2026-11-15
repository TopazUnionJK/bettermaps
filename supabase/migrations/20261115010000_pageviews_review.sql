-- Review der Statistik: kein sekundengenauer Zeitpunkt, günstige Zähler gegen Spam,
-- tägliche Löschung per pg_cron und eine Auswertung, die jede Tabelle nur einmal liest.
alter table private.pageview drop column if exists at;
create index if not exists pageview_day_visitor on private.pageview (day, visitor);
create index if not exists usage_day on public.usage (day);

-- Tageszähler (gesamt, je IP, je Besucher). Schlüssel sind Hashes mit dem Tagesgeheimnis
-- und werden mit ihm zusammen täglich gelöscht.
create table if not exists private.pageview_counter (
  day date not null,
  key text not null,
  n integer not null default 0,
  primary key (day, key)
);
alter table private.pageview_counter enable row level security;
revoke all on private.pageview_counter from public, anon, authenticated;

create or replace function private.pageview_cleanup()
returns void
language sql security definer set search_path = '' as $$
  delete from private.pageview_salt where day < (now() at time zone 'Europe/Berlin')::date;
  delete from private.pageview_counter where day < (now() at time zone 'Europe/Berlin')::date;
  delete from private.pageview where day < (now() at time zone 'Europe/Berlin')::date - 395; -- ca. 13 Monate
$$;
revoke all on function private.pageview_cleanup() from public, anon, authenticated;

drop function if exists public.track_pageview(text, text, text, text);
drop function if exists private.track_pageview(text, text, text, text);

create or replace function private.track_pageview(p_path text, p_ref text, p_device text, p_ip text, p_ua text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  s text;
  v text;
  ip_key text;
  total integer;
  per_ip integer;
  per_visitor integer;
begin
  if p_path not in ('/', '/app/', '/impressum.html', '/datenschutz.html')
     or p_device not in ('mobile', 'desktop') then
    return false;
  end if;

  select salt into s from private.pageview_salt where day = today;
  if s is null then
    insert into private.pageview_salt (day, salt) values (today, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
      on conflict (day) do nothing;
    select salt into s from private.pageview_salt where day = today;
    perform private.pageview_cleanup();
  end if;
  v := left(encode(sha256(convert_to(s || '|' || coalesce(p_ip, '') || '|' || coalesce(p_ua, ''), 'UTF8')), 'hex'), 16);
  ip_key := 'ip:' || left(encode(sha256(convert_to(s || '|' || coalesce(p_ip, ''), 'UTF8')), 'hex'), 16);

  -- Spam-Schutz: 20.000 Aufrufe pro Tag gesamt, 500 je IP, 200 je Besucher.
  insert into private.pageview_counter (day, key, n) values (today, 'total', 1)
    on conflict (day, key) do update set n = private.pageview_counter.n + 1 returning n into total;
  insert into private.pageview_counter (day, key, n) values (today, ip_key, 1)
    on conflict (day, key) do update set n = private.pageview_counter.n + 1 returning n into per_ip;
  insert into private.pageview_counter (day, key, n) values (today, 'v:' || v, 1)
    on conflict (day, key) do update set n = private.pageview_counter.n + 1 returning n into per_visitor;
  if total > 20000 or per_ip > 500 or per_visitor > 200 then
    return false;
  end if;

  insert into private.pageview (day, path, ref, device, visitor)
    values (today, p_path, left(lower(coalesce(p_ref, '')), 60), p_device, v);
  return true;
end $$;

create or replace function private.site_stats(p_days integer)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select (now() at time zone 'Europe/Berlin')::date as last,
           (now() at time zone 'Europe/Berlin')::date - (greatest(1, least(p_days, 400)) - 1) as first
  ),
  span as (select d::date as day from bounds, generate_series(bounds.first, bounds.last, interval '1 day') d),
  pv as (
    select p.day, p.path, p.ref, p.device, p.visitor
    from private.pageview p, bounds where p.day >= bounds.first
  ),
  per_day as (
    select day, count(*) as views, count(distinct visitor) as visitors,
           count(distinct visitor) filter (where path = '/') as landing,
           count(distinct visitor) filter (where path = '/app/') as app
    from pv group by day
  ),
  funnel as (
    select count(*) filter (where l) as landing, count(*) filter (where l and a) as landing_to_app,
           count(*) filter (where a) as app
    from (select day, visitor, bool_or(path = '/') as l, bool_or(path = '/app/') as a from pv group by day, visitor) x
  ),
  signups as (
    select (r.created_at at time zone 'Europe/Berlin')::date as day, count(*) as n
    from private.login_request r, bounds
    where r.created_at >= (bounds.first::timestamp at time zone 'Europe/Berlin')
    group by 1
  ),
  use as (
    select u.day, count(*) as active, sum(u.google_calls) as calls
    from public.usage u, bounds where u.day >= bounds.first group by u.day
  )
  select jsonb_build_object(
    'days', (select jsonb_agg(jsonb_build_object(
        'day', s.day,
        'visitors', coalesce(d.visitors, 0),
        'views', coalesce(d.views, 0),
        'landing', coalesce(d.landing, 0),
        'app', coalesce(d.app, 0),
        'signups', coalesce(g.n, 0),
        'activeUsers', coalesce(u.active, 0),
        'googleCalls', coalesce(u.calls, 0)
      ) order by s.day)
      from span s left join per_day d using (day) left join signups g using (day) left join use u using (day)),
    'totals', jsonb_build_object(
      'visitors', (select coalesce(sum(visitors), 0) from per_day),
      'views', (select coalesce(sum(views), 0) from per_day),
      'landingVisitors', (select landing from funnel),
      'landingToApp', (select landing_to_app from funnel),
      'appVisitors', (select app from funnel),
      'signups', (select coalesce(sum(n), 0) from signups),
      'googleCalls', (select coalesce(sum(calls), 0) from use),
      'accountsApproved', (select count(*) from public.profiles where status = 'approved'),
      'accountsPending', (select count(*) from private.login_request where status = 'pending'),
      'proAccounts', (select count(*) from public.profiles where plan = 'pro' and (pro_until is null or pro_until > now()))
    ),
    'pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n, 'visitors', v) order by n desc), '[]')
              from (select path, count(*) n, count(distinct (day, visitor)) v from pv group by path) x),
    'refs', (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'visitors', v) order by v desc), '[]')
             from (select ref, count(distinct (day, visitor)) v from pv where ref <> '' group by ref order by v desc limit 15) x),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', device, 'visitors', v) order by v desc), '[]')
                from (select device, count(distinct (day, visitor)) v from pv group by device) x)
  )
$$;

revoke all on function private.track_pageview(text, text, text, text, text) from public, anon, authenticated;
grant execute on function private.track_pageview(text, text, text, text, text) to service_role;

create or replace function public.track_pageview(p_path text, p_ref text, p_device text, p_ip text, p_ua text)
returns boolean language sql security invoker set search_path = '' as $$
  select private.track_pageview(p_path, p_ref, p_device, p_ip, p_ua) $$;
revoke all on function public.track_pageview(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.track_pageview(text, text, text, text, text) to service_role;

-- Tägliche Löschung auch ohne Besuch: Tagesgeheimnis, Zähler und alte Aufrufe.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'pageview-cleanup';
select cron.schedule('pageview-cleanup', '5 * * * *', 'select private.pageview_cleanup()');
