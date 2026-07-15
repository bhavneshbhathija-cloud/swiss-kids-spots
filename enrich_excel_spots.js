// Quick enrichment for the 37 new excel spots in base_spots.json
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_FILE = path.join(__dirname, 'base_spots.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJson(url) {
    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'SwissKidsSpots/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
        }).on('error', () => resolve(null));
    });
}

async function findImage(lat, lng) {
    const coord = `${lat}|${lng}`;
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${encodeURIComponent(coord)}&ggsradius=1000&ggsnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json`;
    const data = await fetchJson(url);
    await sleep(500);
    
    if (!data || !data.query || !data.query.pages) return null;
    const pages = Object.values(data.query.pages);
    for (const page of pages) {
        if (page.imageinfo && page.imageinfo[0] && page.imageinfo[0].thumburl) {
            return {
                imageUrl: page.imageinfo[0].thumburl,
                imageSource: 'Wikimedia Commons / CC BY-SA'
            };
        }
    }
    return null;
}

async function main() {
    const spots = JSON.parse(fs.readFileSync(BASE_FILE, 'utf-8'));
    const excelSpots = spots.filter(s => s.id.startsWith('excel-spot-'));
    
    console.log(`Enriching ${excelSpots.length} excel spots with images...`);
    let found = 0;
    
    for (let i = 0; i < excelSpots.length; i++) {
        const spot = excelSpots[i];
        const result = await findImage(spot.lat, spot.lng);
        
        if (result) {
            const idx = spots.findIndex(s => s.id === spot.id);
            if (idx >= 0) {
                spots[idx].imageUrl = result.imageUrl;
                spots[idx].images = [result.imageUrl];
                spots[idx].imageSource = result.imageSource;
                found++;
                console.log(`  [${i+1}/${excelSpots.length}] + ${spot.name} -> image found`);
            }
        } else {
            console.log(`  [${i+1}/${excelSpots.length}] - ${spot.name} -> no image`);
        }
    }
    
    fs.writeFileSync(BASE_FILE, JSON.stringify(spots, null, 4), 'utf-8');
    console.log(`\nDone! Found images for ${found}/${excelSpots.length} spots.`);
}

main().catch(console.error);
