// seo.js — server-rendered, crawlable German pages + dynamic sitemap for swissforkids.ch
// Pages are built from the same JSON files the app uses. Each page links into the app via /?spot=ID or /?hike=ID.
const fs = require('fs');
const path = require('path');
const BLOG_POSTS = require('./blog_posts');

const SITE = 'https://swissforkids.ch';
const MIN_ITEMS_TO_INDEX = 3; // list pages with fewer entries get noindex and stay out of the sitemap

const CANTONS = {
  AG: 'Aargau', AI: 'Appenzell Innerrhoden', AR: 'Appenzell Ausserrhoden', BE: 'Bern', BL: 'Basel-Landschaft',
  BS: 'Basel-Stadt', FR: 'Freiburg', GE: 'Genf', GL: 'Glarus', GR: 'Graubünden', JU: 'Jura', LU: 'Luzern',
  NE: 'Neuenburg', NW: 'Nidwalden', OW: 'Obwalden', SG: 'St. Gallen', SH: 'Schaffhausen', SO: 'Solothurn',
  SZ: 'Schwyz', TG: 'Thurgau', TI: 'Tessin', UR: 'Uri', VD: 'Waadt', VS: 'Wallis', ZG: 'Zug', ZH: 'Zürich',
  FL: 'Liechtenstein'
};
const DIFF = { easy: 'leicht', moderate: 'mittel', medium: 'mittel', hard: 'anspruchsvoll', difficult: 'anspruchsvoll' };
const TYPE_DE = { playpark: 'Spielplatz', swimmingpool: 'Schwimmbad', gamezone: 'Indoor-Spielplatz' };

let state = null;
let cfg = {};

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'ort';
}
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return fallback; }
}
function uniqueSlug(base, used) {
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  return s;
}
function isGenericName(name) {
  return /^(playground|swimming pool|indoor play center|spielplatz|schwimmbad) (in|at) /i.test(name || '');
}

function build() {
  const pub = cfg.publicDir, dataDir = cfg.dataDir;
  const zips = readJson(path.join(pub, 'postal-codes.json'), {});
  const harvested = readJson(path.join(dataDir, 'spots_harvested.json'), null) || readJson(path.join(pub, 'spots_harvested.json'), []);
  const base = readJson(path.join(pub, 'base_spots.json'), []);
  const hikesRaw = readJson(path.join(pub, 'hikes.json'), []);

  const placeOf = (zip, fallbackCity) => {
    const z = zips[String(zip || '').trim()];
    const city = String((z && z.city) || fallbackCity || '').replace(/\s+\d+$/, '').trim(); // 'Uster 1' -> 'Uster'
    return { canton: z ? z.canton : null, city };
  };

  // ---- Spots (playgrounds, pools, indoor) ----
  const spots = [];
  const spotById = {};
  const seenSpotIds = new Set();
  for (const s of [...base.map(x => ({ ...x, curated: true })), ...harvested]) {
    if (!s || !s.id || seenSpotIds.has(s.id)) continue;
    seenSpotIds.add(s.id);
    const pl = placeOf(s.zip, s.city);
    if (!pl.canton) continue;
    const item = {
      id: s.id, type: s.type, curated: !!s.curated,
      name: s.name, generic: isGenericName(s.name),
      description: s.curated ? s.description : '', // harvested spots only have placeholder text
      address: s.address, zip: s.zip, city: pl.city, canton: pl.canton,
      lat: s.lat, lng: s.lng, fees: s.curated ? s.fees : '', hours: s.curated ? s.openingHours : '',
      amenities: s.curated ? (s.amenities || []) : [],
      imageUrl: s.imageUrl || ''
    };
    spots.push(item);
    spotById[s.id] = item;
  }

  // Curated detail pages
  const usedSpot = new Set();
  const curatedPages = {};
  for (const s of spots.filter(x => x.curated)) {
    s.slug = uniqueSlug(slugify(`${s.name}-${s.city}`), usedSpot);
    curatedPages[s.slug] = s;
  }

  // Grouped list pages: /{section}/{kanton}/{stadt}
  const sections = {
    spielplaetze: { type: 'playpark', title: 'Spielplätze', singular: 'Spielplatz' },
    schwimmbaeder: { type: 'swimmingpool', title: 'Schwimmbäder & Badis', singular: 'Schwimmbad' },
    'indoor-spielplaetze': { type: 'gamezone', title: 'Indoor-Spielplätze', singular: 'Indoor-Spielplatz' }
  };
  const groups = {}; // section -> canton -> city -> items
  for (const [sec, def] of Object.entries(sections)) {
    groups[sec] = {};
    for (const s of spots.filter(x => x.type === def.type)) {
      const c = (groups[sec][s.canton] ||= {});
      (c[s.city] ||= []).push(s);
    }
  }

  // ---- Hikes ----
  const usedHike = new Set();
  const hikes = {};
  const hikeById = {};
  const hikesByCanton = {};
  for (const h of hikesRaw) {
    if (!h || !h.id) continue;
    const name = h.nameDe || h.name;
    const hk = {
      id: h.id, name, nameEn: h.name, slug: uniqueSlug(slugify(name.split(':')[0] + '-' + (h.city || '')), usedHike),
      canton: h.canton, region: h.region, city: h.city,
      description: h.descriptionDe || h.description || '',
      distanceKm: h.distanceKm, durationText: h.durationText, ascentM: h.ascentM, descentM: h.descentM,
      minEl: h.minElevationM, maxEl: h.maxElevationM, difficulty: DIFF[String(h.difficulty || '').toLowerCase()] || h.difficulty,
      season: h.season, winter: !!h.isWinterTrail, stroller: h.strollerFriendly === 'yes',
      startStop: h.startStop, endStop: h.endStop, officialUrl: h.schweizMobilUrlDe || h.schweizMobilUrlEn || '',
      imageUrl: h.imageUrl || '',
      lat: h.lat, lng: h.lng
    };
    hikes[hk.slug] = hk;
    hikeById[hk.id] = hk;
    (hikesByCanton[hk.canton] ||= []).push(hk);
  }

  state = { spots, spotById, curatedPages, sections, groups, hikes, hikeById, hikesByCanton, builtAt: new Date().toISOString().slice(0, 10) };
}

