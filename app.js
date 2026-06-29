// --- Swiss ZIP Codes Database (Loaded asynchronously on startup) ---
let SWISS_ZIPS = {};

// --- Mock Dataset for Swiss Kids' Spots ---
// Baseline curated spots loaded dynamically from base_spots.json


// --- App State ---
let spots = [];
let activeMap = null;
let mapMarkers = [];
let currentSearchCenter = { lat: 46.8182, lng: 8.2275, name: "Switzerland" }; // Centered on Switzerland
let currentSearchZip = "";
let currentRadiusKm = 5;
let liveWeatherData = null; // Global cache for searched zip weather
let theme = "light";
let userLocationMarker = null;

// --- Utility Functions ---

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

// Compute average rating
function getAvgRating(spot) {
    if (!spot.ratings || spot.ratings.length === 0) return 0;
    const sum = spot.ratings.reduce((acc, r) => acc + r, 0);
    return (sum / spot.ratings.length).toFixed(1);
}

// Check if a spot is "free"
function isFreeSpot(spot) {
    return spot.fees.toLowerCase().includes("free") || parseFloat(spot.fees) === 0;
}

// Retrieve Weather Code Info
function getWeatherIconAndDesc(code) {
    // Return FontAwesome icon and label based on WMO codes
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

// Determine if weather is suitable for kids playspots
function evaluateWeatherSuitability(type, weather) {
    // If no weather loaded, assume good
    if (!weather) return { suitable: true, status: "good", label: "Weather Suitable", advice: "" };

    const temp = weather.temperature;
    const prec = weather.precipitation;
    const code = weather.code;
    const warnings = weather.warnings || [];

    const now = Date.now();
    // Filter active warnings based on valid time range
    const activeWarnings = warnings.filter(w => 
        (!w.validFrom || now >= w.validFrom) && 
        (!w.validTo || now <= w.validTo)
    );

    // Get today's forecast max temperature
    const todayMax = (weather.forecast && weather.forecast[0]) ? weather.forecast[0].temperatureMax : temp;

    // Detect heatwave in active warnings
    const heatWarning = activeWarnings.find(w => w.warnType === 7 && w.warnLevel >= 2);
    
    // A heatwave is active if the current temp >= 32, or today's forecast max >= 30,
    // or if there is an active official heatwave warning AND either current temp >= 28 or forecast max >= 30.
    const hasHeatwave = temp >= 32 || todayMax >= 30 || (!!heatWarning && (temp >= 28 || todayMax >= 30));

    // Detect severe weather warnings (wind, storm, rain, flood, snow, slippery roads, avalanche, earthquake)
    // warnType 10 is forest fire, which we can exclude from immediate playspot danger unless specifically high.
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

        if (type === "playpark") {
            return {
                suitable: false,
                status: "warning",
                icon: "fa-triangle-exclamation",
                label: `⚠️ ${typeName} (Level ${severeWarning.warnLevel})`,
                advice: `Not recommended: Severe weather active. Details: ${severeWarning.text || 'Seek shelter immediately.'}`
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
            let heatAdvice = `Extremely hot (${temp}°C). Outdoor play is not recommended due to heat exhaustion risk. Stay indoors or in cool, shaded spaces.`;
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
        } else if (type === "swimmingpool") {
            let poolAdvice = `Excellent for cooling off! Remember to apply plenty of sunscreen, wear hats, and stay hydrated in the heat (${temp}°C).`;
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
                advice: `Stay cool indoors! A great air-conditioned or shaded escape from the ${temp}°C heat wave outside.`
            };
        }
    }

    // 3. Normal weather checks
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

    // 1. Load hand-curated baseline from JSON file
    try {
        const baseResponse = await fetch("base_spots.json?v=" + Date.now());
        if (baseResponse.ok) {
            const baseSpots = await baseResponse.json();
            spots = [...baseSpots];
        } else {
            spots = [];
        }
    } catch (e) {
        console.error("Error loading base_spots.json:", e);
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
    
    // Merge reviews into baseline spots
    spots.forEach(spot => {
        if (reviewsDict[spot.id]) {
            spot.ratings = spot.ratings.concat(reviewsDict[spot.id].ratings || []);
            spot.comments = spot.comments.concat(reviewsDict[spot.id].comments || []);
        }
    });

    // 4. Fetch the 200 harvested spots from OSM
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
        }
    } catch (e) {
        console.warn("Could not fetch spots_harvested.json, using baseline.", e);
    }
    
    // Refresh lists and map markers once loaded
    renderSpotsList();
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
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(activeMap);
}

