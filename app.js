'use strict';

// ---------- Freitext → OpenStreetMap-Tags ----------
// Die "Was"-Felder sind Freitext. Der Text wird in drei Stufen gedeutet:
//   1. bekannte Begriffe (kw) → feste OSM-Tags, z. B. "Spielplatz" → leisure=playground
//   2. Küchen-Begriffe → cuisine-Tag, allein ("Sushi") oder kombiniert ("italienisches Restaurant")
//   3. alles andere → Suche in Namen, Marken und Tag-Werten
// kw: Wortanfang genügt ("restaurant" trifft auch "Restaurants"); "=wort" verlangt das exakte Wort.
// Ein Filter passt, wenn alle seine Tags zutreffen; Wert ist ein String (exakt) oder {re} (Regex).
const CATEGORIES = [
  { label: 'Restaurant', food: true, kw: ['restaurant', 'gaststätte', 'gasthaus', 'gasthof', 'wirtshaus', '=lokal', '=essen'], filters: [{ amenity: 'restaurant' }] },
  { label: 'Café', food: true, kw: ['caf', 'kaffee'], filters: [{ amenity: 'cafe' }] },
  { label: 'Biergarten', food: true, kw: ['biergarten', 'biergärten'], filters: [{ amenity: 'biergarten' }] },
  { label: 'Imbiss', food: true, kw: ['imbiss', 'schnellimbiss', 'fastfood', '=fast'], filters: [{ amenity: 'fast_food' }] },
  { label: 'Eisdiele', kw: ['eisdiele', 'eiscaf', '=eis'], filters: [{ amenity: 'ice_cream' }, { amenity: 'cafe', cuisine: { re: 'ice_cream' } }] },
  { label: 'Bar', kw: ['=bar', '=bars', 'kneipe', '=pub', '=pubs', 'cocktailbar'], filters: [{ amenity: 'bar' }, { amenity: 'pub' }] },
  { label: 'Hotel', kw: ['hotel', 'unterkunft', 'unterkünfte', 'pension'], filters: [{ tourism: 'hotel' }, { tourism: 'guest_house' }] },
  { label: 'Bäckerei', kw: ['bäcker', 'backstube'], filters: [{ shop: 'bakery' }] },
  { label: 'Metzgerei', kw: ['metzger', 'fleischer'], filters: [{ shop: 'butcher' }] },
  { label: 'Supermarkt', kw: ['supermarkt', 'supermärkt', 'lebensmittel', 'einkaufen'], filters: [{ shop: 'supermarket' }] },
  { label: 'Drogerie', kw: ['drogerie'], filters: [{ shop: 'chemist' }] },
  { label: 'Getränkemarkt', kw: ['getränke'], filters: [{ shop: 'beverages' }] },
  { label: 'Baumarkt', kw: ['baumarkt', 'baumärkt'], filters: [{ shop: 'doityourself' }] },
  { label: 'Buchhandlung', kw: ['buchhandlung', 'buchladen', 'buchläden'], filters: [{ shop: 'books' }] },
  { label: 'Blumenladen', kw: ['blumen', 'florist'], filters: [{ shop: 'florist' }] },
  { label: 'Kiosk', kw: ['kiosk'], filters: [{ shop: 'kiosk' }] },
  { label: 'Friseur', kw: ['friseur', 'frisör', 'barber'], filters: [{ shop: 'hairdresser' }] },
  { label: 'Fahrradladen', kw: ['fahrradladen', 'fahrradläden', 'fahrradgeschäft', 'radladen'], filters: [{ shop: 'bicycle' }] },
  { label: 'Spielplatz', kw: ['spielplatz', 'spielplätz', 'kinderspielpl'], filters: [{ leisure: 'playground' }] },
  { label: 'E-Ladesäule', kw: ['ladesäule', 'eladesäule', 'ladestation', 'ladepunkt', 'schnelllade', 'wallbox', 'charger'], filters: [{ amenity: 'charging_station' }] },
  { label: 'Parkplatz', kw: ['parkplatz', 'parkplätz', 'parkhaus', 'parkhäus', 'tiefgarage', '=parken'], filters: [{ amenity: 'parking' }] },
  { label: 'Fahrradständer', kw: ['fahrradständer', 'radständer', 'fahrradparkpl', 'fahrradabstell'], filters: [{ amenity: 'bicycle_parking' }] },
  { label: 'Fahrradverleih', kw: ['fahrradverleih', 'radverleih', 'leihrad', 'leihräder'], filters: [{ amenity: 'bicycle_rental' }] },
  { label: 'Carsharing', kw: ['carsharing'], filters: [{ amenity: 'car_sharing' }] },
  { label: 'Taxistand', kw: ['taxi'], filters: [{ amenity: 'taxi' }] },
  { label: 'Haltestelle', kw: ['haltestelle', 'bushalte', '=bus', 'öpnv', '=tram', 'straßenbahn'], filters: [{ highway: 'bus_stop' }, { railway: 'station' }, { railway: 'halt' }, { railway: 'tram_stop' }] },
  { label: 'Bahnhof', kw: ['bahnhof', 'bahnhöf', '=bahn', '=zug', 's bahn', 'sbahn'], filters: [{ railway: 'station' }, { railway: 'halt' }] },
  { label: 'Park', kw: ['=park', '=parks', 'grünanlage', 'stadtpark'], filters: [{ leisure: 'park' }] },
  { label: 'Hundewiese', kw: ['hundewiese', 'hundepark', 'hundeauslauf'], filters: [{ leisure: 'dog_park' }] },
  { label: 'Toilette', kw: ['toilette', '=wc', '=wcs', '=klo', '=klos'], filters: [{ amenity: 'toilets' }] },
  { label: 'Wickeltisch', kw: ['wickel'], filters: [{ changing_table: 'yes' }] },
  { label: 'Trinkwasser', kw: ['trinkwasser', 'trinkbrunnen'], filters: [{ amenity: 'drinking_water' }] },
  { label: 'Apotheke', kw: ['apotheke'], filters: [{ amenity: 'pharmacy' }] },
  { label: 'Arzt', kw: ['arzt', 'ärzt', 'hausarzt', 'hausärzt', 'arztpraxis'], filters: [{ amenity: 'doctors' }] },
  { label: 'Zahnarzt', kw: ['zahnarzt', 'zahnärzt'], filters: [{ amenity: 'dentist' }] },
  { label: 'Krankenhaus', kw: ['krankenhaus', 'krankenhäus', 'klinik'], filters: [{ amenity: 'hospital' }] },
  { label: 'Geldautomat', kw: ['geldautomat', 'bankautomat', '=atm'], filters: [{ amenity: 'atm' }, { amenity: 'bank', atm: 'yes' }] },
  { label: 'Bank', kw: ['=bank', '=banken', 'sparkasse'], filters: [{ amenity: 'bank' }] },
  { label: 'Post', kw: ['=post', 'postfiliale', 'postamt'], filters: [{ amenity: 'post_office' }] },
  { label: 'Briefkasten', kw: ['briefkasten', 'briefkästen'], filters: [{ amenity: 'post_box' }] },
  { label: 'Paketstation', kw: ['paketstation', 'packstation', 'paketbox'], filters: [{ amenity: 'parcel_locker' }] },
  { label: 'Tankstelle', kw: ['tankstelle', '=tanken'], filters: [{ amenity: 'fuel' }] },
  { label: 'Schwimmbad', kw: ['schwimmbad', 'schwimmbäd', 'freibad', 'freibäd', 'hallenbad', 'hallenbäd', 'badestelle', 'badesee'], filters: [{ leisure: 'swimming_pool', access: 'yes' }, { leisure: 'water_park' }, { leisure: 'bathing_place' }, { leisure: 'swimming_area' }, { leisure: 'sports_centre', sport: { re: 'swimming' } }] },
  { label: 'Fitnessstudio', kw: ['fitness'], filters: [{ leisure: 'fitness_centre' }] },
  { label: 'Sportplatz', kw: ['sportplatz', 'sportplätz', 'fußballpl', 'bolzpl'], filters: [{ leisure: 'pitch' }] },
  { label: 'Kindergarten', kw: ['kindergarten', 'kindergärten', '=kita', '=kitas', 'krippe'], filters: [{ amenity: 'kindergarten' }] },
  { label: 'Schule', kw: ['schule', 'grundschule', 'gymnasium', 'gymnasien'], filters: [{ amenity: 'school' }] },
  { label: 'Bibliothek', kw: ['bibliothek', 'bücherei'], filters: [{ amenity: 'library' }] },
  { label: 'Kino', kw: ['kino'], filters: [{ amenity: 'cinema' }] },
  { label: 'Museum', kw: ['museum', 'museen'], filters: [{ tourism: 'museum' }] },
  { label: 'Kirche', kw: ['kirche'], filters: [{ amenity: 'place_of_worship' }] },
  { label: 'Polizei', kw: ['polizei'], filters: [{ amenity: 'police' }] },
];

