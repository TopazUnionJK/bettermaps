'use strict';

// Sprache: /en/app/ setzt <html lang="en">; t('deutsch', 'english') wählt den passenden Text.
const EN = document.documentElement.lang === 'en';
const t = (de, en) => (EN ? en : de);
const catName = c => (EN && c.en) || c.label; // angezeigter Kategoriename

// ---------- Freitext → OpenStreetMap-Tags ----------
// Die "Was"-Felder sind Freitext. Der Text wird in drei Stufen gedeutet:
//   1. bekannte Begriffe (kw) → feste OSM-Tags, z. B. "Spielplatz" → leisure=playground
//   2. Küchen-Begriffe → cuisine-Tag, allein ("Sushi") oder kombiniert ("italienisches Restaurant")
//   3. alles andere → Suche in Namen, Marken und Tag-Werten
// kw: Wortanfang genügt ("restaurant" trifft auch "Restaurants"); "=wort" verlangt das exakte Wort.
// Ein Filter passt, wenn alle seine Tags zutreffen; Wert ist ein String (exakt) oder {re} (Regex).
const CATEGORIES = [
  { label: 'Restaurant', en: 'Restaurant', food: true, kw: ['restaurant', 'gaststätte', 'gasthaus', 'gasthof', 'wirtshaus', '=lokal', '=essen', '=diner', '=eatery'], filters: [{ amenity: 'restaurant' }] },
  { label: 'Café', en: 'Café', food: true, kw: ['caf', 'kaffee', 'coffee', '=cafe', '=cafes'], filters: [{ amenity: 'cafe' }] },
  { label: 'Biergarten', en: 'Beer garden', food: true, kw: ['biergarten', 'biergärten', 'beer garden', 'beergarden'], filters: [{ amenity: 'biergarten' }] },
  { label: 'Imbiss', en: 'Fast food', food: true, kw: ['imbiss', 'schnellimbiss', 'fastfood', '=fast', 'fast food', 'takeaway', 'snack bar'], filters: [{ amenity: 'fast_food' }] },
  { label: 'Eisdiele', en: 'Ice cream parlour', kw: ['eisdiele', 'eiscaf', '=eis', 'ice cream', 'gelato'], filters: [{ amenity: 'ice_cream' }, { amenity: 'cafe', cuisine: { re: 'ice_cream' } }] },
  { label: 'Bar', en: 'Bar', kw: ['=bar', '=bars', 'kneipe', '=pub', '=pubs', 'cocktailbar', 'cocktail'], filters: [{ amenity: 'bar' }, { amenity: 'pub' }] },
  { label: 'Hotel', en: 'Hotel', kw: ['hotel', 'unterkunft', 'unterkünfte', 'pension', 'accommodation', 'guesthouse', 'guest house', '=inn', 'lodging'], filters: [{ tourism: 'hotel' }, { tourism: 'guest_house' }] },
  { label: 'Campingplatz', en: 'Campsite', kw: ['camping', 'zeltplatz', 'zeltplätz', '=zelten', 'campsite', 'campground', '=camping'], filters: [{ tourism: 'camp_site' }] },
  { label: 'Wohnmobilstellplatz', en: 'Motorhome site', kw: ['wohnmobil', 'reisemobil', 'stellplatz', 'stellplätz', '=womo', 'camper', 'wohnwagen', 'motorhome', 'campervan', '=rv', 'caravan'], filters: [{ tourism: 'caravan_site' }, { amenity: 'parking', motorhome: { re: '^(yes|designated)$' } }] },
  { label: 'Entsorgungsstation', en: 'Dump station', kw: ['entsorgung', 'grauwasser', 'schwarzwasser', 'chemietoilette', 'dump station', 'sanitary dump'], filters: [{ amenity: 'sanitary_dump_station' }] },
  { label: 'Wasserstelle', en: 'Water point', kw: ['wasserstelle', 'frischwasser', 'wassertank', 'water point', 'water tap'], filters: [{ amenity: 'water_point' }] },
  { label: 'Bäckerei', en: 'Bakery', kw: ['bäcker', 'backstube', 'bakery', 'bakeries', 'baker'], filters: [{ shop: 'bakery' }] },
  { label: 'Metzgerei', en: 'Butcher', kw: ['metzger', 'fleischer', 'butcher'], filters: [{ shop: 'butcher' }] },
  { label: 'Supermarkt', en: 'Supermarket', kw: ['supermarkt', 'supermärkt', 'lebensmittel', 'einkaufen', 'supermarket', 'grocery', 'groceries'], filters: [{ shop: 'supermarket' }] },
  { label: 'Drogerie', en: 'Drugstore', kw: ['drogerie', 'drugstore', 'chemist'], filters: [{ shop: 'chemist' }] },
  { label: 'Getränkemarkt', en: 'Beverage store', kw: ['getränke', 'beverage', 'drinks store', 'liquor'], filters: [{ shop: 'beverages' }] },
  { label: 'Baumarkt', en: 'DIY store', kw: ['baumarkt', 'baumärkt', 'diy', 'hardware store', 'home improvement'], filters: [{ shop: 'doityourself' }] },
  { label: 'Buchhandlung', en: 'Bookshop', kw: ['buchhandlung', 'buchladen', 'buchläden', 'bookshop', 'bookstore', 'books'], filters: [{ shop: 'books' }] },
  { label: 'Blumenladen', en: 'Florist', kw: ['blumen', 'florist', 'flower'], filters: [{ shop: 'florist' }] },
  { label: 'Kiosk', en: 'Kiosk', kw: ['kiosk', 'convenience'], filters: [{ shop: 'kiosk' }] },
  { label: 'Friseur', en: 'Hairdresser', kw: ['friseur', 'frisör', 'barber', 'hairdresser', 'hair salon'], filters: [{ shop: 'hairdresser' }] },
  { label: 'Fahrradladen', en: 'Bike shop', kw: ['fahrradladen', 'fahrradläden', 'fahrradgeschäft', 'radladen', 'bike shop', 'bicycle shop', 'cycle shop'], filters: [{ shop: 'bicycle' }] },
  { label: 'Spielplatz', en: 'Playground', kw: ['spielplatz', 'spielplätz', 'kinderspielpl', 'playground'], filters: [{ leisure: 'playground' }] },
  { label: 'E-Ladesäule', en: 'EV charger', kw: ['ladesäule', 'eladesäule', 'ladestation', 'ladepunkt', 'schnelllade', 'wallbox', 'charger', 'ev charger', 'charging station', 'charging point', 'ev charging'], filters: [{ amenity: 'charging_station' }] },
  { label: 'Parkplatz', en: 'Parking', kw: ['parkplatz', 'parkplätz', 'parkhaus', 'parkhäus', 'tiefgarage', '=parken', 'parking', 'car park', 'garage'], filters: [{ amenity: 'parking' }] },
  { label: 'Fahrradständer', en: 'Bike parking', kw: ['fahrradständer', 'radständer', 'fahrradparkpl', 'fahrradabstell', 'bike parking', 'bicycle parking', 'bike rack'], filters: [{ amenity: 'bicycle_parking' }] },
  { label: 'Fahrradverleih', en: 'Bike rental', kw: ['fahrradverleih', 'radverleih', 'leihrad', 'leihräder', 'bike rental', 'bicycle rental', 'bike hire', 'bike share'], filters: [{ amenity: 'bicycle_rental' }] },
  { label: 'Carsharing', en: 'Car sharing', kw: ['carsharing', 'car sharing'], filters: [{ amenity: 'car_sharing' }] },
  { label: 'Taxistand', en: 'Taxi stand', kw: ['taxi'], filters: [{ amenity: 'taxi' }] },
  { label: 'Haltestelle', en: 'Public transport stop', kw: ['haltestelle', 'bushalte', '=bus', 'öpnv', '=tram', 'straßenbahn', 'bus stop', 'bus station', 'tram stop', 'public transport', '=transit', '=stop'], filters: [{ highway: 'bus_stop' }, { railway: 'station' }, { railway: 'halt' }, { railway: 'tram_stop' }] },
  { label: 'Bahnhof', en: 'Train station', kw: ['bahnhof', 'bahnhöf', '=bahn', '=zug', 's bahn', 'sbahn', 'train station', 'railway station', '=train', '=rail'], filters: [{ railway: 'station' }, { railway: 'halt' }] },
  { label: 'Park', en: 'Park', kw: ['=park', '=parks', 'grünanlage', 'stadtpark'], filters: [{ leisure: 'park' }] },
  { label: 'Hundewiese', en: 'Dog park', kw: ['hundewiese', 'hundepark', 'hundeauslauf', 'dog park', 'dog run'], filters: [{ leisure: 'dog_park' }] },
  { label: 'Toilette', en: 'Toilet', kw: ['toilette', '=wc', '=wcs', '=klo', '=klos', 'toilet', 'restroom', 'bathroom', '=loo'], filters: [{ amenity: 'toilets' }] },
  { label: 'Wickeltisch', en: 'Baby changing table', kw: ['wickel', 'changing table', 'baby changing'], filters: [{ changing_table: 'yes' }] },
  { label: 'Trinkwasser', en: 'Drinking water', kw: ['trinkwasser', 'trinkbrunnen', 'drinking water', 'water fountain'], filters: [{ amenity: 'drinking_water' }] },
  { label: 'Apotheke', en: 'Pharmacy', kw: ['apotheke', 'pharmacy', 'pharmacies'], filters: [{ amenity: 'pharmacy' }] },
  { label: 'Arzt', en: 'Doctor', kw: ['arzt', 'ärzt', 'hausarzt', 'hausärzt', 'arztpraxis', 'doctor', 'physician', '=gp', 'clinic'], filters: [{ amenity: 'doctors' }] },
  { label: 'Zahnarzt', en: 'Dentist', kw: ['zahnarzt', 'zahnärzt', 'dentist'], filters: [{ amenity: 'dentist' }] },
  { label: 'Krankenhaus', en: 'Hospital', kw: ['krankenhaus', 'krankenhäus', 'klinik', 'hospital'], filters: [{ amenity: 'hospital' }] },
  { label: 'Geldautomat', en: 'ATM', kw: ['geldautomat', 'bankautomat', '=atm', '=atms', 'cash machine', 'cashpoint'], filters: [{ amenity: 'atm' }, { amenity: 'bank', atm: 'yes' }] },
  { label: 'Bank', en: 'Bank', kw: ['=bank', '=banken', 'sparkasse', '=banks'], filters: [{ amenity: 'bank' }] },
  { label: 'Post', en: 'Post office', kw: ['=post', 'postfiliale', 'postamt', 'post office'], filters: [{ amenity: 'post_office' }] },
  { label: 'Briefkasten', en: 'Post box', kw: ['briefkasten', 'briefkästen', 'post box', 'postbox', 'mailbox'], filters: [{ amenity: 'post_box' }] },
  { label: 'Paketstation', en: 'Parcel locker', kw: ['paketstation', 'packstation', 'paketbox', 'parcel locker', 'parcel'], filters: [{ amenity: 'parcel_locker' }] },
  { label: 'Tankstelle', en: 'Petrol station', kw: ['tankstelle', '=tanken', 'petrol', 'gas station', 'fuel'], filters: [{ amenity: 'fuel' }] },
  { label: 'Schwimmbad', en: 'Swimming pool', kw: ['schwimmbad', 'schwimmbäd', 'freibad', 'freibäd', 'hallenbad', 'hallenbäd', 'badestelle', 'badesee', 'swimming', 'swimming pool', '=pool', 'lido'], filters: [{ leisure: 'swimming_pool', access: 'yes' }, { leisure: 'water_park' }, { leisure: 'bathing_place' }, { leisure: 'swimming_area' }, { leisure: 'sports_centre', sport: { re: 'swimming' } }] },
  { label: 'Fitnessstudio', en: 'Gym', kw: ['fitness', '=gym', '=gyms'], filters: [{ leisure: 'fitness_centre' }] },
  { label: 'Sportplatz', en: 'Sports pitch', kw: ['sportplatz', 'sportplätz', 'fußballpl', 'bolzpl', 'sports pitch', 'pitch', 'football field', 'soccer field'], filters: [{ leisure: 'pitch' }] },
  { label: 'Kindergarten', en: 'Kindergarten', kw: ['kindergarten', 'kindergärten', '=kita', '=kitas', 'krippe', 'nursery', 'daycare', 'preschool'], filters: [{ amenity: 'kindergarten' }] },
  { label: 'Schule', en: 'School', kw: ['schule', 'grundschule', 'gymnasium', 'gymnasien', 'school'], filters: [{ amenity: 'school' }] },
  { label: 'Bibliothek', en: 'Library', kw: ['bibliothek', 'bücherei', 'library', 'libraries'], filters: [{ amenity: 'library' }] },
  { label: 'Kino', en: 'Cinema', kw: ['kino', 'cinema', 'movie theater', 'movies'], filters: [{ amenity: 'cinema' }] },
  { label: 'Museum', en: 'Museum', kw: ['museum', 'museen'], filters: [{ tourism: 'museum' }] },
  { label: 'Kirche', en: 'Church', kw: ['kirche', 'church', 'place of worship'], filters: [{ amenity: 'place_of_worship' }] },
  { label: 'Polizei', en: 'Police', kw: ['polizei', 'police', 'police station'], filters: [{ amenity: 'police' }] },
];

