/**
 * Step 1 / Method 1: Official Google Places Photos API Enricher
 * 
 * Safely fetches real, modern visitor photos from Google Maps for Swiss playspots,
 * resolves the public CDN URL (lh3.googleusercontent.com) so your API key is NEVER
 * exposed in frontend JSON files or billed repeatedly per visitor, and stores the
 * required Google Maps photographer attribution in `imageSource`.
 *
 * Usage:
 *   $env:GOOGLE_PLACES_API_KEY="AIzaSy..."
 *   node enrich_google_places.js [--all]
 *
 * By default, enriches `base_spots.json` (100 featured spots) plus top named spots.
 * Pass `--all` to also enrich named spots in `spots_harvested.json`.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

function loadEnvKey(keyName) {
    if (process.env[keyName]) return process.env[keyName].replace(/[^\x21-\x7E]/g, '');
    const cliArg = process.argv.find(a => a.startsWith('--key='));
    if (cliArg) return cliArg.split('=')[1].replace(/[^\x21-\x7E]/g, '');
    const envPaths = [
        path.join(__dirname, '.env'),
        path.join(os.homedir(), '.env')
    ];
    for (const p of envPaths) {
        if (fs.existsSync(p)) {
            const rawBuf = fs.readFileSync(p);
            // Strip null bytes (from PowerShell UTF-16LE) and BOM
            const cleanText = rawBuf.toString('utf-8').replace(/\0/g, '').replace(/^\uFEFF/, '');
            const lines = cleanText.split(/\r?\n/);
            for (const line of lines) {
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
    console.error('ERROR: Missing GOOGLE_PLACES_API_KEY in .env or environment.');
    process.exit(1);
}

const INCLUDE_HARVESTED = process.argv.includes('--all');
const BASE_PATH = path.join(__dirname, 'base_spots.json');
const HARVESTED_PATH = path.join(__dirname, 'spots_harvested.json');

function httpsRequest(url, options = {}, postData = null) {
    return new Promise((resolve) => {
        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', () => resolve({ statusCode: 0, headers: {}, body: '' }));
        if (postData) req.write(postData);
        req.end();
    });
}

function stripHtml(html) {
    return (html || '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Resolves a Google Places photo endpoint to its final `lh3.googleusercontent.com` CDN URL
 * so the API key is never exposed in the public JSON and is only billed once at harvest time.
 */
async function resolveRedirectUrl(photoEndpointUrl) {
    const res = await httpsRequest(photoEndpointUrl, { method: 'GET' });
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return res.headers.location;
    }
    return null;
}

/**
 * Try Places API (New) v1 first, fallback to Legacy Places API if v1 isn't enabled.
 */
async function fetchPlacePhotosForSpot(spot) {
    const query = `${spot.name}, ${spot.city || ''} Switzerland`.trim();

    // 1. Try Places API (New) - Text Search
    const v1Body = JSON.stringify({
        textQuery: query,
        locationBias: {
            circle: {
                center: { latitude: spot.lat, longitude: spot.lng },
                radius: 1500.0
            }
        },
        maxResultCount: 1
    });

    const v1Res = await httpsRequest('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': API_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.photos'
        }
    }, v1Body);

    if (v1Res.statusCode === 200) {
        try {
            const data = JSON.parse(v1Res.body);
            const place = data.places?.[0];
            if (place && place.photos && place.photos.length > 0) {
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
                    return {
                        images: resolvedUrls,
                        imageSource: `Google Maps / Photo by ${primaryAuthor}`
                    };
                }
            }
        } catch (e) {}
    }

    // 2. Fallback to Legacy Places API (Find Place From Text + Place Details)
    const legacyUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&locationbias=circle:1500@${spot.lat},${spot.lng}&fields=place_id,name,photos&key=${API_KEY}`;
    const legacyRes = await httpsRequest(legacyUrl, { method: 'GET' });

    if (legacyRes.statusCode === 200) {
        try {
            const data = JSON.parse(legacyRes.body);
            const candidate = data.candidates?.[0];
            if (candidate && candidate.photos && candidate.photos.length > 0) {
                const photo = candidate.photos[0];
                const rawPhotoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1000&photo_reference=${photo.photo_reference}&key=${API_KEY}`;
                const cdnUrl = await resolveRedirectUrl(rawPhotoUrl);
                if (cdnUrl) {
                    const author = stripHtml(photo.html_attributions?.[0]) || 'Google Maps Contributor';
                    return {
                        images: [cdnUrl],
                        imageSource: `Google Maps / Photo by ${author}`
                    };
                }
            }
        } catch (e) {}
    }

    return null;
}

async function run() {
    console.log('=== Method 1: Google Places Photos API Enricher ===');
    const baseSpots = JSON.parse(fs.readFileSync(BASE_PATH, 'utf-8'));
    let updatedBase = 0;

    for (let i = 0; i < baseSpots.length; i++) {
        const spot = baseSpots[i];
        const result = await fetchPlacePhotosForSpot(spot);
        if (result && result.images.length > 0) {
            spot.imageUrl = result.images[0];
            spot.images = result.images;
            spot.imageSource = result.imageSource;
            updatedBase++;
            console.log(`[Base ${i + 1}/${baseSpots.length}] ✅ ${spot.name} -> ${result.imageSource}`);
        } else {
            console.log(`[Base ${i + 1}/${baseSpots.length}] ⚪ ${spot.name} (no photo found)`);
        }
        await new Promise(r => setTimeout(r, 150));
    }

    fs.writeFileSync(BASE_PATH, JSON.stringify(baseSpots, null, 4), 'utf-8');
    console.log(`\nUpdated ${updatedBase}/${baseSpots.length} spots in base_spots.json.`);

    if (INCLUDE_HARVESTED && fs.existsSync(HARVESTED_PATH)) {
        const harvested = JSON.parse(fs.readFileSync(HARVESTED_PATH, 'utf-8'));
        let updatedHarv = 0;
        const namedSpots = harvested.filter(s => !/^(playground|swimming pool|indoor play center) (in|at) /i.test(s.name));
        console.log(`\nProcessing ${namedSpots.length} named spots in spots_harvested.json...`);

        for (let i = 0; i < namedSpots.length; i++) {
            const spot = namedSpots[i];
            const result = await fetchPlacePhotosForSpot(spot);
            if (result && result.images.length > 0) {
                spot.imageUrl = result.images[0];
                spot.images = result.images;
                spot.imageSource = result.imageSource;
                updatedHarv++;
            }
            if ((i + 1) % 25 === 0) {
                console.log(`[Harvested ${i + 1}/${namedSpots.length}] Updated ${updatedHarv} spots so far...`);
                fs.writeFileSync(HARVESTED_PATH, JSON.stringify(harvested, null, 4), 'utf-8');
            }
            await new Promise(r => setTimeout(r, 150));
        }
        fs.writeFileSync(HARVESTED_PATH, JSON.stringify(harvested, null, 4), 'utf-8');
        console.log(`Updated ${updatedHarv} named spots in spots_harvested.json.`);
    }
}

run();
