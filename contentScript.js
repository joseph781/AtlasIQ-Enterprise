/**
 * AtlasIQ Enterprise v4.0 - Deep Harvester Content Engine & Autonomous Geo-Grid Sweeper
 * Grade: Silicon Valley Principal Engineering
 */

let auto_extract_flag = false;
let leads = [];
const leads_map = new Map();
let extraction_speed = "medium";
let grid_mode = "single"; // single | 2x2 | 3x3 | 4x4
let max_limit = 0;

// UI References
let uiLeadsCountEl = null;
let uiEmailsCountEl = null;
let uiOppsCountEl = null;
let uiStatusTextEl = null;
let uiPulseDotEl = null;
let uiStartBtnEl = null;
let uiStopBtnEl = null;
let uiExportBtnEl = null;

// Pain-point dictionary for automated negative-review & snippet mining
const PAIN_POINT_KEYWORDS = [
    { kw: "no contestan", label: "Atención telefónica deficiente" },
    { kw: "nunca contestan", label: "Llamadas perdidas" },
    { kw: "tardan", label: "Demora en servicio" },
    { kw: "cita", label: "Fricción en agendamiento" },
    { kw: "reserva", label: "Sistema de reservas mejorable" },
    { kw: "espera", label: "Altos tiempos de espera" },
    { kw: "efectivo", label: "Falta de pagos digitales" },
    { kw: "página", label: "Quejas sobre sitio web" }
];

const BOOKING_DOMAIN_HINTS = [
    { match: "calendly.com", name: "Calendly" },
    { match: "doctoralia", name: "Doctoralia" },
    { match: "booksy.com", name: "Booksy" },
    { match: "opentable", name: "OpenTable" },
    { match: "ubereats.com", name: "UberEats" },
    { match: "rappi.", name: "Rappi" },
    { match: "pedidosya", name: "PedidosYa" },
    { match: "treatwell", name: "Treatwell" },
    { match: "agendapro", name: "AgendaPro" }
];

function getLeadDeduplicationKey(lead) {
    if (!lead) return null;
    if (lead.placeID) return `pid_${lead.placeID}`;
    if (lead.cID) return `cid_${lead.cID}`;
    if (lead.name) {
        const cleanName = String(lead.name).toLowerCase().replace(/[^a-z0-9\u00c0-\u017f]/g, "");
        if (lead.latitude && lead.longitude) {
            return `${cleanName}_${String(lead.latitude).substring(0, 5)}_${String(lead.longitude).substring(0, 5)}`;
        }
        return `nm_${cleanName}`;
    }
    return null;
}

// Hydrate existing leads on load & listen for external resets
chrome.storage.local.get(["leads"], (res) => {
    if (res && Array.isArray(res.leads)) {
        leads = res.leads;
        leads_map.clear();
        leads.forEach((l) => {
            const k = getLeadDeduplicationKey(l);
            if (k) {
                l.dedupeKey = k;
                leads_map.set(k, l);
            }
        });
        updateUiCounters();
    }
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.leads && Array.isArray(changes.leads.newValue)) {
        if (changes.leads.newValue.length === 0 && leads.length > 0 && !auto_extract_flag) {
            leads = [];
            leads_map.clear();
            updateUiCounters();
        }
    }
});

function updateUiCounters() {
    const totalLeads = leads.length;
    const emailsCount = leads.filter(l => l.email && l.email.includes("@")).length;
    const highOppCount = leads.filter(l => !l.website || l.unclaimed || (parseInt(l.lead_score) || 0) >= 75).length;

    if (uiLeadsCountEl) uiLeadsCountEl.textContent = totalLeads.toLocaleString();
    if (uiEmailsCountEl) uiEmailsCountEl.textContent = emailsCount.toLocaleString();
    if (uiOppsCountEl) uiOppsCountEl.textContent = highOppCount.toLocaleString();
    if (uiExportBtnEl) uiExportBtnEl.textContent = `📊 Abrir CRM v4.0 (${totalLeads})`;
}

let syncTimeout = null;
function persistLeadsToStorage(immediate = false) {
    if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
    }
    const writeFn = () => {
        chrome.storage.local.set({
            leads: leads,
            leadsCount: leads.length,
            lastSync: Date.now()
        });
    };
    if (immediate) writeFn();
    else syncTimeout = setTimeout(writeFn, 450);
}

