#!/usr/bin/env python3
"""Lädt die POIs für die Bedingungen (Spielplatz, Ladesäule, …) aus OpenStreetMap in Supabase.

Voraussetzungen: osmium-tool, node, npx supabase (eingeloggt oder SUPABASE_ACCESS_TOKEN gesetzt).
Läuft monatlich automatisch über .github/workflows/poi-import.yml.

Aufruf:
  python3 tools/poi_import.py <arbeitsordner> germany austria switzerland italy

Nimmt <arbeitsordner>/<land>.osm.pbf, sonst lädt es die Datei von download.geofabrik.de/europe/<land>-latest.osm.pbf
selbst und löscht sie nach dem Filtern wieder (so reicht wenig Plattenplatz).
Die Kategorien kommen direkt aus CATEGORIES in app.js, damit App und Datenbank gleich zählen.
Geladen wird in private.poi_tile_new; am Ende wird die Tabelle in einem Schritt ausgetauscht,
die App sieht also nie einen halben Datenstand.
"""
import json, math, pathlib, re, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROJECT = 'icqensripxkuiarkrvsb'
TILE_LAT, TILE_LON = 0.05, 0.075
BATCH_BYTES = 2_500_000


def categories():
    js = (ROOT / 'app.js').read_text(encoding='utf-8')
    m = re.search(r'const CATEGORIES = (\[.*?\n\]);', js, re.S)
    out = subprocess.run(['node', '-e', f'process.stdout.write(JSON.stringify({m.group(1)}))'],
                         check=True, capture_output=True, text=True).stdout
    return [{'label': c['label'], 'filters': c['filters']} for c in json.loads(out)]


def compile_filters(cats):
    """Wie matches() in app.js: String = exakt, {re} = Regex (ohne Groß/Klein)."""
    out = []
    for c in cats:
        fs = []
        for f in c['filters']:
            fs.append([(k, v if isinstance(v, str) else re.compile(v['re'], re.I)) for k, v in f.items()])
        out.append(fs)
    return out


def tag_filter_args(cats):
    """osmium tags-filter: nur Objekte, die mindestens ein Tag-Paar irgendeines Filters haben."""
    pairs = set()
    for c in cats:
        for f in c['filters']:
            k, v = next((k, v) for k, v in f.items() if isinstance(v, str))  # erstes festes Tag genügt als Vorfilter
            pairs.add(f'{k}={v}')
    return [f'nwr/{p}' for p in sorted(pairs)]


def hit(tags, fs):
    for f in fs:
        ok = True
        for k, v in f:
            t = tags.get(k)
            if t is None or (t != v if isinstance(v, str) else not v.search(t)):
                ok = False
                break
        if ok:
            return True
    return False


def centroid(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'Point':
        return c
    if t == 'LineString':
        pts = c
    elif t == 'Polygon':
        pts = c[0]
    elif t == 'MultiPolygon':
        pts = max((p[0] for p in c), key=len)
    else:
        return None
    return [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)]


