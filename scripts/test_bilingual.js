const seo = require('../seo.js');
seo.init({ publicDir: '.', dataDir: '.' });

function testRoute(url) {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead: function(c, h) { this.statusCode = c; this.headers = h; },
    end: function(d) { this.body = d || ''; }
  };
  const handled = seo.handle({ method: 'GET', url, headers: { host: 'localhost:3000' } }, res, url);
  return { handled, statusCode: res.statusCode, body: res.body };
}

console.log('--- Testing /blog (EN Hub) ---');
const r1 = testRoute('/blog');
console.log('r1 status:', r1.statusCode, '| length:', r1.body.length, '| has de pill:', r1.body.includes('href="/de/blog"'), '| has hreflang:', r1.body.includes('hreflang="de-CH"'));

console.log('--- Testing /de/blog (DE Hub) ---');
const r2 = testRoute('/de/blog');
console.log('r2 status:', r2.statusCode, '| length:', r2.body.length, '| has en pill:', r2.body.includes('href="/blog"'), '| has title:', r2.body.includes('Schweizer Familien-Ratgeber'));

console.log('--- Testing /blog/rainy-day-children-activities-zurich (EN Post) ---');
const r3 = testRoute('/blog/rainy-day-children-activities-zurich');
console.log('r3 status:', r3.statusCode, '| length:', r3.body.length, '| has switch to de:', r3.body.includes('href="/de/blog/ausfluege-kinder-zuerich-schlechtwetter"'), '| has hreflang:', r3.body.includes('hreflang="de-CH"'));

console.log('--- Testing /de/blog/ausfluege-kinder-zuerich-schlechtwetter (DE Post) ---');
const r4 = testRoute('/de/blog/ausfluege-kinder-zuerich-schlechtwetter');
console.log('r4 status:', r4.statusCode, '| length:', r4.body.length, '| has switch to en:', r4.body.includes('href="/blog/rainy-day-children-activities-zurich"'), '| has Technorama DE:', r4.body.includes('Experimentierstationen'), '| has rank-28:', r4.body.includes('rank-28'));

console.log('--- Testing Sitemap ---');
const sitemap = seo.sitemapUrls();
console.log('Sitemap total URLs:', sitemap.length);
console.log('Has /blog:', sitemap.includes('/blog'));
console.log('Has /de/blog:', sitemap.includes('/de/blog'));
console.log('Has /de/blog/ausfluege-kinder-zuerich-schlechtwetter:', sitemap.includes('/de/blog/ausfluege-kinder-zuerich-schlechtwetter'));
console.log('Has /de/blog/indoor-spielplaetze-zuerich:', sitemap.includes('/de/blog/indoor-spielplaetze-zuerich'));
console.log('Has /de/blog/thermalbaeder-mineralbaeder-familien-schweiz:', sitemap.includes('/de/blog/thermalbaeder-mineralbaeder-familien-schweiz'));