const CUISINES = [
  { kw: ['italien', 'italian'], re: 'italian|pizza|pasta' },
  { kw: ['pizz'], re: 'pizza|italian' },
  { kw: ['sushi'], re: 'sushi' },
  { kw: ['japan', 'ramen'], re: 'japanese|sushi|ramen' },
  { kw: ['chines'], re: 'chinese' },
  { kw: ['asiat', 'asian'], re: 'asian|chinese|vietnamese|thai|japanese|korean' },
  { kw: ['thai'], re: 'thai' },
  { kw: ['vietnam'], re: 'vietnamese' },
  { kw: ['korea'], re: 'korean' },
  { kw: ['indisch', '=inder', 'indian'], re: 'indian' },
  { kw: ['griech', 'greek'], re: 'greek' },
  { kw: ['türk', 'turkish'], re: 'turkish|kebab' },
  { kw: ['döner', 'kebab', 'kebap'], re: 'kebab' },
  { kw: ['burger'], re: 'burger' },
  { kw: ['bayerisch', 'bayrisch', 'bavarian'], re: 'bavarian' },
  { kw: ['deutsch', 'gutbürgerlich', 'german'], re: 'german|bavarian|regional' },
  { kw: ['mexikan', 'mexican'], re: 'mexican' },
  { kw: ['spanisch', 'tapas', 'spanish'], re: 'spanish|tapas' },
  { kw: ['französ', 'french'], re: 'french' },
  { kw: ['steak'], re: 'steak' },
  { kw: ['fisch', 'fish', 'seafood'], re: 'fish|seafood' },
  { kw: ['kroat', 'balkan', 'croatian'], re: 'croatian|balkan' },
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
  if (cat) return { label, filters: cat.filters, cat: cat.label }; // cat: steht in der eigenen POI-Datenbank

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
const COLORS = ['#fbbc04', '#34a853', '#c58af9', '#4ecde6', '#ff8bcb', '#8ab4f8']; // gut lesbar auf dunkel und hell
const MAIN_COLOR = '#f04a3c'; // Markenrot (wie Landingpage) für die Treffer
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

const fmtDist = m => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', t(',', '.'))} km`);
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
const map = L.map('map').setView([49.5, 11], 6); // bis der Standort da ist: Überblick DE/AT/CH/Norditalien
const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  className: 'osm-tiles', // per CSS abgedunkelt
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + t('-Mitwirkende', ' contributors'),
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

// Hell oder dunkel nach Browser-/Systemeinstellung; die Google-Karte folgt auch beim Umschalten.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const gmStyles = () => (darkQuery.matches ? GM_DARK : []);
darkQuery.addEventListener?.('change', () => {
  googleLayers?.['Google Maps']?._mutant?.setOptions({ styles: gmStyles() });
});

function useGoogle() {
  googleLayers = {
    'Google Maps': L.gridLayer.googleMutant({ type: 'roadmap', maxZoom: 21, styles: gmStyles() }),
    [t('Google Satellit', 'Google Satellite')]: L.gridLayer.googleMutant({ type: 'hybrid', maxZoom: 21 }),
  };
  map.removeLayer(osmLayer);
  googleLayers['Google Maps'].addTo(map);
  layerControl = L.control.layers({ ...googleLayers, OpenStreetMap: osmLayer }, null, { position: 'topright' }).addTo(map);
  $('#mapProvider').textContent = 'Google Maps';
  gmMessage(t('Google Maps ist aktiv. Oben rechts in der Karte kannst du umschalten.', 'Google Maps is active. You can switch layers at the top right of the map.'));
}

function loadGoogle(key) {
  if (!key) return;
  if (window.google?.maps || gmLoading) {
    // Die Google-API lässt sich nur einmal pro Seite laden – mit neuem Schlüssel neu starten.
    location.reload();
    return;
  }
  gmLoading = true;
  gmMessage(t('Lade Google Maps …', 'Loading Google Maps …'));
  window.gm_authFailure = () => {
    useOsm();
    if (key !== storedKey()) return; // Kartenschlüssel vom Backend: still bei OpenStreetMap bleiben
    gmMessage(t('Google hat den Schlüssel abgelehnt. Ist die „Maps JavaScript API“ aktiviert, die Abrechnung eingerichtet und die Website erlaubt?', 'Google rejected the key. Is the Maps JavaScript API enabled, billing set up and this website allowed?'), true);
    $('#mapSettings').open = true;
  };
  window.__bettermapsGmReady = () => { gmLoading = false; useGoogle(); };
  const s = el('script', {
    src: 'https://maps.googleapis.com/maps/api/js?loading=async&language=' + t('de', 'en') + '&region=DE&callback=__bettermapsGmReady&key=' + encodeURIComponent(key),
    async: true,
    onerror: () => { gmLoading = false; gmMessage(t('Google Maps konnte nicht geladen werden (Netzwerk?).', 'Google Maps could not be loaded (network?).'), true); },
  });
  document.head.append(s);
}

$('#gmSave').onclick = () => {
  const key = $('#gmKey').value.trim();
  if (!key) return gmMessage(t('Bitte zuerst einen Schlüssel eintragen.', 'Please enter a key first.'), true);
  try { localStorage.setItem(GM_KEY_STORE, key); } catch { /* privater Modus: gilt nur für diese Sitzung */ }
  loadGoogle(key);
  renderSourceToggle();
};
$('#gmClear').onclick = () => {
  try { localStorage.removeItem(GM_KEY_STORE); } catch { /* egal */ }
  $('#gmKey').value = '';
  useOsm();
  gmMessage(t('Schlüssel entfernt – es wird wieder OpenStreetMap angezeigt.', 'Key removed – showing OpenStreetMap again.'));
  renderSourceToggle();
};

// ---------- Zwischenspeicher (localStorage, 6 Stunden) ----------
// Gleiche Suchen kommen so sofort zurück – spart Wartezeit und Google-Kontingent.
const CACHE_PREFIX = 'bettermaps.cache.', CACHE_TTL = 6 * 3600e3, CACHE_MAX = 30;

function hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + s.length.toString(36);
}

function cacheGet(key) {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
    if (v && Date.now() - v.t < CACHE_TTL) return v.d;
  } catch { /* gesperrt oder kaputt: ohne Zwischenspeicher weiter */ }
  return null;
}

function cachePut(key, data) {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    if (keys.length >= CACHE_MAX) {
      keys.map(k => [k, (JSON.parse(localStorage.getItem(k)) || {}).t || 0])
        .sort((a, b) => a[1] - b[1])
        .slice(0, keys.length - CACHE_MAX + 1)
        .forEach(([k]) => localStorage.removeItem(k));
    }
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), d: data }));
  } catch {
    // Speicher voll: alten Zwischenspeicher leeren, nicht weiter versuchen
    try { Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* egal */ }
  }
}

// ---------- Konto (Supabase): Anmeldung per E-Mail, Google-Suche über das eigene Backend ----------
const SB_URL = 'https://icqensripxkuiarkrvsb.supabase.co';
const SB_KEY = 'sb_publishable_Y0VsKjxvgrJicGVZvPrehw_ivOYfuxF'; // öffentlich, Zugriff regelt das Backend
const API_URL = SB_URL + '/functions/v1/api';
const sb = window.supabase?.createClient(SB_URL, SB_KEY, {
  auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});
let session = null, account = null, cloudMapKeyLoaded = false;

function acctMessage(text, isError = false) {
  const m = $('#acctMsg');
  m.textContent = text;
  m.className = 'r-sub' + (isError ? ' error' : '');
}

function renderAccount() {
  const inn = !!session;
  $('#acctOut').hidden = inn;
  $('#acctIn').hidden = !inn;
  if (!inn) { $('#acctState').textContent = storedKey() ? t('eigener Schlüssel', 'own key') : t('nicht angemeldet', 'not signed in'); return; }
  const email = session.user?.email || '';
  if (account && account.status && account.status !== 'approved') {
    const pending = account.status === 'pending';
    $('#acctState').textContent = pending ? t('wartet auf Freischaltung', 'awaiting approval') : t('nicht freigeschaltet', 'not approved');
    $('#acctInfo').textContent = t(`Angemeldet als ${email}. `, `Signed in as ${email}. `) + (pending
      ? t('Dein Konto wird gerade geprüft. Du bekommst eine E-Mail, sobald du suchen kannst.', 'Your account is being reviewed. You will get an email as soon as you can search.')
      : t('Dein Konto wurde nicht freigeschaltet.', 'Your account was not approved.'));
    return;
  }
  const planName = account && ({ plus: 'Plus', pro: 'Pro' }[account.plan] || t('Kostenlos', 'Free'));
  $('#acctState').textContent = account ? `${planName} · ${account.used}/${account.limit} ${t('im Monat', 'this month')}` : email;
  $('#acctInfo').textContent = t(`Angemeldet als ${email}.`, `Signed in as ${email}.`) + (account
    ? t(` Tarif: ${planName}. Diesen Monat ${account.used} von ${account.limit} Google-Abfragen genutzt (eine Suche braucht meist 1 bis 3; Bedingungen wie Spielplatz oder Ladesäule kosten nichts, nur Freitext-Bedingungen zählen extra). Mit OpenStreetMap suchst du immer unbegrenzt.`,
      ` Plan: ${planName}. ${account.used} of ${account.limit} Google queries used this month (a search usually needs 1 to 3; conditions like playground or EV charger are free, only free-text conditions count extra). OpenStreetMap searches are always unlimited.`)
    : '');
}

