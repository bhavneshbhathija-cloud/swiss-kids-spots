// seo.js — server-rendered, crawlable German pages + dynamic sitemap for swissforkids.ch
// Pages are built from the same JSON files the app uses. Each page links into the app via /?spot=ID or /?hike=ID.
const fs = require('fs');
const path = require('path');

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
  for (const s of [...base.map(x => ({ ...x, curated: true })), ...harvested]) {
    if (!s || !s.id) continue;
    const pl = placeOf(s.zip, s.city);
    if (!pl.canton) continue;
    spots.push({
      id: s.id, type: s.type, curated: !!s.curated,
      name: s.name, generic: isGenericName(s.name),
      description: s.curated ? s.description : '', // harvested spots only have placeholder text
      address: s.address, zip: s.zip, city: pl.city, canton: pl.canton,
      lat: s.lat, lng: s.lng, fees: s.curated ? s.fees : '', hours: s.curated ? s.openingHours : '',
      amenities: s.curated ? (s.amenities || []) : [] // harvested amenities are defaults, not real data
    });
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
  const hikesByCanton = {};
  for (const h of hikesRaw) {
    if (!h || !h.id) continue;
    const name = h.nameDe || h.name;
    const hk = {
      id: h.id, name, slug: uniqueSlug(slugify(name.split(':')[0] + '-' + (h.city || '')), usedHike),
      canton: h.canton, region: h.region, city: h.city,
      description: h.descriptionDe || h.description || '',
      distanceKm: h.distanceKm, durationText: h.durationText, ascentM: h.ascentM, descentM: h.descentM,
      minEl: h.minElevationM, maxEl: h.maxElevationM, difficulty: DIFF[String(h.difficulty || '').toLowerCase()] || h.difficulty,
      season: h.season, winter: !!h.isWinterTrail, stroller: h.strollerFriendly === 'yes',
      startStop: h.startStop, endStop: h.endStop, officialUrl: h.schweizMobilUrlDe || h.schweizMobilUrlEn || '',
      lat: h.lat, lng: h.lng
    };
    hikes[hk.slug] = hk;
    (hikesByCanton[hk.canton] ||= []).push(hk);
  }

  state = { spots, curatedPages, sections, groups, hikes, hikesByCanton, builtAt: new Date().toISOString().slice(0, 10) };
}

// ---------- HTML ----------
function page({ title, description, canonical, h1, body, noindex, breadcrumbs }) {
  const crumbs = breadcrumbs || [];
  const ld = crumbs.length ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] }))
  })}</script>` : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${canonical}">${noindex ? '<meta name="robots" content="noindex,follow">' : ''}
<link rel="icon" href="/favicon.png">${ld}
<style>
:root{--fg:#1d2a33;--muted:#5b6b75;--bg:#f7f9fa;--card:#fff;--acc:#e8553e;--line:#e3e8eb}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg)}
header,main,footer{max-width:900px;margin:0 auto;padding:16px}header a{font-weight:700;color:var(--acc);text-decoration:none;font-size:1.15rem}
nav.bc{font-size:.85rem;color:var(--muted)}nav.bc a{color:var(--muted)}h1{font-size:1.7rem;line-height:1.25;margin:.3em 0 .5em}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}.facts div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
.facts b{display:block;font-size:.8rem;color:var(--muted);font-weight:500}ul.list{list-style:none;padding:0}ul.list li{padding:10px 0;border-bottom:1px solid var(--line)}
.btn{display:inline-block;background:var(--acc);color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600}
.tags span{display:inline-block;background:#eef3f5;border-radius:999px;padding:2px 10px;margin:2px;font-size:.85rem}
a{color:#1b6fa8}.muted{color:var(--muted);font-size:.9rem}footer{color:var(--muted);font-size:.85rem}
</style></head><body>
<header><a href="/">SwissForKids</a></header>
<main>${crumbs.length ? `<nav class="bc">${crumbs.map(c => `<a href="${c[1]}">${esc(c[0])}</a>`).join(' › ')}</nav>` : ''}
<h1>${esc(h1)}</h1>${body}</main>
<footer><a href="/spielplaetze">Spielplätze</a> · <a href="/schwimmbaeder">Schwimmbäder</a> · <a href="/indoor-spielplaetze">Indoor-Spielplätze</a> · <a href="/wandern">Familienwanderungen</a> · <a href="/wandern/kinderwagen">Kinderwagen-Wanderungen</a> · <a href="/wandern/winter">Winterwanderungen</a></footer>
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

// ---------- Routing ----------
function render(pathname) {
  const p = decodeURIComponent(pathname).replace(/\/+$/, '') || '/';
  const parts = p.split('/').filter(Boolean);
  if (!parts.length) return null;
  const [a, b, c] = parts;

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
  const urls = ['/', '/wandern', '/wandern/kinderwagen', '/wandern/winter'];
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