const CUISINES = [
  { kw: ['italien'], re: 'italian|pizza|pasta' },
  { kw: ['pizz'], re: 'pizza|italian' },
  { kw: ['sushi'], re: 'sushi' },
  { kw: ['japan', 'ramen'], re: 'japanese|sushi|ramen' },
  { kw: ['chines'], re: 'chinese' },
  { kw: ['asiat'], re: 'asian|chinese|vietnamese|thai|japanese|korean' },
  { kw: ['thai'], re: 'thai' },
  { kw: ['vietnam'], re: 'vietnamese' },
  { kw: ['korea'], re: 'korean' },
  { kw: ['indisch', '=inder'], re: 'indian' },
  { kw: ['griech'], re: 'greek' },
  { kw: ['türk'], re: 'turkish|kebab' },
  { kw: ['döner', 'kebab', 'kebap'], re: 'kebab' },
  { kw: ['burger'], re: 'burger' },
  { kw: ['bayerisch', 'bayrisch'], re: 'bavarian' },
  { kw: ['deutsch', 'gutbürgerlich'], re: 'german|bavarian|regional' },
  { kw: ['mexikan'], re: 'mexican' },
  { kw: ['spanisch', 'tapas'], re: 'spanish|tapas' },
  { kw: ['französ'], re: 'french' },
  { kw: ['steak'], re: 'steak' },
  { kw: ['fisch'], re: 'fish|seafood' },
  { kw: ['kroat', 'balkan'], re: 'croatian|balkan' },
];
const FOOD_FILTERS = [{ amenity: 'restaurant' }, { amenity: 'fast_food' }, { amenity: 'cafe' }];
// Für unbekannte Begriffe: Text im Namen, in der Marke oder im Tag-Wert suchen – aber nur
// bei Objekten mit einem dieser Tags (sonst müsste der Server jede benannte Straße prüfen).
const POI_KEYS = ['shop', 'amenity', 'leisure', 'tourism', 'craft', 'healthcare', 'office'];
const ANY = { any: true };

