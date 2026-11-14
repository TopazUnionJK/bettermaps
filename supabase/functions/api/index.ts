// BetterMaps-Backend: hält den Google-Schlüssel geheim, prüft Login und Tageslimit.
//   GET  /api/me      → Tarif, heutige Nutzung, Limit, Schlüssel für die Kartenanzeige
//   POST /api/search  → eine Seite Google „Text Search (New)“ (zählt 1 Abfrage)
//   POST /api/near    → POIs aus der eigenen OSM-Datenbank im Umkreis der Treffer (kostenlos)
//   POST /api/area    → POIs einer Kategorie im Rechteck (OpenStreetMap-Modus, kostenlos)
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default
  ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLACES_KEY = Deno.env.get('GOOGLE_PLACES_KEY') ?? '';
const MAPS_BROWSER_KEY = Deno.env.get('GOOGLE_MAPS_BROWSER_KEY') ?? '';

const ALLOWED_ORIGINS = [
  'https://topazunionjk.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Nur diese Feldsätze dürfen angefragt werden – so bleibt der Google-Tarif unter Kontrolle.
const FIELDS: Record<string, string> = {
  main: 'places.id,places.displayName,places.location,places.formattedAddress,places.primaryTypeDisplayName,' +
    'places.rating,places.userRatingCount,places.websiteUri,places.googleMapsUri,places.currentOpeningHours.openNow,nextPageToken',
  near: 'places.id,places.displayName,places.location,nextPageToken',
};

const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false } });

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });
}

async function userId(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getClaims(token);
  if (error || !data?.claims?.sub || data.claims.is_anonymous) return null;
  return data.claims.sub as string;
}

async function quota(uid: string, n: number) {
  const { data, error } = await admin.rpc('consume_quota', { uid, n });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as { allowed: boolean; used: number; daily_limit: number; plan: string };
}

// Höchstens ca. 120 km × 120 km (Stadt + Umkreis), unabhängig vom Breitengrad.
function smallEnough(r: { s: number; n: number; w: number; e: number }) {
  const latKm = (r.n - r.s) * 111.32;
  const lonKm = (r.e - r.w) * 111.32 * Math.cos(((r.n + r.s) / 2) * Math.PI / 180);
  return latKm <= 120 && lonKm <= 120;
}

function num(v: unknown, min: number, max: number) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

// Kacheln wie in tools/poi_import.py: 0,05° Breite × 0,075° Länge, Lage als smallint-Versatz.
const TILE_LAT = 0.05, TILE_LON = 0.075;
const M_PER_DEG = 111320;

const MAX_POOL = 20000; // Einträge je Bedingung
const MAX_AREA = 5000;  // Treffer der Hauptsuche (OpenStreetMap-Modus)
class BadRequest extends Error {}

type Row = { key: number; la: number[]; lo: number[]; nm: (string | null)[] };
const tileKey = (lat: number, lon: number) => Math.floor((lat + 90) / TILE_LAT) * 5000 + Math.floor((lon + 180) / TILE_LON);

function* decode(rows: Row[]): Generator<[number, number, string | null]> {
  for (const t of rows) {
    const i = Math.floor(t.key / 5000), j = t.key % 5000;
    for (let k = 0; k < t.la.length; k++) {
      yield [(i + (t.la[k] + 32768) / 65535) * TILE_LAT - 90, (j + (t.lo[k] + 32768) / 65535) * TILE_LON - 180, t.nm[k]];
    }
  }
}
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