// Deep Multi-Signal Opportunity Scoring Engine (In-Memory Fast Path)
function computeLeadScore(lead) {
    let score = 45;
    const opps = [];

    if (!lead.website) {
        score += 26;
        opps.push("Sin Sitio Web (Venta Directa Web)");
    } else {
        score += 4;
        const t = (lead.tech_stack || "").toLowerCase();
        if (t && !t.includes("pixel") && !t.includes("gtm")) {
            score += 12;
            opps.push("Sin Píxel Ads (Oportunidad Tráfico)");
        }
        if (lead.ad_spend_active) {
            score += 8;
            opps.push("Invierte en Ads Activamente");
        }
        if (t.includes("wix") || t.includes("squarespace")) {
            opps.push("CMS Limitado (Migración)");
        }
    }

    if (lead.unclaimed) {
        score += 18;
        opps.push("Ficha Google No Reclamada (SEO Local)");
    }

    if (lead.review_pain_points) {
        score += 10;
        opps.push(`Dolor Clientes: ${lead.review_pain_points}`);
    }

    if (lead.phone) score += 8;
    if (lead.email) score += 12;
    if (lead.decision_maker || lead.legal_name) score += 6;

    const rating = parseFloat(lead.averageRating) || 0;
    const reviews = parseInt(lead.reviewCount) || 0;

    if (rating >= 4.5 && reviews > 0 && reviews < 25) {
        score += 8;
        opps.push("Alta Calidad / Pocas Reseñas");
    } else if (rating > 0 && rating < 4.1 && reviews >= 10) {
        score += 9;
        opps.push("Crisis de Reputación (<4.1★)");
    } else if (reviews >= 120) {
        score += 7;
        opps.push("Alto Volumen Comercial");
    }

    lead.lead_score = Math.min(99, Math.max(15, score));
    lead.priority = lead.lead_score >= 75 ? "Alta" : (lead.lead_score >= 50 ? "Media" : "Baja");
    lead.opportunities = Array.from(new Set(opps)).join(", ");
}

// Controlled Background OSINT Enrichment Trigger
async function enrichLeadWebsite(lead) {
    if (!lead.website || lead._enriching || lead._enrichedDone) return;
    lead._enriching = true;
    try {
        const res = await chrome.runtime.sendMessage({
            action: "enrichLead",
            data: { website: lead.website, name: lead.name, deep_search: true }
        });
        if (res && !res.error) {
            if (res.email && !lead.email) lead.email = res.email;
            if (Array.isArray(res.all_emails) && res.all_emails.length) lead.all_emails = res.all_emails.join("; ");
            if (res.phone && !lead.phone) lead.phone = res.phone;
            if (res.instagram) lead.instagram = res.instagram;
            if (res.facebook) lead.facebook = res.facebook;
            if (res.linkedin) lead.linkedin = res.linkedin;
            if (res.twitter) lead.twitter = res.twitter;
            if (res.youtube) lead.youtube = res.youtube;
            if (res.tiktok) lead.tiktok = res.tiktok;
            if (res.tech_stack) lead.tech_stack = res.tech_stack;
            if (res.ad_spend_active !== undefined) lead.ad_spend_active = res.ad_spend_active;
            if (res.meta_description) lead.meta_description = res.meta_description;
            if (res.legal_name) lead.legal_name = res.legal_name;
            if (res.tax_id) lead.tax_id = res.tax_id;
            if (res.decision_maker) lead.decision_maker = res.decision_maker;
            if (res.booking_platform && !lead.booking_platform) lead.booking_platform = res.booking_platform;
            if (res.booking_url && !lead.booking_url) lead.booking_url = res.booking_url;

            lead._enrichedDone = true;
            computeLeadScore(lead);
            updateUiCounters();
            persistLeadsToStorage();
        }
    } catch (err) {
        // Ignore transient disconnect
    } finally {
        delete lead._enriching;
    }
}

function upsertHarvestedLead(candidate) {
    if (!candidate || !candidate.name) return false;
    if (max_limit > 0 && leads.length >= max_limit && !leads_map.has(getLeadDeduplicationKey(candidate))) {
        return false;
    }

    const key = getLeadDeduplicationKey(candidate);
    if (!key) return false;
    candidate.dedupeKey = key;

    if (leads_map.has(key)) {
        const existing = leads_map.get(key);
        const mergeFields = [
            "phone", "website", "address", "placeID", "cID", "category", "secondaryCategories",
            "reviewCount", "averageRating", "latitude", "longitude", "priceLevel", "openingHours",
            "openStatus", "photoCount", "plusCode", "bookingPlatform", "bookingUrl", "review_pain_points"
        ];
        mergeFields.forEach((f) => {
            if ((!existing[f] || existing[f] === "") && candidate[f]) {
                existing[f] = candidate[f];
            }
        });
        if (candidate.unclaimed) existing.unclaimed = true;
        if (candidate.bookingPlatform && !existing.booking_platform) existing.booking_platform = candidate.bookingPlatform;
        if (candidate.bookingUrl && !existing.booking_url) existing.booking_url = candidate.bookingUrl;
        computeLeadScore(existing);
        if (existing.website && !existing.email && !existing._enrichedDone) {
            enrichLeadWebsite(existing);
        }
        return false;
    }

    const newLead = {
        dedupeKey: key,
        name: candidate.name,
        phone: candidate.phone || "",
        website: candidate.website || "",
        address: candidate.address || "",
        email: "",
        all_emails: "",
        category: candidate.category || "",
        secondaryCategories: candidate.secondaryCategories || "",
        averageRating: candidate.averageRating || "",
        reviewCount: candidate.reviewCount || "",
        priceLevel: candidate.priceLevel || "",
        openingHours: candidate.openingHours || "",
        openStatus: candidate.openStatus || "",
        unclaimed: Boolean(candidate.unclaimed),
        photoCount: candidate.photoCount || "",
        plusCode: candidate.plusCode || "",
        booking_platform: candidate.bookingPlatform || "",
        booking_url: candidate.bookingUrl || "",
        review_pain_points: candidate.review_pain_points || "",
        legal_name: "",
        tax_id: "",
        decision_maker: "",
        ad_spend_active: false,
        pagespeed_mobile: null,
        latitude: candidate.latitude || "",
        longitude: candidate.longitude || "",
        placeID: candidate.placeID || "",
        cID: candidate.cID || "",
        mapsUrl: candidate.mapsUrl || (candidate.placeID ? `https://www.google.com/maps/place/?q=place_id:${candidate.placeID}` : ""),
        instagram: "",
        facebook: "",
        linkedin: "",
        twitter: "",
        youtube: "",
        tiktok: "",
        tech_stack: "",
        meta_description: "",
        pipeline_stage: "nuevo",
        extracted_at: new Date().toISOString()
    };

    computeLeadScore(newLead);
    leads.push(newLead);
    leads_map.set(key, newLead);

    if (newLead.website) {
        enrichLeadWebsite(newLead);
    }
    return true;
}