const tokenize = text => text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);

function kwHit(tokens, kw) {
  if (kw[0] === '=') return tokens.includes(kw.slice(1));
  if (kw.includes(' ')) return tokens.join(' ').includes(kw);
  return tokens.some(t => t.startsWith(kw));
}

// Freitext → { label, filters, fuzzy } oder null, wenn nichts Brauchbares eingegeben wurde.
function resolve(text) {
  const label = text.trim();
  const tokens = tokenize(label);
  if (!tokens.length) return null;

  let cat = null, best = 0;
  for (const c of CATEGORIES) {
    for (const kw of c.kw) {
      const len = kw.replace('=', '').length;
      if (len > best && kwHit(tokens, kw)) { cat = c; best = len; }
    }
  }
  const cuisine = CUISINES.find(c => c.kw.some(kw => kwHit(tokens, kw)));
  if (cuisine && (!cat || cat.food)) {
    const base = cat ? cat.filters : FOOD_FILTERS;
    return { label, filters: base.map(f => ({ ...f, cuisine: { re: cuisine.re } })) };
  }
  if (cat) return { label, filters: cat.filters };

  const joined = tokens.join('[ _-]');
  if (joined.length < 2) return null;
  // Nur am Wortanfang treffen ("dm" soll nicht "Feldmann" finden); kurze Begriffe als ganzes Wort.
  const re = '(^|[ _;,./-])' + joined + (joined.length <= 3 ? '($|[ _;,./-])' : '');
  return {
    label,
    fuzzy: true,
    filters: [
      ...POI_KEYS.flatMap(k => [{ [k]: ANY, name: { re } }, { [k]: ANY, brand: { re } }, { [k]: { re } }]),
      { amenity: ANY, cuisine: { re } },
    ],
  };
}

const RADII = [100, 200, 300, 500, 750, 1000, 1500, 2000, 5000];
const COLORS = ['#fbbc04', '#34a853', '#c58af9', '#4ecde6', '#ff8bcb', '#8ab4f8']; // gut lesbar auf dunkel
const MAIN_COLOR = '#ea4335'; // Google-Maps-Rot für die Treffer
const MAX_DIAGONAL_KM = 80;
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ---------- kleine Helfer ----------
const $ = s => document.querySelector(s);

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') Object.assign(n.style, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}

function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const fmtDist = m => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const fmtRadius = m => (m < 1000 ? `${m} m` : `${m / 1000} km`);

function matches(tags, cat) {
  return cat.filters.some(f => Object.entries(f).every(([k, v]) =>
    typeof v === 'string' ? tags[k] === v : tags[k] != null && (v.any || new RegExp(v.re, 'i').test(tags[k]))));
}

function expandBbox(b, meters) {
  const dLat = meters / 111320;
  const dLon = meters / (111320 * Math.cos(((b.s + b.n) / 2) * Math.PI / 180));
  return { s: b.s - dLat, n: b.n + dLat, w: b.w - dLon, e: b.e + dLon };
}

const inBbox = (p, b) => p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e;

// ---------- Karte ----------
const map = L.map('map').setView([47.8571, 12.1181], 13);
const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  className: 'osm-tiles', // per CSS abgedunkelt
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
}).addTo(map);

// ---------- Google Maps als Kartendienst (optional, eigener API-Schlüssel) ----------
// Die Google-Karte wird über die offizielle Maps JavaScript API eingebunden
// (Leaflet-Plugin GoogleMutant). Ohne Schlüssel bleibt es bei OpenStreetMap.
const GM_KEY_STORE = 'bettermaps.googleMapsKey';
let googleLayers = null, layerControl = null, gmLoading = false;

function storedKey() {
  try { return localStorage.getItem(GM_KEY_STORE) || ''; } catch { return ''; }
}

function gmMessage(text, isError = false) {
  const m = $('#gmMsg');
  m.textContent = text;
  m.className = 'r-sub' + (isError ? ' error' : '');
}

function useOsm() {
  if (googleLayers) Object.values(googleLayers).forEach(l => map.removeLayer(l));
  if (layerControl) { layerControl.remove(); layerControl = null; }
  googleLayers = null;
  if (!map.hasLayer(osmLayer)) osmLayer.addTo(map);
  $('#mapProvider').textContent = 'OpenStreetMap';
}

