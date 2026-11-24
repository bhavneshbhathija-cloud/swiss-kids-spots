/**
 * scripts/audit_blog_links.js
 * 
 * Audits all 27 SwissKidsSpots blog posts (English & German) against our live databases:
 * - base_spots.json (Curated playgrounds, waterparks, game zones, spas)
 * - hikes.json (SwitzerlandMobility official hiking, winter trails & sledging runs)
 * - events.json (Family festivals, light shows, Christmas markets, workshops)
 * - spots_harvested.json (OpenStreetMap harvested spots)
 * 
 * Verifies that each item mentioned in a blog post maps to an existing, clickable spot or event on the website.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const BLOG_POSTS = require(path.join(rootDir, 'blog_posts.js'));

const baseSpots = JSON.parse(fs.readFileSync(path.join(rootDir, 'base_spots.json'), 'utf8'));
const hikes = JSON.parse(fs.readFileSync(path.join(rootDir, 'hikes.json'), 'utf8'));
const events = JSON.parse(fs.readFileSync(path.join(rootDir, 'events.json'), 'utf8'));

let harvestedSpots = [];
const harvestedPath = path.join(rootDir, 'spots_harvested.json');
if (fs.existsSync(harvestedPath)) {
    try {
        harvestedSpots = JSON.parse(fs.readFileSync(harvestedPath, 'utf8'));
    } catch (e) {}
}

const baseSpotIds = new Set(baseSpots.map(s => s.id));
const hikeIds = new Set(hikes.map(h => h.id));
const eventIds = new Set(events.map(e => e.id));
const harvestedSpotIds = new Set(harvestedSpots.map(s => s.id));

console.log('='.repeat(78));
console.log(' SwissKidsSpots — Blog Post Database Integrity & Link Audit');
console.log('='.repeat(78));
console.log(`Live Databases:`);
console.log(`  • Curated Base Spots:     ${baseSpots.length}`);
console.log(`  • Hiking & Sledging:      ${hikes.length}`);
console.log(`  • Events & Festivals:     ${events.length}`);
console.log(`  • Harvested OSM Spots:    ${harvestedSpots.length}`);
console.log(`  • Total Blog Posts:       ${BLOG_POSTS.length}\n`);

let grandTotalItems = 0;
let grandDirectlyLinked = 0;
let grandActionHrefLinked = 0;
let grandCategoryPageLinked = 0;
let grandMissingOrUnlinked = 0;

const summaryTable = [];

BLOG_POSTS.forEach((post, pIdx) => {
    const items = post.items || [];
    let direct = 0;
    let actionHrefMatched = 0;
    let categoryPage = 0;
    let missing = [];

    items.forEach(item => {
        grandTotalItems++;
        let resolved = false;

        if (item.spotId && (baseSpotIds.has(item.spotId) || harvestedSpotIds.has(item.spotId))) {
            direct++;
            grandDirectlyLinked++;
            resolved = true;
        } else if (item.hikeId && hikeIds.has(item.hikeId)) {
            direct++;
            grandDirectlyLinked++;
            resolved = true;
        } else if (item.eventId && eventIds.has(item.eventId)) {
            direct++;
            grandDirectlyLinked++;
            resolved = true;
        }

        if (!resolved && item.actionHref) {
            const href = item.actionHref;
            const mSpot = href.match(/[?&]spot=([^&]+)/);
            const mHike = href.match(/[?&]hike=([^&]+)/);
            const mEvent = href.match(/[?&]event=([^&]+)/);

            if (mSpot && (baseSpotIds.has(decodeURIComponent(mSpot[1])) || harvestedSpotIds.has(decodeURIComponent(mSpot[1])))) {
                actionHrefMatched++;
                grandActionHrefLinked++;
                resolved = true;
            } else if (mHike && hikeIds.has(decodeURIComponent(mHike[1]))) {
                actionHrefMatched++;
                grandActionHrefLinked++;
                resolved = true;
            } else if (mEvent && eventIds.has(decodeURIComponent(mEvent[1]))) {
                actionHrefMatched++;
                grandActionHrefLinked++;
                resolved = true;
            } else if (href.startsWith('/')) {
                categoryPage++;
                grandCategoryPageLinked++;
                resolved = true; // linked to category landing page
            }
        }

        if (!resolved) {
            grandMissingOrUnlinked++;
            missing.push(`#${item.rank} ${item.name}`);
        }
    });

    const isFullyLinked = (direct + actionHrefMatched) === items.length;
    const status = isFullyLinked ? '✅ 100% Direct' : (missing.length === 0 ? '⚠️ Category Links' : '❌ Unlinked');

    summaryTable.push({
        '#': pIdx + 1,
        'Lang': post.lang || 'en',
        'Blog Title': post.title.length > 42 ? post.title.slice(0, 39) + '...' : post.title,
        'Items': items.length,
        'Direct': direct + actionHrefMatched,
        'Category': categoryPage,
        'Missing': missing.length,
        'Status': status
    });
});

console.table(summaryTable);

console.log('\n' + '-'.repeat(78));
console.log('Overall Audit Summary:');
console.log(`  • Total Items Across All Blogs:      ${grandTotalItems}`);
console.log(`  • Directly Linked to Real Spot/Event: ${grandDirectlyLinked + grandActionHrefLinked} (${Math.round((grandDirectlyLinked + grandActionHrefLinked) / grandTotalItems * 100)}%)`);
console.log(`  • Linked to Filtered Category Pages:  ${grandCategoryPageLinked} (${Math.round(grandCategoryPageLinked / grandTotalItems * 100)}%)`);
console.log(`  • Unlinked (Need spotId / Link):     ${grandMissingOrUnlinked} (${Math.round(grandMissingOrUnlinked / grandTotalItems * 100)}%)`);
console.log('='.repeat(78));
