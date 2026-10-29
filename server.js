const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Determine persistent data directory (default to public dir, but support persistent disk on Render/Railway)
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/opt/render/project/src/data') ? '/opt/render/project/src/data' : PUBLIC_DIR);

const harvestedPath = path.join(DATA_DIR, 'spots_harvested.json');
const groupCheckinsPath = path.join(DATA_DIR, 'group_checkins.json');

function loadGroupCheckins() {
    if (fs.existsSync(groupCheckinsPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(groupCheckinsPath, 'utf-8'));
            if (data && typeof data === 'object' && data.groups) return data;
        } catch (e) {
            console.error('Error reading group_checkins.json:', e);
        }
    }
    return { groups: {} };
}

function saveGroupCheckins(data) {
    try {
        fs.writeFileSync(groupCheckinsPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error writing group_checkins.json:', e);
    }
}

// Ensure spots_harvested.json in DATA_DIR is up-to-date with repo version
const repoHarvestedPath = path.join(PUBLIC_DIR, 'spots_harvested.json');
if (DATA_DIR !== PUBLIC_DIR) {
    let shouldCopy = false;
    if (!fs.existsSync(harvestedPath)) {
        shouldCopy = true;
    } else if (fs.existsSync(repoHarvestedPath)) {
        try {
            const repoSpots = JSON.parse(fs.readFileSync(repoHarvestedPath, 'utf-8'));
            const liveSpots = JSON.parse(fs.readFileSync(harvestedPath, 'utf-8'));
            if (repoSpots.length > liveSpots.length) {
                console.log(`[Startup] Repo version has more spots (${repoSpots.length}) than persistent volume version (${liveSpots.length}). Overwriting persistent volume.`);
                shouldCopy = true;
            }
        } catch (e) {
            console.warn('[Startup] Failed to compare spots length:', e);
            shouldCopy = true; // Fallback to copy if file is corrupted
        }
    }

    if (shouldCopy && fs.existsSync(repoHarvestedPath)) {
        try {
            fs.copyFileSync(repoHarvestedPath, harvestedPath);
            console.log(`[Startup] Copied spots_harvested.json to persistent volume: ${harvestedPath}`);
        } catch (e) {
            console.error('Failed to copy spots_harvested.json on startup:', e);
        }
    }
}

const transportCache = {};

// Helper to validate image URLs (including strict safety keywords)
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const badKeywords = [
        'adsystem', 'analytics', 'pixel', 'tracker', 'adserver', 'advertisement', 'doubleclick', 'telemetry', 'statcounter',
        'porn', 'nude', 'naked', 'sexy', 'adult', 'erotic', 'nsfw', 'xxx', 'boobs', 'sex', 'lingerie', 'playboy', 'sensual',
        'girls', 'model', 'bikini', 'nackt', 'nackte', 'nude-photo', 'strip', 'nudephoto', 'playmate',
        'badi-info'
    ];
    for (const kw of badKeywords) {
        if (url.toLowerCase().includes(kw)) return false;
    }
    if (!url.startsWith('https://')) return false;
    const lower = url.toLowerCase();
    const hasImageExt = lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp') || lower.includes('.gif');
    if (!hasImageExt && !lower.includes('unsplash.com') && !lower.includes('static')) {
        return false;
    }
    return true;
}

// Database Migration / Data Cleansing: Remove mis-tagged or inappropriate spots and scrub unsafe images
if (fs.existsSync(harvestedPath)) {
    try {
        const data = fs.readFileSync(harvestedPath, 'utf-8');
        let spots = JSON.parse(data);
        const originalLength = spots.length;
        
        // Note: Exclusions are handled at harvest time via robust coordinate checks in fetch_osm_spots.js.
        
        // Scan and scrub any existing inappropriate or bad image URLs in database
        let scrubbedCount = 0;
        for (let i = 0; i < spots.length; i++) {
            const spot = spots[i];
            let needsScrub = false;
            
            // Check main image
            if (spot.imageUrl && !isValidImageUrl(spot.imageUrl)) {
                needsScrub = true;
            }
            // Check gallery images
            if (spot.images && spot.images.length > 0) {
                for (const img of spot.images) {
                    if (!isValidImageUrl(img)) {
                        needsScrub = true;
                        break;
                    }
                }
            }
            
            if (needsScrub) {
                // Reset to clean default placeholder
                const defaultImg = spot.type === 'playpark' 
                    ? "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80"
                    : (spot.type === 'gamezone'
                        ? "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=600&auto=format&fit=crop&q=80"
                        : "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80");
                        
                spots[i].imageUrl = defaultImg;
                spots[i].images = [defaultImg];
                scrubbedCount++;
            }
        }
        
        if (spots.length !== originalLength || scrubbedCount > 0) {
            fs.writeFileSync(harvestedPath, JSON.stringify(spots, null, 4), 'utf-8');
            console.log(`[Migration] Cleaned up database: removed ${originalLength - spots.length} invalid spots. Scrubbed ${scrubbedCount} spots containing unsafe or invalid images.`);
        }
    } catch (e) {
        console.error('[Migration] Failed to cleanse/scrub spots_harvested.json:', e);
    }
}

