/**
 * AtlasIQ Enterprise - Content Script Engine v2.5.0
 * Grade: Silicon Valley Professional
 */

// Global State
let auto_extract_flag = false;
let leads = [];
const leads_keys = new Set();
let extraction_speed = "medium";
let max_limit = 0;

// Dynamic Injection of Network Interceptor into MAIN Execution World
function injectMainInterceptor() {
    try {
        if (document.getElementById("atlasiq-injected-script")) return;
        const script = document.createElement("script");
        script.id = "atlasiq-injected-script";
        script.src = chrome.runtime.getURL("injected.js");
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);
        console.info("[AtlasIQ Enterprise] Interceptor injected into MAIN world.");
    } catch (e) {
        console.warn("[AtlasIQ] Interceptor injection error:", e);
    }
}
injectMainInterceptor();

// Load existing leads from storage on mount
chrome.storage.local.get(["leads"], (res) => {
    if (res && Array.isArray(res.leads) && res.leads.length > 0) {
        leads = res.leads;
        leads.forEach(l => {
            const key = getLeadDeduplicationKey(l);
            if (key) leads_keys.add(key);
        });
        updateUiCounters();
    }
});

function getLeadDeduplicationKey(lead) {
    if (lead.placeID) return `pid_${lead.placeID}`;
    if (lead.cID) return `cid_${lead.cID}`;
    if (lead.name) {
        const cleanName = lead.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (lead.latitude && lead.longitude) {
            return `${cleanName}_${lead.latitude.substring(0, 5)}_${lead.longitude.substring(0, 5)}`;
        }
        return cleanName;
    }
    return null;
}

// UI Elements References
let uiLeadsCountEl = null;
let uiEmailsCountEl = null;
let uiStatusTextEl = null;
let uiPulseDotEl = null;
let uiStartBtnEl = null;
let uiStopBtnEl = null;
let uiExportBtnEl = null;

function updateUiCounters() {
    const totalLeads = leads.length;
    const emailsCount = leads.filter(l => l.email && l.email.includes("@")).length;

    if (uiLeadsCountEl) uiLeadsCountEl.textContent = totalLeads;
    if (uiEmailsCountEl) uiEmailsCountEl.textContent = emailsCount;
    if (uiExportBtnEl) uiExportBtnEl.textContent = `📊 Ver en CRM (${totalLeads})`;

    // Backward compatibility for any external callers
    document.querySelectorAll('#extension_gms_leads_info, .extension_gms_leads_info').forEach(el => {
        el.textContent = `Leads: ${totalLeads}`;
    });
}

// Synchronize leads to storage (throttled or immediate)
let syncTimeout = null;
function persistLeadsToStorage(immediate = false) {
    if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
    }
    if (immediate) {
        chrome.storage.local.set({ leads: leads, lastSync: Date.now() });
    } else {
        syncTimeout = setTimeout(() => {
            chrome.storage.local.set({ leads: leads, lastSync: Date.now() });
        }, 500);
    }
}

// Background website enrichment
async function enrichLeadWebsite(lead) {
    if (!lead.website || lead._enriching || lead.email) return;
    lead._enriching = true;
    try {
        const res = await chrome.runtime.sendMessage({
            action: "enrichLead",
            data: { website: lead.website, name: lead.name, deep_search: true }
        });
        if (res && !res.error) {
            if (res.email) lead.email = res.email;
            if (res.phone && !lead.phone) lead.phone = res.phone;
            if (res.instagram) lead.instagram = res.instagram;
            if (res.facebook) lead.facebook = res.facebook;
            if (res.linkedin) lead.linkedin = res.linkedin;
            if (res.twitter) lead.twitter = res.twitter;
            if (res.youtube) lead.youtube = res.youtube;
            if (res.tiktok) lead.tiktok = res.tiktok;
            if (res.tech_stack) lead.tech_stack = res.tech_stack;
            if (res.meta_description) lead.meta_description = res.meta_description;

            // Recalculate lead opportunity score with enriched data
            computeLeadScore(lead);
            updateUiCounters();
            persistLeadsToStorage();
        }
    } catch (err) {
        // Silent catch for network drops
    } finally {
        delete lead._enriching;
    }
}

