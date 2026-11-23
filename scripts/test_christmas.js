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

console.log('--- Testing English Christmas Blog ---');
const rEn = testRoute('/blog/best-christmas-markets-switzerland-for-kids');
console.log('rEn status:', rEn.statusCode, '| length:', rEn.body.length);
console.log('rEn has Montreux:', rEn.body.includes('Montreux Noël'));
console.log('rEn has rank-10:', rEn.body.includes('rank-10'));
console.log('rEn has hreflang de-CH:', rEn.body.includes('hreflang="de-CH"'));
console.log('rEn has switch to DE:', rEn.body.includes('href="/de/blog/beste-weihnachtsmaerkte-schweiz-fuer-familien"'));

console.log('--- Testing German Christmas Blog ---');
const rDe = testRoute('/de/blog/beste-weihnachtsmaerkte-schweiz-fuer-familien');
console.log('rDe status:', rDe.statusCode, '| length:', rDe.body.length);
console.log('rDe has Montreux DE:', rDe.body.includes('Montreux Noël'));
console.log('rDe has rank-10:', rDe.body.includes('rank-10'));
console.log('rDe has hreflang en:', rDe.body.includes('hreflang="en"'));
console.log('rDe has switch to EN:', rDe.body.includes('href="/blog/best-christmas-markets-switzerland-for-kids"'));

console.log('--- Checking Sitemap ---');
const sitemap = seo.sitemapUrls();
console.log('Sitemap total:', sitemap.length);
console.log('Has EN:', sitemap.includes('/blog/best-christmas-markets-switzerland-for-kids'));
console.log('Has DE:', sitemap.includes('/de/blog/beste-weihnachtsmaerkte-schweiz-fuer-familien'));
