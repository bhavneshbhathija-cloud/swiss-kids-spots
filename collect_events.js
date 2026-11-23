/**
 * collect_events.js
 * 
 * Swiss Kids & Family Events Collector for SwissKidsSpots (swissforkids.ch)
 * Phase 1: Aggregates upcoming children's and family events across Switzerland.
 * 
 * Sources:
 * 1. Zürich Tourismus Open Data API (Live Child- & Family-Friendly attractions and special programs)
 * 2. Eventfrog Public API (Connects via process.env.EVENTFROG_API_KEY when supplied)
 * 3. Curated Swiss Family Events Registry (Festivals, museum workshops, seasonal events across all cantons)
 * 
 * Output: events.json
 */

const fs = require('fs');
const path = require('path');

// Load .env file if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const idx = trimmed.indexOf('=');
                const key = trimmed.slice(0, idx).trim();
                const val = trimmed.slice(idx + 1).trim();
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        });
    } catch (e) {
        console.warn('Failed to parse .env in collect_events.js:', e.message);
    }
}

// Load postal codes to automatically resolve exact Swiss Canton (ZH, BE, LU, BS, etc.)
let postalCodes = {};
try {
    const pPath = path.join(__dirname, 'postal-codes.json');
    if (fs.existsSync(pPath)) {
        postalCodes = JSON.parse(fs.readFileSync(pPath, 'utf-8'));
    }
} catch (e) {
    console.warn('[Collector] Could not load postal-codes.json, using fallback canton resolution');
}

function resolveCantonFromAddress(address, fallbackCanton = 'ZH') {
    if (!address) return fallbackCanton;
    const m = address.match(/\b([1-9]\d{3})\b/);
    if (m && postalCodes[m[1]] && postalCodes[m[1]].canton) {
        return postalCodes[m[1]].canton;
    }
    return fallbackCanton;
}

