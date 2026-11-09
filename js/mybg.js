/**
 * AtlasIQ Enterprise - Background Service Worker & Enrichment Engine
 * Grade: Silicon Valley Professional
 */

const EMAIL_BLACKLIST = new Set([
    "domain.com", "email.com", "example.com", "yourname.com", "sentry.io",
    "wixpress.com", "wix.com", "shopify.com", "squarespace.com", "gravatar.com",
    "noreply", "no-reply", "mailer-daemon", "abuse", "privacy", "postmaster"
]);

const FILE_EXTENSIONS_BLACKLIST = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".ico", ".woff", ".woff2"
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
    "/contacto", "/contact", "/contact-us", "/contactenos", 
    "/about", "/acerca-de", "/nosotros", "/quienes-somos", 
    "/aviso-legal", "/politica-de-privacidad", "/legal"
];

// In-memory cache for enriched domains
const enrichmentCache = new Map();

function decodeCloudflareEmail(encoded) {
    try {
        let email = "";
        const key = parseInt(encoded.substr(0, 2), 16);
        for (let n = 2; n < encoded.length; n += 2) {
            const charCode = parseInt(encoded.substr(n, 2), 16) ^ key;
            email += String.fromCharCode(charCode);
        }
        return email;
    } catch (e) {
        return "";
    }
}

function cleanSocialUrl(url, type) {
    try {
        const u = new URL(url);
        // Exclude system paths
        const badPaths = ["/sharer", "/share", "/intent", "/home", "/search", "/login", "/privacy", "/terms"];
        if (badPaths.some(p => u.pathname.startsWith(p))) return "";
        return `${u.origin}${u.pathname}`;
    } catch (e) {
        return url;
    }
}

async function fetchHtmlWithTimeout(url, timeoutMs = 8000) {
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
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
        });
        if (!response.ok) return "";
        const text = await response.text();
        return text || "";
    } catch (err) {
        return "";
    } finally {
        clearTimeout(timeout);
    }
}

// Detect popular CMS & Marketing Pixels
function detectTechStack(html) {
    if (!html) return [];
    const lower = html.toLowerCase();
    const stack = [];

    if (lower.includes("wp-content") || lower.includes("wp-includes") || lower.includes("wordpress")) {
        stack.push("WordPress");
    }
    if (lower.includes("woocommerce")) {
        stack.push("WooCommerce");
    }
    if (lower.includes("cdn.shopify.com") || lower.includes("shopify.")) {
        stack.push("Shopify");
    }
    if (lower.includes("static.parastorage.com") || lower.includes("wix.com")) {
        stack.push("Wix");
    }
    if (lower.includes("squarespace.com") || lower.includes("static1.squarespace.com")) {
        stack.push("Squarespace");
    }
    if (lower.includes("assets.website-files.com") || lower.includes("webflow")) {
        stack.push("Webflow");
    }
    if (lower.includes("prestashop")) {
        stack.push("PrestaShop");
    }

    // Pixels & Analytics
    if (lower.includes("googletagmanager.com/gtm.js") || lower.includes("gtm-")) {
        stack.push("Google Tag Manager");
    }
    if (lower.includes("google-analytics.com/analytics.js") || lower.includes("gtag('config'") || lower.includes("ga4")) {
        stack.push("Google Analytics 4");
    }
    if (lower.includes("connect.facebook.net") || lower.includes("fbq('init'")) {
        stack.push("Meta Pixel");
    }
    if (lower.includes("analytics.tiktok.com")) {
        stack.push("TikTok Pixel");
    }
    if (lower.includes("api.whatsapp.com") || lower.includes("wa.me/")) {
        stack.push("WhatsApp Widget");
    }

    return Array.from(new Set(stack));
}