// Fast In-Memory Lead Opportunity Scoring
function computeLeadScore(lead) {
    let score = 50;
    const opps = [];

    if (!lead.website) {
        score += 25;
        opps.push("Sin Sitio Web (Oportunidad Web)");
    } else {
        score += 5;
        if (lead.tech_stack) {
            const t = lead.tech_stack.toLowerCase();
            if (t.includes("wordpress") || t.includes("wix")) opps.push("CMS Tradicional");
            if (!t.includes("pixel")) opps.push("Sin Pixel de Conversión");
        }
    }

    if (lead.phone) score += 10;
    if (lead.email) score += 15;

    const rating = parseFloat(lead.averageRating) || 0;
    const reviews = parseInt(lead.reviewCount) || 0;

    if (rating >= 4.5 && reviews < 25) {
        score += 10;
        opps.push("Gran Reputación, Pocas Reseñas");
    } else if (reviews > 100) {
        score += 10;
        opps.push("Negocio Consolidado");
    }

    lead.lead_score = Math.min(99, Math.max(15, score));
    lead.priority = lead.lead_score >= 75 ? "Alta" : (lead.lead_score >= 50 ? "Media" : "Baja");
    lead.opportunities = opps.join(", ");
}

/**
 * Modern Silicon Valley Floating Dock UI
 */
function createFloatingDock() {
    // Remove previous docks if present
    document.querySelectorAll('.atlasiq-dock-container, .extension_gms_page').forEach(e => e.remove());

    const container = document.createElement("div");
    container.className = "atlasiq-dock-container";

    const card = document.createElement("div");
    card.className = "atlasiq-dock-card";

    // 1. Header
    const header = document.createElement("div");
    header.className = "atlasiq-header";
    header.innerHTML = `
        <div class="atlasiq-brand">
            🌐 Atlas<span>IQ</span>
            <span class="atlasiq-badge-pro">PRO 2.5</span>
        </div>
        <div class="atlasiq-status-pill">
            <span class="atlasiq-pulse-dot" id="tl_pulse_dot"></span>
            <span id="tl_status_text">En espera</span>
        </div>
    `;

    // 2. Metrics Bar
    const statsBar = document.createElement("div");
    statsBar.className = "atlasiq-stats-bar";
    statsBar.innerHTML = `
        <div class="atlasiq-stat-item">
            <span class="atlasiq-stat-label">Leads Extraídos</span>
            <span class="atlasiq-stat-value" id="tl_leads_count">0</span>
        </div>
        <div class="atlasiq-stat-item">
            <span class="atlasiq-stat-label">Emails Detectados</span>
            <span class="atlasiq-stat-value emails" id="tl_emails_count">0</span>
        </div>
    `;

    // 3. Settings: Speed & Limit
    const speedRow = document.createElement("div");
    speedRow.className = "atlasiq-row";
    speedRow.innerHTML = `
        <label class="atlasiq-label">Velocidad:</label>
        <select class="atlasiq-select" id="tl_sel_speed">
            <option value="fast">Rápida (1.5s)</option>
            <option value="medium" selected>Equilibrada (2.5s)</option>
            <option value="slow">Sigilosa Anti-Ban (4.5s)</option>
        </select>
    `;

    const limitRow = document.createElement("div");
    limitRow.className = "atlasiq-row";
    limitRow.innerHTML = `
        <label class="atlasiq-label">Límite de Leads:</label>
        <input type="number" class="atlasiq-input" id="tl_inp_limit" placeholder="Sin límite" min="1" step="10" />
    `;

    const divider = document.createElement("hr");
    divider.className = "atlasiq-divider";

    // 4. Action Buttons
    const btnStart = document.createElement("button");
    btnStart.className = "atlasiq-btn atlasiq-btn-start";
    btnStart.id = "tl_btn_start";
    btnStart.innerHTML = `▶ Iniciar Extracción`;

    const btnStop = document.createElement("button");
    btnStop.className = "atlasiq-btn atlasiq-btn-stop";
    btnStop.id = "tl_btn_stop";
    btnStop.innerHTML = `⏹ Detener`;
    btnStop.style.display = "none";

    const btnExport = document.createElement("button");
    btnExport.className = "atlasiq-btn atlasiq-btn-export";
    btnExport.id = "tl_btn_export";
    btnExport.innerHTML = `📊 Ver en CRM (0)`;

    const secondaryRow = document.createElement("div");
    secondaryRow.className = "atlasiq-row";

    const btnClear = document.createElement("button");
    btnClear.className = "atlasiq-btn atlasiq-btn-secondary";
    btnClear.innerHTML = `🗑 Limpiar`;
    btnClear.style.flex = "1";

    secondaryRow.appendChild(btnClear);

    // Assemble Card
    card.appendChild(header);
    card.appendChild(statsBar);
    card.appendChild(speedRow);
    card.appendChild(limitRow);
    card.appendChild(divider);
    card.appendChild(btnStart);
    card.appendChild(btnStop);
    card.appendChild(btnExport);
    card.appendChild(secondaryRow);

    container.appendChild(card);
    document.body.appendChild(container);

    // Bind Reference Handles
    uiLeadsCountEl = document.getElementById("tl_leads_count");
    uiEmailsCountEl = document.getElementById("tl_emails_count");
    uiStatusTextEl = document.getElementById("tl_status_text");
    uiPulseDotEl = document.getElementById("tl_pulse_dot");
    uiStartBtnEl = btnStart;
    uiStopBtnEl = btnStop;
    uiExportBtnEl = btnExport;

    // Event Listeners
    const selSpeed = document.getElementById("tl_sel_speed");
    selSpeed.addEventListener("change", (e) => {
        extraction_speed = e.target.value;
    });

    const inpLimit = document.getElementById("tl_inp_limit");
    inpLimit.addEventListener("input", (e) => {
        max_limit = parseInt(e.target.value) || 0;
    });

    btnStart.addEventListener("click", () => startExtraction());
    btnStop.addEventListener("click", () => stopExtraction());
    btnExport.addEventListener("click", () => {
        persistLeadsToStorage(true);
        chrome.storage.local.set({ leads: leads, lastSync: Date.now() }, () => {
            chrome.runtime.sendMessage({ action: "openPage" }, (res) => {
                if (chrome.runtime.lastError) {
                    window.open(chrome.runtime.getURL("dashboard.html"), "_blank");
                }
            });
        });
    });
    btnClear.addEventListener("click", () => {
        if (confirm("¿Deseas reiniciar la lista de prospectos?")) {
            leads = [];
            leads_keys.clear();
            persistLeadsToStorage(true);
            updateUiCounters();
        }
    });

    updateUiCounters();
}

