-- Eigene Website-Statistik ohne Cookies und ohne gespeicherte IP-Adressen.
-- Besucher werden pro Tag über einen Hash aus (Tagesgeheimnis + IP + Browser) unterschieden.
-- Das Tagesgeheimnis wird am Folgetag gelöscht; danach lässt sich der Hash niemandem mehr zuordnen.
create table if not exists private.pageview (
  id bigserial primary key,
  at timestamptz not null default now(),
  day date not null,
  path text not null,
  ref text not null default '',
  device text not null,
  visitor text not null
);
create index if not exists pageview_day on private.pageview (day);
alter table private.pageview enable row level security;
revoke all on private.pageview from public, anon, authenticated;

create table if not exists private.pageview_salt (
  day date primary key,
  salt text not null
);
alter table private.pageview_salt enable row level security;
revoke all on private.pageview_salt from public, anon, authenticated;

-- Einen Aufruf zählen. p_fingerprint = IP + Browser-Kennung, wird nur gehasht, nie gespeichert.
create or replace function private.track_pageview(p_path text, p_ref text, p_device text, p_fingerprint text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  s text;
  v text;
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
    delete from private.pageview_salt where day < today;
    delete from private.pageview where day < today - 400; -- Aufbewahrung ca. 13 Monate
  end if;
  v := left(encode(sha256(convert_to(s || '|' || coalesce(p_fingerprint, ''), 'UTF8')), 'hex'), 16);

  -- Schutz vor Spam: höchstens 300 Aufrufe je Besucher und 100.000 insgesamt pro Tag.
  if (select count(*) from private.pageview where day = today and visitor = v) >= 300
     or (select count(*) from private.pageview where day = today) >= 100000 then
    return false;
  end if;

  insert into private.pageview (day, path, ref, device, visitor)
    values (today, p_path, left(lower(coalesce(p_ref, '')), 100), p_device, v);
  return true;
end $$;

-- Auswertung für die Statistikseite (nur über das Backend, nur für den Betreiber).
create or replace function private.site_stats(p_days integer)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with span as (
    select d::date as day
    from generate_series((now() at time zone 'Europe/Berlin')::date - (greatest(1, least(p_days, 400)) - 1),
                         (now() at time zone 'Europe/Berlin')::date, interval '1 day') d
  ),
  pv as (select p.* from private.pageview p where p.day >= (select min(day) from span)),
  landing_v as (select distinct day, visitor from pv where path = '/'),
  app_v as (select distinct day, visitor from pv where path = '/app/')
  select jsonb_build_object(
    'days', (select jsonb_agg(jsonb_build_object(
        'day', s.day,
        'visitors', (select count(distinct visitor) from pv where pv.day = s.day),
        'views', (select count(*) from pv where pv.day = s.day),
        'landing', (select count(*) from landing_v l where l.day = s.day),
        'app', (select count(*) from app_v a where a.day = s.day),
        'signups', (select count(*) from private.login_request r where (r.created_at at time zone 'Europe/Berlin')::date = s.day),
        'activeUsers', (select count(*) from public.usage u where u.day = s.day),
        'googleCalls', (select coalesce(sum(u.google_calls), 0) from public.usage u where u.day = s.day)
      ) order by s.day) from span s),
    'totals', jsonb_build_object(
      'visitors', (select count(*) from (select distinct day, visitor from pv) x),
      'views', (select count(*) from pv),
      'landingVisitors', (select count(*) from landing_v),
      'landingToApp', (select count(*) from landing_v l join app_v a using (day, visitor)),
      'appVisitors', (select count(*) from app_v),
      'signups', (select count(*) from private.login_request r where (r.created_at at time zone 'Europe/Berlin')::date >= (select min(day) from span)),
      'googleCalls', (select coalesce(sum(u.google_calls), 0) from public.usage u where u.day >= (select min(day) from span)),
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

revoke all on function private.track_pageview(text, text, text, text) from public, anon, authenticated;
revoke all on function private.site_stats(integer) from public, anon, authenticated;
grant execute on function private.track_pageview(text, text, text, text) to service_role;
grant execute on function private.site_stats(integer) to service_role;

create or replace function public.track_pageview(p_path text, p_ref text, p_device text, p_fingerprint text)
returns boolean language sql security invoker set search_path = '' as $$
  select private.track_pageview(p_path, p_ref, p_device, p_fingerprint) $$;
create or replace function public.site_stats(p_days integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.site_stats(p_days) $$;
revoke all on function public.track_pageview(text, text, text, text) from public, anon, authenticated;
revoke all on function public.site_stats(integer) from public, anon, authenticated;
grant execute on function public.track_pageview(text, text, text, text) to service_role;
grant execute on function public.site_stats(integer) to service_role;