// Plot Markers on Map
function updateMapMarkers(filteredSpots) {
    // Clear existing markers
    mapMarkers.forEach(m => activeMap.removeLayer(m));
    mapMarkers = [];

    if (filteredSpots.length === 0) return;

    const bounds = [];

    filteredSpots.forEach(spot => {
        const iconTypeClass = `pin-${spot.type}`;
        
        let iconHtml = "";
        if (spot.type === "playpark") iconHtml = '<i class="fa-solid fa-child-reaching"></i>';
        else if (spot.type === "gamezone") iconHtml = '<i class="fa-solid fa-gamepad"></i>';
        else if (spot.type === "swimmingpool") iconHtml = '<i class="fa-solid fa-water-ladder"></i>';

        const weatherEval = evaluateWeatherSuitability(spot.type, liveWeatherData);
        const weatherStyleClass = weatherEval.status === "warning" ? "pin-bad-weather" : "pin-good-weather";

        const customMarkerIcon = L.divIcon({
            html: `<div class="custom-pin ${iconTypeClass} ${weatherStyleClass}">${iconHtml}</div>`,
            className: 'custom-div-icon',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        });

        const marker = L.marker([spot.lat, spot.lng], { icon: customMarkerIcon }).addTo(activeMap);
        
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
        const popupContent = `
            <div style="font-family: var(--font-primary); min-width: 160px; padding: 2px;">
                <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 700; color: var(--text-primary);">${spot.name}</h4>
                <p style="margin: 0 0 8px 0; font-size: 0.8rem; color: var(--text-secondary);"><i class="fa-solid fa-location-dot"></i> ${spot.city} (${spot.zip})</p>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                    <button class="btn btn-outline" onclick="openDetails('${spot.id}')" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; flex: 1; min-height: auto; height: auto;">Details</button>
                    <a href="${directionsUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 1; color: white; min-height: auto; height: auto; text-transform: none; letter-spacing: 0;"><i class="fa-solid fa-diamond-turn-right"></i> Route</a>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        mapMarkers.push(marker);
        bounds.push([spot.lat, spot.lng]);
    });

    // Fit map bounds if there are markers and search zip is specified
    if (bounds.length > 0 && currentSearchZip !== "") {
        activeMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else if (bounds.length > 0) {
        activeMap.setView([currentSearchCenter.lat, currentSearchCenter.lng], 9);
    }
}

// --- Render Spot Card List ---
function renderSpotsList() {
    const listContainer = document.getElementById("spots-list");
    const countContainer = document.getElementById("results-count");

    // Gather search parameters & filters
    const typePlaypark = document.getElementById("filter-playpark").checked;
    const typeGamezone = document.getElementById("filter-gamezone").checked;
    const typeSwimmingpool = document.getElementById("filter-swimmingpool").checked;

    const selectedFees = document.querySelector('input[name="filter-fees"]:checked').value;
    const weatherSuitableOnly = document.getElementById("filter-weather-suitable").checked;
    const sortBy = document.getElementById("sort-select").value;

    let filtered = spots.map(spot => {
        // Calculate distance from search center if active search zip exists
        let distance = null;
        if (currentSearchZip !== "") {
            distance = calculateDistance(
                currentSearchCenter.lat, 
                currentSearchCenter.lng, 
                spot.lat, 
                spot.lng
            );
        }
        return { ...spot, distance };
    });

    // 1. Filter by Radius (if ZIP search is active)
    if (currentSearchZip !== "") {
        filtered = filtered.filter(spot => spot.distance <= currentRadiusKm);
    }

    // 2. Filter by Category
    filtered = filtered.filter(spot => {
        if (spot.type === "playpark" && !typePlaypark) return false;
        if (spot.type === "gamezone" && !typeGamezone) return false;
        if (spot.type === "swimmingpool" && !typeSwimmingpool) return false;
        return true;
    });

    // 3. Filter by Fees
    if (selectedFees === "free") {
        filtered = filtered.filter(isFreeSpot);
    }

    // 4. Filter by Weather Suitability
    if (weatherSuitableOnly && liveWeatherData) {
        filtered = filtered.filter(spot => {
            const evaluation = evaluateWeatherSuitability(spot.type, liveWeatherData);
            return evaluation.suitable;
        });
    }

    // Sort Results
    if (sortBy === "distance" && currentSearchZip !== "") {
        filtered.sort((a, b) => a.distance - b.distance);
    } else if (sortBy === "rating") {
        filtered.sort((a, b) => getAvgRating(b) - getAvgRating(a));
    } else {
        // Fallback: alphabetical name sort
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Render count
    const zipCity = currentSearchZip && SWISS_ZIPS[currentSearchZip] ? SWISS_ZIPS[currentSearchZip].city : currentSearchZip;
    countContainer.textContent = `${filtered.length} playspot${filtered.length === 1 ? '' : 's'} found ${currentSearchZip ? `near ${zipCity}` : 'in Switzerland'}`;

    // Render Cards
    listContainer.innerHTML = "";
    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="card" style="text-align: center; padding: 2rem;">
                <i class="fa-solid fa-face-frown" style="font-size: 2.5rem; color: var(--text-light); margin-bottom: 1rem;"></i>
                <h3>No Spots Match Your Search</h3>
                <p style="color: var(--text-secondary); margin-top: 0.5rem;">Try increasing your radius, typing another ZIP code, or clearing some filters.</p>
            </div>
        `;
        updateMapMarkers([]);
        return;
    }

    filtered.forEach(spot => {
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
        const weatherEval = evaluateWeatherSuitability(spot.type, liveWeatherData);
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

        const card = document.createElement("div");
        card.className = "spot-card";
        card.dataset.id = spot.id;
        card.innerHTML = `
            <div class="spot-card-img-container">
                <img class="spot-card-img" src="${spot.imageUrl}" alt="${spot.name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=getDefaultSpotFallback('${spot.type}')">
                <div class="spot-card-badges">
                    <span class="badge-type badge-${spot.type}">${spot.type}</span>
                    ${weatherHtml}
                </div>
                ${distHtml}
            </div>
            <div class="spot-card-info">
                <h3 class="spot-card-title">${spot.name}</h3>
                <p class="spot-card-area"><i class="fa-solid fa-location-dot"></i> ${spot.address}</p>
                <div class="spot-card-meta">
                    <div class="spot-card-rating">
                        ${starsHtml} <span>(${spot.ratings.length})</span>
                    </div>
                    ${feeBadge}
                </div>
            </div>
            <div class="spot-card-footer">
                <button class="btn btn-outline" onclick="openDetails('${spot.id}')">View Details</button>
                <button class="btn btn-primary" onclick="focusOnMap('${spot.id}', ${spot.lat}, ${spot.lng})"><i class="fa-solid fa-location-crosshairs"></i> Map</button>
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

    updateMapMarkers(filtered);
}

// Center Map on a Selected Spot from Card
function focusOnMap(id, lat, lng) {
    if (!activeMap) return;
    
    // Zoom closer to selected spot
    activeMap.setView([lat, lng], 14);

    // Find and trigger popup for the marker
    const marker = mapMarkers.find(m => m.getLatLng().lat === lat && m.getLatLng().lng === lng);
    if (marker) {
        marker.openPopup();
    }

    // Scroll to map for mobile screens
    if (window.innerWidth <= 992) {
        document.getElementById("map-panel").style.display = "block";
    }
}

// Helper for fallback images when scraped urls break or are blocked
function getDefaultSpotFallback(type) {
    if (type === "playpark") return "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80";
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

// --- Detail View Loading ---
async function openDetails(spotId) {
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

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    const googleSearchUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${spot.lat},${spot.lng}`;
    container.innerHTML = `
        ${galleryHtml}
        <div class="detail-title-section">
            <div class="detail-title-row">
                <h2>${spot.name}</h2>
                <span class="badge-type badge-${spot.type}">${spot.type}</span>
            </div>
            <div class="detail-address-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.8rem; margin-top: 0.5rem; margin-bottom: 1.2rem;">
                <p class="spot-card-area" style="margin: 0;"><i class="fa-solid fa-location-dot"></i> ${spot.address}</p>
                <div style="display: flex; gap: 8px;">
                    <a href="${googleSearchUrl}" target="_blank" rel="noopener" class="btn btn-outline" style="padding: 0.5rem 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0; border: 1px solid var(--border-color);">
                        <i class="fa-solid fa-map-location-dot"></i> Verify on Google Maps
                    </a>
                    <a href="${directionsUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none; border-radius: var(--radius-sm); text-transform: none; letter-spacing: 0; color: white;">
                        <i class="fa-solid fa-diamond-turn-right"></i> Get Directions
                    </a>
                </div>
            </div>
        </div>

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

        <div class="detail-description">
            <h3>Description & Play Features</h3>
            <p>${spot.description}</p>
        </div>

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
    const spotWeather = await fetchWeatherData(spot.lat, spot.lng);
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
                        <span class="weather-detail-temp">${spotWeather.temperature}°C</span>
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

// --- ZIP Input & Autocomplete ---
function handleZipSearchInput(val) {
    const dropdown = document.getElementById("zip-autocomplete");
    const clearBtn = document.getElementById("clear-zip");
    
    if (!val) {
        dropdown.style.display = "none";
        clearBtn.style.display = "none";
        return;
    }

    clearBtn.style.display = "inline-block";

    const searchStr = val.toLowerCase().trim();
    const matches = [];

    // Search keys or city values
    for (const [zip, data] of Object.entries(SWISS_ZIPS)) {
        if (zip.includes(searchStr) || data.city.toLowerCase().includes(searchStr)) {
            matches.push({ zip, ...data });
        }
        if (matches.length >= 6) break; // Limit suggestions
    }

    if (matches.length > 0) {
        dropdown.innerHTML = matches.map(m => `
            <div class="autocomplete-item" data-zip="${m.zip}">
                <span><strong>${m.zip}</strong> - ${m.city}</span>
                <span class="zip-canton">${m.canton}</span>
            </div>
        `).join("");
        dropdown.style.display = "block";
    } else {
        dropdown.style.display = "none";
    }
}

// Select ZIP from Autocomplete dropdown
async function selectZip(zipCode) {
    const data = SWISS_ZIPS[zipCode];
    if (!data) return;

    document.getElementById("zip-input").value = `${zipCode} - ${data.city} (${data.canton})`;
    document.getElementById("zip-autocomplete").style.display = "none";

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

    liveWeatherData = await fetchWeatherData(data.lat, data.lng);
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
    const activeWarnings = warnings.filter(w => 
        (!w.validFrom || now >= w.validFrom) && 
        (!w.validTo || now <= w.validTo)
    );

    // Get today's forecast max temperature
    const todayMax = (liveWeatherData.forecast && liveWeatherData.forecast[0]) ? liveWeatherData.forecast[0].temperatureMax : liveWeatherData.temperature;

    // Evaluate warning/advisory conditions
    const heatWarning = activeWarnings.find(w => w.warnType === 7 && w.warnLevel >= 2);
    const hasHeatwave = liveWeatherData.temperature >= 32 || todayMax >= 30 || (!!heatWarning && (liveWeatherData.temperature >= 28 || todayMax >= 30));
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
        const relevantWarnings = activeWarnings.filter(w => w.warnLevel >= 2);
        if (relevantWarnings.length > 0) {
            warningsHtml = `
                <div class="weather-widget-warnings" style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(230, 57, 70, 0.3); font-size: 0.8rem; color: var(--danger-red);">
                    ${relevantWarnings.map(w => `
                        <div style="margin-bottom: 4px; display: flex; align-items: flex-start; gap: 4px;">
                            <i class="fa-solid fa-triangle-exclamation" style="margin-top: 2px;"></i> 
                            <div><strong>Level ${w.warnLevel} warning:</strong> ${w.text.split('\n')[0]}</div>
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
                <div class="weather-temp">${liveWeatherData.temperature}°C</div>
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
                
                // Load weather for user's location
                document.getElementById("weather-widget").style.display = "block";
                document.getElementById("weather-widget").innerHTML = `
                    <div class="weather-header">
                        <h3>Weather here</h3>
                        <i class="fa-solid fa-spinner fa-spin"></i>
                    </div>
                `;
                
                liveWeatherData = await fetchWeatherData(lat, lng);
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
function handleAddSpotSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("new-spot-name").value.trim();
    const type = document.getElementById("new-spot-type").value;
    const zipVal = document.getElementById("new-spot-zip").value.trim();
    const city = document.getElementById("new-spot-city").value.trim();
    const address = document.getElementById("new-spot-address").value.trim();
    const hours = document.getElementById("new-spot-hours").value.trim();
    const fees = document.getElementById("new-spot-fees").value.trim();
    const minAge = parseInt(document.getElementById("new-spot-minage").value) || 0;
    const maxAge = parseInt(document.getElementById("new-spot-maxage").value) || 12;
    const desc = document.getElementById("new-spot-desc").value.trim();
    const customImg = document.getElementById("new-spot-image").value.trim();

    // Checkbox Amenities
    const amenities = [];
    document.querySelectorAll('input[name="new-spot-amenities"]:checked').forEach(chk => {
        amenities.push(chk.value);
    });

    // Derive Coordinates: Check if user input custom or fallback to Swiss ZIP DB
    let lat = parseFloat(document.getElementById("new-spot-lat").value);
    let lng = parseFloat(document.getElementById("new-spot-lng").value);

    if (isNaN(lat) || isNaN(lng)) {
        if (SWISS_ZIPS[zipVal]) {
            lat = SWISS_ZIPS[zipVal].lat;
            lng = SWISS_ZIPS[zipVal].lng;
        } else {
            // Default center of Switzerland if coordinate is completely unavailable
            lat = 46.8182;
            lng = 8.2275;
        }
    }

    // Set fallback image based on spot type
    let imageUrl = customImg;
    if (!imageUrl) {
        if (type === "playpark") imageUrl = "https://images.unsplash.com/photo-1596464716127-f2a82984de30?w=600&auto=format&fit=crop&q=80";
        else if (type === "gamezone") imageUrl = "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&auto=format&fit=crop&q=80";
        else imageUrl = "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=600&auto=format&fit=crop&q=80";
    }

    // Create unique spot structure
    const newSpot = {
        id: `custom-spot-${Date.now()}`,
        name,
        type,
        description: desc,
        address: `${address}, ${zipVal} ${city}`,
        zip: zipVal,
        city,
        lat,
        lng,
        openingHours: hours,
        fees: fees === "0" ? "Free" : fees,
        minAge,
        maxAge,
        amenities,
        imageUrl,
        images: [imageUrl],
        ratings: [5], // Start with positive baseline
        comments: [{ author: "Finder", rating: 5, text: "Newly added spot. Looks awesome!" }]
    };

    // Save newly defined ZIP to temporary dictionary if it doesn't exist
    if (!SWISS_ZIPS[zipVal]) {
        SWISS_ZIPS[zipVal] = { city, canton: "CH", lat, lng };
    }

    spots.push(newSpot);
    saveSpots();
    
    // Reset and hide form
    document.getElementById("add-spot-form").reset();
    document.getElementById("add-spot-modal").style.display = "none";
    
    // Refresh page
    renderSpotsList();
    focusOnMap(newSpot.id, lat, lng);
    alert(`Success! "${name}" has been added to your local playspot finder.`);
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

// --- Event Listeners Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    // 1. Data load & maps bootstrap
    loadSpots();
    initializeMap();

    // 2. Search Event Handlers
    const zipInput = document.getElementById("zip-input");
    zipInput.addEventListener("input", (e) => handleZipSearchInput(e.target.value));

    // Hide dropdown if clicked outside
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-zip-group")) {
            document.getElementById("zip-autocomplete").style.display = "none";
        }
    });

    // ZIP selection click
    document.getElementById("zip-autocomplete").addEventListener("click", (e) => {
        const item = e.target.closest(".autocomplete-item");
        if (item) {
            selectZip(item.dataset.zip);
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
    document.getElementById("filter-gamezone").addEventListener("change", renderSpotsList);
    document.getElementById("filter-swimmingpool").addEventListener("change", renderSpotsList);
    document.getElementById("filter-weather-suitable").addEventListener("change", renderSpotsList);
    document.getElementById("sort-select").addEventListener("change", renderSpotsList);

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
            activeMap.invalidateSize();
        }, 100);
    });

    mobileListBtn.addEventListener("click", () => {
        mapPanel.style.display = "none";
    });

    // 8. Run initial render
    renderSpotsList();
});