async function tiles(cat: string, keys: number[]) {
  if (keys.length > 900) throw new BadRequest('Gebiet zu groß.'); // PostgREST liefert höchstens 1000 Zeilen
  const { data, error } = await admin.rpc('poi_tiles', { p_label: cat, p_keys: keys });
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

// Deckt die Datenbank diese Kacheln ab (Liste private.poi_cover aus dem Import) und kennt sie alle Kategorien?
// Sonst sucht die App wie früher bei Google bzw. den öffentlichen OpenStreetMap-Servern.
async function isCovered(keys: number[], labels: string[]) {
  const k = [...new Set(keys)], l = [...new Set(labels)];
  if (k.length > 2000) return false;
  const { data, error } = await admin.rpc('poi_check', { p_keys: k, p_labels: l });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { keys_found: number; labels_found: number };
  return row.keys_found === k.length && row.labels_found === l.length;
}

// Alle POIs einer Kategorie, die höchstens etwa `radius` m von einem der Punkte entfernt sind.
// Etwas großzügig (bis ca. 35 % mehr), den genauen Schnitt macht die App (Haversine).
async function nearPois(cat: string, radius: number, points: [number, number][]) {
  const r = radius * 1.01;
  const maxLat = Math.max(...points.map(p => Math.abs(p[0]))) + r / M_PER_DEG;
  const cosMin = Math.max(0.1, Math.cos(maxLat * Math.PI / 180));
  const dLat = r / M_PER_DEG, dLon = dLat / cosMin;

  // Raster mit Zellen von r/4: alle Zellen markieren, deren Mitte höchstens r + halbe Zelldiagonale
  // von einem Punkt entfernt ist. Danach ist die Prüfung je POI ein einziger Nachschlag.
  const cLat = dLat / 4, cLon = dLon / 4, reach = 1 + Math.SQRT2 / 8;
  const marked = new Set<number>();
  const cellKey = (a: number, b: number) => a * 1e8 + b;
  const keys = new Set<number>();
  for (const [lat, lon] of points) {
    const a0 = Math.floor((lat - dLat) / cLat), a1 = Math.floor((lat + dLat) / cLat);
    const b0 = Math.floor((lon - dLon) / cLon), b1 = Math.floor((lon + dLon) / cLon);
    for (let a = a0; a <= a1; a++) {
      for (let b = b0; b <= b1; b++) {
        const y = ((a + 0.5) * cLat - lat) / dLat, x = ((b + 0.5) * cLon - lon) / dLon;
        if (x * x + y * y <= reach * reach) marked.add(cellKey(a, b));
      }
    }
    const i0 = Math.floor((lat - dLat + 90) / TILE_LAT), i1 = Math.floor((lat + dLat + 90) / TILE_LAT);
    const j0 = Math.floor((lon - dLon + 180) / TILE_LON), j1 = Math.floor((lon + dLon + 180) / TILE_LON);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) keys.add(i * 5000 + j);
  }
  const out: [number, number, string | null][] = [];
  for (const [lat, lon, name] of decode(await tiles(cat, [...keys]))) {
    if (!marked.has(cellKey(Math.floor(lat / cLat), Math.floor(lon / cLon)))) continue;
    if (out.length >= MAX_POOL) return { points: out, capped: true };
    out.push([round6(lat), round6(lon), name]);
  }
  return { points: out, capped: false };
}

