const fs = require('fs');
const path = require('path');

let dataDir = __dirname;
let analyticsFilePath = null;
let saveTimer = null;
let isDirty = false;

// In-memory sessions per date to calculate unique daily visitors accurately
const dailySessionsSet = new Map();

let store = {
    summary: {
        total_pageviews: 0,
        total_sessions: 0,
        total_spot_views: 0,
        total_hike_views: 0,
        total_event_views: 0,
        total_blog_views: 0,
        total_group_hikes: 0,
        first_recorded: null,
        last_recorded: null
    },
    daily: {},
    popular: {
        spots: {},
        hikes: {},
        events: {},
        blogs: {},
        features: {}
    },
    recent: []
};

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function init(options = {}) {
    dataDir = options.dataDir || __dirname;
    analyticsFilePath = path.join(dataDir, 'analytics.json');

    if (fs.existsSync(analyticsFilePath)) {
        try {
            const raw = fs.readFileSync(analyticsFilePath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                store = {
                    summary: { ...store.summary, ...(parsed.summary || {}) },
                    daily: parsed.daily || {},
                    popular: {
                        spots: (parsed.popular && parsed.popular.spots) || {},
                        hikes: (parsed.popular && parsed.popular.hikes) || {},
                        events: (parsed.popular && parsed.popular.events) || {},
                        blogs: (parsed.popular && parsed.popular.blogs) || {},
                        features: (parsed.popular && parsed.popular.features) || {}
                    },
                    recent: Array.isArray(parsed.recent) ? parsed.recent : []
                };
            }
        } catch (e) {
            console.error('[Analytics] Failed to load analytics.json:', e.message);
        }
    }

    // Seed existing historical Group Hike stats if present in group_checkins.json
    seedHistoricalGroupHikes(dataDir);

    // Ensure save on process termination
    process.on('SIGINT', flush);
    process.on('SIGTERM', flush);
}

function seedHistoricalGroupHikes(dir) {
    try {
        const ghPath = path.join(dir, 'group_checkins.json');
        if (fs.existsSync(ghPath)) {
            const raw = fs.readFileSync(ghPath, 'utf-8');
            const data = JSON.parse(raw);
            const groups = data.groups || data;
            const groupList = Array.isArray(groups) ? groups : Object.values(groups);
            
            const totalHikes = groupList.length;
            if (totalHikes > 0 && (!store.summary.total_group_hikes || store.summary.total_group_hikes < totalHikes)) {
                store.summary.total_group_hikes = Math.max(store.summary.total_group_hikes || 0, totalHikes);
                store.popular.features['group_hike_created'] = Math.max(store.popular.features['group_hike_created'] || 0, totalHikes);
                isDirty = true;
                scheduleSave();
            }
        }
    } catch (e) {
        console.warn('[Analytics] Could not seed historical group hikes:', e.message);
    }
}

function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        flush();
    }, 3000);
}

function flush() {
    if (!isDirty || !analyticsFilePath) return;
    try {
        fs.writeFileSync(analyticsFilePath, JSON.stringify(store, null, 2), 'utf-8');
        isDirty = false;
    } catch (e) {
        console.error('[Analytics] Error writing analytics.json:', e.message);
    }
}

