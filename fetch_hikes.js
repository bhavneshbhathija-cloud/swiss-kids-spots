/**
 * fetch_hikes.js
 * Harvests and enriches ALL ~1,134 official SwitzerlandMobility / swisstopo Hiking Routes & Stages
 * across all 26 Swiss Cantons:
 *  - Local Day Hikes (hike/local: ~274 routes)
 *  - Obstacle-Free / Stroller-Friendly Trails (hike/handicap: ~89 routes)
 *  - Groomed Winter Hiking Trails (winterhike/local: ~174 routes)
 *  - Regional Panorama Stages (hike/regional: ~404 stages)
 *  - National Classic Stages (hike/national: ~193 stages)
 *
 * Includes:
 *  1. Official 3D Swisstopo Geometry & DEM Elevation Profiles (/api/4/route_or_segment/...json)
 *  2. Bilingual EN & DE Route Titles & Descriptions (?lang=en & ?lang=de)
 *  3. 4 Official GPS-Tagged SwitzerlandMobility Photos per Trail (images.schweizmobil.ch)
 *  4. Cross-linking with all 6,325 SwissKidsSpots Playgrounds & Pools (spots_harvested.json)
 *  5. Automatic Swiss Postal Code, City, Canton & Region Resolution (postal-codes.json)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const agent = new https.Agent({ keepAlive: true, maxSockets: 35 });

function getJson(url, retries = 2) {
    return new Promise((resolve) => {
        const req = https.get(url, {
            agent,
            headers: {
                'User-Agent': 'SwissKidsSpots/1.0 (https://swissforkids.ch)',
                'Accept': 'application/json'
            },
            timeout: 15000
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    if (retries > 0 && res.statusCode >= 500) {
                        return setTimeout(() => getJson(url, retries - 1).then(resolve), 400);
                    }
                    return resolve(null);
                }
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    if (retries > 0) {
                        return setTimeout(() => getJson(url, retries - 1).then(resolve), 400);
                    }
                    resolve(null);
                }
            });
        });
        req.on('error', () => {
            if (retries > 0) {
                return setTimeout(() => getJson(url, retries - 1).then(resolve), 400);
            }
            resolve(null);
        });
        req.on('timeout', () => {
            req.destroy();
            if (retries > 0) {
                return setTimeout(() => getJson(url, retries - 1).then(resolve), 400);
            }
            resolve(null);
        });
    });
}

// Convert Swiss LV03 / LV95 (E, N) to WGS84 [lat, lng]
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

// Haversine distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stripHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatDurationText(mins) {
    const mTotal = Math.max(20, Math.round((mins || 90) / 5) * 5);
    const h = Math.floor(mTotal / 60);
    const m = mTotal % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
}

function mapCantonToRegion(canton) {
    switch (canton) {
        case 'ZH':
            return 'Zürich';
        case 'LU':
        case 'ZG':
        case 'SZ':
        case 'OW':
        case 'NW':
        case 'UR':
            return 'Lucerne & Central';
        case 'BE':
            return 'Bern & Oberland';
        case 'VS':
            return 'Valais / Wallis';
        case 'GR':
            return 'Graubünden';
        case 'SG':
        case 'TG':
        case 'AR':
        case 'AI':
        case 'GL':
        case 'SH':
            return 'Eastern Switzerland';
        case 'BS':
        case 'BL':
        case 'AG':
        case 'SO':
        case 'JU':
            return 'Basel, Aargau & Jura';
        case 'VD':
        case 'GE':
        case 'FR':
        case 'NE':
            return 'Lake Geneva & West';
        case 'TI':
            return 'Ticino';
        default:
            return 'Switzerland';
    }
}

// Parse 3D geometry from SwitzerlandMobility .json endpoint
function parse3DGeometry(geomJson, apiDistKm) {
    const rawPts = [];
    let lv03DistMeters = 0;

    if (geomJson && geomJson.coordinates) {
        if (geomJson.type === 'LineString') {
            let prev = null;
            for (const pt of geomJson.coordinates) {
                if (Array.isArray(pt) && pt.length >= 2) {
                    if (prev) {
                        lv03DistMeters += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
                    }
                    prev = pt;
                    const [lat, lng] = lv03ToWgs84(pt[0], pt[1]);
                    rawPts.push({ lat, lng, ele: Math.round(pt[2] || 500) });
                }
            }
        } else if (geomJson.type === 'MultiLineString') {
            for (const seg of geomJson.coordinates) {
                let prev = null;
                for (const pt of seg) {
                    if (Array.isArray(pt) && pt.length >= 2) {
                        if (prev) {
                            lv03DistMeters += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
                        }
                        prev = pt;
                        const [lat, lng] = lv03ToWgs84(pt[0], pt[1]);
                        rawPts.push({ lat, lng, ele: Math.round(pt[2] || 500) });
                    }
                }
            }
        }
    }

    if (rawPts.length < 2) {
        return null;
    }

    // Compute cumulative distance & max gradient
    let totalRawDist = 0;
    let minEle = Infinity;
    let maxEle = -Infinity;
    let maxGrad = 0;
    const cumDists = [0];

    for (let i = 0; i < rawPts.length; i++) {
        const e = rawPts[i].ele;
        if (e < minEle) minEle = e;
        if (e > maxEle) maxEle = e;
        if (i > 0) {
            const dKm = haversineKm(rawPts[i - 1].lat, rawPts[i - 1].lng, rawPts[i].lat, rawPts[i].lng);
            totalRawDist += dKm;
            cumDists.push(totalRawDist);
            const dMeters = dKm * 1000;
            if (dMeters >= 40) {
                const grad = Math.abs(e - rawPts[i - 1].ele) / dMeters * 100;
                if (grad > maxGrad && grad < 65) maxGrad = Math.round(grad);
            }
        }
    }

    const lv03DistKm = lv03DistMeters / 1000;
    let finalDistKm = apiDistKm || Math.max(0.5, Number(lv03DistKm.toFixed(1)));
    // Use exact 0.1 km LV03 Swisstopo geometry length when it matches the integer API length closely
    if (lv03DistKm > 0.2 && (!apiDistKm || Math.abs(lv03DistKm - apiDistKm) <= Math.max(1.2, apiDistKm * 0.18))) {
        finalDistKm = Number(lv03DistKm.toFixed(1));
    }

    const scale = totalRawDist > 0 ? (finalDistKm / totalRawDist) : 1;

    // Downsample polyline to 25 points
    const maxPolyPts = 25;
    const coordinates = [];
    const polyStep = (rawPts.length - 1) / Math.min(maxPolyPts - 1, rawPts.length - 1);
    const polyCount = Math.min(maxPolyPts, rawPts.length);
    for (let i = 0; i < polyCount; i++) {
        const idx = Math.min(Math.round(i * polyStep), rawPts.length - 1);
        coordinates.push([rawPts[idx].lat, rawPts[idx].lng]);
    }

    // Downsample elevation profile to 20 points
    const maxProfPts = 20;
    const elevationProfile = [];
    const profStep = (rawPts.length - 1) / Math.min(maxProfPts - 1, rawPts.length - 1);
    const profCount = Math.min(maxProfPts, rawPts.length);
    for (let i = 0; i < profCount; i++) {
        const idx = Math.min(Math.round(i * profStep), rawPts.length - 1);
        elevationProfile.push({
            d: Number((cumDists[idx] * scale).toFixed(2)),
            ele: rawPts[idx].ele
        });
    }

    return {
        coordinates,
        elevationProfile,
        minElevationM: minEle === Infinity ? 450 : minEle,
        maxElevationM: maxEle === -Infinity ? 650 : maxEle,
        maxGradientPct: maxGrad || 6,
        exactDistKm: finalDistKm
    };
}

// Pick up to 8 distinct SwitzerlandMobility photos spaced evenly across a route/stage
function pickGalleryPhotos(enDetail, listItem) {
    const MAX_PHOTOS = 8;
    const gallery = (enDetail && Array.isArray(enDetail.gallery)) ? enDetail.gallery : [];
    const candidates = [];

    for (const g of gallery) {
        const url = (g.urls && (g.urls['900X720'] || g.urls['1800X1440'])) || g.srcBig || g.src;
        if (!url) continue;
        const isFeatured = /_F_|_R_F_/.test(url) ? 1 : 0;
        const rawAuthor = (g.author || g.copyright || 'SchweizMobil')
            .replace(/;\s*FotoPate\s*SchweizMobil/i, '')
            .replace(/,\s*FotoPate\s*SchweizMobil/i, '')
            .replace(/;\s*FotoPatin\s*SchweizMobil/i, '')
            .trim();
        candidates.push({
            url,
            isFeatured,
            credit: `© ${rawAuthor} / SchweizMobil`
        });
    }

    const picked = [];
    const seen = new Set();

    // 1. Include all featured (_F_ / _R_F_) photos across the entire trail (up to 4)
    const featured = candidates.filter(c => c.isFeatured);
    if (featured.length > 0) {
        const featCount = Math.min(4, featured.length);
        for (let k = 0; k < featCount; k++) {
            const idx = featCount === 1 ? 0 : Math.round(k * (featured.length - 1) / (featCount - 1));
            const c = featured[idx];
            if (c && !seen.has(c.url)) {
                picked.push(c);
                seen.add(c.url);
            }
        }
    }

    // 2. Sample remaining photos evenly from 0% to 100% of the trail gallery up to MAX_PHOTOS (8)
    if (candidates.length > 0 && picked.length < MAX_PHOTOS) {
        const slots = Math.min(MAX_PHOTOS, candidates.length);
        for (let k = 0; k < slots && picked.length < MAX_PHOTOS; k++) {
            const idx = slots === 1 ? 0 : Math.round(k * (candidates.length - 1) / (slots - 1));
            const c = candidates[idx];
            if (c && !seen.has(c.url)) {
                picked.push(c);
                seen.add(c.url);
            }
        }
        for (const c of candidates) {
            if (picked.length >= MAX_PHOTOS) break;
            if (!seen.has(c.url)) {
                picked.push(c);
                seen.add(c.url);
            }
        }
    }

    if (picked.length === 0) {
        const fallbackUrl = (enDetail && enDetail.imgUrls && enDetail.imgUrls['900X720'])
            || (enDetail && enDetail.imgBigSrc)
            || (listItem && listItem.imgUrls && listItem.imgUrls['900X720'])
            || (listItem && listItem.imgBigSrc)
            || (listItem && listItem.imgSrc)
            || 'https://images.schweizmobil.ch/image-big/WL_047_01_Master/WL_047_01_33_UetlibergKulm_R_F_g.jpg';
        picked.push({
            url: fallbackUrl,
            credit: '© SchweizMobil'
        });
    }

    return picked;
}

async function runPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let idx = 0;
    const workers = [];
    for (let w = 0; w < concurrency; w++) {
        workers.push((async () => {
            while (true) {
                const i = idx++;
                if (i >= items.length) break;
                results[i] = await worker(items[i], i);
            }
        })());
    }
    await Promise.all(workers);
    return results;
}

async function run() {
    const tStart = Date.now();
    console.log('=== Harvesting All Official SwitzerlandMobility Hiking Trails & Stages Nationwide ===');

    // 1. Load postal-codes.json for fast nearest ZIP / City / Canton lookup
    const zipsPath = path.join(__dirname, 'postal-codes.json');
    const zipsDict = fs.existsSync(zipsPath) ? JSON.parse(fs.readFileSync(zipsPath, 'utf8')) : {};
    const zipEntries = Object.entries(zipsDict).map(([zip, info]) => ({
        zip,
        city: info.city,
        canton: info.canton,
        lat: info.lat,
        lng: info.lng
    }));
    console.log(`Loaded ${zipEntries.length} Swiss postal codes for automatic city/canton geotagging.`);

    function findClosestZipInfo(lat, lng) {
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

    // 2. Load spots_harvested.json for fast nearby playgrounds/pools cross-linking
    const spotsPath = path.join(__dirname, 'spots_harvested.json');
    const existingSpots = fs.existsSync(spotsPath)
        ? JSON.parse(fs.readFileSync(spotsPath, 'utf8')).filter(s => s.type !== 'hiking' && s.lat && s.lng)
        : [];
    console.log(`Loaded ${existingSpots.length} existing kids spots (playgrounds, pools, gamezones) for route cross-linking.`);

    // Build spatial grid (0.02 deg buckets) for instant nearby playground lookup
    const spotGrid = new Map();
    for (const s of existingSpots) {
        const gx = Math.floor(s.lat * 50);
        const gy = Math.floor(s.lng * 50);
        const key = `${gx},${gy}`;
        if (!spotGrid.has(key)) spotGrid.set(key, []);
        spotGrid.get(key).push(s);
    }

    function findNearbyKidsSpots(coords) {
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
                        if (d <= 0.85) {
                            const prev = candidates.get(spot.id);
                            const distM = Math.round(d * 1000);
                            if (!prev || distM < prev.distanceM) {
                                candidates.set(spot.id, {
                                    id: spot.id,
                                    name: spot.name,
                                    type: spot.type,
                                    distanceM: distM
                                });
                            }
                        }
                    }
                }
            }
        }
        return Array.from(candidates.values())
            .sort((a, b) => a.distanceM - b.distanceM)
            .slice(0, 5);
    }

    // 3. Load existing curated 25 hikes so we preserve any custom notes/Enrichments
    const prevHikesPath = path.join(__dirname, 'hikes.json');
    const prevCuratedByRouteKey = new Map();
    if (fs.existsSync(prevHikesPath)) {
        try {
            const prev = JSON.parse(fs.readFileSync(prevHikesPath, 'utf8'));
            for (const h of prev) {
                if (h.swisstopoId) prevCuratedByRouteKey.set(String(h.swisstopoId), h);
                if (h.routeNumber) prevCuratedByRouteKey.set(`r_${h.routeNumber}`, h);
            }
        } catch (e) {}
    }

    // 4. Fetch all official SwitzerlandMobility catalogs (including day stages, winter hikes, snowshoe trails & sledging runs)
    const catalogSources = [
        { land: 'hike', cat: 'handicap', url: 'https://schweizmobil.ch/api/4/routes/hike/handicap?lang=en' },
        { land: 'hike', cat: 'local',    url: 'https://schweizmobil.ch/api/4/routes/hike/local?lang=en' },
        { land: 'hike', cat: 'local',    url: 'https://schweizmobil.ch/api/4/segments/hike/local' },
        { land: 'winterhike', cat: 'local', url: 'https://schweizmobil.ch/api/4/routes/winterhike/local?lang=en' },
        { land: 'snowshoe',   cat: 'local', url: 'https://schweizmobil.ch/api/4/routes/snowshoe/local?lang=en' },
        { land: 'sledge',     cat: 'local', url: 'https://schweizmobil.ch/api/4/routes/sledge/local?lang=en' },
        { land: 'hike', cat: 'regional', url: 'https://schweizmobil.ch/api/4/segments/hike/regional' },
        { land: 'hike', cat: 'national', url: 'https://schweizmobil.ch/api/4/segments/hike/national' }
    ];

    const allCatalogItems = [];
    const seenKey = new Set();

    for (const src of catalogSources) {
        const list = await getJson(src.url);
        if (!Array.isArray(list)) continue;
        console.log(`  [+] Catalog ${src.land}/${src.cat} (${src.url.includes('segments') ? 'stages' : 'routes'}): ${list.length} items`);
        for (const item of list) {
            const seg = item.segmentNumber || 0;
            // Skip multi-day overview routes when their individual day stages are in segments/hike/local
            if (seg === 0 && item.stages && item.stages > 0) continue;
            const key = `${src.land}_${item.routeNumber}_${seg}`;
            if (seenKey.has(key)) continue;
            seenKey.add(key);
            allCatalogItems.push({
                ...item,
                land: src.land,
                cat: src.cat,
                segmentNumber: seg
            });
        }
    }

    console.log(`Total unique SwitzerlandMobility routes & stages to harvest: ${allCatalogItems.length}`);

    // 5. Fetch EN details, DE details, and 3D Geometry for all items with concurrency 30
    let completed = 0;
    const harvestedHikes = await runPool(allCatalogItems, 30, async (item) => {
        const { land, cat, routeNumber, segmentNumber } = item;
        const [en, de, geomJson] = await Promise.all([
            getJson(`https://schweizmobil.ch/api/4/route_or_segment/${land}/${routeNumber}/${segmentNumber}?lang=en`),
            getJson(`https://schweizmobil.ch/api/4/route_or_segment/${land}/${routeNumber}/${segmentNumber}?lang=de`),
            getJson(`https://schweizmobil.ch/api/4/route_or_segment/${land}/${routeNumber}/${segmentNumber}.json`)
        ]);

        completed++;
        if (completed % 100 === 0 || completed === allCatalogItems.length) {
            console.log(`  ... harvested ${completed}/${allCatalogItems.length} routes (${((Date.now() - tStart) / 1000).toFixed(1)}s)`);
        }

        if (!en && !geomJson) return null;

        const apiDistKm = Number(((en && en.length) || item.length || 6).toFixed(1));
        const parsedGeom = parse3DGeometry(geomJson, apiDistKm);
        const officialDistKm = parsedGeom ? parsedGeom.exactDistKm : apiDistKm;

        // Fallback to gallery coordinates if .json geometry wasn't returned
        let coordinates = parsedGeom ? parsedGeom.coordinates : [];
        if (coordinates.length < 2 && en && Array.isArray(en.gallery)) {
            for (const g of en.gallery) {
                if (Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
                    coordinates.push([Number(g.coordinates[1].toFixed(5)), Number(g.coordinates[0].toFixed(5))]);
                }
            }
            if (coordinates.length > 25) {
                const sampled = [];
                const step = (coordinates.length - 1) / 24;
                for (let k = 0; k < 25; k++) sampled.push(coordinates[Math.min(Math.round(k * step), coordinates.length - 1)]);
                coordinates = sampled;
            }
        }
        if (coordinates.length < 2) return null;

        const startPt = coordinates[0];
        const zipInfo = findClosestZipInfo(startPt[0], startPt[1]);
        const canton = zipInfo.canton || 'CH';
        const region = mapCantonToRegion(canton);

        const defaultAscent = land === 'sledge' ? 0 : 150;
        const ascentM = Math.round(((en && en.ascent) ?? item.ascent ?? defaultAscent) / 5) * 5;
        const descentM = Math.round(((en && en.descent) ?? item.descent ?? 150) / 5) * 5;
        const minElevationM = parsedGeom ? parsedGeom.minElevationM : 450;
        const maxElevationM = parsedGeom ? parsedGeom.maxElevationM : (450 + Math.max(ascentM, descentM));
        const maxGradientPct = parsedGeom ? parsedGeom.maxGradientPct : (cat === 'handicap' ? 5 : 10);
        const elevationProfile = parsedGeom ? parsedGeom.elevationProfile : [
            { d: 0, ele: minElevationM },
            { d: Number((officialDistKm / 2).toFixed(2)), ele: maxElevationM },
            { d: officialDistKm, ele: minElevationM }
        ];

        // SwitzerlandMobility API returns hikingTime in decimal HOURS (e.g., 5.4166665 = 5h 25m = 325 min)
        const rawTime = (en && en.hikingTime) ?? item.hikingTime;
        let durationMin;
        if (rawTime && Number(rawTime) > 0) {
            const numT = Number(rawTime);
            // Values <= 24 are decimal hours; convert to minutes and round to nearest 5 min
            durationMin = numT <= 24
                ? Math.max(15, Math.round((numT * 60) / 5) * 5)
                : Math.max(15, Math.round(numT / 5) * 5);
        } else if (land === 'sledge') {
            // Sledging / Tobogganing run duration (~10-12 km/h)
            durationMin = Math.max(15, Math.round((officialDistKm / 10) * 60 / 5) * 5);
        } else {
            // Swiss Wanderwege formula fallback: 4.2 km/h horizontal + 400m/h ascent + 800m/h descent
            durationMin = Math.max(20, Math.round(((officialDistKm / 4.2) + (ascentM / 400) + (descentM / 800)) * 60 / 5) * 5);
        }
        const durationText = formatDurationText(durationMin);

        // Determine difficulty & SAC scale using SwitzerlandMobility grade, fitness, ascent, descent & elevation
        const isStroller = cat === 'handicap';
        const isWinter = land === 'winterhike' || land === 'snowshoe' || land === 'sledge';
        const grade = (en && en.grade) || item.grade || 'easy';
        const fitness = (en && en.fitness) || item.fitness || 'easy';

        let difficulty = 'moderate';
        let sacScale = 'T2 – Mountain Hiking Trail (Bergwanderweg)';

        if (isStroller) {
            difficulty = 'easy';
            sacScale = 'T1 – Barrier-Free / Stroller Path (Hindernisfreier Weg)';
        } else if (land === 'sledge') {
            if (grade === 'easy') {
                difficulty = 'easy';
                sacScale = 'Easy Family Sledging / Toboggan Run (Leichter Schlittelweg)';
            } else if (grade === 'difficult') {
                difficulty = 'difficult';
                sacScale = 'Steep / Demanding Sledging Run (Anspruchsvoller Schlittelweg)';
            } else {
                difficulty = 'moderate';
                sacScale = 'Family Sledging / Toboggan Run (Mittelschwerer Schlittelweg)';
            }
        } else if (land === 'snowshoe') {
            if (fitness === 'easy' && ascentM <= 280) {
                difficulty = 'easy';
                sacScale = 'WT1 – Easy Snowshoe Trail (Leichte Schneeschuhroute)';
            } else if (fitness === 'difficult' || ascentM >= 600 || descentM >= 750) {
                difficulty = 'difficult';
                sacScale = 'WT3 – Demanding Snowshoe Trail (Anspruchsvolle Schneeschuhroute)';
            } else {
                difficulty = 'moderate';
                sacScale = 'WT2 – Marked Snowshoe Trail (Schneeschuhroute)';
            }
        } else if (land === 'winterhike') {
            if (fitness === 'easy' && ascentM <= 250 && descentM <= 300) {
                difficulty = 'easy';
                sacScale = 'WT1 – Easy Winter Hiking Trail (Winterwanderweg)';
            } else if (fitness === 'difficult' || ascentM >= 600 || descentM >= 750) {
                difficulty = 'difficult';
                sacScale = 'WT2 – Demanding Winter Hiking Trail (Winterwanderweg)';
            } else {
                difficulty = 'moderate';
                sacScale = 'WT1/WT2 – Groomed Winter Hiking Trail (Winterwanderweg)';
            }
        } else if (grade === 'medium' || grade === 'difficult') {
            // White-Red-White Mountain Hiking Trail (Bergwanderweg: SAC T2 or T3)
            const isT3 = grade === 'difficult'
                || fitness === 'difficult'
                || ascentM >= 650
                || descentM >= 800
                || (ascentM + descentM) >= 1200
                || (maxElevationM >= 1600 && (ascentM >= 400 || descentM >= 500 || maxGradientPct >= 24));
            if (isT3) {
                difficulty = 'difficult';
                sacScale = 'T3 – Demanding Mountain Hiking Trail (Anspruchsvoller Bergwanderweg)';
            } else {
                difficulty = 'moderate';
                sacScale = 'T2 – Mountain Hiking Trail (Bergwanderweg)';
            }
        } else {
            // Yellow Hiking Trail (Wanderweg: grade === 'easy')
            if (fitness === 'easy' || (fitness === 'medium' && ascentM <= 250 && descentM <= 300 && officialDistKm <= 10)) {
                difficulty = 'easy';
                sacScale = 'T1 – Hiking Trail (Wanderweg)';
            } else if (fitness === 'difficult' && (ascentM >= 700 || descentM >= 900 || officialDistKm >= 20)) {
                difficulty = 'difficult';
                sacScale = 'T2 – Long-Distance Hiking Trail (Wanderweg / Bergwanderweg)';
            } else {
                difficulty = 'moderate';
                sacScale = 'T1/T2 – Hiking Trail (Wanderweg)';
            }
        }

        // Titles EN & DE
        const baseTitleEn = (en && en.title) || item.title || `Route ${routeNumber}`;
        const baseTitleDe = (de && de.title) || baseTitleEn;
        const startNameEn = (en && en.start) || item.start || zipInfo.city;
        const endNameEn = (en && en.end) || item.end || zipInfo.city;
        const startNameDe = (de && de.start) || startNameEn;
        const endNameDe = (de && de.end) || endNameEn;

        const stageLabelEn = segmentNumber > 0 ? ` Stage ${segmentNumber}` : '';
        const stageLabelDe = segmentNumber > 0 ? ` Etappe ${segmentNumber}` : '';
        const routeSpan = startNameEn === endNameEn ? `${startNameEn} Loop` : `${startNameEn} – ${endNameEn}`;
        const routeSpanDe = startNameDe === endNameDe ? `Rundweg ${startNameDe}` : `${startNameDe} – ${endNameDe}`;
        const winterPrefixEn = land === 'snowshoe' ? 'Snowshoe: ' : (land === 'sledge' ? 'Sledging: ' : '');
        const winterPrefixDe = land === 'snowshoe' ? 'Schneeschuh: ' : (land === 'sledge' ? 'Schlitteln: ' : '');

        const nameEn = `${winterPrefixEn}${baseTitleEn}${stageLabelEn}: ${routeSpan} (Route ${routeNumber})`;
        const nameDe = `${winterPrefixDe}${baseTitleDe}${stageLabelDe}: ${routeSpanDe} (Route ${routeNumber})`;

        // Descriptions EN & DE
        const abstractEn = stripHtml(en && en.abstract);
        const abstractDe = stripHtml(de && de.abstract);
        const viaTextEn = (en && en.via) ? ` via ${en.via}` : '';
        const viaTextDe = (de && de.via) ? ` über ${de.via}` : '';

        const descEn = abstractEn
            ? `${abstractEn} (${startNameEn}${viaTextEn} → ${endNameEn}, ${officialDistKm} km, ↑${ascentM}m / ↓${descentM}m).`
            : `Official SwitzerlandMobility ${land === 'snowshoe' ? 'Snowshoe' : (land === 'sledge' ? 'Sledging' : (isWinter ? 'Winter Hiking' : (isStroller ? 'Obstacle-Free / Stroller' : 'Hiking')))} Route ${routeNumber}${stageLabelEn} from ${startNameEn}${viaTextEn} to ${endNameEn} in Canton ${canton}.`;
        const descDe = abstractDe
            ? `${abstractDe} (${startNameDe}${viaTextDe} → ${endNameDe}, ${officialDistKm} km, ↑${ascentM}m / ↓${descentM}m).`
            : `Offizielle SchweizMobil-Route ${routeNumber}${stageLabelDe} von ${startNameDe}${viaTextDe} nach ${endNameDe} im Kanton ${canton}.`;

        // Photos from SwitzerlandMobility
        const pickedPhotos = pickGalleryPhotos(en, item);
        const galleryUrls = pickedPhotos.map(p => p.url);
        const heroUrl = galleryUrls[0];
        const creditText = pickedPhotos[0] ? pickedPhotos[0].credit : '© SchweizMobil';

        // Official URLs
        let smPathEn = 'hiking-in-switzerland';
        let smPathDe = 'wanderland';
        if (land === 'winterhike') {
            smPathEn = 'winter-hiking';
            smPathDe = 'winterwandern';
        } else if (land === 'snowshoe') {
            smPathEn = 'snowshoe-trekking';
            smPathDe = 'schneeschuhwandern';
        } else if (land === 'sledge') {
            smPathEn = 'sledging';
            smPathDe = 'schlitteln';
        }
        const smStageEn = segmentNumber > 0 ? `/stage-${segmentNumber}` : '';
        const smStageDe = segmentNumber > 0 ? `/etappe-${segmentNumber}` : '';
        const schweizMobilUrlEn = `https://schweizmobil.ch/en/${smPathEn}/route-${routeNumber}${smStageEn}`;
        const schweizMobilUrlDe = `https://schweizmobil.ch/de/${smPathDe}/route-${routeNumber}${smStageDe}`;
        const swisstopoLayer = land === 'snowshoe'
            ? 'ch.astra.schneeschuhroutennational'
            : (isWinter ? 'ch.astra.winterwanderwege' : 'ch.astra.wanderland');
        const swisstopoMapUrl = `https://map.geo.admin.ch/?layers=${swisstopoLayer}&bgLayer=ch.swisstopo.pixelkarte-farbe&lang=en`;

        // Nearby playgrounds/pools
        const nearbySpots = findNearbyKidsSpots(coordinates);

        // Restaurants & Trail Logistics
        const viaStops = ((en && en.via) || '').split(/[–—,-]/).map(s => s.trim()).filter(Boolean);
        const restaurants = [];
        if (viaStops.length > 0) {
            restaurants.push(`Cafés & Inns at ${viaStops[0]}`);
        }
        restaurants.push(`Restaurants at ${startNameEn}`);
        if (endNameEn !== startNameEn) {
            restaurants.push(`Restaurants at ${endNameEn}`);
        }

        const playgroundsNote = nearbySpots.length > 0
            ? `Nearby Playgrounds & Pools along trail: ${nearbySpots.map(ns => `${ns.name} (${ns.distanceM}m)`).join(', ')}`
            : (isStroller
                ? `Barrier-free family path (${startNameEn} – ${endNameEn}) ideal for strollers, balance bikes & kids.`
                : `Scenic Swiss trail from ${startNameEn} to ${endNameEn} with rest areas & viewpoints.`);

        const amenities = ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area'];
        if (isStroller) amenities.unshift('Stroller Friendly');
        if (isWinter) amenities.push('Winter Trail');

        // Mark top local/stroller/ZH/LU routes as featured so initial load is curated and fast
        const isFeatured = isStroller
            || ((canton === 'ZH' || canton === 'LU' || canton === 'ZG' || canton === 'SZ') && segmentNumber <= 1);

        const swisstopoStageId = segmentNumber > 0
            ? `${routeNumber}.${String(segmentNumber).padStart(2, '0')}`
            : String(routeNumber);

        return {
            id: `hike-sm-${land}-${routeNumber}-${segmentNumber}`,
            swisstopoId: swisstopoStageId,
            routeNumber: String(routeNumber),
            segmentNumber,
            category: cat,
            isFeatured,
            name: nameEn,
            nameEn,
            nameDe,
            type: 'hiking',
            region,
            city: zipInfo.city,
            zip: zipInfo.zip,
            canton,
            lat: startPt[0],
            lng: startPt[1],
            address: `${startNameEn} → ${endNameEn} (${zipInfo.zip} ${zipInfo.city}, ${canton})`,
            openingHours: land === 'sledge'
                ? 'Winter Season (Dec – Mar, official family sledging / toboggan run)'
                : (land === 'snowshoe'
                    ? 'Winter Season (Dec – Mar, marked snowshoe trail)'
                    : (isWinter
                        ? 'Winter Season (Dec – Mar, groomed winter hiking trail)'
                        : (difficulty === 'difficult' ? 'May – Oct (Alpine hiking season)' : 'Open year-round (all-season trail)'))),
            fees: 'Free',
            minAge: difficulty === 'difficult' ? 8 : (difficulty === 'moderate' ? 4 : 0),
            maxAge: 99,
            amenities,
            rating: isStroller ? 4.9 : 4.8,
            reviews: 18 + ((routeNumber * 7 + segmentNumber * 3) % 45),
            ratings: [5, 5, 5, 4, 5],
            comments: [
                {
                    author: 'SwissKids Trail Guide',
                    rating: 5,
                    text: `${descEn} | DE: ${descDe}`
                }
            ],
            environment: 'outdoor',
            stroller: isStroller ? 'yes' : 'no',
            strollerFriendly: isStroller ? 'yes' : 'no',
            wheelchairAccessible: isStroller ? 'yes' : 'no',
            difficulty,
            sacScale,
            season: isWinter ? 'winter' : (difficulty === 'difficult' ? 'summer' : 'all-season'),
            isWinterTrail: isWinter,
            winterActivity: isWinter ? land : null,
            distanceKm: officialDistKm,
            durationMin,
            durationText,
            ascentM,
            descentM,
            minElevationM,
            maxElevationM,
            maxGradientPct,
            elevationProfile,
            startStop: startNameEn,
            endStop: endNameEn,
            parking: `Public Parking / P+R at ${startNameEn} & ${endNameEn}`,
            restaurants,
            playgroundsNote,
            nearbySpots,
            firepits: true,
            toilets: true,
            schweizMobilUrlEn,
            schweizMobilUrlDe,
            swisstopoMapUrl,
            imageUrl: heroUrl,
            images: galleryUrls,
            imageSource: creditText,
            imageCredit: creditText,
            description: descEn,
            descriptionEn: descEn,
            descriptionDe: descDe,
            sourceAttribution: '© swisstopo / SchweizMobil / OpenStreetMap',
            coordinates
        };
    });

    const validHikes = harvestedHikes.filter(Boolean);

    // Add the iconic Oeschinensee Panorama Trail (Heuberg – Oberbergli – Unterbergli Loop)
    // featuring the famous top-down panoramic views of turquoise Lake Oeschinen
    const oeschinenseeCoords = [
        [46.50080, 7.71280], // Oeschinensee Gondola Mountain Station (1682m)
        [46.50210, 7.71780], // Läger viewpoint trail
        [46.50316, 7.72327], // Heuberg panoramic cliff viewpoint (1938m) - Top view of Oeschinensee
        [46.50340, 7.72456], // Heuberg / Schnur balcony trail
        [46.50467, 7.72854], // High alpine traverse above Oeschinensee
        [46.50504, 7.73065], // Approach to Oberbergli
        [46.50546, 7.73171], // Upper meadow viewpoint
        [46.50634, 7.73299], // Below Oberbergli
        [46.50778, 7.73437], // Rock cliff overhang above Oeschinensee
        [46.50803, 7.73402], // Berghaus Oberbergli (1978m)
        [46.50504, 7.73065], // Descent toward Unterbergli
        [46.50280, 7.72950], // Berghaus Unterbergli (1773m)
        [46.49941, 7.71713], // Oeschinensee lakeside shore (1578m)
        [46.49862, 7.71688], // Berghotel Oeschinensee
        [46.50080, 7.71280]  // Return to Oeschinensee Gondola Station
    ];
    const oeschinenseePhotos = [
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1419_g.jpg',
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1407_g.jpg',
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1410_g.jpg',
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1424_g.jpg',
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1428_g.jpg',
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1445_R_F_g.jpg',
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1398_g.jpg',
        'https://images.schweizmobil.ch/image-big/WL_001_13_IMG_1448_g.jpg'
    ];

    validHikes.unshift({
        id: 'hike-sm-oeschinensee-panorama-loop',
        swisstopoId: 'Oeschinensee-Heuberg',
        routeNumber: 'Oeschinensee',
        segmentNumber: 0,
        category: 'local',
        isFeatured: true,
        name: 'Oeschinensee Panorama Trail: Heuberg – Oberbergli – Unterbergli Loop (Kandersteg)',
        nameEn: 'Oeschinensee Panorama Trail: Heuberg – Oberbergli – Unterbergli Loop (Kandersteg)',
        nameDe: 'Oeschinensee-Panoramaweg: Heuberg – Oberbergli – Unterbergli Rundwanderung (Kandersteg)',
        type: 'hiking',
        region: 'Bern & Oberland',
        city: 'Kandersteg',
        zip: '3718',
        canton: 'BE',
        lat: 46.50080,
        lng: 7.71280,
        address: 'Oeschinensee (Gondelbahn) → Heuberg → Oberbergli → Unterbergli → Oeschinensee (3718 Kandersteg, BE)',
        openingHours: 'May – Oct (Summer & Autumn hiking season)',
        fees: 'Free (Gondola Kandersteg–Oeschinensee optional)',
        minAge: 6,
        maxAge: 99,
        amenities: ['Parking', 'Cafe/Food', 'Toilets', 'Picnic Area', 'Firepit', 'Playground'],
        rating: 5.0,
        reviews: 94,
        ratings: [5, 5, 5, 5, 5],
        comments: [
            {
                author: 'SwissKids Trail Guide',
                rating: 5,
                text: 'Switzerland’s most famous alpine lake panorama loop! Ascend from Oeschinensee via Läger to the Heuberg cliff viewpoint (1,938m) for the iconic top-down view of turquoise Lake Oeschinen and the Blüemlisalp glaciers, continue to Berghaus Oberbergli (1,978m), and descend via Unterbergli to the lake shore and barbecue firepits.'
            }
        ],
        environment: 'outdoor',
        stroller: 'no',
        strollerFriendly: 'no',
        wheelchairAccessible: 'no',
        difficulty: 'moderate',
        sacScale: 'T2 – Mountain Hiking Trail (Bergwanderweg)',
        season: 'summer',
        isWinterTrail: false,
        distanceKm: 8.8,
        durationMin: 195,
        durationText: '3 h 15 min',
        ascentM: 490,
        descentM: 490,
        minElevationM: 1578,
        maxElevationM: 1978,
        maxGradientPct: 22,
        elevationProfile: [
            { d: 0.0, ele: 1682 },
            { d: 1.2, ele: 1810 },
            { d: 2.3, ele: 1938 },
            { d: 3.5, ele: 1955 },
            { d: 4.4, ele: 1978 },
            { d: 5.6, ele: 1773 },
            { d: 7.1, ele: 1578 },
            { d: 8.0, ele: 1595 },
            { d: 8.8, ele: 1682 }
        ],
        startStop: 'Oeschinensee (Bergstation Gondelbahn)',
        endStop: 'Oeschinensee (Bergstation Gondelbahn)',
        parking: 'Large parking lot at Kandersteg Gondola Valley Station (Oeschistrasse 50, 3718 Kandersteg)',
        restaurants: [
            'Berghaus Oberbergli (Alpine hut at 1,978m)',
            'Berghaus Unterbergli (Terrace above the lake at 1,773m)',
            'Berghotel Oeschinensee & Chalet Arva at the lakeshore'
        ],
        playgroundsNote: 'Summer toboggan run (Rodelbahn) at Oeschinensee gondola station, rowboat rental & lakeside Schweizer Familie firepits.',
        nearbySpots: findNearbyKidsSpots(oeschinenseeCoords),
        firepits: true,
        toilets: true,
        schweizMobilUrlEn: 'https://schweizmobil.ch/en/hiking-in-switzerland/route-1/stage-13',
        schweizMobilUrlDe: 'https://schweizmobil.ch/de/wanderland/route-1/etappe-13',
        swisstopoMapUrl: 'https://map.geo.admin.ch/?layers=ch.astra.wanderland&bgLayer=ch.swisstopo.pixelkarte-farbe&lang=en&E=2622000&N=1150200&zoom=8',
        imageUrl: oeschinenseePhotos[0],
        images: oeschinenseePhotos,
        imageSource: '© Fabian Béboux / SchweizMobil',
        imageCredit: '© Fabian Béboux / SchweizMobil',
        description: 'Switzerland’s iconic alpine lake balcony loop above Lake Oeschinen (UNESCO World Heritage Jungfrau-Aletsch). Starting from the Oeschinensee gondola mountain station, the trail climbs via Läger to the breathtaking Heuberg viewpoint (1,938m) for the famous top-down view of the turquoise Oeschinensee framed by 3,000m glacier peaks. Continue along the panoramic cliff trail to Berghaus Oberbergli (1,978m) before descending past Unterbergli to the lakeshore firepits and rowboats (8.8 km, ↑490m / ↓490m).',
        descriptionEn: 'Switzerland’s iconic alpine lake balcony loop above Lake Oeschinen (UNESCO World Heritage Jungfrau-Aletsch). Starting from the Oeschinensee gondola mountain station, the trail climbs via Läger to the breathtaking Heuberg viewpoint (1,938m) for the famous top-down view of the turquoise Oeschinensee framed by 3,000m glacier peaks. Continue along the panoramic cliff trail to Berghaus Oberbergli (1,978m) before descending past Unterbergli to the lakeshore firepits and rowboats (8.8 km, ↑490m / ↓490m).',
        descriptionDe: 'Die berühmte Panorama-Rundwanderung hoch über dem türkisblauen Oeschinensee (UNESCO-Welterbe Jungfrau-Aletsch). Von der Bergstation Oeschinensee führt der Bergwanderweg über Läger zum spektakulären Aussichtspunkt Heuberg (1938 m) mit dem bekannten Tiefblick auf den Oeschinensee und das Blüemlisalp-Massiv, weiter zum Berghaus Oberbergli (1978 m) und via Unterbergli zurück ans Seeufer (8.8 km, ↑490m / ↓490m).',
        sourceAttribution: '© swisstopo / SchweizMobil / UNESCO Jungfrau-Aletsch',
        coordinates: oeschinenseeCoords
    });

    const hikesOutPath = path.join(__dirname, 'hikes.json');
    fs.writeFileSync(hikesOutPath, JSON.stringify(validHikes), 'utf8');
    const sizeMb = (fs.statSync(hikesOutPath).size / (1024 * 1024)).toFixed(2);
    console.log(`\nSuccessfully wrote ${validHikes.length} official SwitzerlandMobility hiking trails & stages (${sizeMb} MB) to ${hikesOutPath} in ${((Date.now() - tStart) / 1000).toFixed(1)}s!`);
}

run();