/**
 * Draggable, Minimizable Obsidian-Glass Dock UI
 */
function createFloatingDock() {
    document.querySelectorAll(".atlasiq-dock-container, .extension_gms_page").forEach(e => e.remove());

    const container = document.createElement("div");
    container.className = "atlasiq-dock-container";
    container.id = "atlasiq-floating-dock";

    const card = document.createElement("div");
    card.className = "atlasiq-dock-card";

    const header = document.createElement("div");
    header.className = "atlasiq-header";
    header.title = "Arrastra para mover el panel";
    header.innerHTML = `
        <div class="atlasiq-brand">
            🌐 Atlas<span>IQ</span>
            <span class="atlasiq-badge-pro">v4.0 EXTREME</span>
        </div>
        <div class="atlasiq-header-controls">
            <button class="atlasiq-icon-btn" id="tl_btn_sidepanel" title="Abrir Copilot en Side Panel lateral de Chrome">🧭</button>
            <button class="atlasiq-icon-btn" id="tl_btn_minimize" title="Minimizar / Expandir">—</button>
        </div>
    `;

    const statusStrip = document.createElement("div");
    statusStrip.className = "atlasiq-status-strip";
    statusStrip.innerHTML = `
        <div class="atlasiq-status-pill">
            <span class="atlasiq-pulse-dot" id="tl_pulse_dot"></span>
            <span id="tl_status_text">Motor Deep RPC Listo</span>
        </div>
    `;

    const bodyWrap = document.createElement("div");
    bodyWrap.className = "atlasiq-body-wrap";
    bodyWrap.id = "tl_dock_body";

    const statsBar = document.createElement("div");
    statsBar.className = "atlasiq-stats-bar";
    statsBar.innerHTML = `
        <div class="atlasiq-stat-item">
            <span class="atlasiq-stat-label">Leads</span>
            <span class="atlasiq-stat-value" id="tl_leads_count">0</span>
        </div>
        <div class="atlasiq-stat-item">
            <span class="atlasiq-stat-label">Emails</span>
            <span class="atlasiq-stat-value emails" id="tl_emails_count">0</span>
        </div>
        <div class="atlasiq-stat-item">
            <span class="atlasiq-stat-label">Hot Opps</span>
            <span class="atlasiq-stat-value opps" id="tl_opps_count">0</span>
        </div>
    `;

    const gridRow = document.createElement("div");
    gridRow.className = "atlasiq-row";
    gridRow.innerHTML = `
        <label class="atlasiq-label">Barrido:</label>
        <select class="atlasiq-select" id="tl_sel_grid">
            <option value="single" selected>Zona Actual (Estándar)</option>
            <option value="2x2">Malla 2×2 (4 Sub-Zonas)</option>
            <option value="3x3">Malla H3 3×3 (9 Zonas · Masivo)</option>
            <option value="4x4">Malla Extrema 4×4 (16 Zonas)</option>
        </select>
    `;

    const speedRow = document.createElement("div");
    speedRow.className = "atlasiq-row";
    speedRow.innerHTML = `
        <label class="atlasiq-label">Velocidad:</label>
        <select class="atlasiq-select" id="tl_sel_speed">
            <option value="fast">Turbo RPC (1.3s)</option>
            <option value="medium" selected>Orgánica (2.3s)</option>
            <option value="slow">Sigilosa Anti-Ban (4.2s)</option>
        </select>
    `;

    const limitRow = document.createElement("div");
    limitRow.className = "atlasiq-row";
    limitRow.innerHTML = `
        <label class="atlasiq-label">Meta Máx:</label>
        <input type="number" class="atlasiq-input" id="tl_inp_limit" placeholder="Ilimitado" min="1" step="25" />
    `;

    const divider = document.createElement("hr");
    divider.className = "atlasiq-divider";

    const btnStart = document.createElement("button");
    btnStart.className = "atlasiq-btn atlasiq-btn-start";
    btnStart.id = "tl_btn_start";
    btnStart.textContent = "▶ Iniciar Deep Harvester";

    const btnStop = document.createElement("button");
    btnStop.className = "atlasiq-btn atlasiq-btn-stop";
    btnStop.id = "tl_btn_stop";
    btnStop.textContent = "⏹ Detener Motor";
    btnStop.style.display = "none";

    const btnExport = document.createElement("button");
    btnExport.className = "atlasiq-btn atlasiq-btn-export";
    btnExport.id = "tl_btn_export";
    btnExport.textContent = "📊 Abrir CRM v4.0 (0)";

    const secondaryRow = document.createElement("div");
    secondaryRow.className = "atlasiq-row";
    const btnClear = document.createElement("button");
    btnClear.className = "atlasiq-btn atlasiq-btn-secondary";
    btnClear.textContent = "🗑 Reiniciar Lista";
    btnClear.style.flex = "1";
    secondaryRow.appendChild(btnClear);

    bodyWrap.appendChild(statsBar);
    bodyWrap.appendChild(gridRow);
    bodyWrap.appendChild(speedRow);
    bodyWrap.appendChild(limitRow);
    bodyWrap.appendChild(divider);
    bodyWrap.appendChild(btnStart);
    bodyWrap.appendChild(btnStop);
    bodyWrap.appendChild(btnExport);
    bodyWrap.appendChild(secondaryRow);

    card.appendChild(header);
    card.appendChild(statusStrip);
    card.appendChild(bodyWrap);
    container.appendChild(card);
    document.body.appendChild(container);

    // Bind References
    uiLeadsCountEl = document.getElementById("tl_leads_count");
    uiEmailsCountEl = document.getElementById("tl_emails_count");
    uiOppsCountEl = document.getElementById("tl_opps_count");
    uiStatusTextEl = document.getElementById("tl_status_text");
    uiPulseDotEl = document.getElementById("tl_pulse_dot");
    uiStartBtnEl = btnStart;
    uiStopBtnEl = btnStop;
    uiExportBtnEl = btnExport;

    // Make Header Draggable
    enableDockDrag(container, header);

    // Minimize Toggle
    document.getElementById("tl_btn_minimize").addEventListener("click", (e) => {
        const hidden = bodyWrap.style.display === "none";
        bodyWrap.style.display = hidden ? "flex" : "none";
        e.currentTarget.textContent = hidden ? "—" : "＋";
    });

    // SidePanel Trigger
    document.getElementById("tl_btn_sidepanel").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "openSidePanel" });
    });

    document.getElementById("tl_sel_grid").addEventListener("change", (e) => {
        grid_mode = e.target.value;
    });

    document.getElementById("tl_sel_speed").addEventListener("change", (e) => {
        extraction_speed = e.target.value;
    });

    document.getElementById("tl_inp_limit").addEventListener("input", (e) => {
        max_limit = parseInt(e.target.value) || 0;
    });

    btnStart.addEventListener("click", async () => {
        if (typeof checkCurrentLicense === "function") {
            btnStart.disabled = true;
            btnStart.textContent = "⏳ Verificando ECDSA...";
            const licStatus = await checkCurrentLicense();
            btnStart.disabled = false;
            btnStart.textContent = "▶ Iniciar Deep Harvester";

            if (!licStatus.active) {
                alert(`🛡️ AtlasIQ Enterprise v4.0 - Activación Requerida\n\n${licStatus.reason || "Activa tu licencia ECDSA."}\n\nID de Dispositivo: ${licStatus.deviceId}`);
                chrome.runtime.sendMessage({ action: "openPage" });
                return;
            }
        }
        startExtraction();
    });

    btnStop.addEventListener("click", () => stopExtraction());

    btnExport.addEventListener("click", () => {
        persistLeadsToStorage(true);
        chrome.runtime.sendMessage({ action: "openPage" }, () => {
            if (chrome.runtime.lastError) {
                window.open(chrome.runtime.getURL("dashboard.html"), "_blank");
            }
        });
    });

    btnClear.addEventListener("click", () => {
        if (confirm("¿Deseas vaciar los prospectos actuales de la sesión?")) {
            leads = [];
            leads_map.clear();
            persistLeadsToStorage(true);
            updateUiCounters();
        }
    });

    updateUiCounters();
}

