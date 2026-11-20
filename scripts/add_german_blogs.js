const fs = require('fs');
const path = require('path');

const blogPostsPath = path.join(__dirname, '..', 'blog_posts.js');
let blogs = require(blogPostsPath);

// Map of translations for existing English posts
const translationMap = {
  'rainy-day-children-activities-zurich': 'ausfluege-kinder-zuerich-schlechtwetter',
  'indoor-playzones-zurich': 'indoor-spielplaetze-zuerich',
  'top-mineral-baths-thermal-spas-families-switzerland': 'thermalbaeder-mineralbaeder-familien-schweiz',
  'indoor-playzones-bern': 'indoor-spielplaetze-bern',
  'indoor-playzones-lucerne': 'indoor-spielplaetze-luzern',
  'indoor-playzones-basel': 'indoor-spielplaetze-basel'
};

// Update existing English posts with lang: 'en' and translationSlug
blogs.forEach(post => {
  if (!post.lang) post.lang = 'en';
  if (translationMap[post.slug]) {
    post.translationSlug = translationMap[post.slug];
  }
});

// German Blog 1: Zürich Schlechtwetter & Indoor (28 Spots)
const zurichRainyEn = blogs.find(b => b.slug === 'rainy-day-children-activities-zurich');
const zurichRainyDe = {
  slug: 'ausfluege-kinder-zuerich-schlechtwetter',
  lang: 'de',
  translationSlug: 'rainy-day-children-activities-zurich',
  title: '28 beste Ausflugsziele für Kinder in Zürich & Umgebung bei Regen (Guide 2026)',
  subtitle: 'Von tropischen Regenwäldern und interaktiven Science Centern bis zu riesigen Kletterburgen, Schoggi-Degustationen und warmen Thermalbädern in der Region Zürich.',
  metaDescription: 'Entdecke 28 geniale Ausflugsziele bei Regen für Kinder in Zürich und Umgebung: Interaktive Science Center, Tropenhäuser, Dinosaurier, Schoggi-Welten, Thermalbäder und Indoor-Spielplätze mit ÖV-Tipps.',
  category: 'Schlechtwetter & Indoor · Zürich',
  readTime: '15 Min. Lesezeit',
  publishedAt: '2026-11-20',
  heroImage: 'https://media.zuerich.com/image/727218228053/image_m34j8n3ctv1ef_2020-09-03_lindt_home_of_chocolate_e0129-ret-rgb.jpg',
  intro: 'Wenn kalter Nebel über den Zürichsee zieht, winterliches Grau dominiert oder plötzliche Frühlingsregenschauer das Wochenende treffen, droht zu Hause schnell der Lagerkoller. Zum Glück bietet der Grossraum Zürich eine der vielseitigsten Ausflugsszenen Europas für Familien bei Schlechtwetter. Ob tropische 28°C im Regenwald, spektakuläre Hochspannungs-Experimente, rasante Wasserrutschen, Trampolinparks oder dampfende Thermalbäder mit Blick über die Zürcher Altstadt – dieser praxiserprobte Guide stellt die 28 besten Indoor-Ziele in Zürich, Winterthur, Dietikon und Umgebung vor, inklusive genauer SBB-Verbindungen, Altersempfehlungen und echten Eltern-Tipps.',
  table: {
    title: '28 Zürcher Schlechtwetter-Ausflugsziele auf einen Blick',
    headers: ['Ausflugsziel', 'Standort', 'Kategorie', 'Ideales Alter', 'Schlechtwetter-Highlight'],
    rows: [
      ['Technorama', 'Winterthur', 'Science Center', 'Alle Altersstufen (3–18)', '500+ interaktive Experimentierstationen'],
      ['Lindt Home of Chocolate', 'Kilchberg', 'Schoggi-Museum', 'Alle Altersstufen', '9m Schokoladenbrunnen & unbegrenzte Degustation'],
      ['Zoo Zürich (Masoala & Lewa)', 'Zürichberg', 'Indoor-Dschungel', 'Alle Altersstufen', 'Warmer 28°C Tropenwald mit freilebenden Lemuren'],
      ['Alpamare Wasserpark', 'Pfäffikon SZ', 'Erlebnisbad', '3–16 Jahre', '12 Rutschen, Wellenbad & 36°C Thermalbäder'],
      ['Landesmuseum Zürich', 'Zürich HB', 'Märchenschloss', '4–14 Jahre', 'Direkt am HB: Teppich der Geschichten & Ritter'],
      ['focusTerra ETH', 'Zürich Zentrum', 'Erdwissenschaften', '5–16 Jahre', 'Gratis Eintritt & Erdbebensimulator-Plattform'],
      ['FIFA Museum', 'Zürich Enge', 'Fussball & Games', '4–15 Jahre', 'Interaktives Football Lab, Flipper & WM-Pokale'],
      ['WOW Museum', 'Zürich HB', 'Optische Illusionen', 'Alle Altersstufen', 'Spiegelräume, Zerrwelten & Überkopf-Zimmer'],
      ['Trampolino', 'Dietikon', 'Indoor-Spielpark', '2–14 Jahre', 'Grösster Indoor-Spielplatz der Schweiz (4\'000 m²)'],
      ['Flip Lab Zurich', 'Rümlang', 'Trampolinhalle', '5–18 Jahre', 'Olympische Trampoline & riesige Airbag-Kissen'],
      ['Sauriermuseum Aathal', 'Aathal', 'Dinosaurier', '3–14 Jahre', 'Echte Skelette, lebensgrosse Dinos & Fossilien-Labor'],
      ['Kulturama', 'Zürich Fluntern', 'Evolution & Mensch', '5–15 Jahre', '600 Mio. Jahre Evolution & Entdeckerpfad'],
      ['Zoologisches Museum UZH', 'Zürich Zentrum', 'Naturmuseum', 'Alle Altersstufen', 'Gratis Eintritt, 1\'500 Tierpräparate & Tierstimmen'],
      ['Hürlimannbad & Spa', 'Zürich Enge', 'Thermalbad', 'Ab 1 Jahr (tagsüber)', 'Alte Brauereigewölbe & warmer Dachbad-Pool'],
      ['Tram-Museum Burgwies', 'Zürich Burgwies', 'Verkehrsmuseum', '2–10 Jahre', 'Historische Trams besteigen & Glocken läuten'],
      ['Mühlerama', 'Tiefenbrunnen', 'Historische Mühle', '3–12 Jahre', 'Laufende Mühle, 2-stöckige Rutsche & Zopfbacken'],
      ['Sukkulenten-Sammlung', 'Mythenquai', 'Wüstenglashaus', 'Alle Altersstufen', 'Gratis Eintritt, 7 beheizte Gewächshäuser & Kakteen'],
      ['Botanischer Garten UZH', 'Zollikerstrasse', 'Tropenhäuser', 'Alle Altersstufen', 'Gratis Eintritt, 3 Bio-Domes & Riesen-Seerosen'],
      ['Starbie Spielwelt', 'Dietikon', 'Indoor-Spielzone', '1–8 Jahre', 'Elektro-Karts, Bällebad & gemütliche Kleinkindzone'],
      ['Skillspark Winterthur', 'Winterthur', 'Actionsport', '6–18 Jahre', 'Grösste Actionhalle Europas: Pumptrack & Big Air'],
      ['Umwelt Arena Schweiz', 'Spreitenbach', 'Öko-Mobilität', '4–14 Jahre', 'Indoor-Elektro-Kartbahn & interaktive Stationen'],
      ['Monkey Town', 'Rümlang', 'Dschungel-Spielpark', '1–10 Jahre', 'Klettertürme, Röhrenrutschen & Kleinkindbereich'],
      ['Formel Fun', 'Bülach', 'Spiel & Lounge', '3–14 Jahre', 'Elektro-Gokarts, Schwarzlicht-Minigolf & Elternlounge'],
      ['Minicity Play Village', 'Letzipark/Sihlcity', 'Rollenspiel-Stadt', '2–7 Jahre', 'Mini-Supermarkt, Feuerwehr & Kinderbetreuung'],
      ['Naturmuseum Winterthur', 'Winterthur', 'Naturkunde', '2–12 Jahre', 'Gratis für Kids bis 16, Kerngruppe & Biberbau'],
      ['Museum Schloss Kyburg', 'Kyburg', 'Ritterburg', '5–14 Jahre', '1\'000 Jahre alte Burg, Rüstkammer & Drachensuche'],
      ['Freizeitbad Opfikon', 'Opfikon/Glattbrugg', 'Hallenbad', 'Alle Altersstufen', '65m Rutschbahn, 30°C Lernschwimmbecken & Planschzone'],
      ['Hallenbad City', 'Zürich Selnau', 'Historisches Bad', 'Alle Altersstufen', 'Saniertes 1930er Bauhausbad mit warmem Familienbecken']
    ]
  },
  items: zurichRainyEn.items.map(it => {
    // Localize items with German titles, badges, and tips
    const deTranslations = {
      1: {
        name: 'Swiss Science Center Technorama (Winterthur)',
        badge: 'Top-Tipp · 500+ Experimentierstationen',
        location: 'Technoramastrasse 1, 8404 Winterthur (SBB bis Winterthur HB, dann Buslinie 5 direkt zum Technorama)',
        summary: 'Eines der grössten und faszinierendsten Mitmach-Science-Center der Welt. Auf vier riesigen Etagen bietet das Technorama über 500 Experimentierstationen, an denen Anfassen, Drücken und Kurbeln ausdrücklich erwünscht sind. Kinder erzeugen gigantische Seifenblasen, zähmen echte elektrische Blitze, erforschen optische Täuschungen im Spiegellabyrinth und bestaunen verblüffende Physik- und Chemie-Shows.',
        tip: 'Geht direkt nach der Ankunft in den Tinkering-Bereich im zweiten Stock, um euch Plätze für die beliebten Mitmach-Workshops zu sichern. Plant mindestens 4 bis 5 Stunden ein!'
      },
      2: {
        name: 'Lindt Home of Chocolate (Kilchberg)',
        badge: 'Schoggi-Paradies · 9m Schokobrunnen',
        location: 'Schokoladenplatz 1, 8802 Kilchberg (S8/S24 bis Kilchberg oder Bus 165 ab Bürkliplatz bis Muschelweg)',
        summary: 'Ein wahrgewordener Schoggi-Traum am linken Zürichseeufer: Gleich in der Eingangshalle ragt ein über 9 Meter hoher, goldener Schokoladenbrunnen empor, durch den 1\'500 Kilogramm flüssige Lindt-Schoggi strömen. Die interaktive Audiotour führt von den Kakaobäumen in Ghana über die Schweizer Schokoladenpioniere bis zur modernen Produktion. Das Highlight: Naschstationen mit unbegrenztem Schoggi-Probieren ab warmen Zapfhähnen.',
        tip: 'Tickets sind an verregneten Wochenenden oft Tage im Voraus ausgebucht! Reserviert euer Zeitfenster unbedingt vorab online.'
      },
      3: {
        name: 'Zoo Zürich: Masoala Regenwald & Lewa Savanne',
        badge: 'Tropen-Oase · 28°C Indoor-Dschungel',
        location: 'Zürichbergstrasse 221, 8044 Zürich (Tram 6 ab Zürich HB direkt zur Endstation Zoo Zürich)',
        summary: 'Wenn es in Zürich nasskalt und trüb ist, fühlt sich ein Besuch in der 11\'000 m² grossen Masoala-Regenwald-Halle wie ein Direktflug nach Madagaskar an. Bei angenehmen 28°C und hoher Luftfeuchtigkeit spazieren Familien auf Dschungelpfaden und Hängebrücken, während freilebende Rote Varis (Lemuren), Flughunde und bunte Vögel direkt über den Köpfen vorbeiziehen. Auch die überdachten Innenbereiche der Lewa-Savanne (Giraffen und Nashörner) und das Koala-Haus sind ideal bei Regen.',
        tip: 'Nutzt die Schliessfächer direkt am Eingang der Masoala-Halle, um dicke Winterjacken und Schirme abzulegen – im Tropenhaus reichen T-Shirt und leichte Kleidung.'
      },
      4: {
        name: 'Alpamare Erlebnisbad (Pfäffikon SZ)',
        badge: 'Wasserparadies · 12 rasante Rutschen',
        location: 'Gwattstrasse 12, 8808 Pfäffikon SZ (S5/S8/S25 bis Pfäffikon SZ, dann Bus 195 bis Seedamm-Center / Alpamare)',
        summary: 'Europas legendärer Indoor-Wasserpark liegt nur 30 Minuten von Zürich entfernt am oberen Zürichsee. 12 adrenalingeladene Rutschen mit über 2.1 Kilometern Gesamtlänge, ein riesiges Indoor-Wellenbad mit Meeresbrandung und die rasante Alpa-Bob-Reifenbahn garantieren Action pur. Wer Entspannung sucht, taucht in die dampfenden 36°C warmen Jod-Sole-Thermalbecken im Aussenbereich ein, während der Regen auf die Wasseroberfläche prasselt.',
        tip: 'Prüft SBB RailAway für ermässigte Kombi-Billette aus Zug und Eintritt. Für die kleinsten Geschwister gibt es einen separaten 200 m² grossen Kleinkinderbereich mit Minirutschen.'
      },
      5: {
        name: 'Landesmuseum Zürich (Schweizerisches Nationalmuseum)',
        badge: 'Märchenschloss · Direkt am Zürcher HB',
        location: 'Museumstrasse 2, 8001 Zürich (Unmittelbar hinter dem Hauptbahnhof Zürich / Tram 4, 11, 13, 14, 17)',
        summary: 'Das Landesmuseum wirkt wie ein verwinkeltes Märchenschloss und ist nur wenige Schritte vom Zürcher Hauptbahnhof entfernt – ideal bei strömendem Regen. Die Dauerausstellung «Ein Teppich voller Geschichten» lädt Kinder ein, historische Segelschiffe zu erkunden, in ein Nomadenzelt zu schlüpfen und durch winterliche Wälder zu reisen. Dazu warten echte Ritterrüstungen, Kutschen und Verkleidungsstationen.',
        tip: 'Freier Eintritt für alle Kinder unter 16 Jahren! Auch Erwachsene mit Schweizer Museumspass oder Raiffeisen MemberPlus-Karte geniessen kostenlosen Eintritt.'
      },
      6: {
        name: 'focusTerra – ETH Erdwissenschaften',
        badge: 'Gratis Eintritt · Echter Erdbebensimulator',
        location: 'Sonneggstrasse 5, 8092 Zürich (ETH Hauptgebäude / Tram 6, 9, 10 bis ETH/Universitätsspital oder Polybahn ab Central)',
        summary: 'Im spektakulären Glas-Lichthof des Departements Erdwissenschaften an der ETH Zürich tauchen Kinder in die Kräfte unseres Planeten ein. Der absolute Star ist die hydraulische Erdbeben-Simulationsplattform: Hier erleben Familien historische Beben in sicherer Umgebung am eigenen Körper. Zudem gibt es leuchtende Mineralien im Dunkelraum, echte Meteoriten zum Anfassen und riesige Bergkristalle.',
        tip: 'Der Museumseintritt ist komplett kostenlos! Öffentliche Vorführungen des Erdbebensimulators finden an ausgewählten Familiensonntagen statt (Plätze online reservieren).'
      },
      7: {
        name: 'FIFA Museum (Zürich Enge)',
        badge: 'Interaktive Fussball-Arena · Enge',
        location: 'Seestrasse 27, 8002 Zürich (Direkt gegenüber dem Bahnhof Enge / Tram 5, 6, 7 bis Bahnhof Enge)',
        summary: 'Ein Highlight für junge Fussball-Fans direkt gegenüber dem Bahnhof Enge. Im obersten Stockwerk wartet das «Football Lab»: eine riesige interaktive Flipper-Arena, in der Kinder mit echten Fussbällen auf digitale Sensorwände schiessen, um Schusskraft, Passgenauigkeit und Dribbling-Geschwindigkeit zu messen. Zudem kann man in echten Kommentatoren-Kabinen legendäre WM-Tore kommentieren und den echten WM-Pokal bestaunen.',
        tip: 'Jeden Sonntag ist «Family Sunday» mit kostenlosen Rätselrallyes, Schminkaktionen und Kreativ-Workshops für Kinder.'
      },
      8: {
        name: 'WOW Museum – Room of Illusions (Zürich HB)',
        badge: 'Verrückte Welten · Optische Täuschungen',
        location: 'Werdmühlestrasse 10, 8001 Zürich (3 Gehminuten vom Zürcher HB und der Bahnhofstrasse)',
        summary: 'Auf drei farbenfrohen Etagen stellt das WOW Museum die Wahrnehmung auf den Kopf. Dutzende optische Täuschungen, unendliche Spiegellabyrinthe, Kaleidoskope und Überkopf-Räume lassen Kinder an der Decke spazieren oder scheinbar schwerelos schweben. Es verbindet spielerische Physik mit purem Familienspass.',
        tip: 'Akkus voll aufladen! Am Boden markieren Fotopunkte die perfekten Kamerapositionen, um verblüffende Fotos für das Familienalbum zu schiessen.'
      },
      9: {
        name: 'Trampolino Indoor Funpark (Dietikon)',
        badge: 'Mega-Spielplatz · 4\'000 m² Action',
        location: 'Lerzenstrasse 27, 8953 Dietikon (S3/S11/S12 bis Dietikon, dann Bus 309 bis Silbern)',
        summary: 'Das Trampolino in Dietikon ist der grösste Hallenspielplatz der Schweiz und bietet auf 4\'000 Quadratmetern unendliche Bewegungsmöglichkeiten. Ein riesiger Klettervulkan mit Steilrutsche, Elektro-Gokarts, Autoscooter, eine echte kleine Indoor-Achterbahn, Trampolinanlagen und endlose Kletterlabyrinthe lassen Kinderherzen höherschlagen. Für die Kleinsten gibt es einen eigenen Softplay-Bereich.',
        tip: 'Antirutschsocken sind für Kinder Pflicht. Grosser Pluspunkt für das Budget: Eigene Picknicks und Snacks dürfen im Sitzbereich konsumiert werden!'
      },
      10: {
        name: 'Flip Lab Zurich (Rümlang)',
        badge: 'Freestyle-Trampoline & Riesen-Airbags',
        location: 'Oberglatterstrasse 35, 8153 Rümlang (S9/S15 bis Rümlang, dann 10 Minuten Fussweg oder Bus 510)',
        summary: 'Über 3\'000 m² Sprungfläche in Rümlang nahe dem Flughafen Zürich: Das Flip Lab bietet professionelle olympische Trampoline, Wall-Running-Wände, weiche Airbag-Sprungkissen, Völkerball-Trampolinfelder und Basketball-Slam-Dunk-Bahnen. Vor jedem Sprungslot führen geschulte Coaches ein gemeinsames Warm-up durch.',
        tip: 'Sprungzeiten unbedingt vorab online buchen. Die speziellen Flip-Lab-Gripsocken sind Pflicht (können bei Folgebesuchen wiederverwendet werden).'
      },
      11: {
        name: 'Sauriermuseum Aathal (Dinosaurier-Museum)',
        badge: 'Weltberühmte Fossilien & echte Skelette',
        location: 'Zürichstrasse 69, 8607 Aathal (S14 bis Bahnhof Aathal, dann 5 Minuten gemütlicher Fussweg)',
        summary: 'Eines der bedeutendsten Dinosauriermuseen Europas, berühmt für echte Skelette aus eigenen US-Grabungen, darunter der weltbekannte Allosaurus «Big Al Two». Kinder begegnen lebensgrossen, brüllenden Dino-Modellen, dürfen versteinertes Dinosaurier-Holz und Knochen anfassen, erkunden eine Mineraliengrotte und schauen Präparatoren im Glaslabor über die Schulter.',
        tip: 'Am Eingang nach der Dino-Suchrallye fragen: Kinder, die die Fragen lösen, erhalten im Shop einen kleinen Glücks-Edelstein geschenkt.'
      },
      12: {
        name: 'Kulturama – Museum des Menschen',
        badge: '600 Mio. Jahre Leben · Interaktiver Pfad',
        location: 'Englischviertelstrasse 9, 8032 Zürich (Tram 3/8 bis Hottingerplatz oder Tram 3/9 bis Kunsthaus)',
        summary: 'Ein faszinierendes Erlebnismuseum zur menschlichen Biologie und Evolution. Auf dem Mitmach-Entdeckerpfad dürfen Kinder echte Tierfossilien und Bernsteine unter der Lupe untersuchen, menschliche und tierische Skelette vergleichen und ihre Sinne an Tast- und Hörstationen testen. Die obere Etage vermittelt kindgerecht die biologische Entwicklung vom Embryo bis ins Alter.',
        tip: 'Kinder unter 6 Jahren geniessen freien Eintritt. Die Entdecker-Schubladen laden zum eigenständigen Anfassen und Forschen ein.'
      },
      13: {
        name: 'Zoologisches Museum der Universität Zürich',
        badge: 'Gratis Eintritt · 1\'500 Tierpräparate',
        location: 'Karl-Schmid-Strasse 4, 8006 Zürich (Tram 5, 6, 9 bis ETH/Universitätsspital oder Polybahn ab Central)',
        summary: 'Ein Klassiker auf dem Zürcher Hochschulhügel mit freiem Eintritt für alle Besucher. Über 1\'500 Tierpräparate zeigen die heimische Tierwelt der Schweiz sowie die globale Artenvielfalt. An Hörstationen lauschen Kinder echten Vogelstimmen und Wolfsheulen, Mikroskope zeigen Schmetterlingsflügel in Nahaufnahme und das gewaltige Mammutskelett bringt alle zum Staunen.',
        tip: 'Kombiniert den Besuch mit dem nur 300 Meter entfernten focusTerra auf der ETH-Terrasse für einen perfekten, 100% kostenlosen Wissenschaftsnachmittag.'
      },
      14: {
        name: 'Hürlimannbad & Spa Zürich',
        badge: 'Thermal-Oase · Warmer Dachpool',
        location: 'Brandschenkestrasse 150, 8002 Zürich (S-Bahn S2, S8, S24 bis Giesshübel oder Tram 5/13 bis Waffenplatzstrasse)',
        summary: 'Unter den historischen Steingewölben der ehemaligen Hürlimann-Brauerei entspringt die legendäre Zürcher Aqui-Quelle (35°C–41°C). Familien baden gemeinsam in riesigen hölzernen Braufässern und mystischen Steinhallen, bevor es mit dem Lift hinauf in den beheizten Dachbad-Infinitypool geht: Hier badet man im dampfenden Wasser mit spektakulärem Panoramablick über die Zürcher Altstadt.',
        tip: 'Kinder ab 1 Jahr sind tagsüber zwischen 09:00 und 17:00 Uhr im Thermalbad herzlich willkommen (in Begleitung Erwachsener und mit ruhigem Badeverhalten).'
      },
      15: {
        name: 'Tram-Museum Burgwies Zürich',
        badge: 'Historische Trams · Glocken & Führerstand',
        location: 'Forchstrasse 260, 8008 Zürich (Tram 11 oder Forchbahn S18 direkt bis Haltestelle Burgwies)',
        summary: 'Im denkmalgeschützten Tramdepot Burgwies von 1912 erwacht Zürcher Verkehrsgeschichte zum Leben. Kinder dürfen die historischen Holzsitze testen, auf den Fahrerstand klettern, an Notbremsleinen ziehen und echte Messing-Fussglocken läuten. In der Spielecke wartet eine riesige Brio-Holzeisenbahnanlage.',
        tip: 'Jeden letzten Sonntag im Monat (ausser Dezember) verkehrt die historische Museumslinie 21 vom Hauptbahnhof und Bellevue direkt zum Depot Burgwies.'
      },
      16: {
        name: 'Mühlerama – Museum & Tiefenbrunnen-Mühle',
        badge: 'Laufende Mühle · 2-stöckige Rutschbahn',
        location: 'Seefeldstrasse 231, 8008 Zürich (S6/S16 bis Tiefenbrunnen oder Tram 2/4 bis Bahnhof Tiefenbrunnen)',
        summary: 'Eine über 110 Jahre alte, voll funktionsfähige Industriemühle direkt am Zürichsee. Kinder schlüpfen in weiche Filzpantoffeln, bestaunen die rüttelnden Mehlsiebe und Mahlwalzen, mahlen Korn an echten Handmühlen und sausen die legendäre Holzrutschbahn hinab, über die früher schwere Getreidesäcke transportiert wurden.',
        tip: 'Jeden Sonntagnachmittag findet das beliebte Familien-Backen statt: Kinder kneten und flechten ihren eigenen Zopf oder Brötchen und backen sie im Steinofen.'
      },
      17: {
        name: 'Sukkulenten-Sammlung Zürich',
        badge: 'Gratis Wärme · 4\'500 Wüstenkakteen',
        location: 'Mythenquai 88, 8002 Zürich (Bus 161/165 ab Bürkliplatz bis Haltestelle Sukkulentensammlung)',
        summary: 'Eine der bedeutendsten Sukkulenten- und Kakteensammlungen der Erde mit über 4\'500 Arten in sieben warmen Glashäusern direkt am Zürichsee. Wenn draussen nasskalter Regen fällt, fühlt sich der Spaziergang zwischen mannshohen Säulenkakteen, Agaven und madagassischen Dickblattgewächsen wie eine Expedition in die Wüste Arizonas an.',
        tip: 'Der Eintritt ist an 365 Tagen im Jahr komplett kostenlos! Am Eingang liegt ein liebevoll illustriertes Rätselheft für Kinder bereit.'
      },
      18: {
        name: 'Botanischer Garten UZH (Tropenhäuser)',
        badge: 'Gratis Eintritt · Futuristische Tropen-Kuppeln',
        location: 'Zollikerstrasse 107, 8008 Zürich (Tram 11 bis Hegibachplatz oder Bus 77 direkt bis Botanischer Garten)',
        summary: 'Drei markante, kuppelförmige Schauhäuser, die wie Raumstationen in die Weinegg-Hügel gebettet sind. Im Inneren herrscht feucht-warme Tropenluft (26°C): Riesen-Seerosenblätter aus dem Amazonas, exotische Orchideen, fleischfressende Kannenpflanzen und plätschernde Wasserläufe machen den Rundgang zu einem herrlichen Sinneserlebnis bei schlechtem Wetter.',
        tip: 'Komplett kostenloser Eintritt! Ein idealer, barrierefreier Rückzugsort für Eltern mit Kinderwagen oder Kleinkindern.'
      },
      19: {
        name: 'Starbie Spielwelt (Dietikon)',
        badge: 'Gemütliche Spielwelt · 1 bis 8 Jahre',
        location: 'Riedstrasse 3, 8953 Dietikon (S3/S12 bis Dietikon, dann Bus 309 bis Moosmatt)',
        summary: 'Ein liebevoll gestaltetes Indoor-Paradies in Dietikon, ideal für Babys, Kleinkinder und jüngere Schulkinder. Ausgestattet mit Elektro-Minikarts, Riesen-Schaumstoff-Legosteinen, breiten Wellenrutschen, Klettertürmen, Hüpfburgen und einem abgetrennten Bällebad für die Allerkleinsten.',
        tip: 'Das Café ist so angeordnet, dass Eltern bei einem Kaffee das gesamte Spielgeschehen entspannt im Blick behalten. Sockenpflicht.'
      },
      20: {
        name: 'Skillspark Winterthur (Freestyle-Actionhalle)',
        badge: 'Actionsport · 6\'000 m² Hallenfläche',
        location: 'Lagerplatz 17, 8400 Winterthur (10 Gehminuten ab Winterthur HB oder Bus 1 bis Lokwerk)',
        summary: 'Europas grösste Actionsporthalle in den geschichtsträchtigen Sulzer-Industriehallen in Winterthur. Auf 6\'000 m² toben sich aktive Kids und Teens auf Asphalt-Pumptracks mit BMX-Bikes und Stunt-Scootern aus, erobern Skatepools, bezwingen Ninja-Warrior-Hindernisse und springen von Trampolinen in riesige Luftkissen.',
        tip: 'Mietmaterial (BMX, Scooter, Skateboards und Helme) gibt es direkt vor Ort. Perfekt für energiereiche Kinder ab 6 Jahren.'
      },
      21: {
        name: 'Umwelt Arena Schweiz (Spreitenbach)',
        badge: 'Indoor-Elektro-Karts & Zukunfts-Technik',
        location: 'Türliackerstrasse 4, 8957 Spreitenbach (Limmattalbahn Tram 20 direkt zur Umwelt Arena)',
        summary: 'Ein spektakulärer Bau, der Nachhaltigkeit für Kinder greifbar macht. Das absolute Highlight ist der 300 Meter lange Indoor-Testparcours im Untergeschoss: Hier düsen Kinder mit Elektro-Karts, Segways, E-Trottinetts und lustigen Spassvelos über die Piste. Auf den oberen Etagen warten 45 interaktive Stationen mit Touchscreens und Quizspielen.',
        tip: 'Bequem erreichbar mit der modernen Limmattalbahn (Tram 20) ab Zürich-Altstetten oder Killwangen-Spreitenbach – hält direkt vor dem Eingang.'
      },
      22: {
        name: 'Monkey Town Indoor-Spielpark (Rümlang)',
        badge: 'Dschungel-Kletterwelt · Mehrstöckig',
        location: 'Ifangstrasse 8, 8153 Rümlang (S9/S15 bis Rümlang, dann Bus 510 bis Riedmatt)',
        summary: 'Ein farbenfroher Dschungel-Spielplatz mit mehrstöckigen Klettergerüsten, Seilbrücken, Röhrenrutschen, Bällekannonen-Arenen und einem weich gepolsterten Kleinkindbereich für Kinder unter 4 Jahren.',
        tip: 'Schnelles Gratis-WLAN und zahlreiche Cafétische für Eltern, die bei Schmuddelwetter etwas Remote-Work erledigen möchten, während die Kids toben.'
      },
      23: {
        name: 'Formel Fun / Kiddy Park (Bülach)',
        badge: 'Elektro-Karts & Schwarzlicht-Minigolf',
        location: 'Schützenmattstrasse 30, 8180 Bülach (S9/S15 bis Bülach, dann Bus 530/531 bis Schützenmatt)',
        summary: 'Eine moderne Familien-Erlebniswelt im Zürcher Unterland: Elektro-Minikarts auf rutschfester Piste, ein spannendes Laser-Labyrinth, eine 9-Loch-Schwarzlicht-Minigolfanlage und Klettertürme begeistern Kinder jeden Alters.',
        tip: 'Die Lounge bietet hochwertigen Barista-Kaffee und frische Paninis – spürbar angenehmer für Eltern als gewöhnliche Hallenspielplätze.'
      },
      24: {
        name: 'Minicity & Play Village (Letzipark & Sihlcity)',
        badge: 'Rollenspiel-Stadt · Einkaufszentren',
        location: 'Baslerstrasse 50, 8048 Zürich (Letzipark) und Kalandergasse 1, 8045 Zürich (Sihlcity)',
        summary: 'Eine detailverliebte Ministadt für Kinder von 2 bis 7 Jahren: Echte Rollenspiele an der Kasse eines Mini-Migros-Supermarkts, Einsätze mit Holz-Feuerwehrautos, Plüschtier-Verarztung im Spital oder Mauern auf der Baustelle.',
        tip: 'Bietet für Kinder von 3 bis 7 Jahren betreute Betreuungsstunden an, damit Eltern Besorgungen im Center in Ruhe erledigen können.'
      },
      25: {
        name: 'Naturmuseum Winterthur',
        badge: 'Gratis für Kinder bis 16 · Kerngruppe',
        location: 'Museumstrasse 52, 8400 Winterthur (Nur 5 Gehminuten ab Bahnhof Winterthur)',
        summary: 'Ein liebevoll gestaltetes Naturmuseum zur heimischen Tierwelt. Das Herzstück für Familien ist der Forschersaal «Kerngruppe»: Kinder dürfen Felle ertasten, in einen begehbaren Biberbau klettern, Insekten unter Vergrösserungsgläsern prüfen und Tierpuzzles lösen.',
        tip: 'Komplett freier Eintritt für alle Kinder und Jugendlichen bis 16 Jahre! Ideal gelegen für einen Ausflug nach Winterthur.'
      },
      26: {
        name: 'Museum Schloss Kyburg',
        badge: '1\'000 Jahre alte Burg · Ritter & Drachen',
        location: 'Schloss 1, 8314 Kyburg (SBB bis Winterthur oder Effretikon, dann Postauto 653 direkt zum Schloss)',
        summary: '150 Meter über der Töss thront die älteste Burgmuseum-Anlage der Schweiz. Kinder erforschen dunkle Kellerverliese, die historische Schlossküche, die Rüstkammer mit echten Schwertern und Helmen und begeben sich per Smartphone-App auf Drachensuche.',
        tip: 'Achtet auf mittelalterliche Handwerker- und Backtage im Jahresprogramm. Feste Schuhe anziehen wegen historischer Pflastersteine.'
      },
      27: {
        name: 'Freizeitbad Opfikon (Bruggwiesen)',
        badge: 'Familienbad · 65m Röhrenrutsche',
        location: 'Ifangstrasse 13, 8152 Opfikon (Glattbrugg / S7 bis Balsberg oder S5 bis Glattbrugg)',
        summary: 'Ein modernes städtisches Hallenbad mit einer rasanten 65-Meter-Wasserrutsche, einem 25-Meter-Schwimmerbecken, einem warmen 30°C Lernschwimmbecken mit Massagedüsen und einer bunten Kleinkinder-Planschzone mit Wasserfontänen.',
        tip: 'Sehr familienfreundliche städtische Eintrittspreise – eine preiswerte Alternative zu kommerziellen Wasserparks für einen spontanen Badetag.'
      },
      28: {
        name: 'Hallenbad City Zürich',
        badge: 'Zentral am Schanzengraben · Warmes Lernbecken',
        location: 'Sihlstrasse 71, 8001 Zürich (Tram 2, 9 bis Stauffacher oder S-Bahn bis Selnau)',
        summary: 'Das traditionsreiche Zürcher Hallenbad aus den 1930er Jahren im Bauhausstil, direkt am malerischen Schanzengraben. Das Bad verfügt über ein 50m-Schwimmbecken, ein separates 30°C warmes Familien- und Lernbecken mit sanften Düsen und grosszügige Familien-Umkleiden.',
        tip: 'Zentral in Gehdistanz zu Paradeplatz und Stadelhofen gelegen – ideal für eine spontane Badepause mitten in Zürich.'
      }
    };

    const t = deTranslations[it.rank];
    return {
      rank: it.rank,
      spotId: it.spotId,
      name: t ? t.name : it.name,
      badge: t ? t.badge : it.badge,
      location: t ? t.location : it.location,
      summary: t ? t.summary : it.summary,
      tip: t ? t.tip : it.tip
    };
  }),
  internalLinks: [
    { href: '/de/blog/indoor-spielplaetze-zuerich', label: 'Top 8 Indoor-Spielplätze in Zürich' },
    { href: '/de/blog/thermalbaeder-mineralbaeder-familien-schweiz', label: 'Die 10 besten Thermalbäder für Familien' },
    { href: '/spielplaetze/zuerich', label: 'Alle Spielplätze im Kanton Zürich' },
    { href: '/', label: 'Zur interaktiven Schweizer Karte' }
  ]
};

