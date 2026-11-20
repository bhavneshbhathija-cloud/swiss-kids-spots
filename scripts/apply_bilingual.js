const fs = require('fs');
const path = require('path');

// 1. UPDATE seo.js
let seoCode = fs.readFileSync(path.join(__dirname, '..', 'seo.js'), 'utf8');

// Replace page() signature
seoCode = seoCode.replace(
  'function page({ title, description, canonical, h1, body, noindex, breadcrumbs, lang, extraSchema, ogImage }) {',
  'function page({ title, description, canonical, h1, body, noindex, breadcrumbs, lang, extraSchema, ogImage, alternates }) {'
);

// Replace canonical line to include hreflang alternates
seoCode = seoCode.replace(
  '<link rel="canonical" href="${SITE}${canonical}">${noindex ? \'<meta name="robots" content="noindex,follow">\' : \'\'}',
  '<link rel="canonical" href="${SITE}${canonical}">${(alternates && alternates.length) ? \'\\n\' + alternates.map(a => `<link rel="alternate" hreflang="${esc(a.hreflang)}" href="${SITE}${esc(a.href)}">`).join(\'\\n\') : \'\'}${noindex ? \'\\n<meta name="robots" content="noindex,follow">\' : \'\'}'
);

// Add lang-switcher CSS styles
if (!seoCode.includes('.lang-switcher{')) {
  seoCode = seoCode.replace(
    '.rank-badge{',
    '.lang-switcher{display:inline-flex;align-items:center;gap:8px;margin:8px 0 16px;padding:6px 14px;background:#fff;border:1px solid var(--line);border-radius:999px;font-size:.88rem;flex-wrap:wrap}\n.lang-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;text-decoration:none;font-weight:600;font-size:.85rem;background:#eef3f5;color:var(--fg);border:1px solid transparent}\n.lang-pill:hover{background:#e2e8f0}\n.lang-pill.active{background:var(--acc);color:#fff}\n.rank-badge{'
  );
}