async function enrichWebsite(websiteUrl, businessName = "", deepCrawl = true) {
    if (!websiteUrl) return {};
    
    // Check cache
    if (enrichmentCache.has(websiteUrl)) {
        return enrichmentCache.get(websiteUrl);
    }

    const result = {
        email: "",
        all_emails: [],
        instagram: "",
        facebook: "",
        linkedin: "",
        twitter: "",
        youtube: "",
        tiktok: "",
        tech_stack: "",
        meta_description: ""
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

    let domain = "";
    try {
        const u = new URL(websiteUrl.startsWith("http") ? websiteUrl : "https://" + websiteUrl);
        domain = u.hostname.replace(/^www\./, "").toLowerCase();
    } catch (e) {}

    const html = await fetchHtmlWithTimeout(websiteUrl);
    if (!html) {
        enrichmentCache.set(websiteUrl, result);
        return result;
    }

    // Extract Meta Description
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
    if (metaDescMatch && metaDescMatch[1]) {
        result.meta_description = metaDescMatch[1].trim().substring(0, 250);
    }

    // Detect Tech Stack
    const tech = detectTechStack(html);
    if (tech.length > 0) {
        result.tech_stack = tech.join(", ");
    }

    // Extract Phone & WhatsApp links from website HTML
    let websitePhone = "";
    const telMatch = html.match(/href=["']tel:([^"'>\s]+)/i);
    if (telMatch && telMatch[1]) {
        websitePhone = telMatch[1].replace(/[^\d+]/g, "").trim();
    }
    if (!websitePhone) {
        const waMatch = html.match(/(?:api\.whatsapp\.com\/send\?phone=|wa\.me\/)(\d{8,15})/i);
        if (waMatch && waMatch[1]) {
            websitePhone = "+" + waMatch[1];
        }
    }
    if (websitePhone) {
        result.phone = websitePhone;
    }

    // Extract Cloudflare emails
    const cfMatches = html.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi);
    for (const m of cfMatches) {
        const decoded = decodeCloudflareEmail(m[1]);
        if (decoded && decoded.includes("@")) emailsFound.add(decoded.toLowerCase());
    }

    // Extract Mailto emails
    const mailtoMatches = html.matchAll(/href=["']mailto:([^"?'>\s]+)/gi);
    for (const m of mailtoMatches) {
        const email = m[1].trim().toLowerCase();
        if (email.includes("@")) emailsFound.add(email);
    }

    // Extract standard emails via regex
    const emailRegex = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}\b/g;
    const textEmails = html.match(emailRegex) || [];
    textEmails.forEach(e => emailsFound.add(e.toLowerCase()));

    // Extract Social Links
    for (const [platform, regex] of Object.entries(SOCIAL_PATTERNS)) {
        const matches = html.matchAll(new RegExp(regex.source, "gi"));
        for (const m of matches) {
            const cleanUrl = cleanSocialUrl(m[0], platform);
            if (cleanUrl) socialFound[platform].add(cleanUrl);
        }
    }

    // If no email found and deep crawl allowed, crawl /contacto, /about, /aviso-legal
    if (deepCrawl && emailsFound.size === 0 && domain) {
        const subLinks = CONTACT_PATHS.map(p => `https://${domain}${p}`);
        
        // Concurrently check top 3 contact paths
        const contactPromises = subLinks.slice(0, 4).map(link => fetchHtmlWithTimeout(link, 4500));
        const subHtmls = await Promise.all(contactPromises);

        for (const subHtml of subHtmls) {
            if (!subHtml) continue;
            
            // CF emails in subpage
            const subCf = subHtml.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi);
            for (const m of subCf) {
                const dec = decodeCloudflareEmail(m[1]);
                if (dec && dec.includes("@")) emailsFound.add(dec.toLowerCase());
            }

            // Mailto in subpage
            const subMailto = subHtml.matchAll(/href=["']mailto:([^"?'>\s]+)/gi);
            for (const m of subMailto) {
                const em = m[1].trim().toLowerCase();
                if (em.includes("@")) emailsFound.add(em);
            }

            // Regex in subpage
            const subRegexEmails = subHtml.match(emailRegex) || [];
            subRegexEmails.forEach(e => emailsFound.add(e.toLowerCase()));

            if (emailsFound.size > 0) break;
        }
    }

    // Filter and score emails
    const validEmails = [];
    const domainEmails = [];

    for (const rawEmail of emailsFound) {
        const em = rawEmail.replace(/^u003e/i, "").trim().toLowerCase();
        
        // Skip bad extensions and known blacklist
        const hasBadExt = Array.from(FILE_EXTENSIONS_BLACKLIST).some(ext => em.endsWith(ext));
        const isBlacklisted = Array.from(EMAIL_BLACKLIST).some(bl => em.includes(bl));

        if (!hasBadExt && !isBlacklisted && em.length >= 6) {
            validEmails.push(em);
            if (domain && em.endsWith("@" + domain)) {
                domainEmails.push(em);
            }
        }
    }

    // Prefer domain-specific email (e.g. info@business.com over gmail)
    const bestEmail = domainEmails.length > 0 ? domainEmails[0] : (validEmails[0] || "");
    result.email = bestEmail;
    result.all_emails = validEmails;

    // Attach first found social link for each platform
    for (const platform of Object.keys(socialFound)) {
        if (socialFound[platform].size > 0) {
            result[platform] = Array.from(socialFound[platform])[0];
        }
    }

    enrichmentCache.set(websiteUrl, result);
    return result;
}

// Runtime Message Router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openPage") {
        chrome.storage.local.set({ leads: request.data }, () => {
            chrome.tabs.create({ url: "dashboard.html" });
        });
        return false;
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
        return true; // Keep channel open for async response
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