// Googles Nachtmodus-Stil für die Straßenkarte
const GM_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#263c3f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9a76' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1f2835' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#17263c' }] },
];

function useGoogle() {
  googleLayers = {
    'Google Maps': L.gridLayer.googleMutant({ type: 'roadmap', maxZoom: 21, styles: GM_DARK }),
    'Google Satellit': L.gridLayer.googleMutant({ type: 'hybrid', maxZoom: 21 }),
  };
  map.removeLayer(osmLayer);
  googleLayers['Google Maps'].addTo(map);
  layerControl = L.control.layers({ ...googleLayers, OpenStreetMap: osmLayer }, null, { position: 'topright' }).addTo(map);
  $('#mapProvider').textContent = 'Google Maps';
  gmMessage('Google Maps ist aktiv. Oben rechts in der Karte kannst du umschalten.');
}

function loadGoogle(key) {
  if (!key) return;
  if (window.google?.maps || gmLoading) {
    // Die Google-API lässt sich nur einmal pro Seite laden – mit neuem Schlüssel neu starten.
    location.reload();
    return;
  }
  gmLoading = true;
  gmMessage('Lade Google Maps …');
  window.gm_authFailure = () => {
    useOsm();
    gmMessage('Google hat den Schlüssel abgelehnt. Ist die „Maps JavaScript API“ aktiviert, die Abrechnung eingerichtet und http://localhost:5173 als Website erlaubt?', true);
    $('#mapSettings').open = true;
  };
  window.__bettermapsGmReady = () => { gmLoading = false; useGoogle(); };
  const s = el('script', {
    src: 'https://maps.googleapis.com/maps/api/js?loading=async&language=de&region=DE&callback=__bettermapsGmReady&key=' + encodeURIComponent(key),
    async: true,
    onerror: () => { gmLoading = false; gmMessage('Google Maps konnte nicht geladen werden (Netzwerk?).', true); },
  });
  document.head.append(s);
}

$('#gmSave').onclick = () => {
  const key = $('#gmKey').value.trim();
  if (!key) return gmMessage('Bitte zuerst einen Schlüssel eintragen.', true);
  try { localStorage.setItem(GM_KEY_STORE, key); } catch { /* privater Modus: gilt nur für diese Sitzung */ }
  loadGoogle(key);
};
$('#gmClear').onclick = () => {
  try { localStorage.removeItem(GM_KEY_STORE); } catch { /* egal */ }
  $('#gmKey').value = '';
  useOsm();
  gmMessage('Schlüssel entfernt – es wird wieder OpenStreetMap angezeigt.');
};
if (storedKey()) { $('#gmKey').value = storedKey(); loadGoogle(storedKey()); }
const poiLayer = L.layerGroup().addTo(map);
const highlightLayer = L.layerGroup().addTo(map);
const resultLayer = L.layerGroup().addTo(map);

// ---------- Formular ----------
let conditions = [
  { text: 'Spielplatz', radius: 500 },
  { text: 'E-Ladesäule', radius: 500 },
];

const suggestions = $('#whatList');
for (const c of CATEGORIES) suggestions.append(el('option', { value: c.label }));
for (const v of ['Italienisches Restaurant', 'Pizza', 'Sushi', 'Burger']) suggestions.append(el('option', { value: v }));

function renderConditions() {
  const box = $('#conds');
  box.replaceChildren();
  conditions.forEach((c, i) => {
    const what = el('input', { value: c.text, placeholder: 'z. B. Spielplatz, Bäckerei, dm …', autocomplete: 'off' });
    what.setAttribute('list', 'whatList');
    what.oninput = () => { c.text = what.value; };
    const radius = el('select', { title: 'Maximale Entfernung' });
    for (const r of RADII) radius.append(el('option', { value: r, textContent: `≤ ${fmtRadius(r)}` }));
    radius.value = c.radius;
    radius.onchange = () => { c.radius = Number(radius.value); };
    box.append(el('div', { className: 'cond' },
      el('span', { className: 'dot', style: { background: COLORS[i % COLORS.length] } }),
      what,
      radius,
      el('button', { type: 'button', className: 'rm ghost', textContent: '✕', title: 'Bedingung entfernen',
        onclick: () => { conditions.splice(i, 1); renderConditions(); } }),
    ));
  });
  if (!conditions.length) {
    box.append(el('div', { className: 'r-sub', textContent: 'Keine Bedingungen – es werden alle Treffer gezeigt.', style: { marginBottom: '6px' } }));
  }
}

$('#addCond').onclick = () => {
  conditions.push({ text: '', radius: 500 });
  renderConditions();
  $('#conds').lastElementChild.querySelector('input').focus();
};
renderConditions();

function setStatus(content, isError = false) {
  const s = $('#status');
  s.className = isError ? 'error' : '';
  s.replaceChildren(...[].concat(content));
}

