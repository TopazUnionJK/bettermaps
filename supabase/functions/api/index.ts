// BetterMaps-Backend: hält den Google-Schlüssel geheim, prüft Login und Tageslimit.
//   GET  /api/me      → Tarif, heutige Nutzung, Limit, Schlüssel für die Kartenanzeige
//   POST /api/search  → eine Seite Google „Text Search (New)“ (zählt 1 Abfrage)
//   POST /api/near    → POIs aus der eigenen OSM-Datenbank im Umkreis der Treffer (kostenlos)
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

// Länder in der POI-Datenbank (grobe Rechtecke). Außerhalb antwortet /near mit covered:false,
// dann sucht die App diese Bedingungen wie früher bei Google.
const COVERAGE = [
  { s: 47.2, n: 55.1, w: 5.8, e: 15.1 },   // Deutschland
  { s: 46.3, n: 49.1, w: 9.5, e: 17.2 },   // Österreich
  { s: 45.8, n: 47.9, w: 5.9, e: 10.5 },   // Schweiz
  { s: 35.4, n: 47.1, w: 6.6, e: 18.6 },   // Italien
];
const covered = (lat: number, lon: number) => COVERAGE.some(b => lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e);
const MAX_POOL = 3000;

class BadRequest extends Error {}

// Alle POIs einer Kategorie, die höchstens `radius` m von einem der Punkte entfernt sind.
async function nearPois(cat: string, radius: number, points: [number, number][]) {
  const r = radius * 1.01; // etwas großzügiger, den genauen Schnitt macht die App (Haversine)
  const keys = new Set<number>();
  for (const [lat, lon] of points) {
    const dLat = r / M_PER_DEG, dLon = r / (M_PER_DEG * Math.cos((Math.abs(lat) + dLat) * Math.PI / 180));
    const i0 = Math.floor((lat - dLat + 90) / TILE_LAT), i1 = Math.floor((lat + dLat + 90) / TILE_LAT);
    const j0 = Math.floor((lon - dLon + 180) / TILE_LON), j1 = Math.floor((lon + dLon + 180) / TILE_LON);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) keys.add(i * 5000 + j);
  }
  if (keys.size > 900) throw new BadRequest('Gebiet zu groß.'); // PostgREST liefert höchstens 1000 Zeilen
  const { data, error } = await admin.rpc('poi_tiles', { p_label: cat, p_keys: [...keys] });
  if (error) throw new Error(error.message);

  // Treffer in ein Raster mit Zellgröße = Radius einsortieren, damit nicht jeder POI gegen jeden Punkt läuft.
  const cell = r / M_PER_DEG;
  const grid = new Map<string, [number, number][]>();
  for (const p of points) {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(p);
  }
  const out: [number, number, string | null][] = [];
  for (const t of (data ?? []) as { key: number; la: number[]; lo: number[]; nm: (string | null)[] }[]) {
    const i = Math.floor(t.key / 5000), j = t.key % 5000;
    for (let k = 0; k < t.la.length; k++) {
      const lat = (i + (t.la[k] + 32768) / 65535) * TILE_LAT - 90;
      const lon = (j + (t.lo[k] + 32768) / 65535) * TILE_LON - 180;
      const cos = Math.cos(lat * Math.PI / 180);
      const gi = Math.floor(lat / cell), gj = Math.floor(lon / cell);
      const lonCells = Math.floor(1 / Math.max(0.1, cos)) + 1; // Längengrade sind kürzer: mehr Nachbarzellen
      let near = false;
      for (let a = gi - 1; a <= gi + 1 && !near; a++) {
        for (let b = gj - lonCells; b <= gj + lonCells && !near; b++) {
          near = (grid.get(`${a},${b}`) ?? []).some(([plat, plon]) => {
            const dy = (lat - plat) * M_PER_DEG, dx = (lon - plon) * M_PER_DEG * cos;
            return dx * dx + dy * dy <= r * r;
          });
        }
      }
      if (near) out.push([Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, t.nm[k]]);
      if (out.length >= MAX_POOL) return out;
    }
  }
  return out;
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
      if (!points || !conds || points.length < 1 || points.length > 60 || conds.length < 1 || conds.length > 6
        || !points.every((p: unknown) => Array.isArray(p) && num(p[0], -90, 90) && num(p[1], -180, 180))
        || !conds.every((c: { cat?: unknown; radius?: unknown }) => typeof c?.cat === 'string' && c.cat.length <= 40 && num(c.radius, 1, 5000))
        || new Set(conds.map((c: { cat: string }) => c.cat)).size !== conds.length) {
        return json(req, { error: 'Ungültige Anfrage.' }, 400);
      }
      const lats = points.map((p: number[]) => p[0]), lons = points.map((p: number[]) => p[1]);
      const box = { s: Math.min(...lats), n: Math.max(...lats), w: Math.min(...lons), e: Math.max(...lons) };
      if (!smallEnough(box)) return json(req, { error: 'Gebiet zu groß.' }, 400);
      if (!points.every(([lat, lon]: number[]) => covered(lat, lon))) return json(req, { covered: false });
      try {
        const pools = await Promise.all(conds.map((c: { cat: string; radius: number }) => nearPois(c.cat, c.radius, points)));
        return json(req, { covered: true, pools });
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