def run(cmd):
    print('$', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def sql_query(sql_or_file, is_file=False):
    cmd = ['npx', '-y', 'supabase@2.122.1', 'db', 'query', '--project-ref', PROJECT, '--linked',
           '--agent', 'no', '--output-format', 'json']
    cmd += ['-f', str(sql_or_file)] if is_file else [sql_or_file]
    for attempt in range(4):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and '"_tag":"Error"' not in r.stdout:
            return r.stdout

        print('  Fehler, neuer Versuch:', (r.stderr or r.stdout)[-400:], flush=True)
        time.sleep(5 * (attempt + 1))
    raise SystemExit('Abbruch: SQL fehlgeschlagen')


def rows(out):
    """Zeilen aus der JSON-Ausgabe der CLI (Liste der Zeilen)."""
    return json.loads(out[out.index('['):])


def main():
    work = pathlib.Path(sys.argv[1])
    countries = sys.argv[2:]
    cats = categories()
    filters = compile_filters(cats)
    tiles = {}  # (cat, key) -> [(la, lo, name)]
    seen = set()
    counts = [0] * len(cats)

    for country in countries:
        pbf = work / f'{country}.osm.pbf'
        downloaded = not pbf.exists()
        if downloaded:
            run(['curl', '-sSfL', '--retry', '3', '-o', str(pbf),
                 f'https://download.geofabrik.de/europe/{country}-latest.osm.pbf'])
        flt = work / f'{country}.poi.pbf'
        geo = work / f'{country}.poi.geojsonseq'
        run(['osmium', 'tags-filter', '--overwrite', '-o', str(flt), str(pbf), *tag_filter_args(cats)])
        if downloaded:
            pbf.unlink()
        run(['osmium', 'export', '--overwrite', '-f', 'geojsonseq', '-a', 'type,id',
             '--geometry-types=point,linestring,polygon', '-o', str(geo), str(flt)])
        n = 0
        with open(geo, encoding='utf-8') as fh:
            for line in fh:
                line = line.lstrip('\x1e').strip()
                if not line:
                    continue
                f = json.loads(line)
                tags = f['properties']
                oid = (tags.get('@type'), tags.get('@id'))
                if oid in seen:  # Grenzgebiete stehen in zwei Länderdateien
                    continue
                if tags.get('access') in ('private', 'no'):
                    continue
                c = centroid(f['geometry'])
                if not c:
                    continue
                lon, lat = c
                name = tags.get('name') or tags.get('brand')
                matched = False
                for i, fs in enumerate(filters):
                    if hit(tags, fs):
                        li, lj = math.floor((lat + 90) / TILE_LAT), math.floor((lon + 180) / TILE_LON)
                        la = round(((lat + 90) / TILE_LAT - li) * 65535) - 32768
                        lo = round(((lon + 180) / TILE_LON - lj) * 65535) - 32768
                        tiles.setdefault((i, li * 5000 + lj), []).append((la, lo, name))
                        counts[i] += 1
                        matched = True
                if matched:
                    seen.add(oid)
                    n += 1
        print(f'{country}: {n} Objekte', flush=True)
        flt.unlink()
        geo.unlink()

    for c, n in zip(cats, counts):
        print(f'  {c["label"]:16} {n}')
    print(f'{len(tiles)} Kacheln, {sum(counts)} Einträge', flush=True)

    # Kategorien: feste IDs je Bezeichnung. Neue Bezeichnungen bekommen eine neue ID,
    # bestehende behalten ihre – die laufende Tabelle bleibt also bis zum Austausch gültig.
    q = lambda s: "'" + s.replace("'", "''") + "'"
    labels = ','.join(q(c['label']) for c in cats)
    out = sql_query(f"""
      insert into private.poi_cat (id, label)
        select (select coalesce(max(id), -1) from private.poi_cat) + row_number() over (), l
        from unnest(array[{labels}]) l where l not in (select label from private.poi_cat);
      select id, label from private.poi_cat;
    """)
    ids = {r['label']: r['id'] for r in rows(out)}
    tiles = {(ids[cats[c]['label']], key): pts for (c, key), pts in tiles.items()}
    sql_query("""
      drop table if exists private.poi_tile_new;
      create table private.poi_tile_new (like private.poi_tile including indexes);
    """)

    def arr_text(names):
        return 'array[' + ','.join('null' if n is None else q(n[:80]) for n in names) + ']::text[]'

    batch, size, done, tmp = [], 0, 0, work / 'batch.sql'
    items = sorted(tiles.items())

    def flush():
        nonlocal batch, size
        if not batch:
            return
        tmp.write_text('insert into private.poi_tile_new (cat, key, la, lo, nm) values\n' + ',\n'.join(batch)
                       + '\non conflict do nothing;\n',
                       encoding='utf-8')
        sql_query(tmp, is_file=True)
        batch, size = [], 0

    for (cat, key), pts in items:
        la = '{' + ','.join(str(p[0]) for p in pts) + '}'
        lo = '{' + ','.join(str(p[1]) for p in pts) + '}'
        row = f"({cat},{key},'{la}','{lo}',{arr_text([p[2] for p in pts])})"
        batch.append(row)
        size += len(row)
        done += 1
        if size > BATCH_BYTES:
            flush()
            print(f'  {done}/{len(items)} Kacheln geladen', flush=True)
    flush()
    tmp.unlink(missing_ok=True)

    # Vor dem Austausch: passt alles in den kostenlosen Tarif (500 MB)? Sonst alte Daten behalten.
    out = sql_query("select pg_database_size(current_database()) - pg_total_relation_size('private.poi_tile') as after")
    after = rows(out)[0]['after']
    print(f'Datenbank nach dem Austausch: {after / 1e6:.0f} MB', flush=True)
    if after > 400e6:
        sql_query('drop table private.poi_tile_new')
        raise SystemExit('Abbruch: Datenbank würde zu groß, alter Datenstand bleibt.')
    sql_query(f"""
      begin;
      alter table private.poi_tile_new add foreign key (cat) references private.poi_cat (id) on delete cascade;
      alter table private.poi_tile_new enable row level security;
      revoke all on private.poi_tile_new from public, anon, authenticated;
      drop table private.poi_tile;
      alter table private.poi_tile_new rename to poi_tile;
      alter index private.poi_tile_new_pkey rename to poi_tile_pkey;
      insert into private.poi_meta (key, value) values ('imported_at', now()::text), ('countries', {q(','.join(countries))})
        on conflict (key) do update set value = excluded.value;
      commit;
    """)
    print(sql_query("select pg_size_pretty(pg_total_relation_size('private.poi_tile')) as poi, "
                    "pg_size_pretty(pg_database_size(current_database())) as db"))


if __name__ == '__main__':
    main()