// ---------- HTML ----------
function page({ title, description, canonical, h1, body, noindex, breadcrumbs, lang, extraSchema, ogImage }) {
  const crumbs = breadcrumbs || [];
  const schemas = [];
  if (crumbs.length) {
    schemas.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] }))
    });
  }
  if (extraSchema) {
    if (Array.isArray(extraSchema)) schemas.push(...extraSchema);
    else schemas.push(extraSchema);
  }
  const ld = schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('');
  const ogImgTag = ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : '';
  return `<!doctype html><html lang="${lang || 'de'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${canonical}"><meta property="og:type" content="article">${ogImgTag}
<link rel="canonical" href="${SITE}${canonical}">${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" href="/favicon-48x48.png" sizes="48x48">
<link rel="icon" type="image/png" href="/favicon.png" sizes="512x512">
<link rel="apple-touch-icon" href="/favicon.png">${ld}
<style>
:root{--fg:#1d2a33;--muted:#5b6b75;--bg:#f7f9fa;--card:#fff;--acc:#d90429;--acc2:#2a9d8f;--line:#e3e8eb}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg)}
header,main,footer{max-width:920px;margin:0 auto;padding:16px}
header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-bottom:1px solid var(--line);background:#fff}
header a.brand{display:inline-flex;align-items:center;gap:10px;font-weight:800;color:var(--fg);text-decoration:none;font-size:1.25rem}
header a.brand span{color:var(--acc)}
header a.brand img{width:38px;height:38px;border-radius:50%;object-fit:contain;box-shadow:0 2px 8px rgba(217,4,41,.22)}
header nav{display:flex;gap:14px;flex-wrap:wrap;font-size:.92rem}header nav a{color:var(--fg);text-decoration:none;font-weight:600}header nav a:hover{color:var(--acc)}
nav.bc{font-size:.85rem;color:var(--muted);margin-bottom:8px}nav.bc a{color:var(--muted)}h1{font-size:1.85rem;line-height:1.22;margin:.3em 0 .4em}
.subtitle{font-size:1.08rem;color:var(--muted);margin:0 0 1.2em}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0;box-shadow:0 2px 8px rgba(0,0,0,.03)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}.facts div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
.facts b{display:block;font-size:.8rem;color:var(--muted);font-weight:500}ul.list{list-style:none;padding:0}ul.list li{padding:10px 0;border-bottom:1px solid var(--line)}
.btn{display:inline-block;background:var(--acc);color:#fff;padding:9px 16px;border-radius:999px;text-decoration:none;font-weight:600;font-size:.9rem;margin-right:8px;margin-top:6px}
.btn-sec{display:inline-block;background:#eef3f5;color:var(--fg);padding:9px 16px;border-radius:999px;text-decoration:none;font-weight:600;font-size:.9rem;margin-top:6px}
.tags span,.badge{display:inline-block;background:#eef3f5;color:#1d2a33;border-radius:999px;padding:3px 11px;margin:2px;font-size:.82rem;font-weight:600}
.rank-badge{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--acc);color:#fff;font-weight:800;margin-right:10px;flex-shrink:0}
.spot-guide-card{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
.spot-guide-img{width:100%;height:165px;object-fit:cover;border-radius:10px;background:#0f172a}
.tip-box{background:#f0fdf4;border-left:4px solid var(--acc2);padding:10px 14px;border-radius:6px;font-size:.92rem;margin:10px 0}
.blog-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin:18px 0}
.blog-card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;text-decoration:none;color:inherit;transition:transform .15s ease,box-shadow .15s ease}
.blog-card:hover{transform:translateY(-3px);box-shadow:0 8px 20px rgba(0,0,0,.08)}
.blog-card img{width:100%;height:160px;object-fit:cover;background:#0f172a}
.blog-card-body{padding:16px;display:flex;flex-direction:column;flex:1}
.blog-card-body h2{font-size:1.12rem;margin:6px 0 8px;line-height:1.3;color:var(--fg)}
.blog-card-body p{font-size:.9rem;color:var(--muted);margin:0 0 12px;flex:1}
.table-wrap{overflow-x:auto;margin:14px 0}
table.guide-table{width:100%;border-collapse:collapse;font-size:.9rem;background:#fff;border-radius:10px;overflow:hidden}
table.guide-table th,table.guide-table td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
table.guide-table th{background:#f1f5f9;font-weight:700;color:var(--fg);white-space:nowrap}
table.guide-table tr:last-child td{border-bottom:none}
@media(max-width:640px){.spot-guide-card{grid-template-columns:1fr}.spot-guide-img{height:190px}h1{font-size:1.45rem}}
a{color:#1b6fa8}.muted{color:var(--muted);font-size:.9rem}footer{color:var(--muted);font-size:.85rem;border-top:1px solid var(--line);margin-top:32px;padding-top:20px}
</style></head><body>
<header>
  <a class="brand" href="/"><img src="/favicon.png" alt="SwissKidsSpots Logo" width="38" height="38">SwissKids<span>Spots</span></a>
  <nav>
    <a href="/">Interactive Map</a>
    <a href="/blog">Family Guides &amp; Blog</a>
    <a href="/spielplaetze">Spielplätze</a>
    <a href="/schwimmbaeder">Badis &amp; Pools</a>
    <a href="/wandern">Family Hikes</a>
  </nav>
</header>
<main>${crumbs.length ? `<nav class="bc">${crumbs.map(c => `<a href="${c[1]}">${esc(c[0])}</a>`).join(' › ')}</nav>` : ''}
<h1>${esc(h1)}</h1>${body}</main>
<footer><a href="/blog">Family Blog &amp; Top 10 Guides</a> · <a href="/spielplaetze">Spielplätze</a> · <a href="/schwimmbaeder">Schwimmbäder</a> · <a href="/indoor-spielplaetze">Indoor-Spielplätze</a> · <a href="/wandern">Familienwanderungen</a> · <a href="/wandern/kinderwagen">Kinderwagen-Wanderungen</a> · <a href="/wandern/winter">Winterwanderungen</a></footer>
</body></html>`;
}
const appLink = (param, id, label) => `<p><a class="btn" href="/?${param}=${encodeURIComponent(id)}">${esc(label)}</a></p>`;

