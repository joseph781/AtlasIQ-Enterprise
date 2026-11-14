/**
 * AtlasIQ Enterprise v4.0 - Service Worker, Concurrency-Controlled OSINT Crawler & SidePanel Router
 * Grade: Silicon Valley Principal Engineering
 */

const EMAIL_BLACKLIST = new Set([
    "domain.com", "email.com", "example.com", "yourname.com", "sentry.io", "sentry-next.wixpress.com",
    "wixpress.com", "wix.com", "shopify.com", "squarespace.com", "gravatar.com", "w3.org", "schema.org",
    "noreply", "no-reply", "mailer-daemon", "abuse", "postmaster", "wordpress.org", "cloudflare.com"
]);

const FILE_EXTENSIONS_BLACKLIST = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".ico", ".woff", ".woff2", ".mp4", ".pdf"
]);

const SOCIAL_PATTERNS = {
    instagram: /(?:https?:)?\/\/(?:www\.)?(?:instagram\.com|instagr\.am)\/([A-Za-z0-9_.]{2,30})\/?/i,
    facebook: /(?:https?:)?\/\/(?:www\.)?(?:facebook|fb)\.com\/([A-Za-z0-9_.-]{3,50})\/?/i,
    linkedin: /(?:https?:)?\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school)\/([A-Za-z0-9_.-]{3,60})\/?/i,
    twitter: /(?:https?:)?\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,20})\/?/i,
    youtube: /(?:https?:)?\/\/(?:www\.)?youtube\.com\/(?:@[A-Za-z0-9_.-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9_-]+)\/?/i,
    tiktok: /(?:https?:)?\/\/(?:www\.)?tiktok\.com\/(@[A-Za-z0-9_.-]+)\/?/i
};

const CONTACT_PATHS = [
    "/contacto", "/contact", "/aviso-legal", "/about",
    "/nosotros", "/quienes-somos", "/politica-de-privacidad", "/legal"
];

// Controlled Concurrency Semaphore (Prevents socket exhaustion & bans when scraping 500+ leads)
const MAX_CONCURRENT_CRAWLS = 4;
let activeCrawls = 0;
const crawlWaitQueue = [];

function acquireCrawlSlot() {
    if (activeCrawls < MAX_CONCURRENT_CRAWLS) {
        activeCrawls++;
        return Promise.resolve();
    }
    return new Promise((resolve) => crawlWaitQueue.push(resolve));
}

function releaseCrawlSlot() {
    activeCrawls = Math.max(0, activeCrawls - 1);
    if (crawlWaitQueue.length > 0) {
        activeCrawls++;
        const next = crawlWaitQueue.shift();
        next();
    }
}

// Persistent Domain Cache backed by chrome.storage.local (survives MV3 Service Worker sleep!)
const memoryDomainCache = new Map();
let persistentCacheLoaded = false;

async function ensurePersistentCacheLoaded() {
    if (persistentCacheLoaded) return;
    persistentCacheLoaded = true;
    try {
        const stored = await chrome.storage.local.get(["atlasiq_domain_osint_cache"]);
        if (stored && stored.atlasiq_domain_osint_cache && typeof stored.atlasiq_domain_osint_cache === "object") {
            const now = Date.now();
            for (const [k, entry] of Object.entries(stored.atlasiq_domain_osint_cache)) {
                if (entry && (now - (entry.ts || 0)) < 7 * 86400000) {
                    memoryDomainCache.set(k, entry.data);
                }
            }
        }
    } catch (e) {}
}

let cacheFlushTimer = null;
function persistDomainCacheEntry(domainKey, data) {
    memoryDomainCache.set(domainKey, data);
    if (cacheFlushTimer) clearTimeout(cacheFlushTimer);
    cacheFlushTimer = setTimeout(async () => {
        try {
            const obj = {};
            // Cap persistent cache to most recent 600 domains to keep storage lean
            const entries = Array.from(memoryDomainCache.entries()).slice(-600);
            for (const [k, v] of entries) {
                obj[k] = { ts: Date.now(), data: v };
            }
            await chrome.storage.local.set({ atlasiq_domain_osint_cache: obj });
        } catch (e) {}
    }, 1500);
}

