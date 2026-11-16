# NextToMaps

Orte finden, bei denen auch die Umgebung passt – z. B. ein Restaurant in Rosenheim mit Spielplatz und E-Ladesäule in 500 m Umkreis.

- Suche: Google Places (Text Search) über das eigene Backend, Anmeldung per Code aus einer E-Mail
- Karte: Google Maps (Schlüssel kommt vom Backend), sonst OpenStreetMap
- Entwickler: mit eigenem Google-Schlüssel (nur im Browser gespeichert) direkt ohne Konto; dann auch OpenStreetMap wählbar
- `python3 build.py` erzeugt `bettermaps-mobil.html` (alles in einer Datei) und aktualisiert die Versionskennungen in `index.html`

## Backend (Supabase-Projekt `bettermaps`, Frankfurt)

- Edge Function `api` (`supabase/functions/api/index.ts`)
  - `GET /me`: Tarif, Nutzung im Monat, Kartenschlüssel
  - `POST /search`: eine Google-Ergebnisseite, zählt 1 Abfrage
  - `POST /near`: Bedingungen (Spielplatz, Ladesäule …) aus der eigenen POI-Datenbank im Umkreis der Treffer, kostenlos
- Tabellen `profiles` (Tarif `free`/`plus`/`pro`, `plan_until`, eigenes `monthly_limit` z. B. für Tester) und `usage` (Google-Abfragen pro Nutzer und Tag)
- POI-Datenbank `private.poi_tile` (OpenStreetMap, Deutschland, Österreich, Schweiz, Italien): kompakt in Kacheln
  je Kategorie, ca. 150 MB. Außerhalb dieser Länder und bei Freitext-Bedingungen sucht die App bei Google.
- Limits in `private.settings`: `monthly_limit_free` (10), `monthly_limit_plus` (100), `monthly_limit_pro` (200) pro Kalendermonat,
  `daily_limit_global` (alle Nutzer zusammen pro Tag, Kostenbremse)
- Secrets der Edge Function:
  - `GOOGLE_PLACES_KEY`: Server-Schlüssel, nur „Places API (New)“ erlaubt
  - `GOOGLE_MAPS_BROWSER_KEY`: Browser-Schlüssel, nur „Maps JavaScript API“, Websites `https://nexttomaps.com/*`
- Freischaltung neuer Konten: Eine neue Adresse legt nur eine Anmeldeanfrage an (`private.login_request`,
  höchstens 3 pro IP und 30 insgesamt pro Stunde), und an `ADMIN_EMAIL` geht eine Mail mit einem Link
  (30 Tage gültig), der in der App „Freischalten“/„Ablehnen“ anbietet. Erst beim Freischalten entsteht das
  Supabase-Konto, und der Nutzer bekommt seinen Anmeldecode per Mail. In Supabase unter Authentication →
  Sign In / Providers „Allow new users to sign up“ ausschalten, damit niemand an der Anfrage vorbei ein Konto anlegt.
  Secrets: `ADMIN_EMAIL`, `APPROVE_SECRET` (zufällig), `SMTP_HOST` (z. B. `smtp.ionos.de`, Standard Gmail),
  `SMTP_USER` (Absenderadresse), `SMTP_PASS` (Postfach- bzw. App-Passwort).
- Anmeldecodes verschickt ebenfalls die Edge Function über diese SMTP-Daten (Mail Englisch, darunter Deutsch),
  nicht Supabase Auth. Limit je Konto 1 Mail pro 60 s und 6 pro Stunde, je IP 30 pro Stunde (`private.code_mail`).
  Nur ohne SMTP-Secrets fällt die App auf die Mail von Supabase Auth zurück.
  Von Hand: `update public.profiles set status = 'approved' where id = (select id from auth.users where email = '…');`
- Auth → URL Configuration: Site URL `https://nexttomaps.com/`, Redirect-URLs `https://nexttomaps.com/app/` und `https://nexttomaps.com/en/app/`, zusätzlich `http://localhost:5173/` als Redirect-URL

Nutzer auf Plus/Pro setzen oder Testern ein eigenes Monatslimit geben (bis ein Zahlungsanbieter angebunden ist):

```sql
update public.profiles set plan = 'pro', plan_until = now() + interval '1 month'
where id = (select id from auth.users where email = 'kunde@example.com');
update public.profiles set monthly_limit = 500   -- null = Limit des Tarifs
where id = (select id from auth.users where email = 'tester@example.com');
```

POI-Datenbank aktualisieren: läuft automatisch am 2. jedes Monats über GitHub Actions
(`.github/workflows/poi-import.yml`, Repository-Secret `SUPABASE_ACCESS_TOKEN` nötig) und lässt sich dort unter
Actions → „POI-Import“ → „Run workflow“ auch von Hand starten. Lokal (braucht `brew install osmium-tool`):

```sh
python3 tools/poi_import.py /tmp/osm germany austria switzerland italy
```

Die Kategorien kommen aus `CATEGORIES` in `app.js`. Neue Kategorien erst nach einem Import nutzbar.