function spotLine(s) {
  const label = s.generic ? `${TYPE_DE[s.type] || 'Ort'} in ${s.city}` : s.name;
  const href = s.curated ? `/ausflug/${s.slug}` : `/?spot=${encodeURIComponent(s.id)}`;
  return `<li><a href="${href}">${esc(label)}</a> <span class="muted">${esc(s.zip || '')} ${esc(s.city)}</span></li>`;
}
function sortItems(items) {
  return items.slice().sort((a, b) => (b.curated - a.curated) || (a.generic - b.generic) || a.name.localeCompare(b.name, 'de'));
}

// /spielplaetze , /schwimmbaeder , /indoor-spielplaetze
function sectionHub(sec) {
  const def = state.sections[sec], g = state.groups[sec];
  const rows = Object.keys(g).sort((a, b) => (CANTONS[a] || a).localeCompare(CANTONS[b] || b, 'de')).map(k => {
    const n = Object.values(g[k]).reduce((t, a) => t + a.length, 0);
    return `<li><a href="/${sec}/${slugify(CANTONS[k] || k)}">${esc(def.title)} im Kanton ${esc(CANTONS[k] || k)}</a> <span class="muted">${n}</span></li>`;
  }).join('');
  const total = Object.values(g).flatMap(c => Object.values(c)).reduce((t, a) => t + a.length, 0);
  return page({
    title: `${def.title} in der Schweiz – ${total} Orte für Familien | SwissForKids`,
    description: `${total} ${def.title} für Kinder in allen Kantonen der Schweiz. Nach Kanton und Ort sortiert, mit Karte und Wetter-Check.`,
    canonical: `/${sec}`, h1: `${def.title} in der Schweiz`,
    breadcrumbs: [['Start', '/'], [def.title, `/${sec}`]],
    body: `<p>Finde ${def.title} für Kinder in deiner Nähe – ${total} Orte in der ganzen Schweiz. Wähle deinen Kanton:</p><ul class="list">${rows}</ul>${appLink('', '', 'Karte mit Umkreissuche öffnen').replace('/?=', '/?')}`
  });
}
function cantonKeyFromSlug(slug) {
  return Object.keys(CANTONS).find(k => slugify(CANTONS[k]) === slug);
}
function sectionCanton(sec, kt) {
  const def = state.sections[sec], cities = state.groups[sec][kt];
  if (!cities) return null;
  const cn = CANTONS[kt], ks = slugify(cn);
  const total = Object.values(cities).reduce((t, a) => t + a.length, 0);
  const cityRows = Object.keys(cities).sort((a, b) => cities[b].length - cities[a].length || a.localeCompare(b, 'de'))
    .map(c => `<li><a href="/${sec}/${ks}/${slugify(c)}">${esc(def.title)} in ${esc(c)}</a> <span class="muted">${cities[c].length}</span></li>`).join('');
  return page({
    title: `${def.title} im Kanton ${cn} – ${total} Orte | SwissForKids`,
    description: `${total} ${def.title} für Kinder im Kanton ${cn}, nach Gemeinde sortiert. Mit Karte, Umkreissuche und Wetter-Check.`,
    canonical: `/${sec}/${ks}`, h1: `${def.title} im Kanton ${cn}`, noindex: total < MIN_ITEMS_TO_INDEX,
    breadcrumbs: [['Start', '/'], [def.title, `/${sec}`], [cn, `/${sec}/${ks}`]],
    body: `<p>Im Kanton ${esc(cn)} kennen wir ${total} ${esc(def.title)} in ${Object.keys(cities).length} Gemeinden.</p><ul class="list">${cityRows}</ul>`
  });
}
function findCity(sec, kt, citySlug) {
  const cities = state.groups[sec][kt] || {};
  const c = Object.keys(cities).find(x => slugify(x) === citySlug);
  return c ? [c, cities[c]] : [null, null];
}
function sectionCity(sec, kt, citySlug) {
  const def = state.sections[sec];
  const [city, items] = findCity(sec, kt, citySlug);
  if (!city) return null;
  const cn = CANTONS[kt], ks = slugify(cn), n = items.length;
  const named = items.filter(i => !i.generic).slice(0, 3).map(i => i.name);
  const intro = `${n === 1 ? `Ein ${def.singular}` : `${n} ${def.title}`} in ${esc(city)} (Kanton ${esc(cn)})` +
    (named.length ? `, darunter ${named.map(esc).join(', ')}.` : '.') +
    ` Öffne einen Eintrag auf der Karte, um Lage, Anfahrt mit dem ÖV und das aktuelle Wetter zu sehen.`;
  return page({
    title: `${def.title} in ${city} – ${n} ${n === 1 ? 'Ort' : 'Orte'} für Kinder | SwissForKids`,
    description: `${n} ${def.title} für Kinder in ${city} (${kt}): Übersicht mit Karte, ÖV-Anfahrt und Wetter-Check.`,
    canonical: `/${sec}/${ks}/${slugify(city)}`, h1: `${def.title} in ${city}`, noindex: n < MIN_ITEMS_TO_INDEX,
    breadcrumbs: [['Start', '/'], [def.title, `/${sec}`], [cn, `/${sec}/${ks}`], [city, `/${sec}/${ks}/${slugify(city)}`]],
    body: `<p>${intro}</p><ul class="list">${sortItems(items).map(spotLine).join('')}</ul>`
  });
}
function curatedPage(slug) {
  const s = state.curatedPages[slug];
  if (!s) return null;
  const def = Object.entries(state.sections).find(([, d]) => d.type === s.type) || ['spielplaetze', state.sections.spielplaetze];
  const cn = CANTONS[s.canton], ks = slugify(cn);
  const facts = [['Ort', `${s.zip} ${s.city}`], ['Kanton', cn], s.fees && ['Eintritt', s.fees], s.hours && ['Öffnungszeiten', s.hours]].filter(Boolean)
    .map(([k, v]) => `<div><b>${esc(k)}</b>${esc(v)}</div>`).join('');
  return page({
    title: `${s.name}, ${s.city} – ${TYPE_DE[s.type] || 'Ausflug'} für Kinder | SwissForKids`,
    description: `${s.name} in ${s.city}: ${(s.description || '').slice(0, 130)}`,
    canonical: `/ausflug/${slug}`, h1: `${s.name}, ${s.city}`,
    breadcrumbs: [['Start', '/'], [def[1].title, `/${def[0]}`], [cn, `/${def[0]}/${ks}`], [s.name, `/ausflug/${slug}`]],
    body: `<div class="facts">${facts}</div>${s.description ? `<div class="card"><p>${esc(s.description)}</p></div>` : ''}
${s.amenities.length ? `<p class="tags">${s.amenities.map(a => `<span>${esc(a)}</span>`).join('')}</p>` : ''}
<p>Adresse: ${esc(s.address || '')}</p>${appLink('spot', s.id, 'Auf der Karte öffnen – mit Wetter & ÖV')}
<p><a href="/${def[0]}/${ks}/${slugify(s.city)}">Weitere ${esc(def[1].title)} in ${esc(s.city)}</a></p>`
  });
}

