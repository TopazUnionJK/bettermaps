-- Eigene POI-Datenbank für die Bedingungen ("Spielplatz in 500 m" usw.), Daten aus OpenStreetMap.
-- Kompakt in Kacheln gespeichert, damit DE/AT/CH/IT in den kostenlosen Supabase-Tarif passen:
-- eine Zeile je Kategorie und Kachel (0,05° Breite × 0,075° Länge, ca. 5,5 km × 5,5 km),
-- Lage als Versatz innerhalb der Kachel (smallint, ca. 10 cm genau), Namen als Array.
-- Befüllt wird mit tools/poi_import.py; nur der Server (service_role) darf lesen.

create table if not exists private.poi_cat (
  id smallint primary key,
  label text not null unique
);

create table if not exists private.poi_tile (
  cat smallint not null references private.poi_cat (id) on delete cascade,
  key integer not null,          -- floor((lat+90)/0.05) * 5000 + floor((lon+180)/0.075)
  la smallint[] not null,        -- Breite: Versatz in der Kachel, -32768 … 32767
  lo smallint[] not null,        -- Länge: Versatz in der Kachel
  nm text[] not null,            -- Name oder null
  primary key (cat, key)
);

create table if not exists private.poi_meta (
  key text primary key,
  value text not null
);

alter table private.poi_cat enable row level security;
alter table private.poi_tile enable row level security;
alter table private.poi_meta enable row level security;
revoke all on private.poi_cat, private.poi_tile, private.poi_meta from public, anon, authenticated;

create or replace function private.poi_tiles(p_label text, p_keys integer[])
returns table (key integer, la smallint[], lo smallint[], nm text[])
language sql stable security definer set search_path = '' as $$
  select t.key, t.la, t.lo, t.nm
  from private.poi_tile t
  join private.poi_cat c on c.id = t.cat
  where c.label = p_label and t.key = any (p_keys)
$$;
revoke all on function private.poi_tiles(text, integer[]) from public, anon, authenticated;
grant execute on function private.poi_tiles(text, integer[]) to service_role;

create or replace function public.poi_tiles(p_label text, p_keys integer[])
returns table (key integer, la smallint[], lo smallint[], nm text[])
language sql stable security invoker set search_path = '' as $$
  select * from private.poi_tiles(p_label, p_keys)
$$;
revoke all on function public.poi_tiles(text, integer[]) from public, anon, authenticated;
grant execute on function public.poi_tiles(text, integer[]) to service_role;