function trackEvent(evt = {}) {
    const today = getTodayString();
    const nowIso = new Date().toISOString();

    if (!store.summary.first_recorded) {
        store.summary.first_recorded = nowIso;
    }
    store.summary.last_recorded = nowIso;

    // Ensure daily structure
    if (!store.daily[today]) {
        store.daily[today] = {
            pageviews: 0,
            sessions: 0,
            spot_views: 0,
            hike_views: 0,
            event_views: 0,
            blog_views: 0,
            group_hike_actions: 0,
            languages: { en: 0, de: 0 },
            devices: { mobile: 0, desktop: 0, tablet: 0 },
            referrers: {}
        };
    }

    const dayObj = store.daily[today];

    // Session tracking
    const sid = evt.sid || 'anon';
    if (!dailySessionsSet.has(today)) {
        dailySessionsSet.set(today, new Set());
    }
    const daySessions = dailySessionsSet.get(today);
    if (!daySessions.has(sid)) {
        daySessions.add(sid);
        dayObj.sessions = (dayObj.sessions || 0) + 1;
        store.summary.total_sessions = (store.summary.total_sessions || 0) + 1;
    }

    // Language
    const lang = (evt.lang === 'de') ? 'de' : 'en';
    dayObj.languages[lang] = (dayObj.languages[lang] || 0) + 1;

    // Device
    const dev = (evt.device === 'mobile' || evt.device === 'tablet') ? evt.device : 'desktop';
    dayObj.devices[dev] = (dayObj.devices[dev] || 0) + 1;

    // Referrer
    const ref = (evt.referrer || 'direct').toLowerCase();
    dayObj.referrers[ref] = (dayObj.referrers[ref] || 0) + 1;

    // Event Types
    const type = evt.type || 'pageview';
    const targetId = evt.targetId || '';
    const title = evt.targetTitle || targetId || 'Unknown';
    const targetType = evt.targetType || '';

    if (type === 'pageview') {
        dayObj.pageviews = (dayObj.pageviews || 0) + 1;
        store.summary.total_pageviews = (store.summary.total_pageviews || 0) + 1;
    } else if (type === 'blog_view') {
        dayObj.blog_views = (dayObj.blog_views || 0) + 1;
        store.summary.total_blog_views = (store.summary.total_blog_views || 0) + 1;
        if (targetId) {
            if (!store.popular.blogs[targetId]) {
                store.popular.blogs[targetId] = { slug: targetId, title: title, lang: lang, views: 0 };
            }
            store.popular.blogs[targetId].views++;
        }
    } else if (type === 'item_view') {
        if (targetType === 'event') {
            dayObj.event_views = (dayObj.event_views || 0) + 1;
            store.summary.total_event_views = (store.summary.total_event_views || 0) + 1;
            if (targetId) {
                if (!store.popular.events[targetId]) {
                    store.popular.events[targetId] = { id: targetId, title: title, type: 'event', views: 0 };
                }
                store.popular.events[targetId].views++;
            }
        } else if (targetType === 'hike') {
            dayObj.hike_views = (dayObj.hike_views || 0) + 1;
            store.summary.total_hike_views = (store.summary.total_hike_views || 0) + 1;
            if (targetId) {
                if (!store.popular.hikes[targetId]) {
                    store.popular.hikes[targetId] = { id: targetId, title: title, type: 'hike', views: 0 };
                }
                store.popular.hikes[targetId].views++;
            }
        } else {
            dayObj.spot_views = (dayObj.spot_views || 0) + 1;
            store.summary.total_spot_views = (store.summary.total_spot_views || 0) + 1;
            if (targetId) {
                if (!store.popular.spots[targetId]) {
                    store.popular.spots[targetId] = { id: targetId, title: title, type: targetType || 'spot', views: 0 };
                }
                store.popular.spots[targetId].views++;
            }
        }
    } else if (type === 'group_hike') {
        dayObj.group_hike_actions = (dayObj.group_hike_actions || 0) + 1;
        store.summary.total_group_hikes = (store.summary.total_group_hikes || 0) + 1;
        const featKey = targetId || 'group_hike_created';
        store.popular.features[featKey] = (store.popular.features[featKey] || 0) + 1;
    } else if (type === 'interaction') {
        const featKey = targetId || 'action';
        store.popular.features[featKey] = (store.popular.features[featKey] || 0) + 1;
    }

    // Add to rolling recent feed (max 40)
    store.recent.unshift({
        ts: nowIso,
        type: type,
        targetType: targetType,
        title: title,
        lang: lang,
        device: dev
    });
    if (store.recent.length > 40) {
        store.recent.pop();
    }

    isDirty = true;
    scheduleSave();
}