function enableDockDrag(container, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    handle.addEventListener("mousedown", (e) => {
        if (e.target.tagName === "BUTTON") return;
        dragging = true;
        const rect = container.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        origLeft = rect.left;
        origTop = rect.top;
        container.style.right = "auto";
        e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const nx = Math.max(8, Math.min(window.innerWidth - 280, origLeft + (e.clientX - startX)));
        const ny = Math.max(8, Math.min(window.innerHeight - 80, origTop + (e.clientY - startY)));
        container.style.left = `${nx}px`;
        container.style.top = `${ny}px`;
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });
}

function setDockStatus(text, isActive = false) {
    if (uiStatusTextEl) uiStatusTextEl.textContent = text;
    if (uiPulseDotEl) {
        if (isActive) uiPulseDotEl.classList.add("active");
        else uiPulseDotEl.classList.remove("active");
    }
}

function getCurrentMapCenterAndQuery() {
    let lat = null;
    let lng = null;
    const urlMatch = window.location.href.match(/@([-\d.]+),([-\d.]+)/);
    if (urlMatch) {
        lat = parseFloat(urlMatch[1]);
        lng = parseFloat(urlMatch[2]);
    } else if (leads.length > 0) {
        const withCoords = leads.find(l => l.latitude && l.longitude);
        if (withCoords) {
            lat = parseFloat(withCoords.latitude);
            lng = parseFloat(withCoords.longitude);
        }
    }
    const searchInput = document.querySelector("#searchboxinput, input[name='q']");
    const query = searchInput ? searchInput.value.trim() : "";
    return { lat, lng, query };
}

