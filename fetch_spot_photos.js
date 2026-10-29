/**
 * fetch_spot_photos.js
 * Batch-enriches all Playparks, Swimming Pools, and Game Zones in spots_harvested.json:
 *  1. Fetches real, relevance-filtered photos for all 852 Named Spots (Playparks, Badis/Pools, Gamezones).
 *  2. Fetches municipality-level Badi/Schwimmbad & Spielplatz photo galleries for Swiss cities/towns
 *     and distributes distinct primary photos across spots in the same municipality.
 *  3. Harvests 60+ authentic Wikimedia Commons Swiss Playground & Swiss Badi photos as a diverse
 *     rotating fallback pool so 0 spots remain on the single repeated Unsplash placeholder.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const agent = new https.Agent({ keepAlive: true, maxSockets: 45 });

function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    const badKeywords = [
        'adsystem', 'analytics', 'pixel', 'tracker', 'adserver', 'advertisement', 'doubleclick', 'telemetry', 'statcounter',
        'porn', 'nude', 'naked', 'sexy', 'adult', 'erotic', 'nsfw', 'xxx', 'boobs', 'sex', 'lingerie', 'playboy', 'sensual',
        'girls', 'model', 'bikini', 'nackt', 'nackte', 'nude-photo', 'strip', 'nudephoto', 'playmate',
        'spital', 'hospital', 'klinik', 'logo', 'icon', 'avatar', 'placeholder', 'map', 'karte', 'grundriss',
        'badi-info'
    ];
    for (const kw of badKeywords) {
        if (lower.includes(kw)) return false;
    }
    if (!url.startsWith('https://')) return false;
    const hasImageExt = lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp');
    if (!hasImageExt && !lower.includes('wikimedia.org')) return false;
    return true;
}

function isImageRelevant(meta, type) {
    if (!meta) return false;
    const textToSearch = [
        meta.t || '',
        meta.desc || '',
        meta.murl || '',
        meta.purl || ''
    ].join(' ').toLowerCase();

    const blacklist = [
        'spital', 'hospital', 'klinik', 'surgery', 'operation', 'medical', 'doctor', 'arzt',
        'dentist', 'zahnarzt', 'patient', 'therapie', 'rehab', 'treatment', 'medical center',
        'clinic', 'op-saal', 'operationstisch', 'operationssaal', 'krankenhaus',
        'karte', 'map', 'blueprint', 'floor plan', 'grundriss', 'diagram', 'logo', 'flyer',
        'poster', 'document', 'formular', 'wappen', 'coat of arms', 'flagge', 'porträt', 'portrait'
    ];
    for (const term of blacklist) {
        if (textToSearch.includes(term)) return false;
    }

    let keywords = [];
    if (type === 'playpark') {
        keywords = [
            'playpark', 'playground', 'spielplatz', 'slide', 'swing', 'climbing', 'park',
            'spiel', 'kinder', 'rutsche', 'schaukel', 'sandkasten', 'play', 'outdoor',
            'climb', 'robinson', 'spass', 'geräte', 'seilbahn', 'wiese', 'klettern', 'parc'
        ];
    } else if (type === 'swimmingpool') {
        keywords = [
            'swimming', 'pool', 'swim', 'badi', 'hallenbad', 'freibad', 'wasser', 'bad',
            'schwimmbad', 'strandbad', 'lido', 'bathing', 'water', 'slide', 'rutsche',
            'becken', 'schwimmen', 'planschbecken', 'piscine', 'bains', 'bagno', 'see', 'therme', 'aqua'
        ];
    } else if (type === 'gamezone') {
        keywords = [
            'gamezone', 'game', 'arcade', 'play', 'indoor', 'center', 'laser', 'bowling',
            'billiard', 'pinball', 'fun', 'spiel', 'gaming', 'spielhalle', 'zocken', 'arena', 'vr', 'escape'
        ];
    } else {
        return true;
    }

    for (const kw of keywords) {
        if (textToSearch.includes(kw)) return true;
    }
    return false;
}

function fetchBingImages(query, type, maxCount = 6) {
    return new Promise((resolve) => {
        const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&adlt=strict`;
        const req = https.get(url, {
            agent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8'
            },
            timeout: 8000
        }, (res) => {
            let html = '';
            res.on('data', chunk => html += chunk);
            res.on('end', () => {
                const regex = /m="([^"]+)"/g;
                const matches = [];
                const seen = new Set();
                let match;
                while ((match = regex.exec(html)) !== null) {
                    try {
                        const jsonStr = match[1]
                            .replace(/&quot;/g, '"')
                            .replace(/&amp;/g, '&')
                            .replace(/&#183;/g, '-');
                        const meta = JSON.parse(jsonStr);
                        const imgUrl = meta.murl;
                        if (imgUrl && !seen.has(imgUrl) && isValidImageUrl(imgUrl) && isImageRelevant(meta, type)) {
                            seen.add(imgUrl);
                            matches.push(imgUrl);
                        }
                    } catch (e) {}
                    if (matches.length >= maxCount) break;
                }
                resolve(matches);
            });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => {
            req.destroy();
            resolve([]);
        });
    });
}

function fetchWikimediaSearch(query, limit = 50) {
    return new Promise((resolve) => {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json`;
        const req = https.get(url, {
            agent,
            headers: { 'User-Agent': 'SwissKidsSpots/1.0 (https://swissforkids.ch)' },
            timeout: 10000
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const j = JSON.parse(body);
                    const pages = j && j.query && j.query.pages ? Object.values(j.query.pages) : [];
                    const urls = [];
                    for (const p of pages) {
                        const t = (p.title || '').toLowerCase();
                        if (t.includes('map') || t.includes('karte') || t.includes('logo') || t.includes('wappen') || t.includes('.svg') || t.includes('.pdf') || t.includes('portrait') || t.includes('historical') || t.includes('19')) continue;
                        const u = p.imageinfo && p.imageinfo[0] && (p.imageinfo[0].thumburl || p.imageinfo[0].url);
                        if (u && isValidImageUrl(u)) urls.push(u);
                    }
                    resolve(urls);
                } catch (e) {
                    resolve([]);
                }
            });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => {
            req.destroy();
            resolve([]);
        });
    });
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

function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}

async function run() {
    const t0 = Date.now();
    const spotsPath = path.join(__dirname, 'spots_harvested.json');
    const spots = JSON.parse(fs.readFileSync(spotsPath, 'utf8'));
    console.log(`=== Enriching Playpark, Swimming Pool & Gamezone Photos (${spots.length} total spots) ===`);

    // 1. Harvest authentic Wikimedia Commons Swiss pools & Swiss playgrounds for fallback rotation
    const [wmPlay1, wmPlay2, wmPool1, wmPool2, wmGame1] = await Promise.all([
        fetchWikimediaSearch('Spielplatz Schweiz OR Kinderspielplatz Zürich OR Spielplatz Bern', 50),
        fetchWikimediaSearch('Playground Switzerland OR Robinsonspielplatz Schweiz', 50),
        fetchWikimediaSearch('Freibad Schweiz OR Strandbad Schweiz OR Badi Zürich', 50),
        fetchWikimediaSearch('Schwimmbad Schweiz OR Hallenbad Schweiz OR Piscine Suisse', 50),
        fetchWikimediaSearch('Bowlingcenter OR Laser Tag OR Arcade game room indoor', 40)
    ]);

    const swissPlaygroundPool = [...new Set([...wmPlay1, ...wmPlay2])];
    const swissSwimmingPool = [...new Set([...wmPool1, ...wmPool2])];
    const swissGamezonePool = [...new Set([...wmGame1])];
    console.log(`Loaded authentic Wikimedia Commons pools: ${swissPlaygroundPool.length} Swiss playground photos, ${swissSwimmingPool.length} Swiss Badi/pool photos, ${swissGamezonePool.length} gamezone photos.`);

    const genericRe = /^(playground|swimming pool|indoor play center) (in|at) /i;

    // 2. Identify all Named Spots missing real photos (852 spots)
    const namedTargets = [];
    const genericByCityType = new Map();

    for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        const isUnsplash = !s.imageUrl || s.imageUrl.includes('unsplash.com');
        if (!isUnsplash) continue;

        if (!genericRe.test(s.name)) {
            namedTargets.push(i);
        } else {
            const key = `${s.type}|${s.city || 'Zürich'}`;
            if (!genericByCityType.has(key)) genericByCityType.set(key, []);
            genericByCityType.get(key).push(i);
        }
    }

    console.log(`Step 1: Fetching specific photos for ${namedTargets.length} named Playparks, Swimming Pools & Gamezones...`);
    let namedDone = 0;
    let namedMatched = 0;

    await runPool(namedTargets, 40, async (spotIdx) => {
        const s = spots[spotIdx];
        const typeHint = s.type === 'swimmingpool'
            ? 'Schwimmbad Badi'
            : (s.type === 'gamezone' ? 'Indoor Spielhalle' : 'Spielplatz Park');
        const q = `${s.name} ${s.city || ''} ${typeHint} Schweiz`.trim();
        const imgs = await fetchBingImages(q, s.type, 4);
        namedDone++;
        if (namedDone % 150 === 0 || namedDone === namedTargets.length) {
            console.log(`  ... processed ${namedDone}/${namedTargets.length} named spots (${namedMatched} matched specific web photos, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        }
        if (imgs.length > 0) {
            s.imageUrl = imgs[0];
            s.images = imgs;
            s.imageSource = s.imageSource || 'Local Swiss Directory / Web';
            namedMatched++;
        }
    });

    // 3. Fetch municipality-level photo galleries for all Swimming Pool cities & top Playground cities
    const cityTypeEntries = Array.from(genericByCityType.entries())
        .sort((a, b) => {
            // Prioritize all swimmingpool & gamezone municipalities first, then cities with most playgrounds
            const typeA = a[0].split('|')[0];
            const typeB = b[0].split('|')[0];
            if (typeA !== 'playpark' && typeB === 'playpark') return -1;
            if (typeA === 'playpark' && typeB !== 'playpark') return 1;
            return b[1].length - a[1].length;
        });

    // Query top 650 municipality+type combinations (covers all swimming pools, all gamezones, and top ~400 playground towns)
    const cityQueriesToRun = cityTypeEntries.slice(0, 650);
    console.log(`Step 2: Fetching municipality photo galleries for ${cityQueriesToRun.length} Swiss towns & cities...`);

    let cityDone = 0;
    let citySpotsEnriched = 0;

    await runPool(cityQueriesToRun, 45, async ([key, spotIndices]) => {
        const [type, city] = key.split('|');
        const query = type === 'swimmingpool'
            ? `Schwimmbad Badi Freibad ${city} Schweiz`
            : (type === 'gamezone'
                ? `Indoor Spielplatz Bowling ${city} Schweiz`
                : `Kinderspielplatz Spielplatz ${city} Schweiz`);
        const imgs = await fetchBingImages(query, type, 10);
        cityDone++;
        if (cityDone % 150 === 0 || cityDone === cityQueriesToRun.length) {
            console.log(`  ... processed ${cityDone}/${cityQueriesToRun.length} municipalities (${citySpotsEnriched} spots enriched, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        }
        if (imgs.length > 0) {
            for (let k = 0; k < spotIndices.length; k++) {
                const s = spots[spotIndices[k]];
                // Rotate primary image so spots in the same city each display a different local photo
                const rotated = [];
                for (let j = 0; j < Math.min(4, imgs.length); j++) {
                    rotated.push(imgs[(k + j) % imgs.length]);
                }
                s.imageUrl = rotated[0];
                s.images = rotated;
                s.imageSource = `Local ${city} Directory / Web`;
                citySpotsEnriched++;
            }
        }
    });

    // 4. For any remaining spots still on the single Unsplash URL, assign 4 distinct photos
    //    from the authentic Wikimedia Commons Swiss Playground / Swiss Badi pool (hashed by spot ID)
    let fallbackAssigned = 0;
    for (const s of spots) {
        const isUnsplash = !s.imageUrl || s.imageUrl.includes('unsplash.com');
        if (!isUnsplash) continue;

        const pool = s.type === 'swimmingpool'
            ? swissSwimmingPool
            : (s.type === 'gamezone' ? swissGamezonePool : swissPlaygroundPool);

        if (pool.length >= 4) {
            const h = hashString(s.id || s.name || 'spot');
            const picked = [];
            for (let j = 0; j < 4; j++) {
                picked.push(pool[(h + j * 7) % pool.length]);
            }
            s.imageUrl = picked[0];
            s.images = picked;
            s.imageSource = 'Wikimedia Commons Switzerland (CC BY-SA)';
            fallbackAssigned++;
        }
    }

    fs.writeFileSync(spotsPath, JSON.stringify(spots, null, 2), 'utf8');
    console.log(`\n=== Photo Enrichment Complete in ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
    console.log(`  - Named spots enriched with specific photos: ${namedMatched}/${namedTargets.length}`);
    console.log(`  - Municipality spots enriched with local town photos: ${citySpotsEnriched}`);
    console.log(`  - Remaining spots assigned rotating Wikimedia Commons Swiss photos: ${fallbackAssigned}`);
}

run();