async function api(path, body) {
  const { data } = await sb.auth.getSession(); // frischt abgelaufene Tokens selbst auf
  const token = data.session?.access_token;
  if (!token) throw new Error(t('Bitte melde dich an (unten unter „Konto“).', 'Please sign in (below under “Account”).'));
  const res = await fetch(API_URL + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, apikey: SB_KEY, 'X-Lang': t('de', 'en'), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function refreshAccount() {
  if (!session) { account = null; renderAccount(); return; }
  try {
    const { res, json } = await api('/me');
    if (res.ok) {
      account = json;
      if (json.mapsKey && !storedKey() && !cloudMapKeyLoaded) { cloudMapKeyLoaded = true; loadGoogle(json.mapsKey); }
    }
  } catch { /* offline: später erneut */ }
  renderAccount();
}

if (sb) {
  sb.auth.onAuthStateChange((event, s) => {
    const was = !!session;
    if (!s || s.user?.id !== session?.user?.id) account = null;
    session = s;
    renderAccount();
    renderSourceToggle();
    if (s && (!was || event === 'SIGNED_IN')) {
      // Token aus dem Anmelde-Link nicht in der Adresszeile stehen lassen
      if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname + location.search);
      // Angemeldet (per Code oder Link): offene Code-Eingabe schließen
      try { localStorage.removeItem('bm_login_pending'); } catch { /* egal */ }
      $('#codeForm').hidden = true;
      setTimeout(refreshAccount, 0);
    }
  });
  const hashErr = new URLSearchParams(location.hash.slice(1)).get('error_description');
  if (hashErr) {
    acctMessage(t('Anmeldung fehlgeschlagen: ', 'Sign-in failed: ') + hashErr.replace(/\+/g, ' ') + t('. Bitte neuen Link anfordern.', '. Please request a new link.'), true);
    $('#account').open = true;
    history.replaceState(null, '', location.pathname + location.search);
  }
} else {
  acctMessage(t('Anmeldung nicht verfügbar (Bibliothek konnte nicht geladen werden).', 'Sign-in unavailable (library could not be loaded).'), true);
}
renderAccount();
if (location.protocol === 'file:') acctMessage(t('Anmelden geht nur in der Web-Version: https://nexttomaps.com/app/', 'Sign-in only works in the web version: https://nexttomaps.com/en/app/'), true);

// Die Anmelde-E-Mail mit dem Code verschickt das Backend (/login mit send: true); nur als Rückfall
// fordert die App den Code bei Supabase an. Mit Code bleibt die Anmeldung in der Homescreen-App.
const OTP_IN_EMAIL = true;
const PENDING_KEY = 'bm_login_pending';
let loginEmail = '';
// iOS lädt die Homescreen-App beim Wechsel zur Mail-App manchmal neu: offene Code-Eingabe wiederherstellen.
try {
  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
  // Wartet das Konto auf Freischaltung, kann der Code auch erst Tage später kommen.
  const maxAge = pending?.waiting ? 14 * 86400_000 : 60 * 60 * 1000;
  if (OTP_IN_EMAIL && pending && Date.now() - pending.t < maxAge && !session) {
    loginEmail = pending.email;
    $('#email').value = loginEmail;
    $('#codeForm').hidden = false;
    $('#account').open = true;
    acctMessage(pending.waiting
      ? t(`Dein Konto wird noch geprüft. Sobald es freigeschaltet ist, bekommst du den Anmeldecode per E-Mail an ${loginEmail} – gib ihn dann hier ein.`,
        `Your account is still being reviewed. Once approved, you will receive the sign-in code by email at ${loginEmail} – enter it here.`)
      : t(`Gib den Code aus der E-Mail an ${loginEmail} ein.`, `Enter the code from the email sent to ${loginEmail}.`));
  }
} catch { /* egal */ }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!sb) return;
  loginEmail = $('#email').value.trim();
  $('#sendLink').disabled = true;
  acctMessage(t('Einen Moment …', 'One moment …'));
  // Erst beim Backend nachfragen: Neue Konten warten auf Freischaltung, den Code gibt es erst danach.
  let check;
  try {
    const res = await fetch(API_URL + '/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, 'X-Lang': t('de', 'en') },
      body: JSON.stringify({ email: loginEmail, send: true }),
    });
    check = { ok: res.ok, json: await res.json().catch(() => ({})) };
  } catch {
    $('#sendLink').disabled = false;
    return acctMessage(t('Keine Verbindung zum Server. Bitte später noch einmal versuchen.', 'No connection to the server. Please try again later.'), true);
  }
  if (!check.ok || check.json.status === 'rejected') {
    $('#sendLink').disabled = false;
    return acctMessage(check.json.status === 'rejected' ? t('Dieses Konto wurde nicht freigeschaltet.', 'This account was not approved.')
      : check.json.error || t('Anmeldung gerade nicht möglich.', 'Sign-in is not possible right now.'), true);
  }
  if (check.json.status === 'pending') {
    $('#sendLink').disabled = false;
    $('#codeForm').hidden = false;
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: loginEmail, t: Date.now(), waiting: true })); } catch { /* egal */ }
    return acctMessage(t(`Danke! Deine Anmeldung wird geprüft. Sobald dein Konto freigeschaltet ist, bekommst du den Anmeldecode per E-Mail an ${loginEmail} – gib ihn dann hier ein.`,
      `Thanks! Your sign-up is being reviewed. Once your account is approved, you will receive the sign-in code by email at ${loginEmail} – enter it here.`));
  }
  // Meist hat das Backend den Code schon verschickt ('sent'); sonst wie früher über Supabase anfordern.
  let error = null;
  if (check.json.status !== 'sent') {
    acctMessage(t('Sende E-Mail …', 'Sending email …'));
    ({ error } = await sb.auth.signInWithOtp({
      email: loginEmail,
      options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false },
    }));
  }
  $('#sendLink').disabled = false;
  if (error) return acctMessage(/rate|seconds/i.test(error.message)
    ? t('Bitte kurz warten, bevor du eine neue E-Mail anforderst.', 'Please wait a moment before requesting another email.') : t('Fehler: ', 'Error: ') + error.message, true);
  $('#codeForm').hidden = !OTP_IN_EMAIL;
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ email: loginEmail, t: Date.now() })); } catch { /* egal */ }
  if (OTP_IN_EMAIL) $('#otp').focus();
  if (check.json.limited) return acctMessage(t(`Es wurde gerade schon ein Code an ${loginEmail} geschickt. Gib den Code aus der neuesten E-Mail hier ein oder fordere in ein paar Minuten einen neuen an.`,
    `A code was just sent to ${loginEmail}. Enter the code from the most recent email here, or request a new one in a few minutes.`));
  acctMessage(OTP_IN_EMAIL
    ? t(`E-Mail an ${loginEmail} ist unterwegs. Gib den Code daraus hier ein.`, `Email to ${loginEmail} is on its way. Enter the code from it here.`)
    : t(`E-Mail an ${loginEmail} ist unterwegs. Tippe auf den Link darin, um dich anzumelden.`, `Email to ${loginEmail} is on its way. Tap the link in it to sign in.`));
});
$('#codeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const token = $('#otp').value.replace(/\s/g, '');
  if (!token || !loginEmail) return;
  const { error } = await sb.auth.verifyOtp({ email: loginEmail, token, type: 'email' });
  if (error) return acctMessage(t('Der Code passt nicht oder ist abgelaufen.', 'The code is wrong or has expired.'), true);
  $('#codeForm').hidden = true;
  $('#otp').value = '';
  try { localStorage.removeItem(PENDING_KEY); } catch { /* egal */ }
  acctMessage('');
});
// Freischalt-Link aus der Betreiber-Mail: ?approve=<Konto>&sig=<Signatur>
(async () => {
  const q = new URLSearchParams(location.search);
  const uid = q.get('approve'), sig = q.get('sig'), exp = q.get('exp');
  if (!uid || !sig) return;
  history.replaceState(null, '', location.pathname); // Link nicht in der Adresszeile/Chronik lassen
  const call = async action => {
    const res = await fetch(API_URL + '/approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
      body: JSON.stringify({ uid, sig, exp: Number(exp), action }),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };
  const text = el('p');
  const done = () => box.remove();
  const btnOk = el('button', { type: 'button', textContent: 'Freischalten' });
  const btnNo = el('button', { type: 'button', className: 'ghost', textContent: 'Ablehnen' });
  const btnClose = el('button', { type: 'button', className: 'ghost', textContent: 'Schließen', onclick: done });
  const box = el('div', { id: 'approveBox', role: 'dialog' },
    el('div', { className: 'card' }, el('h2', { textContent: 'Registrierung freischalten' }), text,
      el('div', { className: 'actions' }, btnOk, btnNo, btnClose)));
  document.body.append(box);
  text.textContent = 'Lade …';
  const label = { pending: 'wartet auf Freischaltung', approved: 'ist freigeschaltet', rejected: 'ist abgelehnt' };
  const show = r => {
    if (!r.ok) { text.textContent = r.json.error || 'Fehler.'; btnOk.hidden = btnNo.hidden = true; return; }
    text.textContent = `${r.json.email} ${label[r.json.status] || ''}.`;
    btnOk.hidden = r.json.status === 'approved';
    btnNo.hidden = r.json.status === 'rejected';
  };
  const act = action => async () => {
    btnOk.disabled = btnNo.disabled = true;
    try { show(await call(action)); } catch { text.textContent = 'Keine Verbindung zum Server.'; }
    btnOk.disabled = btnNo.disabled = false;
  };
  btnOk.onclick = act('approve');
  btnNo.onclick = act('reject');
  try { show(await call('info')); } catch { text.textContent = 'Keine Verbindung zum Server.'; }
})();

$('#logout').onclick = async () => {
  const { error } = await sb.auth.signOut({ scope: 'local' });
  if (error) return acctMessage(t('Abmelden fehlgeschlagen: ', 'Sign-out failed: ') + error.message, true);
  account = null;
  acctMessage(t('Abgemeldet.', 'Signed out.'));
};

// ---------- Datenquelle: eigener Google-Schlüssel, Backend (Konto) oder OpenStreetMap ----------
const SRC_STORE = 'bettermaps.source';

function dataSource() {
  if (storedKey()) {
    try { return localStorage.getItem(SRC_STORE) || 'google'; } catch { return 'google'; }
  }
  return session ? 'cloud' : 'none';
}

function renderSourceToggle() {
  const row = $('#sourceRow');
  row.hidden = !storedKey();
  const src = dataSource();
  row.querySelectorAll('button[data-src]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.src === src)));
}
$('#sourceRow').addEventListener('click', e => {
  const b = e.target.closest('button[data-src]');
  if (!b) return;
  try { localStorage.setItem(SRC_STORE, b.dataset.src); } catch { /* egal */ }
  renderSourceToggle();
});
renderSourceToggle();

// Google „Text Search (New)“: liefert höchstens 60 Treffer (3 Seiten à 20) je Suchbegriff und Gebiet.
const G_URL = 'https://places.googleapis.com/v1/places:searchText';
const G_FIELDS_MAIN = 'places.id,places.displayName,places.location,places.formattedAddress,places.primaryTypeDisplayName,' +
  'places.rating,places.userRatingCount,places.websiteUri,places.googleMapsUri,places.currentOpeningHours.openNow,nextPageToken';
const G_FIELDS_NEAR = 'places.id,places.displayName,places.location,nextPageToken'; // günstiger: nur Name + Lage
const G_MAX = 60;
const ANCHOR_MAX = 5; // so wenige Orte hat eine Bedingung höchstens, damit zusätzlich um sie herum gesucht wird

function googleError(json, status) {
  const msg = json?.error?.message || `HTTP ${status}`;
  const reason = JSON.stringify(json?.error?.details || '');
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(msg + reason)) return t('Die „Places API (New)“ ist für deinen Google-Schlüssel nicht aktiviert (Google Cloud Console → APIs & Dienste)', 'The Places API (New) is not enabled for your Google key (Google Cloud Console → APIs & Services)');
  if (/API_KEY|API key/i.test(msg + reason)) return t('Google hat den API-Schlüssel abgelehnt', 'Google rejected the API key');
  if (/referer|referrer/i.test(msg)) return t(`Google erlaubt den Schlüssel nicht für ${location.host}`, `Google does not allow the key for ${location.host}`);
  if (status === 429) return t('Google-Kontingent erschöpft', 'Google quota exhausted');
  return t('Google-Suche fehlgeschlagen: ', 'Google search failed: ') + msg;
}

function googlePoint(p) {
  const loc = p.location;
  if (!loc) return null;
  return {
    id: 'g/' + p.id, lat: loc.latitude, lon: loc.longitude,
    tags: {
      name: p.displayName?.text,
      'addr:full': p.formattedAddress?.replace(/, (Deutschland|Germany|Österreich|Austria|Schweiz|Switzerland)$/, ''),
      kind: p.primaryTypeDisplayName?.text,
      rating: p.rating, ratings: p.userRatingCount,
      website: p.websiteUri, gmaps: p.googleMapsUri,
      openNow: p.currentOpeningHours?.openNow,
    },
  };
}

// Eine Ergebnisseite: mit eigenem Schlüssel direkt bei Google, sonst über das Backend.
async function googleFetch(text, b, fields, pageToken) {
  for (let attempt = 0; ; attempt++) {
    let res, json;
    const circle = b.r != null; // Kreis um einen Ort: nach Entfernung sortiert
    if (activeSource === 'cloud') {
      ({ res, json } = await api('/search', { textQuery: text, ...(circle ? { circle: b } : { rect: b }), fields: fields === G_FIELDS_MAIN ? 'main' : 'near', pageToken }));
      if (json.quota && account) { account.used = json.quota.used; account.limit = json.quota.limit; renderAccount(); }
      if (res.status === 401) throw new Error(t('Deine Anmeldung ist abgelaufen – bitte unten unter „Konto“ neu anmelden.', 'Your session has expired – please sign in again below under “Account”.'));
      if (res.status === 403 && json.status) {
        if (account) { account.status = json.status; renderAccount(); }
        throw new Error(json.error);
      }
      if (res.status === 429 && (json.reason || json.limit != null)) {
        if (account) { account.used = json.used; account.limit = json.limit; renderAccount(); }
        throw json.reason === 'global' ? quotaError(json.error, 'global') : quotaError(quotaUsedUp(json.used, json.limit));
      }
      if (!res.ok && json.error && typeof json.error === 'string') throw new Error(json.error);
    } else {
      const body = {
        textQuery: text, languageCode: t('de', 'en'), regionCode: 'DE', pageSize: 20,
        ...(circle
          ? { locationBias: { circle: { center: { latitude: b.lat, longitude: b.lon }, radius: b.r } }, rankPreference: 'DISTANCE' }
          : { locationRestriction: { rectangle: { low: { latitude: b.s, longitude: b.w }, high: { latitude: b.n, longitude: b.e } } } }),
        ...(pageToken ? { pageToken } : {}),
      };
      res = await fetch(G_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': storedKey(), 'X-Goog-FieldMask': fields },
        body: JSON.stringify(body),
      });
      json = await res.json().catch(() => ({}));
    }
    if (res.ok) return json;
    // Ein frischer Seiten-Token ist manchmal noch nicht gültig – kurz warten, einmal wiederholen.
    if (pageToken && res.status === 400 && attempt === 0) { await new Promise(r => setTimeout(r, 1500)); continue; }
    throw new Error(googleError(json, res.status));
  }
}