function setBusy(busy) {
  $('#go').disabled = busy;
  $('#searchView').disabled = busy;
  $('#go').textContent = busy ? 'Suche läuft …' : 'Suchen';
  document.body.classList.toggle('loading', busy); // Fortschrittsbalken
}

// Status mit Lade-Kringel
const setLoading = text => setStatus([el('span', { className: 'spinner' }), text]);

// Platzhalter-Zeilen, solange die Treffer laden
function showSkeleton() {
  $('#results').replaceChildren(...Array.from({ length: 4 }, () =>
    el('li', { className: 'skeleton' }, el('i'), el('i'), el('i'))));
}

// ---------- Datenquellen ----------
async function geocode(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de&polygon_geojson=1&polygon_threshold=0.0003&q=' + encodeURIComponent(q);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Die Ortssuche ist gerade nicht erreichbar.');
  const data = await res.json();
  if (!data.length) throw new Error(`Den Ort „${q}“ habe ich nicht gefunden.`);
  const [s, n, w, e] = data[0].boundingbox.map(Number);
  // Hat der Ort eine echte Grenze, filtern wir die Treffer später exakt darauf
  // (im Browser – so funktioniert die Abfrage auf jedem Overpass-Server und bleibt schnell).
  const g = data[0].geojson;
  const polygons = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : null;
  return { bbox: { s, n, w, e }, polygons, name: data[0].display_name.split(',')[0] };
}

function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// polygons: Liste von Polygonen, jedes [Außenring, ...Löcher] mit [lon, lat]-Punkten
const inPolygons = (p, polygons) =>
  polygons.some(([outer, ...holes]) => inRing(p, outer) && !holes.some(h => inRing(p, h)));

function buildQuery(mainCat, bbox, conds) {
  const box = b => `(${b.s},${b.w},${b.n},${b.e})`;
  const lines = (cat, where) => cat.filters
    .map(f => '  nwr' + Object.entries(f).map(([k, v]) => (typeof v === 'string' ? `["${k}"="${v}"]` : v.any ? `["${k}"]` : `["${k}"~"${v.re}",i]`)).join('') + where + ';')
    .join('\n');
  const parts = [lines(mainCat, box(bbox))];
  for (const c of conds) parts.push(lines(c, box(expandBbox(bbox, c.radius))));
  return `[out:json][timeout:60];\n(\n${parts.join('\n')}\n);\nout center tags;`;
}

// Die öffentlichen Overpass-Server sind oft überlastet. Deshalb: Server der Reihe
// nach anfragen, aber nicht auf einen hängenden warten – nach STAGGER_MS (oder
// sofort bei einem Fehler) startet zusätzlich der nächste. Die erste gültige
// Antwort gewinnt, alle anderen Anfragen werden abgebrochen.
const STAGGER_MS = 2500;
const OVERPASS_TIMEOUT_MS = 90000;

function overpass(query) {
  return new Promise((resolve, reject) => {
    const controllers = [];
    let next = 0, pending = 0, done = false, lastErr, timer;

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      controllers.forEach(c => c.abort());
      fn(value);
    };

    const start = () => {
      clearTimeout(timer);
      if (done || next >= OVERPASS.length) return;
      const url = OVERPASS[next++];
      const ctrl = new AbortController();
      controllers.push(ctrl);
      pending++;
      const kill = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
      fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal })
        .then(res => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(json => {
          if (json.remark && /timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
          finish(resolve, json.elements || []);
        })
        .catch(err => {
          if (done) return;
          lastErr = err.name === 'AbortError' ? new Error('Zeitüberschreitung') : err;
          pending--;
          if (next < OVERPASS.length) start();
          else if (!pending) finish(reject, new Error('Die OpenStreetMap-Datenserver sind gerade nicht erreichbar oder überlastet (' + lastErr.message + '). Bitte gleich nochmal versuchen oder einen kleineren Bereich wählen.'));
        })
        .finally(() => clearTimeout(kill));
      timer = setTimeout(start, STAGGER_MS);
    };
    start();
  });
}

// Auf schmalen Bildschirmen klappt das Formular nach der Suche zu einer Zeile zusammen,
// damit die Trefferliste Platz hat. Ein Tipp darauf öffnet es wieder.
const narrow = window.matchMedia('(max-width: 760px)');

function collapseForm(summary) {
  if (!narrow.matches) return;
  $('#form').hidden = true;
  const b = $('#editSearch');
  b.replaceChildren(el('span', { className: 'what', textContent: summary }), el('span', { className: 'edit', textContent: 'Ändern' }));
  b.hidden = false;
  map.invalidateSize();
}

function expandForm() {
  $('#form').hidden = false;
  $('#editSearch').hidden = true;
}
$('#editSearch').onclick = expandForm;
narrow.addEventListener('change', expandForm);

// ---------- Bottom Sheet (nur schmale Bildschirme) ----------
// Die Seite selbst scrollt – nur so blendet Safari auf dem iPhone seine Leisten beim Scrollen aus.
//   half = Ausgangslage: Karte oben, Blatt darunter · hochscrollen = Blatt schiebt sich über die Karte
//   peek = Karte im Vollbild: ganz oben am Griff (oder im Blatt) nach unten ziehen; Tipp/hochziehen holt es zurück
const sheet = $('#panel'), grip = $('#grip'), mapEl = $('#map');
const SHEET_PEEK = 110; // sichtbare Höhe des Blatts im Karten-Vollbild
let sheetState = 'half', sheetOffset = 0, mapResizeTimer;

