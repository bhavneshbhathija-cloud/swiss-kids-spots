const https = require('https');
const fs = require('fs');
const path = require('path');

const csvUrl = 'https://raw.githubusercontent.com/gamba/swiss-geolocation/master/post-codes.csv';
const outputJsonPath = path.join(__dirname, 'postal-codes.json');

console.log("Fetching Swiss ZIP coordinates CSV...");

https.get(csvUrl, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        try {
            console.log("Parsing CSV data...");
            const lines = rawData.split('\n');
            const zipDict = {};
            
            // Expected headers: postcode,locality,canton,lon,lat
            // Let's parse line by line
            let parsedCount = 0;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Split line by comma, taking care of possible quoted strings
                const columns = [];
                let currentColumn = '';
                let insideQuotes = false;

                for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                        insideQuotes = !insideQuotes;
                    } else if (char === ',' && !insideQuotes) {
                        columns.push(currentColumn.trim());
                        currentColumn = '';
                    } else {
                        currentColumn += char;
                    }
                }
                columns.push(currentColumn.trim());

                if (columns.length < 8) continue;

                // Extract values (based on columns: zip, post_district, comment, country_code, region, town, lat, lng)
                const zip = columns[0].replace(/"/g, '');
                const city = (columns[5] || columns[1] || '').replace(/"/g, '');
                const canton = (columns[4] || '').replace(/"/g, '');
                const lat = parseFloat(columns[6]);
                const lng = parseFloat(columns[7]);

                // Validate postal code (4 digits) and coordinates
                if (zip.match(/^\d{4}$/) && !isNaN(lat) && !isNaN(lng)) {
                    zipDict[zip] = {
                        city: city,
                        canton: canton.toUpperCase() || "CH",
                        lat: Math.round(lat * 100000) / 100000,
                        lng: Math.round(lng * 100000) / 100000
                    };
                    parsedCount++;
                }
            }

            console.log(`Successfully parsed ${parsedCount} Swiss postal codes.`);
            
            // Save to JSON file
            fs.writeFileSync(outputJsonPath, JSON.stringify(zipDict, null, 2), 'utf-8');
            console.log(`Saved output ZIP database to ${outputJsonPath}`);

        } catch (e) {
            console.error("Error processing CSV data:", e);
        }
    });
}).on('error', (e) => {
    console.error("HTTP request error:", e);
});
