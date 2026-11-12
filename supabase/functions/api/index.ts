// BetterMaps-Backend: hält den Google-Schlüssel geheim, prüft Login und Tageslimit.
//   GET  /api/me      → Tarif, heutige Nutzung, Limit, Schlüssel für die Kartenanzeige
//   POST /api/search  → eine Seite Google „Text Search (New)“ (zählt 1 Abfrage)
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

function num(v: unknown, min: number, max: number) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
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
      const fields = FIELDS[b?.fields];
      const r = b?.rect;
      const text = typeof b?.textQuery === 'string' ? b.textQuery.trim().slice(0, 100) : '';
      if (!fields || !text || !r || !num(r.s, -90, 90) || !num(r.n, -90, 90) || !num(r.w, -180, 180) || !num(r.e, -180, 180)
        || r.n <= r.s || r.n - r.s > 1 || r.e - r.w > 1.5) {
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

      const g = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY, 'X-Goog-FieldMask': fields },
        body: JSON.stringify(body),
      });
      const out = await g.json().catch(() => ({}));
      return json(req, { ...out, quota: { used: q.used, limit: q.daily_limit } }, g.status);
    }

    return json(req, { error: 'Nicht gefunden.' }, 404);
  } catch (e) {
    console.error(e);
    return json(req, { error: 'Serverfehler.' }, 500);
  }
});