// Google-Ergebnisse nur im Arbeitsspeicher halten (Google erlaubt kein dauerhaftes Speichern).
const gCache = new Map();

// Ein Suchbegriff in einem Rechteck, bis zu 3 Seiten.
async function googleArea(text, b, fields) {
  const ck = [text.toLowerCase(), b.s.toFixed(4), b.w.toFixed(4), b.n.toFixed(4), b.e.toFixed(4), fields].join('|');
  const hit = gCache.get(ck);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.d;
  const places = [];
  let pageToken;
  do {
    const json = await googleFetch(text, b, fields, pageToken);
    places.push(...(json.places || []));
    pageToken = json.nextPageToken;
  } while (pageToken && places.length < G_MAX);
  const points = places.map(googlePoint).filter(Boolean);
  gCache.set(ck, { t: Date.now(), d: points });
  return points;
}
// Eine Seite (20) im Kreis um einen Ort, nach Entfernung sortiert; liefert auch den Token der nächsten Seite.
async function googleNearestPage(text, c, pageToken) {
  const ck = ['near', text.toLowerCase(), c.lat.toFixed(5), c.lon.toFixed(5), c.r, pageToken || ''].join('|');
  const hit = gCache.get(ck);
  // Kurz zwischenspeichern: Googles Token für die nächste Seite läuft nach wenigen Minuten ab.
  // Gleichzeitige gleiche Abfragen teilen sich die laufende Anfrage.
  if (hit && (hit.p || Date.now() - hit.t < NEAR_TTL)) return hit.p || hit.d;
  const p = googleFetch(text, c, G_FIELDS_MAIN, pageToken)
    .then(json => ({ points: (json.places || []).map(googlePoint).filter(Boolean), next: json.nextPageToken }));
  gCache.set(ck, { p });
  try {
    const d = await p;
    gCache.set(ck, { t: Date.now(), d });
    return d;
  } catch (err) {
    gCache.delete(ck);
    throw err;
  }
}
const NEAR_TTL = 2 * 60 * 1000;
// Alte, dauerhaft gespeicherte Google-Ergebnisse früherer Versionen entfernen
try { Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX + 'g')).forEach(k => localStorage.removeItem(k)); } catch { /* egal */ }

// Viertelt das Rechteck, wenn Google das 60er-Limit erreicht (eine Ebene) – damit z. B.
// Spielplätze in einer Stadt nicht nach den ersten 60 abgeschnitten werden.
async function googleTerm(text, b, fields, split) {
  const first = await googleArea(text, b, fields);
  if (!split || first.length < G_MAX) return { points: first, capped: first.length >= G_MAX };
  const midLat = (b.s + b.n) / 2, midLon = (b.w + b.e) / 2;
  const quads = [
    { s: b.s, n: midLat, w: b.w, e: midLon }, { s: b.s, n: midLat, w: midLon, e: b.e },
    { s: midLat, n: b.n, w: b.w, e: midLon }, { s: midLat, n: b.n, w: midLon, e: b.e },
  ];
  const parts = await Promise.all(quads.map(q => googleArea(text, q, fields)));
  const byId = new Map([...first, ...parts.flat()].map(p => [p.id, p]));
  return { points: [...byId.values()], capped: parts.some(p => p.length >= G_MAX) };
}

// Google-Kontingent im Konto erschöpft: dann wird OpenStreetMap als Ausweg angeboten.
// kind: 'user' (Monatskontingent leer), 'global' (Tageslimit aller Nutzer), 'partial' (reicht nur für diese Suche nicht)
const quotaError = (msg, kind = 'user') => Object.assign(new Error(msg), { quota: kind });
const quotaUsedUp = (used, limit) => t(
  `Dein Google-Kontingent für diesen Monat ist aufgebraucht (${used} von ${limit} Abfragen). Am Monatsersten geht es wieder los – mit OpenStreetMap kannst du sofort unbegrenzt weitersuchen.`,
  `Your Google quota for this month is used up (${used} of ${limit} queries). It renews on the 1st – you can keep searching with OpenStreetMap right away, unlimited.`);
// Wer einmal auf OpenStreetMap ausgewichen ist, bleibt dabei, bis das Kontingent wieder frei ist
// (das Backend zählt pro Kalendermonat nach deutscher Zeit).
const OSM_DAY = 'bettermaps.osmDay';
const berlinMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }).slice(0, 7);
const berlinDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
// Liefert 'user' oder 'global', solange die gemerkte Ausweichsuche gilt, sonst ''.
function osmFallback() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(OSM_DAY)); } catch { /* egal */ }
  if (saved?.kind === 'global') return saved.day === berlinDay() ? 'global' : '';
  if (saved?.month !== berlinMonth()) return '';
  return !account || account.limit <= saved.limit ? 'user' : ''; // höheres Limit (z. B. Plus/Pro): wieder Google
}
// Nur „Monatskontingent leer“ gilt bis Monatsende, „alle Nutzer am Limit“ bis Mitternacht;
// reicht das Kontingent nur für eine einzelne Suche nicht, wird nichts gemerkt.
function rememberOsmFallback(kind) {
  const v = kind === 'user' ? { kind, month: berlinMonth(), limit: account?.limit ?? 0 }
    : kind === 'global' ? { kind, day: berlinDay() } : null;
  try { if (v) localStorage.setItem(OSM_DAY, JSON.stringify(v)); } catch { /* egal */ }
}

let activeSource = 'none'; // für die laufende Suche festgelegt (siehe runSearch)

// Bedingungen mit bekannter Kategorie kommen aus der eigenen OSM-Datenbank im Backend
// (schnell, kostet keine Google-Abfrage); Freitext-Bedingungen gehen an Google.
// Liefert null, wenn die Datenbank das Gebiet nicht abdeckt oder nicht erreichbar ist.
const cappedNote = keys => { const labels = keys.map(k => catName(CATEGORIES.find(c => c.label === k) || { label: k })); return labels.length
  ? t(`Sehr viele Orte bei ${labels.map(l => `„${l}“`).join(', ')} – evtl. fehlen Treffer. Bitte kleineren Bereich wählen.`,
    `A lot of places for ${labels.map(l => `“${l}”`).join(', ')} – some results may be missing. Please choose a smaller area.`) : ''; };

