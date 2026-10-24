// --- Swiss ZIP Codes Database (Loaded asynchronously on startup) ---
let SWISS_ZIPS = {};

// --- Mock Dataset for Swiss Kids' Spots ---
// Baseline curated spots loaded dynamically from base_spots.json


// --- App State ---
let spots = [];
let activeMap = null;
let mapMarkers = [];
let mapPolylines = [];
let swisstopoWanderlandLayer = null;
let swisstopoWinterLayer = null;
let currentSearchCenter = { lat: 46.8182, lng: 8.2275, name: "Switzerland" }; // Centered on Switzerland
let currentSearchZip = "";
let currentRadiusKm = 5;
let liveWeatherData = null; // Global cache for searched zip weather
let theme = "light";
let userLocationMarker = null;
let isOsmSpotsLoaded = false;

// --- Utility Functions ---

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Calculate Haversine Distance (in km) between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Compute minimum distance from a point to a spot (checks trail polyline if available)
function calculateSpotDistance(lat, lng, spot) {
    let minD = calculateDistance(lat, lng, spot.lat, spot.lng);
    if (spot.type === "hiking" && Array.isArray(spot.coordinates)) {
        for (const pt of spot.coordinates) {
            const d = calculateDistance(lat, lng, pt[0], pt[1]);
            if (d < minD) minD = d;
        }
    }
    return minD;
}

// Compute average rating
function getAvgRating(spot) {
    if (!spot.ratings || spot.ratings.length === 0) return spot.rating || 4.8;
    const sum = spot.ratings.reduce((acc, r) => acc + r, 0);
    return (sum / spot.ratings.length).toFixed(1);
}

// Check if a spot is "free"
function isFreeSpot(spot) {
    if (!spot.fees) return true;
    return spot.fees.toLowerCase().includes("free") || parseFloat(spot.fees) === 0;
}

// Retrieve Weather Code Info
function getWeatherIconAndDesc(code) {
    if (code === 0) return { icon: "fa-sun", desc: "Clear Sky" };
    if (code <= 3) return { icon: "fa-cloud-sun", desc: "Partly Cloudy" };
    if (code === 45 || code === 48) return { icon: "fa-smog", desc: "Foggy" };
    if (code <= 55) return { icon: "fa-cloud-rain", desc: "Drizzle" };
    if (code <= 65) return { icon: "fa-cloud-showers-heavy", desc: "Rainy" };
    if (code <= 75) return { icon: "fa-snowflake", desc: "Snowing" };
    if (code <= 82) return { icon: "fa-cloud-showers-water", desc: "Rain Showers" };
    if (code <= 86) return { icon: "fa-snowflake", desc: "Snow Showers" };
    if (code <= 99) return { icon: "fa-cloud-bolt", desc: "Thunderstorm" };
    return { icon: "fa-cloud", desc: "Cloudy" };
}

// Determine if weather is suitable for kids playspots & hiking trails
function evaluateWeatherSuitability(type, weather, spot = null) {
    if (!weather) return { suitable: true, status: "good", label: "Weather Suitable", advice: "" };

    const temp = weather.temperature;
    const prec = weather.precipitation;
    const code = weather.code;
    const warnings = weather.warnings || [];

    const now = Date.now();
    let activeWarnings = warnings.filter(w => 
        (!w.validFrom || now >= w.validFrom) && 
        (!w.validTo || now <= w.validTo)
    );

    const todayMax = (weather.forecast && weather.forecast[0]) ? weather.forecast[0].temperatureMax : temp;
    const heatWarning = activeWarnings.find(w => w.warnType === 7 && w.warnLevel >= 2);
    const hasHeatwave = temp >= 32 || todayMax >= 30 || (!!heatWarning && (temp >= 28 || todayMax >= 30));

    if (!hasHeatwave) {
        activeWarnings = activeWarnings.filter(w => w.warnType !== 7);
    }

    const severeWarning = activeWarnings.find(w => w.warnLevel >= 3 && w.warnType !== 10);

    // 1. Severe Weather Warning Active
    if (severeWarning) {
        const typeName = {
            0: "Wind Warning",
            1: "Thunderstorm Warning",
            2: "Heavy Rain Warning",
            3: "Heavy Snow Warning",
            4: "Slippery Roads Warning",
            8: "Avalanche Warning",
            9: "Earthquake Warning",
            11: "Flood Warning"
        }[severeWarning.warnType] || "Weather Warning";

        if (type === "playpark" || type === "hiking") {
            return {
                suitable: false,
                status: "warning",
                icon: "fa-triangle-exclamation",
                label: `⚠️ ${typeName} (Level ${severeWarning.warnLevel})`,
                advice: `Not recommended for outdoor trails or play: Severe weather active. Details: ${severeWarning.text || 'Avoid exposed ridges and forest trails.'}`
            };
        } else if (type === "swimmingpool") {
            return {
                suitable: true,
                status: "warning",
                icon: "fa-triangle-exclamation",
                label: `⚠️ Indoor Pool Only`,
                advice: `Severe weather active: ${severeWarning.text || 'Avoid outdoor water activities.'} Make sure to use indoor facilities only.`
            };
        } else if (type === "gamezone") {
            return {
                suitable: true,
                status: "good",
                icon: "fa-shield-halved",
                label: `🌧️ Safe Indoor Escape`,
                advice: `Severe weather outside! A perfect indoor escape to stay safe and dry.`
            };
        }
    }

    // 2. Heatwave Active
    if (hasHeatwave) {
        if (type === "playpark") {
            let heatAdvice = `Extremely hot (${temp}&deg;C). Outdoor play is not recommended due to heat exhaustion risk. Stay indoors or in cool, shaded spaces.`;
            if (heatWarning) {
                heatAdvice = `<strong>MeteoSwiss Heat Wave Warning (Level ${heatWarning.warnLevel}) is active:</strong><br>${heatWarning.htmlText || heatWarning.text}`;
            }
            return {
                suitable: false,
                status: "warning",
                icon: "fa-temperature-high",
                label: "🥵 Heat Wave: Avoid Outdoors",
                advice: heatAdvice
            };
        } else if (type === "hiking") {
            const isHighAlt = spot && spot.maxElevationM && spot.maxElevationM >= 1300;
            return {
                suitable: isHighAlt,
                status: isHighAlt ? "good" : "warning",
                icon: isHighAlt ? "fa-mountain-sun" : "fa-temperature-high",
                label: isHighAlt ? "⛰️ Cooler Mountain Altitude" : "🥵 Hot: Hike Early / Seek Shade",
                advice: isHighAlt
                    ? `Valley temperatures are hot (${temp}&deg;C), making this higher-elevation trail (${spot.maxElevationM}m) a refreshing alpine escape! Pack sun protection and plenty of water.`
                    : `High temperatures (${temp}&deg;C). Start early in the morning, choose shaded forest or lakeside trails, and carry extra water for kids.`
            };
        } else if (type === "swimmingpool") {
            let poolAdvice = `Excellent for cooling off! Remember to apply plenty of sunscreen, wear hats, and stay hydrated in the heat (${temp}&deg;C).`;
            if (heatWarning) {
                poolAdvice = `Excellent for cooling off, but heed MeteoSwiss heat wave advice: seek shade during peak hours, apply high-SPF sunscreen, and drink plenty of water.`;
            }
            return {
                suitable: true,
                status: "good",
                icon: "fa-water",
                label: "🏊 Cool Down in Pool",
                advice: poolAdvice
            };
        } else if (type === "gamezone") {
            return {
                suitable: true,
                status: "good",
                icon: "fa-snowflake",
                label: "❄️ Shaded/AC Escape",
                advice: `Stay cool indoors! A great air-conditioned or shaded escape from the ${temp}&deg;C heat wave outside.`
            };
        }
    }

    // 3. Normal weather checks
    if (type === "hiking") {
        const isSnow = (code >= 71 && code <= 77) || code === 85 || code === 86;
        if (isSnow && spot && spot.isWinterTrail) {
            return {
                suitable: true,
                status: "good",
                icon: "fa-snowflake",
                label: "❄️ Great for Winter Hiking",
                advice: "Snowy conditions — ideal for this prepared winter hiking trail! Wear warm boots with good grip."
            };
        }
        if (prec > 0.3 || code >= 61) {
            return {
                suitable: false,
                status: "warning",
                icon: "fa-cloud-showers-heavy",
                label: "🌧️ Wet/Slippery Trails Today",
                advice: "Rainy weather can make roots and mountain trails slippery. Check trail conditions or choose a paved lakeside promenade."
            };
        }
        return {
            suitable: true,
            status: "good",
            icon: "fa-person-hiking",
            label: "🥾 Ideal Hiking Weather",
            advice: "Dry conditions — great day for a family hike in Switzerland!"
        };
    }

    if (type === "playpark") {
        if (prec > 0.1 || temp < 12 || code >= 51) {
            return { 
                suitable: false, 
                status: "warning", 
                label: "🌧️ Not recommended today (Rainy/Cold)",
                advice: "Not recommended today due to weather conditions. Consider indoor alternatives like Game Zones or Indoor Pools!"
            };
        }
        return { 
            suitable: true, 
            status: "good", 
            label: "☀️ Perfect for outdoor play",
            advice: "Weather is perfect for outdoor fun!"
        };
    }

    if (type === "gamezone") {
        if (prec > 0.1 || temp < 12 || code >= 51) {
            return { 
                suitable: true, 
                status: "good", 
                label: "🌧️ Rainy day favorite!",
                advice: "Rainy/cold day highlight! A perfect indoor escape."
            };
        }
        return { 
            suitable: true, 
            status: "good", 
            label: "☀️ Open today",
            advice: "Open today! Great indoor option if you want shade or air-conditioning."
        };
    }

    if (type === "swimmingpool") {
        if (prec > 0.1 || temp < 15 || code >= 51) {
            return {
                suitable: true, 
                status: "warning",
                label: "🌧️ Indoor Pool Only Today",
                advice: "It is rainy or cold outside. Make sure to use the indoor pool facilities!"
            };
        }
        return {
            suitable: true,
            status: "good",
            label: "☀️ Great for swimming today",
            advice: "Warm weather makes it great for water play!"
        };
    }

    return { suitable: true, status: "good", label: "Open today", advice: "" };
}

// Get closest Swiss ZIP code for a given coordinate
function getClosestZip(lat, lng) {
    if (!SWISS_ZIPS || Object.keys(SWISS_ZIPS).length === 0) return null;
    let closestZip = null;
    let minDist = Infinity;
    for (const [zip, data] of Object.entries(SWISS_ZIPS)) {
        const dist = calculateDistance(lat, lng, data.lat, data.lng);
        if (dist < minDist) {
            minDist = dist;
            closestZip = zip;
        }
    }
    return closestZip;
}