// Replace blogHub function
const blogHubRegex = /function blogHub\(\) \{[\s\S]*?\n\}/;
const newBlogHub = `function blogHub(lang = 'en') {
  const isDe = lang === 'de';
  const dePosts = BLOG_POSTS.filter(p => p.lang === 'de');
  const enPosts = BLOG_POSTS.filter(p => p.lang !== 'de');
  const displayedPosts = isDe ? dePosts : enPosts;

  const cards = displayedPosts.map(post => {
    const firstItem = post.items && post.items[0];
    const refSpot = firstItem && (firstItem.spotId ? state.spotById[firstItem.spotId] : (firstItem.hikeId ? state.hikeById[firstItem.hikeId] : null));
    const imgUrl = (firstItem && firstItem.imageUrl) || (refSpot && refSpot.imageUrl) || post.heroImage || '/favicon.png';
    const cardHref = post.lang === 'de' ? \`/de/blog/\${esc(post.slug)}\` : \`/blog/\${esc(post.slug)}\`;
    return \`<a class="blog-card" href="\${cardHref}">
      <img src="\${esc(imgUrl)}" alt="\${esc(post.title)}" loading="lazy" referrerpolicy="no-referrer">
      <div class="blog-card-body">
        <div><span class="badge">\${esc(post.category)}</span> <span class="muted" style="font-size:.8rem">\${esc(post.readTime)}</span></div>
        <h2>\${esc(post.title)}</h2>
        <p>\${esc(post.subtitle)}</p>
        <span style="color:var(--acc);font-weight:700;font-size:.88rem">\${isDe ? 'Ratgeber lesen &rarr;' : 'Read Guide &rarr;'}</span>
      </div>
    </a>\`;
  }).join('');

  const alternates = [
    { hreflang: 'en', href: '/blog' },
    { hreflang: 'de-CH', href: '/de/blog' },
    { hreflang: 'de', href: '/de/blog' },
    { hreflang: 'x-default', href: '/blog' }
  ];

  const langSwitcherHtml = \`<div class="lang-switcher">
    <span class="muted">\${isDe ? 'Sprache:' : 'Language:'}</span>
    <a class="lang-pill \${!isDe ? 'active' : ''}" href="/blog">🇬🇧 English (\${enPosts.length})</a>
    <a class="lang-pill \${isDe ? 'active' : ''}" href="/de/blog">🇨🇭 Deutsch (\${dePosts.length})</a>
  </div>\`;

  const title = isDe
    ? 'Schweizer Familien-Ratgeber & Guides (Spielplätze, Schlechtwetter, Thermalbäder) | SwissForKids'
    : 'Swiss Family Blog & Guides (Playparks, Hiking, Mineral Baths & Sledging) | SwissForKids';
  const description = isDe
    ? 'Praxisnahe Familien-Ratgeber für die Schweiz: Die besten Schlechtwetter-Ausflüge in Zürich, Indoor-Spielplätze in Bern, Basel & Luzern und die schönsten Thermalbäder mit echten Altersregeln.'
    : 'Honest, family-tested guides in Switzerland: playparks in Zürich, Lucerne & Interlaken, summer/autumn/winter hikes, mineral baths with real age rules, and sledging runs by distance & price.';
  const canonical = isDe ? '/de/blog' : '/blog';
  const h1 = isDe ? 'Schweizer Familien-Ratgeber & Guides' : 'Swiss Family Blog & Guides';
  const breadcrumbs = isDe
    ? [['Start', '/'], ['Ratgeber & Blog', '/de/blog']]
    : [['Home', '/'], ['Family Guides & Blog', '/blog']];

  return page({
    lang: isDe ? 'de' : 'en',
    title,
    description,
    canonical,
    h1,
    alternates,
    breadcrumbs,
    body: \`\${langSwitcherHtml}
    <p class="subtitle">\${isDe
      ? 'Praktische, von Eltern getestete Empfehlungen für Schweizer Familienausflüge – mit echten ÖV-Verbindungen, Preis-Checks und direkten Kartenlinks.'
      : 'Practical, parent-tested guides to Switzerland\\'s best playgrounds, seasonal hiking trails, mineral baths, and winter sledging runs — complete with SBB tips, honest price checks, and direct map links.'}</p>
    <div class="blog-grid">\${cards}</div>
    <div class="card" style="margin-top:28px">
      <h2 style="margin-top:0">\${isDe ? 'Entdecke über 6\\'300 Ausflugsziele & 1\\'481 Wanderungen' : 'Browse All 6,300+ Kids Spots & 1,481 Hikes by Region'}</h2>
      <p>\${isDe ? 'Nutze unsere interaktive Karte mit Live-MeteoSchweiz-Wettercheck oder stöbere in den kantonalen Verzeichnissen:' : 'Use our interactive map with live MeteoSwiss weather suitability checks or browse our canton directories:'}</p>
      <p>
        <a class="btn" href="/">\${isDe ? 'Interaktive Karte &amp; Wetterfinder' : 'Open Interactive Map &amp; Weather Finder'}</a>
        <a class="btn-sec" href="/spielplaetze">\${isDe ? 'Alle Spielplätze nach Kanton' : 'All Playgrounds by Canton'}</a>
        <a class="btn-sec" href="/schwimmbaeder">\${isDe ? 'Alle Schwimmbäder &amp; Badis' : 'All Swimming Pools &amp; Badis'}</a>
        <a class="btn-sec" href="/wandern">\${isDe ? 'Alle 1\\'481 Familienwanderungen' : 'All 1,481 Family Hikes'}</a>
      </p>
    </div>\`
  });
}`;

seoCode = seoCode.replace(blogHubRegex, newBlogHub);