// ---- Hikes ----
function hikeLine(h) {
  return `<li><a href="/wandern/${h.slug}">${esc(h.name)}</a> <span class="muted">${h.distanceKm ?? '?'} km · ${esc(h.durationText || '')} · ${esc(h.difficulty || '')}${h.stroller ? ' · Kinderwagen' : ''}${h.winter ? ' · Winter' : ''}</span></li>`;
}
function hikeList({ title, h1, canonical, intro, items, crumbs }) {
  const sorted = items.slice().sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99));
  return page({ title, description: intro.slice(0, 155), canonical, h1, noindex: items.length < MIN_ITEMS_TO_INDEX, breadcrumbs: crumbs,
    body: `<p>${esc(intro)}</p><ul class="list">${sorted.map(hikeLine).join('')}</ul>` });
}
function hikesHub() {
  const rows = Object.keys(state.hikesByCanton).sort((a, b) => (CANTONS[a] || a).localeCompare(CANTONS[b] || b, 'de'))
    .map(k => `<li><a href="/wandern/kanton/${slugify(CANTONS[k] || k)}">Familienwanderungen im Kanton ${esc(CANTONS[k] || k)}</a> <span class="muted">${state.hikesByCanton[k].length}</span></li>`).join('');
  const n = Object.keys(state.hikes).length;
  return page({
    title: `Familienwanderungen in der Schweiz – ${n} Routen | SwissForKids`,
    description: `${n} Wanderungen für Familien in der Schweiz: mit Distanz, Höhenmetern, Dauer, ÖV-Anreise, Kinderwagen- und Winterwanderwegen.`,
    canonical: '/wandern', h1: 'Familienwanderungen in der Schweiz', breadcrumbs: [['Start', '/'], ['Wandern', '/wandern']],
    body: `<p><a href="/wandern/kinderwagen">Kinderwagentaugliche Wanderungen</a> · <a href="/wandern/winter">Winterwanderungen</a></p><ul class="list">${rows}</ul>`
  });
}
function hikePage(slug) {
  const h = state.hikes[slug];
  if (!h) return null;
  const cn = CANTONS[h.canton] || h.canton;
  const f = [['Distanz', h.distanceKm != null && `${h.distanceKm} km`], ['Dauer', h.durationText], ['Schwierigkeit', h.difficulty],
    ['Aufstieg / Abstieg', h.ascentM != null && `↑ ${h.ascentM} m / ↓ ${h.descentM} m`], ['Höhe', h.minEl != null && `${h.minEl}–${h.maxEl} m ü. M.`],
    ['Saison', h.season], ['Start', h.startStop], ['Ziel', h.endStop], ['Kinderwagen', h.stroller ? 'geeignet' : 'nicht empfohlen'],
    ['Winterwanderweg', h.winter ? 'ja' : null]].filter(x => x[1]).map(([k, v]) => `<div><b>${k}</b>${esc(v)}</div>`).join('');
  return page({
    title: `${h.name} – Familienwanderung${h.winter ? ' & Winterwanderung' : ''} (${h.distanceKm} km) | SwissForKids`,
    description: `${h.name}: ${h.distanceKm} km, ${h.durationText}, ${h.difficulty}. ${h.description}`.slice(0, 155),
    canonical: `/wandern/${slug}`, h1: h.name,
    breadcrumbs: [['Start', '/'], ['Wandern', '/wandern'], [cn, `/wandern/kanton/${slugify(cn)}`], [h.name, `/wandern/${slug}`]],
    body: `<div class="facts">${f}</div><div class="card"><p>${esc(h.description)}</p></div>
${appLink('hike', h.id, 'Route, Höhenprofil & ÖV-Verbindung öffnen')}
${h.officialUrl ? `<p class="muted">Offizielle Routeninfo: <a href="${esc(h.officialUrl)}" rel="nofollow noopener">${esc(new URL(h.officialUrl).hostname)}</a></p>` : ''}
<p><a href="/wandern/kanton/${slugify(cn)}">Weitere Familienwanderungen im Kanton ${esc(cn)}</a></p>`
  });
}

