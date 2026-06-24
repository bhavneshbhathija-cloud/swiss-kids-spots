const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://raw.githubusercontent.com/williambelle/switzerland-postal-codes/master/dist/postal-codes.json';
const dest = path.join(__dirname, 'postal-codes-raw.json');

console.log("Downloading Swiss postal codes dataset...");

https.get(url, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
        try {
            // Verify it is valid JSON
            const data = JSON.parse(body);
            console.log(`Successfully downloaded ${data.length} postal code records.`);
            fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`Saved raw dataset to ${dest}`);
        } catch (e) {
            console.error("Failed to parse downloaded JSON:", e);
        }
    });
}).on('error', (e) => {
    console.error("HTTP error downloading file:", e);
});