const peekOffset = () => Math.max(0, window.innerHeight - SHEET_PEEK - sheet.offsetTop);

function setSheet(state, { sync = false } = {}) {
  clearTimeout(mapResizeTimer);
  if (!narrow.matches) {
    sheet.style.transform = sheet.style.transition = mapEl.style.height = '';
    sheetState = 'half';
    return;
  }
  sheetState = state;
  sheet.dataset.state = state;
  sheetOffset = state === 'peek' ? peekOffset() : 0;
  sheet.style.transition = '';
  sheet.style.transform = sheetOffset ? `translateY(${sheetOffset}px)` : '';
  if (state === 'peek') {
    // Karte sofort auf volle Höhe, damit beim Herunterschieben nichts leer aufblitzt
    mapEl.style.height = window.innerHeight + 'px';
    map.invalidateSize({ animate: false });
  } else if (mapEl.style.height) {
    // Karte erst nach der Animation wieder verkleinern
    const apply = () => { mapEl.style.height = ''; map.invalidateSize({ animate: false }); };
    if (sync) apply(); else mapResizeTimer = setTimeout(apply, 300);
  }
}

let drag = null;
sheet.addEventListener('touchstart', e => {
  if (!narrow.matches || e.touches.length !== 1) return;
  const y = e.touches[0].clientY;
  drag = { y0: y, start: sheetOffset, from: sheetState, active: false, lastY: y, lastT: e.timeStamp, v: 0 };
}, { passive: true });

sheet.addEventListener('touchmove', e => {
  if (!drag) return;
  const y = e.touches[0].clientY;
  if (!drag.active) {
    const dy = y - drag.y0;
    if (Math.abs(dy) < 6) return;
    // Das Blatt selbst bewegen wir nur im Karten-Vollbild oder ganz oben beim Herunterziehen;
    // alles andere ist normales Scrollen der Seite (dabei blendet Safari seine Leisten aus).
    const moveSheet = sheetState === 'peek' || (window.scrollY <= 0 && dy > 0);
    if (!moveSheet) { drag = null; return; }
    drag.active = true;
    drag.y0 = y;
    sheet.style.transition = 'none';
  }
  e.preventDefault();
  sheetOffset = Math.max(0, Math.min(peekOffset(), drag.start + y - drag.y0));
  sheet.style.transform = `translateY(${sheetOffset}px)`;
  if (sheetOffset > 0 && !mapEl.style.height) { mapEl.style.height = window.innerHeight + 'px'; map.invalidateSize({ animate: false }); }
  const dt = e.timeStamp - drag.lastT;
  if (dt > 0) drag.v = (y - drag.lastY) / dt; // px/ms, positiv = nach unten
  drag.lastY = y; drag.lastT = e.timeStamp;
}, { passive: false });

function endDrag() {
  if (!drag?.active) { drag = null; return; }
  const target = Math.abs(drag.v) > 0.35
    ? (drag.v > 0 ? 'peek' : 'half')                        // Schwung entscheidet
    : (sheetOffset > peekOffset() / 2 ? 'peek' : 'half');    // sonst die nähere Stufe
  drag = null;
  setSheet(target);
}
sheet.addEventListener('touchend', endDrag);
sheet.addEventListener('touchcancel', endDrag);

// Tipp auf den Griff: Vollbild-Karte → Ausgangslage; Ausgangslage → Liste groß; Liste → Karte zeigen
grip.addEventListener('click', () => {
  if (sheetState === 'peek') return setSheet('half');
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
  else window.scrollTo({ top: sheet.offsetTop, behavior: 'smooth' });
});

// Mausrad/Trackpad (schmales Fenster am Rechner): ganz oben weiter "hochscrollen" = Karte im Vollbild
let lastWheel = 0;
window.addEventListener('wheel', e => {
  if (!narrow.matches) return;
  const intoPeek = sheetState === 'half' && window.scrollY <= 0 && e.deltaY < 0;
  const outOfPeek = sheetState === 'peek' && e.deltaY > 0;
  if (!intoPeek && !outOfPeek) return; // normales Scrollen der Seite
  e.preventDefault();
  if (e.timeStamp - lastWheel < 450) return;
  lastWheel = e.timeStamp;
  setSheet(intoPeek ? 'peek' : 'half');
}, { passive: false });

// Falls die Seite im Karten-Vollbild doch gescrollt wird (z. B. Tastatur), zurück in die Ausgangslage
window.addEventListener('scroll', () => { if (sheetState === 'peek' && window.scrollY > 4) setSheet('half', { sync: true }); }, { passive: true });

narrow.addEventListener('change', () => { setSheet('half', { sync: true }); map.invalidateSize(); });
window.addEventListener('resize', () => { if (sheetState === 'peek') setSheet('peek', { sync: true }); });
setSheet('half', { sync: true });