function setDockStatus(text, isActive = false) {
    if (uiStatusTextEl) uiStatusTextEl.textContent = text;
    if (uiPulseDotEl) {
        if (isActive) uiPulseDotEl.classList.add("active");
        else uiPulseDotEl.classList.remove("active");
    }
}

// Extraction Controller
async function startExtraction() {
    auto_extract_flag = true;
    uiStartBtnEl.style.display = "none";
    uiStopBtnEl.style.display = "flex";
    setDockStatus("Extrayendo...", true);

    // Request buffered packets from network interceptor
    window.postMessage({ type: "atlasiq_request_history" }, "*");

    // Initial DOM Pass
    extractLeadsFromDOM();
    updateUiCounters();

    let unchangedCount = 0;
    let lastScrollTop = -1;

    while (auto_extract_flag) {
        if (max_limit > 0 && leads.length >= max_limit) {
            setDockStatus(`Meta de ${max_limit} alcanzada`);
            break;
        }

        const scrollContainer = findMapsScrollContainer();
        if (!scrollContainer) {
            setDockStatus("Buscando panel...");
            await new Promise(r => setTimeout(r, 1200));
            continue;
        }

        // Smooth Human-like scroll down
        const previousScroll = scrollContainer.scrollTop;
        scrollContainer.scrollBy({ top: 800, behavior: "smooth" });

        // Anti-ban randomized jitter delay
        let baseDelay = 2200;
        if (extraction_speed === "fast") baseDelay = 1400;
        if (extraction_speed === "slow") baseDelay = 4200;
        const jitter = Math.floor(Math.random() * 600);
        await new Promise(r => setTimeout(r, baseDelay + jitter));

        // Extract newly loaded DOM listings
        extractLeadsFromDOM();
        updateUiCounters();

        // Check for end of list
        const isEnd = checkEndOfResults(scrollContainer);
        if (isEnd) {
            setDockStatus("Fin de resultados");
            break;
        }

        if (scrollContainer.scrollTop === previousScroll) {
            unchangedCount++;
            if (unchangedCount >= 3) {
                tryClickSearchThisArea();
            }
            if (unchangedCount >= 10) {
                setDockStatus("Fin de lista");
                break;
            }
        } else {
            unchangedCount = 0;
        }
    }

    stopExtraction();
}

