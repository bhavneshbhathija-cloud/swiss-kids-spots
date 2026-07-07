#!/usr/bin/env node
// enrich_images.js
// ──────────────────────────────────────────────────────────────────────
// Batch enrichment script: replaces placeholder Unsplash images in
// spots_harvested.json with real images from a cascading waterfall of
// free APIs.
//
// Usage:  node enrich_images.js
//
// Environment variables:
//   MAPILLARY_TOKEN  — Mapillary client token (MLY|...)
//   FLICKR_API_KEY   — Flickr API key (optional)
// ──────────────────────────────────────────────────────────────────────

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ─── Configuration ───────────────────────────────────────────────────

const MAPILLARY_TOKEN = process.env.MAPILLARY_TOKEN || '';
const FLICKR_API_KEY  = process.env.FLICKR_API_KEY  || '';
const BATCH_SIZE      = 50;
const INPUT_FILE      = path.join(__dirname, 'spots_harvested.json');

// Keywords per spot type used by Commons geosearch & Flickr layers
const KEYWORDS = {
    playpark:     ['spielplatz', 'playground', 'park', 'spiel', 'kinder', 'play'],
    swimmingpool: ['pool', 'badi', 'schwimmbad', 'freibad', 'hallenbad', 'swimming', 'water'],
    gamezone:     ['game', 'spiel', 'arcade', 'indoor', 'play'],
};

const FLICKR_SEARCH_TERMS = {
    playpark:     'Spielplatz OR playground',
    swimmingpool: 'Schwimmbad OR Badi OR swimming pool',
    gamezone:     'Spielhalle OR game center OR indoor play',
};

// Flickr license id → human-readable label
const FLICKR_LICENSE_LABELS = {
    '1':  'CC BY-NC-SA 2.0',
    '2':  'CC BY-NC 2.0',
    '4':  'CC BY 2.0',
    '5':  'CC BY-SA 2.0',
    '6':  'CC BY-ND 2.0',
    '9':  'CC0 1.0',
    '10': 'Public Domain Mark 1.0',
};

// ─── Statistics ──────────────────────────────────────────────────────