// ---- Blog & Family Guides ----
function blogHub() {
  const cards = BLOG_POSTS.map(post => {
    const firstItem = post.items && post.items[0];
    const refSpot = firstItem && (firstItem.spotId ? state.spotById[firstItem.spotId] : (firstItem.hikeId ? state.hikeById[firstItem.hikeId] : null));
    const imgUrl = (firstItem && firstItem.imageUrl) || (refSpot && refSpot.imageUrl) || post.heroImage || '/favicon.png';
    return `<a class="blog-card" href="/blog/${esc(post.slug)}">
      <img src="${esc(imgUrl)}" alt="${esc(post.title)}" loading="lazy" referrerpolicy="no-referrer">
      <div class="blog-card-body">
        <div><span class="badge">${esc(post.category)}</span> <span class="muted" style="font-size:.8rem">${esc(post.readTime)}</span></div>
        <h2>${esc(post.title)}</h2>
        <p>${esc(post.subtitle)}</p>
        <span style="color:var(--acc);font-weight:700;font-size:.88rem">Read Guide &rarr;</span>
      </div>
    </a>`;
  }).join('');

  return page({
    lang: 'en',
    title: 'Swiss Family Blog & Guides (Playparks, Hiking, Mineral Baths & Sledging) | SwissForKids',
    description: 'Honest, family-tested guides in Switzerland: playparks in Zürich, Lucerne & Interlaken, summer/autumn/winter hikes, mineral baths with real age rules, and sledging runs by distance & price.',
    canonical: '/blog',
    h1: 'Swiss Family Blog & Guides',
    breadcrumbs: [['Home', '/'], ['Family Guides & Blog', '/blog']],
    body: `<p class="subtitle">Practical, parent-tested guides to Switzerland's best playgrounds, seasonal hiking trails, mineral baths, and winter sledging runs — complete with SBB tips, honest price checks, and direct map links.</p>
    <div class="blog-grid">${cards}</div>
    <div class="card" style="margin-top:28px">
      <h2 style="margin-top:0">Browse All 6,300+ Kids Spots &amp; 1,481 Hikes by Region</h2>
      <p>Use our interactive map with live MeteoSwiss weather suitability checks or browse our canton directories:</p>
      <p>
        <a class="btn" href="/">Open Interactive Map &amp; Weather Finder</a>
        <a class="btn-sec" href="/spielplaetze">All Playgrounds by Canton</a>
        <a class="btn-sec" href="/schwimmbaeder">All Swimming Pools &amp; Badis</a>
        <a class="btn-sec" href="/wandern">All 1,481 Family Hikes</a>
      </p>
    </div>`
  });
}

