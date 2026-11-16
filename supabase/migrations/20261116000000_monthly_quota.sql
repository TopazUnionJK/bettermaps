-- Kontingente wie im Pricing: Google-Abfragen pro Kalendermonat (deutsche Zeit).
--   Kostenlos 10, Plus 100, Pro 200. Für Tester kann pro Konto ein eigenes Monatslimit gesetzt werden.
-- Das globale Tageslimit (daily_limit_global) bleibt als Kostenbremse bestehen.
insert into private.settings (key, value) values
  ('monthly_limit_free', 10), ('monthly_limit_plus', 100), ('monthly_limit_pro', 200)
on conflict (key) do update set value = excluded.value;
delete from private.settings where key in ('daily_limit_free', 'daily_limit_pro');

alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check check (plan in ('free', 'plus', 'pro'));
-- pro_until gilt jetzt für Plus und Pro: Bis wann der bezahlte Tarif läuft (leer = unbefristet).
alter table public.profiles rename column pro_until to plan_until;
-- Eigenes Monatslimit (z. B. für Tester); leer = Limit des Tarifs.
alter table public.profiles add column if not exists monthly_limit integer check (monthly_limit is null or monthly_limit >= 0);

drop function if exists public.consume_quota(uuid, integer);
drop function if exists private.consume_quota(uuid, integer);

-- n > 0 bucht ab, n < 0 bucht zurück (fehlgeschlagene Google-Abfrage), n = 0 liest nur.
-- reason: '' | 'user' (Monatskontingent aufgebraucht) | 'global' (Tageslimit aller Nutzer erreicht)
create function private.consume_quota(uid uuid, n integer)
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
  quota_limit := coalesce(p.monthly_limit, (select s.value from private.settings s where s.key = 'monthly_limit_' || plan));
  select value into glob from private.settings where key = 'daily_limit_global';

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
  update public.usage u set google_calls = greatest(0, u.google_calls + n) where u.user_id = uid and u.day = today;
  allowed := true; used := greatest(0, cur + n); return next;
end $$;
revoke all on function private.consume_quota(uuid, integer) from public, anon, authenticated;
grant execute on function private.consume_quota(uuid, integer) to service_role;

create function public.consume_quota(uid uuid, n integer)
returns table (allowed boolean, used integer, quota_limit integer, plan text, reason text)
language sql security invoker set search_path = '' as $$ select * from private.consume_quota(uid, n) $$;
revoke all on function public.consume_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_quota(uuid, integer) to service_role;

-- Statistik: zählt jetzt alle bezahlten Tarife (Plus und Pro) und nutzt plan_until.
do $$
declare def text := pg_get_functiondef('private.site_stats(integer)'::regprocedure);
begin
  def := replace(def, $r$plan = 'pro' and (pro_until is null or pro_until > now())$r$,
                      $r$plan in ('plus', 'pro') and (plan_until is null or plan_until > now())$r$);
  if def like '%pro_until%' then raise exception 'site_stats: pro_until nicht ersetzt'; end if;
  execute def;
end $$;

-- Sprache der Anmeldeanfrage (de/en), damit die Freischalt-Mail in der richtigen Sprache kommt.
alter table private.login_request add column if not exists lang text not null default 'de' check (lang in ('de', 'en'));
create or replace function private.login_request_lang(p_id uuid, p_lang text)
returns text language plpgsql security definer set search_path = '' as $$
declare l text;
begin
  if p_lang in ('de', 'en') then
    update private.login_request set lang = p_lang where id = p_id and status = 'pending';
  end if;
  select lang into l from private.login_request where id = p_id;
  return coalesce(l, 'de');
end $$;
create or replace function public.login_request_lang(p_id uuid, p_lang text)
returns text language sql security invoker set search_path = '' as $$ select private.login_request_lang(p_id, p_lang) $$;
revoke all on function private.login_request_lang(uuid, text) from public, anon, authenticated;
revoke all on function public.login_request_lang(uuid, text) from public, anon, authenticated;
grant execute on function private.login_request_lang(uuid, text) to service_role;
grant execute on function public.login_request_lang(uuid, text) to service_role;