// German Blog 2: Indoor Spielplätze Zürich (8 Spots)
const zhIndoorEn = blogs.find(b => b.slug === 'indoor-playzones-zurich');
const zhIndoorDe = {
  slug: 'indoor-spielplaetze-zuerich',
  lang: 'de',
  translationSlug: 'indoor-playzones-zurich',
  title: 'Die 8 besten Indoor-Spielplätze in Zürich (Guide 2026 für Regentage)',
  subtitle: 'Von riesigen Kletterburgen und Trampolinparks bis zu Kleinkinder-Spielwelten und Go-Kart-Bahnen: Die besten Adressen im Kanton Zürich.',
  metaDescription: 'Entdecke die besten Indoor-Spielplätze und Trampolinhallen in Zürich und Umgebung: Trampolino, Flip Lab, Starbie, Formel Fun, Skillspark und Minicity im detaillierten Familien-Check.',
  category: 'Indoor-Spielplätze · Zürich',
  readTime: '10 Min. Lesezeit',
  publishedAt: '2026-11-20',
  heroImage: zhIndoorEn.heroImage,
  intro: 'Wenn das Zürcher Wetter grau und nass ist, brauchen Kinder Raum zum Klettern, Rutschen und Toben. Im Kanton Zürich gibt es eine hervorragende Auswahl an Hallenspielplätzen – von der gigantischen 4\'000-m²-Erlebniswelt bis zum gemütlichen Kleinkinder-Paradies mit Barista-Kaffee für die Eltern. Hier sind die 8 besten Indoor-Spielzonen in Zürich und Umgebung im direkten Vergleich.',
  table: {
    title: 'Zürcher Indoor-Spielplätze im Überblick',
    headers: ['Spielplatz', 'Standort', 'Bestens geeignet für', 'Alter', 'Hauptattraktion'],
    rows: [
      ['Trampolino', 'Dietikon', 'Maximale Energie verbrennen', '2–14', 'Grösster Hallenspielplatz der Schweiz (4\'000 m²)'],
      ['Flip Lab', 'Rümlang', 'Trampoline & Freestyle-Flips', '5–18', 'Olympische Trampoline, Airbag-Sprungkissen & Ninja Park'],
      ['Starbie Spielwelt', 'Dietikon', 'Kleinkinder & jüngere Kids', '1–8', 'Riesen-Softlego, Holzeisenbahnen & Bällebäder'],
      ['Formel Fun', 'Bülach', 'Elektrokarts & Laserspass', '3–15', 'Elektro-Minikarts & Schwarzlicht-Minigolf'],
      ['Skillspark', 'Winterthur', 'Action & Rollsport', '4–18', 'Pumptrack, Trampoline, Schaumstoffbecken & Skatehalle'],
      ['Minicity', 'Sihlcity Zürich', 'Kreatives Rollenspiel', '2–7', 'Mini-Migros-Supermarkt, Spital & Feuerwehr'],
      ['FIFA Museum Lab', 'Zürich Enge', 'Fussballfans & Ballkünstler', '4–14', 'Interaktive Sensor-Wände & gigantischer Fussballflipper'],
      ['Kids Playland', 'Zürich West', 'Regnerische Nachmittage', '1–10', 'Mehrstöckiger Rutschenturm, Ballkanonen & Partylounges']
    ]
  },
  items: [
    {
      rank: 1,
      spotId: 'spot-21',
      name: 'Trampolino Indoor Funpark (Dietikon)',
      badge: 'Grösster Spielpark der Schweiz · 4\'000 m²',
      location: 'Lerzenstrasse 27, 8953 Dietikon (S3/S11/S12 bis Dietikon, dann Bus 309 bis Silbern)',
      summary: 'Das Flaggschiff unter den Schweizer Hallenspielplätzen: Auf über 4\'000 Quadratmetern finden Kinder einen mächtigen Klettervulkan mit Röhrenrutsche, echte Elektro-Autoscooter, eine Miniactherbahn, Bungee-Trampoline und ein riesiges Klettergerüst. Für Kleinkinder gibt es eine eigene geschützte Softplay-Ecke.',
      tip: 'Eigene Picknicks und Trinkflaschen sind ausdrücklich erlaubt! Bringt Antirutschsocken für die Kinder mit.'
    },
    {
      rank: 2,
      spotId: 'spot-55',
      name: 'Flip Lab Zurich (Rümlang)',
      badge: 'Freestyle & Profi-Trampoline',
      location: 'Oberglatterstrasse 35, 8153 Rümlang (S9/S15 bis Rümlang, dann Bus 510 oder kurzer Spaziergang)',
      summary: 'Ein Trampolinpark der Spitzenklasse auf 3\'000 m²: Neben klassischen Trampolinen gibt es spektakuläre Wall-Running-Anlagen, Sprünge in riesige Luftkissen (Bagjump), ein Basketball-Dunking-Feld und einen Ninja-Parcours.',
      tip: 'Vorab online Sprungzeit buchen, da Einlasskontingente begrenzt sind. Spezielle Gripsocken sind Pflicht.'
    },
    {
      rank: 3,
      spotId: 'osm-spot-1903',
      name: 'Starbie Spielwelt (Dietikon)',
      badge: 'Gemütlich & übersichtlich · 1 bis 8 Jahre',
      location: 'Riedstrasse 3, 8953 Dietikon (S-Bahn bis Dietikon, dann Bus 309)',
      summary: 'Besonders bei Eltern von Kleinkindern und Kindergartenkindern beliebt: Starbie besticht durch Übersichtlichkeit, Sauberkeit und eine herzliche Atmosphäre mit Kettcar-Parcours, Hüpfburgen, Riesen-Bausteinen und Bällebad.',
      tip: 'Das Bistro bietet einen perfekten Rundumblick auf alle Spielbereiche – ideal, um bei einem Cappuccino zu entspannen.'
    },
    {
      rank: 4,
      spotId: 'osm-spot-2324',
      name: 'Formel Fun (Bülach)',
      badge: 'Elektrokarts & Schwarzlicht-Minigolf',
      location: 'Schützenmattstrasse 30, 8180 Bülach (S9/S15 bis Bülach)',
      summary: 'Eine moderne Familienlounge im Zürcher Unterland: Flotte Elektro-Gokarts, ein abenteuerliches Laser-Labyrinth, 9 Löcher leuchtendes Schwarzlicht-Minigolf und ein anspruchsvolles Kletterlabyrinth.',
      tip: 'Stilvolle Elternlounge mit erstklassigem Kaffee, Salaten und Snacks – deutlich ruhiger als klassische Hallen.'
    },
    {
      rank: 5,
      spotId: 'spot-62',
      name: 'Skillspark Winterthur',
      badge: 'Action- & Freestylesport · 6\'000 m²',
      location: 'Lagerplatz 17, 8400 Winterthur (Nahe Winterthur HB / Sulzer-Areal)',
      summary: 'Die grösste Freestylehalle Europas begeistert Schulkinder, Jugendliche und sportliche Eltern: Asphalt-Pumptrack für BMX und Scooter, Skate-Bowl, Trampoline mit Schnitzelgrube und Ninja-Warrior-Hindernisse.',
      tip: 'BMX-Bikes, Stunt-Scooter und Helme können vor Ort gemietet werden. Geeignet ab ca. 5–6 Jahren.'
    },
    {
      rank: 6,
      spotId: 'spot-56',
      name: 'Minicity & Play Village (Letzipark & Sihlcity)',
      badge: 'Rollenspiel-Paradies · 2 bis 7 Jahre',
      location: 'Letzipark (Baslerstrasse 50) & Sihlcity (Kalandergasse 1), Zürich',
      summary: 'Kreatives Rollenspiel in einer zauberhaften Miniaturstadt: Kinder schlüpfen in die Rolle von Feuerwehrleuten, Ärztinnen, Bauarbeitern oder Einkäufern im Mini-Migros.',
      tip: 'Stundenweise betreute Kinderbetreuung möglich, ideal um Besorgungen im Einkaufszentrum zu erledigen.'
    },
    {
      rank: 7,
      spotId: 'spot-2',
      name: 'FIFA Museum Football Lab (Zürich Enge)',
      badge: 'Fussball-Action & Riesen-Flipper',
      location: 'Seestrasse 27, 8002 Zürich (Gegenüber Bahnhof Enge)',
      summary: 'Die interaktive Spielebene des FIFA Museums: An digitalen Zielwänden kicken Kinder mit echten Bällen, treten in der riesigen Flipper-Arena an und testen ihre Schussgenauigkeit.',
      tip: 'Besonders an den Familiensonntagen mit zusätzlichem Kinderprogramm und Schminken ein Volltreffer.'
    },
    {
      rank: 8,
      spotId: 'osm-spot-5031',
      name: 'Kids Playland (Zürich West)',
      badge: 'Urbaner Hallenspielplatz · Zürich West',
      location: 'Hohlstrasse 461, 8048 Zürich (Tram 2 bis Freihofstrasse)',
      summary: 'Zentral gelegener Hallenspielplatz in Zürich West: Mehrstöckige Klettertürme, Spiralrutschen, Ballkanonen und eigene Lounge-Bereiche für regnerische Nachmittage.',
      tip: 'Sehr gut mit dem öffentlichen Verkehr ab Zürcher Innenstadt erreichbar.'
    }
  ],
  internalLinks: [
    { href: '/de/blog/ausfluege-kinder-zuerich-schlechtwetter', label: '28 Schlechtwetter-Ausflüge in Zürich' },
    { href: '/de/blog/thermalbaeder-mineralbaeder-familien-schweiz', label: 'Thermalbäder für Familien' },
    { href: '/spielplaetze/zuerich', label: 'Spielplätze in Zürich' }
  ]
};

