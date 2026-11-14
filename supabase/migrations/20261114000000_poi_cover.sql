-- Welche Kacheln stecken wirklich in der POI-Datenbank? Statt grober Länder-Rechtecke
-- (die z. B. Prag oder Ljubljana einschließen) prüft das Backend gegen diese Liste.
-- Befüllt von tools/poi_import.py beim Austausch der Daten.
create table if not exists private.poi_cover (key integer primary key);
alter table private.poi_cover enable row level security;
revoke all on private.poi_cover from public, anon, authenticated;

insert into private.poi_cover (key) select distinct key from private.poi_tile on conflict do nothing;

-- Wie viele der Kacheln sind abgedeckt, wie viele der Kategorien bekannt?
create or replace function private.poi_check(p_keys integer[], p_labels text[])
returns table (keys_found integer, labels_found integer)
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from private.poi_cover where key = any (p_keys)),
         (select count(*)::int from private.poi_cat where label = any (p_labels))
$$;
revoke all on function private.poi_check(integer[], text[]) from public, anon, authenticated;
grant execute on function private.poi_check(integer[], text[]) to service_role;

create or replace function public.poi_check(p_keys integer[], p_labels text[])
returns table (keys_found integer, labels_found integer)
language sql stable security invoker set search_path = '' as $$
  select * from private.poi_check(p_keys, p_labels)
$$;
revoke all on function public.poi_check(integer[], text[]) from public, anon, authenticated;
grant execute on function public.poi_check(integer[], text[]) to service_role;
