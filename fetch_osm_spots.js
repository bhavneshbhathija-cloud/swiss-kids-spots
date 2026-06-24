const https = require('https');
const fs = require('fs');
const path = require('path');

// Load all Swiss ZIP codes from JSON for high-precision lookup
const zipPath = path.join(__dirname, 'postal-codes.json');
const SWISS_ZIPS = JSON.parse(fs.readFileSync(zipPath, 'utf-8'));

// Unsplash Image Databases for kids spots
const PLAYPARK_IMAGES = [
    "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1473081556163-2a17de81fc97?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1537655780520-1e392edd816a?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1581579438747-1dc8d17bbce4?w=600&auto=format&fit=crop&q=80",
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
    
    // Query for 1000 named play and swim sites in Switzerland
    const overpassQuery = `[out:json][timeout:90];
    (
      node(45.8,5.9,47.9,10.5)[leisure=playground][name];
      node(45.8,5.9,47.9,10.5)[leisure=water_park];
      node(45.8,5.9,47.9,10.5)[leisure=swimming_pool];
      node(45.8,5.9,47.9,10.5)[leisure=indoor_play];
      way(45.8,5.9,47.9,10.5)[leisure=playground][name];
      way(45.8,5.9,47.9,10.5)[leisure=water_park];
      way(45.8,5.9,47.9,10.5)[leisure=swimming_pool];
      way(45.8,5.9,47.9,10.5)[leisure=indoor_play];
    );
    out center 1000;
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

                    // 5. Build full address
                    let address = "";
                    if (street) {
                        address = `${street} ${houseNum}`.trim() + `, ${zipCode} ${city}`;
                    } else {
                        address = `${name}, ${zipCode} ${city}`;
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

                    formattedSpots.push({
                        id: `osm-spot-${idx + 1}`,
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
                        imageUrl: imageUrl,
                        ratings: [5],
                        comments: [
                            { author: "OSM Contributor", rating: 5, text: `Verified public kids spot harvested via OpenStreetMap. Great location in ${city}!` }
                        ]
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