function blogPostPage(slug) {
  const post = BLOG_POSTS.find(p => p.slug === slug);
  if (!post) return null;

  const itemCards = post.items.map(item => {
    const isHike = !!item.hikeId;
    const ref = isHike ? state.hikeById[item.hikeId] : (item.spotId ? state.spotById[item.spotId] : null);
    const imgUrl = item.imageUrl || (ref && ref.imageUrl) || post.heroImage || '';
    const mapHref = item.hikeId
      ? `/?hike=${encodeURIComponent(item.hikeId)}`
      : (item.spotId ? `/?spot=${encodeURIComponent(item.spotId)}` : (item.actionHref || '/'));
    const seoHref = ref && ref.slug ? (isHike ? `/wandern/${ref.slug}` : (ref.curated ? `/ausflug/${ref.slug}` : null)) : null;
    const primaryLabel = item.hikeId
      ? 'Open Trail Map, Elevation &amp; SBB'
      : (item.spotId ? 'Open on Interactive Map &amp; Weather' : (item.actionLabel || 'Explore on Interactive Map'));

    return `<article class="card" id="rank-${item.rank}">
      <div style="display:flex;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <span class="rank-badge">${item.rank}</span>
        <h2 style="margin:0;font-size:1.28rem;flex:1">${esc(item.name)}</h2>
        <span class="badge">${esc(item.badge)}</span>
      </div>
      <div class="spot-guide-card">
        ${imgUrl ? `<a href="${mapHref}"><img class="spot-guide-img" src="${esc(imgUrl)}" alt="${esc(item.name)}" loading="lazy" referrerpolicy="no-referrer"></a>` : ''}
        <div>
          <p class="muted" style="margin:0 0 8px"><strong>📍 Location &amp; Transit:</strong> ${esc(item.location)}</p>
          <p style="margin:0 0 10px">${esc(item.summary)}</p>
          ${item.tip ? `<div class="tip-box"><strong>💡 Parent Tip:</strong> ${esc(item.tip)}</div>` : ''}
          <div>
            <a class="btn" href="${mapHref}">${primaryLabel}</a>
            ${seoHref ? `<a class="btn-sec" href="${seoHref}">${isHike ? 'Route Fact Sheet' : 'Spot Fact Sheet'}</a>` : ''}
          </div>
        </div>
      </div>
    </article>`;
  }).join('');

  const tableHtml = post.table ? `<div class="card">
    <h2 style="margin-top:0;font-size:1.15rem">${esc(post.table.title || 'Quick Comparison')}</h2>
    <div class="table-wrap"><table class="guide-table">
      <thead><tr>${post.table.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${post.table.rows.map(row => `<tr>${row.map((cell, i) => `<td>${i === 0 ? `<strong>${esc(cell)}</strong>` : esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>` : '';

  const otherPosts = BLOG_POSTS.filter(p => p.slug !== slug).map(p =>
    `<li><a href="/blog/${esc(p.slug)}"><strong>${esc(p.title)}</strong></a> <span class="muted">(${esc(p.category)})</span></li>`
  ).join('');

  const relatedLinks = (post.internalLinks || []).map(l =>
    `<a class="btn-sec" href="${esc(l.href)}" style="margin-right:8px">${esc(l.label)}</a>`
  ).join('');

  const firstItem = post.items[0];
  const firstRef = firstItem && (firstItem.spotId ? state.spotById[firstItem.spotId] : (firstItem.hikeId ? state.hikeById[firstItem.hikeId] : null));
  const ogImage = (firstItem && firstItem.imageUrl) || (firstRef && firstRef.imageUrl) || post.heroImage;

  const extraSchema = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.metaDescription,
      datePublished: post.publishedAt,
      dateModified: state.builtAt,
      author: { '@type': 'Organization', name: 'SwissForKids', url: SITE },
      publisher: { '@type': 'Organization', name: 'SwissForKids', url: SITE },
      mainEntityOfPage: `${SITE}/blog/${post.slug}`,
      image: ogImage ? [ogImage] : undefined
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: post.title,
      numberOfItems: post.items.length,
      itemListElement: post.items.map(it => ({
        '@type': 'ListItem',
        position: it.rank,
        name: it.name,
        description: it.summary,
        url: it.hikeId
          ? `${SITE}/?hike=${encodeURIComponent(it.hikeId)}`
          : (it.spotId ? `${SITE}/?spot=${encodeURIComponent(it.spotId)}` : `${SITE}/blog/${post.slug}#rank-${it.rank}`)
      }))
    }
  ];

  return page({
    lang: 'en',
    title: `${post.title} | SwissForKids`,
    description: post.metaDescription,
    canonical: `/blog/${post.slug}`,
    h1: post.title,
    ogImage,
    extraSchema,
    breadcrumbs: [['Home', '/'], ['Family Guides & Blog', '/blog'], [post.title, `/blog/${post.slug}`]],
    body: `<p class="subtitle">${esc(post.subtitle)}</p>
    <p><span class="badge">${esc(post.category)}</span> <span class="muted">Updated ${esc(state.builtAt)} &bull; ${esc(post.readTime)}</span></p>
    <div class="card"><p style="margin:0;font-size:1.03rem">${esc(post.intro)}</p></div>
    ${tableHtml}
    ${itemCards}
    ${relatedLinks ? `<div class="card"><h3>Explore More in This Category</h3><p>${relatedLinks}</p></div>` : ''}
    <div class="card">
      <h3 style="margin-top:0">More Swiss Family Guides</h3>
      <ul class="list">${otherPosts}</ul>
      <p><a class="btn" href="/blog">View All Family Guides</a> <a class="btn-sec" href="/">Open Interactive Map</a></p>
    </div>`
  });
}

