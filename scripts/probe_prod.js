const https = require('https');

function check(url) {
  return new Promise(resolve => {
    https.get('https://swissforkids.ch' + url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({
        url,
        status: res.statusCode,
        len: data.length,
        hasHreflang: data.includes('hreflang="de-CH"'),
        hasSwitch: data.includes('lang-switcher')
      }));
    }).on('error', e => resolve({ url, err: e.message }));
  });
}

(async () => {
  console.log(await check('/blog'));
  console.log(await check('/de/blog'));
  console.log(await check('/de/blog/ausfluege-kinder-zuerich-schlechtwetter'));
  console.log(await check('/blog/rainy-day-children-activities-zurich'));
})();