function buildGeoGridOffsets(mode) {
    let n = 1;
    if (mode === "2x2") n = 2;
    else if (mode === "3x3") n = 3;
    else if (mode === "4x4") n = 4;
    if (n === 1) return [{ dLat: 0, dLng: 0 }];

    const stepDeg = 0.018; // ~2km geographic cell step
    const cells = [];
    const half = (n - 1) / 2;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            cells.push({
                dLat: (r - half) * stepDeg,
                dLng: (c - half) * stepDeg
            });
        }
    }
    return cells;
}

async function triggerMapsSearchAtCoordinate(query, lat, lng) {
    try {
        // Update URL coordinate state and trigger Maps search button or 'Search this area'
        const newUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat.toFixed(5)},${lng.toFixed(5)},15z`;
        window.history.replaceState(null, "", newUrl);

        const searchInput = document.querySelector("#searchboxinput, input[name='q']");
        const searchBtn = document.querySelector("#searchbox-searchbutton, button[aria-label*='Buscar'], button[aria-label*='Search']");
        if (searchInput && searchBtn) {
            searchInput.value = `${query} ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            searchInput.dispatchEvent(new Event("input", { bubbles: true }));
            searchBtn.click();
            await new Promise(r => setTimeout(r, 2600));
            // Restore clean query text in input for category heuristics
            searchInput.value = query;
            return true;
        }
    } catch (e) {}
    return false;
}

async function sweepCurrentFeed(cellLabel = "") {
    let unchangedCount = 0;
    while (auto_extract_flag) {
        if (max_limit > 0 && leads.length >= max_limit) {
            setDockStatus(`Meta de ${max_limit} alcanzada`);
            return "limit";
        }

        const scrollContainer = findMapsScrollContainer();
        if (!scrollContainer) {
            setDockStatus(`${cellLabel}Esperando resultados...`, true);
            await new Promise(r => setTimeout(r, 1200));
            unchangedCount++;
            if (unchangedCount >= 6) return "no_feed";
            continue;
        }

        const previousScroll = scrollContainer.scrollTop;
        scrollContainer.scrollBy({ top: 820, behavior: "smooth" });

        let baseDelay = 2100;
        if (extraction_speed === "fast") baseDelay = 1250;
        if (extraction_speed === "slow") baseDelay = 4000;
        const jitter = Math.floor(Math.random() * 550);
        await new Promise(r => setTimeout(r, baseDelay + jitter));

        extractLeadsFromDOM();
        // Also inspect any open place detail panel for unclaimed / pain-point cues
        inspectActivePlaceDrawer();
        updateUiCounters();

        if (checkEndOfResults(scrollContainer)) {
            return "end_reached";
        }

        if (scrollContainer.scrollTop === previousScroll) {
            unchangedCount++;
            if (unchangedCount === 3) {
                tryClickSearchThisArea();
            }
            if (unchangedCount >= 8) {
                return "stalled";
            }
        } else {
            unchangedCount = 0;
        }
    }
    return "stopped";
}

async function startExtraction() {
    if (auto_extract_flag) return;
    auto_extract_flag = true;
    if (uiStartBtnEl) uiStartBtnEl.style.display = "none";
    if (uiStopBtnEl) uiStopBtnEl.style.display = "flex";

    window.postMessage({ type: "atlasiq_request_history" }, "*");
    extractLeadsFromDOM();
    updateUiCounters();

    const { lat, lng, query } = getCurrentMapCenterAndQuery();
    const cells = buildGeoGridOffsets(grid_mode);

    if (cells.length === 1 || lat === null || lng === null || !query) {
        setDockStatus("Extrayendo Deep RPC...", true);
        await sweepCurrentFeed("");
    } else {
        for (let idx = 0; idx < cells.length && auto_extract_flag; idx++) {
            if (max_limit > 0 && leads.length >= max_limit) break;
            const cell = cells[idx];
            const label = `[Zona ${idx + 1}/${cells.length}] `;
            setDockStatus(`${label}Escaneando cuadrante...`, true);

            if (idx > 0 || cell.dLat !== 0 || cell.dLng !== 0) {
                await triggerMapsSearchAtCoordinate(query, lat + cell.dLat, lng + cell.dLng);
            }
            await sweepCurrentFeed(label);
        }
    }

    stopExtraction();
}