// ---------- Routing ----------
function render(pathname) {
  const p = decodeURIComponent(pathname).replace(/\/+$/, '') || '/';
  const parts = p.split('/').filter(Boolean);
  if (!parts.length) return null;
  const [a, b, c] = parts;

  if (a === 'blog') {
    if (parts.length === 1) return blogHub();
    if (parts.length === 2) return blogPostPage(b);
    return null;
  }
  if (state.sections[a]) {
    if (parts.length === 1) return sectionHub(a);
    const kt = cantonKeyFromSlug(b);
    if (!kt) return null;
    if (parts.length === 2) return sectionCanton(a, kt);
    if (parts.length === 3) return sectionCity(a, kt, c);
    return null;
  }
  if (a === 'ausflug' && parts.length === 2) return curatedPage(b);
  if (a === 'wandern') {
    const all = Object.values(state.hikes);
    if (parts.length === 1) return hikesHub();
    if (b === 'kinderwagen' && parts.length === 2) return hikeList({
      title: `Kinderwagen-Wanderungen in der Schweiz – ${all.filter(h => h.stroller).length} Routen | SwissForKids`,
      h1: 'Kinderwagentaugliche Wanderungen in der Schweiz', canonical: '/wandern/kinderwagen',
      intro: 'Wanderungen mit Kinderwagen: Routen auf befestigten oder gut begehbaren Wegen, mit Distanz, Dauer und ÖV-Anreise.',
      items: all.filter(h => h.stroller), crumbs: [['Start', '/'], ['Wandern', '/wandern'], ['Kinderwagen', '/wandern/kinderwagen']] });
    if (b === 'winter' && parts.length === 2) return hikeList({
      title: `Winterwanderungen mit Kindern – ${all.filter(h => h.winter).length} Winterwanderwege | SwissForKids`,
      h1: 'Winterwanderungen mit Kindern in der Schweiz', canonical: '/wandern/winter',
      intro: 'Präparierte Winterwanderwege für Familien in der ganzen Schweiz, mit Distanz, Dauer und Anreise mit dem ÖV.',
      items: all.filter(h => h.winter), crumbs: [['Start', '/'], ['Wandern', '/wandern'], ['Winter', '/wandern/winter']] });
    if (b === 'kanton' && parts.length === 3) {
      const kt = cantonKeyFromSlug(c);
      if (!kt || !state.hikesByCanton[kt]) return null;
      const cn = CANTONS[kt];
      return hikeList({ title: `Familienwanderungen im Kanton ${cn} – ${state.hikesByCanton[kt].length} Routen | SwissForKids`,
        h1: `Familienwanderungen im Kanton ${cn}`, canonical: `/wandern/kanton/${c}`,
        intro: `${state.hikesByCanton[kt].length} Wanderungen für Familien im Kanton ${cn}, sortiert nach Länge – mit Höhenmetern, Dauer und ÖV-Anreise.`,
        items: state.hikesByCanton[kt], crumbs: [['Start', '/'], ['Wandern', '/wandern'], [cn, `/wandern/kanton/${c}`]] });
    }
    if (parts.length === 2) return hikePage(b);
  }
  return null;
}