// German Blog 3: Thermalbäder für Familien in der Schweiz (10 Bäder)
const spasEn = blogs.find(b => b.slug === 'top-mineral-baths-thermal-spas-families-switzerland');
const spasDe = {
  slug: 'thermalbaeder-mineralbaeder-familien-schweiz',
  lang: 'de',
  translationSlug: 'top-mineral-baths-thermal-spas-families-switzerland',
  title: 'Die 10 besten Thermal- & Mineralbäder für Familien in der Schweiz (Mit echten Alterslimiten)',
  subtitle: 'Wo Kinder wirklich willkommen sind: Echte Einlassregeln, Familientarife und die schönsten warmen Quellen von Leukerbad bis Zürich.',
  metaDescription: 'Entdecke die 10 besten kinderfreundlichen Thermalbäder und Mineralbäder in der Schweiz: Genaue Alterslimiten, Babyschwimmen, Rutschbahnen und warme Aussenbecken im Praxis-Check.',
  category: 'Thermalbäder & Wellness · Schweiz',
  readTime: '12 Min. Lesezeit',
  publishedAt: '2026-11-20',
  heroImage: spasEn.heroImage,
  intro: 'Nichts wärmt die Familie an kalten Regen- oder Wintertagen so herrlich auf wie ein Bad in mineralreichem Thermalwasser. Doch viele Schweizer Thermalbäder setzen strenge Alterslimiten oder verlangen absolute Ruhe, was mit lebhaften Kindern schnell zu Frust führen kann. In diesem Guide haben wir die 10 besten Schweizer Thermal- und Mineralbäder zusammengestellt, die Familien ausdrücklich willkommen heissen – inklusive exakter Mindestaltersregeln, Becken-Temperaturen und Tipps für Babys und Kleinkinder.',
  table: {
    title: 'Schweizer Thermalbäder im Familien-Check: Altersregeln auf einen Blick',
    headers: ['Thermalbad', 'Kanton', 'Mindestalter (Hauptbecken)', 'Sauna / Spa-Zone', 'Besonders geeignet für'],
    rows: [
      ['Leukerbad Therme', 'Wallis', 'Alle Altersstufen (unter 6 gratis)', 'Ab 16 Jahren', 'Rutschen & warme Berg-Aussenpools'],
      ['Therme Zurzach', 'Aargau', 'Alle Altersstufen (Ruhebecken ab 16)', 'Eingeschränkt', 'Kleinkinder (Papa Moll Wasserwelt)'],
      ['Mineralbad Rigi Kaltbad', 'Luzern / Schwyz', 'Alle Altersstufen (unter 4 gratis)', 'Ab 16 Jahren', 'Entspanntes Baden mit Bergblick'],
      ['Les Bains de la Gruyère', 'Freiburg', 'Alle Altersstufen (unter 5 gratis)', 'Ab 16 Jahren', 'Gemütliches warmes Alpenbad'],
      ['Centre Thermal Yverdon', 'Waadt', 'Ab Geburt (kurze Dips)', 'Sauna ab 16', 'Babys & grosszügige Familienbecken'],
      ['Bogn Engiadina Scuol', 'Graubünden', 'Alle Altersstufen ab 10:30 Uhr', 'Ab 16 Jahren', 'Aufwärmen nach dem Winterspaziergang'],
      ['Hürlimannbad Zürich', 'Zürich', 'Ab 1 Jahr (9:00–17:00 Uhr)', 'Römisch-Irisch ab 16', 'Rooftop-Dachpool mit Zürcher Stadtblick'],
      ['Tamina Therme Bad Ragaz', 'St. Gallen', 'Ab 3 Jahren', 'Ab 12 Jahren (mit Begleitung)', 'Ältere, ruhige Kinder & Architektur'],
      ['Les Bains de Lavey', 'Waadt', 'Ab 4 Jahren (Ausweispflicht)', 'Ab 16 Jahren', 'Heisseste natürliche Quelle der Schweiz'],
      ['sole uno Rheinfelden', 'Aargau', 'Ab 4 Jahren', 'Ab 14 Jahren', 'Schweben wie im Toten Meer']
    ]
  },
  items: [
    {
      rank: 1,
      name: 'Leukerbad Therme (Wallis)',
      badge: 'Grösstes Thermalbad der Alpen · Rutschen & Bergblick',
      location: 'Rathausstrasse 32, 3954 Leukerbad (SBB bis Visp/Leuk, dann Bus 471 direkt nach Leukerbad)',
      summary: 'Das grösste Alpentherme-Resort Europas pumpt täglich 3.9 Millionen Liter mineralreiches, 51°C heisses Quellwasser in zehn verschiedene Badebecken (28°C bis 43°C). Für Familien gibt es zwei rasante Röhrenrutschen (inklusive einer Reifenrutsche), ein Kleinkinderbecken mit Spielfiguren und weitläufige Aussenbecken mit Blick auf die schneebedeckten Daubenhorn-Felswände.',
      tip: 'Kinder unter 6 Jahren baden komplett kostenlos. Im Hauptbadebereich dürfen Kinder ganz normal planschen und spielen.'
    },
    {
      rank: 2,
      name: 'Therme Zurzach (Aargau)',
      badge: 'Papa Moll Wasserwelt · Perfekt für Kleinkinder',
      location: 'Badstrasse 44, 5330 Bad Zurzach (S-Bahn S27/S36 bis Bad Zurzach)',
      summary: 'Die Therme Zurzach speist ihre Becken aus der 39.9°C warmen Glaubersalz-Quelle. Das Highlight für junge Familien ist das abgetrennte Papa Moll Kinderbad: Ein farbenfrohes, 32°C warmes Erlebnisbecken mit Rutschbahnen, Wasserspritzen, interaktiven Kanälen und lebensgrossen Papa-Moll-Figuren.',
      tip: 'Ideal für Babys und Kleinkinder, da der Familienbereich räumlich von den Ruhebecken getrennt ist.'
    },
    {
      rank: 3,
      name: 'Mineralbad & Spa Rigi Kaltbad (Luzern / Schwyz)',
      badge: 'Aussichts-Therme · Botta-Architektur',
      location: 'Rigi Kaltbad (Zahnradbahn ab Vitznau / Goldau oder Luftseilbahn ab Weggis)',
      summary: 'Entworfen vom weltberühmten Architekten Mario Botta thront dieses Mineralbad hoch über dem Vierwaldstättersee. Das 35°C warme Mineralwasser wird aus der hauseigenen «Drei-Schwestern-Quelle» gespeist. Vom Innenbecken schwimmt man direkt ins Aussenbecken mit unvergesslicher Aussicht auf den See und die Alpen.',
      tip: 'Kinder jeden Alters sind im Mineralbad herzlich willkommen (unter 4 Jahren gratis). Kombiniert den Besuch mit einer Bahnfahrt auf die Rigi.'
    },
    {
      rank: 4,
      name: 'Les Bains de la Gruyère (Charmey, Freiburg)',
      badge: 'Alpen-Panorama · Voralpen-Gemütlichkeit',
      location: 'Gros-Plan 30, 1637 Val-de-Charmey (SBB bis Bulle, dann Bus 260 nach Charmey)',
      summary: 'Eingebettet in die idyllischen Freiburger Voralpen bieten die Bains de la Gruyère drei grosse Becken mit 34°C warmem, naturbelassenem Mineralwasser. Whirlpools, Schwanenhalsduschen und das Aussenbecken mit Blick auf den Gipfel des Moléson laden zum Träumen ein.',
      tip: 'Kinder ab jedem Alter zugelassen (unter 5 Jahren gratis). Sehr entspannte Atmosphäre ohne übertriebene Strenge.'
    },
    {
      rank: 5,
      name: 'Centre Thermal d\'Yverdon-les-Bains (Waadt)',
      badge: 'Sanfte Quellen · Grosszügige Familienbecken',
      location: 'Avenue des Bains 22, 1400 Yverdon-les-Bains (SBB bis Yverdon-les-Bains)',
      summary: 'Das traditionsreiche Thermalzentrum am Neuenburgersee nutzt schwefelhaltige Heilquellen (34°C). Die weitläufigen Innen- und Aussenbecken bieten viel Platz für Familien mit Kindern.',
      tip: 'Bereits für Säuglinge zugelassen (kurze Aufenthalte von 10–15 Minuten im warmen Wasser einhalten).'
    },
    {
      rank: 6,
      name: 'Bogn Engiadina Scuol (Graubünden)',
      badge: 'Engadiner Bergquell-Therme',
      location: 'Via Bagnera 170, 7550 Scuol (RhB bis Scuol-Tarasp)',
      summary: 'Scuol im Unterengadin ist berühmt für seine über zwanzig Mineralquellen. Das Bogn Engiadina bietet sechs Innen- und Aussenbecken mit 34°C warmem Mineralwasser, Strömungskanal und Sprudelliegen vor schneebedeckten Dreitausendern.',
      tip: 'Für Familien mit Kindern ab 10:30 Uhr geöffnet. Perfekt nach einem Winterspaziergang im Engadin.'
    },
    {
      rank: 7,
      spotId: 'spot-huerlimannbad-spa-zurich',
      name: 'Hürlimannbad & Spa Zürich',
      badge: 'Rooftop-Thermalpool & Alte Steingewölbe',
      location: 'Brandschenkestrasse 150, 8002 Zürich (S-Bahn bis Giesshübel oder Tram 5/13)',
      summary: 'In den historischen Steinkellern der alten Hürlimann-Brauerei badet man im warmen Aqui-Mineralwasser (35°C–41°C). Highlight ist der beheizte Dachbadpool mit Rundumblick über die Zürcher Skyline.',
      tip: 'Familien mit Kindern ab 1 Jahr sind tagsüber von 09:00 bis 17:00 Uhr willkommen. Es gilt eine ruhige Badeatmosphäre.'
    },
    {
      rank: 8,
      name: 'Tamina Therme Bad Ragaz (St. Gallen)',
      badge: 'Architektur-Juwel · 36.5°C Heilquelle',
      location: 'Hans-Albrecht-Strasse, 7310 Bad Ragaz (SBB bis Bad Ragaz)',
      summary: 'Das legendäre Bad Ragazer Thermalwasser entspringt körperwarm mit 36.5°C in der nahegelegenen Taminaschlucht. Das Bad besticht durch seine schneeweisse, organische Holzarchitektur.',
      tip: 'Zutritt ab 3 Jahren. Für ruhige, ältere Kinder und Teenager ein unvergleichliches Wellness-Erlebnis.'
    },
    {
      rank: 9,
      name: 'Les Bains de Lavey (Waadt)',
      badge: 'Heisseste Quelle der Schweiz (ab 4 Jahren)',
      location: 'Route des Bains 48, 1892 Lavey-Morcles (SBB bis St-Maurice, dann Postauto)',
      summary: 'Mit 62°C sprudelt in Lavey das heisseste Thermalwasser der Schweiz aus dem Fels. Die Aussenbecken (33°C bis 36°C) sind abends spektakulär beleuchtet und von steilen Felswänden umrahmt.',
      tip: 'Striktes Mindestalter: 4 Jahre (Ausweispflicht bei Kindern!). Ab 4 Jahren aber ein unvergessliches Abendbad.'
    },
    {
      rank: 10,
      name: 'sole uno Wellness-Welt Rheinfelden (Aargau)',
      badge: 'Schweben wie im Toten Meer (ab 4 Jahren)',
      location: 'Roberstenstrasse 31, 4310 Rheinfelden (S-Bahn S1 bis Rheinfelden)',
      summary: 'Das berühmte Rheinfelder Natursolebad: Im Intensiv-Solebecken mit 12% Salzgehalt schweben Badegäste schwerelos an der Wasseroberfläche, untermalt von beruhigender Unterwassermusik.',
      tip: 'Zutritt ab 4 Jahren. Kinder lieben das Gefühl, ohne Schwimmbewegungen an der Oberfläche getragen zu werden.'
    }
  ],
  internalLinks: [
    { href: '/de/blog/ausfluege-kinder-zuerich-schlechtwetter', label: '28 Schlechtwetter-Ausflüge in Zürich' },
    { href: '/de/blog/indoor-spielplaetze-zuerich', label: 'Indoor-Spielplätze in Zürich' },
    { href: '/schwimmbaeder', label: 'Alle Schwimmbäder & Badis der Schweiz' }
  ]
};

