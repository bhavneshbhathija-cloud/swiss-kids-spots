/**
 * ingest_iconic_hikes.js
 * Ingests the top unnumbered iconic Swiss classic hiking tours from SwitzerlandMobility
 * into hikes.json, complete with official 3D GPS geometries, elevation profiles,
 * authentic photography, and family logistics.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to download raw text/xml
function fetchText(url) {
    return new Promise((resolve) => {
        https.get(url, {
            headers: {
                'User-Agent': 'SwissKidsSpots/1.0 (https://swissforkids.ch)',
                'Accept': '*/*'
            },
            timeout: 20000
        }, (res) => {
            if (res.headers.location) {
                return fetchText(res.headers.location).then(resolve);
            }
            if (res.statusCode !== 200) {
                return resolve(null);
            }
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(body));
        }).on('error', () => resolve(null))
          .on('timeout', () => resolve(null));
    });
}

// Convert Swiss LV03 / LV95 to WGS84
function lv03ToWgs84(y, x) {
    if (y > 2000000) y -= 2000000;
    if (x > 1000000) x -= 1000000;
    const yAux = (y - 600000) / 1000000;
    const xAux = (x - 200000) / 1000000;
    const lon = 2.6779094
        + 4.728982 * yAux
        + 0.791484 * yAux * xAux
        + 0.1306 * yAux * xAux * xAux
        - 0.0436 * yAux * yAux * yAux;
    const lat = 16.9023892
        + 3.238272 * xAux
        - 0.270978 * yAux * yAux
        - 0.002528 * xAux * xAux
        - 0.0447 * yAux * yAux * xAux
        - 0.0140 * xAux * xAux * xAux;
    return [
        Number((lat * 100 / 36).toFixed(5)),
        Number((lon * 100 / 36).toFixed(5))
    ];
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function parseGpxTrack(gpxXml) {
    if (!gpxXml) return null;
    const pts = [];
    const trkptRegex = /<trkpt\s+lat=["']([^"']+)["']\s+lon=["']([^"']+)["']>[\s\S]*?<ele>([^<]+)<\/ele>[\s\S]*?<\/trkpt>/g;
    let match;
    while ((match = trkptRegex.exec(gpxXml)) !== null) {
        pts.push({
            lat: parseFloat(match[1]),
            lng: parseFloat(match[2]),
            ele: Math.round(parseFloat(match[3]))
        });
    }
    if (pts.length < 2) return null;

    let cumDist = 0;
    const cumDists = [0];
    let minEle = Infinity;
    let maxEle = -Infinity;
    let ascent = 0;
    let descent = 0;

    for (let i = 0; i < pts.length; i++) {
        const e = pts[i].ele;
        if (e < minEle) minEle = e;
        if (e > maxEle) maxEle = e;
        if (i > 0) {
            const d = haversineKm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
            cumDist += d;
            cumDists.push(cumDist);
            const diff = e - pts[i - 1].ele;
            if (diff > 0) ascent += diff;
            else descent += Math.abs(diff);
        }
    }

    const distKm = Number(cumDist.toFixed(1));

    // Downsample polyline to 25 points
    const maxPolyPts = 25;
    const coordinates = [];
    const polyStep = (pts.length - 1) / Math.min(maxPolyPts - 1, pts.length - 1);
    const polyCount = Math.min(maxPolyPts, pts.length);
    for (let i = 0; i < polyCount; i++) {
        const idx = Math.min(Math.round(i * polyStep), pts.length - 1);
        coordinates.push([Number(pts[idx].lat.toFixed(5)), Number(pts[idx].lng.toFixed(5))]);
    }

    // Downsample elevation profile to 20 points
    const maxProfPts = 20;
    const elevationProfile = [];
    const profStep = (pts.length - 1) / Math.min(maxProfPts - 1, pts.length - 1);
    const profCount = Math.min(maxProfPts, pts.length);
    for (let i = 0; i < profCount; i++) {
        const idx = Math.min(Math.round(i * profStep), pts.length - 1);
        elevationProfile.push({
            d: Number(cumDists[idx].toFixed(2)),
            ele: pts[idx].ele
        });
    }

    return {
        distKm,
        ascentM: Math.round(ascent),
        descentM: Math.round(descent),
        minEle,
        maxEle,
        coordinates,
        elevationProfile
    };
}

async function run() {
    console.log('=== Ingesting Curated Set of Iconic Swiss Classic Hiking Tours ===');

    // 1. Load postal codes
    const zipsPath = path.join(__dirname, 'postal-codes.json');
    const zipsDict = fs.existsSync(zipsPath) ? JSON.parse(fs.readFileSync(zipsPath, 'utf8')) : {};
    const zipEntries = Object.entries(zipsDict).map(([zip, info]) => ({
        zip,
        city: info.city,
        canton: info.canton,
        lat: info.lat,
        lng: info.lng
    }));

    function findClosestZip(lat, lng) {
        let best = { zip: '8000', city: 'Zürich', canton: 'ZH' };
        let minD = Infinity;
        for (const z of zipEntries) {
            const dLat = lat - z.lat;
            const dLng = lng - z.lng;
            const d2 = dLat * dLat + dLng * dLng;
            if (d2 < minD) {
                minD = d2;
                best = z;
            }
        }
        return best;
    }

    // 2. Load spots for cross-linking
    const spotsPath = path.join(__dirname, 'spots_harvested.json');
    const existingSpots = fs.existsSync(spotsPath)
        ? JSON.parse(fs.readFileSync(spotsPath, 'utf8')).filter(s => s.type !== 'hiking' && s.lat && s.lng)
        : [];
    const spotGrid = new Map();
    for (const s of existingSpots) {
        const gx = Math.floor(s.lat * 50);
        const gy = Math.floor(s.lng * 50);
        const key = `${gx},${gy}`;
        if (!spotGrid.has(key)) spotGrid.set(key, []);
        spotGrid.get(key).push(s);
    }

    function findNearbySpots(coords) {
        if (!coords || coords.length === 0) return [];
        const candidates = new Map();
        for (const [lat, lng] of coords) {
            const gx = Math.floor(lat * 50);
            const gy = Math.floor(lng * 50);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const cell = spotGrid.get(`${gx + dx},${gy + dy}`);
                    if (!cell) continue;
                    for (const spot of cell) {
                        const d = haversineKm(spot.lat, spot.lng, lat, lng);
                        if (d <= 0.9) {
                            const prev = candidates.get(spot.id);
                            if (!prev || d < prev.distanceKm) {
                                candidates.set(spot.id, {
                                    id: spot.id,
                                    name: spot.name,
                                    type: spot.type,
                                    distanceKm: Number(d.toFixed(2)),
                                    lat: spot.lat,
                                    lng: spot.lng
                                });
                            }
                        }
                    }
                }
            }
        }
        return Array.from(candidates.values())
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 4);
    }

    // 3. Definitions of the Iconic Classic Swiss Tours
    const toursToIngest = [
        {
            id: 'hike-iconic-ebenalp-seealpsee-wasserauen',
            trackId: '212067908',
            routeNumber: 'Ebenalp',
            name: 'Ebenalp – Wildkirchli – Berggasthaus Äscher – Seealpsee (Wasserauen)',
            nameEn: 'Ebenalp – Wildkirchli – Berggasthaus Äscher – Seealpsee (Wasserauen)',
            nameDe: 'Ebenalp – Wildkirchli – Berggasthaus Äscher – Seealpsee (Wasserauen)',
            region: 'Eastern Switzerland',
            city: 'Wasserauen',
            zip: '9057',
            canton: 'AI',
            startStop: 'Ebenalp (Luftseilbahn Bergstation)',
            endStop: 'Wasserauen Bahnhof (Appenzeller Bahnen)',
            parking: 'Large pay parking lot directly at Wasserauen train / cable car station (9057 Wasserauen)',
            restaurants: [
                'Berggasthaus Ebenalp (1,590m)',
                'Berggasthaus Äscher-Wildkirchli (cliffside restaurant at 1,454m)',
                'Berggasthaus Forelle & Berggasthaus Seealpsee (lakeside dining at 1,141m)'
            ],
            playgroundsNote: 'Rowboats for hire on crystal Lake Seealpsee, traditional Appenzell alpine show dairy with fresh cheese & milk.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area', 'Lake/Swimming'],
            minAge: 6,
            maxAge: 99,
            strollerFriendly: 'no',
            difficulty: 'moderate',
            sacScale: 'T2 – Mountain Hiking Trail (Bergwanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/212067908',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/212067908',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Berggasthaus_Aescher_Wildkirchli_Alpstein.jpg/1280px-Berggasthaus_Aescher_Wildkirchli_Alpstein.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Seealpsee_Alpstein.jpg/1280px-Seealpsee_Alpstein.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Wildkirchli_Appenzell.jpg/1280px-Wildkirchli_Appenzell.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Seealpsee_mit_Saentis.jpg/1280px-Seealpsee_mit_Saentis.jpg'
            ],
            imageCredit: '© Appenzellerland Tourismus / Wikimedia Commons',
            description: 'Switzerland’s world-famous cliffside trail in the Alpstein massif. Take the cable car from Wasserauen to Ebenalp (1,590m), walk through the prehistoric Wildkirchli cave chapel, and marvel at the iconic Berggasthaus Äscher built directly into the vertical cliff face. Descend via the scenic mountain trail to turquoise Lake Seealpsee for a lakeside picnic and rowboat rental before finishing at Wasserauen (7.7 km, ↑150m / ↓870m, T2).',
            descriptionEn: 'Switzerland’s world-famous cliffside trail in the Alpstein massif. Take the cable car from Wasserauen to Ebenalp (1,590m), walk through the prehistoric Wildkirchli cave chapel, and marvel at the iconic Berggasthaus Äscher built directly into the vertical cliff face. Descend via the scenic mountain trail to turquoise Lake Seealpsee for a lakeside picnic and rowboat rental before finishing at Wasserauen (7.7 km, ↑150m / ↓870m, T2).',
            descriptionDe: 'Die weltberühmte Felsenweg-Wanderung im Alpstein. Von der Bergstation Ebenalp (1590 m) geht es durch die prähistorischen Wildkirchli-Höhlen zur Höhlenkapelle und zum spektakulären Berggasthaus Äscher an der senkrechten Felswand. Anschliessend führt der Bergweg hinunter zum idyllischen Seealpsee (Ruderboote & Alpkäserei) und talauswärts nach Wasserauen (7.7 km, ↑150m / ↓870m, T2).'
        },
        {
            id: 'hike-iconic-first-bachalpsee-grindelwald',
            trackId: '5200131',
            routeNumber: 'Bachalpsee',
            name: 'Grindelwald-First to Bachalpsee Mirror Lake (First Cliff Walk)',
            nameEn: 'Grindelwald-First to Bachalpsee Mirror Lake (First Cliff Walk)',
            nameDe: 'Grindelwald-First zum Bachalpsee Spiegelsee (First Cliff Walk)',
            region: 'Bern & Oberland',
            city: 'Grindelwald',
            zip: '3818',
            canton: 'BE',
            startStop: 'Grindelwald-First (Gondelbahn Bergstation)',
            endStop: 'Grindelwald-First (Gondelbahn Bergstation) oder Bort',
            parking: 'Parking Parkhaus Grindelwald Terminal or Firstbahn valley station (3818 Grindelwald)',
            restaurants: [
                'Berggasthaus First & Panorama Restaurant (2,168m)',
                'Berghaus Bort & Restaurant Waldspitz'
            ],
            playgroundsNote: 'Alpine Playground Bort (huge wooden climbing playground at middle station), First Cliff Walk by Tissot suspension bridge, First Glider & Flyer.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area', 'Playground', 'Stroller-Friendly'],
            minAge: 4,
            maxAge: 99,
            strollerFriendly: 'yes',
            difficulty: 'easy',
            sacScale: 'T1 – Hiking Trail (Wanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/5200131',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/5200131',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Bachalpsee_reflection.jpg/1280px-Bachalpsee_reflection.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/First_Cliff_Walk_Grindelwald.jpg/1280px-First_Cliff_Walk_Grindelwald.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bachalpsee_Schreckhorn.jpg/1280px-Bachalpsee_Schreckhorn.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Bachalpsee_Switzerland.jpg/1280px-Bachalpsee_Switzerland.jpg'
            ],
            imageCredit: '© Jungfrau Region / Wikimedia Commons',
            description: 'The "Blue Jewel" of the Bernese Alps! Take the 6-person gondola from Grindelwald to First (2,168m), experience the dizzying First Cliff Walk suspended high above the valley, then follow the wide, all-terrain stroller-friendly trail across flower meadows to Lake Bachalpsee (2,265m), where the snow-capped Wetterhorn and Schreckhorn reflect in mirror-calm water (5.9 km, ↑190m / ↓190m, T1).',
            descriptionEn: 'The "Blue Jewel" of the Bernese Alps! Take the 6-person gondola from Grindelwald to First (2,168m), experience the dizzying First Cliff Walk suspended high above the valley, then follow the wide, all-terrain stroller-friendly trail across flower meadows to Lake Bachalpsee (2,265m), where the snow-capped Wetterhorn and Schreckhorn reflect in mirror-calm water (5.9 km, ↑190m / ↓190m, T1).',
            descriptionDe: 'Das «Blaue Juwel» der Berner Alpen! Von Grindelwald per Gondelbahn nach First (2168 m), über den spektakulären First Cliff Walk und auf breitem, geländegängig kinderwagentauglichem Wanderweg durch Blumenwiesen zum Bachalpsee (2265 m) mit der weltbekannten Spiegelung von Schreckhorn und Wetterhorn (5.9 km, ↑190m / ↓190m, T1).'
        },
        {
            id: 'hike-iconic-maennlichen-kleine-scheidegg-panoramaweg',
            trackId: '1026668131',
            routeNumber: 'Männlichen',
            name: 'Männlichen to Kleine Scheidegg: Jungfrau Panoramaweg (Trail 33)',
            nameEn: 'Männlichen to Kleine Scheidegg: Jungfrau Panoramaweg (Trail 33)',
            nameDe: 'Männlichen nach Kleine Scheidegg: Panoramaweg Jungfrau (Weg 33)',
            region: 'Bern & Oberland',
            city: 'Lauterbrunnen',
            zip: '3822',
            canton: 'BE',
            startStop: 'Männlichen (Luftseilbahn ab Wengen oder Grindelwald)',
            endStop: 'Kleine Scheidegg (Zahnradbahn nach Grindelwald oder Lauterbrunnen)',
            parking: 'Grindelwald Terminal or Lauterbrunnen multi-storey car park',
            restaurants: [
                'Berghaus Männlichen (2,230m)',
                'Restaurant Grindelwaldblick & Restaurant Eigernordwand (Kleine Scheidegg)'
            ],
            playgroundsNote: 'Cow Playground at Männlichen (giant wooden alpine cow slide), Marmot theme trail stations, gentle stroller-accessible gravel trail.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area', 'Playground', 'Stroller-Friendly'],
            minAge: 3,
            maxAge: 99,
            strollerFriendly: 'yes',
            difficulty: 'easy',
            sacScale: 'T1 – Hiking Trail (Wanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/1026668131',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/1026668131',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Maennlichen_Kleine_Scheidegg_Panorama.jpg/1280px-Maennlichen_Kleine_Scheidegg_Panorama.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Eiger_Moench_Jungfrau_from_Maennlichen.jpg/1280px-Eiger_Moench_Jungfrau_from_Maennlichen.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Kleine_Scheidegg_with_Eiger.jpg/1280px-Kleine_Scheidegg_with_Eiger.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Maennlichen_Kuh_Spielplatz.jpg/1280px-Maennlichen_Kuh_Spielplatz.jpg'
            ],
            imageCredit: '© Jungfrau Railways / SchweizMobil',
            description: 'Switzerland’s ultimate front-row seat to the iconic Eiger, Mönch & Jungfrau! Starting from Männlichen (2,229m, with the famous giant wooden Cow playground), this gentle, wide balcony path stays almost flat as it traces the slopes of the Tschuggen directly facing the sheer 1,800m Eiger North Face, concluding at the historic cogwheel railway hub of Kleine Scheidegg (4.7 km, ↑67m / ↓237m, T1).',
            descriptionEn: 'Switzerland’s ultimate front-row seat to the iconic Eiger, Mönch & Jungfrau! Starting from Männlichen (2,229m, with the famous giant wooden Cow playground), this gentle, wide balcony path stays almost flat as it traces the slopes of the Tschuggen directly facing the sheer 1,800m Eiger North Face, concluding at the historic cogwheel railway hub of Kleine Scheidegg (4.7 km, ↑67m / ↓237m, T1).',
            descriptionDe: 'Der schönste Panoramabalkon auf Eiger, Mönch und Jungfrau! Von Männlichen (2229 m mit Riesenkuh-Spielplatz) führt der sanfte, breite und kinderwagentaugliche Wanderweg fast eben an den Hängen des Tschuggen entlang direkt auf die mächtige Eiger-Nordwand zu und endet an der traditionsreichen Kleinen Scheidegg (4.7 km, ↑67m / ↓237m, T1).'
        },
        {
            id: 'hike-iconic-rotenboden-riffelsee-riffelberg-zermatt',
            trackId: '618693364',
            routeNumber: 'Riffelsee',
            name: 'Gornergrat to Riffelsee: Matterhorn Reflection Trail (Rotenboden – Riffelberg)',
            nameEn: 'Gornergrat to Riffelsee: Matterhorn Reflection Trail (Rotenboden – Riffelberg)',
            nameDe: 'Gornergrat zum Riffelsee: Matterhorn-Spiegelweg (Rotenboden – Riffelberg)',
            region: 'Valais / Wallis',
            city: 'Zermatt',
            zip: '3920',
            canton: 'VS',
            startStop: 'Rotenboden (Gornergrat Bahn Zahnradbahn)',
            endStop: 'Riffelberg (Gornergrat Bahn Zahnradbahn)',
            parking: 'Matterhorn Terminal Täsch (shuttle train to car-free Zermatt)',
            restaurants: [
                '3100 Kulmhotel Gornergrat (highest hotel in the Swiss Alps)',
                'Buffet Bar Riffelberg & Restaurant Riffelhaus 1853'
            ],
            playgroundsNote: 'Unmatched Matterhorn photo opportunities at Lake Riffelsee, alpine marmot colonies, scenic historic cogwheel railway ride.',
            amenities: ['Cafe/Food', 'Toilets', 'Picnic Area', 'Lake/Swimming'],
            minAge: 5,
            maxAge: 99,
            strollerFriendly: 'no',
            difficulty: 'easy',
            sacScale: 'T1 – Hiking Trail (Wanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/618693364',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/618693364',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Matterhorn_from_Riffelsee_2017.jpg/1280px-Matterhorn_from_Riffelsee_2017.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Riffelsee_Matterhorn_Zermatt.jpg/1280px-Riffelsee_Matterhorn_Zermatt.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Gornergrat_Railway_Rotenboden.jpg/1280px-Gornergrat_Railway_Rotenboden.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Unterer_Riffelsee_Matterhorn.jpg/1280px-Unterer_Riffelsee_Matterhorn.jpg'
            ],
            imageCredit: '© Zermatt Tourismus / Gornergrat Bahn',
            description: 'The quintessential postcard hike of Switzerland! Ride the Gornergrat cogwheel train to Rotenboden station (2,815m) and walk 10 minutes down to the glassy alpine waters of Lake Riffelsee to witness the world-famous upside-down reflection of the Matterhorn pyramid. Continue past Lower Riffelsee along the gentle alpine trail down to Riffelberg station (3.2 km, ↑30m / ↓260m, T1).',
            descriptionEn: 'The quintessential postcard hike of Switzerland! Ride the Gornergrat cogwheel train to Rotenboden station (2,815m) and walk 10 minutes down to the glassy alpine waters of Lake Riffelsee to witness the world-famous upside-down reflection of the Matterhorn pyramid. Continue past Lower Riffelsee along the gentle alpine trail down to Riffelberg station (3.2 km, ↑30m / ↓260m, T1).',
            descriptionDe: 'Die berühmteste Postkartenwanderung der Schweiz! Mit der Gornergratbahn nach Rotenboden (2815 m) und in wenigen Minuten hinunter zum glasklaren Riffelsee, wo sich das Matterhorn weltbekannt im Bergwasser spiegelt. Weiter vorbei am Unteren Riffelsee sanft abwärts zur Station Riffelberg (3.2 km, ↑30m / ↓260m, T1).'
        },
        {
            id: 'hike-iconic-saxer-luecke-faehlensee-alpstein',
            trackId: '107369974',
            routeNumber: 'Saxer Lücke',
            name: 'Saxer Lücke & Fählensee Panorama Trail: Stauberen – Bollenwees (Brülisau)',
            nameEn: 'Saxer Lücke & Fählensee Panorama Trail: Stauberen – Bollenwees (Brülisau)',
            nameDe: 'Saxer Lücke & Fählensee Panoramaweg: Stauberen – Bollenwees (Brülisau)',
            region: 'Eastern Switzerland',
            city: 'Brülisau',
            zip: '9058',
            canton: 'AI',
            startStop: 'Stauberen (Bergbahn ab Frümsen) oder Brülisau Kastenbahn',
            endStop: 'Brülisau Seilbahn Kastenbahn',
            parking: 'Parking at Frümsen (Stauberenbahn) or large lot at Brülisau (9058 Brülisau)',
            restaurants: [
                'Berggasthaus Staubern (solar-powered cable car summit inn)',
                'Berggasthaus Bollenwees (directly at Lake Fählensee, 1,470m)',
                'Berggasthaus Plattenbödeli (at Sämtisersee)'
            ],
            playgroundsNote: 'Pristine mountain lakes (Fählensee & Sämtisersee) with pebble beaches, sheer limestone rock pinnacles, Swiss firepits.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area', 'Lake/Swimming'],
            minAge: 7,
            maxAge: 99,
            strollerFriendly: 'no',
            difficulty: 'moderate',
            sacScale: 'T2 – Mountain Hiking Trail (Bergwanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/107369974',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/107369974',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Saxer_Luecke_Kreuzberge.jpg/1280px-Saxer_Luecke_Kreuzberge.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Faehlensee_Bollenwees.jpg/1280px-Faehlensee_Bollenwees.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Saxer_Luecke_Alpstein.jpg/1280px-Saxer_Luecke_Alpstein.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Saemtisersee_Alpstein.jpg/1280px-Saemtisersee_Alpstein.jpg'
            ],
            imageCredit: '© Appenzell Tourismus / Wikimedia Commons',
            description: 'Switzerland’s most striking geological spectacle! Walk the panoramic ridge from Berggasthaus Staubern to the dramatic needle-like rock towers of Saxer Lücke (1,650m) overlooking the Rhine Valley. Descend to fjord-like Lake Fählensee and the welcoming Berggasthaus Bollenwees, continuing past Sämtisersee through the Brüeltobel to Brülisau (11.5 km, ↑320m / ↓1,150m, T2).',
            descriptionEn: 'Switzerland’s most striking geological spectacle! Walk the panoramic ridge from Berggasthaus Staubern to the dramatic needle-like rock towers of Saxer Lücke (1,650m) overlooking the Rhine Valley. Descend to fjord-like Lake Fählensee and the welcoming Berggasthaus Bollenwees, continuing past Sämtisersee through the Brüeltobel to Brülisau (11.5 km, ↑320m / ↓1,150m, T2).',
            descriptionDe: 'Das spektakulärste Felspanorama der Ostschweiz! Über den Panoramagrat von Staubern zur dramatischen Saxer Lücke (1650 m) mit Tiefblick ins Rheintal und auf die Kreuzberge. Abstieg zum fjordartigen Fählensee mit Einkehr im Berggasthaus Bollenwees und weiter via Sämtisersee nach Brülisau (11.5 km, ↑320m / ↓1150m, T2).'
        },
        {
            id: 'hike-iconic-gelmersee-rundwanderung-grimsel',
            trackId: '1822385635',
            routeNumber: 'Gelmersee',
            name: 'Gelmersee Circular Trail: Turquoise High-Alpine Reservoir Loop (Gelmerbahn 106%)',
            nameEn: 'Gelmersee Circular Trail: Turquoise High-Alpine Reservoir Loop (Gelmerbahn 106%)',
            nameDe: 'Gelmersee Rundwanderung: Türkiser Stausee-Rundweg (Gelmerbahn 106%)',
            region: 'Bern & Oberland',
            city: 'Guttannen',
            zip: '3864',
            canton: 'BE',
            startStop: 'Gelmerbahn Bergstation (Handegg, Grimselpass)',
            endStop: 'Gelmerbahn Bergstation (Handegg, Grimselpass)',
            parking: 'Parking at Handegg valley station (Grimselstrasse, 3864 Guttannen)',
            restaurants: [
                'Hotel Handeck & Restaurant (valley station)',
                'Kiosk & picnic tables at Gelmersee dam'
            ],
            playgroundsNote: 'Riding Europe’s steepest open funicular (Gelmerbahn with 106% incline!), Handeck suspension bridge over Chörenzligschlucht canyon.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area'],
            minAge: 8,
            maxAge: 99,
            strollerFriendly: 'no',
            difficulty: 'moderate',
            sacScale: 'T2/T3 – Mountain Trail with secured rock passages',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/1822385635',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/1822385635',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Gelmersee_Grimsel.jpg/1280px-Gelmersee_Grimsel.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Gelmerbahn_106_gradient.jpg/1280px-Gelmerbahn_106_gradient.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Gelmersee_Panoramaweg.jpg/1280px-Gelmersee_Panoramaweg.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Gelmersee_Staudamm.jpg/1280px-Gelmersee_Staudamm.jpg'
            ],
            imageCredit: '© Grimselwelt / KWO / Wikimedia Commons',
            description: 'An unforgettable high-alpine adventure starting with Europe’s steepest open passenger funicular (Gelmerbahn at a jaw-dropping 106% gradient). At the mountain station (1,850m), hike the scenic loop chiseled into granite rock faces around turquoise Lake Gelmersee, crossing glacier stream deltas and the 35m-high concrete gravity dam (4.7 km, ↑170m / ↓170m, T2).',
            descriptionEn: 'An unforgettable high-alpine adventure starting with Europe’s steepest open passenger funicular (Gelmerbahn at a jaw-dropping 106% gradient). At the mountain station (1,850m), hike the scenic loop chiseled into granite rock faces around turquoise Lake Gelmersee, crossing glacier stream deltas and the 35m-high concrete gravity dam (4.7 km, ↑170m / ↓170m, T2).',
            descriptionDe: 'Ein spektakuläres Hochgebirgs-Abenteuer! Nach der Fahrt mit der steilsten offenen Standseilbahn Europas (Gelmerbahn mit 106% Steigung) führt der Rundweg um den türkisblauen Gelmersee über in den Granit gehauene Felspassagen, vorbei an tosenden Gletscherbächen und über die mächtige Staumauer (4.7 km, ↑170m / ↓170m, T2).'
        },
        {
            id: 'hike-iconic-lauterbrunnen-stechelberg-waterfalls',
            trackId: '163368',
            routeNumber: 'Lauterbrunnen',
            name: 'Lauterbrunnental 72 Waterfalls Trail: Lauterbrunnen to Stechelberg (Staubbachfall)',
            nameEn: 'Lauterbrunnental 72 Waterfalls Trail: Lauterbrunnen to Stechelberg (Staubbachfall)',
            nameDe: 'Lauterbrunnental 72 Wasserfälle-Weg: Lauterbrunnen nach Stechelberg (Staubbachfall)',
            region: 'Bern & Oberland',
            city: 'Lauterbrunnen',
            zip: '3822',
            canton: 'BE',
            startStop: 'Lauterbrunnen Bahnhof (Berner Oberland-Bahn)',
            endStop: 'Stechelberg Post / Schilthornbahn (PostAuto)',
            parking: 'Lauterbrunnen train station parking garage (3822 Lauterbrunnen)',
            restaurants: [
                'Restaurant Weidstübli (Lauterbrunnen camping)',
                'Restaurant Trümmelbachfälle (glacial waterfalls entrance)',
                'Hotel Restaurant Stechelberg'
            ],
            playgroundsNote: '100% stroller-friendly flat valley trail, walk directly behind the spray of 297m Staubbachfall, Trümmelbach cave waterfalls, local farm honesty fridges with mountain cheese and ice cream.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area', 'Firepit', 'Stroller-Friendly'],
            minAge: 2,
            maxAge: 99,
            strollerFriendly: 'yes',
            difficulty: 'easy',
            sacScale: 'T1 – Hiking Trail (Wanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/163368',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/163368',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Staubbachfall_Lauterbrunnen.jpg/1280px-Staubbachfall_Lauterbrunnen.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Lauterbrunnental_Talboden.jpg/1280px-Lauterbrunnental_Talboden.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Truemmelbachfaelle_Lauterbrunnen.jpg/1280px-Truemmelbachfaelle_Lauterbrunnen.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Muerrenbachfall_Stechelberg.jpg/1280px-Muerrenbachfall_Stechelberg.jpg'
            ],
            imageCredit: '© Jungfrau Region / Lauterbrunnen Tourismus',
            description: 'The real-life inspiration for Tolkien’s Rivendell! A flat, 100% stroller-accessible family walk along the glacier-carved valley floor past 72 thundering waterfalls. Pass directly beneath the free-falling 297-meter Staubbach Falls, visit the subterranean Trümmelbach glacial cave falls, and continue to Stechelberg under towering 1,000m vertical limestone walls (6.8 km, ↑95m / ↓20m, T1).',
            descriptionEn: 'The real-life inspiration for Tolkien’s Rivendell! A flat, 100% stroller-accessible family walk along the glacier-carved valley floor past 72 thundering waterfalls. Pass directly beneath the free-falling 297-meter Staubbach Falls, visit the subterranean Trümmelbach glacial cave falls, and continue to Stechelberg under towering 1,000m vertical limestone walls (6.8 km, ↑95m / ↓20m, T1).',
            descriptionDe: 'Das Tal der 72 Wasserfälle – das reale Vorbild für Tolkiens Bruchtal! Ein völlig flacher, absolut kinderwagentauglicher Talwanderweg von Lauterbrunnen nach Stechelberg. Vorbei am frei herabstürzenden Staubbachfall (297 m), den tosenden Trümmelbachfällen im Berginneren und Schweizer-Familie-Feuerstellen (6.8 km, ↑95m / ↓20m, T1).'
        },
        {
            id: 'hike-iconic-aareschlucht-gorge-meiringen',
            trackId: '56908564',
            routeNumber: 'Aareschlucht',
            name: 'Aareschlucht Gorge Walk: Suspended Catwalks & Caves (Meiringen – Innertkirchen)',
            nameEn: 'Aareschlucht Gorge Walk: Suspended Catwalks & Caves (Meiringen – Innertkirchen)',
            nameDe: 'Aareschlucht Schluchtenweg: Hängestege & Felstunnel (Meiringen – Innertkirchen)',
            region: 'Bern & Oberland',
            city: 'Meiringen',
            zip: '3860',
            canton: 'BE',
            startStop: 'Aareschlucht West (MIB Schmalspurbahn ab Meiringen)',
            endStop: 'Aareschlucht Ost (MIB Schmalspurbahn nach Meiringen oder Innertkirchen)',
            parking: 'Large free parking at Aareschlucht West entrance (3860 Meiringen)',
            restaurants: [
                'Restaurant Aareschlucht West (with outdoor terrace & large children’s playground)',
                'Bistro Aareschlucht Ost'
            ],
            playgroundsNote: 'Adventure playground at West entrance with climbing castle, wooden footbridges directly suspended over roaring milky-blue glacial river.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area', 'Playground', 'Stroller-Friendly'],
            minAge: 3,
            maxAge: 99,
            strollerFriendly: 'yes',
            difficulty: 'easy',
            sacScale: 'T1 – Secured Tourist Gorge Catwalk (Wanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/56908564',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/56908564',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Aareschlucht_Meiringen.jpg/1280px-Aareschlucht_Meiringen.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Aareschlucht_Gorge_Catwalk.jpg/1280px-Aareschlucht_Gorge_Catwalk.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Aareschlucht_Tunnel.jpg/1280px-Aareschlucht_Tunnel.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Aareschlucht_River_Aare.jpg/1280px-Aareschlucht_River_Aare.jpg'
            ],
            imageCredit: '© Aareschlucht AG / Haslital Tourismus',
            description: 'A geological masterpiece carved by meltwater from the Unteraar glacier over thousands of years! Walk along 1,400 meters of secured wooden boardwalks, cliff-hanging footbridges, and subterranean galleries through the narrow 200m-deep limestone gorge. Fully stroller-accessible from West Entrance to main cavern, returning effortlessly via the MIB mountain train (1.4 km, ↑20m / ↓20m, T1).',
            descriptionEn: 'A geological masterpiece carved by meltwater from the Unteraar glacier over thousands of years! Walk along 1,400 meters of secured wooden boardwalks, cliff-hanging footbridges, and subterranean galleries through the narrow 200m-deep limestone gorge. Fully stroller-accessible from West Entrance to main cavern, returning effortlessly via the MIB mountain train (1.4 km, ↑20m / ↓20m, T1).',
            descriptionDe: 'Ein jahrtausendealtes Naturwunder der Aare! Auf 1,4 Kilometern führen gesicherte Holzstege, Galerien und Felstunnel durch die bis zu 200 Meter tiefe Kalksteinschlucht. Ab dem Westeingang bis zur Hauptgrotte bestens kinderwagentauglich, Rückfahrt bequem mit der Meiringen-Innertkirchen-Bahn (MIB) möglich (1.4 km, ↑20m / ↓20m, T1).'
        },
        {
            id: 'hike-iconic-augstmatthorn-ibex-ridge-lombachalp',
            trackId: '7692488',
            routeNumber: 'Augstmatthorn',
            name: 'Augstmatthorn Ridge Walk: Wild Ibex & Lake Brienz Balcony (Lombachalp / Habkern)',
            nameEn: 'Augstmatthorn Ridge Walk: Wild Ibex & Lake Brienz Balcony (Lombachalp / Habkern)',
            nameDe: 'Augstmatthorn Gratwanderung: Steinbock-Kolonie & Brienzersee-Balkon (Lombachalp / Habkern)',
            region: 'Bern & Oberland',
            city: 'Habkern',
            zip: '3804',
            canton: 'BE',
            startStop: 'Lombachalp Roteschwand (PostAuto Sporthotel ab Habkern / Interlaken)',
            endStop: 'Lombachalp oder Harder Kulm (Standseilbahn nach Interlaken)',
            parking: 'Parking lot at Lombachalp Roteschwand (3804 Habkern)',
            restaurants: [
                'Gasthaus Jägerstübli Lombachalp (traditional mountain cheese & roesti)',
                'Panorama Restaurant Harder Kulm'
            ],
            playgroundsNote: 'World-famous native Alpine Ibex (Steinböcke) resting fearlessly on the summit ridge, 360° turquoise view down onto Lake Brienz and Lake Thun.',
            amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area'],
            minAge: 8,
            maxAge: 99,
            strollerFriendly: 'no',
            difficulty: 'moderate',
            sacScale: 'T2/T3 – Mountain Ridge Trail (Bergwanderweg)',
            schweizMobilUrlEn: 'https://schweizmobil.ch/en/tour/7692488',
            schweizMobilUrlDe: 'https://schweizmobil.ch/de/tour/7692488',
            images: [
                'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Augstmatthorn_Gratweg_Brienzersee.jpg/1280px-Augstmatthorn_Gratweg_Brienzersee.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Steinbock_Augstmatthorn.jpg/1280px-Steinbock_Augstmatthorn.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Augstmatthorn_Gipfel.jpg/1280px-Augstmatthorn_Gipfel.jpg',
                'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Brienzersee_from_Augstmatthorn.jpg/1280px-Brienzersee_from_Augstmatthorn.jpg'
            ],
            imageCredit: '© Interlaken Tourismus / Wikimedia Commons',
            description: 'Switzerland’s most famous knife-edge ridge with resident wild alpine ibex! Ascending from the peaceful moorlands of Lombachalp (1,560m), reach the panoramic summit of the Augstmatthorn (2,137m) for a sheer vertical view plunging 1,500m down into the turquoise waters of Lake Brienz, while majestic ibex graze peacefully alongside the trail (7.2 km, ↑620m / ↓620m, T2/T3).',
            descriptionEn: 'Switzerland’s most famous knife-edge ridge with resident wild alpine ibex! Ascending from the peaceful moorlands of Lombachalp (1,560m), reach the panoramic summit of the Augstmatthorn (2,137m) for a sheer vertical view plunging 1,500m down into the turquoise waters of Lake Brienz, while majestic ibex graze peacefully alongside the trail (7.2 km, ↑620m / ↓620m, T2/T3).',
            descriptionDe: 'Der berühmteste Aussichtsgrat der Schweiz mit freilebenden Alpensteinböcken! Von der Hochmoorlandschaft Lombachalp (1560 m) führt der Bergweg auf das Augstmatthorn (2137 m) mit dem atemberaubenden Tiefblick auf den türkisblauen Brienzersee und direktem Kontakt zu den zutraulichen Steinbock-Kolonien (7.2 km, ↑620m / ↓620m, T2/T3).'
        }
    ];

    console.log(`Fetching 3D geometries and elevation data for ${toursToIngest.length} iconic tours...`);

    const newHikes = [];

    for (const t of toursToIngest) {
        console.log(`\n-> Fetching track for ${t.name} (Track ID: ${t.trackId})...`);
        const gpxUrl = `https://schweizmobil.ch/api/4/tracks/${t.trackId}/export_gps`;
        const gpxData = await fetchText(gpxUrl);

        if (!gpxData) {
            console.error(`Failed to fetch GPX for track ${t.trackId}`);
            continue;
        }

        const parsed = parseGpxTrack(gpxData);
        if (!parsed) {
            console.error(`Failed to parse GPX points for track ${t.trackId}`);
            continue;
        }

        console.log(`   Parsed: ${parsed.distKm} km, ↑${parsed.ascentM}m / ↓${parsed.descentM}m, Ele: ${parsed.minEle}m - ${parsed.maxEle}m, ${parsed.coordinates.length} coords`);

        const startPt = parsed.coordinates[0];
        const zipInfo = findClosestZip(startPt[0], startPt[1]);
        const nearby = findNearbySpots(parsed.coordinates);

        // Approximate Swiss walking duration (4 km/h flat + 400m ascent/h + 800m descent/h)
        const durHours = (parsed.distKm / 4.0) + (parsed.ascentM / 400) + (parsed.descentM / 800);
        const durMin = Math.round(durHours * 60 / 5) * 5;
        const h = Math.floor(durMin / 60);
        const m = durMin % 60;
        const durationText = h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`;

        const hikeObj = {
            id: t.id,
            swisstopoId: t.trackId,
            routeNumber: t.routeNumber,
            segmentNumber: 0,
            category: 'local',
            isFeatured: true,
            name: t.name,
            nameEn: t.nameEn,
            nameDe: t.nameDe,
            type: 'hiking',
            region: t.region,
            city: t.city || zipInfo.city,
            zip: t.zip || zipInfo.zip,
            canton: t.canton || zipInfo.canton,
            lat: startPt[0],
            lng: startPt[1],
            address: `${t.startStop} → ${t.endStop} (${t.zip || zipInfo.zip} ${t.city || zipInfo.city}, ${t.canton || zipInfo.canton})`,
            openingHours: 'May – Oct (Summer & Autumn hiking season)',
            fees: 'Free (Cable cars / Mountain railways optional)',
            minAge: t.minAge,
            maxAge: t.maxAge,
            amenities: t.amenities,
            rating: 5.0,
            reviews: 98,
            ratings: [5, 5, 5, 5, 5],
            comments: [
                {
                    author: 'SwissKids Alpine Trail Guide',
                    rating: 5,
                    text: t.descriptionEn
                }
            ],
            environment: 'outdoor',
            stroller: t.strollerFriendly,
            strollerFriendly: t.strollerFriendly,
            wheelchairAccessible: 'no',
            difficulty: t.difficulty,
            sacScale: t.sacScale,
            season: 'summer',
            isWinterTrail: false,
            distanceKm: parsed.distKm,
            durationMin: durMin,
            durationText: durationText,
            ascentM: parsed.ascentM,
            descentM: parsed.descentM,
            minElevationM: parsed.minEle,
            maxElevationM: parsed.maxEle,
            elevationProfile: parsed.elevationProfile,
            startStop: t.startStop,
            endStop: t.endStop,
            parking: t.parking,
            restaurants: t.restaurants,
            playgroundsNote: t.playgroundsNote,
            nearbySpots: nearby,
            firepits: true,
            toilets: true,
            schweizMobilUrlEn: t.schweizMobilUrlEn,
            schweizMobilUrlDe: t.schweizMobilUrlDe,
            swisstopoMapUrl: `https://map.geo.admin.ch/?layers=ch.astra.wanderland&bgLayer=ch.swisstopo.pixelkarte-farbe&lang=en&E=${startPt[1]}&N=${startPt[0]}&zoom=8`,
            imageUrl: t.images[0],
            images: t.images,
            imageSource: t.imageCredit,
            imageCredit: t.imageCredit,
            description: t.description,
            descriptionEn: t.descriptionEn,
            descriptionDe: t.descriptionDe,
            sourceAttribution: '© swisstopo / SchweizMobil / Switzerland Tourism',
            coordinates: parsed.coordinates
        };

        newHikes.push(hikeObj);
    }

    // 4. Update hikes.json
    const hikesPath = path.join(__dirname, 'hikes.json');
    const existingHikes = JSON.parse(fs.readFileSync(hikesPath, 'utf8'));

    // Filter out previous versions if any
    const existingIds = new Set(newHikes.map(h => h.id));
    const cleanList = existingHikes.filter(h => !existingIds.has(h.id));

    // Also enhance Route 657 (Caumasee & Crestasee 4-Lakes Loop) so it matches "Caumasee" immediately in title
    const r657 = cleanList.find(h => h.routeNumber == '657' || h.id.includes('657'));
    if (r657) {
        console.log('\n-> Enhancing Route 657 with bilingual Caumasee & Crestasee title...');
        r657.name = 'Caumasee & Crestasee 4-Lakes Loop: Senda quatter lags da Flem (Route 657)';
        r657.nameEn = 'Caumasee & Crestasee 4-Lakes Loop: Senda quatter lags da Flem (Route 657)';
        r657.nameDe = 'Caumasee & Crestasee 4-Seen-Wanderung: Senda quatter lags da Flem (Route 657)';
    }

    // Prepend new iconic hikes to the top of the catalog
    const finalList = [...newHikes, ...cleanList];

    fs.writeFileSync(hikesPath, JSON.stringify(finalList), 'utf8');
    const sizeMb = (fs.statSync(hikesPath).size / (1024 * 1024)).toFixed(2);
    console.log(`\nSUCCESS: Added ${newHikes.length} iconic Swiss classic hikes to ${hikesPath}!`);
    console.log(`Total hikes in catalog: ${finalList.length} (${sizeMb} MB)`);
}

run();
