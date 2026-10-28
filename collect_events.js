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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/02/pt_38349-1200x899.jpg",
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
        imageUrl: "https://www.zuerich.com/sites/default/files/styles/sharing/public/image/2023/web_zuerich_illuminarium_landesmuseum_1280x960_43290.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/technorama_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/verkehrshaus_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/technorama_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/muehlerama_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/verkehrshaus_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/tierpark_goldau_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/muehlerama_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/muehlerama_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2022/10/kerzenziehen_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2022/10/raebechilbi_richterswil_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/papiliorama_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/aquatis_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/tierpark_goldau_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/sensorium_1-1200x900.jpg",
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
        imageUrl: "https://www.zuerich.com/sites/default/files/image/2021/web_zuerich_fifa_museum_1280x960_43015.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2022/10/maerlistadt_stein_am_rhein_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/chaplins_world_1-1200x900.jpg",
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
        imageUrl: "https://kinderregion.ch/wp-content/uploads/2021/04/museum_kommunikation_1-1200x900.jpg",
        tags: ["communication", "spy", "games", "indoor", "rainy-day", "interactive"],
        organizer: "Museum für Kommunikation",
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

            // Extract image
            let img = '';
            if (item.image && item.image.url) img = item.image.url;
            else if (item.photo && item.photo[0] && item.photo[0].url) img = item.photo[0].url;

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

// --- Eventfrog Public API Connector (Active when EVENTFROG_API_KEY is available) ---
async function fetchEventfrogEvents() {
    const apiKey = process.env.EVENTFROG_API_KEY;
    if (!apiKey) {
        console.log('[Collector] No EVENTFROG_API_KEY found in environment (skipping Eventfrog live API call).');
        return [];
    }

    try {
        console.log('[Collector] Fetching events from Eventfrog Public API...');
        const res = await fetch('https://api.eventfrog.net/public/v1/events?perPage=50', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            }
        });
        if (!res.ok) {
            console.warn(`[Collector] Eventfrog returned HTTP ${res.status}`);
            return [];
        }
        const data = await res.json();
        const events = [];
        const rawEvents = data.events || data || [];
        for (const ev of rawEvents) {
            if (!ev.title) continue;
            const fullAddress = ev.location ? `${ev.location.street || ''}, ${ev.location.zip || ''} ${ev.location.city || ''}` : 'Switzerland';
            const canton = ev.location ? (ev.location.canton || resolveCantonFromAddress(fullAddress, 'ZH')) : 'ZH';
            events.push({
                id: `event-ef-${ev.id}`,
                title: ev.title,
                titleDe: ev.title,
                category: "event",
                description: ev.description || ev.title,
                descriptionDe: ev.description || ev.title,
                locationName: ev.location ? ev.location.name : 'Switzerland',
                address: fullAddress,
                canton: canton,
                lat: ev.location && ev.location.lat ? Number(ev.location.lat) : 47.3769,
                lng: ev.location && ev.location.lng ? Number(ev.location.lng) : 8.5417,
                startDate: ev.startDate || '2026-11-01',
                endDate: ev.endDate || ev.startDate || '2026-11-01',
                timeText: ev.startTime || 'Check website',
                recurrence: 'single-day',
                ageMin: 0,
                ageMax: 16,
                ageLabel: 'Kids & Family',
                isRainyDayFriendly: true,
                isFree: ev.isFree || false,
                priceText: ev.priceText || (ev.isFree ? 'Free' : 'See ticket link'),
                officialUrl: ev.url || 'https://eventfrog.ch',
                ticketUrl: ev.ticketUrl || ev.url || 'https://eventfrog.ch',
                imageUrl: ev.imageUrl || '',
                tags: ["eventfrog", "kids", "tickets"],
                organizer: ev.organizer ? ev.organizer.name : 'Eventfrog Organizer',
                source: "eventfrog"
            });
        }
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

    // 1. Add Curated Registry (with postal code canton verification)
    for (const ev of CURATED_SWISS_EVENTS) {
        ev.canton = resolveCantonFromAddress(ev.address, ev.canton);
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