// German Blog 4: Indoor Spielplätze Bern (6 Spots)
const bernIndoorEn = blogs.find(b => b.slug === 'indoor-playzones-bern');
const bernIndoorDe = {
  slug: 'indoor-spielplaetze-bern',
  lang: 'de',
  translationSlug: 'indoor-playzones-bern',
  title: 'Die besten Indoor-Spielplätze & Schlechtwetter-Tipps in Bern (Guide 2026)',
  subtitle: 'Kletterparadiese, Sinneswelten und Erlebnisbäder: Die schönsten Ausflugsziele für Familien bei Regen in Bern und Umgebung.',
  metaDescription: 'Die besten Indoor-Spielplätze und Schlechtwetter-Ausflüge in Bern für Kinder: Bimano, Sensorium Rüttihubelbad, BEO Funpark, Bernaqua und Museum für Kommunikation im Familien-Check.',
  category: 'Indoor-Spielplätze · Bern',
  readTime: '9 Min. Lesezeit',
  publishedAt: '2026-11-20',
  heroImage: bernIndoorEn.heroImage,
  intro: 'Wenn es in der Bundesstadt regnet, müssen Familien keineswegs zu Hause bleiben. Rund um Bern locken aussergewöhnliche Indoor-Erlebniswelten: von urbanen Boulderhallen mit riesigem Holzspielplatz über das geheimnisvolle Sensorium im Emmental bis zum futuristischen Erlebnisbad Bernaqua im Westside.',
  items: bernIndoorEn.items.map(it => ({
    ...it,
    badge: it.badge ? it.badge.replace('Indoor Bouldering & Playpark', 'Indoor-Bouldern & Spielpark').replace('Sensory Science Center', 'Sinnes-Erlebniswelt').replace('Water Park & Thermal World', 'Erlebnisbad & Thermalwelt').replace('Interactive Communication & Games', 'Mitmach-Museum & Games') : ''
  })),
  internalLinks: [
    { href: '/de/blog/ausfluege-kinder-zuerich-schlechtwetter', label: 'Zürich Schlechtwetter-Guide' },
    { href: '/de/blog/thermalbaeder-mineralbaeder-familien-schweiz', label: 'Thermalbäder für Familien' },
    { href: '/spielplaetze/bern', label: 'Spielplätze im Kanton Bern' }
  ]
};