function getStats() {
    // Sort popular items
    const sortList = (obj) => Object.values(obj || {}).sort((a, b) => (b.views || b.count || 0) - (a.views || a.count || 0));

    // Aggregate 7-day and 30-day metrics
    const dates = Object.keys(store.daily || {}).sort();
    const last7Dates = dates.slice(-7);
    const last30Dates = dates.slice(-30);

    const sumDaily = (arr) => {
        return arr.reduce((acc, d) => {
            const row = store.daily[d] || {};
            acc.pageviews += (row.pageviews || 0);
            acc.sessions += (row.sessions || 0);
            acc.spot_views += (row.spot_views || 0);
            acc.hike_views += (row.hike_views || 0);
            acc.event_views += (row.event_views || 0);
            acc.blog_views += (row.blog_views || 0);
            acc.group_hike_actions += (row.group_hike_actions || 0);
            return acc;
        }, { pageviews: 0, sessions: 0, spot_views: 0, hike_views: 0, event_views: 0, blog_views: 0, group_hike_actions: 0 });
    };

    const todayStr = getTodayString();
    const todayStats = store.daily[todayStr] || {
        pageviews: 0, sessions: 0, spot_views: 0, hike_views: 0, event_views: 0, blog_views: 0, group_hike_actions: 0
    };

    // Aggregate totals for devices, languages, referrers
    const totals = {
        languages: { en: 0, de: 0 },
        devices: { mobile: 0, desktop: 0, tablet: 0 },
        referrers: {}
    };

    for (const d of dates) {
        const row = store.daily[d];
        if (row.languages) {
            totals.languages.en += (row.languages.en || 0);
            totals.languages.de += (row.languages.de || 0);
        }
        if (row.devices) {
            totals.devices.mobile += (row.devices.mobile || 0);
            totals.devices.desktop += (row.devices.desktop || 0);
            totals.devices.tablet += (row.devices.tablet || 0);
        }
        if (row.referrers) {
            for (const [k, v] of Object.entries(row.referrers)) {
                totals.referrers[k] = (totals.referrers[k] || 0) + v;
            }
        }
    }

    // Read live group hikes list for rich group hike report
    let activeGroupHikes = [];
    try {
        const ghPath = path.join(dataDir, 'group_checkins.json');
        if (fs.existsSync(ghPath)) {
            const raw = fs.readFileSync(ghPath, 'utf-8');
            const parsed = JSON.parse(raw);
            const groups = parsed.groups || parsed;
            const list = Array.isArray(groups) ? groups : Object.values(groups);
            activeGroupHikes = list.map(g => ({
                groupId: g.groupId || g.id,
                spotId: g.spotId,
                date: g.date,
                time: g.time,
                meetingPoint: g.meetingPoint,
                createdAt: g.createdAt,
                checkinsCount: (g.checkins || []).length,
                pingsCount: (g.pings || []).length,
                participants: Array.from(new Set([
                    ...(g.checkins || []).map(c => c.name),
                    ...(g.pings || []).map(p => p.name)
                ])).filter(Boolean)
            })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        }
    } catch (e) {
        // ignore
    }

    return {
        summary: store.summary,
        today: todayStats,
        last7Days: sumDaily(last7Dates),
        last30Days: sumDaily(last30Dates),
        dailyTimeline: dates.slice(-30).map(d => ({
            date: d,
            pageviews: store.daily[d].pageviews || 0,
            sessions: store.daily[d].sessions || 0,
            spots: (store.daily[d].spot_views || 0) + (store.daily[d].hike_views || 0) + (store.daily[d].event_views || 0),
            blogs: store.daily[d].blog_views || 0
        })),
        topSpots: sortList(store.popular.spots).slice(0, 15),
        topHikes: sortList(store.popular.hikes).slice(0, 15),
        topEvents: sortList(store.popular.events).slice(0, 15),
        topBlogs: sortList(store.popular.blogs).slice(0, 15),
        features: store.popular.features || {},
        totals: totals,
        recent: store.recent.slice(0, 30),
        groupHikes: activeGroupHikes
    };
}

module.exports = {
    init,
    trackEvent,
    getStats,
    flush
};