function tryClickSearchThisArea() {
    try {
        const btns = Array.from(document.querySelectorAll("button"));
        const areaBtn = btns.find((b) => {
            const txt = (b.textContent || "").toLowerCase();
            return txt.includes("buscar en esta zona") || txt.includes("search this area") || txt.includes("rechercher dans cette zone");
        });
        if (areaBtn && window.getComputedStyle(areaBtn).display !== "none") {
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
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.1);
        osc2.start(ctx.currentTime + 0.08);
        osc2.stop(ctx.currentTime + 0.35);
    } catch (e) {}
}

function stopExtraction() {
    auto_extract_flag = false;
    if (uiStartBtnEl) uiStartBtnEl.style.display = "flex";
    if (uiStopBtnEl) uiStopBtnEl.style.display = "none";
    setDockStatus(`Listo · ${leads.length} prospectos`);
    updateUiCounters();
    persistLeadsToStorage(true);
    playChime(523.25, 659.25);
}

function findMapsScrollContainer() {
    const feed = document.querySelector('[role="feed"]');
    if (feed && feed.scrollHeight > 250) return feed;

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

    const fallback = document.querySelector("div.m6QErb.DxyBCb, div.m6QErb");
    if (fallback && fallback.scrollHeight > 300) return fallback;
    return null;
}

function checkEndOfResults(container) {
    if (!container) return false;
    const endEl = document.querySelector(".HlvSq");
    if (endEl && (endEl.offsetHeight > 0 || (endEl.innerText && endEl.innerText.length > 0))) return true;

    const text = container.innerText || "";
    return (
        text.includes("Has llegado al final") ||
        text.includes("You've reached the end") ||
        text.includes("No hay más resultados")
    );
}

function detectPainPointsInText(text) {
    if (!text) return "";
    const lower = text.toLowerCase();
    const matched = [];
    for (const item of PAIN_POINT_KEYWORDS) {
        if (lower.includes(item.kw)) matched.push(item.label);
    }
    return matched.slice(0, 2).join("; ");
}

function detectBookingInUrl(url) {
    if (!url) return { platform: "", url: "" };
    const lower = url.toLowerCase();
    for (const h of BOOKING_DOMAIN_HINTS) {
        if (lower.includes(h.match)) return { platform: h.name, url };
    }
    return { platform: "", url: "" };
}

function extractCategoryAndAddress(card) {
    let category = "";
    let address = "";
    let priceLevel = "";
    let openStatus = "";

    const w4Containers = card.querySelectorAll("div.W4Efsd, div.A80fqc");
    for (const container of w4Containers) {
        const fullText = (container.textContent || "").trim();
        if (/^[1-5][.,]\d\s*\(/i.test(fullText)) continue;

        const parts = fullText.includes("·")
            ? fullText.split("·").map(p => p.trim()).filter(Boolean)
            : Array.from(container.children).map(c => c.textContent.trim()).filter(Boolean);

        for (const part of parts) {
            if (/^[$€£]{1,4}$/.test(part) && !priceLevel) {
                priceLevel = part;
                continue;
            }
            if (/abierto|cerrado|cierra|abre|open|closed/i.test(part)) {
                if (!openStatus) openStatus = part.substring(0, 45);
                continue;
            }
            if (!category && part.length >= 3 && part.length < 40 && !/\d{3,}/.test(part) && !/calle|carrera|av\.|avenida|sector|urbaniz/i.test(part)) {
                category = part;
            } else if (!address && (part.length >= 5 && (/\d+/.test(part) || /calle|carrera|av\.|avenida|sector|plaza|paseo/i.test(part)))) {
                address = part;
            }
        }
    }

    if (!category) {
        const searchInput = document.querySelector("#searchboxinput, input[name='q']");
        const query = searchInput ? searchInput.value.trim() : "";
        if (query) {
            const cleanQuery = query.split(/\s+(?:en|de|cerca|near|in)\s+/i)[0].trim();
            if (cleanQuery && cleanQuery.length >= 3 && cleanQuery.length <= 35) {
                category = cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1);
            }
        }
    }

    return { category, address, priceLevel, openStatus };
}

function inspectActivePlaceDrawer() {
    try {
        const mainHeader = document.querySelector("h1.DUwDvf, h1");
        if (!mainHeader) return;
        const activeName = mainHeader.textContent.trim();
        if (!activeName) return;

        const pageText = document.body.innerText || "";
        const isUnclaimed =
            pageText.includes("Reclamar esta empresa") ||
            pageText.includes("Claim this business") ||
            pageText.includes("¿Eres el propietario de esta empresa?");

        const plusMatch = pageText.match(/\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/);

        for (const l of leads) {
            if (l.name === activeName) {
                if (isUnclaimed) l.unclaimed = true;
                if (plusMatch && !l.plusCode) l.plusCode = plusMatch[0];
                computeLeadScore(l);
                break;
            }
        }
    } catch (e) {}
}

