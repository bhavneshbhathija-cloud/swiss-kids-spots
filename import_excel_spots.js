// import_excel_spots.js
// Reads happy_kids_swiss_ALL_locations.xlsx, geocodes each location,
// checks for duplicates against base_spots.json and spots_harvested.json,
// and adds new spots to base_spots.json.

const XLSX = require('xlsx');
const https = require('https');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.join(__dirname, 'happy_kids_swiss_ALL_locations.xlsx');
const BASE_SPOTS_FILE = path.join(__dirname, 'base_spots.json');
const HARVESTED_FILE = path.join(__dirname, 'spots_harvested.json');
const POSTAL_CODES = JSON.parse(fs.readFileSync(path.join(__dirname, 'postal-codes.json'), 'utf-8'));

// --- Helpers ---
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function findClosestZip(lat, lng) {
    let minDist = Infinity, closest = "8000";
    for (const [zip, coords] of Object.entries(POSTAL_CODES)) {
        const d = calculateDistance(lat, lng, coords.lat, coords.lng);
        if (d < minDist) { minDist = d; closest = zip; }
    }
    return closest;
}

function fetchJson(url) {
    return new Promise((resolve) => {
        const mod = url.startsWith('https') ? https : require('http');
        mod.get(url, { headers: { 'User-Agent': 'SwissKidsSpots/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
        }).on('error', () => resolve(null));
    });
}

async function geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ch&limit=1&addressdetails=1&accept-language=en,de`;
    const data = await fetchJson(url);
    await sleep(1100); // Nominatim: max 1 req/sec
    if (data && data.length > 0) return data[0];
    return null;
}

// Determine spot type from features/name
function guessType(name, features) {
    const text = `${name} ${features}`.toLowerCase();
    if (/pool|schwimmbad|badi|freibad|hallenbad|waterpark|aqua|water/.test(text)) return 'swimmingpool';
    if (/indoor|spielparadies|game|arcade|spielarium|bimano|trampolin|bowling|skate|boulder/.test(text)) return 'gamezone';
    return 'playpark';
}

// --- Main ---
async function main() {
    // 1. Read Excel
    const wb = XLSX.readFile(EXCEL_FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    // Row 0 = title, Row 1 = headers, Row 2+ = data
    const dataRows = rows.slice(2).filter(r => r[2] && r[2] !== '(location not fully captured)');
    
    console.log(`Found ${dataRows.length} locations in Excel.`);

    // 2. Load existing databases
    const baseSpots = JSON.parse(fs.readFileSync(BASE_SPOTS_FILE, 'utf-8'));
    const harvestedSpots = JSON.parse(fs.readFileSync(HARVESTED_FILE, 'utf-8'));
    const allExisting = [...baseSpots, ...harvestedSpots];
    console.log(`Existing database: ${baseSpots.length} curated + ${harvestedSpots.length} harvested = ${allExisting.length} total`);

    // 3. Process each row
    const newSpots = [];
    const duplicates = [];
    const failed = [];

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const locationName = (row[2] || '').toString().trim();
        const postTitle = (row[3] || '').toString().trim();
        const price = (row[4] || '').toString().trim();
        const hours = (row[5] || '').toString().trim();
        const features = (row[6] || '').toString().trim();
        const instagramUrl = (row[7] || '').toString().trim();

        console.log(`\n[${i+1}/${dataRows.length}] Geocoding: "${locationName}"...`);

        // Geocode
        let geo = await geocode(locationName);
        if (!geo) {
            // Try with just the city part
            const cityMatch = locationName.match(/,\s*(.+)$/);
            if (cityMatch) {
                geo = await geocode(cityMatch[1].trim());
            }
            if (!geo) {
                // Try first part before comma
                const firstPart = locationName.split(',')[0].trim();
                geo = await geocode(firstPart + ' Switzerland');
            }
            if (!geo) {
                console.log(`  X Could not geocode. Skipping.`);
                failed.push(locationName);
                continue;
            }
        }

        const lat = parseFloat(geo.lat);
        const lng = parseFloat(geo.lon);
        const addr = geo.address || {};
        const zip = addr.postcode || findClosestZip(lat, lng);
        const city = addr.city || addr.town || addr.village || addr.municipality || '';

        // 4. Dedup check: find any existing spot within 300m
        let isDuplicate = false;
        let dupName = '';
        for (const existing of allExisting) {
            const dist = calculateDistance(lat, lng, existing.lat, existing.lng);
            if (dist < 0.3) {
                isDuplicate = true;
                dupName = existing.name;
                break;
            }
        }

        if (isDuplicate) {
            console.log(`  >> DUPLICATE — matches "${dupName}" (within 300m). Skipping.`);
            duplicates.push({ name: locationName, matchedWith: dupName });
            continue;
        }

        // 5. Build new spot
        const type = guessType(locationName, features);
        const spotName = postTitle || locationName.split(',')[0].trim();
        let description = features || `A family-friendly attraction in ${city || 'Switzerland'}.`;
        let fees = price || (type === 'playpark' ? 'Free' : 'Contact venue');

        let imageUrl;
        if (type === 'playpark') imageUrl = "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80";
        else if (type === 'gamezone') imageUrl = "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=600&auto=format&fit=crop&q=80";
        else imageUrl = "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80";

        const newSpot = {
            id: `excel-spot-${Date.now()}-${i}`,
            name: spotName,
            type: type,
            description: description,
            address: `${locationName}, ${zip} ${city}`,
            zip: zip,
            city: city || 'Switzerland',
            lat: Math.round(lat * 100000) / 100000,
            lng: Math.round(lng * 100000) / 100000,
            openingHours: hours || "Check venue for hours",
            fees: fees,
            minAge: 0,
            maxAge: 14,
            amenities: ["Toilets", "Stroller Friendly"],
            imageUrl: imageUrl,
            images: [imageUrl],
            ratings: [5],
            comments: [{ author: "happy.kids.swiss", rating: 5, text: `Featured on @happy.kids.swiss Instagram! ${description}` }],
            instagramUrl: instagramUrl
        };

        newSpots.push(newSpot);
        allExisting.push(newSpot);
        console.log(`  + NEW: "${spotName}" (${type}) at ${lat.toFixed(4)}, ${lng.toFixed(4)} — ${zip} ${city}`);
    }

    // 6. Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`         IMPORT SUMMARY`);
    console.log(`${'='.repeat(50)}`);
    console.log(`  Total in Excel:    ${dataRows.length}`);
    console.log(`  New spots added:   ${newSpots.length}`);
    console.log(`  Duplicates found:  ${duplicates.length}`);
    console.log(`  Failed geocoding:  ${failed.length}`);
    console.log(`${'='.repeat(50)}`);

    if (duplicates.length > 0) {
        console.log(`\nDuplicates:`);
        duplicates.forEach(d => console.log(`  - "${d.name}" -> matched "${d.matchedWith}"`));
    }
    if (failed.length > 0) {
        console.log(`\nFailed geocoding:`);
        failed.forEach(f => console.log(`  - "${f}"`));
    }

    // 7. Merge into base_spots.json
    if (newSpots.length > 0) {
        const updatedBase = [...baseSpots, ...newSpots];
        fs.writeFileSync(BASE_SPOTS_FILE, JSON.stringify(updatedBase, null, 4), 'utf-8');
        console.log(`\n+ Added ${newSpots.length} new spots to base_spots.json (total: ${updatedBase.length})`);
    } else {
        console.log(`\nNo new spots to add.`);
    }
}

main().catch(console.error);