// --- Curated Registry of Top Swiss Children & Family Events across Cantons ---
const CURATED_SWISS_EVENTS = [
    {
        id: "event-zauberpark-zurich-airport",
        title: "Zauberpark at Zurich Airport: Light Art, Music & Kids Concerts",
        titleDe: "Zauberpark Flughafen Zürich: Lichtkunst, Musik & Kinderkonzerte",
        category: "festival",
        description: "Spectacular glowing light art installations throughout the park, accompanied by daily afternoon children's concerts by top Swiss kid artists (Marius & die Jagdkapelle, Laurent & Max, Silberbüx, Andrew Bond), food stalls, and an illuminated winter forest trail.",
        descriptionDe: "Spektakuläre Lichtkunst-Installationen, tägliche Kinderkonzerte am Nachmittag mit den beliebtesten Schweizer Kinderliedermachern, feine Essensstände und ein verzauberter Winterwald-Rundweg.",
        locationName: "The Circle Park, Zurich Airport",
        address: "The Circle, 8058 Zürich-Flughafen",
        canton: "ZH",
        lat: 47.4526,
        lng: 8.5630,
        startDate: "2026-11-19",
        endDate: "2026-12-06",
        timeText: "Daily from 17:00 (Kids concerts 17:30 - 18:30)",
        recurrence: "seasonal",
        ageMin: 2,
        ageMax: 14,
        ageLabel: "All ages (from 2 years)",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Kids under 4 free; Children 4-15 CHF 15; Adults CHF 24",
        officialUrl: "https://zauberpark.ch/",
        ticketUrl: "https://zauberpark.ch/tickets/",
        imageUrl: "/images/events/event-zauberpark-zurich-airport.jpg",
        tags: ["light-art", "concert", "music", "winter", "airport", "food-stalls"],
        organizer: "Flughafen Zürich AG & NOA Mobilitätswelten",
        source: "curated_swiss_family"
    },
    {
        id: "event-illuminarium-zurich",
        title: "Illuminarium: Immersive Winter Light Spectacle at the Swiss National Museum",
        titleDe: "Illuminarium: Magische Winter-Lichtshow im Landesmuseum Zürich",
        category: "festival",
        description: "The inner courtyard of the Swiss National Museum transforms into a glowing winter wonderland. Features a free illuminated courtyard with warm fondue chalets and open firepits, plus a ticketed 360° animated light show with Yuki and mythical creatures.",
        descriptionDe: "Der Innenhof des Landesmuseums verwandelt sich in ein leuchtendes Wintermärchen. Freier Zugang zum glitzernden Hof mit Fondue-Chalets und Feuerschalen; ticketpflichtige 360°-Lichtshow mit Fabelwesen und Yuki.",
        locationName: "Landesmuseum Zürich (Swiss National Museum)",
        address: "Museumstrasse 2, 8001 Zürich",
        canton: "ZH",
        lat: 47.3790,
        lng: 8.5404,
        startDate: "2026-11-07",
        endDate: "2026-12-30",
        timeText: "Daily 17:00 - 22:00",
        recurrence: "seasonal",
        ageMin: 0,
        ageMax: 99,
        ageLabel: "All ages",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Courtyard free; Light Show: Kids (6-15) CHF 9.50, Adults CHF 15.50",
        officialUrl: "https://illuminarium.ch/",
        ticketUrl: "https://illuminarium.ch/#tickets",
        imageUrl: "/images/events/event-illuminarium-zurich.jpg",
        tags: ["light-show", "winter", "christmas-market", "evening", "museum"],
        organizer: "Projektil & Swiss National Museum",
        source: "curated_swiss_family"
    },
    {
        id: "event-technorama-science-labs",
        title: "Technorama Hands-On Labs & Science Shows for Kids",
        titleDe: "Technorama Mitmach-Labore & Science Shows für Kinder",
        category: "workshop",
        description: "Over 500 interactive experiments where touching and trying everything is strictly encouraged! Daily open chemistry, physics, and biology workshops for young inventors, plus high-voltage and liquid nitrogen demonstrations.",
        descriptionDe: "Über 500 Mitmach-Stationen, an denen Anfassen und Ausprobieren ausdrücklich erwünscht ist. Tägliche offene Chemie- und Physik-Labore sowie spektakuläre Blitz- und Kälte-Vorführungen.",
        locationName: "Swiss Science Center Technorama",
        address: "Technoramastrasse 1, 8404 Winterthur",
        canton: "ZH",
        lat: 47.5140,
        lng: 8.7644,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Daily 10:00 - 17:00",
        recurrence: "daily",
        ageMin: 5,
        ageMax: 16,
        ageLabel: "Ages 5–16 (Great for curious kids)",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (6–15) CHF 21; Adults CHF 33; Under 6 free",
        officialUrl: "https://www.technorama.ch",
        ticketUrl: "https://www.technorama.ch/de/besuchen/tickets",
        imageUrl: "/images/events/event-technorama-science-labs.jpg",
        tags: ["science", "experiments", "indoor", "rainy-day", "hands-on", "workshop"],
        organizer: "Swiss Science Center Technorama",
        source: "curated_swiss_family"
    },
    {
        id: "event-verkehrshaus-planetarium-kids",
        title: "Swiss Museum of Transport: Junior Road Traffic Park & Planetarium",
        titleDe: "Verkehrshaus Luzern: Kinder-Verkehrsgarten & Planetarium",
        category: "museum",
        description: "Switzerland's most visited family museum. Kids drive pedal-cars in the outdoor road traffic arena, operate full-size construction diggers, watch family astronomy shows in the large 360° Planetarium dome, and walk through real locomotives and aircraft.",
        descriptionDe: "Das beliebteste Familienmuseum der Schweiz. Kinder fahren Gokarts im Verkehrsgarten, baggern auf der Baustelle, erleben Kindervorführungen im 360°-Planetarium und klettern in historische Züge und Flugzeuge.",
        locationName: "Verkehrshaus der Schweiz (Swiss Transport Museum)",
        address: "Lidostrasse 5, 6006 Luzern",
        canton: "LU",
        lat: 47.0526,
        lng: 8.3370,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Daily 10:00 - 17:00 (Summer until 18:00)",
        recurrence: "daily",
        ageMin: 2,
        ageMax: 16,
        ageLabel: "All ages (from 2 years)",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (6-15) CHF 16; Adults CHF 35; Children under 6 free",
        officialUrl: "https://www.verkehrshaus.ch",
        ticketUrl: "https://www.verkehrshaus.ch/besuchen/tickets-preise.html",
        imageUrl: "/images/events/event-verkehrshaus-planetarium-kids.jpg",
        tags: ["trains", "cars", "planetarium", "indoor", "outdoor", "traffic-park"],
        organizer: "Verkehrshaus der Schweiz",
        source: "curated_swiss_family"
    },
    {
        id: "event-cern-science-gateway-geneva",
        title: "CERN Science Gateway: Hands-on Particle Physics Discovery & Lab Workshops",
        titleDe: "CERN Science Gateway Genf: Interaktive Physik-Experimente & Schülerlabore",
        category: "workshop",
        description: "Designed by world-famous architect Renzo Piano. Children explore the secrets of the Universe through interactive exhibitions, hands-on lab workshops with cloud chambers and magnetic levitation, and science shows.",
        descriptionDe: "Entworfen von Stararchitekt Renzo Piano. Kinder erforschen die Geheimnisse des Universums mit interaktiven Experimenten, Nebelkammern im Schülerlabor und spektakulären Wissenschafts-Shows.",
        locationName: "CERN Science Gateway",
        address: "Esplanade des Particules 1, 1217 Meyrin",
        canton: "GE",
        lat: 46.2330,
        lng: 6.0557,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Tues - Sun 09:00 - 17:00",
        recurrence: "daily",
        ageMin: 5,
        ageMax: 18,
        ageLabel: "Ages 5–18",
        isRainyDayFriendly: true,
        isFree: true,
        priceText: "Free admission for everyone (Registration required for lab workshops)",
        officialUrl: "https://sciencegateway.cern",
        ticketUrl: "https://sciencegateway.cern/practical-information",
        imageUrl: "/images/events/event-cern-science-gateway-geneva.jpg",
        tags: ["science", "physics", "cern", "free", "indoor", "rainy-day", "hands-on"],
        organizer: "CERN",
        source: "curated_swiss_family"
    },
    {
        id: "event-schloss-lenzburg-dragon",
        title: "Schloss Lenzburg: The Dragon Castle, Knights Arena & Children's Museum",
        titleDe: "Schloss Lenzburg: Drachenburg, Rittererlebnis & Kindermuseum",
        category: "museum",
        description: "One of Switzerland's oldest hilltop castles. Children search for Fauchi the Castle Dragon in his secret cavern, dress up as knights and medieval princesses, and build craft projects in the high Castle attic workshop.",
        descriptionDe: "Eine der ältesten und bedeutendsten Höhenburgen der Schweiz. Kinder besuchen den legendären Schlossdrachen Fauchi in seiner Drachenhöhle, verkleiden sich als Ritter und Burgfräulein und basteln in der Museumswerkstatt.",
        locationName: "Schloss Lenzburg (Museum Aargau)",
        address: "Schlossgasse 21, 5600 Lenzburg",
        canton: "AG",
        lat: 47.3879,
        lng: 8.1852,
        startDate: "2026-10-01",
        endDate: "2027-10-31",
        timeText: "Tues - Sun 10:00 - 17:00",
        recurrence: "daily",
        ageMin: 3,
        ageMax: 12,
        ageLabel: "Ages 3–12",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (4–16) CHF 8; Adults CHF 14; Family CHF 35",
        officialUrl: "https://www.museumaargau.ch/schloss-lenzburg",
        ticketUrl: "https://www.museumaargau.ch/schloss-lenzburg/preise",
        imageUrl: "/images/events/event-schloss-lenzburg-dragon.jpg",
        tags: ["castle", "dragon", "knights", "medieval", "indoor", "history"],
        organizer: "Museum Aargau",
        source: "curated_swiss_family"
    },
    {
        id: "event-swissminiatur-melide",
        title: "Swissminiatur: The Miniature Switzerland Park on Lake Lugano",
        titleDe: "Swissminiatur Melide: Das Freilichtmuseum der Schweiz im Kleinformat",
        category: "outdoor",
        description: "Over 128 hand-crafted 1:25 scale models of Swiss castles, churches, and iconic monuments. 18 miniature electric trains run through the park over 3.5 km of tracks, with operating cogwheel railways and cable cars.",
        descriptionDe: "Über 128 detailgetreue 1:25-Modelle der bekanntesten Schweizer Schlösser, Kirchen und Baudenkmäler. 18 Modelleisenbahnen fahren über 3.5 km Schienen, mit funktionierenden Bergbahnen und Seilbahnen.",
        locationName: "Swissminiatur",
        address: "Piazzale Swissminiatur, 6815 Melide",
        canton: "TI",
        lat: 45.9543,
        lng: 8.9507,
        startDate: "2026-10-01",
        endDate: "2027-11-07",
        timeText: "Daily 09:00 - 18:00",
        recurrence: "daily",
        ageMin: 2,
        ageMax: 14,
        ageLabel: "All ages",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Children (6–15) CHF 14; Adults CHF 21; Children under 6 free",
        officialUrl: "https://www.swissminiatur.ch",
        ticketUrl: "https://www.swissminiatur.ch/tickets",
        imageUrl: "/images/events/event-swissminiatur-melide.jpg",
        tags: ["miniature", "trains", "lugano", "ticino", "outdoor", "castles"],
        organizer: "Swissminiatur SA",
        source: "curated_swiss_family"
    },
    {
        id: "event-barryland-saint-bernard-dogs",
        title: "Barryland: Meet & Pet the Famous St. Bernard Dogs of Switzerland",
        titleDe: "Barryland Martigny: Die berühmten Bernhardiner-Rettungshunde hautnah",
        category: "animals",
        description: "The official home of the living Swiss national dog, the St. Bernard. Children meet the gentle giant rescue dogs and puppies, watch daily training sessions, explore the interactive discovery museum, and enjoy the large thematic outdoor playground.",
        descriptionDe: "Die Heimat der legendären Schweizer Bernhardiner-Rettungshunde. Kinder erleben die sanften Riesen und Welpen hautnah im Aussengehege, entdecken das interaktive Museum und toben auf dem thematischen Erlebnisspielplatz.",
        locationName: "Barryland - Musée et Chiens du Saint-Bernard",
        address: "Rue du Levant 34, 1920 Martigny",
        canton: "VS",
        lat: 46.1009,
        lng: 7.0788,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Daily 10:00 - 18:00",
        recurrence: "daily",
        ageMin: 1,
        ageMax: 14,
        ageLabel: "All ages (great for animal lovers)",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (8–16) CHF 7; Adults CHF 12; Children under 8 free",
        officialUrl: "https://barryland.ch",
        ticketUrl: "https://barryland.ch/tarifs-horaires/",
        imageUrl: "/images/events/event-barryland-saint-bernard-dogs.jpg",
        tags: ["dogs", "st-bernard", "animals", "valais", "puppies", "indoor", "outdoor"],
        organizer: "Fondation Barry",
        source: "curated_swiss_family"
    },
    {
        id: "event-ballenberg-open-air-museum",
        title: "Ballenberg: Open-Air Museum of Rural Switzerland & Farm Animals",
        titleDe: "Freilichtmuseum Ballenberg: Historische Bauernhöfe & Hoftiere zum Streicheln",
        category: "outdoor",
        description: "Over 100 centuries-old rural houses and farmsteads from all over Switzerland reconstructed in a picturesque alpine landscape. Kids pet 200+ native farm animals, watch bread baking in wood ovens, see cheese making, and play with historical wooden games.",
        descriptionDe: "Über 100 jahrhundertealte historische Bauernhäuser aus der ganzen Schweiz in traumhafter Berglandschaft. Mit über 200 Bauernhoftieren zum Streicheln, traditionellem Brotbacken, Käserei und historischen Holzspielen für Kinder.",
        locationName: "Freilichtmuseum Ballenberg",
        address: "Museumsstrasse 100, 3858 Hofstetten bei Brienz",
        canton: "BE",
        lat: 46.7516,
        lng: 8.0772,
        startDate: "2026-10-01",
        endDate: "2027-10-31",
        timeText: "Daily 10:00 - 17:00",
        recurrence: "daily",
        ageMin: 2,
        ageMax: 16,
        ageLabel: "All ages",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Children (6–15) CHF 16; Adults CHF 32; Children under 6 free; Family CHF 76",
        officialUrl: "https://www.ballenberg.ch",
        ticketUrl: "https://www.ballenberg.ch/de/tickets",
        imageUrl: "/images/events/event-ballenberg-open-air-museum.jpg",
        tags: ["open-air", "farm-animals", "history", "crafts", "brienz", "outdoor"],
        organizer: "Stiftung Freilichtmuseum Ballenberg",
        source: "curated_swiss_family"
    },
    {
        id: "event-muehlerama-bread-baking",
        title: "Mühlerama: Grind Grain on a Mill & Bake Your Own Fresh Bread",
        titleDe: "Mühlerama: Mehl mahlen auf der Mühle & eigenes Brot backen",
        category: "workshop",
        description: "In an active historical industrial mill, children learn how wheat becomes flour. Kids roll up their sleeves, shape their own dough into animals or bread rolls, bake them in the wooden oven, and slide down the giant flour-sack slide!",
        descriptionDe: "In einer über 100 Jahre alten Industriemühle mahlen Kinder Getreide, kneten ihren eigenen Teig, backen Brötchen im Holzofen und sausen über die legendäre Mehl-Rutschenbahn.",
        locationName: "Mühlerama Tiefenbrunnen",
        address: "Seefeldstrasse 231, 8008 Zürich",
        canton: "ZH",
        lat: 47.3503,
        lng: 8.5583,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Tues, Wed, Fri, Sat 14:00 - 18:00; Sun 10:00 - 17:00 (Baking workshops on weekends)",
        recurrence: "weekends",
        ageMin: 4,
        ageMax: 12,
        ageLabel: "Ages 4–12",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Kids CHF 9; Adults CHF 15 (Includes freshly baked bread)",
        officialUrl: "https://www.muehlerama.ch",
        ticketUrl: "https://www.muehlerama.ch/angebote/fuer-familien/",
        imageUrl: "/images/events/event-muehlerama-bread-baking.jpg",
        tags: ["baking", "workshop", "indoor", "rainy-day", "hands-on", "food"],
        organizer: "Mühlerama Museum",
        source: "curated_swiss_family"
    },
    {
        id: "event-buerkliplatz-kerzenziehen-zurich",
        title: "Traditional Candle Dipping at Bürkliplatz Zürich",
        titleDe: "Traditionelles Zürcher Kerzenziehen am Bürkliplatz",
        category: "workshop",
        description: "A beloved 50-year Swiss autumn & winter tradition. Children dip cotton wicks slowly into pots of fragrant molten beeswax, layer by layer, watching their colorful candle grow and crafting unique hand-carved patterns.",
        descriptionDe: "Eine traditionsreiche Zürcher Vorweihnachtstradition. Kinder tauchen Dochte in duftendes, warmes Bienenwachs, Schicht für Schicht, und schnitzen kunstvolle Muster in ihre eigenen Kerzen.",
        locationName: "Musikpavillon Bürkliplatz",
        address: "Bürkliplatz, 8001 Zürich",
        canton: "ZH",
        lat: 47.3664,
        lng: 8.5413,
        startDate: "2026-11-04",
        endDate: "2026-12-22",
        timeText: "Daily 10:00 - 20:00",
        recurrence: "seasonal",
        ageMin: 4,
        ageMax: 16,
        ageLabel: "Ages 4+",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Free entry; Pay by weight of beeswax candle made (approx. CHF 12-20)",
        officialUrl: "https://www.kerzenziehen.ch",
        ticketUrl: "https://www.kerzenziehen.ch",
        imageUrl: "/images/events/event-buerkliplatz-kerzenziehen-zurich.jpg",
        tags: ["crafts", "winter", "tradition", "christmas", "hands-on"],
        organizer: "Zürcher Kerzenziehen",
        source: "curated_swiss_family"
    },
    {
        id: "event-raebeliechtli-richterswil",
        title: "Räbechilbi Richterswil: World’s Largest Turnip Lantern Parade",
        titleDe: "Räbechilbi Richterswil: Grösster Räbeliechtli-Umzug der Welt",
        category: "festival",
        description: "Guinness World Record holding lantern festival! Over 30 tons of carved turnips illuminated by candlelight. Features a magnificent evening parade with illuminated mythical floats, school bands, and glowing village house facades.",
        descriptionDe: "Grösster Räbeliechtli-Umzug der Welt mit über 30 Tonnen geschnitzten, kerzenerleuchteten Räben. Spektakulärer Umzug mit riesigen leuchtenden Sujets, Musikkapellen und märchenhaft beleuchteten Häuserfassaden.",
        locationName: "Village Center Richterswil",
        address: "Dorfplatz, 8805 Richterswil",
        canton: "ZH",
        lat: 47.2081,
        lng: 8.7056,
        startDate: "2026-11-14",
        endDate: "2026-11-14",
        timeText: "Saturday from 15:00 (Grand Parade starts at 18:30)",
        recurrence: "single-day",
        ageMin: 0,
        ageMax: 99,
        ageLabel: "All ages",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Festival pin CHF 10 (Children under 16 free)",
        officialUrl: "https://vvvr.ch/r%C3%A4bechilbi",
        ticketUrl: "https://vvvr.ch/r%C3%A4bechilbi",
        imageUrl: "/images/events/event-raebeliechtli-richterswil.jpg",
        tags: ["tradition", "lanterns", "parade", "autumn", "world-record"],
        organizer: "Verkehrsverein Richterswil",
        source: "curated_swiss_family"
    },
    {
        id: "event-papiliorama-jungle-night",
        title: "Papiliorama & Nocturama: Tropical Jungle & Night Wildlife Expedition",
        titleDe: "Papiliorama & Nocturama: Tropischer Urwald & Nachtsafari",
        category: "animals",
        description: "Walk among 1,000 fluttering tropical butterflies in a lush greenhouse dome, then step into the Nocturama where the daylight is reversed, allowing kids to observe sloths, bats, armadillos, and night monkeys active in their nocturnal habitat.",
        descriptionDe: "Wandeln zwischen über 1'000 schillernden Tropenfaltern im Dschungeldom, danach ins Nocturama eintauchen: Bei umgekehrtem Tag-Nacht-Rhythmus beobachten Kinder Faultiere, Fledermäuse und Nachtaffen bei Mondschein.",
        locationName: "Papiliorama Kerzers",
        address: "Moosmatte 1, 3210 Kerzers",
        canton: "FR",
        lat: 46.9744,
        lng: 7.1895,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Daily 10:00 - 17:00",
        recurrence: "daily",
        ageMin: 1,
        ageMax: 14,
        ageLabel: "All ages (great for toddlers & kids)",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (4–15) CHF 10; Adults CHF 20; Under 4 free",
        officialUrl: "https://www.papiliorama.ch",
        ticketUrl: "https://www.papiliorama.ch/tickets/",
        imageUrl: "/images/events/event-papiliorama-jungle-night.jpg",
        tags: ["animals", "butterflies", "indoor", "rainy-day", "nature", "night-safari"],
        organizer: "Stiftung Papiliorama",
        source: "curated_swiss_family"
    },
    {
        id: "event-aquatis-aquarium-lausanne",
        title: "Aquatis: Europe’s Largest Freshwater Aquarium & Vivarium",
        titleDe: "Aquatis Lausanne: Grösstes Süsswasser-Aquarium Europas",
        category: "animals",
        description: "An extraordinary journey through the 5 continents with 10,000 fish and 100 reptiles and amphibians (including giant Komodo dragons and piranhas). Features interactive digital games, underwater tunnels, and daily feeding workshops for kids.",
        descriptionDe: "Eine Entdeckungsreise durch 5 Kontinente mit 10'000 Fischen und 100 Reptilien und Amphibien. Mit Unterwasser-Glastunneln, interaktiven Touchscreens und täglichen Tierfütterungen für Kinder.",
        locationName: "AQUATIS Aquarium-Vivarium",
        address: "Route de Berne 144, 1010 Lausanne",
        canton: "VD",
        lat: 46.5414,
        lng: 6.6623,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Daily 10:00 - 18:00",
        recurrence: "daily",
        ageMin: 2,
        ageMax: 16,
        ageLabel: "All ages",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (6–15) CHF 19; Adults CHF 29; Children under 6 free",
        officialUrl: "https://www.aquatis.ch",
        ticketUrl: "https://www.aquatis.ch/billetterie",
        imageUrl: "/images/events/event-aquatis-aquarium-lausanne.jpg",
        tags: ["aquarium", "animals", "indoor", "rainy-day", "underwater", "reptiles"],
        organizer: "AQUATIS Lausanne",
        source: "curated_swiss_family"
    },
    {
        id: "event-tierpark-goldau-ranger",
        title: "Natur- und Tierpark Goldau: Junior Ranger & Deer Feeding Zone",
        titleDe: "Natur- und Tierpark Goldau: Junior Ranger & Rehe füttern",
        category: "animals",
        description: "Set in a dramatic rocky landslide forest. Children walk freely amongst sika deer and mouflons feeding them directly out of their hands from special food boxes. Features giant adventure playgrounds and a 30m scenic observation tower.",
        descriptionDe: "Inmitten der gewaltigen Felssturzlandschaft können Kinder Sikahirsche und Mufflons frei aus der Hand füttern. Riesige Erlebnisspielplätze, Picknickplätze mit Grillstellen und ein 30-Meter-Aussichtsturm.",
        locationName: "Natur- und Tierpark Goldau",
        address: "Parkstrasse 40, 6410 Goldau",
        canton: "SZ",
        lat: 47.0501,
        lng: 8.5539,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Daily 09:00 - 17:00 (Summer until 18:00)",
        recurrence: "daily",
        ageMin: 1,
        ageMax: 14,
        ageLabel: "All ages (ideal for toddlers and young kids)",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Children (6–15) CHF 12; Adults CHF 24; Children under 6 free",
        officialUrl: "https://tierpark.ch",
        ticketUrl: "https://tierpark.ch/tickets/",
        imageUrl: "/images/events/event-tierpark-goldau-ranger.jpg",
        tags: ["zoo", "animals", "deer", "playground", "nature", "outdoor", "grill"],
        organizer: "Natur- und Tierpark Goldau",
        source: "curated_swiss_family"
    },
    {
        id: "event-sensorium-ruettihubelbad",
        title: "Sensorium: The Playground of the Senses in the Emmental",
        titleDe: "Sensorium Rüttihubelbad: Das Erfahrungsfeld der Sinne",
        category: "workshop",
        description: "Created following Hugo Kükelhaus's philosophy of sensory exploration. 80 interactive stations test and delight hearing, vision, smell, and balance: giant gongs, rotating optical discs, barefoot sensory paths, and kaleidoscope mirrors.",
        descriptionDe: "Ein faszinierendes Erfahrungsfeld der Sinne im Emmental. 80 Mitmach-Stationen zu Hören, Sehen, Riechen und Tasten: Riesen-Gongs, optische Drehscheiben, Barfusspfad und Spiegellabyrinthe.",
        locationName: "Sensorium Rüttihubelbad",
        address: "Rüttihubel 29, 3512 Walkringen",
        canton: "BE",
        lat: 46.9538,
        lng: 7.6253,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Tues - Sun 10:00 - 17:30",
        recurrence: "daily",
        ageMin: 3,
        ageMax: 99,
        ageLabel: "All ages (from 3 years)",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (6–15) CHF 11; Adults CHF 19; Family ticket CHF 48",
        officialUrl: "https://www.ruettihubelbad.ch/de/sensorium/",
        ticketUrl: "https://www.ruettihubelbad.ch/de/sensorium/preise-und-oeffnungszeiten/",
        imageUrl: "/images/events/event-sensorium-ruettihubelbad.jpg",
        tags: ["sensory", "science", "indoor", "rainy-day", "emmental", "barefoot"],
        organizer: "Stiftung Rüttihubelbad",
        source: "curated_swiss_family"
    },
    {
        id: "event-fifa-museum-family-sundays",
        title: "FIFA Museum: Family Sundays & Interactive Football Lab",
        titleDe: "FIFA Museum: Familien-Sonntag & Interaktives Fussball-Labor",
        category: "sports",
        description: "Explore the history of football with interactive challenges. The giant 'Pinball' ball skills arena lets children test their dribbling, shooting, and reaction speeds, with special family audio guides and mascot challenges every Sunday.",
        descriptionDe: "Fussballgeschichte hautnah erleben. In der riesigen Flipperkasten-Arena testen Kinder ihr Ballgefühl, Passgenauigkeit und Schusskraft. Jeden Sonntag mit speziellen Familien-Workshops und Schnitzeljagd.",
        locationName: "FIFA Museum",
        address: "Seestrasse 27, 8002 Zürich",
        canton: "ZH",
        lat: 47.3629,
        lng: 8.5323,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Tues - Sun 10:00 - 18:00 (Family specials every Sunday)",
        recurrence: "weekends",
        ageMin: 4,
        ageMax: 16,
        ageLabel: "Ages 4–16",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (4–15) CHF 14; Adults CHF 26; Under 4 free",
        officialUrl: "https://www.fifamuseum.com",
        ticketUrl: "https://www.fifamuseum.com/de/tickets",
        imageUrl: "/images/events/event-fifa-museum-family-sundays.jpg",
        tags: ["football", "sports", "indoor", "rainy-day", "interactive", "skills"],
        organizer: "FIFA Museum Zürich",
        source: "curated_swiss_family"
    },
    {
        id: "event-maerlistadt-stein-am-rhein",
        title: "Märlistadt Stein am Rhein: Fairy Tale Medieval Town & Puppet Shows",
        titleDe: "Märlistadt Stein am Rhein: Mittelalterliches Märchenland & Puppentheater",
        category: "seasonal",
        description: "During December, the picturesque medieval town of Stein am Rhein turns into a living fairy tale book. Every shop window tells a classic Grimm fairy tale, with merry-go-rounds, street performers, night watchman tours, and puppet theatre.",
        descriptionDe: "Im Dezember verwandelt sich das historische Städtchen Stein am Rhein in ein lebendiges Märchenbuch. Liebevoll dekorierte Schaufenster erzählen Märchen, mit Karussell, Nachtwächter-Rundgängen und Puppentheater.",
        locationName: "Old Town Stein am Rhein",
        address: "Rathausplatz, 8260 Stein am Rhein",
        canton: "SH",
        lat: 47.6596,
        lng: 8.8596,
        startDate: "2026-12-01",
        endDate: "2026-12-31",
        timeText: "Daily 10:00 - 19:00",
        recurrence: "seasonal",
        ageMin: 2,
        ageMax: 12,
        ageLabel: "All ages (magical for 2–10)",
        isRainyDayFriendly: false,
        isFree: true,
        priceText: "Free admission to town & fairy tale trail",
        officialUrl: "https://www.maerlistadt.ch",
        ticketUrl: "https://www.maerlistadt.ch",
        imageUrl: "/images/events/event-maerlistadt-stein-am-rhein.jpg",
        tags: ["fairy-tale", "winter", "medieval", "christmas", "free", "outdoor"],
        organizer: "Märlistadt Stein am Rhein",
        source: "curated_swiss_family"
    },
    {
        id: "event-chaplins-world-vevey",
        title: "Chaplin's World: The Hollywood Studio & Family Slapstick Adventure",
        titleDe: "Chaplin's World: Hollywood-Filmstudios & Slapstick-Parcours",
        category: "museum",
        description: "Located on Charlie Chaplin's former private estate overlooking Lake Geneva. Children step inside a real Hollywood film studio with interactive sets (Easy Street, The Kid, Modern Times) where they can act in silent movies with funny costumes.",
        descriptionDe: "Auf dem ehemaligen Landsitz von Charlie Chaplin über dem Genfersee. Kinder tauchen in ein echtes Hollywood-Filmstudio ein, verkleiden sich mit Melone und Gehstock und probieren Slapstick-Gags in Filmkulissen aus.",
        locationName: "Chaplin's World by Grévin",
        address: "Route de Fenil 2, 1804 Corsier-sur-Vevey",
        canton: "VD",
        lat: 46.4756,
        lng: 6.8524,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Daily 10:00 - 18:00",
        recurrence: "daily",
        ageMin: 4,
        ageMax: 16,
        ageLabel: "All ages",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (6–15) CHF 19; Adults CHF 29; Children under 6 free",
        officialUrl: "https://www.chaplinsworld.com",
        ticketUrl: "https://www.chaplinsworld.com/billetterie",
        imageUrl: "/images/events/event-chaplins-world-vevey.jpg",
        tags: ["cinema", "hollywood", "interactive", "lake-geneva", "rainy-day"],
        organizer: "Chaplin's World",
        source: "curated_swiss_family"
    },
    {
        id: "event-museum-kommunikation-bern",
        title: "Museum for Communication: Spy Secret Mission & Interactive Games",
        titleDe: "Museum für Kommunikation Bern: Geheimagenten-Mission & Mitmach-Spiele",
        category: "museum",
        description: "Winner of the Council of Europe Museum Prize. Extremely engaging for kids: practice lip-reading, crack secret codes in the spy lab, act as a TV news anchor in a broadcast studio, and play retro video games with parents.",
        descriptionDe: "Ausgezeichnet mit dem Museumspreis des Europarates. Kinder knacken Geheimcodes im Spionage-Labor, moderieren eigene TV-Nachrichten im Fernsehstudio und testen alte und neue Kommunikationsspiele.",
        locationName: "Museum für Kommunikation",
        address: "Helvetiastrasse 16, 3005 Bern",
        canton: "BE",
        lat: 46.9442,
        lng: 7.4497,
        startDate: "2026-10-01",
        endDate: "2027-12-31",
        timeText: "Tues - Sun 10:00 - 17:00",
        recurrence: "daily",
        ageMin: 5,
        ageMax: 16,
        ageLabel: "Ages 5–16",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (6–16) CHF 5; Adults CHF 15; Under 6 free",
        officialUrl: "https://www.mfk.ch",
        ticketUrl: "https://www.mfk.ch/besuch/preise-tickets",
        imageUrl: "/images/events/event-museum-kommunikation-bern.jpg",
        tags: ["communication", "spy", "games", "indoor", "rainy-day", "interactive"],
        organizer: "Museum für Kommunikation",
        source: "curated_swiss_family"
    },
    // --- Christmas & Winter Wonderlands for Kids across Switzerland & Borders ---
    {
        id: "event-maerlitram-zurich",
        title: "Zürcher Märlitram: Fairy Tale Tram Ride with Santa & Angels",
        titleDe: "Zürcher Märlitram: Legendäre Märchenfahrt mit Samichlaus & Engeln",
        category: "festival",
        description: "Zurich's most magical Christmas tradition since 1958! Children (ages 4–10) board the vintage illuminated red tram at Bellevue to hear Christmas fairy tales and sing carols with Santa Claus and two angels during a 20-minute festive ride through the Old Town.",
        descriptionDe: "Zürichs beliebteste Weihnachtstradition seit 1958! Kinder (4–10 Jahre) steigen am Bellevue ins festlich beleuchtete rote Nostalgie-Tram ein und lauschen Weihnachtsgeschichten von Engeln und Samichlaus bei einer 20-minütigen Rundfahrt.",
        locationName: "Bellevue (Märlitram Haltestelle)",
        address: "Bellevueplatz, 8001 Zürich",
        canton: "ZH",
        lat: 47.3670,
        lng: 8.5447,
        startDate: "2026-11-20",
        endDate: "2026-12-24",
        timeText: "Daily 13:20 - 18:40 (rides depart every 25 min)",
        recurrence: "daily",
        ageMin: 4,
        ageMax: 10,
        ageLabel: "Ages 4–10 (Children only)",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "CHF 10 per child (Tickets online via Jelmoli / VBZ)",
        officialUrl: "https://www.jelmoli.ch/maerlitram",
        ticketUrl: "https://www.jelmoli.ch/maerlitram",
        imageUrl: "/images/events/event-maerlitram-zurich.jpg",
        tags: ["christmas", "tram", "fairy-tale", "tradition", "winter", "bellevue"],
        organizer: "VBZ & Jelmoli",
        source: "curated_swiss_family"
    },
    {
        id: "event-montreux-noel-rochers-de-naye",
        title: "Montreux Noël: Lakeside Christmas Market, Flying Santa & Alpine Grotto",
        titleDe: "Montreux Noël: Weihnachtsmarkt am See, Fliegender Weihnachtsmann & Rochers-de-Naye",
        category: "festival",
        description: "One of Europe's most enchanting Christmas markets along Lake Geneva. Featuring the legendary Flying Santa soaring above the lake every evening at 17:00, 18:00, and 19:00, plus the cogwheel train journey to Santa's Grotto high up at Rochers-de-Naye (2,042m).",
        descriptionDe: "Einer der schönsten Weihnachtsmärkte Europas am Ufer des Genfersees mit dem berühmten fliegenden Weihnachtsmann über dem See und der Zahnradbahn hinauf zum Haus des Weihnachtsmanns auf den Rochers-de-Naye (2'042 m).",
        locationName: "Bords du Lac & Rochers-de-Naye",
        address: "Grand-Rue 24, 1820 Montreux",
        canton: "VD",
        lat: 46.4312,
        lng: 6.9107,
        startDate: "2026-11-20",
        endDate: "2026-12-24",
        timeText: "Daily 11:00 - 22:00 (Flying Santa daily 17:00, 18:00, 19:00)",
        recurrence: "seasonal",
        ageMin: 0,
        ageMax: 99,
        ageLabel: "All ages (Family favorite)",
        isRainyDayFriendly: false,
        isFree: true,
        priceText: "Lakeside market: Free; Train to Santa's House (Rochers-de-Naye): Kids CHF 19, Adults CHF 39",
        officialUrl: "https://www.montreuxnoel.com",
        ticketUrl: "https://www.montreuxnoel.com/en-17-the-house-of-santa-claus.html",
        imageUrl: "/images/events/event-montreux-noel-rochers-de-naye.jpg",
        tags: ["christmas-market", "flying-santa", "lake-geneva", "winter", "train", "alps"],
        organizer: "Montreux Noël",
        source: "curated_swiss_family"
    },
    {
        id: "event-basel-maerchenwald-weihnachtsmarkt",
        title: "Basler Märchenwald: Children's Fairy Tale Forest at Münsterplatz",
        titleDe: "Basler Märchenwald auf dem Münsterplatz & Basler Weihnachtsmarkt",
        category: "workshop",
        description: "Basel's Münsterplatz transforms into a magical glowing forest where children bake gingerbread, dip real beeswax candles, cast pewter, shape molten iron with a blacksmith, make hot chocolate, and ride the nostalgic forest train.",
        descriptionDe: "Der Basler Münsterplatz verwandelt sich in einen zauberhaften Märchenwald für Kinder: Lebkuchen verzieren, Kerzenziehen, Zinngiessen, Schmieden, Heisse Schokolade rühren und mit der Nostalgieeisenbahn fahren.",
        locationName: "Münsterplatz Basel",
        address: "Münsterplatz, 4051 Basel",
        canton: "BS",
        lat: 47.5564,
        lng: 7.5925,
        startDate: "2026-11-26",
        endDate: "2026-12-23",
        timeText: "Mo–Fr 13:30–19:00, Sa–Su 12:00–19:00",
        recurrence: "seasonal",
        ageMin: 2,
        ageMax: 14,
        ageLabel: "Ages 2–14",
        isRainyDayFriendly: false,
        isFree: true,
        priceText: "Forest entry free; Workshop tokens CHF 5–10 per craft activity",
        officialUrl: "https://www.basel.com/de/veranstaltungen/weihnachten/basler-maerchenwald",
        ticketUrl: "https://www.basel.com/de/veranstaltungen/weihnachten/basler-maerchenwald",
        imageUrl: "/images/events/event-basel-maerchenwald-weihnachtsmarkt.jpg",
        tags: ["crafts", "christmas", "fairy-tale", "workshop", "baking", "basel"],
        organizer: "Basler Weihnachtsmarkt",
        source: "curated_swiss_family"
    },
    {
        id: "event-berner-sternenmarkt-kleine-schanze",
        title: "Berner Sternenmarkt: Kids' Winter Village & Story Hut (Gschichtehüsli)",
        titleDe: "Berner Sternenmarkt: Kinderdorf & Gschichtehüsli auf der Kleinen Schanze",
        category: "festival",
        description: "Set in the scenic Kleine Schanze park above Bern station, this market boasts a heated children's village with an animated carousel, Gschichtehüsli (storytelling hut), craft stations, and Swiss family fondue chalets with views of the snow-clad Bernese Alps.",
        descriptionDe: "In der Parkanlage Kleine Schanze erwartet Familien ein eigenes Kinderdorf mit Gschichtehüsli, historischem Karussell, Bastelstationen und gemütlichen Familien-Fonduechalets mit Berner Alpenpanorama.",
        locationName: "Kleine Schanze Bern",
        address: "Kleine Schanze, 3011 Bern",
        canton: "BE",
        lat: 46.9463,
        lng: 7.4398,
        startDate: "2026-11-21",
        endDate: "2026-12-24",
        timeText: "Mo–Sa 11:00–22:00, Su 11:00–20:00",
        recurrence: "seasonal",
        ageMin: 0,
        ageMax: 99,
        ageLabel: "All ages",
        isRainyDayFriendly: false,
        isFree: true,
        priceText: "Market entry free; Carousel & activities CHF 3–6",
        officialUrl: "https://bernersternenmarkt.ch",
        ticketUrl: "https://bernersternenmarkt.ch",
        imageUrl: "/images/events/event-berner-sternenmarkt-kleine-schanze.jpg",
        tags: ["christmas-market", "carousel", "storytelling", "bern", "winter", "food"],
        organizer: "Berner Sternenmarkt",
        source: "curated_swiss_family"
    },
    {
        id: "event-zauberwald-lenzerheide",
        title: "Zauberwald Lenzerheide: Illuminated Magic Forest & Live Kids Shows",
        titleDe: "Zauberwald Lenzerheide: Magische Lichtkunst & Kinderkonzerte",
        category: "festival",
        description: "An extraordinary open-air winter wonderland in the squirrel forest of Lenzerheide! Spectacular light installations, crackling campfires, culinary market chalets, and dedicated live afternoon concerts for children featuring top Swiss family performers.",
        descriptionDe: "Ein einzigartiges Winterwunderland im Eichhörnliwald Lenzerheide mit faszinierenden Lichtinstallationen, knisternden Lagerfeuern, Genuss-Chalets und mitreissenden Nachmittags-Konzerten für Kinder.",
        locationName: "Eichhörnliwald Lenzerheide",
        address: "Voa Principala 37, 7078 Lenzerheide",
        canton: "GR",
        lat: 46.7570,
        lng: 9.5583,
        startDate: "2026-12-11",
        endDate: "2027-01-03",
        timeText: "Daily 17:00 - 22:00",
        recurrence: "seasonal",
        ageMin: 0,
        ageMax: 99,
        ageLabel: "All ages",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Children (0–11) Free; Teens (12–15) CHF 15; Adults CHF 24",
        officialUrl: "https://zauberwald-lenzerheide.ch",
        ticketUrl: "https://zauberwald-lenzerheide.ch/tickets",
        imageUrl: "/images/events/event-zauberwald-lenzerheide.jpg",
        tags: ["light-show", "alps", "concert", "kids-music", "winter", "forest"],
        organizer: "Verein Zauberwald Lenzerheide",
        source: "curated_swiss_family"
    },
    {
        id: "event-luzerner-christkindlimarkt-live-on-ice",
        title: "Lucerne Christmas Market & 'Live On Ice' Skating by the Lake",
        titleDe: "Luzerner Christkindlimarkt & Live on Ice beim KKL",
        category: "festival",
        description: "Franziskanerplatz glows with life-sized nativity scenes, carousel rides, and spicy cinnamon aromas, while Europaplatz in front of the Jean Nouvel KKL building hosts an open-air ice rink directly on the shores of Lake Lucerne with mountain views.",
        descriptionDe: "Am Franziskanerplatz leuchten lebensgrosse Krippenfiguren und Nostalgiekarussells, während am Europaplatz direkt vor dem KKL eine stimmungsvolle Eislaufbahn mit Blick auf den Vierwaldstättersee lockt.",
        locationName: "Franziskanerplatz & KKL Europaplatz",
        address: "Franziskanerplatz 1, 6003 Luzern",
        canton: "LU",
        lat: 47.0502,
        lng: 8.3093,
        startDate: "2026-11-28",
        endDate: "2026-12-23",
        timeText: "Daily 11:00 - 20:00 (Ice rink open until 22:00)",
        recurrence: "seasonal",
        ageMin: 0,
        ageMax: 99,
        ageLabel: "All ages",
        isRainyDayFriendly: false,
        isFree: true,
        priceText: "Market: Free; Ice skating rink: Kids CHF 6, Adults CHF 9, Skate rental available",
        officialUrl: "https://www.weihnachtsmarkt-luzern.com",
        ticketUrl: "https://www.weihnachtsmarkt-luzern.com",
        imageUrl: "/images/events/event-luzerner-christkindlimarkt-live-on-ice.jpg",
        tags: ["christmas-market", "ice-skating", "lake-lucerne", "carousel", "kkl", "winter"],
        organizer: "Luzerner Weihnachtsmarkt & KKL",
        source: "curated_swiss_family"
    },
    {
        id: "event-ice-magic-interlaken",
        title: "Ice Magic Interlaken: Gliding Ice Rink Trails & Children's Play Rink",
        titleDe: "Ice Magic Interlaken: Eislauf-Erlebniswelt & Kinder-Eisbahn",
        category: "outdoor",
        description: "A spectacular winter ice experience in the center of Interlaken: five illuminated ice skating rinks linked by 450 meters of winding ice runways across the Höhematte with views of the Jungfrau. Features an exclusive slow rink with supportive penguin aids for beginners.",
        descriptionDe: "Ein spektakuläres Eiserlebnis im Zentrum von Interlaken: Fünf illuminierte Eisflächen, verbunden durch 450 Meter gewundene Eiswege auf der Höhematte mit Blick auf die Jungfrau. Inklusive Pinguin-Lernfeld für Kleinkinder.",
        locationName: "Höhematte Interlaken",
        address: "Höheweg, 3800 Interlaken",
        canton: "BE",
        lat: 46.6863,
        lng: 7.8632,
        startDate: "2026-12-14",
        endDate: "2027-02-27",
        timeText: "Daily 10:00 - 22:00",
        recurrence: "daily",
        ageMin: 2,
        ageMax: 99,
        ageLabel: "All ages (Penguin aids available for toddlers)",
        isRainyDayFriendly: false,
        isFree: false,
        priceText: "Children (4–15) CHF 9; Adults CHF 13; Skate rental CHF 9",
        officialUrl: "https://www.icemagic.ch",
        ticketUrl: "https://www.icemagic.ch/tickets",
        imageUrl: "/images/events/event-ice-magic-interlaken.jpg",
        tags: ["ice-skating", "winter", "jungfrau", "outdoor", "family-fun", "interlaken"],
        organizer: "Ice Magic Interlaken",
        source: "curated_swiss_family"
    },
    {
        id: "event-noel-medieval-chateau-chillon",
        title: "Chillon Castle: Medieval Christmas & Children's Craft Workshops",
        titleDe: "Schloss Chillon: Mittelalterliche Weihnacht & Kinder-Workshops",
        category: "festival",
        description: "Step back into the Middle Ages inside Switzerland's most legendary lakeside castle! During December weekends, Chillon comes alive with fire dancers, medieval lute music, historical storytellers, blacksmith demonstrations, and hands-on wax and pottery workshops for children.",
        descriptionDe: "Reise ins Mittelalter in der berühmtesten Wasserburg der Schweiz! An Dezember-Wochenenden erwacht Schloss Chillon mit Feuertänzern, mittelalterlicher Musik, Geschichtenerzählern und Mitmach-Workshops für Kinder zum Leben.",
        locationName: "Château de Chillon",
        address: "Avenue de Chillon 21, 1820 Veytaux",
        canton: "VD",
        lat: 46.4142,
        lng: 6.9275,
        startDate: "2026-11-28",
        endDate: "2026-12-20",
        timeText: "Saturdays & Sundays 10:00 - 17:00",
        recurrence: "weekend",
        ageMin: 3,
        ageMax: 14,
        ageLabel: "Ages 3–14",
        isRainyDayFriendly: true,
        isFree: false,
        priceText: "Children (6–15) CHF 6; Adults CHF 15; Family Pass CHF 35",
        officialUrl: "https://www.chillon.ch",
        ticketUrl: "https://www.chillon.ch/en/agenda/family-events/",
        imageUrl: "/images/events/event-noel-medieval-chateau-chillon.jpg",
        tags: ["castle", "medieval", "christmas", "history", "lake-geneva", "workshops"],
        organizer: "Fondation du Château de Chillon",
        source: "curated_swiss_family"
    },
    {
        id: "event-colmar-noel-des-enfants-petite-venise",
        title: "Colmar Christmas Markets: Children's Fairytale Village in Petite Venise",
        titleDe: "Colmarer Weihnachtsmarkt: Kinder-Weihnachtsdorf in Petite Venise",
        category: "festival",
        description: "Just 45 minutes from Basel by direct train across the border: the historic Petite Venise district of Colmar transforms into a gingerbread fairy tale. Features an animated nativity, an enchanted wooden carousel, and the giant mailbox for Santa letters with live replies.",
        descriptionDe: "Nur 45 Minuten von Basel entfernt: Das malerische Viertel Petite Venise in Colmar verwandelt sich in ein zauberhaftes Kinderparadies mit animierter Krippe, historischem Karussell und dem Riesen-Briefkasten an den Weihnachtsmann.",
        locationName: "Petite Venise Colmar (French-Swiss Border Region)",
        address: "Place des Six-Montagnes, 68000 Colmar, France",
        canton: "BS",
        lat: 48.0743,
        lng: 7.3582,
        startDate: "2026-11-26",
        endDate: "2026-12-29",
        timeText: "Daily 11:00 - 19:00 (Fr–Su until 20:00)",
        recurrence: "seasonal",
        ageMin: 0,
        ageMax: 99,
        ageLabel: "All ages (Easy border day trip)",
        isRainyDayFriendly: false,
        isFree: true,
        priceText: "Free entry to market; SBB / TER train runs direct from Basel SBB (44 min)",
        officialUrl: "https://www.noel-colmar.com",
        ticketUrl: "https://www.noel-colmar.com",
        imageUrl: "/images/events/event-colmar-noel-des-enfants-petite-venise.jpg",
        tags: ["christmas-market", "alsace", "border-trip", "fairy-tale", "carousel", "winter"],
        organizer: "Office de Tourisme de Colmar",
        source: "curated_swiss_family"
    }
];