// --- Fetch Weather from MeteoSwiss (via Server Proxy) with Open-Meteo fallback ---
async function fetchWeatherData(lat, lng, zip = null) {
    try {
        const targetZip = zip || getClosestZip(lat, lng);
        if (!targetZip) {
            throw new Error("No matching ZIP code found for coordinates");
        }

        const response = await fetch(`/api/weather?plz=${targetZip}`);
        if (!response.ok) throw new Error("MeteoSwiss proxy request failed");
        const data = await response.json();
        
        return {
            temperature: data.temperature,
            precipitation: data.precipitation,
            code: data.code,
            warnings: data.warnings,
            forecast: data.forecast
        };
    } catch (e) {
        console.warn("Could not fetch MeteoSwiss weather data, falling back to Open-Meteo:", e.message);
        // Fallback to Open-Meteo API
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code&timezone=Europe/Berlin`);
            if (!response.ok) throw new Error("Open-Meteo fallback failed");
            const data = await response.json();
            return {
                temperature: Math.round(data.current.temperature_2m),
                precipitation: data.current.precipitation,
                code: data.current.weather_code,
                warnings: [],
                forecast: []
            };
        } catch (err) {
            console.error("All weather sources failed:", err);
            return null;
        }
    }
}


// --- Load/Save LocalStorage ---
async function loadSpots() {
    // Load all Swiss ZIP codes first
    try {
        const zipResponse = await fetch("postal-codes.json");
        if (zipResponse.ok) {
            SWISS_ZIPS = await zipResponse.json();
            console.log(`Loaded ${Object.keys(SWISS_ZIPS).length} Swiss postal codes.`);
        }
    } catch (e) {
        console.error("Error loading postal-codes.json:", e);
    }

    // 1. Load hand-curated baseline from JSON file + All 1,134 SwitzerlandMobility Hiking Trails from hikes.json
    try {
        const [baseResponse, hikesResponse] = await Promise.all([
            fetch("base_spots.json?v=15"),
            fetch("hikes.json?v=15")
        ]);
        const baseSpots = baseResponse.ok ? await baseResponse.json() : [];
        const hikeSpots = hikesResponse.ok ? await hikesResponse.json() : [];
        spots = [...baseSpots, ...hikeSpots];
        console.log(`Loaded ${baseSpots.length} baseline spots and ${hikeSpots.length} hiking trails.`);
    } catch (e) {
        console.error("Error loading baseline/hiking spots:", e);
        spots = [];
    }
    
    // 2. Load custom user-created spots from localStorage
    const customLocal = localStorage.getItem("swiss_kids_custom_spots");
    if (customLocal) {
        try {
            const customSpots = JSON.parse(customLocal);
            spots = spots.concat(customSpots);
        } catch (e) {
            console.error("Error loading custom spots from localStorage", e);
        }
    }
    
    // 3. Load user reviews/ratings for all spots from localStorage
    const localReviews = localStorage.getItem("swiss_kids_reviews");
    let reviewsDict = {};
    if (localReviews) {
        try {
            reviewsDict = JSON.parse(localReviews);
        } catch (e) {
            console.error("Error loading reviews from localStorage", e);
        }
    }
    
    // Merge reviews into baseline & hiking spots
    spots.forEach(spot => {
        if (!spot.ratings) spot.ratings = [5, 5, 4];
        if (!spot.comments) spot.comments = [];
        if (reviewsDict[spot.id]) {
            spot.ratings = spot.ratings.concat(reviewsDict[spot.id].ratings || []);
            spot.comments = spot.comments.concat(reviewsDict[spot.id].comments || []);
        }
    });

    isOsmSpotsLoaded = false;
    
    // Refresh lists and map markers once loaded
    renderSpotsList();

    // Auto-open spot or Group Hike Invite if present in URL
    const urlParams = new URLSearchParams(window.location.search);
    const targetHike = urlParams.get('hike') || urlParams.get('spot');
    if (targetHike) {
        const found = spots.find(s => s.id === targetHike);
        if (found) {
            setTimeout(() => {
                openDetails(targetHike, {
                    groupPlan: urlParams.get('group') === '1',
                    date: urlParams.get('date'),
                    time: urlParams.get('time'),
                    from: urlParams.get('from'),
                    meetingPoint: urlParams.get('meetingPoint')
                });
            }, 300);
        }
    }
}

// Lazily load the large harvested OSM spots database only when user searches or geolocates
async function loadOsmSpots() {
    if (isOsmSpotsLoaded) return;
    
    const countContainer = document.getElementById("results-count");
    const originalText = countContainer ? countContainer.textContent : "0 spots found";
    if (countContainer) {
        countContainer.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading all kids spots...';
    }

    const localReviews = localStorage.getItem("swiss_kids_reviews");
    let reviewsDict = {};
    if (localReviews) {
        try {
            reviewsDict = JSON.parse(localReviews);
        } catch (e) {
            console.error("Error loading reviews from localStorage", e);
        }
    }

    try {
        const response = await fetch("spots_harvested.json?v=" + Date.now());
        if (response.ok) {
            const harvestedSpots = await response.json();
            
            // Merge reviews into harvested spots
            harvestedSpots.forEach(spot => {
                if (reviewsDict[spot.id]) {
                    spot.ratings = spot.ratings.concat(reviewsDict[spot.id].ratings || []);
                    spot.comments = spot.comments.concat(reviewsDict[spot.id].comments || []);
                }
            });

            spots = spots.concat(harvestedSpots);
            console.log(`Loaded ${harvestedSpots.length} OSM spots dynamically.`);
            isOsmSpotsLoaded = true;
        }
    } catch (e) {
        console.warn("Could not fetch spots_harvested.json, using baseline.", e);
    } finally {
        if (countContainer) {
            countContainer.textContent = originalText;
        }
    }
}

function saveSpots() {
    // Save custom added spots
    const customSpots = spots.filter(s => s.id.startsWith("custom-spot-"));
    localStorage.setItem("swiss_kids_custom_spots", JSON.stringify(customSpots));
}

// --- Init Leaflet Map ---
function initializeMap() {
    // Central Switzerland coordinates
    activeMap = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView([46.8182, 8.2275], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &bull; Trails &copy; swisstopo / SchweizMobil'
    }).addTo(activeMap);
}

// Toggle Official Swisstopo WMTS Hiking Overlay (Summer & Winter Trails)
function toggleSwisstopoMapLayer(enabled) {
    if (!activeMap) return;
    if (enabled) {
        if (!swisstopoWanderlandLayer) {
            swisstopoWanderlandLayer = L.tileLayer(
                'https://wmts.geo.admin.ch/1.0.0/ch.astra.wanderland/default/current/3857/{z}/{x}/{y}.png',
                { opacity: 0.78, attribution: '&copy; swisstopo / SchweizMobil' }
            );
        }
        if (!swisstopoWinterLayer) {
            swisstopoWinterLayer = L.tileLayer(
                'https://wmts.geo.admin.ch/1.0.0/ch.astra.winterwanderwege/default/current/3857/{z}/{x}/{y}.png',
                { opacity: 0.78 }
            );
        }
        swisstopoWanderlandLayer.addTo(activeMap);
        swisstopoWinterLayer.addTo(activeMap);
    } else {
        if (swisstopoWanderlandLayer && activeMap.hasLayer(swisstopoWanderlandLayer)) {
            activeMap.removeLayer(swisstopoWanderlandLayer);
        }
        if (swisstopoWinterLayer && activeMap.hasLayer(swisstopoWinterLayer)) {
            activeMap.removeLayer(swisstopoWinterLayer);
        }
    }
}

// Build Google Maps Directions URL (Start-to-End walking route for hikes, destination for spots)
function getSpotDirectionsUrl(spot) {
    if (spot.type === "hiking" && Array.isArray(spot.coordinates) && spot.coordinates.length >= 2) {
        const coords = spot.coordinates;
        const startPt = coords[0];
        const endPt = coords[coords.length - 1];
        const origin = `${startPt[0]},${startPt[1]}`;
        const destination = `${endPt[0]},${endPt[1]}`;
        const waypoints = [];
        if (coords.length >= 5) {
            for (const f of [0.2, 0.4, 0.6, 0.8]) {
                const idx = Math.min(coords.length - 2, Math.max(1, Math.round(f * (coords.length - 1))));
                const ptStr = `${coords[idx][0]},${coords[idx][1]}`;
                if (ptStr !== origin && ptStr !== destination && !waypoints.includes(ptStr)) {
                    waypoints.push(ptStr);
                }
            }
        } else if (coords.length >= 3) {
            const midPt = coords[Math.floor(coords.length / 2)];
            waypoints.push(`${midPt[0]},${midPt[1]}`);
        }
        let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=walking`;
        if (waypoints.length > 0) {
            url += `&waypoints=${encodeURIComponent(waypoints.join("|"))}`;
        }
        return url;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
}

let currentDisplayLimit = 80;

// Plot Markers and Hiking Route Polylines on Map
function updateMapMarkers(filteredSpots) {
    if (!activeMap) return;
    // Clear existing markers & polylines
    mapMarkers.forEach(m => activeMap.removeLayer(m));
    mapMarkers = [];
    mapPolylines.forEach(p => activeMap.removeLayer(p));
    mapPolylines = [];

    if (filteredSpots.length === 0) return;

    const bounds = [];

    filteredSpots.forEach(spot => {
        const iconTypeClass = `pin-${spot.type}`;
        
        let iconHtml = "";
        if (spot.type === "playpark") iconHtml = '<i class="fa-solid fa-child-reaching"></i>';
        else if (spot.type === "hiking") iconHtml = '<i class="fa-solid fa-person-hiking"></i>';
        else if (spot.type === "gamezone") iconHtml = '<i class="fa-solid fa-gamepad"></i>';
        else if (spot.type === "swimmingpool") iconHtml = '<i class="fa-solid fa-water-ladder"></i>';

        const weatherEval = evaluateWeatherSuitability(spot.type, liveWeatherData, spot);
        const weatherStyleClass = weatherEval.status === "warning" ? "pin-bad-weather" : "pin-good-weather";

        const customMarkerIcon = L.divIcon({
            html: `<div class="custom-pin ${iconTypeClass} ${weatherStyleClass}">${iconHtml}</div>`,
            className: 'custom-div-icon',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });

        const marker = L.marker([spot.lat, spot.lng], { icon: customMarkerIcon }).addTo(activeMap);
        marker.spotId = spot.id;
        
        const directionsUrl = getSpotDirectionsUrl(spot);
        const hikeSubInfo = spot.type === "hiking"
            ? `<div style="font-size: 0.75rem; font-weight: 600; color: var(--accent-hiking); margin-bottom: 6px;">
                 ${spot.nameDe ? `<div style="color: var(--text-secondary); font-weight: 500; margin-bottom: 2px;">🇩🇪 ${spot.nameDe}</div>` : ''}
                 <span>📏 ${spot.distanceKm} km</span> &bull; <span>⏱️ ${spot.durationText}</span> &bull; <span>↑ ${spot.ascentM}m</span>
               </div>`
            : '';

        const popupContent = `
            <div style="font-family: var(--font-primary); min-width: 185px; padding: 2px;">
                <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${spot.name}</h4>
                ${hikeSubInfo}
                <p style="margin: 0 0 8px 0; font-size: 0.8rem; color: var(--text-secondary);"><i class="fa-solid fa-location-dot"></i> ${spot.city || spot.region} (${spot.zip || ''})</p>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <button class="btn btn-outline" onclick="openDetails('${spot.id}')" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; flex: 1; min-height: auto; height: auto;">Details</button>
                    <a href="${directionsUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 1; color: white; min-height: auto; height: auto; text-transform: none; letter-spacing: 0;"><i class="fa-solid fa-diamond-turn-right"></i> Start</a>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        mapMarkers.push(marker);
        bounds.push([spot.lat, spot.lng]);

        // Draw Hiking Trail Polyline on Map
        if (spot.type === "hiking" && Array.isArray(spot.coordinates) && spot.coordinates.length > 1) {
            let strokeColor = "#2d6a4f"; // Easy green
            if (spot.difficulty === "moderate") strokeColor = "#e76f51"; // Moderate orange
            else if (spot.difficulty === "difficult") strokeColor = "#d90429"; // Difficult red
            if (spot.isWinterTrail && spot.season === "winter") strokeColor = "#0284c7"; // Winter trail blue

            const polyline = L.polyline(spot.coordinates, {
                color: strokeColor,
                weight: 4.5,
                opacity: 0.85,
                dashArray: (spot.isWinterTrail && spot.season === "winter") ? "8, 6" : null,
                lineJoin: "round"
            }).addTo(activeMap);

            polyline.spotId = spot.id;
            polyline.bindPopup(popupContent);
            polyline.on("mouseover", function() {
                this.setStyle({ weight: 7, opacity: 1 });
            });
            polyline.on("mouseout", function() {
                this.setStyle({ weight: 4.5, opacity: 0.85 });
            });

            mapPolylines.push(polyline);
        }
    });

    // Fit map bounds if there are markers and search zip or region filter is specified
    const hikeRegionFilter = document.getElementById("filter-hike-region") ? document.getElementById("filter-hike-region").value : "all";
    if (bounds.length > 0 && (currentSearchZip !== "" || hikeRegionFilter !== "all")) {
        activeMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else if (bounds.length > 0) {
        activeMap.setView([currentSearchCenter.lat, currentSearchCenter.lng], 9);
    }
}

let currentTextQuery = "";

// --- Render Spot Card List ---
window.loadMoreSpots = function() {
    currentDisplayLimit += 100;
    renderSpotsList(true);
};

function renderSpotsList(keepLimit = false) {
    if (keepLimit !== true) {
        currentDisplayLimit = 80;
    }
    const listContainer = document.getElementById("spots-list");
    const countContainer = document.getElementById("results-count");

    // Gather search parameters & filters
    const typePlaypark = document.getElementById("filter-playpark").checked;
    const typeHikingEl = document.getElementById("filter-hiking");
    const typeHiking = typeHikingEl ? typeHikingEl.checked : true;
    const typeGamezone = document.getElementById("filter-gamezone").checked;
    const typeSwimmingpool = document.getElementById("filter-swimmingpool").checked;

    // Show/hide hiking subfilters panel based on whether Hiking Trails is checked
    const hikingSubfiltersBox = document.getElementById("hiking-subfilters-box");
    if (hikingSubfiltersBox) {
        hikingSubfiltersBox.style.display = typeHiking ? "block" : "none";
    }

    // Gather hiking sub-filters
    const hikeRegion = document.getElementById("filter-hike-region") ? document.getElementById("filter-hike-region").value : "all";
    const hikeDifficulty = document.getElementById("filter-hike-difficulty") ? document.getElementById("filter-hike-difficulty").value : "all";
    const hikeStrollerOnly = document.getElementById("filter-hike-stroller") ? document.getElementById("filter-hike-stroller").checked : false;
    const hikeWinterOnly = document.getElementById("filter-hike-winter") ? document.getElementById("filter-hike-winter").checked : false;
    const hikeRestaurantOnly = document.getElementById("filter-hike-restaurant") ? document.getElementById("filter-hike-restaurant").checked : false;
    const hikeParkingOnly = document.getElementById("filter-hike-parking") ? document.getElementById("filter-hike-parking").checked : false;

    const selectedFees = document.querySelector('input[name="filter-fees"]:checked').value;
    const weatherSuitableOnly = document.getElementById("filter-weather-suitable").checked;
    const sortBy = document.getElementById("sort-select").value;

    let filtered = spots.map(spot => {
        // Calculate distance from search center if active search zip exists (checks trail polyline for hikes)
        let distance = null;
        if (currentSearchZip !== "") {
            distance = calculateSpotDistance(
                currentSearchCenter.lat, 
                currentSearchCenter.lng, 
                spot
            );
        }
        return { ...spot, distance };
    });

    // 1. Filter by Search Range or Text Query (Trail Name / Route Number / Lake):
    if (currentSearchZip !== "") {
        filtered = filtered.filter(spot => spot.distance <= currentRadiusKm);
    } else if (currentTextQuery !== "") {
        const q = currentTextQuery.toLowerCase();
        filtered = filtered.filter(spot => {
            const hay = `${spot.name || ''} ${spot.nameDe || ''} ${spot.routeNumber ? 'route ' + spot.routeNumber : ''} ${spot.city || ''} ${spot.address || ''} ${spot.description || ''}`.toLowerCase();
            return hay.includes(q);
        });
    } else {
        filtered = filtered.filter(spot => {
            const isCustom = spot.id.startsWith("custom-spot-");
            const isCurated = !spot.id.startsWith("osm-spot-") && !isCustom;
            return isCurated || isCustom;
        });
    }

    // 2. Filter by Category & Hiking Sub-Filters
    filtered = filtered.filter(spot => {
        if (spot.type === "playpark" && !typePlaypark) return false;
        if (spot.type === "hiking" && !typeHiking) return false;
        if (spot.type === "gamezone" && !typeGamezone) return false;
        if (spot.type === "swimmingpool" && !typeSwimmingpool) return false;

        if (spot.type === "hiking") {
            if (hikeRegion !== "all" && spot.region !== hikeRegion) return false;
            if (hikeDifficulty !== "all" && spot.difficulty !== hikeDifficulty) return false;
            if (hikeStrollerOnly && spot.strollerFriendly !== "yes") return false;
            if (hikeWinterOnly && !spot.isWinterTrail) return false;
            if (hikeRestaurantOnly && (!spot.restaurants || spot.restaurants.length === 0)) return false;
            if (hikeParkingOnly && !spot.parking) return false;
        }
        return true;
    });

    // 3. Filter by Fees
    if (selectedFees === "free") {
        filtered = filtered.filter(isFreeSpot);
    }

    // 4. Filter by Weather Suitability
    if (weatherSuitableOnly && liveWeatherData) {
        filtered = filtered.filter(spot => {
            const evaluation = evaluateWeatherSuitability(spot.type, liveWeatherData, spot);
            return evaluation.suitable;
        });
    }

    // Sort Results
    if (sortBy === "featured") {
        filtered.sort((a, b) => {
            const getPriority = (spot) => {
                const isCustom = spot.id.startsWith("custom-spot-");
                const isCurated = !spot.id.startsWith("osm-spot-") && !isCustom;
                if (isCurated || isCustom) return 1;
                
                const isPlaceholder = spot.imageUrl && spot.imageUrl.includes("unsplash.com/photo-");
                if (!isPlaceholder) return 2;
                
                return 3;
            };

            const pA = getPriority(a);
            const pB = getPriority(b);

            if (pA !== pB) {
                return pA - pB;
            }

            if (currentSearchZip !== "") {
                return (a.distance || 0) - (b.distance || 0);
            } else {
                return getAvgRating(b) - getAvgRating(a);
            }
        });
    } else if (sortBy === "distance" && currentSearchZip !== "") {
        filtered.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } else if (sortBy === "rating") {
        filtered.sort((a, b) => getAvgRating(b) - getAvgRating(a));
    } else {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Render count
    if (currentSearchZip !== "") {
        const zipCity = SWISS_ZIPS[currentSearchZip] ? SWISS_ZIPS[currentSearchZip].city : currentSearchZip;
        countContainer.textContent = `${filtered.length} spot${filtered.length === 1 ? '' : 's'} & trail${filtered.length === 1 ? '' : 's'} near ${zipCity}`;
    } else {
        countContainer.textContent = `Showing ${filtered.length} Featured Spots & Hiking Trails in Switzerland`;
    }

    // Render Cards
    listContainer.innerHTML = "";
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="card" style="text-align: center; padding: 2rem;">
                <i class="fa-solid fa-face-frown" style="font-size: 2.5rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <h3>No Spots or Trails Match Your Search</h3>
                <p style="color: var(--text-secondary); margin-top: 0.5rem;">Try increasing the distance radius slider (up to 25 km), selecting another region, or clearing some filters.</p>
            </div>
        `;
        updateMapMarkers([]);
        return;
    }

    const visibleSpots = filtered.slice(0, currentDisplayLimit);

    visibleSpots.forEach(spot => {
        const avgR = getAvgRating(spot);
        const feeBadge = isFreeSpot(spot) ? '<span class="badge badge-free">Free</span>' : `<span class="badge badge-fee">${spot.fees}</span>`;
        
        // Generate Star icons
        let starsHtml = "";
        const roundedRating = Math.round(avgR);
        for (let i = 1; i <= 5; i++) {
            if (i <= roundedRating) {
                starsHtml += '<i class="fa-solid fa-star star-filled"></i>';
            } else {
                starsHtml += '<i class="fa-regular fa-star star-empty"></i>';
            }
        }

        // Weather Suitability Alert
        const weatherEval = evaluateWeatherSuitability(spot.type, liveWeatherData, spot);
        const weatherClass = weatherEval.status === "warning" ? "weather-warning" : "weather-good";
        const weatherIcon = weatherEval.icon || (weatherEval.status === "warning" ? "fa-triangle-exclamation" : "fa-circle-check");
        const weatherHtml = liveWeatherData ? `
            <div class="weather-suitability-badge ${weatherClass}">
                <i class="fa-solid ${weatherIcon}"></i> ${weatherEval.label}
            </div>
        ` : '';

        // Distance text
        const distHtml = spot.distance !== null ? `
            <span class="spot-card-distance">${spot.distance.toFixed(1)} km away</span>
        ` : '';

        // Hiking-specific bilingual subtitle & metrics row
        let hikeCardExtrasHtml = "";
        let typeLabel = spot.type;
        if (spot.type === "hiking") {
            typeLabel = `hiking • ${spot.region || 'CH'}`;
            const diffLabel = spot.difficulty === "easy"
                ? "🟢 Easy"
                : (spot.difficulty === "moderate" ? "🟠 Moderate" : "🔴 Difficult");
            const strollerPill = spot.strollerFriendly === "yes"
                ? `<span class="hike-pill hike-pill-stroller"><i class="fa-solid fa-baby-carriage"></i> Stroller Friendly</span>`
                : "";
            let winterLabel = "Winter Trail";
            let winterIcon = "fa-snowflake";
            if (spot.winterActivity === "snowshoe") {
                winterLabel = "Snowshoe Trail";
            } else if (spot.winterActivity === "sledge") {
                winterLabel = "Sledging Run";
                winterIcon = "fa-person-sledding";
            }
            const winterPill = spot.isWinterTrail
                ? `<span class="hike-pill hike-pill-winter"><i class="fa-solid ${winterIcon}"></i> ${winterLabel}</span>`
                : "";
            const restCount = spot.restaurants ? spot.restaurants.length : 0;
            const restPill = restCount > 0
                ? `<span class="hike-pill"><i class="fa-solid fa-utensils"></i> ${restCount} Restaurant${restCount > 1 ? 's' : ''}</span>`
                : "";
            const eleChangePill = spot.winterActivity === "sledge"
                ? `<span class="hike-pill"><i class="fa-solid fa-mountain"></i> ↓${spot.descentM}m</span>`
                : `<span class="hike-pill"><i class="fa-solid fa-mountain"></i> ↑${spot.ascentM}m</span>`;

            hikeCardExtrasHtml = `
                ${spot.nameDe && spot.nameDe !== spot.name ? `<div class="spot-card-subtitle-de">🇩🇪 ${spot.nameDe}</div>` : ''}
                <div class="hike-card-metrics">
                    <span class="hike-pill hike-pill-${spot.difficulty || 'easy'}">${diffLabel}</span>
                    <span class="hike-pill"><i class="fa-solid fa-route"></i> ${spot.distanceKm} km</span>
                    <span class="hike-pill"><i class="fa-regular fa-clock"></i> ${spot.durationText}</span>
                    ${eleChangePill}
                    ${strollerPill}
                    ${winterPill}
                    ${restPill}
                </div>
            `;
        }

        const card = document.createElement("div");
        const attributionHtml = spot.imageSource ? `<span class="image-attribution">📷 ${spot.imageSource}</span>` : '';

        card.className = "spot-card";
        card.dataset.id = spot.id;
        card.innerHTML = `
            <div class="spot-card-img-container">
                <img class="spot-card-img" src="${spot.imageUrl}" alt="${spot.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=getDefaultSpotFallback('${spot.type}')">
                <div class="spot-card-badges">
                    <span class="badge-type badge-${spot.type}">${typeLabel}</span>
                    ${weatherHtml}
                </div>
                ${distHtml}
                ${attributionHtml}
            </div>
            <div class="spot-card-info">
                <h3 class="spot-card-title">${spot.name}</h3>
                ${hikeCardExtrasHtml}
                <p class="spot-card-area"><i class="fa-solid fa-location-dot"></i> ${spot.address}</p>
                <div class="spot-card-meta">
                    <div class="spot-card-rating">
                        ${starsHtml} <span>(${spot.ratings ? spot.ratings.length : 1})</span>
                    </div>
                    ${feeBadge}
                </div>
            </div>
            <div class="spot-card-footer">
                <button class="btn btn-outline" onclick="openDetails('${spot.id}')">${spot.type === 'hiking' ? 'Trail Info & Profile' : 'View Details'}</button>
                <button class="btn btn-primary" onclick="focusOnMap('${spot.id}', ${spot.lat}, ${spot.lng})"><i class="fa-solid fa-location-crosshairs"></i> ${spot.type === 'hiking' ? 'Show Trail' : 'Map'}</button>
            </div>
        `;

        // Highlight card on click
        card.addEventListener("click", (e) => {
            if (e.target.tagName !== "BUTTON" && !e.target.closest("button")) {
                openDetails(spot.id);
            }
        });

        listContainer.appendChild(card);
    });

    if (filtered.length > visibleSpots.length) {
        const loadMoreWrap = document.createElement("div");
        loadMoreWrap.style.cssText = "grid-column: 1 / -1; text-align: center; padding: 1.25rem 0;";
        loadMoreWrap.innerHTML = `
            <button class="btn btn-primary" onclick="loadMoreSpots()" style="padding: 0.75rem 1.75rem; font-size: 0.9rem;">
                <i class="fa-solid fa-plus"></i> Show More Spots & Trails (Showing ${visibleSpots.length} of ${filtered.length})
            </button>
        `;
        listContainer.appendChild(loadMoreWrap);
    }

    updateMapMarkers(visibleSpots);
}

// Center Map on a Selected Spot or Hiking Trail Polyline from Card
function focusOnMap(id, lat, lng) {
    if (!activeMap) return;
    
    const spot = spots.find(s => s.id === id);
    if (spot && spot.type === "hiking" && Array.isArray(spot.coordinates) && spot.coordinates.length > 1) {
        activeMap.fitBounds(spot.coordinates, { padding: [45, 45], maxZoom: 14 });
        const poly = mapPolylines.find(p => p.spotId === id);
        if (poly) poly.openPopup();
    } else {
        activeMap.setView([lat, lng], 14);
        const marker = mapMarkers.find(m => m.spotId === id || (m.getLatLng().lat === lat && m.getLatLng().lng === lng));
        if (marker) {
            marker.openPopup();
        }
    }

    // Scroll to map for mobile screens
    if (window.innerWidth <= 992) {
        document.getElementById("map-panel").style.display = "block";
        setTimeout(() => activeMap.invalidateSize(), 100);
    }
}

// Helper for fallback images when scraped urls break or are blocked
function getDefaultSpotFallback(type) {
    if (type === "playpark") return "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80";
    if (type === "hiking") return "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=600&auto=format&fit=crop&q=80";
    if (type === "gamezone") return "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=600&auto=format&fit=crop&q=80";
    return "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80";
}

// Image Gallery Switcher
window.changeDetailImage = function(src, thumbnailEl) {
    const mainImg = document.getElementById("detail-main-img");
    if (!mainImg) return;
    
    mainImg.style.opacity = 0.2;
    setTimeout(() => {
        mainImg.src = src;
        mainImg.style.opacity = 1;
    }, 150);
    
    const thumbnails = document.querySelectorAll(".thumbnail-img");
    thumbnails.forEach(t => t.classList.remove("active"));
    thumbnailEl.classList.add("active");
};

// Reset spot image to type-specific default category image
window.resetSpotImage = async function(spotId) {
    if (!confirm("Are you sure you want to reset this spot's photo to the category default?")) return;
    
    try {
        const response = await fetch(`/api/scrape-images?action=reset&id=${spotId}`);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.imageUrl) {
                // Update in local memory spots array
                const spot = spots.find(s => s.id === spotId);
                if (spot) {
                    spot.imageUrl = data.imageUrl;
                    spot.images = [data.imageUrl];
                }
                
                // Update detail modal views
                const mainImg = document.getElementById("detail-main-img");
                if (mainImg) mainImg.src = data.imageUrl;
                
                const thumbnails = document.querySelector(".detail-thumbnails");
                if (thumbnails) thumbnails.style.display = "none"; // Hide thumbnails
                
                // Re-render list to update card photos
                renderSpotsList();
            }
        }
    } catch (err) {
        console.warn("Reset photo failed:", err);
    }
};

