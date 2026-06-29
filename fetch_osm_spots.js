const https = require('https');
const fs = require('fs');
const path = require('path');

// Load all Swiss ZIP codes from JSON for high-precision lookup
const zipPath = path.join(__dirname, 'postal-codes.json');
const SWISS_ZIPS = JSON.parse(fs.readFileSync(zipPath, 'utf-8'));

// Load baseline curated spots for deduplication
const baseSpotsPath = path.join(__dirname, 'base_spots.json');
const BASE_SPOTS = fs.existsSync(baseSpotsPath) ? JSON.parse(fs.readFileSync(baseSpotsPath, 'utf-8')) : [];

// Load existing harvested database to preserve scraped images
const harvestedPath = path.join(__dirname, 'spots_harvested.json');
const EXISTING_HARVESTED = fs.existsSync(harvestedPath) ? JSON.parse(fs.readFileSync(harvestedPath, 'utf-8')) : [];

// Unsplash Image Databases for kids spots
const PLAYPARK_IMAGES = [
    "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1537655780520-1e392edd816a?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?w=600&auto=format&fit=crop&q=80"
];

const SWIMMINGPOOL_IMAGES = [
    "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1560090143-1b37560cc799?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1519817650390-64a93db51149?w=600&auto=format&fit=crop&q=80"
];

const GAMEZONE_IMAGES = [
    "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1564982752979-3f7bc974d29a?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1566371486490-560ded239de6?w=600&auto=format&fit=crop&q=80"
];

// Calculate Haversine distance
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Find closest ZIP code
function findClosestZip(lat, lng) {
    let minDist = Infinity;
    let closestZip = "8000";
    for (const [zipCode, coords] of Object.entries(SWISS_ZIPS)) {
        const dist = calculateDistance(lat, lng, coords.lat, coords.lng);
        if (dist < minDist) {
            minDist = dist;
            closestZip = zipCode;
        }
    }
    return closestZip;
}