// German Blog 5: Indoor Spielplätze Luzern (6 Spots)
const lucerneIndoorEn = blogs.find(b => b.slug === 'indoor-playzones-lucerne');
const lucerneIndoorDe = {
  slug: 'indoor-spielplaetze-luzern',
  lang: 'de',
  translationSlug: 'indoor-playzones-lucerne',
  title: 'Die besten Indoor-Spielplätze & Ausflugsziele in Luzern (Guide 2026)',
  subtitle: 'Vom weltberühmten Verkehrshaus bis zu Kletterhallen und Erlebnisbädern: Familien-Tipps für Regentage rund um den Vierwaldstättersee.',
  metaDescription: 'Die besten Indoor-Spielplätze und Ausflugsziele bei Regen in Luzern für Kinder: Verkehrshaus der Schweiz, Hallenbäder Allmend & Mooshüsli, Pilatus Indoor und mehr im Familien-Check.',
  category: 'Indoor-Spielplätze · Luzern',
  readTime: '9 Min. Lesezeit',
  publishedAt: '2026-11-20',
  heroImage: lucerneIndoorEn.heroImage,
  intro: 'Rund um den Vierwaldstättersee und die Leuchtenstadt Luzern gibt es auch bei verregnetem Wetter jede Menge zu entdecken. Allen voran steht das weltberühmte Verkehrshaus der Schweiz, ergänzt durch moderne Kletterhallen, interaktive Museen und familienfreundliche Hallenbäder.',
  items: lucerneIndoorEn.items.map(it => ({
    ...it,
    badge: it.badge ? it.badge.replace('Swiss Museum of Transport', 'Verkehrshaus der Schweiz').replace('Indoor Pool & Slides', 'Hallenbad & Rutschen').replace('Climbing & Bouldering', 'Klettern & Bouldern') : ''
  })),
  internalLinks: [
    { href: '/de/blog/indoor-spielplaetze-zuerich', label: 'Indoor-Spielplätze in Zürich' },
    { href: '/de/blog/thermalbaeder-mineralbaeder-familien-schweiz', label: 'Thermalbäder für Familien' },
    { href: '/spielplaetze/luzern', label: 'Spielplätze im Kanton Luzern' }
  ]
};