function tryClickSearchThisArea() {
    try {
        const btns = Array.from(document.querySelectorAll('button'));
        const areaBtn = btns.find(b => {
            const txt = (b.textContent || "").toLowerCase();
            return txt.includes("buscar en esta zona") || txt.includes("search this area") || txt.includes("rechercher dans cette zone");
        });
        if (areaBtn && window.getComputedStyle(areaBtn).display !== "none") {
            console.log("[AtlasIQ] Clic automático en 'Buscar en esta zona' para expandir cuadrante.");
            areaBtn.click();
            return true;
        }
    } catch (e) {}
    return false;
}

function playChime(freq1 = 587.33, freq2 = 880) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.frequency.setValueAtTime(freq1, ctx.currentTime);
        osc2.frequency.setValueAtTime(freq2, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
        osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.1);
        osc2.start(ctx.currentTime + 0.08); osc2.stop(ctx.currentTime + 0.35);
    } catch(e) {}
}

function stopExtraction() {
    auto_extract_flag = false;
    if (uiStartBtnEl) uiStartBtnEl.style.display = "flex";
    if (uiStopBtnEl) uiStopBtnEl.style.display = "none";
    setDockStatus("Listo");
    updateUiCounters();
    persistLeadsToStorage(true);
    playChime(523.25, 659.25);
}

function findMapsScrollContainer() {
    // 1. Direct role="feed" (Standard Google Maps layout)
    const feed = document.querySelector('[role="feed"]');
    if (feed && feed.scrollHeight > 250) return feed;

    // 2. Scan card parent
    const sample = document.querySelector('.Nv2PK, [role="article"], a[href*="/maps/place/"]');
    if (sample) {
        let parent = sample.parentElement;
        while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if ((style.overflowY === "auto" || style.overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) {
                return parent;
            }
            parent = parent.parentElement;
        }
    }

    // 3. Fallback container classes
    const fallback = document.querySelector("div.m6QErb.DxyBCb, div.m6QErb");
    if (fallback && fallback.scrollHeight > 300) return fallback;

    return null;
}

function checkEndOfResults(container) {
    if (!container) return false;
    const endEl = document.querySelector(".HlvSq");
    if (endEl && (endEl.offsetHeight > 0 || (endEl.innerText && endEl.innerText.length > 0))) return true;

    const text = container.innerText || "";
    if (text.includes("Has llegado al final") || 
        text.includes("You've reached the end") ||
        text.includes("No hay más resultados")) {
        return true;
    }
    return false;
}

/**
 * Resilient DOM Card Extractor
 * Multi-layer fallback that survives Google Maps UI redesigns.
 */