// --- Live Collector for Zürich Tourismus Open Data ---
async function fetchZurichTourismEvents() {
    const events = [];
    try {
        console.log('[Collector] Fetching Child-friendly venues & activities from Zürich Tourismus Open Data...');
        // id 10004: Kinderfreundlich (Child-friendly)
        const res = await fetch('https://www.zuerich.com/en/api/v2/data?id=10004', {
            headers: { 'User-Agent': 'SwissKidsSpots-EventCollector/1.0 (+https://swissforkids.ch)' }
        });
        if (!res.ok) {
            console.warn(`[Collector] Zürich Tourismus returned HTTP ${res.status}`);
            return events;
        }

        const items = await res.json();
        if (!Array.isArray(items)) return events;

        for (const item of items) {
            if (!item.name || !item.geoCoordinates) continue;

            const nameEn = (item.name && item.name.en) ? item.name.en.trim() : (item.name.de || '').trim();
            const nameDe = (item.name && item.name.de) ? item.name.de.trim() : nameEn;
            const descEn = (item.disambiguatingDescription && item.disambiguatingDescription.en)
                ? item.disambiguatingDescription.en.trim()
                : (item.description && item.description.en ? item.description.en.trim() : '');
            const descDe = (item.disambiguatingDescription && item.disambiguatingDescription.de)
                ? item.disambiguatingDescription.de.trim()
                : (item.description && item.description.de ? item.description.de.trim() : descEn);

            const addressObj = item.address || {};
            const street = addressObj.streetAddress || '';
            const zip = addressObj.postalCode || '';
            const city = addressObj.addressLocality || 'Zürich';
            const fullAddress = [street, `${zip} ${city}`].filter(Boolean).join(', ');

            // Accurately resolve canton from postal code
            const canton = resolveCantonFromAddress(fullAddress, 'ZH');

            // Extract images (single main image and full photo gallery)
            const photoList = [];
            if (item.image && item.image.url) photoList.push(item.image.url);
            if (Array.isArray(item.photo)) {
                item.photo.forEach(p => {
                    if (p && p.url && !photoList.includes(p.url)) photoList.push(p.url);
                });
            }
            const img = photoList[0] || '';
            const images = photoList.length > 0 ? photoList : (img ? [img] : []);

            // Extract price summary from HTML or string
            let priceText = 'See official site';
            if (item.price) {
                if (typeof item.price === 'string') priceText = item.price.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                else if (item.price.en) priceText = item.price.en.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                else if (item.price.de) priceText = item.price.de.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (priceText.length > 90) priceText = priceText.slice(0, 90) + '...';
            }

            const eventObj = {
                id: `event-zt-${item.identifier}`,
                title: nameEn,
                titleDe: nameDe,
                category: "museum",
                description: descEn,
                descriptionDe: descDe,
                locationName: nameEn,
                address: fullAddress || 'Zürich, Switzerland',
                canton: canton,
                lat: Number(item.geoCoordinates.latitude),
                lng: Number(item.geoCoordinates.longitude),
                startDate: "2026-10-01",
                endDate: "2027-12-31",
                timeText: "Regular opening hours",
                recurrence: "daily",
                ageMin: 3,
                ageMax: 16,
                ageLabel: "Kids & Families",
                isRainyDayFriendly: true,
                isFree: false,
                priceText: priceText,
                officialUrl: (addressObj.url) ? addressObj.url : `https://www.zuerich.com/en/detail/${item.identifier}`,
                ticketUrl: (addressObj.url) ? addressObj.url : `https://www.zuerich.com/en/detail/${item.identifier}`,
                imageUrl: img,
                images: images,
                tags: ["zurich-tourism", "child-friendly", "indoor", "family-activity"],
                organizer: "Zürich Tourismus",
                source: "zuerich_tourism"
            };

            events.push(eventObj);
        }
        console.log(`[Collector] Processed ${events.length} activities from Zürich Tourismus.`);
    } catch (err) {
        console.error('[Collector] Error fetching Zürich Tourismus events:', err.message);
    }
    return events;
}

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// --- Eventfrog Public API Connector (Active when EVENTFROG_API_KEY is available) ---
async function fetchEventfrogEvents() {
    const apiKey = process.env.EVENTFROG_API_KEY;
    if (!apiKey) {
        console.log('[Collector] No EVENTFROG_API_KEY found in environment (skipping Eventfrog live API call).');
        return [];
    }

    try {
        console.log('[Collector] Fetching events from Eventfrog Public API...');
        // Query official children & family rubrics:
        // 48 (Familienveranstaltungen), 51 (Kinderfest), 52 (Kinderführung), 53 (Kinderparty),
        // 54 (Kindertheater), 55 (Kinderzirkus), 99 (Familienweiterbildung), 117 (Kinderflohmarkt), 906 (Kinderveranstaltungen)
        const rubrics = [48, 51, 52, 53, 54, 55, 99, 117, 906];
        const rubricQuery = rubrics.map(r => 'rubId=' + r).join('&');
        const now = new Date().toISOString();
        const future = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
        const url = `https://api.eventfrog.net/api/v1/events.json?apiKey=${apiKey}&country=CH&${rubricQuery}&from=${encodeURIComponent(now)}&to=${encodeURIComponent(future)}&perPage=250`;

        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
            console.warn(`[Collector] Eventfrog returned HTTP ${res.status}: ${res.statusText}`);
            return [];
        }

        const data = await res.json();
        const rawEvents = data.events || [];
        console.log(`[Collector] Eventfrog returned ${rawEvents.length} raw events (total available: ${data.totalNumberOfResources || rawEvents.length}).`);

        // Collect unique location IDs
        const locIdSet = new Set();
        for (const ev of rawEvents) {
            if (ev.locationIds && Array.isArray(ev.locationIds)) {
                for (const id of ev.locationIds) {
                    if (id) locIdSet.add(id);
                }
            }
        }

        // Batch fetch locations in chunks of 40 to avoid long query strings
        const locIds = Array.from(locIdSet);
        const locationMap = new Map();
        const BATCH_SIZE = 40;
        for (let i = 0; i < locIds.length; i += BATCH_SIZE) {
            const batch = locIds.slice(i, i + BATCH_SIZE);
            const locUrl = `https://api.eventfrog.net/api/v1/locations.json?apiKey=${apiKey}&id=${batch.join('&id=')}`;
            try {
                const locRes = await fetch(locUrl);
                if (locRes.ok) {
                    const locData = await locRes.json();
                    const locs = locData.locations || [];
                    for (const l of locs) {
                        locationMap.set(String(l.id), l);
                    }
                }
            } catch (e) {
                console.warn('[Collector] Eventfrog batch location fetch warning:', e.message);
            }
        }
        console.log(`[Collector] Eventfrog mapped ${locationMap.size} locations.`);

        const events = [];
        for (const ev of rawEvents) {
            if (!ev.title || ev.cancelled === true) continue;
            const titleDe = (ev.title.de || ev.title.en || ev.title.fr || '').trim();
            const titleEn = (ev.title.en || ev.title.de || ev.title.fr || '').trim();
            if (!titleDe) continue;

            let loc = null;
            if (ev.locationIds && ev.locationIds.length > 0) {
                loc = locationMap.get(String(ev.locationIds[0]));
            }

            const locName = loc ? (loc.title?.de || loc.title?.en || loc.title?.fr || loc.city || 'Switzerland') : 'Switzerland';
            const street = loc ? (loc.addressLine || '') : '';
            const zip = loc ? (loc.zip || '') : '';
            const city = loc ? (loc.city || '') : '';
            const fullAddress = [street, `${zip} ${city}`.trim()].filter(Boolean).join(', ') || 'Switzerland';

            let canton = 'ZH';
            if (loc && loc.zip && postalCodes[loc.zip] && postalCodes[loc.zip].canton) {
                canton = postalCodes[loc.zip].canton;
            } else {
                canton = resolveCantonFromAddress(fullAddress, 'ZH');
            }

            let category = 'event';
            if (ev.rubricId === 54) category = 'theatre';
            else if (ev.rubricId === 51) category = 'festival';
            else if (ev.rubricId === 55) category = 'circus';
            else if (ev.rubricId === 52) category = 'workshop';
            else if (ev.rubricId === 117) category = 'market';
            else if (ev.rubricId === 48 || ev.rubricId === 906) category = 'family';

            let desc = ev.shortDescription?.de || ev.shortDescription?.en || '';
            if (!desc && ev.descriptionAsHTML) {
                desc = stripHtml(ev.descriptionAsHTML.de || ev.descriptionAsHTML.en || '');
                if (desc.length > 300) desc = desc.slice(0, 297) + '...';
            }

            let timeText = 'Check event details';
            if (ev.begin) {
                try {
                    const d = new Date(ev.begin);
                    const timeStr = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });
                    timeText = `From ${timeStr}`;
                } catch (e) {}
            }

            let priceText = 'See tickets';
            if (ev.soldOut) priceText = 'Sold out';
            else if (ev.littleTicketsLeft) priceText = 'Tickets selling fast';
            else if (ev.presaleLink) priceText = 'Tickets available';

            events.push({
                id: `event-ef-${ev.id}`,
                title: titleEn || titleDe,
                titleDe: titleDe,
                category: category,
                description: desc || titleDe,
                descriptionDe: desc || titleDe,
                locationName: locName,
                address: fullAddress,
                canton: canton,
                lat: (loc && loc.lat) ? Number(loc.lat) : 47.3769,
                lng: (loc && loc.lng) ? Number(loc.lng) : 8.5417,
                startDate: ev.begin ? ev.begin.slice(0, 10) : '2026-11-12',
                endDate: ev.end ? ev.end.slice(0, 10) : (ev.begin ? ev.begin.slice(0, 10) : '2026-11-12'),
                timeText: timeText,
                recurrence: 'single-day',
                ageMin: 0,
                ageMax: 16,
                ageLabel: 'Kids & Family',
                isRainyDayFriendly: true,
                isFree: false,
                priceText: priceText,
                officialUrl: ev.url || 'https://eventfrog.ch',
                ticketUrl: ev.presaleLink || ev.url || 'https://eventfrog.ch',
                imageUrl: (ev.emblemToShow && ev.emblemToShow.url) ? ev.emblemToShow.url : '',
                tags: ["eventfrog", "kids-events", "family-activity", category],
                organizer: ev.organizerName || 'Eventfrog Organizer',
                source: "eventfrog"
            });
        }

        console.log(`[Collector] Processed ${events.length} valid events from Eventfrog.`);
        return events;
    } catch (e) {
        console.error('[Collector] Eventfrog fetch error:', e.message);
        return [];
    }
}