// Punkt aus der POI-Datenbank; die ID aus den Koordinaten erkennt dasselbe Objekt in Hauptsuche und Bedingung.
const dbPoint = ([lat, lon, name]) => ({ id: `db/${lat},${lon}`, lat, lon, tags: { name } });

// Liefert je Bedingung eine Punktliste (Eigenschaft .capped: abgeschnittene Kategorien)
// oder null, wenn die Datenbank das Gebiet nicht abdeckt oder nicht erreichbar ist.
async function dbPools(mains, dbConds) {
  if (!dbConds.length || !mains.length) return Object.assign(dbConds.map(() => []), { capped: [] });
  // Gleiche Kategorie mehrfach (z. B. Spielplatz 200 m und 1 km): einmal mit dem größten Radius abfragen
  const radius = new Map();
  for (const c of dbConds) radius.set(c.cat, Math.max(radius.get(c.cat) || 0, c.radius));
  const cats = [...radius.keys()];
  try {
    const { res, json } = await api('/near', {
      points: mains.map(p => [p.lat, p.lon]),
      conds: cats.map(cat => ({ cat, radius: radius.get(cat) })),
    });
    if (!res.ok || !json.covered) return null;
    const byCat = new Map(cats.map((cat, i) => [cat, json.pools[i].map(dbPoint)]));
    return Object.assign(dbConds.map(c => byCat.get(c.cat)), { capped: cats.filter((cat, i) => json.capped?.[i]) });
  } catch {
    return null;
  }
}

// Gleiche Art wie die Hauptsuche (z. B. Café mit Café in der Nähe, Bahnhof mit Haltestelle):
// dann über Google, weil nur dort der Treffer selbst sicher erkannt wird (gleiche ID).
const tagPairs = c => c.filters.flatMap(f => Object.entries(f).filter(([, v]) => typeof v === 'string').map(([k, v]) => k + '=' + v));
const overlaps = (a, b) => { const s = new Set(tagPairs(a)); return tagPairs(b).some(t => s.has(t)); };

async function googleData(mainCat, conds, bbox) {
  const viaDb = conds.map(c => !!(c.cat && session && !overlaps(c, mainCat))); // einmal festlegen
  const gConds = conds.filter((c, i) => !viaDb[i]);
  // Über das Backend: Vierteln (bis zu 12 Abfragen je Bedingung) nur, wenn das Monatskontingent reicht.
  const checkQuota = n => {
    if (activeSource !== 'cloud' || !account) return true;
    const left = account.limit - account.used;
    if (left < 1) {
      throw quotaError(quotaUsedUp(account.used, account.limit));
    }
    if (left < 1 + n) {
      throw quotaError(t(`Dein Google-Kontingent reicht für diese Suche nicht mehr: noch ${left} von ${account.limit} Abfragen in diesem Monat frei, gebraucht werden mindestens ${1 + n}. Mit weniger Freitext-Bedingungen klappt es evtl. noch.`,
        `Your Google quota is not enough for this search: ${left} of ${account.limit} queries left this month, at least ${1 + n} needed. It may work with fewer free-text conditions.`), 'partial');
    }
    return left >= 3 * (1 + n) + 12 * n;
  };
  const split = checkQuota(gConds.length);
  const term = c => googleTerm(c.label, expandBbox(bbox, c.radius), G_FIELDS_NEAR, split);
  // Freitext-Bedingungen zuerst: liefert eine davon nur wenige Orte (z. B. ein bestimmtes Theater),
  // wird die Hauptsuche nur um diese Orte gemacht – je Ort die 20 nächsten, nach Entfernung sortiert.
  // Andere Treffer könnten die Bedingung ohnehin nicht erfüllen; das spart Abfragen und findet nahe
  // Orte, die in Googles Top 60 für die ganze Stadt fehlen würden.
  const gs = await Promise.all(gConds.map(term));
  let best = -1;
  gs.forEach((g, i) => {
    const n = g.points.length;
    if (n >= 1 && n <= ANCHOR_MAX && (best < 0 || n < gs[best].points.length)) best = i;
  });
  let m = null, more = null, nearNote = '';
  // Gleiche Orte (z. B. Theater und seine Kasse) nur einmal abfragen
  const anchorPts = best < 0 ? [] : [...new Map(gs[best].points.map(p => [p.lat.toFixed(4) + ',' + p.lon.toFixed(4), p])).values()];
  const left = activeSource === 'cloud' && account ? account.limit - account.used : Infinity;
  // Reserve für Bedingungen, die bei fehlender Datenbank-Abdeckung doch zu Google gehen
  const reserve = conds.filter((c, i) => viaDb[i]).length * (split ? 15 : 3);
  if (anchorPts.length && left >= anchorPts.length + reserve) {
    const r = gConds[best].radius;
    const anchors = anchorPts.map(p => ({ c: { lat: p.lat, lon: p.lon, r }, token: undefined, done: false }));
    const found = new Map();
    let failed = false;
    const page = async () => {
      const open = anchors.filter(a => !a.done);
      const pages = await Promise.allSettled(open.map(a => googleNearestPage(mainCat.label, a.c, a.token)));
      pages.forEach((res, i) => {
        const a = open[i];
        if (res.status === 'rejected') { a.done = true; failed = true; return; } // einzelner Fehler: Rest zeigen
        const { points, next } = res.value;
        // Nur Orte im Umkreis und im Suchgebiet (Google bevorzugt den Kreis nur, begrenzt nicht)
        points.filter(p => haversine(a.c, p) <= r && inBbox(p, bbox)).forEach(p => found.set(p.id, p));
        a.token = next;
        // Weitere Seite nur sinnvoll, wenn auch der entfernteste Treffer noch im Umkreis liegt
        a.done = !next || !points.length || haversine(a.c, points[points.length - 1]) > r;
      });
      if (pages.every(res => res.status === 'rejected')) throw pages[0].reason;
      return [...found.values()];
    };
    try {
      m = { points: await page(), capped: false };
    } catch (err) {
      if (err.quota) throw err;
      m = null; // um die Orte herum ging nichts: wie bisher im ganzen Gebiet suchen
    }
    if (m) {
      const openCount = () => anchors.filter(a => !a.done).length;
      const moreNote = () => [
        openCount() ? t(`Gezeigt werden die nächstgelegenen „${mainCat.label}“ um „${gConds[best].label}“ – es gibt evtl. weitere.`,
          `Showing the nearest “${mainCat.label}” around “${gConds[best].label}” – there may be more.`) : '',
        failed ? t('Ein Teil der Google-Abfragen ist fehlgeschlagen – evtl. fehlen Treffer.', 'Some Google queries failed – some results may be missing.') : '',
      ].filter(Boolean).join(' ');
      nearNote = moreNote();
      if (openCount()) {
        more = {
          cost: openCount,
          load: async () => {
            const points = await page();
            return { ...await finish(points), note: [moreNote(), baseNote].filter(Boolean).join(' ') };
          },
        };
      }
    }
  }
  if (!m) m = await googleTerm(mainCat.label, bbox, G_FIELDS_MAIN, false); // Hauptsuche: Top 60 nach Relevanz
  const dbConds = conds.filter((c, i) => viaDb[i]);
  // Pools der Bedingungen zu den Haupttreffern; bei „Weitere laden“ erneut (Datenbank kostet nichts,
  // Google-Ergebnisse kommen aus dem Zwischenspeicher).
  const extra = []; // Datenbank deckt das Gebiet nicht ab: diese Bedingungen doch bei Google
  async function finish(mainPoints) {
    let db = await dbPools(mainPoints, dbConds);
    if (!db) {
      extra.length = 0;
      extra.push(...await Promise.all(dbConds.map(term)));
      db = extra.map(g => g.points);
    }
    const gPools = gs.map(g => g.points);
    const pools = conds.map((c, i) => (viaDb[i] ? db : gPools).shift());
    return { mains: mainPoints, pools, dbCapped: db.capped || [] };
  }
  const res = await finish(m.points);
  const capped = [[m, mainCat], ...gs.map((g, i) => [g, gConds[i]]), ...extra.map((g, i) => [g, dbConds[i]])]
    .filter(([r]) => r.capped).map(([, c]) => c.label);
  const baseNote = [capped.length
    ? t(`Google liefert pro Suchbegriff höchstens ${G_MAX} Orte – bei ${capped.map(l => `„${l}“`).join(', ')} fehlen evtl. welche. Vollständiger, aber langsamer: OpenStreetMap.`,
      `Google returns at most ${G_MAX} places per search term – some may be missing for ${capped.map(l => `“${l}”`).join(', ')}. More complete but slower: OpenStreetMap.`)
    : '', cappedNote(res.dbCapped)].filter(Boolean).join(' ');
  return { mains: res.mains, pools: res.pools, note: [nearNote, baseNote].filter(Boolean).join(' '), more };
}

async function overpassPoints(mainCat, conds, bbox) {
  const query = buildQuery(mainCat, bbox, conds);
  const ck = 'o' + hashKey(query);
  let elements = cacheGet(ck);
  if (!elements) {
    setLoading(t('Lade OpenStreetMap-Daten … (kann bei ausgelasteten Servern bis zu einer Minute dauern)', 'Loading OpenStreetMap data … (may take up to a minute when servers are busy)'));
    elements = await overpass(query);
    cachePut(ck, elements);
  }
  const points = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null || !e.tags) continue;
    points.push({ id: `${e.type}/${e.id}`, lat, lon, tags: e.tags });
  }
  return points;
}

const isPublic = p => p.tags.access !== 'private' && p.tags.access !== 'no';

async function osmOnly(mainCat, conds, bbox) {
  const points = await overpassPoints(mainCat, conds, bbox);
  return {
    mains: points.filter(p => matches(p.tags, mainCat)),
    pools: conds.map(c => points.filter(p => matches(p.tags, c) && isPublic(p))),
  };
}