// Offscreen Document Manager for real DOMParser & JSON-LD extraction
let creatingOffscreen = null;
async function ensureOffscreenDocument() {
    if (!chrome.offscreen) return false;
    try {
        if (chrome.runtime.getContexts) {
            const contexts = await chrome.runtime.getContexts({
                contextTypes: ["OFFSCREEN_DOCUMENT"]
            });
            if (contexts.length > 0) return true;
        }
        if (creatingOffscreen) {
            await creatingOffscreen;
            return true;
        }
        creatingOffscreen = chrome.offscreen.createDocument({
            url: "offscreen.html",
            reasons: ["DOM_PARSER"],
            justification: "Parse Schema.org JSON-LD, fiscal metadata, and obfuscated DOM contacts safely."
        });
        await creatingOffscreen;
        creatingOffscreen = null;
        return true;
    } catch (e) {
        creatingOffscreen = null;
        return false;
    }
}

async function parseViaOffscreen(html) {
    try {
        const ready = await ensureOffscreenDocument();
        if (!ready) return null;
        return await chrome.runtime.sendMessage({
            target: "offscreen",
            action: "parseOsintHtml",
            html: html.substring(0, 350000)
        });
    } catch (e) {
        return null;
    }
}

function decodeCloudflareEmail(encoded) {
    try {
        let email = "";
        const key = parseInt(encoded.substring(0, 2), 16);
        for (let n = 2; n < encoded.length; n += 2) {
            const charCode = parseInt(encoded.substring(n, n + 2), 16) ^ key;
            email += String.fromCharCode(charCode);
        }
        return email;
    } catch (e) {
        return "";
    }
}

function cleanSocialUrl(url) {
    try {
        const normalized = url.startsWith("//") ? "https:" + url : url;
        const u = new URL(normalized);
        const badPaths = ["/sharer", "/share", "/intent", "/home", "/search", "/login", "/privacy", "/terms", "/plugins", "/tr"];
        if (badPaths.some(p => u.pathname.toLowerCase().startsWith(p))) return "";
        return `${u.origin}${u.pathname}`;
    } catch (e) {
        return "";
    }
}