// Convert WGS84 [lat, lng] to official Swiss LV95 [E, N] (EPSG:2056) in meters for map.geo.admin.ch
function wgs84ToLv95(lat, lng) {
    if (!lat || !lng) return [2600000, 1200000];
    const phi = (lat * 3600 - 169028.66) / 10000;
    const lambda = (lng * 3600 - 26782.5) / 10000;

    const E = 2600072.37
        + 211455.93 * lambda
        - 10938.51 * lambda * phi
        - 0.36 * lambda * Math.pow(phi, 2)
        - 44.54 * Math.pow(lambda, 3);

    const N = 1200147.07
        + 308807.95 * phi
        + 3745.25 * Math.pow(lambda, 2)
        + 76.63 * Math.pow(phi, 2)
        - 194.56 * Math.pow(lambda, 2) * phi
        + 119.57 * Math.pow(phi, 3);

    return [Math.round(E), Math.round(N)];
}

// Build canonical Swisstopo App (Universal Link) and Web Map URLs for a hike
function getSwisstopoUrlsForHike(spot) {
    if (!spot || spot.type !== 'hiking') return null;

    const canonicalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'https://swissforkids.ch'
        : window.location.origin;

    const gpxTrackUrl = `${canonicalHost}/api/hikes/${encodeURIComponent(spot.id)}/track.gpx`;
    const base64GpxUrl = btoa(unescape(encodeURIComponent(gpxTrackUrl)));

    // Official Swisstopo Universal Link / App Link (opens Swisstopo App on iOS & Android with the route)
    const appUrl = `https://swisstopo.app/u/${base64GpxUrl}`;

    // Compute Swiss LV95 coordinates for map centering
    const [E, N] = wgs84ToLv95(spot.lat, spot.lng);

    // Resolve official ASTRA / SwitzerlandMobility feature ID (e.g. 810.00, 1.13, 145.00)
    let featureId = null;
    const sid = String(spot.swisstopoId || '').trim();

    if (/^\d+\.\d+$/.test(sid)) {
        featureId = sid;
    } else if (spot.schweizMobilUrlEn) {
        const stageMatch = spot.schweizMobilUrlEn.match(/route-(\d+)\/stage-(\d+)/);
        if (stageMatch) {
            featureId = `${stageMatch[1]}.${String(stageMatch[2]).padStart(2, '0')}`;
        } else {
            const routeMatch = spot.schweizMobilUrlEn.match(/route-(\d+)/);
            if (routeMatch) {
                featureId = `${routeMatch[1]}.00`;
            }
        }
    }

    if (!featureId) {
        if (/^\d+$/.test(sid) && Number(sid) < 100000) {
            featureId = `${sid}.00`;
        } else if (spot.routeNumber && /^\d+$/.test(String(spot.routeNumber).trim())) {
            featureId = `${String(spot.routeNumber).trim()}.00`;
        }
    }

    let webUrl = '';
    if (featureId) {
        // Official Swisstopo / GeoAdmin Map with the exact vector trail route selected and highlighted in red
        webUrl = `https://map.geo.admin.ch/#/map?center=${E},${N}&z=8.5&layers=ch.astra.wanderland@features=${featureId}&bgLayer=ch.swisstopo.pixelkarte-farbe&lang=en`;
    } else if (spot.schweizMobilUrlEn && spot.schweizMobilUrlEn.includes('/tour/')) {
        // For iconic tours (e.g. Ebenalp-Seealpsee, Bachalpsee), SchweizMobil's official tour page has the interactive route map
        webUrl = spot.schweizMobilUrlEn;
    } else {
        // Fallback: Swisstopo map centered on coordinates with Wanderland trail network and search query
        const searchParam = spot.startStop || spot.name || '';
        webUrl = `https://map.geo.admin.ch/#/map?center=${E},${N}&z=8.5&layers=ch.astra.wanderland&bgLayer=ch.swisstopo.pixelkarte-farbe&lang=en&swisssearch=${encodeURIComponent(searchParam)}&swisssearch_autoselect=true`;
    }

    return { appUrl, webUrl, gpxTrackUrl, featureId };
}