function extractLeadsFromDOM() {
    const cards = Array.from(document.querySelectorAll('div.Nv2PK, div[role="article"], div:has(> a[href*="/maps/place/"])'));
    if (!cards.length) return 0;

    let added = 0;
    for (const card of cards) {
        if (max_limit > 0 && leads.length >= max_limit) break;

        try {
            const titleEl = card.querySelector('.fontHeadlineSmall, .qBF1Pd, h3, a[aria-label]');
            const name = titleEl ? titleEl.textContent.trim() : "";
            if (!name || name.length < 2 || name.toLowerCase() === "resultados") continue;

            const link = card.querySelector('a[href*="/maps/place/"]') || card.querySelector("a.hfpxzc") || card.querySelector("a");
            const href = link ? link.href : "";

            let placeID = "";
            let cID = "";
            let latitude = "";
            let longitude = "";

            if (href) {
                const latLngMatch = href.match(/@([-\d.]+),([-\d.]+)/);
                if (latLngMatch) { latitude = latLngMatch[1]; longitude = latLngMatch[2]; }
                const cidMatch = href.match(/0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/);
                if (cidMatch) cID = cidMatch[1];
                const pidMatch = href.match(/!1s([^!&]+)/) || href.match(/19s([^?&]+)/);
                if (pidMatch) placeID = pidMatch[1];
            }

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

            const { category, address, priceLevel, openStatus } = extractCategoryAndAddress(card);

            let website = "";
            let bookingPlatform = "";
            let bookingUrl = "";

            const externalLinks = Array.from(card.querySelectorAll('a[href^="http"]:not([href*="google.com/maps"])'));
            for (const a of externalLinks) {
                const bCheck = detectBookingInUrl(a.href);
                if (bCheck.platform && !bookingPlatform) {
                    bookingPlatform = bCheck.platform;
                    bookingUrl = bCheck.url;
                } else if (!website && !a.href.includes("google.com")) {
                    website = a.href;
                }
            }

            let phone = "";
            const phoneMatch = card.textContent.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
            if (phoneMatch && phoneMatch[0].replace(/\D/g, "").length >= 8) {
                phone = phoneMatch[0].trim();
            }

            const cardText = card.textContent || "";
            const unclaimed = /reclamar esta empresa|claim this business/i.test(cardText);
            const review_pain_points = detectPainPointsInText(cardText);

            const inserted = upsertHarvestedLead({
                name,
                phone,
                website,
                address,
                category,
                averageRating,
                reviewCount,
                priceLevel,
                openStatus,
                unclaimed,
                bookingPlatform,
                bookingUrl,
                review_pain_points,
                latitude,
                longitude,
                placeID,
                cID,
                mapsUrl: href
            });

            if (inserted) added++;
        } catch (e) {}
    }

    if (added > 0) persistLeadsToStorage();
    return added;
}

/**
 * Deep Protobuf/JSON RPC Stream Decoder
 * Extracts 20+ official Google Maps internal array positions.
 */
function parseGoogleMapsResponse(rawText) {
    if (!rawText || typeof rawText !== "string") return null;
    let text = rawText.trim();
    if (text.startsWith('/*""*/')) text = text.replace('/*""*/', "").trim();
    if (text.startsWith(")]}'")) text = text.replace(/^\)\]\}'\s*/, "").trim();

    try {
        const obj = JSON.parse(text);
        if (obj && typeof obj.d === "string") {
            const inner = obj.d.trim().replace(/^\)\]\}'\s*/, "");
            return JSON.parse(inner);
        }
        return obj;
    } catch (e) {
        const lines = text.split("\n");
        for (const line of lines) {
            const l = line.trim();
            if ((l.startsWith("[") && l.endsWith("]")) || (l.startsWith("{") && l.endsWith("}"))) {
                try { return JSON.parse(l); } catch (err) {}
            }
        }
    }
    return null;
}