// Helper to verify if a scraped image matches the category type
function isImageRelevant(meta, type) {
    if (!meta) return false;
    const textToSearch = [
        meta.t || '',
        meta.desc || '',
        meta.murl || '',
        meta.purl || ''
    ].join(' ').toLowerCase();

    // Blacklist to reject clinical/medical, diagrams, maps, and logos
    const blacklist = [
        'spital', 'hospital', 'klinik', 'surgery', 'operation', 'medical', 'doctor', 'arzt',
        'dentist', 'zahnarzt', 'patient', 'therapie', 'rehab', 'treatment', 'medical center',
        'clinic', 'op-saal', 'op ', 'operationstisch', 'operationssaal', 'krankenhaus',
        'karte', 'map', 'blueprint', 'floor plan', 'grundriss', 'diagram', 'logo', 'flyer',
        'poster', 'document', 'formular'
    ];
    for (const term of blacklist) {
        if (textToSearch.includes(term)) {
            return false;
        }
    }

    // Define keywords for relevance checks (German and English)
    let keywords = [];
    if (type === 'playpark') {
        keywords = [
            'playpark', 'playground', 'spielplatz', 'slide', 'swing', 'climbing', 'park', 
            'spiel', 'kinder', 'rutsche', 'schaukel', 'sandkasten', 'play', 'outdoor', 
            'climb', 'toy', 'fun', 'spass', 'geräte', 'seilbahn', 'wiese', 'turnen'
        ];
    } else if (type === 'swimmingpool') {
        keywords = [
            'swimming', 'pool', 'swim', 'badi', 'hallenbad', 'freibad', 'wasser', 'bad', 
            'schwimmbad', 'strandbad', 'lido', 'bathing', 'water', 'slide', 'rutsche', 
            'becken', 'schwimmen', 'planschbecken'
        ];
    } else if (type === 'gamezone') {
        keywords = [
            'gamezone', 'game', 'arcade', 'play', 'indoor', 'center', 'laser', 'bowling', 
            'billiard', 'pinball', 'fun', 'spiel', 'gaming', 'arcade', 'spielhalle', 'zocken'
        ];
    } else {
        return true; // fallback
    }

    for (const kw of keywords) {
        if (textToSearch.includes(kw)) {
            return true;
        }
    }
    return false;
}