async function fetchHtmlWithTimeout(url, timeoutMs = 7500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let cleanUrl = url.trim();
        if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl;
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) cleanUrl = "https://" + cleanUrl;

        const response = await fetch(cleanUrl, {
            signal: controller.signal,
            redirect: "follow",
            headers: {
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
            }
        });
        if (!response.ok) return "";
        return (await response.text()) || "";
    } catch (err) {
        return "";
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * 26+ Enterprise Tech Stack, Ad Pixels, CRM, E-Commerce & Chat Signatures
 */
function detectTechStack(html) {
    if (!html) return { stack: [], adSpendActive: false };
    const lower = html.toLowerCase();
    const stack = [];
    let adSpendActive = false;

    // CMS & E-Commerce
    if (lower.includes("wp-content") || lower.includes("wp-includes")) stack.push("WordPress");
    if (lower.includes("woocommerce")) stack.push("WooCommerce");
    if (lower.includes("cdn.shopify.com") || lower.includes("shopify.theme")) stack.push("Shopify");
    if (lower.includes("static.parastorage.com") || lower.includes("wix.com")) stack.push("Wix");
    if (lower.includes("squarespace.com") || lower.includes("static1.squarespace.com")) stack.push("Squarespace");
    if (lower.includes("assets.website-files.com") || lower.includes("webflow")) stack.push("Webflow");
    if (lower.includes("prestashop")) stack.push("PrestaShop");
    if (lower.includes("magento") || lower.includes("mage/cookies")) stack.push("Magento");
    if (lower.includes("_next/static") || lower.includes("__next_data__")) stack.push("Next.js");
    if (lower.includes("astro-island") || lower.includes("_astro/")) stack.push("Astro");

    // Advertising & Retargeting Pixels (Signals Active Ad Budget!)
    if (lower.includes("connect.facebook.net") || lower.includes("fbq('init'") || lower.includes("fbq(\"init\"")) {
        stack.push("Meta Pixel");
        adSpendActive = true;
    }
    if (lower.includes("gtag('config', 'aw-") || lower.includes("googleadservices.com/pagead/conversion")) {
        stack.push("Google Ads Pixel");
        adSpendActive = true;
    }
    if (lower.includes("analytics.tiktok.com") || lower.includes("ttq.load")) {
        stack.push("TikTok Pixel");
        adSpendActive = true;
    }
    if (lower.includes("snap.licdn.com/li.lms-analytics") || lower.includes("_linkedin_partner_id")) {
        stack.push("LinkedIn Insight");
        adSpendActive = true;
    }

    // Analytics & CRO
    if (lower.includes("googletagmanager.com/gtm.js") || /gtm-[a-z0-9]{5,8}/i.test(lower)) stack.push("GTM");
    if (lower.includes("google-analytics.com") || lower.includes("gtag('config', 'g-")) stack.push("GA4");
    if (lower.includes("static.hotjar.com")) stack.push("Hotjar");
    if (lower.includes("clarity.ms/tag")) stack.push("MS Clarity");

    // CRM, Automation & Live Chat
    if (lower.includes("js.hs-scripts.com") || lower.includes("hubspot")) stack.push("HubSpot");
    if (lower.includes("klaviyo.com")) stack.push("Klaviyo");
    if (lower.includes("chimpstatic.com") || lower.includes("mailchimp")) stack.push("Mailchimp");
    if (lower.includes("widget.intercom.io")) stack.push("Intercom");
    if (lower.includes("code.tidio.co")) stack.push("Tidio Chat");
    if (lower.includes("client.crisp.chat")) stack.push("Crisp Chat");
    if (lower.includes("api.whatsapp.com") || lower.includes("wa.me/")) stack.push("WhatsApp Web");
    if (lower.includes("js.stripe.com")) stack.push("Stripe");
    if (lower.includes("mercadopago")) stack.push("MercadoPago");

    return {
        stack: Array.from(new Set(stack)),
        adSpendActive
    };
}

function harvestEmailsAndSocialsFromRawHtml(html, emailsSet, socialSets) {
    if (!html) return;

    const cfMatches = html.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi);
    for (const m of cfMatches) {
        const dec = decodeCloudflareEmail(m[1]);
        if (dec && dec.includes("@")) emailsSet.add(dec.toLowerCase());
    }

    const mailtoMatches = html.matchAll(/href=["']mailto:([^"?'>\s]+)/gi);
    for (const m of mailtoMatches) {
        const em = decodeURIComponent(m[1]).trim().toLowerCase();
        if (em.includes("@")) emailsSet.add(em);
    }

    const emailRegex = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g;
    (html.match(emailRegex) || []).forEach(e => emailsSet.add(e.toLowerCase()));

    for (const [platform, regex] of Object.entries(SOCIAL_PATTERNS)) {
        const matches = html.matchAll(new RegExp(regex.source, "gi"));
        for (const m of matches) {
            const cleanUrl = cleanSocialUrl(m[0]);
            if (cleanUrl) socialSets[platform].add(cleanUrl);
        }
    }
}

async function enrichWebsite(websiteUrl, businessName = "", deepCrawl = true) {
    if (!websiteUrl) return {};
    await ensurePersistentCacheLoaded();

    let domain = "";
    try {
        const u = new URL(websiteUrl.startsWith("http") ? websiteUrl : "https://" + websiteUrl);
        domain = u.hostname.replace(/^www\./, "").toLowerCase();
    } catch (e) {}

    const cacheKey = domain || websiteUrl.toLowerCase();
    if (memoryDomainCache.has(cacheKey)) {
        return memoryDomainCache.get(cacheKey);
    }

    await acquireCrawlSlot();
    try {
        // Re-check cache after acquiring slot
        if (memoryDomainCache.has(cacheKey)) {
            return memoryDomainCache.get(cacheKey);
        }

        const result = {
            email: "",
            all_emails: [],
            phone: "",
            instagram: "",
            facebook: "",
            linkedin: "",
            twitter: "",
            youtube: "",
            tiktok: "",
            tech_stack: "",
            ad_spend_active: false,
            meta_description: "",
            legal_name: "",
            tax_id: "",
            decision_maker: "",
            booking_platform: "",
            booking_url: "",
            schema_type: ""
        };

        const emailsFound = new Set();
        const socialFound = {
            instagram: new Set(),
            facebook: new Set(),
            linkedin: new Set(),
            twitter: new Set(),
            youtube: new Set(),
            tiktok: new Set()
        };

        const html = await fetchHtmlWithTimeout(websiteUrl, 7500);
        if (!html) {
            persistDomainCacheEntry(cacheKey, result);
            return result;
        }

        // Meta Description
        const metaDescMatch =
            html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
            html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
        if (metaDescMatch && metaDescMatch[1]) {
            result.meta_description = metaDescMatch[1].trim().substring(0, 260);
        }

        // Tech Stack & Active Ad Spend
        const techInfo = detectTechStack(html);
        result.tech_stack = techInfo.stack.join(", ");
        result.ad_spend_active = techInfo.adSpendActive;

        // Direct Phone / WhatsApp Link
        const waMatch = html.match(/(?:api\.whatsapp\.com\/send\?phone=|wa\.me\/)(\d{8,15})/i);
        const telMatch = html.match(/href=["']tel:([^"'>\s]+)/i);
        if (waMatch && waMatch[1]) {
            result.phone = "+" + waMatch[1];
        } else if (telMatch && telMatch[1]) {
            result.phone = telMatch[1].replace(/[^\d+]/g, "").trim();
        }

        // Raw HTML Emails & Socials
        harvestEmailsAndSocialsFromRawHtml(html, emailsFound, socialFound);

        // Deep Offscreen DOM + Schema.org JSON-LD + Fiscal OSINT
        const osint = await parseViaOffscreen(html);
        if (osint) {
            if (osint.legalName) result.legal_name = osint.legalName;
            if (osint.taxId) result.tax_id = osint.taxId;
            if (osint.decisionMaker) result.decision_maker = osint.decisionMaker;
            if (osint.bookingPlatform) result.booking_platform = osint.bookingPlatform;
            if (osint.bookingUrl) result.booking_url = osint.bookingUrl;
            if (osint.schemaType) result.schema_type = osint.schemaType;
            (osint.jsonLdEmails || []).forEach(e => emailsFound.add(e));
            (osint.deobfuscatedEmails || []).forEach(e => emailsFound.add(e));
            if (!result.phone && osint.jsonLdPhones?.length) {
                result.phone = osint.jsonLdPhones[0];
            }
            (osint.jsonLdSocials || []).forEach(s => {
                for (const [platform, regex] of Object.entries(SOCIAL_PATTERNS)) {
                    if (regex.test(s)) {
                        const clean = cleanSocialUrl(s);
                        if (clean) socialFound[platform].add(clean);
                    }
                }
            });
        }

        // Subpage Crawl (/contacto, /aviso-legal, /about) when missing email or fiscal/executive data
        if (deepCrawl && domain && (emailsFound.size === 0 || !result.legal_name || !result.decision_maker)) {
            const subLinks = CONTACT_PATHS.slice(0, 3).map(p => `https://${domain}${p}`);
            const subHtmls = await Promise.all(subLinks.map(link => fetchHtmlWithTimeout(link, 4500)));

            for (const subHtml of subHtmls) {
                if (!subHtml) continue;
                harvestEmailsAndSocialsFromRawHtml(subHtml, emailsFound, socialFound);

                if (!result.legal_name || !result.tax_id || !result.decision_maker) {
                    const subOsint = await parseViaOffscreen(subHtml);
                    if (subOsint) {
                        if (!result.legal_name && subOsint.legalName) result.legal_name = subOsint.legalName;
                        if (!result.tax_id && subOsint.taxId) result.tax_id = subOsint.taxId;
                        if (!result.decision_maker && subOsint.decisionMaker) result.decision_maker = subOsint.decisionMaker;
                        (subOsint.deobfuscatedEmails || []).forEach(e => emailsFound.add(e));
                    }
                }
                if (emailsFound.size > 0 && result.legal_name) break;
            }
        }

        // Rank & Filter Corporate Emails
        const validEmails = [];
        const domainEmails = [];
        const executiveEmails = [];

        for (const rawEmail of emailsFound) {
            const em = rawEmail.replace(/^u003e/i, "").replace(/^20/, "").trim().toLowerCase();
            const hasBadExt = Array.from(FILE_EXTENSIONS_BLACKLIST).some(ext => em.endsWith(ext));
            const isBlacklisted = Array.from(EMAIL_BLACKLIST).some(bl => em.includes(bl));

            if (!hasBadExt && !isBlacklisted && em.length >= 6 && em.includes("@")) {
                validEmails.push(em);
                if (domain && em.endsWith("@" + domain)) {
                    domainEmails.push(em);
                    if (!/^(info|contacto|contact|hola|ventas|admin|soporte|administracion)@/i.test(em)) {
                        executiveEmails.push(em);
                    }
                }
            }
        }

        result.email = executiveEmails[0] || domainEmails[0] || validEmails[0] || "";
        result.all_emails = Array.from(new Set(validEmails)).slice(0, 8);

        for (const platform of Object.keys(socialFound)) {
            if (socialFound[platform].size > 0) {
                result[platform] = Array.from(socialFound[platform])[0];
            }
        }

        persistDomainCacheEntry(cacheKey, result);
        return result;
    } finally {
        releaseCrawlSlot();
    }
}

function openOrFocusDashboard() {
    const dashboardPath = chrome.runtime.getURL("dashboard.html");
    chrome.tabs.query({}, (tabs) => {
        const existingTab = tabs.find(t => t.url && (t.url.includes("dashboard.html") || t.url === dashboardPath));
        if (existingTab && existingTab.id) {
            chrome.tabs.update(existingTab.id, { active: true });
            if (existingTab.windowId) {
                chrome.windows.update(existingTab.windowId, { focused: true });
            }
        } else {
            chrome.tabs.create({ url: dashboardPath });
        }
    });
}

function primeUserLocation() {
    chrome.storage.local.get(["user_location"], (data) => {
        if (!data.user_location) {
            fetch("https://ipwho.is/")
                .then(r => r.json())
                .then(locData => {
                    if (locData && locData.success !== false && locData.latitude && locData.longitude) {
                        chrome.storage.local.set({
                            user_location: {
                                lat: locData.latitude,
                                lon: locData.longitude,
                                city: locData.city || "",
                                region: locData.region || "",
                                country: locData.country || "",
                                source: "ip",
                                label: `${locData.city || locData.region || "Ubicación"}, ${locData.country || ""}`.trim().replace(/^,|,$/g, ""),
                                detectedAt: Date.now()
                            }
                        });
                    }
                })
                .catch(() => {});
        }
    });
}

if (chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
        primeUserLocation();
        if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
        }
    });
}

if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => primeUserLocation());
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || request.target === "offscreen") return false;

    if (request.action === "openPage") {
        if (request.data && Array.isArray(request.data)) {
            chrome.storage.local.set({ leads: request.data, lastSync: Date.now() }, () => openOrFocusDashboard());
        } else {
            openOrFocusDashboard();
        }
        sendResponse({ ok: true });
        return false;
    }

    if (request.action === "openSidePanel") {
        (async () => {
            try {
                const winId = sender?.tab?.windowId || (await chrome.windows.getCurrent()).id;
                if (chrome.sidePanel && chrome.sidePanel.open) {
                    await chrome.sidePanel.open({ windowId: winId });
                    sendResponse({ ok: true });
                } else {
                    openOrFocusDashboard();
                    sendResponse({ ok: true, fallback: true });
                }
            } catch (e) {
                openOrFocusDashboard();
                sendResponse({ ok: false, error: e.message });
            }
        })();
        return true;
    }

    if (request.action === "email" || request.action === "enrichLead") {
        (async () => {
            try {
                const data = request.data || {};
                const enrichment = await enrichWebsite(data.website, data.name, data.deep_search !== false);
                sendResponse(enrichment);
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }

    if (request.action === "fetchUrl") {
        (async () => {
            const html = await fetchHtmlWithTimeout(request.url, 8000);
            sendResponse({ html });
        })();
        return true;
    }

    return false;
});