// ---------- Suche ----------
let current = { results: [], conds: [] };

async function runSearch(useMapView) {
  setBusy(true);
  showSkeleton();
  try {
    const mainCat = resolve($('#main').value);
    if (!mainCat) throw new Error('Bitte eingeben, was du suchst.');
    const conds = conditions.filter(c => c.text.trim()).map((c, i) => {
      const r = resolve(c.text);
      if (!r) throw new Error(`Mit der Bedingung „${c.text.trim()}“ kann ich nichts anfangen.`);
      return { ...r, radius: c.radius, color: COLORS[conditions.indexOf(c) % COLORS.length] };
    });

    let bbox, where, polygons = null;
    if (useMapView) {
      const b = map.getBounds();
      bbox = { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() };
      where = 'im Kartenausschnitt';
    } else {
      const place = $('#place').value.trim();
      if (!place) throw new Error('Bitte einen Ort eingeben.');
      setLoading('Suche Ort …');
      const g = await geocode(place);
      bbox = g.bbox;
      polygons = g.polygons;
      where = 'in ' + g.name;
      map.fitBounds([[bbox.s, bbox.w], [bbox.n, bbox.e]]);
    }

    const diagKm = haversine({ lat: bbox.s, lon: bbox.w }, { lat: bbox.n, lon: bbox.e }) / 1000;
    if (diagKm > MAX_DIAGONAL_KM) {
      throw new Error(`Der Bereich ist zu groß (${Math.round(diagKm)} km Diagonale, max. ${MAX_DIAGONAL_KM} km). Bitte einen kleineren Ort wählen oder näher heranzoomen.`);
    }

    setLoading('Lade OpenStreetMap-Daten … (kann bei ausgelasteten Servern bis zu einer Minute dauern)');
    const elements = await overpass(buildQuery(mainCat, bbox, conds));

    const points = [];
    for (const e of elements) {
      const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
      if (lat == null || lon == null || !e.tags) continue;
      points.push({ id: `${e.type}/${e.id}`, lat, lon, tags: e.tags });
    }

    const mains = points.filter(p => matches(p.tags, mainCat) && inBbox(p, bbox) && (!polygons || inPolygons(p, polygons)));
    const isPublic = p => p.tags.access !== 'private' && p.tags.access !== 'no';
    const pools = conds.map(c => points.filter(p => matches(p.tags, c) && isPublic(p)));

    const results = [];
    for (const m of mains) {
      const near = [];
      let ok = true;
      for (let i = 0; i < conds.length && ok; i++) {
        const hits = [];
        for (const p of pools[i]) {
          if (p.id === m.id) continue;
          const d = haversine(m, p);
          if (d <= conds[i].radius) hits.push({ p, d });
        }
        if (!hits.length) ok = false;
        else near.push(hits.sort((a, b) => a.d - b.d));
      }
      if (ok) results.push({ ...m, near, score: near.reduce((s, h) => s + h[0].d, 0) });
    }
    results.sort((a, b) => a.score - b.score || (a.tags.name || '').localeCompare(b.tags.name || ''));

    current = { results, conds, mainCat };
    collapseForm(`${mainCat.label} ${where}` + (conds.length ? ` · ${conds.map(c => c.label).join(', ')}` : ''));
    render(mains.length, where);
  } catch (err) {
    resultLayer.clearLayers(); poiLayer.clearLayers(); highlightLayer.clearLayers();
    $('#results').replaceChildren();
    expandForm();
    setStatus(err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

// ---------- Darstellung ----------
function displayName(r) {
  return r.tags.name || r.tags.brand || `${current.mainCat.label} (ohne Namen)`;
}

function address(tags) {
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const city = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ');
}

function popupContent(r) {
  const t = r.tags;
  const box = el('div', { className: 'popup' }, el('b', { textContent: displayName(r) }));
  if (t.cuisine) box.append(el('div', { textContent: t.cuisine.replace(/_/g, ' ').replace(/;/g, ', ') }));
  if (address(t)) box.append(el('div', { textContent: address(t) }));
  if (t.opening_hours) box.append(el('div', { textContent: '🕑 ' + t.opening_hours }));
  r.near.forEach((hits, i) => {
    const c = current.conds[i];
    box.append(el('div', {},
      el('span', { className: 'dot', style: { background: c.color, width: '9px', height: '9px', marginRight: '5px' } }),
      `${c.label}: ${fmtDist(hits[0].d)}` + (hits.length > 1 ? ` (${hits.length} im Umkreis)` : '')));
  });
  const links = el('div', { className: 'links' });
  const gq = t.name ? `${t.name}, ${address(t) || `${r.lat},${r.lon}`}` : `${r.lat},${r.lon}`;
  links.append(el('a', { href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(gq), target: '_blank', rel: 'noopener', textContent: 'Google Maps' }));
  links.append(el('a', { href: 'https://www.openstreetmap.org/' + r.id, target: '_blank', rel: 'noopener', textContent: 'OpenStreetMap' }));
  const site = t.website || t['contact:website'];
  if (site && /^https?:\/\//i.test(site)) links.append(el('a', { href: site, target: '_blank', rel: 'noopener', textContent: 'Website' }));
  box.append(links);
  return box;
}

function render(totalMain, where) {
  const { results, conds, mainCat } = current;
  resultLayer.clearLayers(); poiLayer.clearLayers(); highlightLayer.clearLayers();

  const total = `${totalMain} × ${mainCat.label} ${where}`;
  if (!totalMain) setStatus(`Keine Treffer für „${mainCat.label}“ ${where}.`);
  else if (!conds.length) setStatus([el('strong', { textContent: total }), ' gefunden.']);
  else setStatus([el('strong', { textContent: `${results.length} von ${totalMain}` }), ` × ${mainCat.label} ${where} ${results.length === 1 ? 'erfüllt' : 'erfüllen'} alle Bedingungen.`]);

  const fuzzy = [mainCat, ...conds].filter(c => c.fuzzy).map(c => `„${c.label}“`);
  if (fuzzy.length) {
    $('#status').append(el('div', { className: 'r-sub', textContent: `${fuzzy.join(', ')} kenne ich nicht als Kategorie – gesucht wurde in Namen, Marken und Stichworten.` }));
  }

  // Umgebungs-Punkte, die zu mindestens einem Treffer gehören
  const seen = new Set();
  results.forEach(r => r.near.forEach((hits, i) => hits.forEach(({ p }) => {
    const key = i + '|' + p.id;
    if (seen.has(key)) return;
    seen.add(key);
    L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: conds[i].color, fillOpacity: 1 })
      .bindTooltip(conds[i].label + (p.tags.name ? ': ' + p.tags.name : ''))
      .addTo(poiLayer);
  })));

  const list = $('#results');
  list.replaceChildren();
  // Handy: Blatt auf die mittlere Stufe, damit Karte und erste Treffer zusammen sichtbar sind
  window.scrollTo(0, 0);
  setSheet('half', { sync: true });
  results.forEach((r, idx) => {
    r.marker = L.circleMarker([r.lat, r.lon], { radius: 9, color: '#fff', weight: 2, fillColor: MAIN_COLOR, fillOpacity: 1 })
      .bindPopup(() => popupContent(r))
      .on('click', () => select(idx, false))
      .addTo(resultLayer);

    const sub = [r.tags.cuisine && r.tags.cuisine.replace(/_/g, ' ').replace(/;/g, ', '), address(r.tags)].filter(Boolean).join(' · ');
    const chips = el('div', { className: 'chips' });
    r.near.forEach((hits, i) => chips.append(el('span', { className: 'chip' },
      el('span', { className: 'dot', style: { background: conds[i].color, width: '9px', height: '9px' } }),
      `${conds[i].label} ${fmtDist(hits[0].d)}`)));
    r.li = el('li', { onclick: () => select(idx, true) },
      el('div', { className: 'r-name', textContent: displayName(r) }),
      sub ? el('div', { className: 'r-sub', textContent: sub }) : null,
      conds.length ? chips : null);
    list.append(r.li);
  });

  if (results.length) {
    map.fitBounds(L.latLngBounds(results.map(r => [r.lat, r.lon])).pad(0.15), { maxZoom: 16 });
  }
}

function select(idx, fromList) {
  const { results, conds } = current;
  const r = results[idx];
  results.forEach(x => x.li.classList.remove('active'));
  r.li.classList.add('active');
  highlightLayer.clearLayers();

  let maxRadius = 150;
  r.near.forEach((hits, i) => {
    const c = conds[i];
    maxRadius = Math.max(maxRadius, c.radius);
    L.circle([r.lat, r.lon], { radius: c.radius, color: c.color, weight: 1.5, dashArray: '5 6', fillOpacity: 0.04, interactive: false }).addTo(highlightLayer);
    const n = hits[0].p;
    L.polyline([[r.lat, r.lon], [n.lat, n.lon]], { color: c.color, weight: 3, interactive: false }).addTo(highlightLayer);
  });

  if (fromList) {
    // Handy: Karte wieder zeigen, falls das Blatt sie gerade verdeckt
    if (narrow.matches && window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' }); // Karte freilegen
    // Ohne Animation schwenken: sonst überschreibt sie das automatische Einpassen des Popups
    // und es ragt auf kleinen Karten (Handy) oben aus dem Bild.
    map.stop(); // eine noch laufende Kartenanimation würde die Position verfälschen
    map.fitBounds(L.latLng(r.lat, r.lon).toBounds(maxRadius * 2.4), { animate: false });
    r.marker.openPopup();
    const pop = r.marker.getPopup().getElement()?.getBoundingClientRect();
    const box = map.getContainer().getBoundingClientRect();
    if (pop && pop.top < box.top + 8) map.panBy([0, pop.top - box.top - 8], { animate: false });
  } else if (!narrow.matches) {
    r.li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ---------- Events ----------
$('#form').addEventListener('submit', e => { e.preventDefault(); runSearch(false); });
$('#searchView').addEventListener('click', () => runSearch(true));