// OpenStreetMap-Modus: bekannte Kategorien aus der eigenen POI-Datenbank im Backend (schnell),
// Freitext wie „Sushi“ oder „dm“ von den öffentlichen OpenStreetMap-Servern.
// Ohne Anmeldung oder außerhalb von DE/AT/CH/IT alles von den öffentlichen Servern.
async function osmData(mainCat, conds, bbox) {
  if (!session || (!mainCat.cat && !conds.some(c => c.cat))) return osmOnly(mainCat, conds, bbox);
  // Erst das Backend (schnell): deckt es das Gebiet nicht ab, gleich alles von den öffentlichen Servern.
  let area = null;
  if (mainCat.cat) {
    setLoading(t('Suche …', 'Searching …'));
    try {
      const { res, json } = await api('/area', { cat: mainCat.cat, rect: bbox });
      if (res.ok && json.covered) area = json;
    } catch { /* Backend nicht erreichbar */ }
    if (!area) return osmOnly(mainCat, conds, bbox);
  }
  // Freitext (Hauptsuche oder Bedingungen) von den öffentlichen Servern; Fehler dort normal melden.
  const textConds = conds.filter(c => !c.cat);
  const points = !mainCat.cat || textConds.length ? await overpassPoints(mainCat.cat ? null : mainCat, textConds, bbox) : [];
  const mains = area ? area.points.map(dbPoint) : points.filter(p => matches(p.tags, mainCat));
  const db = await dbPools(mains, conds.filter(c => c.cat));
  if (!db) {
    // Bedingungen doch von den öffentlichen Servern; Hauptsuche bleibt, wo sie herkam.
    const rest = await overpassPoints(null, conds.filter(c => c.cat), bbox);
    return { mains, pools: conds.map(c => (c.cat ? rest : points).filter(p => matches(p.tags, c) && isPublic(p))), note: '' };
  }
  const pools = conds.map(c => (c.cat ? db.shift() : points.filter(p => matches(p.tags, c) && isPublic(p))));
  const note = [area?.capped ? t(`Sehr viele Treffer – angezeigt werden die ersten ${area.points.length}. Bitte kleineren Bereich wählen.`, `Lots of results – showing the first ${area.points.length}. Please choose a smaller area.`) : '',
    cappedNote(db.capped)].filter(Boolean).join(' ');
  return { mains, pools, note };
}
if (storedKey()) { $('#gmKey').value = storedKey(); loadGoogle(storedKey()); }
const poiLayer = L.layerGroup().addTo(map);
const highlightLayer = L.layerGroup().addTo(map);
const resultLayer = L.layerGroup().addTo(map);
const meLayer = L.layerGroup().addTo(map); // eigener Standort

// ---------- Formular ----------
let conditions = [{ text: '', radius: 500 }]; // leer starten, leere Bedingungen werden ignoriert


// Auswahlliste unter einem Eingabefeld: leer = alle Kategorien, mit Text = nur passende.
// (Ein <datalist> zeigt auf dem iPhone keine Liste, nur Vorschläge über der Tastatur.)
function categoryMatches(text, extras = []) {
  const all = [...CATEGORIES, ...extras.map(label => ({ label, kw: [] }))];
  const q = text.trim().toLowerCase();
  if (!q) return all.map(catName);
  const hits = all.filter(c => catName(c).toLowerCase().includes(q) ||
    c.kw.some(k => k.replace('=', '').startsWith(q)));
  const starts = c => (catName(c).toLowerCase().startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b)).map(catName);
}

function attachPicker(input, onPick, extras = []) {
  const wrap = el('span', { className: 'combo' });
  const list = el('ul', { className: 'picker', hidden: true, role: 'listbox' });
  let active = -1;
  const close = () => { list.hidden = true; active = -1; };
  const choose = label => { input.value = label; onPick(label); close(); input.blur(); };
  const show = () => {
    const items = categoryMatches(input.value, extras);
    if (!items.length || (items.length === 1 && items[0] === input.value)) return close();
    active = -1;
    list.replaceChildren(...items.map(label => el('li', { textContent: label, role: 'option' })));
    const wasHidden = list.hidden;
    list.hidden = false;
    list.scrollTop = 0;
    // Handy: Feld nach oben holen, damit Liste und Tastatur Platz haben
    if (wasHidden && narrow.matches) {
      const top = input.getBoundingClientRect().top - sheetBody.getBoundingClientRect().top;
      if (top > 90) sheetBody.scrollBy({ top: top - 60, behavior: 'smooth' });
    }
  };
  const mark = i => {
    const lis = list.children;
    if (!lis.length) return;
    active = (i + lis.length) % lis.length;
    [...lis].forEach((li, k) => li.classList.toggle('active', k === active));
    lis[active].scrollIntoView({ block: 'nearest' });
  };
  input.addEventListener('focus', show);
  input.addEventListener('click', show);
  input.addEventListener('input', show);
  // Auswahl beim Loslassen (Maus oder Finger), aber nicht nach dem Scrollen der Liste.
  // Auf dem iPhone schließt die Tastatur schon beim Antippen und das Feld verliert den Fokus –
  // deshalb schließt die Liste beim Verlassen des Felds erst kurz danach.
  let down = null;
  list.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, li: e.target.closest('li') };
    if (e.pointerType === 'mouse') e.preventDefault(); // Feld behält den Fokus
  });
  list.addEventListener('pointerup', e => {
    const li = e.target.closest('li');
    if (down && li && li === down.li && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) {
      e.preventDefault();
      choose(li.textContent);
    }
    down = null;
  });
  list.addEventListener('pointercancel', () => { down = null; }); // Liste wurde gescrollt
  document.addEventListener('pointerdown', e => { if (!list.hidden && !wrap.contains(e.target)) close(); });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input && !down) close(); }, 250));
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(active - 1); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(list.children[active].textContent); }
    else if (e.key === 'Escape') close();
  });
  input.parentNode?.insertBefore(wrap, input); // steht das Feld schon im Formular, an seiner Stelle einhängen
  wrap.append(input, list);
  return wrap;
}

function renderConditions() {
  const box = $('#conds');
  box.replaceChildren();
  conditions.forEach((c, i) => {
    const what = el('input', { value: c.text, placeholder: t('z. B. Spielplatz, Bäckerei, dm …', 'e.g. playground, bakery, Starbucks …'), autocomplete: 'off' });
    what.oninput = () => { c.text = what.value; };
    const radius = el('select', { title: t('Maximale Entfernung', 'Maximum distance') });
    for (const r of RADII) radius.append(el('option', { value: r, textContent: `≤ ${fmtRadius(r)}` }));
    radius.value = c.radius;
    radius.onchange = () => { c.radius = Number(radius.value); };
    box.append(el('div', { className: 'cond' },
      el('span', { className: 'dot', style: { background: COLORS[i % COLORS.length] } }),
      attachPicker(what, label => { c.text = label; }),
      radius,
      el('button', { type: 'button', className: 'rm ghost', textContent: '✕', title: t('Bedingung entfernen', 'Remove condition'),
        onclick: () => { conditions.splice(i, 1); renderConditions(); } }),
    ));
  });
  if (!conditions.length) {
    box.append(el('div', { className: 'r-sub', textContent: t('Keine Bedingungen – es werden alle Treffer gezeigt.', 'No conditions – all results are shown.'), style: { marginBottom: '6px' } }));
  }
}

$('#addCond').onclick = () => {
  conditions.push({ text: '', radius: 500 });
  renderConditions();
  $('#conds').lastElementChild.querySelector('input').focus();
};
renderConditions();
// „Was?“: dieselbe Liste, dazu ein paar beliebte Küchen
attachPicker($('#main'), () => {}, t(['Italienisches Restaurant', 'Pizza', 'Sushi', 'Burger'], ['Italian restaurant', 'Pizza', 'Sushi', 'Burger']));

function setStatus(content, isError = false) {
  const s = $('#status');
  s.className = isError ? 'error' : '';
  s.replaceChildren(...[].concat(content));
}

function setBusy(busy) {
  $('#go').disabled = busy;
  $('#searchView').disabled = busy;
  $('#go').textContent = busy ? t('Suche läuft …', 'Searching …') : t('Suchen', 'Search');
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
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=' + t('de', 'en') + '&polygon_geojson=1&polygon_threshold=0.0003&q=' + encodeURIComponent(q);
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('Die Ortssuche ist gerade nicht erreichbar.', 'Place search is currently unavailable.'));
  const data = await res.json();
  if (!data.length) throw new Error(t(`Den Ort „${q}“ habe ich nicht gefunden.`, `Couldn’t find the place “${q}”.`));
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
  const parts = mainCat ? [lines(mainCat, box(bbox))] : [];
  for (const c of conds) parts.push(lines(c, box(expandBbox(bbox, c.radius))));
  return `[out:json][timeout:60];\n(\n${parts.join('\n')}\n);\nout center tags;`;
}

// Die öffentlichen Overpass-Server sind oft überlastet. Deshalb: Server der Reihe
// nach anfragen, aber nicht auf einen hängenden warten – nach STAGGER_MS (oder
// sofort bei einem Fehler) startet zusätzlich der nächste. Die erste gültige
// Antwort gewinnt, alle anderen Anfragen werden abgebrochen.
const STAGGER_MS = 600; // fast parallel: der schnellste Server gewinnt
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
          lastErr = err.name === 'AbortError' ? new Error(t('Zeitüberschreitung', 'timeout')) : err;
          pending--;
          if (next < OVERPASS.length) start();
          else if (!pending) finish(reject, new Error(t('Die OpenStreetMap-Datenserver sind gerade nicht erreichbar oder überlastet (', 'The OpenStreetMap data servers are unavailable or overloaded right now (') + lastErr.message + t('). Bitte gleich nochmal versuchen oder einen kleineren Bereich wählen.', '). Please try again shortly or choose a smaller area.')));
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
  b.replaceChildren(el('span', { className: 'what', textContent: summary }), el('span', { className: 'edit', textContent: t('Ändern', 'Edit') }));
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
// Karte oben bleibt immer frei, gescrollt wird nur im Blatt (#sheetBody).
//   half = Ausgangslage: Karte oben, Liste darunter
//   peek = Karte im Vollbild: am Griff (oder ganz oben in der Liste) nach unten ziehen; Tipp/hochziehen holt es zurück
const sheet = $('#panel'), grip = $('#grip'), mapEl = $('#map'), sheetBody = $('#sheetBody');
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
    // Das Blatt selbst bewegen wir im Karten-Vollbild, am Griff oder ganz oben in der Liste beim
    // Herunterziehen; alles andere ist normales Scrollen der Liste.
    if (document.body.classList.contains('typing')) { drag = null; return; }
    const onGrip = e.target === grip;
    const moveSheet = sheetState === 'peek' || ((onGrip || sheetBody.scrollTop <= 0) && dy > 0);
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

// Tipp auf den Griff: Karte im Vollbild ↔ Ausgangslage
grip.addEventListener('click', () => setSheet(sheetState === 'peek' ? 'half' : 'peek'));

// Mausrad/Trackpad (schmales Fenster am Rechner): ganz oben weiter "hochscrollen" = Karte im Vollbild
let lastWheel = 0;
window.addEventListener('wheel', e => {
  if (!narrow.matches) return;
  const intoPeek = sheetState === 'half' && sheetBody.scrollTop <= 0 && e.deltaY < 0 && sheet.contains(e.target);
  const outOfPeek = sheetState === 'peek' && e.deltaY > 0;
  if (!intoPeek && !outOfPeek) return; // normales Scrollen der Liste
  e.preventDefault();
  if (e.timeStamp - lastWheel < 450) return;
  lastWheel = e.timeStamp;
  setSheet(intoPeek ? 'peek' : 'half');
}, { passive: false });

// Tippen in ein Feld: Blatt nach oben über die Karte, damit Auswahlliste und Tastatur Platz haben.
let typingTimer;
sheet.addEventListener('focusin', e => {
  if (!narrow.matches || !e.target.matches('input:not([type=checkbox]):not([type=radio])')) return;
  clearTimeout(typingTimer);
  if (sheetState === 'peek') setSheet('half', { sync: true });
  document.body.classList.add('typing');
});
sheet.addEventListener('focusout', () => {
  // kurz warten: Wechsel ins nächste Feld oder Tipp in die Auswahlliste
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    if (!sheet.contains(document.activeElement) || !document.activeElement.matches('input')) {
      document.body.classList.remove('typing');
      window.scrollTo(0, 0); // iOS verschiebt die Seite beim Einblenden der Tastatur
    }
  }, 300);
});