const stats = {
    total:          0,
    osmTag:         0,
    wikimediaTag:   0,
    wikidata:       0,
    mapillary:      0,
    commonsGeo:     0,
    flickr:         0,
    stillPlaceholder: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Wait for `ms` milliseconds.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns true if the imageUrl is a placeholder (Unsplash stub).
 */
function isPlaceholder(url) {
    return typeof url === 'string' && url.includes('unsplash.com/photo-');
}

/**
 * Generic JSON fetcher using built-in http/https modules.
 * Follows up to `maxRedirects` redirects. Returns parsed JSON or null
 * on any error.
 */
function fetchJson(url, headers = {}, maxRedirects = 3) {
    return new Promise(resolve => {
        const protocol = url.startsWith('https') ? https : http;
        const options  = { headers: { 'User-Agent': 'swiss-kids-spots-enricher/1.0', ...headers } };

        protocol.get(url, options, res => {
            // Follow redirects
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                if (maxRedirects <= 0) {
                    res.resume();
                    return resolve(null);
                }
                const redirectUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : new URL(res.headers.location, url).href;
                res.resume();
                return resolve(fetchJson(redirectUrl, headers, maxRedirects - 1));
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return resolve(null);
            }

            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
}

// ─── Layer 1: OSM Direct Image Tag ──────────────────────────────────

async function tryOsmImage(spot) {
    if (!spot.osmImageUrl) return null;
    return { imageUrl: spot.osmImageUrl, imageSource: 'OpenStreetMap' };
}

// ─── Layer 2: Wikimedia Commons Tag ──────────────────────────────────

/**
 * Resolve a `File:Something.jpg` title to a thumbnail URL via the
 * Commons API.
 */
async function resolveCommonsFile(fileTitle) {
    // fileTitle should start with "File:" already
    const encoded = encodeURIComponent(fileTitle);
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encoded}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`;
    const data = await fetchJson(url);
    if (!data || !data.query || !data.query.pages) return null;

    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    if (!pages[pageId] || !pages[pageId].imageinfo) return null;

    return pages[pageId].imageinfo[0]?.thumburl || null;
}

async function tryWikimediaTag(spot) {
    if (!spot.wikimediaCommons) return null;
    const value = spot.wikimediaCommons;

    // Only resolve File: entries (Categories are not individual images)
    if (!value.startsWith('File:')) return null;

    const thumbUrl = await resolveCommonsFile(value);
    if (!thumbUrl) return null;

    return { imageUrl: thumbUrl, imageSource: 'Wikimedia Commons / CC BY-SA' };
}

// ─── Layer 3: Wikidata P18 ───────────────────────────────────────────

async function tryWikidata(spot) {
    if (!spot.wikidataId) return null;

    const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${spot.wikidataId}&property=P18&format=json`;
    const data = await fetchJson(url);
    if (!data || !data.claims || !data.claims.P18 || data.claims.P18.length === 0) return null;

    const filename = data.claims.P18[0]?.mainsnak?.datavalue?.value;
    if (!filename) return null;

    const fileTitle = `File:${filename}`;
    const thumbUrl  = await resolveCommonsFile(fileTitle);
    if (!thumbUrl) return null;

    return { imageUrl: thumbUrl, imageSource: 'Wikidata / CC BY-SA' };
}

// ─── Layer 4: Mapillary ──────────────────────────────────────────────

async function tryMapillary(spot) {
    if (!MAPILLARY_TOKEN) return null;
    if (!spot.lat || !spot.lng) return null;

    // Use wider radius (100m) to catch more nearby street-level photos
    const url = `https://graph.mapillary.com/images?fields=id,thumb_1024_url,captured_at,quality_score&lat=${spot.lat}&lng=${spot.lng}&radius=100&limit=10&access_token=${MAPILLARY_TOKEN}`;
    const data = await fetchJson(url);

    // Rate limit
    await sleep(100);

    if (!data || !data.data || data.data.length === 0) return null;

    // Accept any quality, sort by quality descending to pick the best
    const good = data.data
        .filter(img => img.thumb_1024_url)
        .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

    if (good.length === 0) return null;

    return { imageUrl: good[0].thumb_1024_url, imageSource: 'Mapillary / CC BY-SA 4.0' };
}

// ─── Layer 5: Wikimedia Commons Geosearch ────────────────────────────

async function tryCommonsGeo(spot) {
    if (!spot.lat || !spot.lng) return null;

    const coord = `${spot.lat}|${spot.lng}`;
    // Use wider radius (1000m) to find more geotagged photos
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${encodeURIComponent(coord)}&ggsradius=1000&ggsnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json`;
    const data = await fetchJson(url);

    // Rate limit
    await sleep(300);

    if (!data || !data.query || !data.query.pages) return null;

    const spotType = (spot.type || '').toLowerCase();
    const keywords = KEYWORDS[spotType] || [];

    // First pass: try to find a keyword-matched image
    const pages = Object.values(data.query.pages);
    for (const page of pages) {
        const title = (page.title || '').toLowerCase();
        const desc  = (page.imageinfo?.[0]?.extmetadata?.ImageDescription?.value || '').toLowerCase();
        const haystack = `${title} ${desc}`;

        const matches = keywords.some(kw => haystack.includes(kw));
        if (matches && page.imageinfo?.[0]?.thumburl) {
            return {
                imageUrl:    page.imageinfo[0].thumburl,
                imageSource: 'Wikimedia Commons / CC BY-SA',
            };
        }
    }

    // Second pass: accept any nearby image as a fallback (still location-relevant)
    for (const page of pages) {
        if (page.imageinfo?.[0]?.thumburl) {
            return {
                imageUrl:    page.imageinfo[0].thumburl,
                imageSource: 'Wikimedia Commons / CC BY-SA',
            };
        }
    }

    return null;
}

// ─── Layer 6: Flickr ─────────────────────────────────────────────────

async function tryFlickr(spot) {
    if (!FLICKR_API_KEY) return null;
    if (!spot.lat || !spot.lng) return null;

    const spotType = (spot.type || '').toLowerCase();
    const keyword  = FLICKR_SEARCH_TERMS[spotType] || 'playground';

    const url = `https://api.flickr.com/services/rest/?method=flickr.photos.search`
        + `&api_key=${FLICKR_API_KEY}`
        + `&lat=${spot.lat}&lon=${spot.lng}&radius=0.5`
        + `&text=${encodeURIComponent(keyword)}`
        + `&extras=url_m,url_l,license,owner_name`
        + `&license=1,2,4,5,6,9,10`
        + `&per_page=5&format=json&nojsoncallback=1`;

    const data = await fetchJson(url);

    // Rate limit
    await sleep(1000);

    if (!data || !data.photos || !data.photos.photo || data.photos.photo.length === 0) return null;

    const photo = data.photos.photo[0];
    const imgUrl = photo.url_l || photo.url_m;
    if (!imgUrl) return null;

    const licenseLabel = FLICKR_LICENSE_LABELS[String(photo.license)] || 'CC BY-SA';
    const ownerCredit  = photo.owner_name ? ` (${photo.owner_name})` : '';

    return {
        imageUrl:    imgUrl,
        imageSource: `Flickr / ${licenseLabel}${ownerCredit}`,
    };
}

// ─── Waterfall Processor ─────────────────────────────────────────────

/**
 * Run each layer in order; return the first successful result or null.
 */
async function enrichSpot(spot) {
    const layers = [
        { fn: tryOsmImage,    label: 'osmTag' },
        { fn: tryWikimediaTag, label: 'wikimediaTag' },
        { fn: tryWikidata,     label: 'wikidata' },
        { fn: tryMapillary,    label: 'mapillary' },
        { fn: tryCommonsGeo,   label: 'commonsGeo' },
        { fn: tryFlickr,       label: 'flickr' },
    ];

    for (const layer of layers) {
        try {
            const result = await layer.fn(spot);
            if (result) {
                stats[layer.label]++;
                return result;
            }
        } catch (err) {
            // Layer failed — continue to next
            console.error(`  ⚠  ${layer.label} error for "${spot.name || spot.id}": ${err.message}`);
        }
    }

    return null;
}

// ─── Save Helper ─────────────────────────────────────────────────────

function saveSpots(spots) {
    fs.writeFileSync(INPUT_FILE, JSON.stringify(spots, null, 4), 'utf8');
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
    // Load spots
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ File not found: ${INPUT_FILE}`);
        process.exit(1);
    }

    const spots = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
    console.log(`Loaded ${spots.length} spots from ${INPUT_FILE}`);

    // Identify which spots still need enrichment
    const indices = [];
    for (let i = 0; i < spots.length; i++) {
        if (isPlaceholder(spots[i].imageUrl)) {
            indices.push(i);
        }
    }
    console.log(`${indices.length} spots have placeholder images and need enrichment.\n`);

    if (indices.length === 0) {
        console.log('Nothing to do — all spots already have real images.');
        return;
    }

    stats.total = indices.length;
    let imagesFound = 0;

    // Graceful shutdown — save progress on Ctrl+C
    let interrupted = false;
    const onSigint = () => {
        if (interrupted) {
            console.log('\nForce quit.');
            process.exit(1);
        }
        interrupted = true;
        console.log('\n⏸  Interrupted — saving progress...');
        saveSpots(spots);
        printSummary(imagesFound);
        process.exit(0);
    };
    process.on('SIGINT', onSigint);

    // Process in batches
    for (let b = 0; b < indices.length; b += BATCH_SIZE) {
        const batchEnd = Math.min(b + BATCH_SIZE, indices.length);

        for (let i = b; i < batchEnd; i++) {
            const idx  = indices[i];
            const spot = spots[idx];

            const result = await enrichSpot(spot);
            if (result) {
                spot.imageUrl    = result.imageUrl;
                spot.imageSource = result.imageSource;
                // Update images array: replace first entry or create one
                if (Array.isArray(spot.images) && spot.images.length > 0) {
                    spot.images[0] = {
                        url:    result.imageUrl,
                        source: result.imageSource,
                    };
                } else {
                    spot.images = [{
                        url:    result.imageUrl,
                        source: result.imageSource,
                    }];
                }
                imagesFound++;
            }
        }

        // Save progress after each batch
        saveSpots(spots);
        console.log(`[Progress] ${batchEnd}/${indices.length} spots processed, ${imagesFound} images found...`);
    }

    // Final summary
    printSummary(imagesFound);
}

function printSummary(imagesFound) {
    // Count remaining placeholders
    let remaining = 0;
    try {
        const spots = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
        remaining = spots.filter(s => isPlaceholder(s.imageUrl)).length;
    } catch {
        remaining = stats.total - imagesFound;
    }
    stats.stillPlaceholder = remaining;

    console.log('\n════════════════════════════════════════');
    console.log('         ENRICHMENT SUMMARY');
    console.log('════════════════════════════════════════');
    console.log(`  Total spots processed:      ${stats.total}`);
    console.log(`  Images found:               ${imagesFound}`);
    console.log('  ──────────────────────────────────────');
    console.log(`  OSM tags:                   ${stats.osmTag}`);
    console.log(`  Wikimedia tag:              ${stats.wikimediaTag}`);
    console.log(`  Wikidata:                   ${stats.wikidata}`);
    console.log(`  Mapillary:                  ${stats.mapillary}`);
    console.log(`  Commons geo:                ${stats.commonsGeo}`);
    console.log(`  Flickr:                     ${stats.flickr}`);
    console.log('  ──────────────────────────────────────');
    console.log(`  Still placeholder:          ${stats.stillPlaceholder}`);
    console.log('════════════════════════════════════════\n');
}

// ─── Entry Point ─────────────────────────────────────────────────────

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