// Fetch spots from Overpass API
function harvestSpots() {
    console.log("Connecting to OpenStreetMap Overpass API...");
    
    // Query for 1500 play and swim sites in Switzerland (removing [name] requirement from playgrounds to include unnamed neighborhood spielplatzs)
    const overpassQuery = `[out:json][timeout:90];
    (
      node(45.8,5.9,47.9,10.5)[leisure=playground];
      node(45.8,5.9,47.9,10.5)[leisure=water_park];
      node(45.8,5.9,47.9,10.5)[leisure=swimming_pool];
      node(45.8,5.9,47.9,10.5)[leisure=indoor_play];
      way(45.8,5.9,47.9,10.5)[leisure=playground];
      way(45.8,5.9,47.9,10.5)[leisure=water_park];
      way(45.8,5.9,47.9,10.5)[leisure=swimming_pool];
      way(45.8,5.9,47.9,10.5)[leisure=indoor_play];
    );
    out center 8000;
    `;

    const postData = 'data=' + encodeURIComponent(overpassQuery);

    const options = {
        hostname: 'overpass-api.de',
        port: 443,
        path: '/api/interpreter',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'SwissKidsSpots/1.0'
        }
    };

    const req = https.request(options, (res) => {
        let responseBody = '';

        res.on('data', (chunk) => {
            responseBody += chunk;
        });

        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.error(`API request failed with status code ${res.statusCode}`);
                return;
            }

            try {
                const osmJson = JSON.parse(responseBody);
                const elements = osmJson.elements || [];
                console.log(`Harvested ${elements.length} raw spots from OpenStreetMap.`);

                const formattedSpots = [];
                let spotCounter = 0;

                elements.forEach((el, idx) => {
                    const tags = el.tags || {};

                    // 1. Determine coordinates
                    let lat = el.lat;
                    let lng = el.lon;
                    if (lat === undefined || lng === undefined) {
                        const center = el.center || {};
                        lat = center.lat;
                        lng = center.lon;
                    }

                    if (lat === undefined || lng === undefined) {
                        return;
                    }

                    // 2. Determine type
                    const osmLeisure = tags.leisure || "";
                    let spotType = "playpark";
                    let defaultDesc = "";
                    let imageUrl = "";
                    let minAge = 1, maxAge = 12;
                    let defaultAmenities = [];

                    if (osmLeisure === "playground") {
                        spotType = "playpark";
                        defaultDesc = "A public outdoor playground in Switzerland featuring swings, slides, climbing frames, and kids play units.";
                        imageUrl = PLAYPARK_IMAGES[idx % PLAYPARK_IMAGES.length];
                        minAge = 1;
                        maxAge = 12;
                        defaultAmenities = ["Toilets", "Shade", "Stroller Friendly"];
                    } else if (osmLeisure === "water_park" || osmLeisure === "swimming_pool") {
                        spotType = "swimmingpool";
                        defaultDesc = "A community swimming pool facility with dedicated splashing zones and water slides for kids' fun.";
                        imageUrl = SWIMMINGPOOL_IMAGES[idx % SWIMMINGPOOL_IMAGES.length];
                        minAge = 0;
                        maxAge = 18;
                        defaultAmenities = ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking"];
                    } else {
                        spotType = "gamezone";
                        defaultDesc = "An indoor game and play zone featuring safe spaces, interactive games, and obstacle arenas.";
                        imageUrl = GAMEZONE_IMAGES[idx % GAMEZONE_IMAGES.length];
                        minAge = 2;
                        maxAge = 14;
                        defaultAmenities = ["Toilets", "Cafe/Food", "Stroller Friendly"];
                    }

                    // 3. Resolve location details
                    let zipCode = tags["addr:postcode"];
                    let city = tags["addr:city"];

                    if (!zipCode) {
                        zipCode = findClosestZip(lat, lng);
                    }

                    if (!city) {
                        city = SWISS_ZIPS[zipCode] ? SWISS_ZIPS[zipCode].city : "Switzerland";
                    }

                    const street = tags["addr:street"] || "";
                    const houseNum = tags["addr:housenumber"] || "";

                    // 4. Resolve name
                    let name = tags.name;
                    if (!name) {
                        if (spotType === "playpark") {
                            name = street ? `Playground at ${street}` : `Playground in ${city}`;
                        } else if (spotType === "swimmingpool") {
                            name = street ? `Swimming Pool at ${street}` : `Swimming Pool in ${city}`;
                        } else {
                            name = street ? `Indoor Play Center at ${street}` : `Indoor Play Center in ${city}`;
                        }
                    }

                    // Special overrides for known spots that are unnamed or generic in OSM
                    let customAddress = null;
                    if (Math.abs(lat - 47.41017) < 0.0002 && Math.abs(lng - 8.55221) < 0.0002) {
                        name = "Oerliker Park Playground & Blauer Turm";
                        defaultDesc = "A famous playground in Oerliker Park featuring the iconic 35-meter blue climbing tower (Blauer Turm) and beautiful wooden play structures.";
                        defaultAmenities = ["Toilets", "Shade", "Stroller Friendly", "Climbing Tower"];
                        customAddress = "Oerliker Park, 8050 Zürich";
                    }

                    // 5. Build full address
                    let address = "";
                    if (customAddress) {
                        address = customAddress;
                    } else if (street) {
                        address = `${street} ${houseNum}`.trim() + `, ${zipCode} ${city}`;
                    } else {
                        address = `${name}, ${zipCode} ${city}`;
                    }

                    // Check coordinate blacklist (private/invalid sites and Herzogenmühle)
                    const coordinateBlacklist = [
                        { lat: 47.44943, lng: 8.56129, name: "Busgate Süd" },
                        { lat: 47.45061, lng: 8.56156, name: "Kinderspielplatz Airport" },
                        { lat: 47.41806, lng: 8.56961, name: "Auzelg-Opfikonstrasse" },
                        { lat: 47.41386, lng: 8.56018, name: "Kinder Indoor Spielplatz" },
                        { lat: 47.65277, lng: 9.47916, name: "Babybeach" },
                        { lat: 47.38448, lng: 8.49274, name: "Play Village" },
                        { lat: 47.72006, lng: 8.66517, name: "Herblinger Kinderparadies" },
                        { lat: 46.24119, lng: 5.97273, name: "Private Playground" },
                        { lat: 46.76559, lng: 7.60967, name: "KITA Aare" },
                        { lat: 47.32050, lng: 9.08464, name: "Bahnhof Lichtensteig" },
                        { lat: 46.94780, lng: 7.38837, name: "Spielplatz Kita Tscharnergut" },
                        { lat: 45.98164, lng: 6.92679, name: "Private crèche playground" },
                        { lat: 47.82588, lng: 10.03051, name: "Station 10 - Gerber" },
                        { lat: 47.82701, lng: 10.02890, name: "Station 11 - Flachsbauer" },
                        { lat: 47.82712, lng: 10.02491, name: "Station 2 - Seiler" },
                        { lat: 47.82610, lng: 10.03362, name: "Station 9 - Gaukler" },
                        { lat: 47.82543, lng: 10.03294, name: "Station 8 - Schriftsetzer" },
                        { lat: 47.82743, lng: 10.02472, name: "Station 3 - Weber" },
                        { lat: 47.82522, lng: 10.02809, name: "Station 6 - Schmid" },
                        { lat: 47.26498, lng: 8.67550, name: "Spielplatz Spielgruppe Sunneburg" },
                        { lat: 46.76129, lng: 7.35861, name: "Hansjoggeliweg Station 2" },
                        { lat: 47.40543, lng: 8.57257, name: "Herzogenmühle" }
                    ];

                    let isBlacklistedByCoord = false;
                    for (const item of coordinateBlacklist) {
                        const dist = calculateDistance(lat, lng, item.lat, item.lng);
                        if (dist < 0.030) { // within 30 meters
                            isBlacklistedByCoord = true;
                            break;
                        }
                    }
                    if (isBlacklistedByCoord) {
                        return;
                    }

                    // 6. Run spam/suspicious filters (transit, private kitas, fitness trail stations, duplicates)
                    const hardBlockKeywords = [
                        /\bgate\b/i, /\bbusgate\b/i, /\btransit\b/i, /\bairport\b/i, /\bflughafen\b/i,
                        /\bkita\b/i, /\bkrippe\b/i, /\bkinderkrippe\b/i, /\bkinderhort\b/i, /\bhort\b/i,
                        /\bdaycare\b/i, /\bspielgruppe\b/i, /\bnursery\b/i, /\bcrèche\b/i,
                        /\bprivat\b/i, /\bprivate\b/i, /\bwohnsiedlung\b/i, /\bresidential\b/i, /\bprivate yard\b/i,
                        /\bbüro\b/i, /\boffice\b/i, /\bgewerbe\b/i, /\bcompany\b/i
                    ];

                    const softBlockKeywords = [
                        /\bgleis\b/i, /\bbahnhof\b/i, /\btram\b/i, /\bbusstation\b/i, /\bhaltestelle\b/i, /\bdepot\b/i, /\bstation\b/i, /\bbusstop\b/i
                    ];

                    let isSuspicious = false;
                    for (const regex of hardBlockKeywords) {
                        if (regex.test(name) || regex.test(address)) {
                            isSuspicious = true;
                            break;
                        }
                    }

                    if (!isSuspicious) {
                        const isExplicitPlayground = /spielplatz/i.test(name) || /playground/i.test(name) || /schaukel/i.test(name) || /rutsche/i.test(name);
                        for (const regex of softBlockKeywords) {
                            if (regex.test(name) || regex.test(address)) {
                                if (!isExplicitPlayground) {
                                    isSuspicious = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (isSuspicious) {
                        return;
                    }

                    // 7. Deduplication Check
                    // A. Check against curated spots (base_spots.json)
                    let isDuplicateOfCurated = false;
                    const baseDupThreshold = spotType === "playpark" ? 0.150 : 0.250;
                    for (const baseSpot of BASE_SPOTS) {
                        if (baseSpot.type === spotType) {
                            const dist = calculateDistance(lat, lng, baseSpot.lat, baseSpot.lng);
                            if (dist < baseDupThreshold) {
                                isDuplicateOfCurated = true;
                                break;
                            }
                        }
                    }
                    if (isDuplicateOfCurated) {
                        return;
                    }

                    // B. Check against already added harvested spots
                    let isDuplicateOfHarvested = false;
                    let duplicateIdx = -1;
                    const harvestDupThreshold = spotType === "playpark" ? 0.150 : 0.250;
                    for (let i = 0; i < formattedSpots.length; i++) {
                        const existing = formattedSpots[i];
                        if (existing.type === spotType) {
                            const dist = calculateDistance(lat, lng, existing.lat, existing.lng);
                            if (dist < harvestDupThreshold) {
                                isDuplicateOfHarvested = true;
                                duplicateIdx = i;
                                break;
                            }
                        }
                    }

                    if (isDuplicateOfHarvested) {
                        const existing = formattedSpots[duplicateIdx];
                        const isGenericExisting = /^(playground|swimming pool|indoor play center) (in|at) /i.test(existing.name);
                        const isGenericNew = /^(playground|swimming pool|indoor play center) (in|at) /i.test(name);
                        // If candidate has a specific name and existing has a generic name, override the existing one
                        if (!isGenericNew && isGenericExisting) {
                            formattedSpots[duplicateIdx].name = name;
                            formattedSpots[duplicateIdx].description = defaultDesc;
                            formattedSpots[duplicateIdx].address = address;
                            formattedSpots[duplicateIdx].amenities = defaultAmenities;
                            formattedSpots[duplicateIdx].lat = Math.round(lat * 100000) / 100000;
                            formattedSpots[duplicateIdx].lng = Math.round(lng * 100000) / 100000;
                        }
                        return;
                    }

                    // Hours
                    const hours = tags.opening_hours || "08:00 - 20:00 daily";

                    // Fees
                    const feeTag = tags.fee || "";
                    const chargeTag = tags.charge || "";
                    let fees = "";
                    if (chargeTag) {
                        fees = chargeTag;
                    } else if (feeTag === "no" || spotType === "playpark") {
                        fees = "Free";
                    } else if (feeTag === "yes") {
                        fees = "Paid Entry";
                    } else {
                        fees = spotType === "playpark" ? "Free" : "Paid Entry";
                    }

                    // Check if we already have this spot in the existing harvested database to preserve custom scraping details (name, address, images)
                    let existingImageUrl = imageUrl;
                    let existingImages = [imageUrl];
                    for (const oldSpot of EXISTING_HARVESTED) {
                        const dist = calculateDistance(lat, lng, oldSpot.lat, oldSpot.lng);
                        if (dist < 0.010) { // within 10 meters (representing the same playground)
                            // If it has a specific name and address, preserve it
                            if (oldSpot.name && !/^(playground|swimming pool|indoor play center) (in|at) /i.test(oldSpot.name)) {
                                name = oldSpot.name;
                                if (oldSpot.description) defaultDesc = oldSpot.description;
                                if (oldSpot.address) address = oldSpot.address;
                                if (oldSpot.amenities) defaultAmenities = oldSpot.amenities;
                            }
                            // Preserve scraped images
                            if (oldSpot.imageUrl && !oldSpot.imageUrl.includes("unsplash.com/photo-")) {
                                existingImageUrl = oldSpot.imageUrl;
                                existingImages = oldSpot.images || [oldSpot.imageUrl];
                            }
                            break;
                        }
                    }

                    spotCounter++;

                    formattedSpots.push({
                        id: `osm-spot-${spotCounter}`,
                        name: name,
                        type: spotType,
                        description: defaultDesc,
                        address: address,
                        zip: zipCode,
                        city: city,
                        lat: Math.round(lat * 100000) / 100000,
                        lng: Math.round(lng * 100000) / 100000,
                        openingHours: hours,
                        fees: fees,
                        minAge: minAge,
                        maxAge: maxAge,
                        amenities: defaultAmenities,
                        imageUrl: existingImageUrl,
                        ratings: [5],
                        comments: [
                            { author: "OSM Contributor", rating: 5, text: `Verified public kids spot harvested via OpenStreetMap. Great location in ${city}!` }
                        ],
                        images: existingImages
                    });
                });

                const outputPath = path.join(__dirname, 'spots_harvested.json');
                fs.writeFileSync(outputPath, JSON.stringify(formattedSpots, null, 4), 'utf-8');
                console.log(`Successfully wrote ${formattedSpots.length} formatted spots to ${outputPath}!`);

            } catch (err) {
                console.error("Error parsing response JSON:", err);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    req.write(postData);
    req.end();
}

harvestSpots();