function extractLeadsFromDOM() {
    const cards = Array.from(document.querySelectorAll('div.Nv2PK, div[role="article"], div:has(> a[href*="/maps/place/"])'));
    if (!cards.length) return 0;

    let added = 0;

    for (const card of cards) {
        if (max_limit > 0 && leads.length >= max_limit) break;

        try {
            // Business Name
            const titleEl = card.querySelector('.fontHeadlineSmall, .qBF1Pd, h3, a[aria-label]');
            const name = titleEl ? titleEl.textContent.trim() : "";
            if (!name || name.length < 2 || name.toLowerCase() === "resultados") continue;

            // Link & Identifiers
            const link = card.querySelector('a[href*="/maps/place/"]') || card.querySelector('a.hfpxzc') || card.querySelector('a');
            const href = link ? link.href : "";

            let placeID = "";
            let cID = "";
            let lat = "";
            let lng = "";

            if (href) {
                const latLngMatch = href.match(/@([-\d.]+),([-\d.]+)/);
                if (latLngMatch) { lat = latLngMatch[1]; lng = latLngMatch[2]; }
                const cidMatch = href.match(/0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/);
                if (cidMatch) cID = cidMatch[1];
                const pidMatch = href.match(/!1s([^!&]+)/) || href.match(/19s([^?&]+)/);
                if (pidMatch) placeID = pidMatch[1];
            }

            const dedupeKey = getLeadDeduplicationKey({ name, placeID, cID, latitude: lat, longitude: lng });
            if (dedupeKey && leads_keys.has(dedupeKey)) continue;

            // Rating & Reviews
            let averageRating = "";
            const ratingEl = card.querySelector('span.MW4etd, span[aria-label*="estrella"], span[aria-label*="star"]');
            if (ratingEl) {
                const rText = ratingEl.getAttribute("aria-label") || ratingEl.textContent || "";
                const rMatch = rText.match(/([1-5][.,]\d)/);
                if (rMatch) averageRating = rMatch[1].replace(",", ".");
            }

            let reviewCount = "";
            const reviewEl = card.querySelector('span.UY7F9, span[aria-label*="reseña"], span[aria-label*="review"]');
            if (reviewEl) {
                const revText = reviewEl.getAttribute("aria-label") || reviewEl.textContent || "";
                const revMatch = revText.replace(/[^\d]/g, "");
                if (revMatch) reviewCount = revMatch;
            }

            // Category & Address
            let category = "";
            let address = "";
            const spans = card.querySelectorAll("span, div");
            for (const span of spans) {
                if (span.children.length === 0 && span.textContent.includes("·")) {
                    const parts = span.textContent.split("·").map(s => s.trim()).filter(Boolean);
                    for (const p of parts) {
                        if (p.includes("$") || p.includes("Cierra") || p.includes("Abierto") || p.includes("Open") || p.includes("Closed")) continue;
                        if (/\d+/.test(p) || p.toLowerCase().includes("calle") || p.toLowerCase().includes("av") || p.length > 8) {
                            if (!address) address = p;
                        } else if (!category) {
                            category = p;
                        }
                    }
                }
            }

            // Website
            let website = "";
            const webBtn = card.querySelector('a[data-value*="Sitio"], a[data-value*="Website"], a[aria-label*="Sitio"], a[aria-label*="Website"], a[href^="http"]:not([href*="google.com"])');
            if (webBtn && webBtn.href && !webBtn.href.includes("google.com/maps")) {
                website = webBtn.href;
            }

            // Phone
            let phone = "";
            const phoneMatch = card.textContent.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
            if (phoneMatch && phoneMatch[0].replace(/\D/g, "").length >= 8) {
                phone = phoneMatch[0].trim();
            }

            leads_keys.add(dedupeKey);

            const newLead = {
                name,
                phone,
                website,
                address,
                email: "",
                category,
                averageRating,
                reviewCount,
                latitude: lat,
                longitude: lng,
                placeID,
                cID,
                mapsUrl: href,
                instagram: "",
                facebook: "",
                linkedin: "",
                twitter: "",
                youtube: "",
                tiktok: "",
                tech_stack: "",
                meta_description: "",
                extracted_at: new Date().toISOString()
            };

            computeLeadScore(newLead);
            leads.push(newLead);
            added++;

            if (website) {
                enrichLeadWebsite(newLead);
            }
        } catch (e) {
            console.warn("[AtlasIQ] Error reading card:", e);
        }
    }

    if (added > 0) {
        persistLeadsToStorage();
    }
    return added;
}

/**
 * High-Speed Network Interception Processor
 * Ingests Protobuf/JSON RPC internal responses directly from injected.js.
 */
function parseGoogleMapsResponse(rawText) {
    if (!rawText || typeof rawText !== "string") return null;
    let text = rawText.trim();
    if (text.startsWith('/*""*/')) text = text.replace('/*""*/', '').trim();
    if (text.startsWith(")]}'")) text = text.replace(/^\)\]\}'\s*/, '').trim();

    try {
        const obj = JSON.parse(text);
        if (obj && typeof obj.d === "string") {
            let inner = obj.d.trim().replace(/^\)\]\}'\s*/, '');
            return JSON.parse(inner);
        }
        return obj;
    } catch (e) {
        const lines = text.split("\n");
        for (const line of lines) {
            const l = line.trim();
            if ((l.startsWith("[") && l.endsWith("]")) || (l.startsWith("{") && l.endsWith("}"))) {
                try {
                    return JSON.parse(l);
                } catch (err) {}
            }
        }
    }
    return null;
}

