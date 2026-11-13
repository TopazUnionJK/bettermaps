# BetterMaps

Orte finden, bei denen auch die Umgebung passt – z. B. ein Restaurant in Rosenheim mit Spielplatz und E-Ladesäule in 500 m Umkreis.

- Suche: Google Places (Text Search) über das eigene Backend, Anmeldung per E-Mail-Link
- Karte: Google Maps (Schlüssel kommt vom Backend), sonst OpenStreetMap
- Entwickler: mit eigenem Google-Schlüssel (nur im Browser gespeichert) direkt ohne Konto; dann auch OpenStreetMap wählbar
- `python3 build.py` erzeugt `bettermaps-mobil.html` (alles in einer Datei) und aktualisiert die Versionskennungen in `index.html`

## Backend (Supabase-Projekt `bettermaps`, Frankfurt)

- Edge Function `api` (`supabase/functions/api/index.ts`)
  - `GET /me`: Tarif, heutige Nutzung, Kartenschlüssel
  - `POST /search`: eine Google-Ergebnisseite, zählt 1 Abfrage
  - `POST /near`: Bedingungen (Spielplatz, Ladesäule …) aus der eigenen POI-Datenbank im Umkreis der Treffer, kostenlos
- Tabellen `profiles` (Tarif `free`/`pro`, `pro_until`) und `usage` (Google-Abfragen pro Nutzer und Tag)
- POI-Datenbank `private.poi_tile` (OpenStreetMap, Deutschland, Österreich, Schweiz, Italien): kompakt in Kacheln
  je Kategorie, ca. 150 MB. Außerhalb dieser Länder und bei Freitext-Bedingungen sucht die App bei Google.
- Limits in `private.settings`: `daily_limit_free`, `daily_limit_pro`, `daily_limit_global` (alle Nutzer zusammen)
- Secrets der Edge Function:
  - `GOOGLE_PLACES_KEY`: Server-Schlüssel, nur „Places API (New)“ erlaubt
  - `GOOGLE_MAPS_BROWSER_KEY`: Browser-Schlüssel, nur „Maps JavaScript API“, Websites `https://topazunionjk.github.io/*`
- Auth → URL Configuration: Site URL `https://topazunionjk.github.io/bettermaps/`, zusätzlich `http://localhost:5173/` als Redirect-URL

Nutzer auf Pro setzen (bis ein Zahlungsanbieter angebunden ist):

```sql
update public.profiles set plan = 'pro', pro_until = now() + interval '1 month'
where id = (select id from auth.users where email = 'kunde@example.com');
```

POI-Datenbank aktualisieren: läuft automatisch am 2. jedes Monats über GitHub Actions
(`.github/workflows/poi-import.yml`, Repository-Secret `SUPABASE_ACCESS_TOKEN` nötig) und lässt sich dort unter
Actions → „POI-Import“ → „Run workflow“ auch von Hand starten. Lokal (braucht `brew install osmium-tool`):

```sh
python3 tools/poi_import.py /tmp/osm germany austria switzerland italy
```

Die Kategorien kommen aus `CATEGORIES` in `app.js`. Neue Kategorien erst nach einem Import nutzbar.