// Chooser modal for mobile devices to seamlessly choose App or Web Map
window.openSwisstopoChooserModal = function(spot, urls) {
    const existing = document.getElementById('swisstopo-chooser-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'swisstopo-chooser-modal';
    overlay.className = 'swisstopo-modal-overlay';
    overlay.innerHTML = `
        <div class="swisstopo-modal-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; display: flex; align-items: center; gap: 0.4rem;">
                    <i class="fa-solid fa-map-location-dot" style="color: #d90429;"></i> swisstopo Route Map
                </h3>
                <button type="button" class="btn-close-modal" onclick="document.getElementById('swisstopo-chooser-modal').remove()" style="background: none; border: none; font-size: 1.25rem; color: var(--text-secondary); cursor: pointer; padding: 4px;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 1rem 0; line-height: 1.35;">
                <strong>${escapeHtml(spot.name)}</strong><br>
                Choose how you'd like to view this trail:
            </p>
            <a href="${urls.appUrl}" target="_blank" rel="noopener" class="swisstopo-option-btn" onclick="document.getElementById('swisstopo-chooser-modal').remove()">
                <i class="fa-solid fa-mobile-screen-button"></i>
                <div>
                    <span class="opt-title">Open in swisstopo App</span>
                    <span class="opt-desc">If the official app is installed on your phone, opens the route & GPS navigation directly</span>
                </div>
            </a>
            <a href="${urls.webUrl}" target="_blank" rel="noopener" class="swisstopo-option-btn" onclick="document.getElementById('swisstopo-chooser-modal').remove()">
                <i class="fa-solid fa-compass"></i>
                <div>
                    <span class="opt-title">Open swisstopo Web Map</span>
                    <span class="opt-desc">Displays the complete trail line, elevation profile & topographic map directly in your browser</span>
                </div>
            </a>
            ${spot.schweizMobilUrlEn ? `
            <a href="${spot.schweizMobilUrlEn}" target="_blank" rel="noopener" class="swisstopo-option-btn" onclick="document.getElementById('swisstopo-chooser-modal').remove()">
                <i class="fa-solid fa-signs-post"></i>
                <div>
                    <span class="opt-title">Open SchweizMobil Guide</span>
                    <span class="opt-desc">Official photos, stage details, elevation profile & interactive map</span>
                </div>
            </a>` : ''}
            <div style="text-align: right; margin-top: 0.75rem;">
                <button type="button" class="btn btn-outline" onclick="document.getElementById('swisstopo-chooser-modal').remove()" style="padding: 0.35rem 0.85rem; font-size: 0.8rem; border-radius: var(--radius-sm);">
                    Cancel
                </button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
};

window.handleSwisstopoClick = function(event, spotId) {
    const spot = spots.find(s => s.id === spotId);
    if (!spot) return;

    const urls = getSwisstopoUrlsForHike(spot);
    if (!urls) return;

    // Directly open the official Swisstopo Web Map with highlighted route
    event.preventDefault();
    window.open(urls.webUrl, '_blank', 'noopener,noreferrer');
    return false;
};

window.handleSwisstopoAppClick = function(event, spotId) {
    const spot = spots.find(s => s.id === spotId);
    if (!spot) return;

    const urls = getSwisstopoUrlsForHike(spot);
    if (!urls) return;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (!isMobile) {
        // On desktop, the phone app is not installed anyway, so open the web map directly
        event.preventDefault();
        window.open(urls.webUrl, '_blank', 'noopener,noreferrer');
        return false;
    }

    // On mobile phone: allow Universal Link to open app
    return true;
};

// --- Swiss Mountain Gondolas, Cable Cars & Mountain Railways Intelligence ---
const SWISS_MOUNTAIN_LIFTS = [
    {
        id: 'ebenalp',
        match: /ebenalp|seealpsee|wildkirchli|äscher|wasserauen/i,
        name: 'Luftseilbahn Wasserauen–Ebenalp',
        type: 'Cable Car (Luftseilbahn)',
        valley: 'Wasserauen',
        mountain: 'Ebenalp',
        operatorUrl: 'https://www.ebenalp.ch/en/timetable-tariffs'
    },
    {
        id: 'first',
        match: /bachalpsee|first cliff|firstbahn|grindelwald-first/i,
        name: 'Firstbahn Gondelbahn',
        type: 'Gondola (Gondelbahn)',
        valley: 'Grindelwald, Firstbahn',
        mountain: 'First (Grindelwald)',
        operatorUrl: 'https://www.jungfrau.ch/en-gb/grindelwaldfirst/'
    },
    {
        id: 'oeschinen',
        match: /oeschinensee|oeschinen/i,
        name: 'Gondelbahn Kandersteg–Oeschinensee',
        type: 'Gondola (Gondelbahn)',
        valley: 'Kandersteg',
        mountain: 'Oeschinen',
        operatorUrl: 'https://www.oeschinensee.ch/en/'
    },
    {
        id: 'maennlichen',
        match: /männlichen|maennlichen/i,
        name: 'Luftseilbahn Wengen–Männlichen',
        type: 'Cable Car (Luftseilbahn)',
        valley: 'Wengen',
        mountain: 'Männlichen',
        operatorUrl: 'https://www.maennlichen.ch/en/'
    },
    {
        id: 'gornergrat',
        match: /gornergrat|riffelsee/i,
        name: 'Gornergrat Bahn (Zahnradbahn)',
        type: 'Cogwheel Railway (Zahnradbahn)',
        valley: 'Zermatt',
        mountain: 'Gornergrat',
        operatorUrl: 'https://www.gornergrat.ch/en/'
    },
    {
        id: 'staubern',
        match: /saxer lücke|saxer luecke|staubern|frümsen/i,
        name: 'Luftseilbahn Frümsen–Staubern',
        type: 'Solar Cable Car (Luftseilbahn)',
        valley: 'Frümsen (Luftseilbahn)',
        mountain: 'Staubern',
        operatorUrl: 'https://www.staubern.ch/'
    },
    {
        id: 'gelmerbahn',
        match: /gelmersee|gelmerbahn|handegg/i,
        name: 'Gelmerbahn (Europe\'s Steepest Funicular)',
        type: 'Open Funicular (Standseilbahn)',
        valley: 'Handegg, Gelmerbahn',
        mountain: 'Gelmersee',
        operatorUrl: 'https://www.grimselwelt.ch/en/bahnen/gelmerbahn/'
    },
    {
        id: 'stoos',
        match: /stoos|fronalpstock/i,
        name: 'Stoosbahn (World\'s Steepest Funicular)',
        type: 'Funicular (Standseilbahn)',
        valley: 'Schwyz, Stoosbahn',
        mountain: 'Stoos SZ',
        operatorUrl: 'https://stoos.ch/en/'
    },
    {
        id: 'pilatus',
        match: /pilatus|dragon path|kriens.*pilatus|alpnachstad.*pilatus/i,
        name: 'Pilatus Panorama-Gondelbahn',
        type: 'Panorama Gondola & Cable Car',
        valley: 'Kriens, Pilatus-Bahnen',
        mountain: 'Pilatus Kulm',
        operatorUrl: 'https://www.pilatus.ch/en/'
    },
    {
        id: 'rigi',
        match: /rigi kulm|vitznau.*rigi|arth-goldau.*rigi|weggis.*rigi/i,
        name: 'Rigi Bahnen (Historic Cogwheel)',
        type: 'Cogwheel Railway (Zahnradbahn)',
        valley: 'Vitznau',
        mountain: 'Rigi Kulm',
        operatorUrl: 'https://www.rigi.ch/en'
    },
    {
        id: 'titlis',
        match: /titlis|trübsee/i,
        name: 'Titlis Rotair Cable Car',
        type: 'Rotating Cable Car (Luftseilbahn)',
        valley: 'Engelberg',
        mountain: 'Titlis',
        operatorUrl: 'https://www.titlis.ch/en'
    },
    {
        id: 'braunwald',
        match: /braunwald|linthal braunwald/i,
        name: 'Braunwaldbahn Funicular',
        type: 'Funicular (Standseilbahn)',
        valley: 'Linthal Braunwaldbahn',
        mountain: 'Braunwald',
        operatorUrl: 'https://www.braunwald.ch/en/'
    },
    {
        id: 'bettmeralp',
        match: /bettmeralp|eggishorn|betten talstation/i,
        name: 'Aletsch Arena Bettmeralp Seilbahn',
        type: 'Cable Car (Luftseilbahn)',
        valley: 'Betten Talstation',
        mountain: 'Bettmeralp',
        operatorUrl: 'https://www.aletscharena.ch/en'
    },
    {
        id: 'schilthorn',
        match: /schilthorn|birg|stechelberg.*schilthorn|mürren.*schilthorn/i,
        name: 'Schilthornbahn',
        type: 'Cable Car (Luftseilbahn)',
        valley: 'Stechelberg, Schilthornbahn',
        mountain: 'Mürren',
        operatorUrl: 'https://schilthorn.ch/en/'
    },
    {
        id: 'harderkulm',
        match: /harder kulm|harderbahn/i,
        name: 'Harderbahn Funicular',
        type: 'Funicular (Standseilbahn)',
        valley: 'Interlaken Ost',
        mountain: 'Harder Kulm',
        operatorUrl: 'https://www.jungfrau.ch/en-gb/harder-kulm/'
    }
];

function detectMountainLiftForSpot(spot) {
    if (!spot) return null;
    if (spot.mountainLift) return spot.mountainLift;
    // Don't detect for valley floor hikes like Lauterbrunnental waterfalls
    if (spot.id === 'hike-iconic-lauterbrunnen-waterfalls-stechelberg') return null;

    const text = `${spot.name || ''} ${spot.startStop || ''} ${spot.endStop || ''} ${spot.city || ''} ${spot.description || ''}`;
    for (const lift of SWISS_MOUNTAIN_LIFTS) {
        if (lift.match.test(text)) {
            return lift;
        }
    }
    return null;
}

// --- Detail View Loading ---
async function openDetails(spotId, options = {}) {
    const spot = spots.find(s => s.id === spotId);
    if (!spot) return;

    let isGenericName = /^(playground|swimming pool|indoor play center) (in|at) /i.test(spot.name);

    // If it's an OSM spot with a generic name, try to reverse geocode it to get a specific street name
    if (spotId.startsWith("osm-spot-") && isGenericName) {
        try {
            const geoResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${spot.lat}&lon=${spot.lng}&format=json&accept-language=en,de`);
            if (geoResponse.ok) {
                const geoData = await geoResponse.json();
                if (geoData && geoData.address) {
                    const addr = geoData.address;
                    const roadTypes = ['road', 'pedestrian', 'footway', 'path', 'cycleway', 'square', 'suburb', 'neighbourhood'];
                    let street = "";
                    for (const type of roadTypes) {
                        if (addr[type]) {
                            street = addr[type];
                            break;
                        }
                    }
                    
                    if (street) {
                        const suburb = addr.suburb || addr.neighbourhood || addr.city_district || "";
                        
                        if (spot.type === "playpark") {
                            spot.name = `Playground at ${street}`;
                        } else if (spot.type === "swimmingpool") {
                            spot.name = `Swimming Pool at ${street}`;
                        } else {
                            spot.name = `Indoor Play Center at ${street}`;
                        }
                        
                        if (suburb && suburb.toLowerCase() !== spot.city.toLowerCase()) {
                            spot.name += ` (${suburb})`;
                        }
                        
                        spot.address = `${street}, ${spot.zip} ${spot.city}`;
                        
                        // Update in global memory spots array
                        const mainIdx = spots.findIndex(s => s.id === spotId);
                        if (mainIdx !== -1) {
                            spots[mainIdx].name = spot.name;
                            spots[mainIdx].address = spot.address;
                        }
                        
                        // Re-render the map and list to show the new name
                        renderSpotsList();
                    }
                }
            }
        } catch (err) {
            console.warn("Reverse geocoding failed:", err);
        }
    }

    const spotImages = spot.images && spot.images.length > 0 ? spot.images : [spot.imageUrl];
    const mainImage = spotImages[0];
    const isPlaceholder = spot.imageUrl && spot.imageUrl.includes("unsplash.com/photo-");
    const isOSM = spotId.startsWith("osm-spot-");
    
    let galleryHtml = "";
    const hasMultipleImages = spotImages.length > 1;
    let loadingBadgeHtml = (isOSM && isPlaceholder) 
        ? `<div id="scraped-image-loading" class="image-loading-badge"><i class="fa-solid fa-spinner fa-spin"></i> Searching for real photos...</div>`
        : "";

    if (hasMultipleImages) {
        const thumbnailsHtml = spotImages.map((img, idx) => `
            <img class="thumbnail-img ${idx === 0 ? 'active' : ''}" src="${img}" alt="Preview ${idx + 1}" onclick="changeDetailImage('${img}', this)" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">
        `).join("");
        
        galleryHtml = `
            <div class="detail-gallery">
                <div class="detail-main-img-container">
                    ${loadingBadgeHtml}
                    <img id="detail-main-img" class="detail-main-img" src="${mainImage}" alt="${spot.name}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=getDefaultSpotFallback('${spot.type}')">
                </div>
                <div class="detail-thumbnails">
                    ${thumbnailsHtml}
                </div>
            </div>
        `;
    } else {
        galleryHtml = `
            <div class="detail-gallery">
                <div class="detail-main-img-container">
                    ${loadingBadgeHtml}
                    <img id="detail-main-img" class="detail-main-img" src="${mainImage}" alt="${spot.name}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=getDefaultSpotFallback('${spot.type}')">
                </div>
            </div>
        `;
    }

    const modal = document.getElementById("detail-modal");
    const container = document.getElementById("modal-spot-details");
    
    modal.style.display = "flex";
    
    // Pre-populate HTML showing loading weather
    const avgR = getAvgRating(spot);
    let starsHtml = "";
    const roundedRating = Math.round(avgR);
    for (let i = 1; i <= 5; i++) {
        starsHtml += i <= roundedRating 
            ? '<i class="fa-solid fa-star star-filled"></i>' 
            : '<i class="fa-regular fa-star star-empty"></i>';
    }

    const amenitiesHtml = spot.amenities.map(a => {
        let aIcon = "fa-check";
        if (a === "Toilets") aIcon = "fa-restroom";
        else if (a.includes("Cafe") || a.includes("Food")) aIcon = "fa-mug-hot";
        else if (a === "Shade") aIcon = "fa-umbrella-beach";
        else if (a.includes("Stroller")) aIcon = "fa-baby-carriage";
        else if (a === "Parking") aIcon = "fa-square-parking";
        else if (a.includes("Picnic")) aIcon = "fa-tree";
        return `<span class="amenities-badge"><i class="fa-solid ${aIcon}"></i> ${a}</span>`;
    }).join("");

    const reviewsHtml = spot.comments && spot.comments.length > 0 ? spot.comments.map(c => {
        let revStars = "";
        for (let i = 1; i <= 5; i++) {
            revStars += i <= c.rating 
                ? '<i class="fa-solid fa-star star-filled"></i>' 
                : '<i class="fa-regular fa-star star-empty"></i>';
        }
        return `
            <div class="review-item">
                <div class="review-header">
                    <span class="review-author">${c.author}</span>
                    <span class="review-stars">${revStars}</span>
                </div>
                <p class="review-text">${c.text}</p>
            </div>
        `;
    }).join("") : '<p class="no-reviews-placeholder">No reviews yet. Be the first to share your thoughts!</p>';

    let directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    if (spot.type === "hiking" && Array.isArray(spot.coordinates) && spot.coordinates.length >= 2) {
        const coords = spot.coordinates;
        const startPt = coords[0];
        const endPt = coords[coords.length - 1];
        const origin = `${startPt[0]},${startPt[1]}`;
        const destination = `${endPt[0]},${endPt[1]}`;
        const waypoints = [];
        if (coords.length >= 5) {
            for (const f of [0.2, 0.4, 0.6, 0.8]) {
                const idx = Math.min(coords.length - 2, Math.max(1, Math.round(f * (coords.length - 1))));
                const ptStr = `${coords[idx][0]},${coords[idx][1]}`;
                if (ptStr !== origin && ptStr !== destination && !waypoints.includes(ptStr)) {
                    waypoints.push(ptStr);
                }
            }
        } else if (coords.length >= 3) {
            const midPt = coords[Math.floor(coords.length / 2)];
            waypoints.push(`${midPt[0]},${midPt[1]}`);
        }
        directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=walking`;
        if (waypoints.length > 0) {
            directionsUrl += `&waypoints=${encodeURIComponent(waypoints.join("|"))}`;
        }
    }
    const googleSearchUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.lat},${spot.lng}`;
    const detailAttributionHtml = spot.imageSource ? `<div class="image-attribution detail-attribution">📷 ${spot.imageSource}</div>` : '';

    // Build SVG Elevation Profile chart for hiking routes
    let hikingDetailSectionsHtml = "";
    let metaGridHtml = "";
    let actionButtonsHtml = "";
    let subtitleDeHtml = "";

    if (spot.type === "hiking") {
        subtitleDeHtml = spot.nameDe ? `<div class="hike-bilingual-subtitle">🇩🇪 ${spot.nameDe}</div>` : '';
        const diffBadgeText = spot.difficulty === "easy"
            ? "🟢 Easy (Leicht)"
            : (spot.difficulty === "moderate" ? "🟠 Moderate (Mittel)" : "🔴 Difficult (Schwer)");

        actionButtonsHtml = `
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                <button type="button" class="btn btn-primary" onclick="openGroupHikePlanner('${spot.id}')" title="Coordinate travel, live SBB trains &amp; WhatsApp invite" style="padding: 0.45rem 0.9rem; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.4rem; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0; background: linear-gradient(135deg, #2a9d8f, #264653); border: none; color: white; cursor: pointer;">
                    <i class="fa-solid fa-users"></i> Plan Group Hike
                </button>
                ${(() => {
                    const stUrls = getSwisstopoUrlsForHike(spot);
                    if (!stUrls) return '';
                    return `
                    <a href="${stUrls.appUrl}" onclick="handleSwisstopoAppClick(event, '${spot.id}')" target="_blank" rel="noopener" class="btn btn-outline" title="Open hike route directly in swisstopo app (phone)" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0; cursor: pointer;">
                        <i class="fa-solid fa-mobile-screen-button" style="color: #d90429;"></i> swisstopo App
                    </a>
                    <a href="${stUrls.webUrl}" target="_blank" rel="noopener" class="btn btn-outline" title="Open interactive route line & elevation profile in web browser" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0;">
                        <i class="fa-solid fa-map-location-dot" style="color: #d90429;"></i> swisstopo Web Map
                    </a>`;
                })()}
                ${spot.schweizMobilUrlEn ? `
                <a href="${spot.schweizMobilUrlEn}" target="_blank" rel="noopener" class="btn btn-outline" title="Official SchweizMobil route description & photos" style="padding: 0.45rem 0.85rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0;">
                    <i class="fa-solid fa-signs-post"></i> SchweizMobil Guide
                </a>` : ''}
                <a href="${directionsUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="padding: 0.45rem 0.9rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0; color: white;">
                    <i class="fa-solid fa-person-walking"></i> Navigate to Start
                </a>
            </div>
        `;

        metaGridHtml = `
            <div class="detail-meta-grid">
                <div class="detail-meta-item">
                    <i class="fa-solid fa-gauge-high"></i>
                    <div class="detail-meta-item-content">
                        <h4>Hiking Level / SAC Scale</h4>
                        <p>${diffBadgeText}</p>
                        <small style="color: var(--text-secondary); font-size: 0.75rem;">${spot.sacScale || 'T1 Wanderweg'}</small>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid fa-route"></i>
                    <div class="detail-meta-item-content">
                        <h4>Distance &amp; Duration</h4>
                        <p>${spot.distanceKm} km &bull; ${spot.durationText}</p>
                        <small style="color: var(--text-secondary); font-size: 0.75rem;">Official Swiss hiking time</small>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid fa-mountain"></i>
                    <div class="detail-meta-item-content">
                        <h4>Elevation Gain / Loss</h4>
                        <p>↑ ${spot.ascentM} m &bull; ↓ ${spot.descentM} m</p>
                        <small style="color: var(--text-secondary); font-size: 0.75rem;">Alt: ${spot.minElevationM}m – ${spot.maxElevationM}m</small>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid fa-baby-carriage"></i>
                    <div class="detail-meta-item-content">
                        <h4>Stroller Friendly</h4>
                        <p>${spot.strollerFriendly === 'yes' ? '✅ Yes (Kinderwagentauglich)' : '❌ No (Carrier/Hiking Boots)'}</p>
                        <small style="color: var(--text-secondary); font-size: 0.75rem;">Max gradient: ~${spot.maxGradientPct || 6}%</small>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid ${spot.isWinterTrail ? 'fa-snowflake' : 'fa-calendar-check'}"></i>
                    <div class="detail-meta-item-content">
                        <h4>Season &amp; Winter</h4>
                        <p>${spot.isWinterTrail ? '❄️ Winter &amp; Panorama Trail' : (spot.season === 'summer' ? '☀️ Summer / 3-Season' : '🌿 All-Season Trail')}</p>
                        <small style="color: var(--text-secondary); font-size: 0.75rem;">${spot.openingHours}</small>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid fa-star"></i>
                    <div class="detail-meta-item-content">
                        <h4>Rating &amp; Trail Fee</h4>
                        <p>${avgR} ★ (${spot.ratings.length} reviews)</p>
                        <small style="color: var(--text-secondary); font-size: 0.75rem;">${spot.fees}</small>
                    </div>
                </div>
            </div>
        `;

        // Build SVG Elevation Chart
        let elevationSvgHtml = "";
        if (Array.isArray(spot.elevationProfile) && spot.elevationProfile.length > 1) {
            const prof = spot.elevationProfile;
            const w = 640;
            const h = 120;
            const padL = 42;
            const padR = 16;
            const padT = 14;
            const padB = 24;
            const plotW = w - padL - padR;
            const plotH = h - padT - padB;
            const maxD = prof[prof.length - 1].d || spot.distanceKm || 5;
            const minE = Math.min(...prof.map(p => p.ele));
            const maxE = Math.max(...prof.map(p => p.ele));
            const spanE = Math.max(40, maxE - minE);

            const pts = prof.map((p, idx) => {
                const x = padL + ((maxD > 0 ? p.d / maxD : idx / (prof.length - 1)) * plotW);
                const y = padT + plotH - (((p.ele - minE) / spanE) * plotH);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            const areaPts = `${padL},${padT + plotH} ` + pts.join(" ") + ` ${padL + plotW},${padT + plotH}`;

            elevationSvgHtml = `
                <div class="elevation-profile-card">
                    <div class="elevation-profile-header">
                        <h3><i class="fa-solid fa-chart-area" style="color: var(--accent-hiking);"></i> Elevation Profile / Höhenprofil</h3>
                        <div class="elevation-stats-row">
                            <span>Min: ${minE} m</span>
                            <span>Max: ${maxE} m</span>
                            <span>↑ ${spot.ascentM} m</span>
                            <span>↓ ${spot.descentM} m</span>
                        </div>
                    </div>
                    <svg class="elevation-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="hikeGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#2d6a4f" stop-opacity="0.45"/>
                                <stop offset="100%" stop-color="#2d6a4f" stop-opacity="0.04"/>
                            </linearGradient>
                        </defs>
                        <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="rgba(141,153,174,0.25)" stroke-dasharray="3,3"/>
                        <line x1="${padL}" y1="${padT + plotH / 2}" x2="${w - padR}" y2="${padT + plotH / 2}" stroke="rgba(141,153,174,0.25)" stroke-dasharray="3,3"/>
                        <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="rgba(141,153,174,0.4)"/>
                        <text x="${padL - 6}" y="${padT + 4}" text-anchor="end" font-size="10" fill="currentColor" opacity="0.65">${maxE}m</text>
                        <text x="${padL - 6}" y="${padT + plotH}" text-anchor="end" font-size="10" fill="currentColor" opacity="0.65">${minE}m</text>
                        <text x="${padL}" y="${h - 5}" text-anchor="start" font-size="10" fill="currentColor" opacity="0.65">0 km</text>
                        <text x="${padL + plotW / 2}" y="${h - 5}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.65">${(maxD / 2).toFixed(1)} km</text>
                        <text x="${w - padR}" y="${h - 5}" text-anchor="end" font-size="10" fill="currentColor" opacity="0.65">${maxD} km</text>
                        <polygon points="${areaPts}" fill="url(#hikeGrad)"/>
                        <polyline points="${pts.join(" ")}" fill="none" stroke="#2d6a4f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
            `;
        }

        // Nearby cross-linked playgrounds buttons
        const nearbySpotsHtml = (spot.nearbySpots && spot.nearbySpots.length > 0)
            ? `<div class="nearby-playgrounds-pills">
                 ${spot.nearbySpots.map(ns => `
                    <button type="button" class="nearby-spot-pill" onclick="openNearbyKidsSpot('${ns.id}')">
                        <i class="fa-solid ${ns.type === 'swimmingpool' ? 'fa-water-ladder' : 'fa-child-reaching'}"></i>
                        ${ns.name} (${ns.distanceM}m from trail)
                    </button>
                 `).join('')}
               </div>`
            : '';

        const restaurantsListHtml = (spot.restaurants && spot.restaurants.length > 0)
            ? spot.restaurants.map(r => `<span class="amenities-badge"><i class="fa-solid fa-utensils"></i> ${r}</span>`).join(" ")
            : '<span style="color: var(--text-secondary);">Pack a picnic — no restaurants directly on trail</span>';

        const detectedLift = detectMountainLiftForSpot(spot);
        const liftLogisticsHtml = detectedLift ? `
            <div class="hike-logistics-row" style="background: rgba(2, 132, 199, 0.06); border-radius: 8px; padding: 0.65rem 0.8rem; border-left: 3px solid #0284c7;">
                <i class="fa-solid fa-cable-car" style="color: #0284c7; font-size: 1.15rem; margin-top: 3px;"></i>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.4rem;">
                        <strong>${escapeHtml(detectedLift.name)}</strong>
                        <span style="font-size: 0.72rem; color: #0284c7; font-weight: 700; background: rgba(2, 132, 199, 0.12); padding: 2px 7px; border-radius: 10px;">
                            <i class="fa-solid fa-mountain"></i> ${escapeHtml(detectedLift.type)}
                        </span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                        <span>Route: <strong>${escapeHtml(detectedLift.valley)}</strong> &harr; <strong>${escapeHtml(detectedLift.mountain)}</strong></span>
                    </div>
                    <div id="detail-lift-timetable-${spot.id}" style="margin-top: 6px; font-size: 0.78rem; color: var(--text-secondary);">
                        <i class="fa-solid fa-spinner fa-spin"></i> Checking live lift timetable &amp; last descent...
                    </div>
                </div>
            </div>
        ` : '';

        hikingDetailSectionsHtml = `
            ${elevationSvgHtml}

            <div class="detail-description">
                <h3>Route Description (English &amp; Deutsch)</h3>
                <div class="hike-bilingual-desc-box">
                    <div class="hike-lang-card">
                        <span class="hike-lang-tag">🇬🇧 English</span>
                        <p>${spot.descriptionEn || spot.description}</p>
                    </div>
                    <div class="hike-lang-card">
                        <span class="hike-lang-tag">🇩🇪 Deutsch</span>
                        <p>${spot.descriptionDe || spot.description}</p>
                    </div>
                </div>
            </div>

            <div class="hike-logistics-box">
                <h3 style="margin: 0 0 0.25rem 0; font-size: 1.05rem;"><i class="fa-solid fa-compass" style="color: var(--accent-hiking);"></i> Trail Logistics, Restaurants, Parking &amp; Playgrounds</h3>
                <div class="hike-logistics-row">
                    <i class="fa-solid fa-train-tram"></i>
                    <div>
                        <strong>Start / End Public Transport:</strong><br>
                        <span>Start: ${spot.startStop || spot.city} &rarr; End: ${spot.endStop || spot.city}</span>
                    </div>
                </div>
                <div class="hike-logistics-row">
                    <i class="fa-solid fa-square-parking"></i>
                    <div>
                        <strong>Parking Near Trailhead:</strong><br>
                        <span>${spot.parking || 'Public parking available at start station'}</span>
                    </div>
                </div>
                ${liftLogisticsHtml}
                <div class="hike-logistics-row">
                    <i class="fa-solid fa-utensils"></i>
                    <div style="flex: 1;">
                        <strong>Restaurants &amp; Mountain Inns Along the Route:</strong>
                        <div class="amenities-badges-container" style="margin-top: 0.4rem;">
                            ${restaurantsListHtml}
                        </div>
                    </div>
                </div>
                <div class="hike-logistics-row">
                    <i class="fa-solid fa-children"></i>
                    <div style="flex: 1;">
                        <strong>Playgrounds &amp; Kids Highlights Along the Route:</strong><br>
                        <span>${spot.playgroundsNote || 'Family-friendly nature trail'}</span>
                        ${nearbySpotsHtml}
                    </div>
                </div>
            </div>
        `;
    } else {
        actionButtonsHtml = `
            <div style="display: flex; gap: 8px;">
                <a href="${googleSearchUrl}" target="_blank" rel="noopener" class="btn btn-outline" style="padding: 0.5rem 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0; border: 1px solid var(--border-color);">
                    <i class="fa-solid fa-map-location-dot"></i> Verify on Google Maps
                </a>
                <a href="${directionsUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0; color: white;">
                    <i class="fa-solid fa-diamond-turn-right"></i> Get Directions
                </a>
            </div>
        `;

        metaGridHtml = `
            <div class="detail-meta-grid">
                <div class="detail-meta-item">
                    <i class="fa-solid fa-clock"></i>
                    <div class="detail-meta-item-content">
                        <h4>Opening Times</h4>
                        <p>${spot.openingHours}</p>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid fa-wallet"></i>
                    <div class="detail-meta-item-content">
                        <h4>Entry Fee</h4>
                        <p>${spot.fees}</p>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid fa-child"></i>
                    <div class="detail-meta-item-content">
                        <h4>Age Group</h4>
                        <p>Ages ${spot.minAge} - ${spot.maxAge}</p>
                    </div>
                </div>
                <div class="detail-meta-item">
                    <i class="fa-solid fa-star"></i>
                    <div class="detail-meta-item-content">
                        <h4>Rating</h4>
                        <p>${avgR} Stars (${spot.ratings.length} reviews)</p>
                    </div>
                </div>
            </div>
        `;

        hikingDetailSectionsHtml = `
            <div class="detail-description">
                <h3>Description &amp; Play Features</h3>
                <p>${spot.description}</p>
            </div>
        `;
    }

    container.innerHTML = `
        ${options.groupPlan ? `
        <div class="gh-invite-banner">
            <i class="fa-solid fa-users"></i>
            <div style="flex: 1;">
                <h4>👥 You're Invited to a Group Hike!</h4>
                <p>
                    <strong>📅 Date:</strong> ${options.date || 'Upcoming Weekend'} &nbsp;|&nbsp; 
                    <strong>⏰ Meetup:</strong> ${options.time || '09:00'} at ${options.meetingPoint || spot.startStop || spot.city || spot.name}<br>
                    <strong>🚆 Train &amp; 🚗 Car:</strong> Departure times run backwards so you arrive on time from ${options.from || 'Zürich HB'}!
                </p>
                <div style="margin-top: 0.5rem;">
                    <button type="button" class="btn btn-outline" onclick="openGroupHikePlanner('${spot.id}', { date: '${options.date || ''}', time: '${options.time || ''}', from: '${options.from || ''}', meetingPoint: '${escapeHtml(options.meetingPoint || '')}' })" style="padding: 0.25rem 0.65rem; font-size: 0.75rem; border-color: #2a9d8f; color: #2a9d8f; font-weight: 700; border-radius: 6px;">
                        <i class="fa-solid fa-sliders"></i> Adjust Group Travel &amp; Times
                    </button>
                </div>
            </div>
        </div>` : ''}
        ${galleryHtml}
        ${detailAttributionHtml}
        <div class="detail-title-section">
            <div class="detail-title-row">
                <div>
                    <h2>${spot.name}</h2>
                    ${subtitleDeHtml}
                </div>
                <span class="badge-type badge-${spot.type}">${spot.type}</span>
            </div>
            <div class="detail-address-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.8rem; margin-top: 0.5rem; margin-bottom: 1.2rem;">
                <p class="spot-card-area" style="margin: 0;"><i class="fa-solid fa-location-dot"></i> ${spot.address}</p>
                ${actionButtonsHtml}
            </div>
        </div>

        ${metaGridHtml}

        ${hikingDetailSectionsHtml}

        <div class="detail-amenities">
            <h3>Amenities Available</h3>
            <div class="amenities-badges-container">
                ${amenitiesHtml}
            </div>
        </div>

        <!-- Live Spot Weather Block -->
        <div class="detail-weather-live">
            <h3>Live Weather Report</h3>
            <div id="modal-weather-box" class="weather-loading-placeholder">
                <i class="fa-solid fa-spinner fa-spin"></i> Checking live weather conditions...
            </div>
        </div>

        <!-- Reviews / Comments Section -->
        <div class="detail-reviews">
            <h3>User Comments & Ratings</h3>
            <div class="reviews-container" id="modal-reviews-list">
                ${reviewsHtml}
            </div>

            <!-- Submit Review Form -->
            <div class="add-review-form-container">
                <h4>Write a Review</h4>
                <form id="add-review-form" onsubmit="submitReview(event, '${spot.id}')">
                    <div class="form-group">
                        <label>Your Rating *</label>
                        <div class="star-rating-selector" id="star-selector">
                            <i class="fa-regular fa-star star-selector-btn star-empty" data-val="1"></i>
                            <i class="fa-regular fa-star star-selector-btn star-empty" data-val="2"></i>
                            <i class="fa-regular fa-star star-selector-btn star-empty" data-val="3"></i>
                            <i class="fa-regular fa-star star-selector-btn star-empty" data-val="4"></i>
                            <i class="fa-regular fa-star star-selector-btn star-empty" data-val="5"></i>
                        </div>
                        <input type="hidden" id="review-stars-input" required value="0">
                    </div>
                    <div class="form-row">
                        <div class="form-group flex-1">
                            <label for="review-author-input">Your Name *</label>
                            <input type="text" id="review-author-input" required placeholder="e.g. Papa Roger">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="review-text-input">Comment *</label>
                        <textarea id="review-text-input" rows="2" required placeholder="Share details about slides, shade, crowds, etc..."></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary btn-sm">Submit Review</button>
                </form>
            </div>
        </div>
    `;

    // Hook Star selection logic
    const stars = container.querySelectorAll(".star-selector-btn");
    const starsInput = container.querySelector("#review-stars-input");
    stars.forEach(star => {
        star.addEventListener("click", () => {
            const val = parseInt(star.dataset.val);
            starsInput.value = val;
            
            // Render star highlights
            stars.forEach((s, idx) => {
                if (idx < val) {
                    s.classList.remove("fa-regular", "star-empty");
                    s.classList.add("fa-solid", "star-filled");
                } else {
                    s.classList.remove("fa-solid", "star-filled");
                    s.classList.add("fa-regular", "star-empty");
                }
            });
        });
    });

    // Fetch live weather specifically for this spot
    const spotWeather = await fetchWeatherData(spot.lat, spot.lng, spot.zip);
    const weatherBox = document.getElementById("modal-weather-box");
    if (spotWeather) {
        const weatherDetails = getWeatherIconAndDesc(spotWeather.code);
        const wEval = evaluateWeatherSuitability(spot.type, spotWeather);
        
        const adviceClass = wEval.status === "warning" ? "advice-warn" : "advice-good";
        const adviceIcon = wEval.status === "warning" ? "fa-circle-exclamation" : "fa-circle-check";

        weatherBox.className = "weather-detail-box";
        weatherBox.innerHTML = `
            <div class="weather-detail-top">
                <div class="weather-detail-main">
                    <i class="fa-solid ${weatherDetails.icon}"></i>
                    <div>
                        <span class="weather-detail-temp">${spotWeather.temperature}&deg;C</span>
                        <div style="font-size:0.8rem; color:var(--text-secondary);">${weatherDetails.desc}</div>
                    </div>
                </div>
                <span class="badge" style="font-weight:700;">Rain: ${spotWeather.precipitation} mm</span>
            </div>
            <div class="weather-advice-banner ${adviceClass}">
                <i class="fa-solid ${adviceIcon}"></i>
                <div>
                    <strong>${wEval.label}</strong>
                    <div style="font-weight: normal; margin-top:2px;">${wEval.advice}</div>
                </div>
            </div>
        `;
    } else {
        weatherBox.innerHTML = `<p style="font-size:0.85rem; color:var(--danger-red);"><i class="fa-solid fa-triangle-exclamation"></i> Could not load live weather. Please check standard weather forecast.</p>`;
    }

    // Dynamic image scraping in background if it's an OSM spot with placeholder and NOT a generic name
    const isStillGenericName = /^(playground|swimming pool|indoor play center) (in|at) /i.test(spot.name);
    if (isOSM && isPlaceholder && !isStillGenericName) {
        (async () => {
            try {
                const query = `${spot.name} ${spot.city} Switzerland`;
                const response = await fetch(`/api/scrape-images?id=${spot.id}&query=${encodeURIComponent(query)}&name=${encodeURIComponent(spot.name)}&address=${encodeURIComponent(spot.address)}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.images && data.images.length > 0) {
                        spot.imageUrl = data.images[0];
                        spot.images = data.images;
                        
                        // Update in global memory spots array
                        const mainIdx = spots.findIndex(s => s.id === spotId);
                        if (mainIdx !== -1) {
                            spots[mainIdx].imageUrl = data.images[0];
                            spots[mainIdx].images = data.images;
                        }

                        // Re-render only the gallery section dynamically if modal is still open
                        const currentModal = document.getElementById("detail-modal");
                        if (currentModal.style.display === "flex") {
                            const galleryContainer = currentModal.querySelector(".detail-gallery");
                            if (galleryContainer) {
                                const newThumbnailsHtml = data.images.map((img, idx) => `
                                    <img class="thumbnail-img ${idx === 0 ? 'active' : ''}" src="${img}" alt="Preview ${idx + 1}" onclick="changeDetailImage('${img}', this)" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">
                                `).join("");
                                
                                galleryContainer.outerHTML = `
                                    <div class="detail-gallery">
                                        <div class="detail-main-img-container">
                                            <img id="detail-main-img" class="detail-main-img" src="${data.images[0]}" alt="${spot.name}" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=getDefaultSpotFallback('${spot.type}')">
                                        </div>
                                        <div class="detail-thumbnails">
                                            ${newThumbnailsHtml}
                                        </div>
                                    </div>
                                `;
                            }
                        }
                    } else {
                        const loadingBadge = document.getElementById("scraped-image-loading");
                        if (loadingBadge) loadingBadge.style.display = "none";
                    }
                }
            } catch (e) {
                console.warn("Background dynamic image scraping failed:", e);
                const loadingBadge = document.getElementById("scraped-image-loading");
                if (loadingBadge) loadingBadge.style.display = "none";
            }
        })();
    }

    // Fetch live mountain lift timetable for hiking spot if lift detected
    if (spot.type === 'hiking') {
        const detectedLift = detectMountainLiftForSpot(spot);
        if (detectedLift) {
            fetch(`/api/transport/mountain-lift?valley=${encodeURIComponent(detectedLift.valley)}&mountain=${encodeURIComponent(detectedLift.mountain)}`)
                .then(r => r.json())
                .then(lData => {
                    const el = document.getElementById(`detail-lift-timetable-${spot.id}`);
                    if (!el) return;
                    el.innerHTML = `
                        <div style="display: flex; gap: 0.85rem; flex-wrap: wrap; align-items: center; margin-top: 4px; font-size: 0.8rem;">
                            <span><i class="fa-solid fa-sun" style="color: #f59e0b;"></i> First Ascent: <strong>${lData.firstAscent}</strong></span>
                            <span><i class="fa-solid fa-rotate" style="color: #0284c7;"></i> Runs: <strong>${lData.frequency}</strong></span>
                            <span style="color: #dc2626; font-weight: 800; background: rgba(220, 38, 38, 0.08); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-bell"></i> Last Descent: <strong>${lData.lastDescent}</strong></span>
                        </div>
                        <div style="margin-top: 4px; font-size: 0.72rem; color: var(--text-secondary); font-style: italic;">
                            <i class="fa-solid fa-circle-info"></i> ${lData.advisory || `Aim to reach ${detectedLift.mountain} station at least 20 min before last descent.`}
                        </div>
                    `;
                })
                .catch(() => {
                    const el = document.getElementById(`detail-lift-timetable-${spot.id}`);
                    if (el) el.innerHTML = `<span style="color: var(--text-secondary); font-size: 0.75rem;">Seasonal operating timetable applies. Check sbb.ch or on-site.</span>`;
                });
        }
    }
}

// Submit a new review
function submitReview(e, spotId) {
    e.preventDefault();
    const author = document.getElementById("review-author-input").value.trim();
    const text = document.getElementById("review-text-input").value.trim();
    const ratingVal = parseInt(document.getElementById("review-stars-input").value);

    if (!author || !text || ratingVal === 0) {
        alert("Please complete all fields and choose a rating!");
        return;
    }

    const spotIdx = spots.findIndex(s => s.id === spotId);
    if (spotIdx !== -1) {
        // 1. Add in-memory
        spots[spotIdx].ratings.push(ratingVal);
        spots[spotIdx].comments.push({ author, rating: ratingVal, text });
        
        // 2. Save review to localStorage reviews dictionary
        const localReviews = localStorage.getItem("swiss_kids_reviews");
        let reviewsDict = {};
        if (localReviews) {
            try {
                reviewsDict = JSON.parse(localReviews);
            } catch (e) {}
        }
        
        if (!reviewsDict[spotId]) {
            reviewsDict[spotId] = { ratings: [], comments: [] };
        }
        reviewsDict[spotId].ratings.push(ratingVal);
        reviewsDict[spotId].comments.push({ author, rating: ratingVal, text });
        
        localStorage.setItem("swiss_kids_reviews", JSON.stringify(reviewsDict));
        
        // Refresh details modal and lists
        openDetails(spotId);
        renderSpotsList();
    }
}

function normalizeSearchText(s) {
    if (!s) return '';
    return s.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ae/g, 'a')
        .replace(/oe/g, 'o')
        .replace(/ue/g, 'u')
        .trim();
}

const SWISS_CITY_ALIASES = {
    'zurich': 'zurich',
    'zuerich': 'zurich',
    'zürich': 'zurich',
    'geneva': 'geneve',
    'genf': 'geneve',
    'geneve': 'geneve',
    'genève': 'geneve',
    'lucerne': 'luzern',
    'luzern': 'luzern',
    'basle': 'basel',
    'bale': 'basel',
    'bâle': 'basel',
    'basel': 'basel',
    'berne': 'bern',
    'bern': 'bern'
};

// --- ZIP / City / Trail Name / Route Number Search & Autocomplete ---
function handleZipSearchInput(val) {
    const dropdown = document.getElementById("zip-autocomplete");
    const clearBtn = document.getElementById("clear-zip");
    
    if (!val || !val.trim()) {
        dropdown.style.display = "none";
        clearBtn.style.display = "none";
        if (currentTextQuery !== "" || currentSearchZip !== "") {
            currentTextQuery = "";
            currentSearchZip = "";
            renderSpotsList();
        }
        return;
    }

    clearBtn.style.display = "inline-block";

    const searchRaw = val.trim();
    const searchNorm = normalizeSearchText(searchRaw);
    const searchAlias = SWISS_CITY_ALIASES[searchNorm] || searchNorm;
    const isDigits = /^\d+$/.test(searchRaw);

    currentSearchZip = "";
    currentTextQuery = searchNorm;

    const exactZip = [];
    const prefixZip = [];
    const cityZip = [];
    const subZip = [];

    for (const [zip, data] of Object.entries(SWISS_ZIPS)) {
        const cityNorm = normalizeSearchText(data.city);
        if (zip === searchRaw) {
            exactZip.push({ zip, ...data });
        } else if (isDigits && zip.startsWith(searchRaw)) {
            prefixZip.push({ zip, ...data });
        } else if (!isDigits && (cityNorm === searchNorm || cityNorm === searchAlias || cityNorm.startsWith(searchNorm) || cityNorm.startsWith(searchAlias))) {
            cityZip.push({ zip, ...data });
        } else if (!isDigits && (cityNorm.includes(searchNorm) || cityNorm.includes(searchAlias))) {
            cityZip.push({ zip, ...data });
        } else if (isDigits && zip.includes(searchRaw)) {
            subZip.push({ zip, ...data });
        }
    }

    // Sort prefix & city matches numerically by zip code
    prefixZip.sort((a, b) => parseInt(a.zip, 10) - parseInt(b.zip, 10));
    cityZip.sort((a, b) => parseInt(a.zip, 10) - parseInt(b.zip, 10));

    // Allow up to 25 zip matches so all Zurich postal codes (8000 to 8099) are accessible
    const zipMatches = [...exactZip, ...prefixZip, ...cityZip, ...subZip].slice(0, 25);

    // Also match Hiking Trails & Spots by name, German name, Route Number, address or landmarks
    const spotMatches = [];
    for (const s of spots) {
        const hay = normalizeSearchText(`${s.name || ''} ${s.nameDe || ''} ${s.routeNumber ? 'route ' + s.routeNumber : ''} ${s.city || ''} ${s.address || ''} ${s.description || ''}`);
        if (hay.includes(searchNorm) || (isDigits && s.zip === searchRaw)) {
            spotMatches.push(s);
            if (spotMatches.length >= 6) break;
        }
    }

    let html = "";
    const zipHtml = zipMatches.map(m => `
        <div class="autocomplete-item" data-zip="${m.zip}">
            <span><i class="fa-solid fa-map-pin" style="margin-right: 6px; color: #eb0000;"></i> <strong>${m.zip}</strong> - ${m.city}</span>
            <span class="zip-canton">${m.canton}</span>
        </div>
    `).join("");

    const spotHtml = spotMatches.map(s => `
        <div class="autocomplete-item" data-spot-id="${s.id}">
            <span><i class="fa-solid ${s.type === 'hiking' ? 'fa-person-hiking' : 'fa-location-dot'}" style="color: var(--accent-hiking); margin-right: 6px;"></i> <strong>${s.name}</strong></span>
            <span class="zip-canton">${s.canton || s.region || 'CH'}</span>
        </div>
    `).join("");

    if (isDigits || cityZip.length > 0) {
        html = zipHtml + spotHtml;
    } else {
        html = spotHtml + zipHtml;
    }

    if (html) {
        dropdown.innerHTML = html;
        dropdown.style.display = "block";
    } else {
        dropdown.style.display = "none";
    }

    renderSpotsList();
}

// Select a specific Trail/Spot from Autocomplete dropdown
function selectSpotFromSearch(spotId) {
    const spot = spots.find(s => s.id === spotId);
    if (!spot) return;
    document.getElementById("zip-input").value = spot.name;
    document.getElementById("zip-autocomplete").style.display = "none";
    currentSearchZip = "";
    currentTextQuery = spot.name.toLowerCase();
    renderSpotsList();
    focusOnMap(spot.id, spot.lat, spot.lng);
    openDetails(spot.id);
}

// Select ZIP from Autocomplete dropdown
async function selectZip(zipCode) {
    const data = SWISS_ZIPS[zipCode];
    if (!data) return;

    await loadOsmSpots();

    document.getElementById("zip-input").value = `${zipCode} - ${data.city} (${data.canton})`;
    document.getElementById("zip-autocomplete").style.display = "none";

    currentTextQuery = "";
    currentSearchZip = zipCode;
    currentSearchCenter = { lat: data.lat, lng: data.lng, name: data.city };

    // Fetch general weather for the searched location
    document.getElementById("weather-widget").style.display = "block";
    document.getElementById("weather-widget").innerHTML = `
        <div class="weather-header">
            <h3>Weather in ${data.city}</h3>
            <i class="fa-solid fa-spinner fa-spin"></i>
        </div>
    `;

    liveWeatherData = await fetchWeatherData(data.lat, data.lng, zipCode);
    updateWeatherWidget(data.city);

    // Refresh lists & center map
    renderSpotsList();
    if (activeMap) {
        activeMap.setView([data.lat, data.lng], 12);
    }
}

// Update weather summary card in sidebar
function updateWeatherWidget(cityName) {
    const widget = document.getElementById("weather-widget");
    if (!liveWeatherData) {
        widget.style.display = "none";
        return;
    }

    const info = getWeatherIconAndDesc(liveWeatherData.code);
    const warnings = liveWeatherData.warnings || [];
    
    const now = Date.now();
    // Filter active warnings based on valid time range
    let activeWarnings = warnings.filter(w => 
        (!w.validFrom || now >= w.validFrom) && 
        (!w.validTo || now <= w.validTo)
    );

    // Get today's forecast max temperature
    const todayMax = (liveWeatherData.forecast && liveWeatherData.forecast[0]) ? liveWeatherData.forecast[0].temperatureMax : liveWeatherData.temperature;

    // Evaluate warning/advisory conditions
    const heatWarning = activeWarnings.find(w => w.warnType === 7 && w.warnLevel >= 2);
    const hasHeatwave = liveWeatherData.temperature >= 32 || todayMax >= 30 || (!!heatWarning && (liveWeatherData.temperature >= 28 || todayMax >= 30));

    // If we determined it's NOT a heatwave, remove the heatwave warning from active warnings so it doesn't display in UI
    if (!hasHeatwave) {
        activeWarnings = activeWarnings.filter(w => w.warnType !== 7);
    }

    const severeWarning = activeWarnings.find(w => w.warnLevel >= 3 && w.warnType !== 10);

    let generalTip = "Excellent weather for kids to play outside! Pack sunblock and head to local playparks.";
    let generalIcon = "fa-thumbs-up";
    
    if (severeWarning) {
        generalTip = `Severe weather alert active (Level ${severeWarning.warnLevel}). Keep children indoors.`;
        generalIcon = "fa-triangle-exclamation";
    } else if (hasHeatwave) {
        generalTip = "Heat wave warning! Outdoor play not recommended. Stay cool indoors or at an indoor AC space.";
        generalIcon = "fa-temperature-high";
    } else if (liveWeatherData.precipitation > 0.1 || liveWeatherData.temperature < 12) {
        generalTip = "Rain or cold detected. Grab boots or check out indoor game zones/swimming pools instead.";
        generalIcon = "fa-umbrella";
    }

    // Generate warnings HTML list for the widget
    let warningsHtml = "";
    if (activeWarnings.length > 0) {
        // Only show warnings directly relevant to playspots: wind, storm, rain, snow, heatwave, flood
        const relevantWarnings = activeWarnings.filter(w => 
            w.warnLevel >= 2 && 
            [0, 1, 2, 3, 7, 11].includes(w.warnType)
        );
        if (relevantWarnings.length > 0) {
            const warnNames = {
                0: "Wind",
                1: "Thunderstorm",
                2: "Heavy Rain",
                3: "Heavy Snow",
                7: "Heatwave",
                11: "Flood"
            };
            warningsHtml = `
                <div class="weather-widget-warnings" style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(230, 57, 70, 0.3); font-size: 0.8rem; color: var(--danger-red);">
                    ${relevantWarnings.map(w => `
                        <div style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 4px;">
                            <i class="fa-solid fa-triangle-exclamation" style="margin-top: 2px;"></i> 
                            <div><strong>Level ${w.warnLevel} ${warnNames[w.warnType] || 'Weather'} Warning</strong></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    widget.innerHTML = `
        <div class="weather-header">
            <h3>Weather in ${cityName}</h3>
            <span class="badge">Live</span>
        </div>
        <div class="weather-main">
            <i class="fa-solid ${info.icon} weather-icon-lg"></i>
            <div>
                <div class="weather-temp">${liveWeatherData.temperature}&deg;C</div>
                <div class="weather-desc">${info.desc} (Rain: ${liveWeatherData.precipitation}mm)</div>
            </div>
        </div>
        <div class="weather-kids-advice">
            <i class="fa-solid ${generalIcon}"></i>
            <span>${generalTip}</span>
        </div>
        ${warningsHtml}
    `;
}

// Geolocation: Search by User Location
async function locateUser() {
    const locateBtn = document.getElementById("locate-me-btn");
    const zipInput = document.getElementById("zip-input");
    
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }
    
    locateBtn.classList.add("loading");
    locateBtn.innerHTML = '<i class="fa-solid fa-spinner"></i>';
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Find closest ZIP code from SWISS_ZIPS database
            let minDist = Infinity;
            let closestZip = "";
            let closestCity = "";
            
            for (const [zip, data] of Object.entries(SWISS_ZIPS)) {
                const dist = calculateDistance(lat, lng, data.lat, data.lng);
                if (dist < minDist) {
                    minDist = dist;
                    closestZip = zip;
                    closestCity = data.city;
                }
            }
            
            locateBtn.classList.remove("loading");
            locateBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            
            if (closestZip) {
                zipInput.value = `My Location (${closestZip} - ${closestCity})`;
                document.getElementById("clear-zip").style.display = "inline-block";
                
                currentSearchZip = closestZip;
                // Use exact user coordinates as center for high-precision distance sorting
                currentSearchCenter = { lat, lng, name: `Your Location (${closestCity})` };
                
                await loadOsmSpots();
                
                // Load weather for user's location
                document.getElementById("weather-widget").style.display = "block";
                document.getElementById("weather-widget").innerHTML = `
                    <div class="weather-header">
                        <h3>Weather here</h3>
                        <i class="fa-solid fa-spinner fa-spin"></i>
                    </div>
                `;
                
                liveWeatherData = await fetchWeatherData(lat, lng, closestZip);
                updateWeatherWidget(closestCity);
                
                // Add user location marker on Leaflet map
                updateMapWithUserLocation(lat, lng);
                
                // Refresh list
                renderSpotsList();
            } else {
                alert("Could not map your location to a Swiss postal code.");
            }
        },
        (error) => {
            locateBtn.classList.remove("loading");
            locateBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            console.warn("Geolocation error:", error);
            
            let msg = "Could not retrieve your location.";
            if (error.code === error.PERMISSION_DENIED) {
                msg = "Location access denied. Please enable location permissions in your browser.";
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                msg = "Location information is unavailable.";
            } else if (error.code === error.TIMEOUT) {
                msg = "Location request timed out.";
            }
            alert(msg);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function updateMapWithUserLocation(lat, lng) {
    if (!activeMap) return;
    
    if (userLocationMarker) {
        activeMap.removeLayer(userLocationMarker);
    }
    
    // Create blue pulsing marker
    const userIcon = L.divIcon({
        html: '<div class="user-position-marker"><div class="pulse"></div></div>',
        className: 'user-div-icon',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
    
    userLocationMarker = L.marker([lat, lng], { icon: userIcon }).addTo(activeMap);
    userLocationMarker.bindPopup("<h3>Your Current Location</h3>").openPopup();
    
    activeMap.setView([lat, lng], 12);
}

// Clear search parameters
function clearSearch() {
    document.getElementById("zip-input").value = "";
    document.getElementById("clear-zip").style.display = "none";
    document.getElementById("zip-autocomplete").style.display = "none";
    document.getElementById("weather-widget").style.display = "none";
    
    currentSearchZip = "";
    currentTextQuery = "";
    currentSearchCenter = { lat: 46.8182, lng: 8.2275, name: "Switzerland" };
    liveWeatherData = null;

    if (userLocationMarker) {
        activeMap.removeLayer(userLocationMarker);
        userLocationMarker = null;
    }

    renderSpotsList();
    if (activeMap) {
        activeMap.setView([46.8182, 8.2275], 8);
    }
}

// --- Submit a custom Spot ---
// --- Reverse geocode coordinates to address using Nominatim (OSM) ---
async function reverseGeocode(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en,de`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'SwissKidsSpots/1.0' }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error("Reverse geocode error:", e);
        return null;
    }
}

// --- Forward geocode address to coordinates using Nominatim ---
async function geocodeAddress(address) {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=ch&limit=1&addressdetails=1&accept-language=en,de`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'SwissKidsSpots/1.0' }
        });
        if (!response.ok) return null;
        const results = await response.json();
        return results.length > 0 ? results[0] : null;
    } catch (e) {
        console.error("Geocode error:", e);
        return null;
    }
}

// --- Use My Location (GPS) ---
function useMyLocation() {
    const statusEl = document.getElementById("location-status");
    const addressInput = document.getElementById("new-spot-address");
    const btn = document.getElementById("use-my-location-btn");

    if (!navigator.geolocation) {
        statusEl.textContent = "❌ Geolocation is not supported by your browser.";
        statusEl.style.color = "var(--danger)";
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Locating...';
    statusEl.textContent = "📍 Getting your location...";
    statusEl.style.color = "var(--text-light)";

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Store coordinates
            document.getElementById("new-spot-lat").value = lat;
            document.getElementById("new-spot-lng").value = lng;

            statusEl.textContent = "📍 Got coordinates, looking up address...";

            // Reverse geocode to get address details
            const geoResult = await reverseGeocode(lat, lng);
            if (geoResult && geoResult.address) {
                const addr = geoResult.address;
                const road = addr.road || addr.pedestrian || addr.footway || '';
                const houseNumber = addr.house_number || '';
                const postcode = addr.postcode || '';
                const city = addr.city || addr.town || addr.village || addr.municipality || '';

                // Fill in address field
                const fullAddress = [road, houseNumber].filter(Boolean).join(' ') + (postcode ? `, ${postcode}` : '') + (city ? ` ${city}` : '');
                addressInput.value = fullAddress || geoResult.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

                // Fill hidden fields
                document.getElementById("new-spot-zip").value = postcode;
                document.getElementById("new-spot-city").value = city;

                statusEl.textContent = `✅ Location found: ${city || 'Unknown area'}`;
                statusEl.style.color = "var(--success)";
            } else {
                addressInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                statusEl.textContent = "✅ Got coordinates (could not resolve address)";
                statusEl.style.color = "var(--warning)";
            }

            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use My Location';
        },
        (error) => {
            let msg = "❌ Could not get location.";
            if (error.code === 1) msg = "❌ Location access denied. Please enable location in your browser settings.";
            else if (error.code === 2) msg = "❌ Location unavailable. Please try again.";
            else if (error.code === 3) msg = "❌ Location request timed out. Please try again.";
            statusEl.textContent = msg;
            statusEl.style.color = "var(--danger)";
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use My Location';
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// --- Handle Add Spot Submit ---
async function handleAddSpotSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById("add-spot-submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adding spot...';

    // Get the mandatory field
    const address = document.getElementById("new-spot-address").value.trim();

    // Get optional fields (with defaults)
    const name = document.getElementById("new-spot-name").value.trim();
    const type = document.getElementById("new-spot-type").value || "playpark";
    const hours = document.getElementById("new-spot-hours").value.trim() || "08:00 - 20:00 daily";
    const fees = document.getElementById("new-spot-fees").value.trim();
    const minAge = parseInt(document.getElementById("new-spot-minage").value) || 0;
    const maxAge = parseInt(document.getElementById("new-spot-maxage").value) || 12;
    const desc = document.getElementById("new-spot-desc").value.trim();
    const customImg = document.getElementById("new-spot-image").value.trim();

    // Checkbox amenities
    const amenities = [];
    document.querySelectorAll('input[name="new-spot-amenities"]:checked').forEach(chk => {
        amenities.push(chk.value);
    });

    // --- Resolve coordinates & location details ---
    let lat = parseFloat(document.getElementById("new-spot-lat").value);
    let lng = parseFloat(document.getElementById("new-spot-lng").value);
    let zipVal = document.getElementById("new-spot-zip").value.trim();
    let city = document.getElementById("new-spot-city").value.trim();

    // If coordinates are not set (no GPS used), geocode the address
    if (isNaN(lat) || isNaN(lng)) {
        const geoResult = await geocodeAddress(address);
        if (geoResult) {
            lat = parseFloat(geoResult.lat);
            lng = parseFloat(geoResult.lon);
            const addr = geoResult.address || {};
            if (!zipVal) zipVal = addr.postcode || '';
            if (!city) city = addr.city || addr.town || addr.village || addr.municipality || '';
        }
    }

    // Final fallback: ZIP database or center of Switzerland
    if (isNaN(lat) || isNaN(lng)) {
        if (zipVal && SWISS_ZIPS[zipVal]) {
            lat = SWISS_ZIPS[zipVal].lat;
            lng = SWISS_ZIPS[zipVal].lng;
        } else {
            lat = 46.8182;
            lng = 8.2275;
        }
    }

    // Try to resolve city from ZIP database if still missing
    if (!city && zipVal && SWISS_ZIPS[zipVal]) {
        city = SWISS_ZIPS[zipVal].city;
    }
    if (!city) city = "Switzerland";

    // Try to find closest ZIP if still missing
    if (!zipVal) {
        let minDist = Infinity;
        for (const [zc, coords] of Object.entries(SWISS_ZIPS)) {
            const d = calculateDistance(lat, lng, coords.lat, coords.lng);
            if (d < minDist) {
                minDist = d;
                zipVal = zc;
            }
        }
        if (!city || city === "Switzerland") {
            city = SWISS_ZIPS[zipVal] ? SWISS_ZIPS[zipVal].city : "Switzerland";
        }
    }

    // --- Auto-generate name if not provided ---
    let spotName = name;
    if (!spotName) {
        const typeNames = { playpark: "Playground", swimmingpool: "Swimming Pool", gamezone: "Game Zone" };
        spotName = `${typeNames[type] || "Playground"} in ${city}`;
    }

    // --- Auto-generate description if not provided ---
    let spotDesc = desc;
    if (!spotDesc) {
        const descTemplates = {
            playpark: `A public outdoor playground in ${city}, Switzerland. Great for kids with various play structures and open space.`,
            swimmingpool: `A swimming pool facility in ${city}, Switzerland. Fun aquatic activities for the whole family.`,
            gamezone: `An indoor game zone in ${city}, Switzerland. Safe and fun play area for children.`
        };
        spotDesc = descTemplates[type] || descTemplates.playpark;
    }

    // --- Smart fee defaults ---
    let spotFees = fees;
    if (!spotFees) {
        spotFees = type === "playpark" ? "Free" : "Contact venue";
    } else if (spotFees === "0") {
        spotFees = "Free";
    }

    // --- Default amenities if none selected ---
    let spotAmenities = amenities;
    if (spotAmenities.length === 0) {
        if (type === "playpark") spotAmenities = ["Stroller Friendly"];
        else if (type === "swimmingpool") spotAmenities = ["Toilets", "Stroller Friendly"];
        else spotAmenities = ["Toilets", "Stroller Friendly"];
    }

    // --- Set fallback image based on spot type ---
    let imageUrl = customImg;
    if (!imageUrl) {
        if (type === "playpark") imageUrl = "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80";
        else if (type === "gamezone") imageUrl = "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80";
        else imageUrl = "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80";
    }

    // --- Build the full address string ---
    const fullAddress = address.includes(zipVal) ? address : `${address}, ${zipVal} ${city}`;

    // --- Create the spot ---
    const newSpot = {
        id: `custom-spot-${Date.now()}`,
        name: spotName,
        type,
        description: spotDesc,
        address: fullAddress,
        zip: zipVal,
        city,
        lat: Math.round(lat * 100000) / 100000,
        lng: Math.round(lng * 100000) / 100000,
        openingHours: hours,
        fees: spotFees,
        minAge,
        maxAge,
        amenities: spotAmenities,
        imageUrl,
        images: [imageUrl],
        ratings: [5],
        comments: [{ author: "Finder", rating: 5, text: "Newly added spot. Looks awesome!" }]
    };

    // Save ZIP to dictionary if new
    if (!SWISS_ZIPS[zipVal]) {
        SWISS_ZIPS[zipVal] = { city, canton: "CH", lat, lng };
    }

    spots.push(newSpot);
    saveSpots();

    // Reset and hide form
    document.getElementById("add-spot-form").reset();
    document.getElementById("add-spot-modal").style.display = "none";
    document.getElementById("optional-details-section").style.display = "none";

    // Restore button
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Spot';

    // Refresh page
    renderSpotsList();
    focusOnMap(newSpot.id, lat, lng);
    alert(`Success! "${spotName}" has been added to your local playspot finder.`);
}

// --- Submit Feedback ---
async function handleFeedbackSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("feedback-name").value.trim();
    const email = document.getElementById("feedback-email").value.trim();
    const type = document.getElementById("feedback-type").value;
    const rating = parseInt(document.getElementById("feedback-rating-input").value);
    const comments = document.getElementById("feedback-comments").value.trim();

    if (rating === 0) {
        alert("Please select a star rating experience!");
        return;
    }

    const feedbackData = { name, email, type, rating, comments };

    try {
        const response = await fetch("/api/feedback", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(feedbackData)
        });

        if (response.ok) {
            alert("Thank you! Your feedback has been received and saved.");
        } else {
            throw new Error("Server rejected feedback");
        }
    } catch (err) {
        console.warn("Feedback server endpoint failed, saving to localStorage:", err);
        // Fallback to local storage
        const localData = localStorage.getItem("swiss_kids_general_feedback");
        let allLocal = [];
        if (localData) {
            try { allLocal = JSON.parse(localData); } catch(e) {}
        }
        feedbackData.timestamp = new Date().toISOString();
        feedbackData.id = `local-feedback-${Date.now()}`;
        allLocal.push(feedbackData);
        localStorage.setItem("swiss_kids_general_feedback", JSON.stringify(allLocal));
        alert("Thank you! Your feedback has been saved locally.");
    }

    // Reset and hide form
    document.getElementById("feedback-form").reset();
    document.getElementById("feedback-rating-input").value = "0";
    
    // Reset star highlights
    const feedbackStars = document.querySelectorAll(".feedback-star");
    feedbackStars.forEach(s => {
        s.classList.remove("fa-solid", "star-filled");
        s.classList.add("fa-regular", "star-empty");
    });

    document.getElementById("feedback-modal").style.display = "none";
}

// --- Group Hike Logistics & SBB / Car Travel Planner ---
let currentGroupHikeSpot = null;
let currentGroupHikeSbbData = null;
let currentGroupHikeCarData = null;
let currentGroupHikeLiftData = null;
let currentGroupHikeLiftInfo = null;
let currentGroupHikeTravelMode = 'both'; // 'both' | 'sbb' | 'car'

const SWISS_CITIES_COORDS = {
    'Zürich HB': { lat: 47.3779, lng: 8.5402, name: 'Zürich HB' },
    'Zürich': { lat: 47.3769, lng: 8.5417, name: 'Zürich' },
    'Bern': { lat: 46.9480, lng: 7.4474, name: 'Bern' },
    'Basel SBB': { lat: 47.5474, lng: 7.5896, name: 'Basel SBB' },
    'Basel': { lat: 47.5596, lng: 7.5886, name: 'Basel' },
    'Luzern': { lat: 47.0502, lng: 8.3103, name: 'Luzern' },
    'St. Gallen': { lat: 47.4245, lng: 9.3767, name: 'St. Gallen' },
    'Winterthur': { lat: 47.5004, lng: 8.7241, name: 'Winterthur' },
    'Lausanne': { lat: 46.5197, lng: 6.6323, name: 'Lausanne' },
    'Genève': { lat: 46.2100, lng: 6.1432, name: 'Genève' },
    'Lugano': { lat: 46.0037, lng: 8.9511, name: 'Lugano' },
    'Aarau': { lat: 47.3925, lng: 8.0442, name: 'Aarau' },
    'Chur': { lat: 46.8534, lng: 9.5298, name: 'Chur' },
    'Biel/Bienne': { lat: 47.1368, lng: 7.2468, name: 'Biel/Bienne' },
    'Biel': { lat: 47.1368, lng: 7.2468, name: 'Biel' },
    'Zug': { lat: 47.1662, lng: 8.5155, name: 'Zug' },
    'Thun': { lat: 46.7580, lng: 7.6280, name: 'Thun' },
    'Schaffhausen': { lat: 47.6973, lng: 8.6349, name: 'Schaffhausen' },
    'Neuchâtel': { lat: 46.9928, lng: 6.9319, name: 'Neuchâtel' },
    'Fribourg': { lat: 46.8065, lng: 7.1619, name: 'Fribourg' },
    'Bellinzona': { lat: 46.1928, lng: 9.0170, name: 'Bellinzona' },
    'Sion': { lat: 46.2331, lng: 7.3606, name: 'Sion' },
    'Interlaken': { lat: 46.6863, lng: 7.8632, name: 'Interlaken' }
};

function resolveCityCoords(cityName) {
    if (!cityName) return { lat: 47.3779, lng: 8.5402, name: 'Zürich' };
    const clean = cityName.trim();
    if (typeof SWISS_ZIPS !== 'undefined' && SWISS_ZIPS && SWISS_ZIPS[clean]) {
        return { lat: SWISS_ZIPS[clean].lat, lng: SWISS_ZIPS[clean].lng, name: `${clean} ${SWISS_ZIPS[clean].city}` };
    }
    if (SWISS_CITIES_COORDS[clean]) return SWISS_CITIES_COORDS[clean];

    const withoutSuffix = clean.replace(/\s*(HB|SBB|Bahnhof|Station|Gare)$/i, '').trim();
    if (SWISS_CITIES_COORDS[withoutSuffix]) return SWISS_CITIES_COORDS[withoutSuffix];

    const lower = withoutSuffix.toLowerCase();
    for (const key of Object.keys(SWISS_CITIES_COORDS)) {
        if (key.toLowerCase() === lower || key.toLowerCase() === clean.toLowerCase()) {
            return SWISS_CITIES_COORDS[key];
        }
    }

    if (typeof currentSearchCenter !== 'undefined' && currentSearchCenter && currentSearchCenter.lat) {
        return { lat: currentSearchCenter.lat, lng: currentSearchCenter.lng, name: clean };
    }
    return { lat: 47.3779, lng: 8.5402, name: clean };
}

function calculateCarTravel(fromCityName, spot, targetTimeStr) {
    if (!spot || !spot.lat || !spot.lng) return null;
    const origin = resolveCityCoords(fromCityName);
    const straightDistKm = calculateDistance(origin.lat, origin.lng, spot.lat, spot.lng);
    // Road travel in Switzerland averages ~1.28x straight distance due to valleys/highways
    const roadKm = Math.max(5, Math.round(straightDistKm * 1.28));

    // Autobahn corridors > 60km avg ~85km/h; mountain/regional roads avg ~55km/h
    const driveMinutes = roadKm > 60
        ? Math.round((roadKm / 85) * 60)
        : Math.round((roadKm / 55) * 60);

    const parkingBufferMinutes = 15; // 15-min buffer for parking, boots, gear & reaching trailhead
    const totalTravelMinutes = driveMinutes + parkingBufferMinutes;

    let targetH = 9;
    let targetM = 0;
    if (targetTimeStr && targetTimeStr.includes(':')) {
        const parts = targetTimeStr.split(':').map(Number);
        if (!isNaN(parts[0])) targetH = parts[0];
        if (!isNaN(parts[1])) targetM = parts[1];
    }
    const targetTotalMins = targetH * 60 + targetM;

    // Leave time: calculated backwards from meetup time
    let leaveTotalMins = targetTotalMins - totalTravelMinutes;
    while (leaveTotalMins < 0) leaveTotalMins += 24 * 60;
    const leaveH = Math.floor(leaveTotalMins / 60) % 24;
    const leaveM = leaveTotalMins % 60;
    const leaveTimeStr = `${String(leaveH).padStart(2, '0')}:${String(leaveM).padStart(2, '0')}`;

    // Expected arrival at parking: 15 mins before meetup
    let parkTotalMins = targetTotalMins - parkingBufferMinutes;
    while (parkTotalMins < 0) parkTotalMins += 24 * 60;
    const parkH = Math.floor(parkTotalMins / 60) % 24;
    const parkM = parkTotalMins % 60;
    const parkTimeStr = `${String(parkH).padStart(2, '0')}:${String(parkM).padStart(2, '0')}`;

    const driveH = Math.floor(driveMinutes / 60);
    const driveRemainingM = driveMinutes % 60;
    const driveDurationText = driveH > 0
        ? `${driveH}h ${driveRemainingM > 0 ? driveRemainingM + 'm' : ''}`.trim()
        : `${driveMinutes} min`;

    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromCityName + ', Switzerland')}&destination=${spot.lat},${spot.lng}`;

    return {
        originName: origin.name || fromCityName,
        roadKm,
        driveMinutes,
        driveDurationText,
        parkingBufferMinutes,
        leaveTimeStr,
        parkTimeStr,
        targetTimeStr: `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`,
        gmapsUrl,
        parkingInfo: spot.parking || 'Parking available near trailhead / cable car station'
    };
}

function getNextWeekendDay(dayOfWeek = 6) { // 6 = Saturday, 0 = Sunday
    const d = new Date();
    const currentDay = d.getDay();
    let distance = (dayOfWeek + 7 - currentDay) % 7;
    if (distance === 0) distance = 7;
    d.setDate(d.getDate() + distance);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

window.openGroupHikePlanner = function(spotId, prefill = {}) {
    const spot = spots.find(s => s.id === spotId);
    if (!spot) return;

    currentGroupHikeSpot = spot;

    const modal = document.getElementById('group-hike-modal');
    if (!modal) return;

    // Set title and subtitle
    const titleEl = document.getElementById('group-hike-modal-title');
    const subEl = document.getElementById('group-hike-modal-subtitle');
    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-users" style="color: #2a9d8f;"></i> Plan Group: ${escapeHtml(spot.name)}`;
    }
    if (subEl) {
        subEl.textContent = `${spot.region || 'Switzerland'} • ${spot.distanceKm || '?'} km • ${spot.difficulty || 'Family'} • ${spot.durationText || ''}`;
    }

    // Set Date input (default to next Saturday or prefill)
    const dateInput = document.getElementById('gh-date');
    if (dateInput) {
        dateInput.value = prefill.date || getNextWeekendDay(6);
    }

    // Set Target Meetup Time input (default 09:00 or prefill)
    const timeInput = document.getElementById('gh-time');
    if (timeInput) {
        timeInput.value = prefill.time || '09:00';
    }

    // Set Meeting Point
    const meetingInput = document.getElementById('gh-meeting-point');
    if (meetingInput) {
        meetingInput.value = prefill.meetingPoint || spot.startStop || spot.city || spot.name;
    }

    // Set From station / city input
    const fromInput = document.getElementById('gh-from-input');
    if (fromInput) {
        fromInput.value = prefill.from || 'Zürich HB';
    }

    // Reset active city pill
    const pills = document.querySelectorAll('.gh-city-pill');
    pills.forEach(p => {
        if (p.dataset.city === (fromInput ? fromInput.value : 'Zürich HB')) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });

    // Reset travel tabs to 'both'
    const travelTabs = document.querySelectorAll('.gh-travel-tab');
    travelTabs.forEach(t => {
        if (t.dataset.mode === 'both') t.classList.add('active');
        else t.classList.remove('active');
    });
    currentGroupHikeTravelMode = 'both';
    const sbbWrapper = document.getElementById('gh-sbb-wrapper');
    const carWrapper = document.getElementById('gh-car-wrapper');
    const liftWrapper = document.getElementById('gh-lift-wrapper');
    if (sbbWrapper) sbbWrapper.style.display = 'block';
    if (carWrapper) carWrapper.style.display = 'block';
    if (liftWrapper) liftWrapper.style.display = 'none';

    currentGroupHikeLiftData = null;
    currentGroupHikeLiftInfo = null;

    modal.style.display = 'flex';

    // Fetch and compute all travel logistics
    fetchGroupHikeTravel();
};

window.closeGroupHikeModal = function() {
    const modal = document.getElementById('group-hike-modal');
    if (modal) modal.style.display = 'none';
};

async function fetchGroupHikeTravel() {
    if (!currentGroupHikeSpot) return;

    const fromInput = document.getElementById('gh-from-input');
    const dateInput = document.getElementById('gh-date');
    const timeInput = document.getElementById('gh-time');
    const statusEl = document.getElementById('gh-sbb-status');
    const sbbContainer = document.getElementById('gh-sbb-results');

    const from = fromInput ? fromInput.value.trim() : 'Zürich HB';
    const to = currentGroupHikeSpot.startStop || currentGroupHikeSpot.city || currentGroupHikeSpot.name;
    const date = dateInput ? dateInput.value : '';
    const time = timeInput ? timeInput.value : '09:00';

    // 1. Instantly calculate car travel backwards
    currentGroupHikeCarData = calculateCarTravel(from, currentGroupHikeSpot, time);
    renderGroupHikeCarResults(currentGroupHikeCarData);

    // 2. Fetch SBB train timetable arriving BEFORE target time
    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking SBB...';
    if (sbbContainer) {
        sbbContainer.innerHTML = '<div style="text-align: center; padding: 1rem; color: var(--text-secondary);"><i class="fa-solid fa-train fa-bounce" style="color: #eb0000; font-size: 1.5rem; margin-bottom: 0.5rem; display: block;"></i>Finding trains arriving before ' + escapeHtml(time) + '...</div>';
    }

    try {
        let data = null;
        try {
            const res = await fetch(`/api/transport/connections?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}&isArrivalTime=1&limit=4`);
            if (res.ok) data = await res.json();
        } catch (e) {
            console.warn('Local transport proxy failed, using direct SBB OpenData:', e);
        }

        if (!data || !data.connections || data.connections.length === 0) {
            const fallbackRes = await fetch(`https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}&isArrivalTime=1&limit=4`);
            if (fallbackRes.ok) data = await fallbackRes.json();
        }

        if (data && data.connections && data.connections.length > 0) {
            // Find recommended connection: the latest arrival that is <= target time (or the last connection in list)
            renderGroupHikeSbbResults(data.connections, from, to, time);
            if (statusEl) statusEl.textContent = 'Live SBB Timetable';
        } else {
            currentGroupHikeSbbData = null;
            if (sbbContainer) {
                sbbContainer.innerHTML = `
                    <div style="padding: 0.75rem; font-size: 0.8rem; color: var(--text-secondary);">
                        <i class="fa-solid fa-circle-info" style="color: var(--accent-gold);"></i> 
                        Could not find direct timetable between "${escapeHtml(from)}" and "${escapeHtml(to)}". 
                        <a href="https://www.sbb.ch/en?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}" target="_blank" rel="noopener" style="color: #eb0000; font-weight: 700;">Open on sbb.ch &rarr;</a>
                    </div>
                `;
            }
            if (statusEl) statusEl.textContent = '';
        }
    } catch (err) {
        console.error('SBB fetch error:', err);
        currentGroupHikeSbbData = null;
        if (sbbContainer) {
            sbbContainer.innerHTML = `
                <div style="padding: 0.75rem; font-size: 0.8rem; color: var(--text-secondary);">
                    <i class="fa-solid fa-circle-exclamation" style="color: #d90429;"></i> Timetable service temporarily unavailable.
                    <a href="https://www.sbb.ch/en" target="_blank" rel="noopener" style="color: #eb0000; font-weight: 700; margin-left: 5px;">Check sbb.ch directly &rarr;</a>
                </div>
            `;
        }
        if (statusEl) statusEl.textContent = '';
    }

    // 3. Fetch Mountain Gondola / Lift Timetable & Last Descent Intelligence
    const liftWrapper = document.getElementById('gh-lift-wrapper');
    const liftContainer = document.getElementById('gh-lift-results');
    const liftStatusEl = document.getElementById('gh-lift-status');
    const detectedLift = detectMountainLiftForSpot(currentGroupHikeSpot);

    if (detectedLift) {
        currentGroupHikeLiftInfo = detectedLift;
        if (liftWrapper) liftWrapper.style.display = 'block';
        if (liftStatusEl) liftStatusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking Lift Timetable...';
        if (liftContainer) {
            liftContainer.innerHTML = '<div style="text-align: center; padding: 0.75rem; color: var(--text-secondary);"><i class="fa-solid fa-cable-car fa-bounce" style="color: #0284c7; font-size: 1.3rem; margin-bottom: 0.35rem; display: block;"></i>Checking live mountain lift schedule &amp; last descent...</div>';
        }

        try {
            const liftUrl = `/api/transport/mountain-lift?valley=${encodeURIComponent(detectedLift.valley)}&mountain=${encodeURIComponent(detectedLift.mountain)}&date=${encodeURIComponent(date)}`;
            const lRes = await fetch(liftUrl);
            if (lRes.ok) {
                const lData = await lRes.json();
                currentGroupHikeLiftData = lData;
                renderGroupHikeLiftResults(detectedLift, lData, time, currentGroupHikeSpot);
                if (liftStatusEl) liftStatusEl.textContent = 'Live Bergbahn Data';
            } else {
                throw new Error('Lift endpoint status ' + lRes.status);
            }
        } catch (err) {
            console.warn('Could not fetch mountain lift data:', err);
            // Fallback standard schedule
            currentGroupHikeLiftData = {
                valley: detectedLift.valley,
                mountain: detectedLift.mountain,
                firstAscent: '07:30',
                frequency: 'Every 15–30 min',
                lastDescent: '17:00',
                advisory: `Aim to reach ${detectedLift.mountain} station at least 20 min before last descent.`
            };
            renderGroupHikeLiftResults(detectedLift, currentGroupHikeLiftData, time, currentGroupHikeSpot);
            if (liftStatusEl) liftStatusEl.textContent = 'Standard Schedule';
        }
    } else {
        currentGroupHikeLiftInfo = null;
        currentGroupHikeLiftData = null;
        if (liftWrapper) liftWrapper.style.display = 'none';
        if (liftContainer) liftContainer.innerHTML = '';
    }

    updateGroupHikePreview();
}

function renderGroupHikeCarResults(carData) {
    const container = document.getElementById('gh-car-results');
    if (!container) return;

    if (!carData) {
        container.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-secondary);">Unable to estimate car travel coordinates.</div>';
        return;
    }

    container.innerHTML = `
        <div class="gh-car-row">
            <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span class="gh-leave-badge">
                        <i class="fa-solid fa-car-side"></i> Leave by ${carData.leaveTimeStr}
                    </span>
                    <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary);">
                        Arrive parking ~${carData.parkTimeStr} (for ${carData.targetTimeStr} meetup)
                    </span>
                </div>
                <div style="font-size: 0.77rem; color: var(--text-secondary); margin-top: 0.35rem;">
                    <span>From <strong>${escapeHtml(carData.originName)}</strong> &bull; ~${carData.roadKm} km drive (~${carData.driveDurationText}) + 15m buffer</span>
                </div>
                <div style="font-size: 0.72rem; color: #2a9d8f; font-weight: 600; margin-top: 3px;">
                    <i class="fa-solid fa-square-parking"></i> ${escapeHtml(carData.parkingInfo)}
                </div>
            </div>
            <div>
                <a href="${carData.gmapsUrl}" target="_blank" rel="noopener" class="btn btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; border-color: #2a9d8f; color: #2a9d8f; white-space: nowrap; border-radius: 6px;">
                    <i class="fa-solid fa-diamond-turn-right"></i> Google Maps &rarr;
                </a>
            </div>
        </div>
    `;
}

function renderGroupHikeSbbResults(connections, fromName, toName, targetTimeStr) {
    const container = document.getElementById('gh-sbb-results');
    if (!container) return;

    const sbbUrl = `https://www.sbb.ch/en?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}`;

    // Parse target meetup minutes for comparison
    let targetMins = 9 * 60;
    if (targetTimeStr && targetTimeStr.includes(':')) {
        const parts = targetTimeStr.split(':').map(Number);
        targetMins = parts[0] * 60 + parts[1];
    }

    // Determine the recommended connection: the latest one that arrives before or exactly at target time
    let recommendedIdx = connections.length - 1;
    for (let i = connections.length - 1; i >= 0; i--) {
        const arrStr = connections[i].to.arrival ? connections[i].to.arrival.slice(11, 16) : '';
        if (arrStr) {
            const [ah, am] = arrStr.split(':').map(Number);
            const arrMins = ah * 60 + am;
            if (arrMins <= targetMins) {
                recommendedIdx = i;
                break;
            }
        }
    }

    currentGroupHikeSbbData = connections[recommendedIdx] || connections[0];

    // Show up to 2 most relevant connections (the recommended one and the one right before it)
    const displayConnections = connections.slice(Math.max(0, recommendedIdx - 1), recommendedIdx + 1);

    const html = displayConnections.map((conn) => {
        const depTime = conn.from.departure ? conn.from.departure.slice(11, 16) : '--:--';
        const arrTime = conn.to.arrival ? conn.to.arrival.slice(11, 16) : '--:--';
        const platform = conn.from.platform ? `Pl. ${conn.from.platform}` : '';
        const durationFormatted = conn.duration ? conn.duration.replace(/^00d/, '').slice(0, 5) : '';
        const transfersText = conn.transfers === 0 ? 'Direct (No changes)' : `${conn.transfers} change${conn.transfers > 1 ? 's' : ''}`;
        const trains = (conn.products || []).join(' &rarr; ') || 'Train';

        // Calculate arrival buffer before meetup
        let bufferText = '';
        if (arrTime !== '--:--') {
            const [ah, am] = arrTime.split(':').map(Number);
            const arrMins = ah * 60 + am;
            const diff = targetMins - arrMins;
            if (diff >= 0) {
                bufferText = `${diff}m before meetup`;
            } else {
                bufferText = `${Math.abs(diff)}m after meetup`;
            }
        }

        const isRecommended = (conn === currentGroupHikeSbbData);

        return `
            <div class="gh-sbb-conn" style="${isRecommended ? 'background: rgba(235, 0, 0, 0.04); padding: 0.5rem; border-radius: 6px;' : ''}">
                <div>
                    <div class="gh-sbb-conn-time">
                        <span style="color: #eb0000; font-weight: 800;">Catch ${depTime}</span>
                        <i class="fa-solid fa-arrow-right-long" style="font-size: 0.75rem; color: var(--text-secondary);"></i>
                        <span>Arrives ${arrTime}</span>
                        ${isRecommended 
                            ? `<span class="gh-sbb-badge"><i class="fa-solid fa-star"></i> Recommended (${bufferText})</span>` 
                            : `<span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 600;">Earlier option (${bufferText})</span>`}
                    </div>
                    <div class="gh-sbb-conn-sub">
                        <span>${escapeHtml(conn.from.station.name || fromName)} ${platform ? `(<strong>${platform}</strong>)` : ''}</span>
                        &bull;
                        <span>${transfersText} (${durationFormatted})</span>
                    </div>
                    <div style="font-size: 0.72rem; color: #eb0000; font-weight: 600; margin-top: 3px;">
                        <i class="fa-solid fa-train-subway"></i> ${escapeHtml(trains)}
                    </div>
                </div>
                <div>
                    <a href="${sbbUrl}" target="_blank" rel="noopener" class="btn btn-outline" style="padding: 0.35rem 0.65rem; font-size: 0.75rem; border-color: #eb0000; color: #eb0000; white-space: nowrap; border-radius: 6px;">
                        SBB Ticket &rarr;
                    </a>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function renderGroupHikeLiftResults(liftInfo, liftData, targetMeetupTimeStr, spot) {
    const container = document.getElementById('gh-lift-results');
    if (!container || !liftData) return;

    // Parse target meetup time (default 09:00 -> 540 min)
    let meetupMins = 9 * 60;
    if (targetMeetupTimeStr && targetMeetupTimeStr.includes(':')) {
        const [h, m] = targetMeetupTimeStr.split(':').map(Number);
        meetupMins = h * 60 + m;
    }

    // Parse spot duration (e.g. "2 h 45 min", "3h 15m", or default 3h = 180 min)
    let hikeDurationMins = 180;
    if (spot && spot.durationText) {
        const dStr = spot.durationText.toLowerCase();
        let hMatch = dStr.match(/(\d+)\s*h/);
        let mMatch = dStr.match(/(\d+)\s*min/);
        if (hMatch || mMatch) {
            hikeDurationMins = (hMatch ? parseInt(hMatch[1], 10) * 60 : 0) + (mMatch ? parseInt(mMatch[1], 10) : 0);
        }
    }
    const familyRestBufferMins = 60; // 1 hr buffer for family lunch, photos, rest
    const estimatedFinishMins = meetupMins + hikeDurationMins + familyRestBufferMins;

    // Parse last descent time (e.g. "17:15")
    let lastDescentMins = 17 * 60;
    if (liftData.lastDescent && liftData.lastDescent.includes(':')) {
        const [dh, dm] = liftData.lastDescent.split(':').map(Number);
        lastDescentMins = dh * 60 + dm;
    }

    const bufferMins = lastDescentMins - estimatedFinishMins;

    const formatMinsToHHMM = (m) => {
        const norm = (m % 1440 + 1440) % 1440;
        const hh = String(Math.floor(norm / 60)).padStart(2, '0');
        const mm = String(norm % 60).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const estFinishStr = formatMinsToHHMM(estimatedFinishMins);

    let statusType = 'safe';
    let statusIcon = 'fa-circle-check';
    let statusTitle = '';
    let statusMsg = '';

    if (bufferMins >= 75) {
        statusType = 'safe';
        statusIcon = 'fa-circle-check';
        const hoursBuf = Math.floor(bufferMins / 60);
        const minsBuf = bufferMins % 60;
        const bufText = hoursBuf > 0 ? `${hoursBuf}h ${minsBuf}m` : `${minsBuf}m`;
        statusTitle = `Safe Timing: ~${bufText} buffer before last descent`;
        statusMsg = `Estimated return ~${estFinishStr} (includes ${spot.durationText || 'hike'} + 1h lunch/rest). Plenty of time for the ${liftData.lastDescent} descent.`;
    } else if (bufferMins >= 0) {
        statusType = 'tight';
        statusIcon = 'fa-triangle-exclamation';
        statusTitle = `Tight Timing: only ~${bufferMins} min margin!`;
        statusMsg = `Estimated return ~${estFinishStr}. Last descent is at ${liftData.lastDescent}. Consider meeting 30–60 mins earlier so you don't feel rushed!`;
    } else {
        statusType = 'danger';
        statusIcon = 'fa-skull-crossbones';
        const overdueMins = Math.abs(bufferMins);
        const overdueHours = Math.floor(overdueMins / 60);
        const overdueRem = overdueMins % 60;
        const overdueText = overdueHours > 0 ? `${overdueHours}h ${overdueRem}m` : `${overdueRem}m`;
        const suggestedMeetup = formatMinsToHHMM(meetupMins - overdueMins - 45);
        statusTitle = `STRANDING WARNING: Return is ${overdueText} AFTER last descent!`;
        statusMsg = `With a ${targetMeetupTimeStr} start, you will finish around ~${estFinishStr}, but the LAST GONDOLA DOWN is at ${liftData.lastDescent}. You risk being stranded! <strong>Recommend meeting by ${suggestedMeetup}</strong> or preparing for a steep foot descent.`;
    }

    container.innerHTML = `
        <div class="gh-lift-row">
            <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <span style="font-size: 0.95rem; font-weight: 800; color: #0284c7;">
                        <i class="fa-solid fa-cable-car"></i> ${escapeHtml(liftInfo.name)}
                    </span>
                    <span style="font-size: 0.72rem; color: var(--text-secondary); background: var(--bg-card); border: 1px solid var(--border-color); padding: 1px 6px; border-radius: 6px;">
                        ${escapeHtml(liftInfo.type)}
                    </span>
                </div>
                <div style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 2px;">
                    ${escapeHtml(liftInfo.valley)} &harr; ${escapeHtml(liftInfo.mountain)}
                </div>
            </div>
            <div>
                ${liftInfo.operatorUrl ? `
                <a href="${liftInfo.operatorUrl}" target="_blank" rel="noopener" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.74rem; border-color: #0284c7; color: #0284c7; white-space: nowrap; border-radius: 6px;">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Lift Tariffs &rarr;
                </a>` : ''}
            </div>
        </div>

        <div class="gh-lift-metrics">
            <div class="gh-lift-chip">
                <span class="gh-lift-chip-label"><i class="fa-solid fa-sun" style="color: #f59e0b;"></i> First Ascent</span>
                <span class="gh-lift-chip-val">${liftData.firstAscent}</span>
            </div>
            <div class="gh-lift-chip">
                <span class="gh-lift-chip-label"><i class="fa-solid fa-rotate" style="color: #0284c7;"></i> Frequency</span>
                <span class="gh-lift-chip-val" style="font-size: 0.85rem;">${liftData.frequency}</span>
            </div>
            <div class="gh-lift-chip highlight-danger">
                <span class="gh-lift-chip-label" style="color: #dc2626;"><i class="fa-solid fa-bell"></i> Last Descent</span>
                <span class="gh-lift-chip-val" style="color: #dc2626;">${liftData.lastDescent}</span>
            </div>
        </div>

        <div class="gh-lift-buffer-box ${statusType}">
            <i class="fa-solid ${statusIcon}" style="font-size: 1.15rem; flex-shrink: 0;"></i>
            <div>
                <div style="font-weight: 800; font-size: 0.82rem;">${statusTitle}</div>
                <div style="font-size: 0.74rem; line-height: 1.3; margin-top: 2px;">${statusMsg}</div>
            </div>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.35rem; font-style: italic;">
            <i class="fa-solid fa-circle-info"></i> ${liftData.advisory || `Aim to arrive at ${liftInfo.mountain} station at least 20 min before last descent.`}
        </div>
    `;
}

function generateGroupHikeInviteText() {
    if (!currentGroupHikeSpot) return '';

    const spot = currentGroupHikeSpot;
    const dateInput = document.getElementById('gh-date');
    const timeInput = document.getElementById('gh-time');
    const meetingInput = document.getElementById('gh-meeting-point');
    const fromInput = document.getElementById('gh-from-input');

    const dateVal = dateInput ? dateInput.value : '';
    const timeVal = timeInput ? timeInput.value : '09:00';
    const meetingPoint = meetingInput ? meetingInput.value.trim() : (spot.startStop || spot.city || spot.name);
    const fromStation = fromInput ? fromInput.value.trim() : 'Zürich HB';

    let formattedDate = dateVal;
    if (dateVal) {
        try {
            const d = new Date(dateVal + 'T12:00:00');
            formattedDate = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
        } catch (e) {}
    }

    // 1. SBB Travel Section
    let sbbText = `🚂 *Public Transport (SBB):*\n• Meeting at: ${meetingPoint}\n• SBB Timetable: https://www.sbb.ch/en?from=${encodeURIComponent(fromStation)}&to=${encodeURIComponent(meetingPoint)}`;
    if (currentGroupHikeSbbData) {
        const c = currentGroupHikeSbbData;
        const depTime = c.from.departure ? c.from.departure.slice(11, 16) : '';
        const arrTime = c.to.arrival ? c.to.arrival.slice(11, 16) : '';
        const plat = c.from.platform ? ` (Pl. ${c.from.platform})` : '';
        const dur = c.duration ? c.duration.replace(/^00d/, '').slice(0, 5) : '';
        const chg = c.transfers === 0 ? 'direct' : `${c.transfers} change${c.transfers > 1 ? 's' : ''}`;
        const trains = (c.products || []).join(' → ');

        sbbText = `🚂 *Public Transport (SBB):*\n• Recommended from ${fromStation}: Catch *${depTime}* train${plat}\n• Arrives *${arrTime}* (${chg}, ${dur})\n• Line: ${trains}\n• Buy Ticket: https://www.sbb.ch/en?from=${encodeURIComponent(fromStation)}&to=${encodeURIComponent(meetingPoint)}`;
    }

    // 2. Car Travel Section (running backwards)
    let carText = '';
    if (currentGroupHikeCarData) {
        const car = currentGroupHikeCarData;
        carText = `🚗 *Driving by Car:*\n• Recommended from ${car.originName}: Leave by *${car.leaveTimeStr}*\n• Arrives at parking ~*${car.parkTimeStr}* (~${car.roadKm} km, ~${car.driveDurationText} drive + 15m parking/prep buffer)\n• Parking Info: ${car.parkingInfo}\n• Google Maps Navigation: ${car.gmapsUrl}`;
    }

    // 3. Mountain Gondola / Lift Section
    let liftText = '';
    if (currentGroupHikeLiftData && currentGroupHikeLiftInfo) {
        const l = currentGroupHikeLiftData;
        const info = currentGroupHikeLiftInfo;
        liftText = `🚡 *Mountain Gondola / Lift:*
• Lift: ${info.name} (${info.valley} ⇄ ${info.mountain})
• First Ascent: *${l.firstAscent}* | Frequency: *${l.frequency}*
• ⚠️ *CRITICAL LAST DESCENT DOWN: ${l.lastDescent}* (Don't get stranded!)
${info.operatorUrl ? `• Lift Tariffs & Details: ${info.operatorUrl}` : ''}`;
    }

    const canonicalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'https://swissforkids.ch'
        : window.location.origin;

    const groupUrl = `${canonicalHost}/?hike=${encodeURIComponent(spot.id)}&group=1&date=${encodeURIComponent(dateVal)}&time=${encodeURIComponent(timeVal)}&from=${encodeURIComponent(fromStation)}&meetingPoint=${encodeURIComponent(meetingPoint)}`;

    const isStroller = (spot.strollerFriendly === 'yes' || spot.strollerFriendly === true || spot.stroller === 'yes' || spot.stroller === true);
    const strollerText = isStroller ? '✅ Stroller Friendly' : '❌ Not for Strollers (Carrier recommended)';
    const diffText = spot.difficulty === 'easy' ? '🟢 Easy' : (spot.difficulty === 'moderate' ? '🟠 Moderate' : '🔴 Demanding');

    // Filter sections according to current travel mode
    let travelSections = [];
    if (currentGroupHikeTravelMode === 'both' || currentGroupHikeTravelMode === 'sbb') {
        travelSections.push(sbbText);
    }
    if (currentGroupHikeTravelMode === 'both' || currentGroupHikeTravelMode === 'car') {
        if (carText) travelSections.push(carText);
    }
    if (liftText) {
        travelSections.push(liftText);
    }

    return `🥾 *Group Hike: ${spot.name}*
📍 *Region:* ${spot.region || 'Switzerland'} (${spot.canton || ''})
📅 *Date:* ${formattedDate}
⏰ *Meetup:* ${timeVal} at ${meetingPoint}

${travelSections.join('\n\n')}

📊 *Trail Stats:*
• Distance: ${spot.distanceKm || '?'} km | Duration: ~${spot.durationText || '?'}
• Difficulty: ${diffText}
• Strollers: ${strollerText}
${spot.ascentM ? `• Ascent: +${spot.ascentM}m / Descent: -${spot.descentM || spot.ascentM}m` : ''}

🗺️ *Interactive Trail Map, GPS & Details:*
${groupUrl}`;
}

function updateGroupHikePreview() {
    const previewEl = document.getElementById('gh-message-preview');
    if (previewEl) {
        previewEl.textContent = generateGroupHikeInviteText();
    }
}

// --- Event Listeners Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    // 0. Check admin mode to show marketing button
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === 'true') {
        const marketingBtn = document.getElementById('marketing-btn');
        if (marketingBtn) {
            marketingBtn.style.display = 'inline-flex';
        }
    }

    // 1. Data load & maps bootstrap
    loadSpots();
    initializeMap();

    // 2. Search Event Handlers
    const zipInput = document.getElementById("zip-input");
    zipInput.addEventListener("input", (e) => handleZipSearchInput(e.target.value));
    zipInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const rawVal = zipInput.value.trim();
            // 1. If user typed an exact 4-digit Swiss ZIP code, e.g. 8002:
            if (/^\d{4}$/.test(rawVal) && SWISS_ZIPS[rawVal]) {
                selectZip(rawVal);
                return;
            }
            // 2. Otherwise pick the first autocomplete item if dropdown has results:
            const firstItem = document.querySelector("#zip-autocomplete .autocomplete-item");
            if (firstItem) {
                if (firstItem.dataset.zip) {
                    selectZip(firstItem.dataset.zip);
                } else if (firstItem.dataset.spotId) {
                    selectSpotFromSearch(firstItem.dataset.spotId);
                }
            }
        }
    });

    // Hide dropdown if clicked outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-zip-group")) {
            document.getElementById("zip-autocomplete").style.display = "none";
        }
    });

    // ZIP or Trail/Spot selection click
    document.getElementById("zip-autocomplete").addEventListener("click", (e) => {
        const item = e.target.closest(".autocomplete-item");
        if (item) {
            if (item.dataset.spotId) {
                selectSpotFromSearch(item.dataset.spotId);
            } else if (item.dataset.zip) {
                selectZip(item.dataset.zip);
            }
        }
    });

    document.getElementById("clear-zip").addEventListener("click", clearSearch);
    document.getElementById("locate-me-btn").addEventListener("click", locateUser);

    // 3. Distance Radius slider
    const radiusSlider = document.getElementById("radius-slider");
    const radiusVal = document.getElementById("radius-value");
    
    radiusSlider.addEventListener("input", (e) => {
        currentRadiusKm = parseInt(e.target.value);
        radiusVal.textContent = `${currentRadiusKm} km`;
        renderSpotsList();
    });

    // 4. Filters & Sorters checkbox events
    document.getElementById("filter-playpark").addEventListener("change", renderSpotsList);
    const filterHikingEl = document.getElementById("filter-hiking");
    if (filterHikingEl) filterHikingEl.addEventListener("change", renderSpotsList);
    document.getElementById("filter-gamezone").addEventListener("change", renderSpotsList);
    document.getElementById("filter-swimmingpool").addEventListener("change", renderSpotsList);
    document.getElementById("filter-weather-suitable").addEventListener("change", renderSpotsList);
    document.getElementById("sort-select").addEventListener("change", renderSpotsList);

    // Helper to deselect other spot categories (Playparks, Game zones, Swimming pools)
    // when a specific type or option of hike is chosen
    function deselectNonHikingCategories() {
        const playpark = document.getElementById("filter-playpark");
        const gamezone = document.getElementById("filter-gamezone");
        const pool = document.getElementById("filter-swimmingpool");
        const hiking = document.getElementById("filter-hiking");

        if (playpark) playpark.checked = false;
        if (gamezone) gamezone.checked = false;
        if (pool) pool.checked = false;
        if (hiking) hiking.checked = true;

        const hikingSubfiltersBox = document.getElementById("hiking-subfilters-box");
        if (hikingSubfiltersBox) {
            hikingSubfiltersBox.style.display = "block";
        }
    }

    // Hiking sub-filter events: when user selects any specific hike type/option,
    // automatically deselect Playparks, Game zones, and Swimming pools
    ["filter-hike-region", "filter-hike-difficulty", "filter-hike-stroller", "filter-hike-winter", "filter-hike-restaurant", "filter-hike-parking"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("change", (e) => {
                const target = e.target;
                const isSelected = (target.type === "checkbox" && target.checked) ||
                                   (target.tagName === "SELECT" && target.value !== "all");
                if (isSelected) {
                    deselectNonHikingCategories();
                }
                renderSpotsList();
            });
        }
    });

    // Also support clicking Stroller or Winter trail pill badges on cards to filter directly
    document.addEventListener("click", (e) => {
        const strollerPill = e.target.closest(".hike-pill-stroller");
        if (strollerPill) {
            e.stopPropagation();
            const strollerCb = document.getElementById("filter-hike-stroller");
            if (strollerCb) {
                strollerCb.checked = true;
                deselectNonHikingCategories();
                renderSpotsList();
                const filterSection = document.querySelector(".filter-section");
                if (filterSection) filterSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
            return;
        }

        const winterPill = e.target.closest(".hike-pill-winter");
        if (winterPill) {
            e.stopPropagation();
            const winterCb = document.getElementById("filter-hike-winter");
            if (winterCb) {
                winterCb.checked = true;
                deselectNonHikingCategories();
                renderSpotsList();
                const filterSection = document.querySelector(".filter-section");
                if (filterSection) filterSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
            return;
        }
    });

    const swisstopoToggle = document.getElementById("toggle-swisstopo-layer");
    if (swisstopoToggle) {
        swisstopoToggle.addEventListener("change", (e) => {
            toggleSwisstopoMapLayer(e.target.checked);
        });
    }

    // Fee radios
    document.querySelectorAll('input[name="filter-fees"]').forEach(r => {
        r.addEventListener("change", renderSpotsList);
    });

    // 5. Header buttons & Modals
    const addSpotModal = document.getElementById("add-spot-modal");
    const detailModal = document.getElementById("detail-modal");
    const feedbackModal = document.getElementById("feedback-modal");

    document.getElementById("add-spot-btn").addEventListener("click", () => {
        addSpotModal.style.display = "flex";
    });

    document.getElementById("feedback-btn").addEventListener("click", () => {
        feedbackModal.style.display = "flex";
    });

    // Modal Close triggers
    document.querySelectorAll(".modal-close, #add-spot-cancel, #feedback-cancel").forEach(btn => {
        btn.addEventListener("click", () => {
            addSpotModal.style.display = "none";
            detailModal.style.display = "none";
            feedbackModal.style.display = "none";
        });
    });

    // Close on overlay click
    window.addEventListener("click", (e) => {
        if (e.target === addSpotModal) addSpotModal.style.display = "none";
        if (e.target === detailModal) detailModal.style.display = "none";
        if (e.target === feedbackModal) feedbackModal.style.display = "none";
    });

    // Add Spot Form Submission
    document.getElementById("add-spot-form").addEventListener("submit", handleAddSpotSubmit);

    // Use My Location GPS button
    document.getElementById("use-my-location-btn").addEventListener("click", useMyLocation);

    // Collapsible optional details toggle
    document.getElementById("toggle-optional-details").addEventListener("click", () => {
        const section = document.getElementById("optional-details-section");
        const icon = document.querySelector("#toggle-optional-details i");
        if (section.style.display === "none") {
            section.style.display = "block";
            icon.className = "fa-solid fa-chevron-up";
        } else {
            section.style.display = "none";
            icon.className = "fa-solid fa-chevron-down";
        }
    });

    // Feedback Form Submission & Rating Selectors
    const feedbackStars = document.querySelectorAll(".feedback-star");
    const feedbackRatingInput = document.getElementById("feedback-rating-input");
    feedbackStars.forEach(star => {
        star.addEventListener("click", () => {
            const val = parseInt(star.dataset.val);
            feedbackRatingInput.value = val;
            feedbackStars.forEach((s, idx) => {
                if (idx < val) {
                    s.classList.remove("fa-regular", "star-empty");
                    s.classList.add("fa-solid", "star-filled");
                } else {
                    s.classList.remove("fa-solid", "star-filled");
                    s.classList.add("fa-regular", "star-empty");
                }
            });
        });
    });

    document.getElementById("feedback-form").addEventListener("submit", handleFeedbackSubmit);

    // 6. Theme toggle
    const themeBtn = document.getElementById("theme-toggle");
    themeBtn.addEventListener("click", () => {
        if (document.body.classList.contains("light-theme")) {
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
            themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
            themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    });

    // 7. Mobile View Switchers
    const mobileMapBtn = document.getElementById("mobile-map-toggle");
    const mobileListBtn = document.getElementById("mobile-list-toggle");
    const mapPanel = document.getElementById("map-panel");

    mobileMapBtn.addEventListener("click", () => {
        mapPanel.style.display = "block";
        // Recalculate Leaflet sizing
        setTimeout(() => {
            if (activeMap) activeMap.invalidateSize();
        }, 100);
    });

    mobileListBtn.addEventListener("click", () => {
        mapPanel.style.display = "none";
    });

    // 8. Group Hike Planner Event Listeners
    const closeGhBtn = document.getElementById("close-group-hike-modal");
    if (closeGhBtn) closeGhBtn.addEventListener("click", closeGroupHikeModal);

    const ghModal = document.getElementById("group-hike-modal");
    if (ghModal) {
        ghModal.addEventListener("click", (e) => {
            if (e.target === ghModal) closeGroupHikeModal();
        });
    }

    // Travel tabs (Train & Car / Train / Car)
    const travelTabs = document.querySelectorAll(".gh-travel-tab");
    travelTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            travelTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const mode = tab.dataset.mode;
            currentGroupHikeTravelMode = mode;
            const sbbWrapper = document.getElementById("gh-sbb-wrapper");
            const carWrapper = document.getElementById("gh-car-wrapper");
            if (mode === "both") {
                if (sbbWrapper) sbbWrapper.style.display = "block";
                if (carWrapper) carWrapper.style.display = "block";
            } else if (mode === "sbb") {
                if (sbbWrapper) sbbWrapper.style.display = "block";
                if (carWrapper) carWrapper.style.display = "none";
            } else if (mode === "car") {
                if (sbbWrapper) sbbWrapper.style.display = "none";
                if (carWrapper) carWrapper.style.display = "block";
            }
            updateGroupHikePreview();
        });
    });

    const ghDateInput = document.getElementById("gh-date");
    const ghTimeInput = document.getElementById("gh-time");
    const ghMeetingInput = document.getElementById("gh-meeting-point");
    const ghFromInput = document.getElementById("gh-from-input");

    if (ghDateInput) ghDateInput.addEventListener("change", () => { fetchGroupHikeTravel(); updateGroupHikePreview(); });
    if (ghTimeInput) ghTimeInput.addEventListener("change", () => { fetchGroupHikeTravel(); updateGroupHikePreview(); });
    if (ghMeetingInput) ghMeetingInput.addEventListener("input", updateGroupHikePreview);
    if (ghFromInput) {
        ghFromInput.addEventListener("input", updateGroupHikePreview);
        ghFromInput.addEventListener("change", fetchGroupHikeTravel);
        ghFromInput.addEventListener("keydown", (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                fetchGroupHikeTravel();
            }
        });
    }

    const refreshTravelBtn = document.getElementById("gh-btn-refresh-sbb");
    if (refreshTravelBtn) refreshTravelBtn.addEventListener("click", fetchGroupHikeTravel);

    // City pills
    const cityPills = document.querySelectorAll(".gh-city-pill");
    cityPills.forEach(pill => {
        pill.addEventListener("click", () => {
            cityPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            if (ghFromInput) {
                ghFromInput.value = pill.dataset.city;
                fetchGroupHikeTravel();
            }
        });
    });

    // Share buttons
    const whatsappBtn = document.getElementById("gh-btn-whatsapp");
    if (whatsappBtn) {
        whatsappBtn.addEventListener("click", () => {
            const text = generateGroupHikeInviteText();
            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
        });
    }

    const copyTextBtn = document.getElementById("gh-btn-copy-text");
    if (copyTextBtn) {
        copyTextBtn.addEventListener("click", async () => {
            const text = generateGroupHikeInviteText();
            try {
                await navigator.clipboard.writeText(text);
                flashGroupCopyToast("Message copied to clipboard!");
            } catch (err) {
                fallbackCopyText(text);
            }
        });
    }

    const copyLinkBtn = document.getElementById("gh-btn-copy-link");
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener("click", async () => {
            if (!currentGroupHikeSpot) return;
            const canonicalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                ? 'https://swissforkids.ch'
                : window.location.origin;
            const dateVal = ghDateInput ? ghDateInput.value : '';
            const timeVal = ghTimeInput ? ghTimeInput.value : '';
            const fromStation = ghFromInput ? ghFromInput.value : '';
            const meetingPoint = ghMeetingInput ? ghMeetingInput.value : '';
            const link = `${canonicalHost}/?hike=${encodeURIComponent(currentGroupHikeSpot.id)}&group=1&date=${encodeURIComponent(dateVal)}&time=${encodeURIComponent(timeVal)}&from=${encodeURIComponent(fromStation)}&meetingPoint=${encodeURIComponent(meetingPoint)}`;
            try {
                await navigator.clipboard.writeText(link);
                flashGroupCopyToast("Invite link copied to clipboard!");
            } catch (err) {
                fallbackCopyText(link);
            }
        });
    }

    // 9. Run initial render
    renderSpotsList();
});

function flashGroupCopyToast(msg) {
    const toast = document.getElementById("gh-copy-toast");
    if (toast) {
        toast.innerHTML = `<i class="fa-solid fa-check"></i> ${escapeHtml(msg)}`;
        toast.style.display = "inline-block";
        setTimeout(() => {
            toast.style.display = "none";
        }, 2500);
    }
}

function fallbackCopyText(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand("copy");
        flashGroupCopyToast("Copied to clipboard!");
    } catch (e) {
        alert("Copy failed, please copy manually from the preview box.");
    }
    document.body.removeChild(ta);
}

// Open a cross-linked nearby playground/pool from inside a Hiking Trail detail modal
window.openNearbyKidsSpot = async function(spotId) {
    let target = spots.find(s => s.id === spotId);
    if (!target) {
        await loadOsmSpots();
        target = spots.find(s => s.id === spotId);
    }
    if (target) {
        openDetails(spotId);
    }
};

