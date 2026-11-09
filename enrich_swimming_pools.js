/**
 * enrich_swimming_pools.js
 *
 * Updates all swimming pools in base_spots.json and spots_harvested.json:
 * 1. Strips all unverified default information:
 *    - Removes fake "08:00 - 20:00 daily" / "24/7" opening hours
 *    - Removes fake hardcoded ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking"] amenities
 *    - Removes fake "with dedicated splashing zones and water slides" boilerplate description
 * 2. Queries Google Places API (New) for each swimming pool to populate validated data:
 *    - Official facility name (replaces generic "Swimming Pool in ..." when matched)
 *    - Verified Google Maps Opening Hours (regularOpeningHours.weekdayDescriptions)
 *    - Verified Amenities (restroom -> Toilets, wheelchairAccessibleEntrance -> Stroller Friendly, parkingOptions -> Parking, Indoor/Outdoor classification)
 *    - Official Website (websiteUri) & Phone (nationalPhoneNumber)
 *    - Verified Google Editorial Summary or honest factual description
 *    - Real Google Maps visitor photos (lh3.googleusercontent.com) with photographer attribution
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

function loadEnvKey(keyName) {
    if (process.env[keyName]) return process.env[keyName].replace(/[^\x21-\x7E]/g, '');
    const envPaths = [path.join(__dirname, '.env'), path.join(os.homedir(), '.env')];
    for (const p of envPaths) {
        if (fs.existsSync(p)) {
            const rawBuf = fs.readFileSync(p);
            const cleanText = rawBuf.toString('utf-8').replace(/\0/g, '').replace(/^\uFEFF/, '');
            for (const line of cleanText.split(/\r?\n/)) {
                const match = line.match(new RegExp(`^\\s*${keyName}\\s*=\\s*(.+)\\s*$`));
                if (match) {
                    const val = match[1].replace(/^["']|["']$/g, '').replace(/[^\x21-\x7E]/g, '');
                    if (val) return val;
                }
            }
        }
    }
    return null;
}

const API_KEY = loadEnvKey('GOOGLE_PLACES_API_KEY');
if (!API_KEY) {
    console.error('ERROR: Missing GOOGLE_PLACES_API_KEY');
    process.exit(1);
}

const BASE_PATH = path.join(__dirname, 'base_spots.json');
const HARVESTED_PATH = path.join(__dirname, 'spots_harvested.json');

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function httpsRequest(url, options = {}, postData = null) {
    return new Promise((resolve) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', () => resolve({ statusCode: 0, headers: {}, body: '' }));
        req.setTimeout(15000, () => {
            req.destroy();
            resolve({ statusCode: 0, headers: {}, body: '' });
        });
        if (postData) req.write(postData);
        req.end();
    });
}

async function resolveRedirectUrl(photoEndpointUrl) {
    const res = await httpsRequest(photoEndpointUrl, { method: 'GET' });
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return res.headers.location;
    }
    return null;
}

function formatGoogleOpeningHours(weekdayDescriptions) {
    if (!Array.isArray(weekdayDescriptions) || weekdayDescriptions.length === 0) return null;
    const shortDays = {
        'Monday': 'Mo',
        'Tuesday': 'Tu',
        'Wednesday': 'We',
        'Thursday': 'Th',
        'Friday': 'Fr',
        'Saturday': 'Sa',
        'Sunday': 'Su'
    };
    const cleaned = weekdayDescriptions.map(line => {
        let s = line.replace(/[\u202f\u2009\u00a0]/g, ' ').trim();
        for (const [full, short] of Object.entries(shortDays)) {
            if (s.startsWith(full + ':')) {
                s = short + ':' + s.slice(full.length + 1);
            }
        }
        return s;
    });
    return cleaned.join(' | ');
}

function buildFactualPoolDescription(spot, googleEditorial) {
    if (googleEditorial && googleEditorial.length > 15) {
        return googleEditorial;
    }
    // Keep hand-curated detailed descriptions if not the generic unverified boilerplate
    if (spot.description &&
        !spot.description.includes("dedicated splashing zones and water slides for kids' fun") &&
        spot.description.length > 30) {
        return spot.description;
    }

    const n = (spot.name || '').toLowerCase();
    const city = spot.city || 'Switzerland';
    const isGeneric = /^swimming pool (in|at) /i.test(spot.name || '');
    const displayLabel = isGeneric ? 'Public swimming pool' : spot.name;

    if (n.includes('hallenbad') || n.includes('piscine couverte') || n.includes('piscina coperta')) {
        return `Public indoor swimming pool (${displayLabel}) in ${city}.`;
    }
    if (n.includes('strandbad') || n.includes('seebad') || n.includes('lido') || n.includes('plage')) {
        return `Public lakeside or riverside bathing facility (${displayLabel}) in ${city}.`;
    }
    if (n.includes('freibad') || n.includes('badi') || n.includes('schwimmbad') || n.includes('gartenbad')) {
        return `Public outdoor swimming pool and bathing facility (${displayLabel}) in ${city}.`;
    }
    if (n.includes('therme') || n.includes('thermal') || n.includes('bains') || n.includes('aqua')) {
        return `Public thermal bath and swimming facility (${displayLabel}) in ${city}.`;
    }
    return isGeneric
        ? `Public swimming pool located in ${city}.`
        : `Public swimming pool facility (${displayLabel}) located in ${city}.`;
}

function stripUnverifiedPoolDefaults(spot) {
    // 1. Strip fake opening hours
    if (!spot.openingHours ||
        spot.openingHours === '08:00 - 20:00 daily' ||
        spot.openingHours === '08:00 - 20:00' ||
        spot.openingHours === '24/7') {
        spot.openingHours = 'Not specified';
    }

    // 2. Strip fake default amenities array on OSM pools
    if (!spot.id.startsWith('spot-')) {
        const isDummyDefault = Array.isArray(spot.amenities) &&
            spot.amenities.length === 4 &&
            spot.amenities.includes('Toilets') &&
            spot.amenities.includes('Cafe/Food') &&
            spot.amenities.includes('Stroller Friendly') &&
            spot.amenities.includes('Parking');
        if (isDummyDefault) {
            spot.amenities = [];
        }
    }

    // 3. Strip fake "water slides" boilerplate description
    spot.description = buildFactualPoolDescription(spot, null);
}

async function enrichPoolWithGooglePlaces(spot) {
    const isGenericName = /^swimming pool (in|at) /i.test(spot.name || '');
    const query = isGenericName
        ? `Schwimmbad Badi Piscine ${spot.city || ''} Switzerland`.trim()
        : `${spot.name}, ${spot.city || ''} Switzerland`.trim();

    const searchRadius = isGenericName ? 1200.0 : 2000.0;

    const v1Body = JSON.stringify({
        textQuery: query,
        locationBias: {
            circle: {
                center: { latitude: spot.lat, longitude: spot.lng },
                radius: searchRadius
            }
        },
        maxResultCount: 1
    });

    const fieldMask = [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.location',
        'places.regularOpeningHours',
        'places.websiteUri',
        'places.nationalPhoneNumber',
        'places.editorialSummary',
        'places.accessibilityOptions',
        'places.restroom',
        'places.parkingOptions',
        'places.photos',
        'places.types'
    ].join(',');

    const v1Res = await httpsRequest('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': fieldMask
        }
    }, v1Body);

    if (v1Res.statusCode !== 200) return false;

    try {
        const data = JSON.parse(v1Res.body);
        const place = data.places?.[0];
        if (!place) return false;

        // Verify proximity so a generic pool in Town A doesn't accidentally pull a pool 10km away in Town B
        const maxDistKm = isGenericName ? 1.2 : 2.5;
        if (place.location) {
            const dist = calculateDistance(spot.lat, spot.lng, place.location.latitude, place.location.longitude);
            if (dist > maxDistKm) {
                return false;
            }
        }

        // 1. Update Official Name if generic
        if (isGenericName && place.displayName?.text) {
            spot.name = place.displayName.text;
        }

        // 2. Update Verified Address
        const fmtAddr = place.formattedAddress || '';
        if (fmtAddr) {
            const cleanAddr = fmtAddr.replace(/,\s*(Switzerland|Schweiz|Suisse|Svizzera)$/i, '').trim();
            if (cleanAddr) spot.address = cleanAddr;
            const zipMatch = cleanAddr.match(/\b([1-9]\d{3})\s+([^,]+)$/);
            if (zipMatch) {
                spot.zip = zipMatch[1];
                spot.city = zipMatch[2].trim();
            }
        }

        // 3. Verified Opening Hours from Google Places
        const googleHours = formatGoogleOpeningHours(place.regularOpeningHours?.weekdayDescriptions);
        if (googleHours) {
            spot.openingHours = googleHours;
        }

        // 4. Official Website & Phone
        if (place.websiteUri) {
            spot.website = place.websiteUri;
        }
        if (place.nationalPhoneNumber) {
            spot.phone = place.nationalPhoneNumber;
        }

        // 5. Verified Amenities ONLY
        const verifiedAmenities = new Set(spot.id.startsWith('spot-') ? (spot.amenities || []) : []);
        if (place.restroom === true) {
            verifiedAmenities.add('Toilets');
        }
        if (place.accessibilityOptions?.wheelchairAccessibleEntrance === true) {
            verifiedAmenities.add('Stroller Friendly');
        }
        if (place.parkingOptions && Object.values(place.parkingOptions).some(v => v === true)) {
            verifiedAmenities.add('Parking');
        } else if (place.accessibilityOptions?.wheelchairAccessibleParking === true) {
            verifiedAmenities.add('Parking');
        }

        const nLower = (spot.name || '').toLowerCase();
        if (nLower.includes('hallenbad') || nLower.includes('piscine couverte') || nLower.includes('indoor')) {
            verifiedAmenities.add('Indoor Pool');
        } else if (nLower.includes('freibad') || nLower.includes('strandbad') || nLower.includes('seebad') || nLower.includes('badi') || nLower.includes('lido')) {
            verifiedAmenities.add('Outdoor Badi');
        }

        spot.amenities = Array.from(verifiedAmenities);

        // 6. Verified Description
        spot.description = buildFactualPoolDescription(spot, place.editorialSummary?.text);

        // 7. Verified Google Photos
        if (place.photos && place.photos.length > 0) {
            const hasMultiGooglePhotos = spot.imageUrl &&
                spot.imageUrl.includes('googleusercontent.com') &&
                Array.isArray(spot.images) &&
                spot.images.length >= 2;

            if (!hasMultiGooglePhotos) {
                const resolvedUrls = [];
                let primaryAuthor = 'Google Maps Contributor';

                for (const photo of place.photos.slice(0, 3)) {
                    const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1000&key=${API_KEY}`;
                    const cdnUrl = await resolveRedirectUrl(mediaUrl);
                    if (cdnUrl) {
                        resolvedUrls.push(cdnUrl);
                        if (resolvedUrls.length === 1 && photo.authorAttributions?.[0]?.displayName) {
                            primaryAuthor = photo.authorAttributions[0].displayName;
                        }
                    }
                }

                if (resolvedUrls.length > 0) {
                    spot.imageUrl = resolvedUrls[0];
                    spot.images = resolvedUrls;
                    spot.imageSource = `Google Maps / Photo by ${primaryAuthor}`;
                }
            }
        }

        return true;
    } catch (e) {
        return false;
    }
}

async function run() {
    console.log('=== Swimming Pool Validation & Google Places Enrichment ===\n');

    const baseSpots = JSON.parse(fs.readFileSync(BASE_PATH, 'utf-8'));
    const harvestedSpots = JSON.parse(fs.readFileSync(HARVESTED_PATH, 'utf-8'));

    // Collect all unique swimming pools across both files by ID
    const poolsById = new Map();
    baseSpots.filter(s => s.type === 'swimmingpool').forEach(p => poolsById.set(p.id, p));
    harvestedSpots.filter(s => s.type === 'swimmingpool').forEach(p => {
        if (!poolsById.has(p.id)) poolsById.set(p.id, p);
    });

    const allPools = Array.from(poolsById.values());
    console.log(`Found ${allPools.length} unique swimming pools across base_spots.json and spots_harvested.json.`);

    // Step 1: Strip all unverified defaults on every pool
    allPools.forEach(stripUnverifiedPoolDefaults);

    // Step 2: Enrich via Google Places API in batches of 6
    let matchedCount = 0;
    const BATCH_SIZE = 6;

    for (let i = 0; i < allPools.length; i += BATCH_SIZE) {
        const batch = allPools.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(p => enrichPoolWithGooglePlaces(p)));
        results.forEach(ok => { if (ok) matchedCount++; });

        if ((i + BATCH_SIZE) % 60 === 0 || i + BATCH_SIZE >= allPools.length) {
            console.log(`  Progress: ${Math.min(i + BATCH_SIZE, allPools.length)}/${allPools.length} pools checked (${matchedCount} validated with Google Places)...`);
        }
        await new Promise(r => setTimeout(r, 120));
    }

    // Step 3: Sync enriched pool objects back to both arrays without changing spot counts
    for (let i = 0; i < harvestedSpots.length; i++) {
        if (harvestedSpots[i].type === 'swimmingpool' && poolsById.has(harvestedSpots[i].id)) {
            harvestedSpots[i] = { ...poolsById.get(harvestedSpots[i].id), featured: harvestedSpots[i].featured };
        }
    }

    for (let i = 0; i < baseSpots.length; i++) {
        if (baseSpots[i].type === 'swimmingpool' && poolsById.has(baseSpots[i].id)) {
            baseSpots[i] = { ...poolsById.get(baseSpots[i].id), featured: true };
        }
    }

    fs.writeFileSync(BASE_PATH, JSON.stringify(baseSpots, null, 4), 'utf-8');
    fs.writeFileSync(HARVESTED_PATH, JSON.stringify(harvestedSpots, null, 4), 'utf-8');

    const hPools = harvestedSpots.filter(s => s.type === 'swimmingpool');
    const bPools = baseSpots.filter(s => s.type === 'swimmingpool');
    const googlePhotosH = hPools.filter(p => p.imageUrl && p.imageUrl.includes('googleusercontent.com')).length;
    const googlePhotosB = bPools.filter(p => p.imageUrl && p.imageUrl.includes('googleusercontent.com')).length;
    const verifiedHoursH = hPools.filter(p => p.openingHours && p.openingHours !== 'Not specified').length;
    const verifiedHoursB = bPools.filter(p => p.openingHours && p.openingHours !== 'Not specified').length;
    const fakeHoursRemaining = hPools.filter(p => p.openingHours === '08:00 - 20:00 daily' || p.openingHours === '24/7').length;
    const fakeDescRemaining = hPools.filter(p => (p.description || '').includes("dedicated splashing zones and water slides")).length;

    console.log('\n✅ Swimming Pool Verification & Google Enrichment Complete!');
    console.log(`- Total spots in base_spots.json: ${baseSpots.length} (unchanged)`);
    console.log(`- Total spots in spots_harvested.json: ${harvestedSpots.length} (unchanged)`);
    console.log(`- Featured pools with Google Maps photos: ${googlePhotosB}/${bPools.length}`);
    console.log(`- Featured pools with verified opening hours: ${verifiedHoursB}/${bPools.length}`);
    console.log(`- All harvested pools with Google Maps photos: ${googlePhotosH}/${hPools.length}`);
    console.log(`- All harvested pools with verified opening hours: ${verifiedHoursH}/${hPools.length}`);
    console.log(`- Fake '08:00 - 20:00 daily' hours remaining: ${fakeHoursRemaining}`);
    console.log(`- Fake 'water slides' descriptions remaining: ${fakeDescRemaining}`);
}

run();