// Alle POIs einer Kategorie in einem Rechteck (OpenStreetMap-Modus der App: Hauptsuche aus der Datenbank).
async function areaPois(cat: string, r: { s: number; n: number; w: number; e: number }) {
  const keys: number[] = [];
  for (let i = Math.floor((r.s + 90) / TILE_LAT); i <= Math.floor((r.n + 90) / TILE_LAT); i++) {
    for (let j = Math.floor((r.w + 180) / TILE_LON); j <= Math.floor((r.e + 180) / TILE_LON); j++) keys.push(i * 5000 + j);
  }
  const out: [number, number, string | null][] = [];
  for (const [lat, lon, name] of decode(await tiles(cat, keys))) {
    if (lat < r.s || lat > r.n || lon < r.w || lon > r.e) continue;
    if (out.length >= MAX_AREA) return { points: out, capped: true };
    out.push([round6(lat), round6(lon), name]);
  }
  return { points: out, capped: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const path = new URL(req.url).pathname.replace(/^.*\/api/, '') || '/';

  const uid = await userId(req);
  if (!uid) return json(req, { error: 'Bitte anmelden.' }, 401);

  try {
    if (req.method === 'GET' && path === '/me') {
      const q = await quota(uid, 0);
      return json(req, { plan: q.plan, used: q.used, limit: q.daily_limit, mapsKey: MAPS_BROWSER_KEY });
    }

    if (req.method === 'POST' && path === '/search') {
      if (!PLACES_KEY) return json(req, { error: 'Google-Schlüssel ist im Backend noch nicht hinterlegt.' }, 503);
      const b = await req.json().catch(() => null);
      const fields = typeof b?.fields === 'string' && Object.hasOwn(FIELDS, b.fields) ? FIELDS[b.fields] : null;
      const r = b?.rect;
      const text = typeof b?.textQuery === 'string' ? b.textQuery.trim().slice(0, 100) : '';
      if (!fields || !text || !r || !num(r.s, -90, 90) || !num(r.n, -90, 90) || !num(r.w, -180, 180) || !num(r.e, -180, 180)
        || r.n <= r.s || r.e <= r.w || !smallEnough(r)) {
        return json(req, { error: 'Ungültige Anfrage.' }, 400);
      }
      if (b.pageToken != null && (typeof b.pageToken !== 'string' || b.pageToken.length > 2000)) {
        return json(req, { error: 'Ungültige Anfrage.' }, 400);
      }

      const q = await quota(uid, 1);
      if (!q.allowed) {
        return json(req, { error: `Tageslimit erreicht (${q.daily_limit} Google-Abfragen).`, used: q.used, limit: q.daily_limit, plan: q.plan }, 429);
      }

      const body: Record<string, unknown> = {
        textQuery: text, languageCode: 'de', regionCode: 'DE', pageSize: 20,
        locationRestriction: { rectangle: { low: { latitude: r.s, longitude: r.w }, high: { latitude: r.n, longitude: r.e } } },
      };
      if (b.pageToken) body.pageToken = b.pageToken;

      let g: Response | null = null, out: Record<string, unknown> = {};
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          g = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY, 'X-Goog-FieldMask': fields },
            body: JSON.stringify(body),
          });
          out = await g.json().catch(() => ({}));
          // Ein frischer Seiten-Token ist manchmal noch nicht gültig: im selben Kontingent einmal wiederholen.
          if (g.status === 400 && b.pageToken && attempt === 0) { await new Promise(res => setTimeout(res, 1500)); continue; }
          break;
        }
      } catch (e) {
        console.error('Google nicht erreichbar', e);
      }
      if (!g?.ok) {
        // Fehlgeschlagene Abfrage nicht aufs Kontingent anrechnen; Google-Details nur ins Log.
        await quota(uid, -1).catch(() => {});
        console.error('Google-Fehler', g?.status, JSON.stringify(out).slice(0, 500));
        const status = g?.status === 400 ? 400 : 502;
        return json(req, { error: status === 400 ? 'Google hat die Anfrage abgelehnt.' : 'Google-Suche derzeit nicht verfügbar.' }, status);
      }
      return json(req, { ...out, quota: { used: q.used, limit: q.daily_limit } });
    }

    if (req.method === 'POST' && path === '/near') {
      // Bedingungen aus der eigenen OSM-Datenbank: kostet keine Google-Abfrage.
      const b = await req.json().catch(() => null);
      const points = Array.isArray(b?.points) ? b.points : null;
      const conds = Array.isArray(b?.conds) ? b.conds : null;
      if (!points || !conds || points.length < 1 || points.length > MAX_AREA || conds.length < 1 || conds.length > 6
        || !points.every((p: unknown) => Array.isArray(p) && num(p[0], -90, 90) && num(p[1], -180, 180))
        || !conds.every((c: { cat?: unknown; radius?: unknown }) => typeof c?.cat === 'string' && c.cat.length <= 40 && num(c.radius, 1, 5000))
        || new Set(conds.map((c: { cat: string }) => c.cat)).size !== conds.length) {
        return json(req, { error: 'Ungültige Anfrage.' }, 400);
      }
      const lats = points.map((p: number[]) => p[0]), lons = points.map((p: number[]) => p[1]);
      const box = { s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lons), e: Math.max(...lons) };
      if (!smallEnough(box)) return json(req, { error: 'Gebiet zu groß.' }, 400);
      const cats = conds.map((c: { cat: string }) => c.cat);
      if (!await isCovered(points.map(([lat, lon]: number[]) => tileKey(lat, lon)), cats)) return json(req, { covered: false });
      try {
        const res = await Promise.all(conds.map((c: { cat: string; radius: number }) => nearPois(c.cat, c.radius, points)));
        return json(req, { covered: true, pools: res.map(x => x.points), capped: res.map(x => x.capped) });
      } catch (e) {
        if (e instanceof BadRequest) return json(req, { error: e.message }, 400);
        throw e;
      }
    }

    if (req.method === 'POST' && path === '/area') {
      const b = await req.json().catch(() => null);
      const r = b?.rect;
      if (typeof b?.cat !== 'string' || b.cat.length > 40 || !r || !num(r.s, -90, 90) || !num(r.n, -90, 90)
        || !num(r.w, -180, 180) || !num(r.e, -180, 180) || r.n <= r.s || r.e <= r.w || !smallEnough(r)) {
        return json(req, { error: 'Ungültige Anfrage.' }, 400);
      }
      const probe = [[r.s, r.w], [r.s, r.e], [r.n, r.w], [r.n, r.e], [(r.s + r.n) / 2, (r.w + r.e) / 2]].map(([a, b]) => tileKey(a, b));
      if (!await isCovered(probe, [b.cat])) return json(req, { covered: false });
      try {
        return json(req, { covered: true, ...await areaPois(b.cat, r) });
      } catch (e) {
        if (e instanceof BadRequest) return json(req, { error: e.message }, 400);
        throw e;
      }
    }

    return json(req, { error: 'Nicht gefunden.' }, 404);
  } catch (e) {
    console.error(e);
    return json(req, { error: 'Serverfehler.' }, 500);
  }
});