function sitemapUrls() {
  const urls = ['/', '/blog', ...BLOG_POSTS.map(p => `/blog/${p.slug}`), '/wandern', '/wandern/kinderwagen', '/wandern/winter'];
  for (const [sec, g] of Object.entries(state.groups)) {
    urls.push(`/${sec}`);
    for (const [kt, cities] of Object.entries(g)) {
      const ks = slugify(CANTONS[kt]);
      if (Object.values(cities).reduce((t, a) => t + a.length, 0) >= MIN_ITEMS_TO_INDEX) urls.push(`/${sec}/${ks}`);
      for (const [city, items] of Object.entries(cities)) if (items.length >= MIN_ITEMS_TO_INDEX) urls.push(`/${sec}/${ks}/${slugify(city)}`);
    }
  }
  for (const slug of Object.keys(state.curatedPages)) urls.push(`/ausflug/${slug}`);
  for (const [kt, items] of Object.entries(state.hikesByCanton)) if (items.length >= MIN_ITEMS_TO_INDEX) urls.push(`/wandern/kanton/${slugify(CANTONS[kt] || kt)}`);
  for (const slug of Object.keys(state.hikes)) urls.push(`/wandern/${slug}`);
  return [...new Set(urls)];
}
function sitemapXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapUrls().map(u => `<url><loc>${SITE}${encodeURI(u)}</loc><lastmod>${state.builtAt}</lastmod></url>`).join('\n') + '\n</urlset>\n';
}

module.exports = {
  init(options) { cfg = options; build(); },
  rebuild: build,
  sitemapUrls: () => sitemapUrls(),
  // Returns true if the request was handled.
  handle(req, res, pathname) {
    if (!state || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
    if (pathname === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(req.method === 'HEAD' ? undefined : sitemapXml());
      return true;
    }
    if (pathname.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(pathname)) return false;
    let html;
    try { html = render(pathname); } catch (e) { console.error('SEO render failed', pathname, e); return false; }
    if (!html) return false;
    // Redirect trailing-slash variants to the canonical form
    if (pathname.length > 1 && pathname.endsWith('/')) {
      res.writeHead(301, { Location: pathname.replace(/\/+$/, '') });
      res.end();
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : html);
    return true;
  }
};
