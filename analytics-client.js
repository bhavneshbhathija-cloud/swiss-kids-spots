(function() {
    // SwissForKids Privacy-First Analytics Tracker
    // Zero Cookies, Zero PII, Fully compliant with Swiss FADP / revDSG & EU GDPR.
    try {
        var STORAGE_KEY = 'sfk_anon_sid';
        var sid = null;
        try {
            sid = sessionStorage.getItem(STORAGE_KEY);
            if (!sid) {
                sid = 's_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
                sessionStorage.setItem(STORAGE_KEY, sid);
            }
        } catch (e) {
            sid = 'anon_' + Math.random().toString(36).substring(2, 9);
        }

        function getDevice() {
            var ua = navigator.userAgent || '';
            if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
            if (/mobile|iphone|ipod|android|blackberry|iemobile/i.test(ua)) return 'mobile';
            return 'desktop';
        }

        function getReferrer() {
            var ref = document.referrer || '';
            if (!ref) return 'direct';
            try {
                var url = new URL(ref);
                if (url.hostname.indexOf('google.') !== -1) return 'google';
                if (url.hostname.indexOf('bing.') !== -1) return 'bing';
                if (url.hostname.indexOf('instagram.com') !== -1 || url.hostname.indexOf('facebook.com') !== -1 || url.hostname.indexOf('t.co') !== -1) return 'social';
                if (url.hostname.indexOf('swissforkids.ch') !== -1 || url.hostname === window.location.hostname) return 'internal';
                return url.hostname.replace(/^www\./, '');
            } catch (e) {
                return 'other';
            }
        }

        function getLang() {
            if (window.currentLanguage) return window.currentLanguage;
            if (document.documentElement && document.documentElement.lang) {
                return document.documentElement.lang.toLowerCase().indexOf('de') !== -1 ? 'de' : 'en';
            }
            var navLang = (navigator.language || '').toLowerCase();
            return navLang.indexOf('de') !== -1 ? 'de' : 'en';
        }

        window.sfkTrack = function(eventType, data) {
            try {
                data = data || {};
                var payload = {
                    type: eventType || 'pageview',
                    targetId: data.id || data.slug || data.targetId || null,
                    targetTitle: data.title || data.name || null,
                    targetType: data.type || null,
                    category: data.category || null,
                    lang: data.lang || getLang(),
                    device: getDevice(),
                    referrer: getReferrer(),
                    path: window.location.pathname,
                    search: window.location.search,
                    sid: sid,
                    ts: Date.now()
                };

                var json = JSON.stringify(payload);
                if (navigator.sendBeacon) {
                    var blob = new Blob([json], { type: 'application/json' });
                    navigator.sendBeacon('/api/analytics/event', blob);
                } else {
                    fetch('/api/analytics/event', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: json,
                        keepalive: true
                    }).catch(function() {});
                }
            } catch (err) {
                // Ignore analytics errors to never impact site functionality
            }
        };

        // Determine if this is an SSR blog page or home SPA
        var path = window.location.pathname;
        if (path.indexOf('/blog/') !== -1 || path.indexOf('/de/blog/') !== -1) {
            var heading = document.querySelector('h1');
            var blogTitle = heading ? heading.innerText.trim() : path;
            var slug = path.split('/').filter(Boolean).pop();
            window.sfkTrack('blog_view', { id: slug, title: blogTitle, type: 'blog' });
        } else {
            // General pageview
            window.sfkTrack('pageview');
        }
    } catch (e) {
        // Safe fail
    }
})();