// iOS legt die Tastatur über die Seite, ohne sie kleiner zu machen. Darum das Blatt beim Tippen auf
// den sichtbaren Bereich (visualViewport) begrenzen und das aktive Feld darin sichtbar scrollen.
const vv = window.visualViewport;
function revealActive() {
  const el = document.activeElement;
  if (!document.body.classList.contains('typing') || !el || !sheetBody.contains(el)) return;
  const box = sheetBody.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.bottom > box.bottom - 12) sheetBody.scrollTop += r.bottom - box.bottom + 12;
  else if (r.top < box.top + 12) sheetBody.scrollTop -= box.top + 12 - r.top;
}
function fitViewport() {
  if (!vv) return;
  const top = Math.max(0, vv.offsetTop);
  const kb = Math.max(0, window.innerHeight - vv.height - top);
  document.documentElement.style.setProperty('--vv-top', top + 'px');
  document.documentElement.style.setProperty('--kb', kb + 'px');
  requestAnimationFrame(revealActive);
}
if (vv) { vv.addEventListener('resize', fitViewport); vv.addEventListener('scroll', fitViewport); }
sheet.addEventListener('focusin', () => setTimeout(fitViewport, 50));

narrow.addEventListener('change', () => { setSheet('half', { sync: true }); map.invalidateSize(); });
window.addEventListener('resize', () => { if (sheetState === 'peek') setSheet('peek', { sync: true }); });
setSheet('half', { sync: true });

// ---------- Suche ----------
let current = { results: [], conds: [] };

// ---------- Eigener Standort ----------
const NEAR_ME_M = 2000; // Suchradius „Um mich herum“

function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error(t('Dein Browser kann den Standort nicht bestimmen.', 'Your browser cannot determine your location.')));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }),
      err => reject(new Error(
        err.code === 1 ? t('Standortfreigabe abgelehnt. Auf dem iPhone: Einstellungen → Datenschutz → Ortungsdienste → Safari-Websites (bzw. NextToMaps) erlauben.',
          'Location access denied. On iPhone: Settings → Privacy → Location Services → allow Safari Websites (or NextToMaps).')
        : err.code === 3 ? t('Der Standort konnte nicht rechtzeitig bestimmt werden. Bitte nochmal versuchen.', 'Your location could not be determined in time. Please try again.')
        : t('Der Standort ist gerade nicht verfügbar.', 'Your location is currently unavailable.'))),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}

// Blauer Punkt mit Genauigkeitskreis, wie bei Google Maps
function showMe(me) {
  meLayer.clearLayers();
  if (me.acc && me.acc < 1500) {
    L.circle([me.lat, me.lon], { radius: me.acc, color: '#4285f4', weight: 0, fillOpacity: 0.15, interactive: false }).addTo(meLayer);
  }
  L.circleMarker([me.lat, me.lon], { radius: 8, color: '#fff', weight: 2.5, fillColor: '#4285f4', fillOpacity: 1 })
    .bindTooltip(t('Du bist hier', 'You are here')).addTo(meLayer);
}

// Beim Start die Karte auf den eigenen Standort legen (ohne Fehlermeldung, falls nicht erlaubt).
locate().then(me => {
  if (current.results.length) return; // Nutzer hat schon gesucht
  showMe(me);
  map.setView([me.lat, me.lon], 15);
}).catch(() => { /* bleibt beim Überblick */ });

// „Um mich herum“ und ähnliche Eingaben im Wo?-Feld bedeuten: eigener Standort
const isNearMe = text => /^(um mich( herum)?|in meiner n(ä|ae)he|meine? (n(ä|ae)he|standort)|aktueller standort|hier|around me|near me|nearby|my location|current location|here)$/i.test(text.trim());

// Dasselbe OSM-Objekt aus zwei Quellen (Datenbank „db/…“ und öffentliche Server „node/…“) hat
// verschiedene IDs: dann gleicher Name und fast gleiche Lage.
function sameObject(a, b) {
  if (a.id.startsWith('db/') === b.id.startsWith('db/') || a.id.startsWith('g/') || b.id.startsWith('g/')) return false;
  const nm = t => t.name || t.brand || ''; // die Datenbank speichert Name oder Marke
  return nm(a.tags) === nm(b.tags) && haversine(a, b) < (nm(a.tags) ? 40 : 5);
}

async function runSearch(useMapView, { osm = '' } = {}) {
  const nearMe = !useMapView && (isNearMe($('#place').value) || !$('#place').value.trim()); // leer = um mich herum
  setBusy(true);
  showSkeleton();
  try {
    if (dataSource() === 'none') {
      $('#account').open = true;
      throw new Error(t('Bitte melde dich zuerst an – unten unter „Konto“, mit deiner E-Mail-Adresse.', 'Please sign in first – below under “Account”, with your email address.'));
    }
    if (dataSource() === 'cloud' && account?.status && account.status !== 'approved') await refreshAccount(); // evtl. inzwischen freigeschaltet
    if (dataSource() === 'cloud' && account?.status && account.status !== 'approved') {
      $('#account').open = true;
      throw new Error(account.status === 'pending'
        ? t('Dein Konto wartet noch auf Freischaltung. Du bekommst eine E-Mail, sobald du suchen kannst.', 'Your account is still awaiting approval. You will get an email as soon as you can search.')
        : t('Dein Konto wurde nicht freigeschaltet.', 'Your account was not approved.'));
    }
    const mainCat = resolve($('#main').value);
    if (!mainCat) throw new Error(t('Bitte eingeben, was du suchst.', 'Please enter what you are looking for.'));
    const conds = conditions.filter(c => c.text.trim()).map((c, i) => {
      const r = resolve(c.text);
      if (!r) throw new Error(t(`Mit der Bedingung „${c.text.trim()}“ kann ich nichts anfangen.`, `I can’t do anything with the condition “${c.text.trim()}”.`));
      return { ...r, radius: c.radius, color: COLORS[conditions.indexOf(c) % COLORS.length] };
    });

    let bbox, where, polygons = null, me = null;
    if (nearMe) {
      setLoading(t('Bestimme deinen Standort …', 'Finding your location …'));
      me = await locate();
      showMe(me);
      bbox = expandBbox({ s: me.lat, n: me.lat, w: me.lon, e: me.lon }, NEAR_ME_M);
      where = t('um dich herum', 'around you');
      map.fitBounds([[bbox.s, bbox.w], [bbox.n, bbox.e]]);
    } else if (useMapView) {
      const b = map.getBounds();
      bbox = { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() };
      where = t('im Kartenausschnitt', 'in the map view');
    } else {
      meLayer.clearLayers();
      const place = $('#place').value.trim();
      setLoading(t('Suche Ort …', 'Finding place …'));
      const g = await geocode(place);
      bbox = g.bbox;
      polygons = g.polygons;
      where = t('in ', 'in ') + g.name;
      map.fitBounds([[bbox.s, bbox.w], [bbox.n, bbox.e]]);
    }

    const diagKm = haversine({ lat: bbox.s, lon: bbox.w }, { lat: bbox.n, lon: bbox.e }) / 1000;
    if (diagKm > MAX_DIAGONAL_KM) {
      throw new Error(t(`Der Bereich ist zu groß (${Math.round(diagKm)} km Diagonale, max. ${MAX_DIAGONAL_KM} km). Bitte einen kleineren Ort wählen oder näher heranzoomen.`, `The area is too large (${Math.round(diagKm)} km diagonal, max. ${MAX_DIAGONAL_KM} km). Please choose a smaller place or zoom in.`));
    }

    let data = null, note = '', source = dataSource();
    const fallback = source === 'cloud' ? (osm || osmFallback()) : '';
    if (fallback) {
      if (osm) rememberOsmFallback(osm);
      source = 'osm';
      note = fallback === 'user'
        ? t('Google-Kontingent für diesen Monat aufgebraucht – mit OpenStreetMap gesucht. Ab dem Monatsersten wieder mit Google.', 'Google quota for this month used up – searched with OpenStreetMap. Google is back on the 1st of next month.')
        : fallback === 'global'
          ? t('Google-Suche ist für heute ausgelastet – mit OpenStreetMap gesucht. Ab Mitternacht wieder mit Google.', 'Google search is at capacity for today – searched with OpenStreetMap. Google is back after midnight.')
          : t('Mit OpenStreetMap gesucht.', 'Searched with OpenStreetMap.');
    }
    activeSource = source;
    if (source === 'cloud') {
      setLoading(t('Suche bei Google …', 'Searching Google …'));
      data = await googleData(mainCat, conds, bbox);
      note = stripOsmHint(data.note);
      source = 'google';
    } else if (source === 'google') {
      setLoading(t('Suche bei Google …', 'Searching Google …'));
      try {
        data = await googleData(mainCat, conds, bbox);
        note = data.note;
      } catch (err) {
        note = err.message + t(' – stattdessen mit OpenStreetMap gesucht.', ' – searched with OpenStreetMap instead.');
        source = 'osm';
      }
    }
    if (!data) {
      data = await osmData(mainCat, conds, bbox);
      if (data.note) note = [note, data.note].filter(Boolean).join(' ');
    }

    // „Weitere laden“ (nur Google-Suche um wenige Orte): nächste Seite holen und neu auswerten
    const searchSource = activeSource, cleanNote = n => (searchSource === 'cloud' ? stripOsmHint(n) : n);
    const more = data.more && {
      cost: data.more.cost,
      load: async () => {
        const mine = current;
        activeSource = searchSource;
        setBusy(true);
        try {
          const next = await data.more.load();
          if (current !== mine) return; // inzwischen neu gesucht
          const r = evaluate(next);
          current = { ...current, results: r.results, note: cleanNote(next.note), more: data.more.cost() ? more : null };
          render(r.total, where, { keepView: true });
        } finally {
          setBusy(false);
        }
      },
    };
    const evaluate = d => {
      const mains = d.mains.filter(p => inBbox(p, bbox) && (!polygons || inPolygons(p, polygons)) &&
        (!me || haversine(me, p) <= NEAR_ME_M)); // um mich herum: echter Kreis statt Rechteck
      return { results: matchResults(mains, d.pools, conds, me), total: mains.length };
    };
    const { results, total } = evaluate(data);
    current = { results, conds, mainCat, source, note, me, more: more && more.cost() ? more : null };
    collapseForm(`${mainCat.label} ${where}` + (conds.length ? ` · ${conds.map(c => c.label).join(', ')}` : ''));
    render(total, where);
  } catch (err) {
    resultLayer.clearLayers(); poiLayer.clearLayers(); highlightLayer.clearLayers();
    $('#results').replaceChildren();
    expandForm();
    setStatus(err.quota
      ? [err.message, ' ', el('button', { type: 'button', className: 'ghost osm-retry', textContent: t('Mit OpenStreetMap weitersuchen', 'Continue with OpenStreetMap'),
          onclick: () => runSearch(useMapView, { osm: err.quota }) })]
      : err.message || String(err), true);
  } finally {
    setBusy(false);
  }
}