// Replace blogPostPage function
const blogPostRegex = /function blogPostPage\(slug\) \{[\s\S]*?\n\}/;
const newBlogPostPage = `function blogPostPage(slug, requestedLang) {
  const post = BLOG_POSTS.find(p => p.slug === slug);
  if (!post) return null;

  const postLang = post.lang || 'en';
  const isDe = postLang === 'de';

  let translationPost = null;
  if (post.translationSlug) {
    translationPost = BLOG_POSTS.find(p => p.slug === post.translationSlug);
  }

  const enSlug = isDe ? (translationPost ? translationPost.slug : null) : post.slug;
  const deSlug = isDe ? post.slug : (translationPost ? translationPost.slug : null);

  const canonical = isDe ? \`/de/blog/\${post.slug}\` : \`/blog/\${post.slug}\`;
  const alternates = [];
  if (enSlug) {
    alternates.push({ hreflang: 'en', href: \`/blog/\${enSlug}\` });
  }
  if (deSlug) {
    alternates.push({ hreflang: 'de-CH', href: \`/de/blog/\${deSlug}\` });
    alternates.push({ hreflang: 'de', href: \`/de/blog/\${deSlug}\` });
  }
  if (enSlug) {
    alternates.push({ hreflang: 'x-default', href: \`/blog/\${enSlug}\` });
  }

  let langSwitcherHtml = '';
  if (translationPost) {
    const enUrl = isDe ? \`/blog/\${translationPost.slug}\` : \`/blog/\${post.slug}\`;
    const deUrl = isDe ? \`/de/blog/\${post.slug}\` : \`/de/blog/\${translationPost.slug}\`;
    langSwitcherHtml = \`<div class="lang-switcher">
      <span class="muted">\${isDe ? 'Sprache:' : 'Language:'}</span>
      <a class="lang-pill \${isDe ? 'active' : ''}" href="\${esc(deUrl)}">🇨🇭 Deutsch</a>
      <a class="lang-pill \${!isDe ? 'active' : ''}" href="\${esc(enUrl)}">🇬🇧 English</a>
    </div>\`;
  }

  const locationLabel = isDe ? '📍 Standort &amp; ÖV:' : '📍 Location &amp; Transit:';
  const tipLabel = isDe ? '💡 Familien-Tipp:' : '💡 Parent Tip:';
  const factSheetLabel = (isHike) => isDe ? (isHike ? 'Routen-Details' : 'Ausflugsziel-Details') : (isHike ? 'Route Fact Sheet' : 'Spot Fact Sheet');

  const itemCards = post.items.map(item => {
    const isHike = !!item.hikeId;
    const ref = isHike ? state.hikeById[item.hikeId] : (item.spotId ? state.spotById[item.spotId] : null);
    const imgUrl = item.imageUrl || (ref && ref.imageUrl) || post.heroImage || '';
    const mapHref = item.hikeId
      ? \`/?hike=\${encodeURIComponent(item.hikeId)}\`
      : (item.spotId ? \`/?spot=\${encodeURIComponent(item.spotId)}\` : (item.actionHref || '/'));
    const seoHref = ref && ref.slug ? (isHike ? \`/wandern/\${ref.slug}\` : (ref.curated ? \`/ausflug/\${ref.slug}\` : null)) : null;

    const primaryLabel = isDe
      ? (item.hikeId ? 'Wanderroute &amp; SBB' : (item.spotId ? 'Auf interaktiver Karte öffnen' : (item.actionLabel || 'Auf Karte ansehen')))
      : (item.hikeId ? 'Open Trail Map, Elevation &amp; SBB' : (item.spotId ? 'Open on Interactive Map &amp; Weather' : (item.actionLabel || 'Explore on Interactive Map')));

    return \`<article class="card" id="rank-\${item.rank}">
      <div style="display:flex;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px">
        <span class="rank-badge">\${item.rank}</span>
        <h2 style="margin:0;font-size:1.28rem;flex:1">\${esc(item.name)}</h2>
        <span class="badge">\${esc(item.badge)}</span>
      </div>
      <div class="spot-guide-card">
        \${imgUrl ? \`<a href="\${mapHref}"><img class="spot-guide-img" src="\${esc(imgUrl)}" alt="\${esc(item.name)}" loading="lazy" referrerpolicy="no-referrer"></a>\` : ''}
        <div>
          <p class="muted" style="margin:0 0 8px"><strong>\${locationLabel}</strong> \${esc(item.location)}</p>
          <p style="margin:0 0 10px">\${esc(item.summary)}</p>
          \${item.tip ? \`<div class="tip-box"><strong>\${tipLabel}</strong> \${esc(item.tip)}</div>\` : ''}
          <div>
            <a class="btn" href="\${mapHref}">\${primaryLabel}</a>
            \${seoHref ? \`<a class="btn-sec" href="\${seoHref}">\${factSheetLabel(isHike)}</a>\` : ''}
          </div>
        </div>
      </div>
    </article>\`;
  }).join('');

  const tableHtml = post.table ? \`<div class="card">
    <h2 style="margin-top:0;font-size:1.15rem">\${esc(post.table.title || (isDe ? 'Schnellvergleich' : 'Quick Comparison'))}</h2>
    <div class="table-wrap"><table class="guide-table">
      <thead><tr>\${post.table.headers.map(h => \`<th>\${esc(h)}</th>\`).join('')}</tr></thead>
      <tbody>\${post.table.rows.map(row => \`<tr>\${row.map((cell, i) => \`<td>\${i === 0 ? \`<strong>\${esc(cell)}</strong>\` : esc(cell)}</td>\`).join('')}</tr>\`).join('')}</tbody>
    </table></div>
  </div>\` : '';

  const otherPosts = BLOG_POSTS.filter(p => (p.lang || 'en') === postLang && p.slug !== slug).map(p => {
    const postHref = isDe ? \`/de/blog/\${esc(p.slug)}\` : \`/blog/\${esc(p.slug)}\`;
    return \`<li><a href="\${postHref}"><strong>\${esc(p.title)}</strong></a> <span class="muted">(\${esc(p.category)})</span></li>\`;
  }).join('');

  const relatedLinks = (post.internalLinks || []).map(l =>
    \`<a class="btn-sec" href="\${esc(l.href)}" style="margin-right:8px">\${esc(l.label)}</a>\`
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
      mainEntityOfPage: \`\${SITE}\${canonical}\`,
      image: ogImage ? [ogImage] : undefined,
      inLanguage: isDe ? 'de-CH' : 'en'
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
          ? \`\${SITE}/?hike=\${encodeURIComponent(it.hikeId)}\`
          : (it.spotId ? \`\${SITE}/?spot=\${encodeURIComponent(it.spotId)}\` : \`\${SITE}\${canonical}#rank-\${it.rank}\`)
      }))
    }
  ];

  const breadcrumbs = isDe
    ? [['Start', '/'], ['Ratgeber & Blog', '/de/blog'], [post.title, canonical]]
    : [['Home', '/'], ['Family Guides & Blog', '/blog'], [post.title, canonical]];

  return page({
    lang: isDe ? 'de' : 'en',
    title: \`\${post.title} | SwissForKids\`,
    description: post.metaDescription,
    canonical,
    alternates,
    h1: post.title,
    ogImage,
    extraSchema,
    breadcrumbs,
    body: \`\${langSwitcherHtml}
    <p class="subtitle">\${esc(post.subtitle)}</p>
    <p><span class="badge">\${esc(post.category)}</span> <span class="muted">\${isDe ? 'Aktualisiert' : 'Updated'} \${esc(state.builtAt)} &bull; \${esc(post.readTime)}</span></p>
    <div class="card"><p style="margin:0;font-size:1.03rem">\${esc(post.intro)}</p></div>
    \${tableHtml}
    \${itemCards}
    \${relatedLinks ? \`<div class="card"><h3>\${isDe ? 'Mehr in dieser Kategorie entdecken' : 'Explore More in This Category'}</h3><p>\${relatedLinks}</p></div>\` : ''}
    <div class="card">
      <h3 style="margin-top:0">\${isDe ? 'Weitere Schweizer Familien-Ratgeber' : 'More Swiss Family Guides'}</h3>
      <ul class="list">\${otherPosts}</ul>
      <p><a class="btn" href="\${isDe ? '/de/blog' : '/blog'}">\${isDe ? 'Alle Ratgeber ansehen' : 'View All Family Guides'}</a> <a class="btn-sec" href="/">\${isDe ? 'Interaktive Karte öffnen' : 'Open Interactive Map'}</a></p>
    </div>\`
  });
}`;