function extractFeedArray(results) {
    if (!results) return null;
    if (Array.isArray(results[64]) && results[64].length > 0) return results[64];
    if (Array.isArray(results[0]) && Array.isArray(results[0][64]) && results[0][64].length > 0) return results[0][64];

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

function extractDeepRpcFields(e) {
    const name = e[11] || "";
    if (!name || typeof name !== "string") return null;

    let website = ""; try { website = e[7]?.[0] || ""; } catch (_) {}
    let phone = ""; try { phone = e[178]?.[0]?.[0] || e[178]?.[0]?.[1]?.[0]?.[0] || ""; } catch (_) {}
    let reviewCount = ""; try { reviewCount = e[4]?.[8] ? String(e[4][8]) : ""; } catch (_) {}
    let averageRating = ""; try { averageRating = e[4]?.[7] ? String(e[4][7]) : ""; } catch (_) {}
    let priceLevel = "";
    try {
        const rawPrice = e[4]?.[2];
        if (typeof rawPrice === "string") priceLevel = rawPrice;
        else if (typeof rawPrice === "number" && rawPrice > 0 && rawPrice <= 4) priceLevel = "$".repeat(rawPrice);
    } catch (_) {}

    let category = "";
    let secondaryCategories = "";
    try {
        if (Array.isArray(e[13]) && e[13].length > 0) {
            category = e[13][0];
            if (e[13].length > 1) secondaryCategories = e[13].slice(1).join("; ");
        } else if (typeof e[13] === "string") {
            category = e[13];
        } else if (Array.isArray(e[76]) && e[76].length > 0) {
            category = e[76][0];
        }
    } catch (_) {}

    if (!category) {
        const searchInput = document.querySelector("#searchboxinput, input[name='q']");
        const query = searchInput ? searchInput.value.trim() : "";
        if (query) {
            const cleanQuery = query.split(/\s+(?:en|de|cerca|near|in)\s+/i)[0].trim();
            if (cleanQuery && cleanQuery.length >= 3 && cleanQuery.length <= 35) {
                category = cleanQuery.charAt(0).toUpperCase() + cleanQuery.slice(1);
            }
        }
    }

    let placeID = ""; try { placeID = e[78] || ""; } catch (_) {}
    let cID = ""; try { cID = e[37]?.[0]?.[0]?.[29]?.[1] || e[10] || ""; } catch (_) {}
    let address = ""; try { address = Array.isArray(e[2]) ? e[2].join(", ") : (e[39] || ""); } catch (_) {}
    let latitude = ""; let longitude = "";
    try { latitude = String(e[9]?.[2] || ""); longitude = String(e[9]?.[3] || ""); } catch (_) {}

    // Deep signals: Unclaimed status, Hours, PlusCode, Photos & Booking URLs
    let unclaimed = false;
    try {
        // e[49] or e[57] in Maps Protobuf indicates claim/verification ownership metadata
        if (e[49] === 1 || (Array.isArray(e[57]) && e[57][1] === 0)) unclaimed = true;
        const serialized = JSON.stringify(e);
        if (/reclamar esta empresa|claim this business/i.test(serialized)) unclaimed = true;
    } catch (_) {}

    let openingHours = "";
    let openStatus = "";
    try {
        const hoursArr = e[34]?.[1] || e[203]?.[0];
        if (Array.isArray(hoursArr)) {
            openingHours = hoursArr
                .slice(0, 7)
                .map(d => Array.isArray(d) ? `${d[0]}: ${Array.isArray(d[1]) ? d[1].join(", ") : d[1]}` : "")
                .filter(Boolean)
                .join(" | ");
        }
        if (typeof e[34]?.[4]?.[4] === "string") openStatus = e[34][4][4];
    } catch (_) {}

    let plusCode = "";
    try { plusCode = e[183]?.[2]?.[2]?.[0] || ""; } catch (_) {}

    let photoCount = "";
    try {
        if (Array.isArray(e[37]?.[0])) photoCount = String(e[37][0].length);
    } catch (_) {}

    let bookingPlatform = "";
    let bookingUrl = "";
    let review_pain_points = "";
    try {
        const flatJson = JSON.stringify(e);
        for (const h of BOOKING_DOMAIN_HINTS) {
            if (flatJson.toLowerCase().includes(h.match)) {
                bookingPlatform = h.name;
                const urlM = flatJson.match(new RegExp(`https?:\\/\\/[^"'\\\\\\s]*${h.match.replace(".", "\\.")}[^"'\\\\\\s]*`, "i"));
                if (urlM) bookingUrl = urlM[0];
                break;
            }
        }
        review_pain_points = detectPainPointsInText(flatJson);
    } catch (_) {}

    return {
        name,
        website,
        phone,
        reviewCount,
        averageRating,
        priceLevel,
        category,
        secondaryCategories,
        placeID,
        cID,
        address,
        latitude,
        longitude,
        unclaimed,
        openingHours,
        openStatus,
        plusCode,
        photoCount,
        bookingPlatform,
        bookingUrl,
        review_pain_points
    };
}

window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "atlasiq_search_data" || !event.data.data) return;

    try {
        const parsed = parseGoogleMapsResponse(event.data.data);
        if (!parsed) return;
        const feed = extractFeedArray(parsed);
        if (!feed || !Array.isArray(feed)) return;

        let changed = false;
        for (const itemArray of feed) {
            if (!Array.isArray(itemArray)) continue;
            const e = itemArray[itemArray.length - 1];
            if (!Array.isArray(e)) continue;

            const extracted = extractDeepRpcFields(e);
            if (extracted) {
                if (upsertHarvestedLead(extracted)) changed = true;
            }
        }

        updateUiCounters();
        if (changed) persistLeadsToStorage();
    } catch (err) {}
});

// Remote Control Bridge from Side Panel or Popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
    if (msg.action === "remoteStartHarvester") {
        if (msg.gridMode) {
            grid_mode = msg.gridMode;
            const sel = document.getElementById("tl_sel_grid");
            if (sel) sel.value = grid_mode;
        }
        if (msg.speed) {
            extraction_speed = msg.speed;
            const selSp = document.getElementById("tl_sel_speed");
            if (selSp) selSp.value = extraction_speed;
        }
        startExtraction();
        sendResponse({ ok: true, active: true });
        return false;
    }
    if (msg.action === "remoteStopHarvester") {
        stopExtraction();
        sendResponse({ ok: true, active: false });
        return false;
    }
    if (msg.action === "getHarvesterState") {
        sendResponse({
            active: auto_extract_flag,
            leadsCount: leads.length,
            gridMode: grid_mode,
            speed: extraction_speed
        });
        return false;
    }
    return false;
});

setInterval(() => {
    if (!document.querySelector(".atlasiq-dock-container")) {
        createFloatingDock();
    }
}, 2000);

createFloatingDock();