// Über das Backend gibt es keinen OSM-Hinweis im Google-Text (OSM ist dort eine eigene Umschaltung)
const stripOsmHint = n => n.replace(/ (Vollständiger, aber langsamer|More complete but slower): OpenStreetMap\./, '');

// Haupttreffer, die alle Bedingungen erfüllen, mit den nächsten Orten je Bedingung
function matchResults(mains, pools, conds, me) {
    const results = [];
    for (const m of mains) {
      const near = [];
      let ok = true;
      for (let i = 0; i < conds.length && ok; i++) {
        const hits = [];
        for (const p of pools[i]) {
          if (p.id === m.id || sameObject(p, m)) continue;
          const d = haversine(m, p);
          if (d <= conds[i].radius) hits.push({ p, d });
        }
        if (!hits.length) ok = false;
        else near.push(hits.sort((a, b) => a.d - b.d));
      }
      if (ok) results.push({ ...m, near, score: near.reduce((s, h) => s + h[0].d, 0) });
    }
    if (me) {
      // um mich herum: nächstgelegene zuerst
      results.forEach(r => { r.fromMe = haversine(me, r); });
      results.sort((a, b) => a.fromMe - b.fromMe);
    } else {
      results.sort((a, b) => a.score - b.score || (a.tags.name || '').localeCompare(b.tags.name || ''));
    }
    return results;
}

// ---------- Darstellung ----------
function displayName(r) {
  return r.tags.name || r.tags.brand || `${current.mainCat.label} ${t('(ohne Namen)', '(unnamed)')}`;
}

function address(tags) {
  if (tags['addr:full']) return tags['addr:full'];
  const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  const city = [tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ');
}

const ratingText = g => (g.rating ? `★ ${g.rating.toFixed(1).replace('.', t(',', '.'))}${g.ratings ? ` (${g.ratings})` : ''}` : '');

// Zusatzinfos, die unter dem ausgewählten Treffer in der Liste aufklappen
function detailsContent(r) {
  const tg = r.tags;
  const box = el('div', { className: 'r-details' });
  if (tg.opening_hours) box.append(el('div', { textContent: '🕑 ' + tg.opening_hours }));
  if (tg.openNow != null) box.append(el('div', { textContent: tg.openNow ? t('🕑 Jetzt geöffnet', '🕑 Open now') : t('🕑 Jetzt geschlossen', '🕑 Closed now') }));
  r.near.forEach((hits, i) => {
    const c = current.conds[i];
    const name = hits[0].p.tags?.name || hits[0].p.tags?.brand;
    box.append(el('div', {},
      el('span', { className: 'dot', style: { background: c.color, width: '9px', height: '9px', marginRight: '5px' } }),
      `${c.label}: ${fmtDist(hits[0].d)}` + (name ? ` – ${name}` : '') + (hits.length > 1 ? t(` (${hits.length} im Umkreis)`, ` (${hits.length} nearby)`) : '')));
  });
  const phone = tg.phone || tg['contact:phone'];
  const links = el('div', { className: 'links' });
  const gq = tg.name ? `${tg.name}, ${address(tg) || `${r.lat},${r.lon}`}` : `${r.lat},${r.lon}`;
  const gmaps = tg.gmaps || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(gq);
  links.append(el('a', { href: gmaps, target: '_blank', rel: 'noopener', textContent: 'Google Maps' }));
  // Route in Google Maps; ohne Startpunkt nimmt Google den aktuellen Standort.
  const route = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(`${r.lat},${r.lon}`)
    + (r.id.startsWith('g/') ? '&destination_place_id=' + encodeURIComponent(r.id.slice(2)) : '');
  links.append(el('a', { href: route, target: '_blank', rel: 'noopener', textContent: 'Route' }));
  if (!r.id.startsWith('g/')) links.append(el('a', { href: r.id.startsWith('db/') ? `https://www.openstreetmap.org/#map=19/${r.lat}/${r.lon}` : 'https://www.openstreetmap.org/' + r.id, target: '_blank', rel: 'noopener', textContent: 'OpenStreetMap' }));
  const site = tg.website || tg['contact:website'];
  if (site && /^https?:\/\//i.test(site)) links.append(el('a', { href: site, target: '_blank', rel: 'noopener', textContent: 'Website' }));
  if (phone) links.append(el('a', { href: 'tel:' + phone.split(';')[0].replace(/[^\d+]/g, ''), textContent: t('Anrufen', 'Call') }));
  box.append(links);
  return box;
}

function render(totalMain, where, { keepView = false } = {}) {
  const { results, conds, mainCat } = current;
  resultLayer.clearLayers(); poiLayer.clearLayers(); highlightLayer.clearLayers();

  const total = `${totalMain} × ${mainCat.label} ${where}`;
  if (!totalMain) setStatus(t(`Keine Treffer für „${mainCat.label}“ ${where}.`, `No results for “${mainCat.label}” ${where}.`));
  else if (!conds.length) setStatus([el('strong', { textContent: total }), t(' gefunden.', ' found.')]);
  else setStatus([el('strong', { textContent: t(`${results.length} von ${totalMain}`, `${results.length} of ${totalMain}`) }),
    ` × ${mainCat.label} ${where} ` + t(results.length === 1 ? 'erfüllt alle Bedingungen.' : 'erfüllen alle Bedingungen.', results.length === 1 ? 'meets all conditions.' : 'meet all conditions.')]);

  if (current.note) $('#status').append(el('div', { className: 'r-sub', textContent: current.note }));
  if (current.more) {
    const n = current.more.cost();
    const btn = el('button', { type: 'button', className: 'ghost osm-retry',
      textContent: t(`Weitere laden (${n} Google-${n === 1 ? 'Abfrage' : 'Abfragen'})`, `Load more (${n} Google ${n === 1 ? 'query' : 'queries'})`),
      onclick: async () => {
        btn.disabled = true;
        btn.textContent = t('Lade …', 'Loading …');
        try { await current.more.load(); } catch (err) {
          btn.remove();
          $('#status').append(el('div', { className: 'r-sub error', textContent: err.message || String(err) }));
        }
      } });
    $('#status').append(btn);
  }
  const fuzzy = current.source === 'osm' ? [mainCat, ...conds].filter(c => c.fuzzy).map(c => t(`„${c.label}“`, `“${c.label}”`)) : [];
  if (fuzzy.length) {
    $('#status').append(el('div', { className: 'r-sub', textContent: t(`${fuzzy.join(', ')} kenne ich nicht als Kategorie – gesucht wurde in Namen, Marken und Stichworten.`, `${fuzzy.join(', ')} is not a known category – searched names, brands and keywords.`) }));
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
  if (!keepView) {
    sheetBody.scrollTop = 0;
    setSheet('half', { sync: true });
  }
  results.forEach((r, idx) => {
    r.marker = L.circleMarker([r.lat, r.lon], { radius: 9, color: '#fff', weight: 2, fillColor: MAIN_COLOR, fillOpacity: 1 })
      .on('click', () => select(idx, false))
      .addTo(resultLayer);

    const sub = [r.fromMe != null && t(`${fmtDist(r.fromMe)} von dir`, `${fmtDist(r.fromMe)} from you`), r.tags.cuisine && r.tags.cuisine.replace(/_/g, ' ').replace(/;/g, ', '), r.tags.kind, ratingText(r.tags), address(r.tags)].filter(Boolean).join(' · ');
    const chips = el('div', { className: 'chips' });
    r.near.forEach((hits, i) => chips.append(el('span', { className: 'chip' },
      el('span', { className: 'dot', style: { background: conds[i].color, width: '9px', height: '9px' } }),
      `${conds[i].label} ${fmtDist(hits[0].d)}`)));
    // Klicks in den aufgeklappten Zusatzinfos (Links) wählen nicht erneut aus
    r.li = el('li', { onclick: e => { if (!e.target.closest('.r-details')) select(idx, true); } },
      el('div', { className: 'r-name', textContent: displayName(r) }),
      sub ? el('div', { className: 'r-sub', textContent: sub }) : null,
      conds.length ? chips : null);
    list.append(r.li);
  });

  if (results.length && !keepView) {
    const pts = results.map(r => [r.lat, r.lon]);
    if (current.me) pts.push([current.me.lat, current.me.lon]); // eigenen Standort mit ins Bild
    map.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 16 });
  }
}

const MARKER_STYLE = { radius: 9, weight: 2, opacity: 1, fillOpacity: 1 };
const MARKER_HIDDEN = { opacity: 0, fillOpacity: 0 }; // ausgewählter Treffer: statt Punkt die Stecknadel
// Stecknadel für den ausgewählten Treffer, wie im Logo (Spitze zeigt auf den Ort)
const PIN_ICON = L.divIcon({
  className: 'pin-icon',
  html: `<svg viewBox="-1 -1 34 46" width="34" height="46" aria-hidden="true">
    <path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 27 15 27s15-16 15-27C31 7.7 24.3 1 16 1z"
      fill="${MAIN_COLOR}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M16 9v14M9 16h14" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>`,
  iconSize: [34, 46], iconAnchor: [17, 44],
});

function select(idx, fromList) {
  const { results, conds } = current;
  const r = results[idx];
  results.forEach(x => {
    x.li.classList.remove('active');
    x.li.querySelector('.r-details')?.remove();
    x.marker.setStyle(MARKER_STYLE);
  });
  r.li.classList.add('active');
  r.li.append(detailsContent(r));
  r.marker.setStyle(MARKER_HIDDEN);
  highlightLayer.clearLayers();
  L.marker([r.lat, r.lon], { icon: PIN_ICON, zIndexOffset: 1000, keyboard: false })
    .on('click', () => select(idx, false)).addTo(highlightLayer);

  let maxRadius = 150;
  r.near.forEach((hits, i) => {
    const c = conds[i];
    maxRadius = Math.max(maxRadius, c.radius);
    L.circle([r.lat, r.lon], { radius: c.radius, color: c.color, weight: 1.5, dashArray: '5 6', fillOpacity: 0.04, interactive: false }).addTo(highlightLayer);
    const n = hits[0].p;
    L.polyline([[r.lat, r.lon], [n.lat, n.lon]], { color: c.color, weight: 3, interactive: false }).addTo(highlightLayer);
  });

  if (fromList) {
    if (narrow.matches) r.li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // Zusatzinfos sichtbar
    // Umkreis einpassen, dann zwei Stufen weiter heraus, damit die Umgebung sichtbar bleibt
    map.stop();
    const z = Math.max(map.getBoundsZoom(L.latLng(r.lat, r.lon).toBounds(maxRadius * 2.4)) - 2, 3);
    map.setView([r.lat, r.lon], z);
  } else {
    // Klick auf der Karte: Zeile in der Liste zeigen
    if (narrow.matches && sheetState === 'peek') setSheet('half');
    requestAnimationFrame(() => r.li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
}

// ---------- Events ----------
$('#form').addEventListener('submit', e => { e.preventDefault(); runSearch(false); });
$('#searchView').addEventListener('click', () => runSearch(true));
$('#useMe').addEventListener('click', () => { $('#place').value = t('Um mich herum', 'Around me'); });