seoCode = seoCode.replace(blogPostRegex, newBlogPostPage);

// Replace routing in render()
const renderRoutingOld = `  if (a === 'blog') {
    if (parts.length === 1) return blogHub();
    if (parts.length === 2) return blogPostPage(b);
    return null;
  }`;

const renderRoutingNew = `  if (a === 'de' && b === 'blog') {
    if (parts.length === 2) return blogHub('de');
    if (parts.length === 3) return blogPostPage(c, 'de');
    return null;
  }
  if (a === 'blog') {
    if (parts.length === 1) return blogHub('en');
    if (parts.length === 2) {
      const p = BLOG_POSTS.find(x => x.slug === b);
      if (p && p.lang === 'de') return blogPostPage(b, 'de');
      return blogPostPage(b, 'en');
    }
    return null;
  }`;

seoCode = seoCode.replace(renderRoutingOld, renderRoutingNew);

// Replace sitemapUrls()
const sitemapOld = `function sitemapUrls() {
  const urls = ['/', '/blog', ...BLOG_POSTS.map(p => \`/blog/\${p.slug}\`), '/wandern', '/wandern/kinderwagen', '/wandern/winter'];`;

const sitemapNew = `function sitemapUrls() {
  const blogUrls = ['/blog'];
  if (BLOG_POSTS.some(p => p.lang === 'de')) blogUrls.push('/de/blog');
  for (const p of BLOG_POSTS) {
    if (p.lang === 'de') blogUrls.push(\`/de/blog/\${p.slug}\`);
    else blogUrls.push(\`/blog/\${p.slug}\`);
  }
  const urls = ['/', ...blogUrls, '/wandern', '/wandern/kinderwagen', '/wandern/winter'];`;

seoCode = seoCode.replace(sitemapOld, sitemapNew);

fs.writeFileSync(path.join(__dirname, '..', 'seo.js'), seoCode, 'utf8');
console.log('Successfully updated seo.js with bilingual support!');