// --- Main Aggregation and Export Routine ---
async function collectAndSaveEvents() {
    console.log('====================================================');
    console.log(' [SwissKidsSpots] Ingesting Kids & Family Events... ');
    console.log('====================================================');

    const [ztEvents, efEvents] = await Promise.all([
        fetchZurichTourismEvents(),
        fetchEventfrogEvents()
    ]);

    // Combine all sources: Curated Swiss Events + Live Zürich Tourism + Eventfrog
    const allEventsMap = new Map();

    // Map curated multi-photo galleries for major Swiss festivals and Christmas markets
    const CURATED_GALLERIES = {
        "event-montreux-noel-rochers-de-naye": [
            "/images/events/event-montreux-noel-rochers-de-naye.jpg",
            "https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1576919228236-a097c32a5cd4?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-basel-maerchenwald-weihnachtsmarkt": [
            "/images/events/event-basel-maerchenwald-weihnachtsmarkt.jpg",
            "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1513297887119-d46091b24bfa?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1576692155415-95f820a2c4c1?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-maerlitram-zurich": [
            "/images/events/event-maerlitram-zurich.jpg",
            "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1576723417715-6b408c988c23?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1543589077-47d81606c1bf?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-illuminarium-zurich": [
            "/images/events/event-illuminarium-zurich.jpg",
            "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1576692155415-95f820a2c4c1?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-berner-sternenmarkt-kleine-schanze": [
            "/images/events/event-berner-sternenmarkt-kleine-schanze.jpg",
            "https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1576692155415-95f820a2c4c1?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-zt-152272": [
            "https://www.zuerich.com/sites/default/files/keyvisual/web_zurich_einsiedeln_weihnachtsmarkt_01.jpg",
            "https://www.zuerich.com/sites/default/files/keyvisual/web_zurich_einsiedeln_lebkuchenmuseum_03.jpg",
            "https://images.unsplash.com/photo-1576692155415-95f820a2c4c1?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-luzerner-christkindlimarkt-live-on-ice": [
            "/images/events/event-luzerner-christkindlimarkt-live-on-ice.jpg",
            "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-maerlistadt-stein-am-rhein": [
            "/images/events/event-maerlistadt-stein-am-rhein.jpg",
            "https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1576692155415-95f820a2c4c1?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1512389142860-9c449e58a543?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-zauberwald-lenzerheide": [
            "/images/events/event-zauberwald-lenzerheide.jpg",
            "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1576692155415-95f820a2c4c1?auto=format&fit=crop&w=1200&q=80"
        ],
        "event-zauberpark-zurich-airport": [
            "/images/events/event-zauberpark-zurich-airport.jpg",
            "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1543258103-a62bdc069871?auto=format&fit=crop&w=1200&q=80"
        ]
    };

    // 1. Add Curated Registry (with postal code canton verification and galleries)
    for (const ev of CURATED_SWISS_EVENTS) {
        ev.canton = resolveCantonFromAddress(ev.address, ev.canton);
        if (CURATED_GALLERIES[ev.id]) {
            ev.images = CURATED_GALLERIES[ev.id];
            ev.imageUrl = ev.images[0];
        } else if (!ev.images || ev.images.length === 0) {
            ev.images = ev.imageUrl ? [ev.imageUrl] : [];
        }
        allEventsMap.set(ev.id, ev);
    }

    // 2. Add Live Zürich Tourismus
    for (const ev of ztEvents) {
        if (!allEventsMap.has(ev.id)) {
            allEventsMap.set(ev.id, ev);
        }
    }

    // 3. Add Eventfrog
    for (const ev of efEvents) {
        if (!allEventsMap.has(ev.id)) {
            allEventsMap.set(ev.id, ev);
        }
    }

    const aggregated = Array.from(allEventsMap.values());

    // Sort: Featured / upcoming events first
    aggregated.sort((a, b) => {
        if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
        return a.title.localeCompare(b.title);
    });

    const outputPath = path.join(__dirname, 'events.json');

    // Production safety guard:
    // If the host environment lacks EVENTFROG_API_KEY or the new collection is suspiciously small (< 60)
    // while the existing file on disk already contains a rich event set, NEVER overwrite and discard the rich dataset!
    if (fs.existsSync(outputPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
            if (Array.isArray(existing) && existing.length > aggregated.length && (!process.env.EVENTFROG_API_KEY || aggregated.length < 60)) {
                console.warn(`[Collector] Safety Guard: Preserving existing events.json (${existing.length} events) over smaller collection (${aggregated.length} events) because EVENTFROG_API_KEY is not configured or returned zero results.`);
                return existing;
            }
        } catch (e) {
            console.warn('[Collector] Could not check existing events.json for safety comparison:', e.message);
        }
    }

    fs.writeFileSync(outputPath, JSON.stringify(aggregated, null, 2), 'utf-8');

    console.log(`[Success] Saved ${aggregated.length} Swiss kids events into ${outputPath}`);
    console.log('Distribution by Canton:');
    const cantonCounts = {};
    for (const ev of aggregated) {
        cantonCounts[ev.canton] = (cantonCounts[ev.canton] || 0) + 1;
    }
    console.table(cantonCounts);

    return aggregated;
}

if (require.main === module) {
    collectAndSaveEvents().catch(err => {
        console.error('Fatal collection error:', err);
        process.exit(1);
    });
}

module.exports = {
    collectAndSaveEvents,
    CURATED_SWISS_EVENTS,
    resolveCantonFromAddress
};