// Helper to fetch images from Bing
function fetchBingImages(query, type) {
    return new Promise((resolve) => {
        const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&adlt=strict`;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        };
        https.get(url, options, (res) => {
            let html = '';
            res.on('data', (chunk) => html += chunk);
            res.on('end', () => {
                const regex = /m="([^"]+)"/g;
                const matches = new Set();
                let match;
                while ((match = regex.exec(html)) !== null) {
                    try {
                        const jsonStr = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#183;/g, '-');
                        const meta = JSON.parse(jsonStr);
                        const imgUrl = meta.murl;
                        if (isValidImageUrl(imgUrl) && isImageRelevant(meta, type)) {
                            matches.add(imgUrl);
                        }
                    } catch (e) {
                        // ignore malformed metadata
                    }
                    if (matches.size >= 4) break;
                }
                resolve(Array.from(matches));
            });
        }).on('error', (e) => {
            console.warn(`[API Network Error] Failed to search for "${query}": ${e.message}`);
            resolve([]);
        });
    });
}

const server = http.createServer(async (req, res) => {
    // Enable CORS for frontend API calls
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
    const pathname = parsedUrl.pathname;

    // API Endpoint: Swiss Public Transport (SBB / transport.opendata.ch) Proxy with 10-min in-memory cache
    if (pathname === '/api/transport/connections') {
        const from = parsedUrl.searchParams.get('from');
        const to = parsedUrl.searchParams.get('to');
        const date = parsedUrl.searchParams.get('date') || '';
        const time = parsedUrl.searchParams.get('time') || '';
        const limit = parsedUrl.searchParams.get('limit') || '3';
        const isArrivalTime = parsedUrl.searchParams.get('isArrivalTime') || '1';

        if (!from || !to) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ error: 'Missing from or to parameter' }));
        }

        const cacheKey = `${from}__${to}__${date}__${time}__${limit}__${isArrivalTime}`;
        if (transportCache[cacheKey] && (Date.now() - transportCache[cacheKey].timestamp < 600000)) {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=600'
            });
            return res.end(JSON.stringify(transportCache[cacheKey].data));
        }

        let targetUrl = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${encodeURIComponent(limit)}&isArrivalTime=${encodeURIComponent(isArrivalTime)}`;
        if (date) targetUrl += `&date=${encodeURIComponent(date)}`;
        if (time) targetUrl += `&time=${encodeURIComponent(time)}`;

        https.get(targetUrl, (apiRes) => {
            let data = '';
            apiRes.on('data', chunk => data += chunk);
            apiRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    transportCache[cacheKey] = { timestamp: Date.now(), data: parsed };
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=600'
                    });
                    res.end(JSON.stringify(parsed));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ error: 'Failed to parse SBB response' }));
                }
            });
        }).on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Failed to contact SBB transport API', details: err.message }));
        });
        return;
    }

    // API Endpoint: Mountain Lift Timetable & Last Descent Intelligence
    if (pathname === '/api/transport/mountain-lift') {
        const valley = parsedUrl.searchParams.get('valley');
        const mountain = parsedUrl.searchParams.get('mountain');
        const date = parsedUrl.searchParams.get('date') || '';

        if (!valley || !mountain) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ error: 'Missing valley or mountain parameter' }));
        }

        const cacheKey = `lift__${valley}__${mountain}__${date}`;
        if (transportCache[cacheKey] && (Date.now() - transportCache[cacheKey].timestamp < 3600000)) {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600'
            });
            return res.end(JSON.stringify(transportCache[cacheKey].data));
        }

        const fetchJson = (url) => new Promise((resolve, reject) => {
            https.get(url, (apiRes) => {
                let data = '';
                apiRes.on('data', chunk => data += chunk);
                apiRes.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch(e) { resolve({}); }
                });
            }).on('error', reject);
        });

        try {
            const ascUrl = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(valley)}&to=${encodeURIComponent(mountain)}&date=${encodeURIComponent(date)}&time=07:00&limit=3`;
            const descUrl = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(mountain)}&to=${encodeURIComponent(valley)}&date=${encodeURIComponent(date)}&time=16:30&limit=6`;

            const [ascData, descData] = await Promise.all([
                fetchJson(ascUrl).catch(() => ({})),
                fetchJson(descUrl).catch(() => ({}))
            ]);

            const firstAscent = ascData.connections?.[0]?.from?.departure?.slice(11, 16) || '07:30';
            let frequency = 'Every 15–30 min';
            if (ascData.connections && ascData.connections.length >= 2) {
                const dep0 = ascData.connections[0].from.departure.slice(11, 16).split(':').map(Number);
                const dep1 = ascData.connections[1].from.departure.slice(11, 16).split(':').map(Number);
                const diff = (dep1[0] * 60 + dep1[1]) - (dep0[0] * 60 + dep0[1]);
                if (diff > 0 && diff <= 60) frequency = `Every ${diff} min`;
            }

            let lastDescent = '17:00';
            let nextDayJump = false;
            if (descData.connections && descData.connections.length > 0) {
                const conns = descData.connections;
                const baseDate = conns[0].from.departure ? conns[0].from.departure.slice(0, 10) : '';
                for (let i = 1; i < conns.length; i++) {
                    const cDate = conns[i].from.departure ? conns[i].from.departure.slice(0, 10) : '';
                    const prevTime = conns[i - 1].from.departure ? conns[i - 1].from.departure.slice(11, 16) : '';
                    const currTime = conns[i].from.departure ? conns[i].from.departure.slice(11, 16) : '';
                    
                    // Next day jump if date changes OR departure time drops (e.g. 17:15 -> 07:30)
                    if ((baseDate && cDate && cDate !== baseDate) || (prevTime && currTime && currTime < prevTime)) {
                        lastDescent = prevTime;
                        nextDayJump = true;
                        break;
                    }
                }
                if (!nextDayJump) {
                    lastDescent = conns[conns.length - 1].from.departure.slice(11, 16);
                }
            }

            const payload = {
                valley,
                mountain,
                date,
                firstAscent,
                frequency,
                lastDescent,
                nextDayJump,
                advisory: `Aim to reach ${mountain} station at least 20 minutes before ${lastDescent} to guarantee boarding.`
            };

            transportCache[cacheKey] = { timestamp: Date.now(), data: payload };
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600'
            });
            return res.end(JSON.stringify(payload));
        } catch(err) {
            console.error('Mountain lift fetch error:', err);
            res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ error: 'Failed to fetch mountain lift schedule' }));
        }
    }

    // API Endpoint: Dynamic GPX Route Track for Swisstopo App and Web Viewers
    if (pathname.startsWith('/api/hikes/') && pathname.endsWith('/track.gpx')) {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*'
            });
            return res.end();
        }

        const hikeId = decodeURIComponent(pathname.replace('/api/hikes/', '').replace('/track.gpx', ''));
        const hikesFilePath = path.join(__dirname, 'hikes.json');
        let hike = null;
        if (fs.existsSync(hikesFilePath)) {
            try {
                const allHikes = JSON.parse(fs.readFileSync(hikesFilePath, 'utf-8'));
                hike = allHikes.find(h => h.id === hikeId);
            } catch (e) {
                console.error('Error reading hikes.json for GPX export:', e);
            }
        }
        if (!hike) {
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            return res.end('Hike not found');
        }

        const escapeXml = (unsafe) => {
            if (!unsafe) return '';
            return String(unsafe).replace(/[<>&'"]/g, c => {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case '\'': return '&apos;';
                    case '"': return '&quot;';
                }
            });
        };

        const coords = (hike.coordinates && hike.coordinates.length > 0) ? hike.coordinates : [[hike.lat, hike.lng]];
        const eleProf = hike.elevationProfile || [];
        const startCoord = coords[0] || [hike.lat, hike.lng];
        const endCoord = coords[coords.length - 1] || [hike.lat, hike.lng];

        const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SwissKidsSpots - https://swissforkids.ch" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(hike.name)}</name>
    <desc>${escapeXml(hike.description || hike.name)}</desc>
    <author><name>swisstopo / SchweizMobil / SwissKidsSpots</name></author>
  </metadata>
  <wpt lat="${startCoord[0]}" lon="${startCoord[1]}">
    <ele>${eleProf[0] ? eleProf[0].ele : (hike.minElevationM || 500)}</ele>
    <name>Start: ${escapeXml(hike.startStop || hike.name)}</name>
  </wpt>
  <wpt lat="${endCoord[0]}" lon="${endCoord[1]}">
    <ele>${eleProf[eleProf.length - 1] ? eleProf[eleProf.length - 1].ele : (hike.maxElevationM || 500)}</ele>
    <name>Finish: ${escapeXml(hike.endStop || hike.name)}</name>
  </wpt>
  <trk>
    <name>${escapeXml(hike.name)}</name>
    <type>${hike.isWinterTrail ? 5 : 0}</type>
    <trkseg>