function extractFeedArray(results) {
    if (!results) return null;
    if (Array.isArray(results[64]) && results[64].length > 0) return results[64];
    if (Array.isArray(results[0]) && Array.isArray(results[0][64]) && results[0][64].length > 0) return results[0][64];

    // Deep search for feed container array
    function search(node, depth = 0) {
        if (!node || depth > 5) return null;
        if (Array.isArray(node)) {
            for (let i = 0; i < Math.min(node.length, 5); i++) {
                const item = node[i];
                if (Array.isArray(item) && item.length > 5) {
                    const last = item[item.length - 1];
                    if (Array.isArray(last) && typeof last[11] === "string" && last[11].length > 0) {
                        return node;
                    }
                }
            }
            for (const child of node) {
                const res = search(child, depth + 1);
                if (res) return res;
            }
        }
        return null;
    }
    return search(results);
}

window.addEventListener("message", function(event) {
    if (!event.data || (event.data.type !== "atlasiq_search_data" && event.data.type !== "search") || !event.data.data) return;

    try {
        const parsed = parseGoogleMapsResponse(event.data.data);
        if (!parsed) return;
        const feed = extractFeedArray(parsed);
        if (!feed || !Array.isArray(feed)) return;

        console.info(`[AtlasIQ Enterprise] RPC Feed Intercepted: ${feed.length} leads in stream.`);

        for (const itemArray of feed) {
            if (!Array.isArray(itemArray)) continue;
            const e = itemArray[itemArray.length - 1];
            if (!Array.isArray(e)) continue;

            const name = e[11] || "";
            if (!name || typeof name !== "string") continue;

            let website = ""; try { website = e[7][0] || ""; } catch(b) {}
            let phone = ""; try { phone = e[178][0][0] || ""; } catch(b) {}
            let reviewCount = ""; try { reviewCount = e[4][8] ? String(e[4][8]) : ""; } catch(b) {}
            let averageRating = ""; try { averageRating = e[4][7] ? String(e[4][7]) : ""; } catch(b) {}
            let category = ""; try { category = (e[13] || []).join("; "); } catch(b) {}
            let placeID = ""; try { placeID = e[78] || ""; } catch(b) {}
            let cID = ""; try { cID = e[37][0][0][29][1] || ""; } catch(b) {}
            let address = ""; try { address = (e[2] || []).join(", "); } catch(b) {}
            let latitude = ""; let longitude = "";
            try { latitude = String(e[9][2] || ""); longitude = String(e[9][3] || ""); } catch(b) {}

            const dedupeKey = getLeadDeduplicationKey({ name, placeID, cID, latitude, longitude });

            // Enrich existing lead if already present
            const existing = leads.find(l => getLeadDeduplicationKey(l) === dedupeKey);
            if (existing) {
                if (!existing.phone && phone) existing.phone = phone;
                if (!existing.website && website) existing.website = website;
                if (!existing.address && address) existing.address = address;
                if (!existing.placeID && placeID) existing.placeID = placeID;
                if (!existing.cID && cID) existing.cID = cID;
                if (!existing.category && category) existing.category = category;
                if (!existing.reviewCount && reviewCount) existing.reviewCount = reviewCount;
                if (!existing.averageRating && averageRating) existing.averageRating = averageRating;
                if (!existing.latitude && latitude) existing.latitude = latitude;
                if (!existing.longitude && longitude) existing.longitude = longitude;
                if (existing.website && !existing.email) enrichLeadWebsite(existing);
                continue;
            }

            if (dedupeKey && leads_keys.has(dedupeKey)) continue;
            leads_keys.add(dedupeKey);

            const newLead = {
                name,
                phone,
                website,
                address,
                email: "",
                category,
                averageRating,
                reviewCount,
                latitude,
                longitude,
                placeID,
                cID,
                mapsUrl: placeID ? `https://www.google.com/maps/place/?q=place_id:${placeID}` : "",
                instagram: "",
                facebook: "",
                linkedin: "",
                twitter: "",
                youtube: "",
                tiktok: "",
                tech_stack: "",
                meta_description: "",
                extracted_at: new Date().toISOString()
            };

            computeLeadScore(newLead);
            leads.push(newLead);

            if (website) {
                enrichLeadWebsite(newLead);
            }
        }

        updateUiCounters();
        persistLeadsToStorage();
    } catch (err) {
        console.warn("[AtlasIQ] Error handling intercepted stream:", err);
    }
});

// Periodic mounting check
setInterval(() => {
    if (!document.querySelector(".atlasiq-dock-container")) {
        createFloatingDock();
    }
}, 1500);

// Initial creation
createFloatingDock();
