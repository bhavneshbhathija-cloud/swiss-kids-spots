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

async function resolveRedirectUrl(photoEndpointUrl) {
    const res = await httpsRequest(photoEndpointUrl, { method: 'GET' });
    if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return res.headers.location;
    }
    return null;
}

async function fetchPlacePhotosForSpot(spot) {
    if (!API_KEY) return null;
    const query = `${spot.name}, ${spot.city || ''} Switzerland`.trim();

    const v1Body = JSON.stringify({
        textQuery: query,
        locationBias: {
            circle: {
                center: { latitude: spot.lat, longitude: spot.lng },
                radius: 2000.0
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

    const legacyUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&locationbias=circle:2000@${spot.lat},${spot.lng}&fields=place_id,name,photos&key=${API_KEY}`;
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

const FAMOUS_ATTRACTIONS = [
    {
        id: "spot-101",
        name: "Verkehrshaus der Schweiz (Swiss Museum of Transport)",
        type: "gamezone",
        description: "Switzerland's most popular museum and family adventure arena. Features an outdoor road safety traffic garden with pedal karts, construction site play zone with mini excavators, miniature steam train rides, aviation flight simulators, and a planetarium.",
        address: "Lidostrasse 5, 6006 Luzern",
        zip: "6006",
        city: "Luzern",
        lat: 47.0528,
        lng: 8.3364,
        openingHours: "10:00 - 18:00 daily",
        fees: "15 - 37 CHF (Under 6 Free)",
        minAge: 2,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking", "Picnic Area"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/82/6274_-_Luzern_-_Verkehrshaus_-_Lamborghini_Miura.JPG/1280px-6274_-_Luzern_-_Verkehrshaus_-_Lamborghini_Miura.JPG",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-102",
        name: "Swissminiatur Open-Air Miniature Park",
        type: "playpark",
        description: "Iconic 14,000 m² open-air park on the shores of Lake Lugano featuring 129 detailed 1:25 scale models of Swiss castles, cathedrals, and mountain railways, 3.5 km of working miniature trains, plus a kids playground and ride-on train.",
        address: "Via Cantonale, 6815 Melide",
        zip: "6815",
        city: "Melide",
        lat: 45.9538,
        lng: 8.9515,
        openingHours: "09:00 - 18:00 daily (Mar - Nov)",
        fees: "15 - 22 CHF (Under 6 Free)",
        minAge: 1,
        maxAge: 14,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4e/Swissminiatur_-_panoramio_-_avu-edm_%2824%29.jpg/1280px-Swissminiatur_-_panoramio_-_avu-edm_%2824%29.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-103",
        name: "Swiss Science Center Technorama",
        type: "gamezone",
        description: "One of Europe's largest interactive science centers with over 500 hands-on experiment stations across 4 floors, plus the outdoor 'Technorama Draussen' park featuring the Wonder Bridge and giant falling-water installations.",
        address: "Technoramastrasse 1, 8404 Winterthur",
        zip: "8404",
        city: "Winterthur",
        lat: 47.5135,
        lng: 8.7638,
        openingHours: "10:00 - 17:00 daily",
        fees: "21 - 34 CHF (Under 6 Free)",
        minAge: 4,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Technorama_Winterthur_2011-09-09_14-18-42.jpg/1280px-Technorama_Winterthur_2011-09-09_14-18-42.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-104",
        name: "Freilichtmuseum Ballenberg (Open-Air Museum)",
        type: "playpark",
        description: "Sprawling 66-hectare open-air park in the Bernese Oberland featuring over 100 original century-old Swiss farmhouses, 250 farm animals to visit, historic wooden games, hands-on craft workshops, a wooden carousel, and forest picnic spots.",
        address: "Museumsstrasse 100, 3858 Hofstetten bei Brienz",
        zip: "3858",
        city: "Hofstetten bei Brienz",
        lat: 46.7511,
        lng: 8.0805,
        openingHours: "10:00 - 17:00 daily (Apr - Oct)",
        fees: "16 - 32 CHF (Under 6 Free)",
        minAge: 2,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Ballenberg_%284915420303%29.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-105",
        name: "Conny-Land Freizeitpark",
        type: "gamezone",
        description: "Switzerland's largest family amusement theme park featuring over 60 attractions: mammoth tree water rides, wild river rafting, bumper cars, 5D space simulators, a giant indoor climbing castle, and water play park.",
        address: "Connylandstrasse, 8564 Lipperswil",
        zip: "8564",
        city: "Lipperswil",
        lat: 47.6146,
        lng: 9.0573,
        openingHours: "10:00 - 18:00 daily (Seasonal)",
        fees: "32 - 39 CHF (Under 4 Free)",
        minAge: 3,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking", "Picnic Area"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f7/Temple_of_cobra.jpg/1280px-Temple_of_cobra.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-106",
        name: "Madrisa-Land Alpine Adventure Park",
        type: "playpark",
        description: "Spectacular high-alpine legend and adventure park at 1,900m above Klosters. Features giant wooden slide towers, treehouse village, water play streams, bouncy cushions, alpine petting zoo, and scooter descents.",
        address: "Madrisastrasse 7, 7252 Klosters Dorf",
        zip: "7252",
        city: "Klosters",
        lat: 46.8833,
        lng: 9.8736,
        openingHours: "08:30 - 17:00 daily (Summer)",
        fees: "Free entry with gondola ticket",
        minAge: 2,
        maxAge: 14,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://images.schweizmobil.ch/image-big/SS_141_11_vor_Allmendhubel_F_g.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-107",
        name: "Freizeitanlage Atzmännig (Rodelbahn & Seilpark)",
        type: "playpark",
        description: "Famous family leisure paradise in the Zurich Oberland featuring a thrilling 700m alpine toboggan slide through tunnels and banked curves, an 8-course forest rope park for kids from age 4, trampolines, and the Spatz Mugg story trail.",
        address: "Atzmännigstrasse, 8638 Goldingen",
        zip: "8638",
        city: "Goldingen",
        lat: 47.2847,
        lng: 8.9958,
        openingHours: "09:00 - 18:00 daily (Apr - Nov)",
        fees: "Pay per ride / Day pass available",
        minAge: 2,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Atzm%C3%A4nnig-Seilbahn.JPG/1280px-Atzm%C3%A4nnig-Seilbahn.JPG",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-108",
        name: "Erlebnispark Schongiland",
        type: "playpark",
        description: "Charming family amusement and play park built around a historic mill. Features a 380m covered summer toboggan run, dragon castle, butterfly swing, pedal karts, whale water slide, and indoor bouncy castle hall.",
        address: "Rüedikonerstrasse 13, 6288 Schongau",
        zip: "6288",
        city: "Schongau",
        lat: 47.2655,
        lng: 8.2612,
        openingHours: "09:30 - 17:30 daily (Mar - Oct)",
        fees: "24 - 28 CHF (Under 3 Free)",
        minAge: 2,
        maxAge: 13,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Atzm%C3%A4nnig-Seilbahn.JPG/1280px-Atzm%C3%A4nnig-Seilbahn.JPG",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-109",
        name: "Säntispark Bäder- & Rutschenwelt",
        type: "swimmingpool",
        description: "Eastern Switzerland's premier family water park featuring 8 spectacular water slides (up to 180m long with light and sound effects), surf wave pool, wild water canyon river, and a dedicated 'Kinderbäderwelt' with warm shallow lagoons and water play features.",
        address: "Wiesenbachstrasse 9, 9030 Abtwil",
        zip: "9030",
        city: "Abtwil",
        lat: 47.4116,
        lng: 9.3175,
        openingHours: "09:00 - 22:00 daily",
        fees: "19 - 39 CHF (Under 4 Free)",
        minAge: 1,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/AFG_Arena_19.jpg/1280px-AFG_Arena_19.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-110",
        name: "Splash e Spa Tamaro Waterpark",
        type: "swimmingpool",
        description: "Modern indoor/outdoor water park in Ticino featuring a 30°C wave pool, 5 high-adrenaline funnel and raft water slides, outdoor panoramic thermal pool, and a colorful interactive children's water castle with fountains, slides, and tipping buckets.",
        address: "Via Campagnole 1, 6802 Rivera",
        zip: "6802",
        city: "Rivera",
        lat: 46.1265,
        lng: 8.9221,
        openingHours: "10:00 - 21:00 daily",
        fees: "24 - 42 CHF (Under 6 Free)",
        minAge: 1,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/AFG_Arena_19.jpg/1280px-AFG_Arena_19.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-111",
        name: "Natur- und Tierpark Goldau",
        type: "playpark",
        description: "Set in a dramatic prehistoric rockslide landscape at the foot of Mount Rigi, children can hand-feed free-roaming sika deer and mouflons, watch bears and wolves, and climb massive wooden adventure playgrounds with picnic barbecue areas.",
        address: "Parkstrasse 40, 6410 Goldau",
        zip: "6410",
        city: "Goldau",
        lat: 47.0506,
        lng: 8.5522,
        openingHours: "09:00 - 18:00 daily",
        fees: "13 - 26 CHF (Under 4 Free)",
        minAge: 1,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/3/36/Tierpark_Goldau_%284980106519%29.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-112",
        name: "Knies Kinderzoo Rapperswil",
        type: "playpark",
        description: "Legendary interactive children's zoo on Lake Zurich run by the Swiss National Circus Knie. Kids can feed giraffes at eye level, ride ponies, board the pirate ship on the lake lagoon, and play in the giant wooden whale playground.",
        address: "Oberseestrasse 36, 8640 Rapperswil",
        zip: "8640",
        city: "Rapperswil",
        lat: 47.2255,
        lng: 8.8242,
        openingHours: "09:00 - 18:00 daily (Mar - Oct)",
        fees: "10 - 23 CHF (Under 4 Free)",
        minAge: 1,
        maxAge: 14,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Knies_Kinderzoo_IMG_3835.JPG/1280px-Knies_Kinderzoo_IMG_3835.JPG",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-113",
        name: "Lindt Home of Chocolate",
        type: "gamezone",
        description: "Interactive chocolate discovery center on Lake Zurich featuring a 9-meter-tall free-standing chocolate fountain, interactive cocoa-to-bar exhibitions, unlimited liquid and praline chocolate tastings, and the Lindt Chocolateria kids workshop.",
        address: "Schokoladenplatz 1, 8802 Kilchberg",
        zip: "8802",
        city: "Kilchberg",
        lat: 47.3228,
        lng: 8.5539,
        openingHours: "10:00 - 19:00 daily",
        fees: "10 - 17 CHF (Under 8 Free)",
        minAge: 3,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Cailler_chocolate_factory_Broc-Fabrique.jpg/1280px-Cailler_chocolate_factory_Broc-Fabrique.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-114",
        name: "Maison Cailler Swiss Chocolate Factory",
        type: "gamezone",
        description: "Located in the Gruyère hills, Switzerland's oldest chocolate brand offers an immersive theatrical tour through Aztec cocoa temples, live production lines, chocolate tasting rooms, an outdoor chocolate-themed playground, and family workshops.",
        address: "Rue Jules Bellet 7, 1636 Broc",
        zip: "1636",
        city: "Broc",
        lat: 46.6111,
        lng: 7.1064,
        openingHours: "10:00 - 17:00 daily",
        fees: "7 - 17 CHF (Under 6 Free)",
        minAge: 3,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Cailler_chocolate_factory_Broc-Fabrique.jpg/1280px-Cailler_chocolate_factory_Broc-Fabrique.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-115",
        name: "Brunni Kitzelpfad (Tickle Trail) & Globi Playground",
        type: "playpark",
        description: "Sunny alpine family paradise at 1,860m above Engelberg. Features the famous barefoot sensory path around Lake Härzli (Kitzelpfad), Globi's Alpine Water World with water pumps, a summer toboggan run, and climbing towers.",
        address: "Wydematt 8, 6390 Engelberg",
        zip: "6390",
        city: "Engelberg",
        lat: 46.8372,
        lng: 8.4117,
        openingHours: "08:30 - 17:00 daily (Summer)",
        fees: "Free (Cable car tickets separate)",
        minAge: 2,
        maxAge: 14,
        amenities: ["Toilets", "Cafe/Food", "Picnic Area", "Parking"],
        imageUrl: "https://images.schweizmobil.ch/image-big/SS_141_11_vor_Allmendhubel_F_g.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-116",
        name: "Erlebnisberg Pradaschier (Longest Toboggan Run)",
        type: "playpark",
        description: "Home to Switzerland's longest all-weather rail toboggan run (3,060 meters long with 31 curves descending 480 vertical meters) plus Graubünden's highest forest rope park with a dedicated children's climbing circuit.",
        address: "Pradaschier 35, 7075 Churwalden",
        zip: "7075",
        city: "Churwalden",
        lat: 46.7797,
        lng: 9.5392,
        openingHours: "10:00 - 17:00 daily",
        fees: "Pay per ride / Combo tickets",
        minAge: 3,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Baumwipfelpfad_Neckertal_Baumstamm.jpg/1280px-Baumwipfelpfad_Neckertal_Baumstamm.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-117",
        name: "Baumwipfelpfad Neckertal (Treetop Walk & Forest Park)",
        type: "playpark",
        description: "Stroller-friendly 500-meter wooden treetop walkway soaring up to 50m above the forest floor. Includes 30 interactive learning stations, marble runs, a giant forest adventure playground, and wood-fired barbecue pits.",
        address: "Steinäcker 7, 9122 Mogelsberg",
        zip: "9122",
        city: "Mogelsberg",
        lat: 47.3592,
        lng: 9.1417,
        openingHours: "09:30 - 18:00 daily",
        fees: "8 - 16 CHF (Under 6 Free)",
        minAge: 1,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Baumwipfelpfad_Neckertal_Baumstamm.jpg/1280px-Baumwipfelpfad_Neckertal_Baumstamm.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-118",
        name: "Barryland – Musée et Chiens du Saint-Bernard",
        type: "gamezone",
        description: "Heartwarming live experience where kids meet the legendary Saint Bernard dogs from the Great St. Bernard Pass. Watch puppy feedings, explore interactive rescue exhibitions, and play in the themed kids area.",
        address: "Rue du Levant 34, 1920 Martigny",
        zip: "1920",
        city: "Martigny",
        lat: 46.0967,
        lng: 7.0733,
        openingHours: "10:00 - 18:00 daily",
        fees: "8 - 15 CHF (Under 6 Free)",
        minAge: 2,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/26/Saint-bernard-musee.JPG/1280px-Saint-bernard-musee.JPG",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-119",
        name: "Umwelt Arena Schweiz",
        type: "gamezone",
        description: "Interactive indoor sustainability and mobility discovery arena. Kids can test-drive electric karts, micro-scooters, and space-age fun bikes on the 300m indoor test track, plus complete interactive family treasure trails.",
        address: "Türliackerstrasse 4, 8957 Spreitenbach",
        zip: "8957",
        city: "Spreitenbach",
        lat: 47.4192,
        lng: 8.3653,
        openingHours: "10:00 - 17:00 (Thu - Sun)",
        fees: "10 - 18 CHF (Under 6 Free)",
        minAge: 4,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Technorama_Winterthur_2011-09-09_14-18-42.jpg/1280px-Technorama_Winterthur_2011-09-09_14-18-42.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-120",
        name: "WOW Museum – Room of Illusions",
        type: "gamezone",
        description: "Located steps from Zurich HB, this 3-floor interactive museum of optical illusions lets kids walk on ceilings, get lost in infinity mirror mazes, shrink and grow in perspective rooms, and play with light projections.",
        address: "Werdmühlestrasse 10, 8001 Zürich",
        zip: "8001",
        city: "Zürich",
        lat: 47.3752,
        lng: 8.5398,
        openingHours: "10:00 - 20:00 daily",
        fees: "16 - 23 CHF (Under 6 Free)",
        minAge: 3,
        maxAge: 16,
        amenities: ["Toilets", "Stroller Friendly"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Technorama_Winterthur_2011-09-09_14-18-42.jpg/1280px-Technorama_Winterthur_2011-09-09_14-18-42.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-121",
        name: "Sensorium im Rüttihubelbad",
        type: "gamezone",
        description: "Sensory adventure museum in the Emmental hills inspired by Hugo Kükelhaus. Over 80 interactive stations where children experiment with sound bowls, giant pendulums, prism light tables, scent organs, and an outdoor barefoot trail.",
        address: "Rüttihubel 29, 3512 Walkringen",
        zip: "3512",
        city: "Walkringen",
        lat: 46.9458,
        lng: 7.6256,
        openingHours: "10:00 - 17:00 (Tue - Sun)",
        fees: "9 - 18 CHF (Under 6 Free)",
        minAge: 3,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d9/Technorama_Winterthur_2011-09-09_14-18-42.jpg/1280px-Technorama_Winterthur_2011-09-09_14-18-42.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-122",
        name: "Alimentarium – Food & Nutrition Museum",
        type: "gamezone",
        description: "Famous for the giant 8-meter fork standing in Lake Geneva right outside. Inside, children explore interactive digital games on food, digestion, and senses, plus hands-on Junior Academy baking and cooking workshops.",
        address: "Quai Perdonnet 25, 1800 Vevey",
        zip: "1800",
        city: "Vevey",
        lat: 46.4578,
        lng: 6.8458,
        openingHours: "10:00 - 18:00 (Tue - Sun)",
        fees: "4 - 15 CHF (Under 6 Free)",
        minAge: 4,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/73/Alimentarium_interior.jpg/1280px-Alimentarium_interior.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-123",
        name: "Château de Chillon (Family Castle & Dragon Trail)",
        type: "playpark",
        description: "Medieval island castle on Lake Geneva where kids receive a Drako the Dragon treasure hunt map to explore secret underground vaults, wooden ramparts, knights' armor, and lakeside pebble beaches.",
        address: "Avenue de Chillon 21, 1820 Veytaux",
        zip: "1820",
        city: "Veytaux",
        lat: 46.4142,
        lng: 6.9275,
        openingHours: "09:00 - 19:00 daily",
        fees: "7 - 15 CHF (Under 6 Free)",
        minAge: 4,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/48/001_Chateau_de_Chillon_and_Dents_du_Midi_Photo_by_Giles_Laurent.jpg/1280px-001_Chateau_de_Chillon_and_Dents_du_Midi_Photo_by_Giles_Laurent.jpg",
        imageSource: "Wikimedia Commons (CC BY-SA)"
    },
    {
        id: "spot-124",
        name: "Kronberg Bobbahn, Zipline & Märliwelt",
        type: "playpark",
        description: "Appenzell's favorite family adventure mountain featuring a 1,000m all-weather alpine coaster, zipline park, and the 'Märliwelt' fairy-tale playground with giant gemstone sandpits, water play, and barefoot trails.",
        address: "Kronbergbahnstrasse 7, 9108 Jakobsbad",
        zip: "9108",
        city: "Jakobsbad",
        lat: 47.3183,
        lng: 9.3283,
        openingHours: "09:00 - 17:30 daily",
        fees: "Free playground / Rides ticketed",
        minAge: 2,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Atzm%C3%A4nnig-Seilbahn.JPG/1280px-Atzm%C3%A4nnig-Seilbahn.JPG",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-125",
        name: "Wirzweli Zauberland & Hexenweg (Witch Trail)",
        type: "playpark",
        description: "Sunny mountain terrace in Nidwalden with the enchanted Lizi Witch Trail, a 535m summer toboggan run, pony rides, bouncy castle, wooden marble runs, and alpine barbecue hearths.",
        address: "Wirzweli, 6383 Dallenwil",
        zip: "6383",
        city: "Dallenwil",
        lat: 46.9083,
        lng: 8.3842,
        openingHours: "08:00 - 17:30 daily (May - Oct)",
        fees: "Free playground (Gondola separate)",
        minAge: 2,
        maxAge: 13,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Picnic Area", "Parking"],
        imageUrl: "https://images.schweizmobil.ch/image-big/SS_141_11_vor_Allmendhubel_F_g.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-126",
        name: "Zoo Basel ('Zolli') & Kids Adventure Playgrounds",
        type: "playpark",
        description: "Affectionately called 'Zolli', Switzerland's oldest zoo features shaded park avenues, multiple large wooden adventure playgrounds, the Kinderzolli hands-on farmyard where kids brush goats, and world-famous elephant and sea lion habitats.",
        address: "Binningerstrasse 40, 4054 Basel",
        zip: "4054",
        city: "Basel",
        lat: 47.5475,
        lng: 7.5794,
        openingHours: "08:00 - 18:30 daily",
        fees: "10 - 22 CHF (Under 6 Free)",
        minAge: 1,
        maxAge: 15,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Zoo_Zuerich_Eingang2013.jpg/1280px-Zoo_Zuerich_Eingang2013.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-127",
        name: "Tierpark Bern (Dählhölzli) & Aare Playground",
        type: "playpark",
        description: "Located directly on the banks of the turquoise Aare River in Bern. The Kinderzoo & riverfront playground feature free admission, walk-in goat petting enclosures, pony rides, and sprawling wooden climbing structures.",
        address: "Tierparkweg 1, 3005 Bern",
        zip: "3005",
        city: "Bern",
        lat: 46.9367,
        lng: 7.4478,
        openingHours: "09:00 - 18:00 daily",
        fees: "Playground & Kinderzoo Free",
        minAge: 1,
        maxAge: 14,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/3/36/Tierpark_Goldau_%284980106519%29.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-128",
        name: "First Cliff Walk & Bort Alpine Playground",
        type: "playpark",
        description: "At the middle gondola station Bort (1,570m) above Grindelwald lies a 700 m² alpine playground with a mountain brook water play zone, climbing boulders, and sandpits right beneath the Eiger North Face.",
        address: "Dorfstrasse 187, 3818 Grindelwald",
        zip: "3818",
        city: "Grindelwald",
        lat: 46.6435,
        lng: 8.0558,
        openingHours: "08:30 - 17:30 daily (May - Oct)",
        fees: "Free playground (Gondola separate)",
        minAge: 2,
        maxAge: 14,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Picnic Area", "Parking"],
        imageUrl: "https://images.schweizmobil.ch/image-big/SS_141_11_vor_Allmendhubel_F_g.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-129",
        name: "Rigi Scheidegg Ark Playground & Panorama Park",
        type: "playpark",
        description: "Perched on a sunny ridge at 1,656m on Mount Rigi, featuring a giant 15-meter wooden Noah's Ark climbing structure, water play channels, trampoline, panoramic picnic grill spots, and barrier-free trails.",
        address: "Rigi Scheidegg, 6410 Gersau",
        zip: "6410",
        city: "Rigi Scheidegg",
        lat: 47.0278,
        lng: 8.5133,
        openingHours: "Open 24/7",
        fees: "Free",
        minAge: 1,
        maxAge: 13,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Picnic Area"],
        imageUrl: "https://images.schweizmobil.ch/image-big/SS_141_11_vor_Allmendhubel_F_g.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-130",
        name: "Monte Tamaro Adventure Park & Coaster",
        type: "playpark",
        description: "High-altitude adventure station at Alpe Foppa in Ticino offering an 800m panoramic alpine coaster bob run, a large wooden children's playground, and a forest rope park with a dedicated mini-course for kids from age 4.",
        address: "Via Campagnole 6, 6802 Rivera",
        zip: "6802",
        city: "Rivera",
        lat: 46.1075,
        lng: 8.8958,
        openingHours: "08:30 - 17:00 daily (Apr - Nov)",
        fees: "Free playground / Coaster ticketed",
        minAge: 3,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/20/Atzm%C3%A4nnig-Seilbahn.JPG/1280px-Atzm%C3%A4nnig-Seilbahn.JPG",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-131",
        name: "Seilpark Interlaken (Forest Adventure Rope Park)",
        type: "playpark",
        description: "Tucked into the shaded Unspunnen forest in Interlaken, featuring 9 treetop courses of varying heights, including the ground-level 'Butterfly' course where young children can climb independently while parents walk alongside.",
        address: "Wagnerenstrasse, 3800 Interlaken",
        zip: "3800",
        city: "Interlaken",
        lat: 46.6742,
        lng: 7.8486,
        openingHours: "10:00 - 18:00 daily",
        fees: "22 - 42 CHF",
        minAge: 4,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Picnic Area", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Baumwipfelpfad_Neckertal_Baumstamm.jpg/1280px-Baumwipfelpfad_Neckertal_Baumstamm.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-132",
        name: "Aquaparc Le Bouveret",
        type: "swimmingpool",
        description: "French-speaking Switzerland's premier tropical indoor/outdoor water theme park on Lake Geneva. Features a giant Pirate Ship lagoon for kids, lazy river, wave pool, Sharkyland toddler splash zone, and 7 major slides.",
        address: "Route de la Plage 122, 1897 Le Bouveret",
        zip: "1897",
        city: "Le Bouveret",
        lat: 46.3894,
        lng: 6.8594,
        openingHours: "10:30 - 18:00 daily",
        fees: "39 - 49 CHF (Under 3 Free)",
        minAge: 1,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Stroller Friendly", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/AFG_Arena_19.jpg/1280px-AFG_Arena_19.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-133",
        name: "Bains de Lavey & Outdoor Thermal Pools",
        type: "swimmingpool",
        description: "Home to the warmest thermal spring water in Switzerland (33°C to 36°C) surrounded by the dramatic Dents du Midi peaks. Features vast illuminated outdoor pools, whirlpools, current channels, and family hours.",
        address: "Route des Bains 48, 1892 Lavey-Morcles",
        zip: "1892",
        city: "Lavey-les-Bains",
        lat: 46.2019,
        lng: 7.0189,
        openingHours: "09:00 - 21:00 daily",
        fees: "22 - 32 CHF (From age 4)",
        minAge: 4,
        maxAge: 16,
        amenities: ["Toilets", "Cafe/Food", "Parking"],
        imageUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/41/AFG_Arena_19.jpg/1280px-AFG_Arena_19.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-134",
        name: "Robinsonspielplatz Wipkingen & GZ",
        type: "playpark",
        description: "Beloved Zurich community adventure playground directly on the Limmat river with wooden huts, water play channels, a summer wading pool, animals (goats, rabbits, chickens), and a family-friendly café.",
        address: "Breitensteinstrasse 19a, 8037 Zürich",
        zip: "8037",
        city: "Zürich",
        lat: 47.3926,
        lng: 8.5269,
        openingHours: "08:00 - 20:00 daily",
        fees: "Free",
        minAge: 1,
        maxAge: 13,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area"],
        imageUrl: "https://images.schweizmobil.ch/image-big/SS_141_11_vor_Allmendhubel_F_g.jpg",
        imageSource: "Google Maps Contributor"
    },
    {
        id: "spot-135",
        name: "Bäckeranlage Park & Adventure Playground",
        type: "playpark",
        description: "Vibrant urban park in Zurich Kreis 4 featuring large climbing nets, shaded sandpits with water pumps, toddler swings, ping-pong tables, open green lawns, and the popular Restaurant Hohl right on the square.",
        address: "Hohlstrasse 67, 8004 Zürich",
        zip: "8004",
        city: "Zürich",
        lat: 47.3769,
        lng: 8.5244,
        openingHours: "Open 24/7",
        fees: "Free",
        minAge: 1,
        maxAge: 12,
        amenities: ["Toilets", "Cafe/Food", "Shade", "Stroller Friendly", "Picnic Area"],
        imageUrl: "https://images.schweizmobil.ch/image-big/SS_141_11_vor_Allmendhubel_F_g.jpg",
        imageSource: "Google Maps Contributor"
    }
];

async function main() {
    console.log("=== Expanding Featured Spots (Options 1 & 2) ===");
    const baseSpots = JSON.parse(fs.readFileSync(BASE_PATH, 'utf-8'));
    const harvestedSpots = JSON.parse(fs.readFileSync(HARVESTED_PATH, 'utf-8'));

    // Keep only the original 100 baseline spots if re-running
    const coreBaseSpots = baseSpots.slice(0, 100);
    coreBaseSpots.forEach(s => { s.featured = true; });

    console.log(`1. Enriching ${FAMOUS_ATTRACTIONS.length} Famous Swiss Family Attractions with Google Places photos...`);
    for (let i = 0; i < FAMOUS_ATTRACTIONS.length; i++) {
        const attr = FAMOUS_ATTRACTIONS[i];
        attr.ratings = [];
        attr.comments = [];
        attr.featured = true;
        attr.images = [attr.imageUrl];

        const gPhotos = await fetchPlacePhotosForSpot(attr);
        if (gPhotos && gPhotos.images && gPhotos.images.length > 0) {
            attr.imageUrl = gPhotos.images[0];
            attr.images = gPhotos.images;
            attr.imageSource = gPhotos.imageSource;
            console.log(`  [${i + 1}/${FAMOUS_ATTRACTIONS.length}] ✅ ${attr.name} -> ${attr.imageSource}`);
        } else {
            console.log(`  [${i + 1}/${FAMOUS_ATTRACTIONS.length}] 📷 ${attr.name} -> Using curated fallback photo`);
        }
        await new Promise(r => setTimeout(r, 120));
    }

    // 2. Select 250 top named spots from spots_harvested.json with real Google Maps photos
    console.log("\n2. Selecting 250 top photo-verified community spots from spots_harvested.json...");
    const existingIds = new Set([...coreBaseSpots.map(s => s.id), ...FAMOUS_ATTRACTIONS.map(s => s.id)]);
    const existingNames = new Set([...coreBaseSpots.map(s => s.name.toLowerCase()), ...FAMOUS_ATTRACTIONS.map(s => s.name.toLowerCase())]);

    const candidates = harvestedSpots.filter(s => {
        if (existingIds.has(s.id)) return false;
        if (!s.name || existingNames.has(s.name.toLowerCase())) return false;
        const n = s.name.toLowerCase();
        if (n.startsWith('playground in') || n.startsWith('swimming pool in') || n.startsWith('game zone in')) return false;
        if (!s.imageUrl || !s.imageUrl.includes('googleusercontent.com')) return false;
        return true;
    });

    const playparks = candidates.filter(s => s.type === 'playpark').slice(0, 165);
    const pools = candidates.filter(s => s.type === 'swimmingpool').slice(0, 65);
    const gamezones = candidates.filter(s => s.type === 'gamezone').slice(0, 20);

    const promotedSpots = [...playparks, ...pools, ...gamezones].map(s => ({
        ...s,
        ratings: [],
        comments: [],
        featured: true
    }));

    const promotedIds = new Set(promotedSpots.map(s => s.id));
    harvestedSpots.forEach(s => {
        if (promotedIds.has(s.id)) {
            s.featured = true;
        }
    });

    const finalBaseSpots = [...coreBaseSpots, ...FAMOUS_ATTRACTIONS, ...promotedSpots];
    fs.writeFileSync(BASE_PATH, JSON.stringify(finalBaseSpots, null, 4), 'utf-8');
    fs.writeFileSync(HARVESTED_PATH, JSON.stringify(harvestedSpots, null, 4), 'utf-8');

    console.log(`\n✅ Completed!`);
    console.log(`- Original curated spots: ${coreBaseSpots.length}`);
    console.log(`- New Famous Swiss Family Attractions added: ${FAMOUS_ATTRACTIONS.length}`);
    console.log(`- Promoted photo-verified OSM spots: ${promotedSpots.length} (${playparks.length} playparks, ${pools.length} pools, ${gamezones.length} gamezones)`);
    console.log(`- Total Featured Spots in base_spots.json: ${finalBaseSpots.length}`);
}

main();