${coords.map((pt, i) => {
    const ele = (eleProf[i] && eleProf[i].ele) ? eleProf[i].ele : (hike.minElevationM || 500);
    return `      <trkpt lat="${pt[0]}" lon="${pt[1]}"><ele>${ele}</ele></trkpt>`;
}).join('\n')}
    </trkseg>
  </trk>
</gpx>`;

        res.writeHead(200, {
            'Content-Type': 'application/gpx+xml; charset=utf-8',
            'Content-Disposition': `inline; filename="${hike.id}.gpx"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'public, max-age=86400'
        });
        return res.end(gpxXml);
    }

    // API Endpoint: Dynamic KML Route Track for Swisstopo Web and Google Earth Viewers
    if (pathname.startsWith('/api/hikes/') && pathname.endsWith('/track.kml')) {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*'
            });
            return res.end();
        }

        const hikeId = decodeURIComponent(pathname.replace('/api/hikes/', '').replace('/track.kml', ''));
        const hikesFilePath = path.join(__dirname, 'hikes.json');
        let hike = null;
        if (fs.existsSync(hikesFilePath)) {
            try {
                const allHikes = JSON.parse(fs.readFileSync(hikesFilePath, 'utf-8'));
                hike = allHikes.find(h => h.id === hikeId);
            } catch (e) {
                console.error('Error reading hikes.json for KML export:', e);
            }
        }
        if (!hike) {
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            return res.end('Hike not found');
        }

        const escapeXml = (unsafe) => {
            if (!unsafe) return '';
            return String(unsafe).replace(/[<>&'"]/g, c => {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case '\'': return '&apos;';
                    case '"': return '&quot;';
                }
            });
        };

        const coords = (hike.coordinates && hike.coordinates.length > 0) ? hike.coordinates : [[hike.lat, hike.lng]];
        const eleProf = hike.elevationProfile || [];
        const startCoord = coords[0] || [hike.lat, hike.lng];
        const endCoord = coords[coords.length - 1] || [hike.lat, hike.lng];

        const kmlCoordString = coords.map((pt, i) => {
            const ele = (eleProf[i] && eleProf[i].ele) ? eleProf[i].ele : (hike.minElevationM || 500);
            return `${pt[1]},${pt[0]},${ele}`;
        }).join(' ');

        const kmlXml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(hike.name)}</name>
    <description>${escapeXml(hike.description || hike.name)}</description>
    <Style id="trailLine">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Start: ${escapeXml(hike.startStop || hike.name)}</name>
      <Point>
        <coordinates>${startCoord[1]},${startCoord[0]},${eleProf[0] ? eleProf[0].ele : (hike.minElevationM || 500)}</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>Finish: ${escapeXml(hike.endStop || hike.name)}</name>
      <Point>
        <coordinates>${endCoord[1]},${endCoord[0]},${eleProf[eleProf.length - 1] ? eleProf[eleProf.length - 1].ele : (hike.maxElevationM || 500)}</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <name>${escapeXml(hike.name)}</name>
      <styleUrl>#trailLine</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>${kmlCoordString}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

        res.writeHead(200, {
            'Content-Type': 'application/vnd.google-earth.kml+xml; charset=utf-8',
            'Content-Disposition': `inline; filename="${hike.id}.kml"`,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'public, max-age=86400'
        });
        return res.end(kmlXml);
    }

    // API Endpoint: Swiss Kids & Family Events
    if (pathname === '/api/events') {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*'
            });
            return res.end();
        }

        const eventsFilePath = path.join(__dirname, 'events.json');
        let events = [];
        if (fs.existsSync(eventsFilePath)) {
            try {
                events = JSON.parse(fs.readFileSync(eventsFilePath, 'utf-8'));
            } catch (e) {
                console.error('Error reading events.json:', e);
            }
        }

        // Optional query filtering
        const cantonFilter = parsedUrl.searchParams.get('canton') ? parsedUrl.searchParams.get('canton').trim().toUpperCase() : null;
        const categoryFilter = parsedUrl.searchParams.get('category') ? parsedUrl.searchParams.get('category').trim().toLowerCase() : null;
        const weatherFilter = parsedUrl.searchParams.get('weather') ? parsedUrl.searchParams.get('weather').trim().toLowerCase() : null;

        let filtered = events;
        if (cantonFilter && cantonFilter !== 'ALL') {
            filtered = filtered.filter(ev => ev.canton === cantonFilter);
        }
        if (categoryFilter) {
            filtered = filtered.filter(ev => ev.category === categoryFilter);
        }
        if (weatherFilter === 'indoor') {
            filtered = filtered.filter(ev => ev.isRainyDayFriendly === true);
        } else if (weatherFilter === 'outdoor') {
            filtered = filtered.filter(ev => ev.isRainyDayFriendly === false);
        }

        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
        });
        return res.end(JSON.stringify(filtered));
    }

    // API Endpoint: General Feedback Form
    if (pathname === '/api/feedback' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                if (!data.type || !data.comments || typeof data.rating === 'undefined') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing required feedback fields' }));
                    return;
                }

                const feedbackFilePath = path.join(DATA_DIR, 'feedback.json');
                let allFeedback = [];
                if (fs.existsSync(feedbackFilePath)) {
                    try {
                        allFeedback = JSON.parse(fs.readFileSync(feedbackFilePath, 'utf-8'));
                    } catch (e) {
                        console.error('Error reading feedback.json:', e);
                    }
                }
                
                const feedbackEntry = {
                    id: `feedback-${Date.now()}`,
                    name: data.name || 'Anonymous',
                    email: data.email || '',
                    type: data.type,
                    rating: data.rating,
                    comments: data.comments,
                    timestamp: new Date().toISOString()
                };

                allFeedback.push(feedbackEntry);
                fs.writeFileSync(feedbackFilePath, JSON.stringify(allFeedback, null, 4), 'utf-8');
                console.log(`[Feedback] Received feedback entry ${feedbackEntry.id}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, entry: feedbackEntry }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to process feedback' }));
            }
        });
        return;
    }

    // API Endpoint: Group Hike Live Radar & Milestone Check-Ins
    if (pathname.startsWith('/api/group/')) {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            return res.end();
        }

        const pathWithoutPrefix = pathname.replace(/^\/api\/group\/?/, '');
        const parts = pathWithoutPrefix.split('/').filter(Boolean);
        const groupId = decodeURIComponent(parts[0] || 'default').trim();
        const action = (parts[1] || 'state').toLowerCase();

        const store = loadGroupCheckins();
        if (!store.groups) store.groups = {};
        if (!store.groups[groupId]) {
            store.groups[groupId] = {
                groupId,
                spotId: '',
                date: '',
                checkins: [],
                pings: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }
        const group = store.groups[groupId];

        if (req.method === 'GET' && action === 'state') {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            return res.end(JSON.stringify({ success: true, group }));
        }

        if (req.method === 'POST' && action === 'checkin') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const memberName = (data.memberName || 'Family Member').trim().slice(0, 50);
                    const milestoneId = (data.milestoneId || 'm0').trim();
                    const milestoneTitle = (data.milestoneTitle || 'Milestone').trim().slice(0, 100);
                    const note = (data.note || '').trim().slice(0, 200);
                    const spotId = (data.spotId || '').trim();
                    if (spotId && !group.spotId) group.spotId = spotId;

                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
                    const timestamp = data.timestamp || Date.now();

                    const entry = {
                        id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        memberName,
                        milestoneId,
                        milestoneTitle,
                        note,
                        timestamp,
                        timeStr
                    };

                    const existingIdx = group.checkins.findIndex(c => c.memberName.toLowerCase() === memberName.toLowerCase() && c.milestoneId === milestoneId);
                    if (existingIdx !== -1) {
                        group.checkins[existingIdx] = entry;
                    } else {
                        group.checkins.push(entry);
                    }

                    group.updatedAt = now.toISOString();
                    saveGroupCheckins(store);
                    console.log(`[Group Radar] Check-in for group ${groupId}: ${memberName} @ ${milestoneId} ("${milestoneTitle}") [${timeStr}]`);

                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    return res.end(JSON.stringify({ success: true, group, entry }));
                } catch (e) {
                    console.error('[Group Radar] Error processing checkin:', e);
                    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    return res.end(JSON.stringify({ error: 'Failed to record checkin' }));
                }
            });
            return;
        }

        if (req.method === 'POST' && action === 'ping') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const memberName = (data.memberName || 'Family Member').trim().slice(0, 50);
                    const lat = parseFloat(data.lat);
                    const lng = parseFloat(data.lng);
                    const note = (data.note || 'Active on trail').trim().slice(0, 200);
                    const spotId = (data.spotId || '').trim();
                    if (spotId && !group.spotId) group.spotId = spotId;

                    if (isNaN(lat) || isNaN(lng)) {
                        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                        return res.end(JSON.stringify({ error: 'Invalid coordinates' }));
                    }

                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
                    const timestamp = data.timestamp || Date.now();

                    const entry = {
                        id: `png-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        memberName,
                        lat,
                        lng,
                        accuracy: data.accuracy || null,
                        note,
                        timestamp,
                        timeStr
                    };

                    group.pings.unshift(entry);
                    if (group.pings.length > 30) {
                        group.pings = group.pings.slice(0, 30);
                    }

                    group.updatedAt = now.toISOString();
                    saveGroupCheckins(store);
                    console.log(`[Group Radar] Ping for group ${groupId}: ${memberName} (${lat.toFixed(4)}, ${lng.toFixed(4)}) - "${note}" [${timeStr}]`);

                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    return res.end(JSON.stringify({ success: true, group, entry }));
                } catch (e) {
                    console.error('[Group Radar] Error processing ping:', e);
                    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    return res.end(JSON.stringify({ error: 'Failed to record ping' }));
                }
            });
            return;
        }

        if (req.method === 'POST' && action === 'clear') {
            group.checkins = [];
            group.pings = [];
            group.updatedAt = new Date().toISOString();
            saveGroupCheckins(store);
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: true, group }));
        }

        res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ error: 'Unknown group action' }));
    }

    // API Endpoint: Dynamic Image Scraper and Spot Enricher
    if (pathname === '/api/scrape-images') {
        const action = parsedUrl.searchParams.get('action');
        const id = parsedUrl.searchParams.get('id');
        const query = parsedUrl.searchParams.get('query');
        const name = parsedUrl.searchParams.get('name');
        const address = parsedUrl.searchParams.get('address');

        if (!id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing id parameter' }));
            return;
        }

        // Action: Reset spot image to category-specific default image
        if (action === 'reset') {
            if (fs.existsSync(harvestedPath)) {
                try {
                    const spots = JSON.parse(fs.readFileSync(harvestedPath, 'utf-8'));
                    const spotIdx = spots.findIndex(s => s.id === id);
                    if (spotIdx !== -1) {
                        const spot = spots[spotIdx];
                        const defaultImg = spot.type === 'playpark' 
                            ? "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80"
                            : (spot.type === 'gamezone'
                                ? "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=600&auto=format&fit=crop&q=80"
                                : "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80");
                        
                        spots[spotIdx].imageUrl = defaultImg;
                        spots[spotIdx].images = [defaultImg];
                        
                        fs.writeFileSync(harvestedPath, JSON.stringify(spots, null, 4), 'utf-8');
                        console.log(`[Reset Spot Image] Reset spot ${id} to category default: ${defaultImg}`);
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, imageUrl: defaultImg }));
                        return;
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Spot not found' }));
                        return;
                    }
                } catch (e) {
                    console.error('Error during spot reset:', e);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Internal server error during reset' }));
                    return;
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Database file not found' }));
                return;
            }
        }

        if (!query) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing query parameter for search action' }));
            return;
        }

        // Get spot type from database to use for relevance filtering
        let spotType = 'playpark'; // default fallback
        if (fs.existsSync(harvestedPath)) {
            try {
                const spots = JSON.parse(fs.readFileSync(harvestedPath, 'utf-8'));
                const spot = spots.find(s => s.id === id);
                if (spot) {
                    spotType = spot.type;
                }
            } catch (e) {
                console.error('Error looking up spot type:', e);
            }
        }

        console.log(`[Dynamic Scrape] Fetching images for spot ${id} (type: "${spotType}", query: "${query}")...`);
        const images = await fetchBingImages(query, spotType);

        // Update database if name/address or images are provided
        let responseImages = images;
        if (fs.existsSync(harvestedPath)) {
            try {
                const spots = JSON.parse(fs.readFileSync(harvestedPath, 'utf-8'));
                const spotIdx = spots.findIndex(s => s.id === id);
                if (spotIdx !== -1) {
                    let updated = false;
                    
                    if (images.length > 0) {
                        spots[spotIdx].imageUrl = images[0];
                        spots[spotIdx].images = images;
                        updated = true;
                    } else {
                        // If no images matched the relevance check or were found, auto-default to category placeholder
                        const defaultImg = spotType === 'playpark' 
                            ? "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80"
                            : (spotType === 'gamezone' 
                                ? "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=600&auto=format&fit=crop&q=80"
                                : "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80");
                        
                        if (spots[spotIdx].imageUrl !== defaultImg) {
                            spots[spotIdx].imageUrl = defaultImg;
                            spots[spotIdx].images = [defaultImg];
                            updated = true;
                            console.log(`[Auto-Default] Spot ${id} ("${spots[spotIdx].name}") failed relevance filter; set to category default: ${defaultImg}`);
                        }
                        responseImages = [defaultImg];
                    }

                    if (name && spots[spotIdx].name !== name) {
                        spots[spotIdx].name = name;
                        updated = true;
                    }
                    if (address && spots[spotIdx].address !== address) {
                        spots[spotIdx].address = address;
                        updated = true;
                    }
                    if (updated) {
                        fs.writeFileSync(harvestedPath, JSON.stringify(spots, null, 4), 'utf-8');
                        console.log(`  -> Enriched spot ${id} permanently: name="${spots[spotIdx].name}", hasImages=${images.length > 0}`);
                    }
                }
            } catch (e) {
                console.error('Error writing to spots_harvested.json during enrichment:', e);
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ images: responseImages }));
        return;
    }

    // API Endpoint: Proxy for MeteoSwiss Weather & Warnings
    if (pathname === '/api/weather') {
        const plz = parsedUrl.searchParams.get('plz');
        if (!plz) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing plz parameter' }));
            return;
        }

        const url = `https://app-prod-ws.meteoswiss-app.ch/v1/plzDetail?plz=${plz}00`;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        };

        https.get(url, options, (apiRes) => {
            let body = '';
            apiRes.on('data', chunk => body += chunk);
            apiRes.on('end', () => {
                if (apiRes.statusCode !== 200) {
                    res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                    res.end(body);
                    return;
                }

                try {
                    const data = JSON.parse(body);
                    
                    // Check for stale data (older than 12 hours) or missing forecast (common on university/corporate PLZs like 8093)
                    const now = Date.now();
                    const isStale = data.currentWeather && data.currentWeather.time && (now - data.currentWeather.time > 12 * 60 * 60 * 1000);
                    const hasForecast = data.forecast && data.forecast.length > 0;
                    
                    if (isStale || !hasForecast) {
                        console.warn(`[API Proxy] MeteoSwiss data for PLZ ${plz} is stale or incomplete (stale=${isStale}, hasForecast=${hasForecast}). Rejecting to trigger fallback.`);
                        res.writeHead(502, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'MeteoSwiss data is stale or incomplete' }));
                        return;
                    }
                    
                    // Map MeteoSwiss icon to WMO code
                    const meteoSwissToWmo = {
                        1: 0,   // Sunny/Clear
                        2: 1,   // Fair/Partly Cloudy
                        3: 2,   // Partly Cloudy
                        4: 3,   // Cloudy
                        5: 45,  // Fog
                        6: 3,   // Overcast
                        7: 80,  // Showers
                        8: 81,  // Heavy Showers
                        9: 95,  // Thunderstorm
                        10: 95, // Heavy Thunderstorm
                        11: 61, // Rain
                        12: 63, // Heavy Rain
                        13: 85, // Snow Showers
                        14: 71, // Snow
                        15: 73, // Heavy Snow
                        16: 95, // Thunderstorm
                        17: 51, // Drizzle
                        18: 56, // Freezing rain
                        19: 68, // Rain and snow
                        20: 71, // Light snow
                    };

                    const rawIcon = data.currentWeather ? data.currentWeather.icon : 1;
                    const wmoCode = meteoSwissToWmo[rawIcon] || 3; // Default to cloudy if not found

                    const result = {
                        temperature: data.currentWeather ? Math.round(data.currentWeather.temperature) : (data.forecast && data.forecast[0] ? Math.round((data.forecast[0].temperatureMax + data.forecast[0].temperatureMin)/2) : 20),
                        precipitation: data.forecast && data.forecast[0] ? data.forecast[0].precipitation : 0,
                        code: wmoCode,
                        warnings: data.warnings || [],
                        forecast: data.forecast || []
                    };

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    console.error('[API Proxy] Error parsing response:', e);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Error parsing weather data' }));
                }
            });
        }).on('error', (e) => {
            console.error('[API Proxy] Error fetching from MeteoSwiss:', e);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch weather from MeteoSwiss' }));
        });
        return;
    }

    // API Endpoint: CORS image proxy to prevent tainted canvases when exporting posts
    if (pathname === '/api/proxy-image') {
        const imageUrl = parsedUrl.searchParams.get('url');
        if (!imageUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
        }

        try {
            const client = imageUrl.startsWith('https') ? https : http;
            client.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (imageRes) => {
                // If it is a redirect, follow it once (simple follow)
                if (imageRes.statusCode >= 300 && imageRes.statusCode < 400 && imageRes.headers.location) {
                    const redirectUrl = imageRes.headers.location.startsWith('http') 
                        ? imageRes.headers.location 
                        : new URL(imageRes.headers.location, imageUrl).href;
                    
                    const redirectClient = redirectUrl.startsWith('https') ? https : http;
                    redirectClient.get(redirectUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (redRes) => {
                        res.writeHead(redRes.statusCode, {
                            'Content-Type': redRes.headers['content-type'] || 'image/jpeg',
                            'Access-Control-Allow-Origin': '*',
                            'Cache-Control': 'public, max-age=86400'
                        });
                        redRes.pipe(res);
                    }).on('error', (err) => {
                        console.error('[Image Proxy Redirect Error]', err);
                        res.writeHead(500);
                        res.end('Proxy Redirect Error');
                    });
                    return;
                }

                res.writeHead(imageRes.statusCode, {
                    'Content-Type': imageRes.headers['content-type'] || 'image/jpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=86400'
                });
                imageRes.pipe(res);
            }).on('error', (err) => {
                console.error('[Image Proxy Error]', err);
                res.writeHead(500);
                res.end('Proxy Error');
            });
        } catch (e) {
            console.error('[Image Proxy Exception]', e);
            res.writeHead(500);
            res.end('Proxy Exception');
        }
        return;
    }

    // Serve Static Files
    let filePath;
    let isDataFile = false;
    
    if (pathname === '/spots_harvested.json') {
        filePath = path.join(DATA_DIR, 'spots_harvested.json');
        isDataFile = true;
    } else if (pathname === '/events.json') {
        filePath = path.join(__dirname, 'events.json');
        isDataFile = true;
    } else if (pathname === '/feedback.json') {
        filePath = path.join(DATA_DIR, 'feedback.json');
        isDataFile = true;
    } else if (pathname === '/group_checkins.json') {
        filePath = path.join(DATA_DIR, 'group_checkins.json');
        isDataFile = true;
    } else {
        filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    }
    
    // Simple path traversal check (skip for data files outside PUBLIC_DIR)
    if (!isDataFile && !filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    const extname = path.extname(filePath);
    let contentType = 'text/html';
    if (extname === '.css') contentType = 'text/css';
    else if (extname === '.js') contentType = 'text/javascript';
    else if (extname === '.json') contentType = 'application/json';
    else if (extname === '.png') contentType = 'image/png';
    else if (extname === '.jpg' || extname === '.jpeg') contentType = 'image/jpeg';
    else if (extname === '.ico') contentType = 'image/x-icon';
    else if (extname === '.txt') contentType = 'text/plain';
    else if (extname === '.xml') contentType = 'application/xml';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Dynamic Kids Spots Server listening on http://localhost:${PORT}`);

    // Automated daily refresh for Swiss Kids Events (Phase 1)
    try {
        const { collectAndSaveEvents } = require('./collect_events');
        const eventsPath = path.join(__dirname, 'events.json');
        if (!fs.existsSync(eventsPath)) {
            console.log('[Server Startup] events.json missing, triggering initial event collection...');
            collectAndSaveEvents().catch(e => console.error('[Collector] Startup collection error:', e.message));
        }
        // Recurring 24-hour sync
        setInterval(() => {
            console.log('[Events Cron] Running daily events refresh...');
            collectAndSaveEvents().catch(e => console.error('[Events Cron] Daily refresh error:', e.message));
        }, 24 * 60 * 60 * 1000);
    } catch (e) {
        console.error('[Collector] Could not initialize events cron:', e.message);
    }
});
