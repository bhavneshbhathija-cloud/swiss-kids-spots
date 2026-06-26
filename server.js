const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// Determine persistent data directory (default to public dir, but support persistent disk on Render/Railway)
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/opt/render/project/src/data') ? '/opt/render/project/src/data' : PUBLIC_DIR);

const harvestedPath = path.join(DATA_DIR, 'spots_harvested.json');

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

// Helper to validate image URLs (including strict safety keywords)
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const badKeywords = [
        'adsystem', 'analytics', 'pixel', 'tracker', 'adserver', 'advertisement', 'doubleclick', 'telemetry', 'statcounter',
        'porn', 'nude', 'naked', 'sexy', 'adult', 'erotic', 'nsfw', 'xxx', 'boobs', 'sex', 'lingerie', 'playboy', 'sensual',
        'girls', 'model', 'bikini', 'nackt', 'nackte', 'nude-photo', 'strip', 'nudephoto', 'playmate'
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

    // Serve Static Files
    let filePath;
    let isDataFile = false;
    
    if (pathname === '/spots_harvested.json') {
        filePath = path.join(DATA_DIR, 'spots_harvested.json');
        isDataFile = true;
    } else if (pathname === '/feedback.json') {
        filePath = path.join(DATA_DIR, 'feedback.json');
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
});