// German Blog 6: Indoor Spielplätze Basel (6 Spots)
const baselIndoorEn = blogs.find(b => b.slug === 'indoor-playzones-basel');
const baselIndoorDe = {
  slug: 'indoor-spielplaetze-basel',
  lang: 'de',
  translationSlug: 'indoor-playzones-basel',
  title: 'Die besten Indoor-Spielplätze & Familien-Ausflüge in Basel (Guide 2026)',
  subtitle: 'Trampolinhallen, Kindermuseen und tropische Tierhäuser: Die besten Adressen für Kinder bei Regen in der Region Basel.',
  metaDescription: 'Die besten Indoor-Spielplätze und Familien-Ausflugsziele bei Regen in Basel: Jump Factory, Kindermuseum, Zoo Basel Vivarium, Aquabasilea und mehr im detaillierten Check.',
  category: 'Indoor-Spielplätze · Basel',
  readTime: '9 Min. Lesezeit',
  publishedAt: '2026-11-20',
  heroImage: baselIndoorEn.heroImage,
  intro: 'Die Kulturstadt am Rheinknie hält auch für Schlechtwettertage grossartige Familien-Erlebnisse bereit: von rasanten Trampolin-Arenen und dem beliebten Spielzeug Welten Museum bis zu den tropischen Warmhäusern des «Zolli» und dem grossen Wasserpark Aquabasilea.',
  items: baselIndoorEn.items.map(it => ({
    ...it,
    badge: it.badge ? it.badge.replace('Trampoline Arena', 'Trampolinhalle').replace('Interactive Museum', 'Mitmach-Museum').replace('Indoor Zoo & Vivarium', 'Tropen-Vivarium Zoo Basel') : ''
  })),
  internalLinks: [
    { href: '/de/blog/ausfluege-kinder-zuerich-schlechtwetter', label: 'Zürich Schlechtwetter-Guide' },
    { href: '/de/blog/thermalbaeder-mineralbaeder-familien-schweiz', label: 'Thermalbäder für Familien' },
    { href: '/spielplaetze/basel-stadt', label: 'Spielplätze in Basel-Stadt' }
  ]
};

// Add all German posts (avoid duplicates)
const germanPosts = [zurichRainyDe, zhIndoorDe, spasDe, bernIndoorDe, lucerneIndoorDe, baselIndoorDe];

germanPosts.forEach(gp => {
  const existingIdx = blogs.findIndex(b => b.slug === gp.slug);
  if (existingIdx >= 0) {
    blogs[existingIdx] = gp;
    console.log('Updated existing German post:', gp.slug);
  } else {
    blogs.push(gp);
    console.log('Added new German post:', gp.slug);
  }
});

// Write back blog_posts.js
const fileContent = 'const BLOG_POSTS = ' + JSON.stringify(blogs, null, 2) + ';\n\nmodule.exports = BLOG_POSTS;\n';
fs.writeFileSync(blogPostsPath, fileContent, 'utf8');
console.log('Successfully written blog_posts.js! Total posts:', blogs.length);
