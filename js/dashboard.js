/**
 * AtlasIQ Enterprise v4.0 - Autonomous Geo-Revenue OS & AI CRM Controller
 * Author: Joseph Castillo (CEO) / WINDOWSTELECOM
 * Architecture: Silicon Valley Principal Grade (CSP-Strict, Zero-XSS, IndexedDB AtlasDB, ECharts BI)
 */

window.__atlasiq_dashboard_loaded = true;

let allLeads = [];
let currentFilter = "all";
let activeLeadForDrawer = null;
let currentPitchChannel = "whatsapp";
let userLocation = null;
let clusterCentroid = null;
let currentFilteredLeads = [];
let activeViewId = "table";

let currentBranding = {
    agencyName: "WINDOWSTELECOM",
    consultantName: "Joseph Castillo – CEO",
    agencyWeb: "windowstelecom.com",
    agencyWa: "https://wa.me/584127785780"
};

// Tabulator, Leaflet & ECharts Instances
let table = null;
let leafletMap = null;
let mapTileLayer = null;
let mapMarkerLayer = null;
let mapHeatLayer = null;
const biCharts = {
    signals: null,
    tech: null,
    niches: null,
    funnel: null
};

let _syncDebounceTimer = null;
let _isInternalSave = false;

// Universal Storage Adapter (Settings & Metadata)
const storageAdapter = (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) ? {
    get: (keys, cb) => chrome.storage.local.get(keys, cb),
    set: (obj, cb) => chrome.storage.local.set(obj, cb),
    remove: (keys, cb) => chrome.storage.local.remove(keys, cb)
} : {
    get: (keys, cb) => {
        const res = {};
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => {
            try {
                const item = localStorage.getItem(k);
                res[k] = item ? JSON.parse(item) : null;
            } catch (e) {
                res[k] = localStorage.getItem(k);
            }
        });
        cb(res);
    },
    set: (obj, cb) => {
        Object.entries(obj).forEach(([k, v]) => {
            localStorage.setItem(k, typeof v === "object" ? JSON.stringify(v) : String(v));
        });
        if (cb) cb();
    },
    remove: (keys, cb) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => localStorage.removeItem(k));
        if (cb) cb();
    }
};

function safeExternalUrl(rawUrl) {
    if (!rawUrl) return "";
    const normalized = normalizeUrl(rawUrl);
    if (/^https?:\/\//i.test(normalized)) {
        return normalized.replace(/"/g, "%22").replace(/'/g, "%27");
    }
    return "";
}

function getLeadKey(lead) {
    if (!lead) return "";
    if (lead.dedupeKey) return String(lead.dedupeKey);
    if (typeof AtlasDB !== "undefined" && AtlasDB.computeDedupeKey) {
        const k = AtlasDB.computeDedupeKey(lead);
        if (k) return k;
    }
    return String(lead.placeID || lead.cID || lead.name || "");
}

function findLeadByKey(key) {
    if (!key) return null;
    return allLeads.find(l =>
        l.dedupeKey === key ||
        (l.placeID && l.placeID === key) ||
        (l.cID && l.cID === key) ||
        l.name === key
    ) || null;
}

async function persistAllLeads() {
    _isInternalSave = true;
    try {
        if (typeof AtlasDB !== "undefined" && AtlasDB.saveAllLeads) {
            await AtlasDB.saveAllLeads(allLeads);
        } else {
            await new Promise(r => storageAdapter.set({ leads: allLeads, lastSync: Date.now() }, r));
        }
    } finally {
        setTimeout(() => { _isInternalSave = false; }, 350);
    }
}

function normalizeLeadRecord(lead) {
    if (!lead || typeof lead !== "object") return;
    if (!lead.dedupeKey) lead.dedupeKey = getLeadKey(lead);
    if (lead.bookingPlatform && !lead.booking_platform) lead.booking_platform = lead.bookingPlatform;
    if (lead.bookingUrl && !lead.booking_url) lead.booking_url = lead.bookingUrl;
    if (!lead.pipeline_stage) lead.pipeline_stage = "nuevo";

    const s = calculateLeadScore(lead);
    lead.lead_score = s.score;
    lead.priority = s.priority;
    lead.opportunities = s.opportunities.join(", ");
}

/**
 * ============================================================================
 * 1. TABULATOR DEEP OSINT DATA TABLE (ZERO XSS, ZERO INLINE ONCLICK)
 * ============================================================================
 */
function initTable() {
    const isMobile = window.innerWidth < 768;
    table = new Tabulator("#example-table", {
        layout: isMobile ? "fitDataFill" : "fitColumns",
        placeholder: "Base de datos vacía. Abre Google Maps y activa el Harvester v4.0 (Simple o Matriz Geo-Grid) para capturar prospectos.",
        selectable: true,
        pagination: "local",
        paginationSize: 25,
        paginationSizeSelector: [10, 25, 50, 100, 250, 500],
        columns: [
            {
                title: "Empresa & Señales OSINT",
                field: "name",
                widthGrow: 2.3,
                minWidth: 185,
                formatter: (cell) => {
                    const row = cell.getRow().getData();
                    const safeName = escapeHtml(cell.getValue() || "Sin nombre");
                    const mUrl = safeExternalUrl(row.mapsUrl);
                    const mapLink = mUrl
                        ? `<a href="${mUrl}" target="_blank" rel="noopener noreferrer" title="Abrir ficha en Google Maps" style="margin-left: 5px; text-decoration: none;">📍</a>`
                        : "";
                    let badges = "";
                    if (row.unclaimed) {
                        badges += ` <span style="background: rgba(245,158,11,0.16); color: #d97706; border: 1px solid rgba(245,158,11,0.35); padding: 1px 5px; border-radius: 4px; font-size: 9.5px; font-weight: 800;" title="Ficha Google Business No Reclamada">🏴 Sin Reclamar</span>`;
                    }
                    if (row.ad_spend_active) {
                        badges += ` <span style="background: rgba(16,185,129,0.15); color: #059669; border: 1px solid rgba(16,185,129,0.35); padding: 1px 5px; border-radius: 4px; font-size: 9.5px; font-weight: 800;" title="Píxeles publicitarios activos detectados">💰 Ads</span>`;
                    }
                    if (row.decision_maker || row.tax_id) {
                        badges += ` <span style="background: rgba(59,130,246,0.14); color: #2563eb; padding: 1px 5px; border-radius: 4px; font-size: 9.5px; font-weight: 700;" title="${escapeHtml([row.decision_maker, row.tax_id].filter(Boolean).join(' · '))}">🕵️ OSINT</span>`;
                    }
                    return `<strong class="tl-table-name">${safeName}</strong>${mapLink}${badges}`;
                }
            },
            {
                title: "Rating",
                field: "averageRating",
                width: 105,
                minWidth: 92,
                hozAlign: "center",
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    const rev = row.reviewCount ? `(${escapeHtml(row.reviewCount)})` : "";
                    return `<span class="tl-rating-pill">★ ${escapeHtml(val)} <small style="color: #64748b;">${rev}</small></span>`;
                }
            },
            {
                title: "Score v4",
                field: "lead_score",
                width: 90,
                minWidth: 80,
                hozAlign: "center",
                sorter: "number",
                formatter: (cell) => {
                    const score = parseInt(cell.getValue(), 10) || 50;
                    let cls = "tl-score-med";
                    if (score >= 75) cls = "tl-score-high";
                    else if (score < 45) cls = "tl-score-low";
                    return `<span class="tl-badge-score ${cls}">${score}</span>`;
                }
            },
            {
                title: "Teléfono / WA",
                field: "phone",
                widthGrow: 1.35,
                minWidth: 125,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    const pInfo = formatPhone(val);
                    const waBtn = pInfo.whatsappUrl
                        ? `<a href="${pInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer" style="margin-left: 6px; text-decoration: none;" title="Contactar por WhatsApp">💬</a>`
                        : "";
                    return `<span>${escapeHtml(val)}</span>${waBtn}`;
                }
            },
            {
                title: "Email & DNS (MX/DMARC)",
                field: "email",
                widthGrow: 1.9,
                minWidth: 175,
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    const safeEmail = escapeHtml(val);
                    let mxBadge = "";
                    if (row.mx_status === "valid") {
                        const dmarcWarn = row.dmarc_status === "missing"
                            ? ` <span style="background:#fef3c7;color:#b45309;font-size:9.5px;padding:1px 4px;border-radius:4px;font-weight:700;" title="Dominio sin DMARC (Vulnerable a Spoofing)">⚠ No DMARC</span>`
                            : (row.dmarc_status === "present" ? ` <span style="background:#dcfce7;color:#15803d;font-size:9.5px;padding:1px 4px;border-radius:4px;font-weight:700;" title="SPF + DMARC Activos">🛡️ DMARC</span>` : "");
                        mxBadge = `<span class="tl-mx-badge valid" title="${escapeHtml(row.mx_provider || 'Servidor MX Activo')}">✓ MX</span>${dmarcWarn}`;
                    } else if (row.mx_status === "invalid") {
                        mxBadge = `<span class="tl-mx-badge invalid" title="${escapeHtml(row.mx_provider || 'Sin servidor MX')}">✕ Rebote</span>`;
                    } else {
                        mxBadge = `<button class="tl-btn-verify-mx" style="font-size: 10px; padding: 1px 6px; border-radius: 4px; border: 1px solid #cbd5e1; background: transparent; color: inherit; cursor: pointer; margin-left: 4px;" title="Auditar MX + SPF + DMARC con Cloudflare DoH">🛡️ DNS</button>`;
                    }
                    return `<a href="mailto:${ encodeURIComponent(val) }" style="color: #3b82f6; text-decoration: none; font-weight: 600;">${safeEmail}</a> ${mxBadge}`;
                },
                cellClick: async (e, cell) => {
                    const btn = e.target && e.target.closest(".tl-btn-verify-mx");
                    if (!btn) return;
                    e.stopPropagation();
                    const row = cell.getRow();
                    const rowData = row.getData();
                    if (!rowData.email) return;
                    btn.textContent = "⏳...";
                    btn.disabled = true;
                    const res = await verifyDomainMx(rowData.email);
                    rowData.mx_status = res.valid ? "valid" : "invalid";
                    rowData.mx_provider = res.provider;
                    rowData.spf_status = res.spf;
                    rowData.dmarc_status = res.dmarc;
                    normalizeLeadRecord(rowData);
                    row.update({
                        mx_status: rowData.mx_status,
                        mx_provider: rowData.mx_provider,
                        spf_status: rowData.spf_status,
                        dmarc_status: rowData.dmarc_status,
                        lead_score: rowData.lead_score,
                        opportunities: rowData.opportunities
                    });
                    const target = findLeadByKey(getLeadKey(rowData));
                    if (target) {
                        Object.assign(target, {
                            mx_status: rowData.mx_status,
                            mx_provider: rowData.mx_provider,
                            spf_status: rowData.spf_status,
                            dmarc_status: rowData.dmarc_status
                        });
                        normalizeLeadRecord(target);
                        await persistAllLeads();
                    }
                    if (res.valid) playAudioNotification("success");
                }
            },
            {
                title: "Web · Stack · Speed",
                field: "website",
                widthGrow: 1.7,
                minWidth: 145,
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #ef4444; font-size: 11px; font-weight: 700;">⚡ Sin Web</span>';
                    const safeHref = safeExternalUrl(val);
                    const domain = escapeHtml(extractDomain(val) || val);
                    let badges = "";
                    const stack = String(row.tech_stack || "");
                    if (stack.includes("Shopify")) badges += ' <span style="background: #dcfce7; color: #15803d; padding: 1px 4px; border-radius: 4px; font-size: 9.5px; font-weight: 700;">Shopify</span>';
                    else if (stack.includes("WordPress")) badges += ' <span style="background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 4px; font-size: 9.5px; font-weight: 700;">WP</span>';
                    else if (stack.includes("Wix")) badges += ' <span style="background: #fef3c7; color: #b45309; padding: 1px 4px; border-radius: 4px; font-size: 9.5px; font-weight: 700;">Wix</span>';

                    if (typeof row.pagespeed_mobile === "number") {
                        const ps = row.pagespeed_mobile;
                        const psColor = ps >= 75 ? "#15803d" : (ps >= 50 ? "#b45309" : "#b91c1c");
                        const psBg = ps >= 75 ? "#dcfce7" : (ps >= 50 ? "#fef3c7" : "#fee2e2");
                        badges += ` <span style="background:${psBg};color:${psColor};padding:1px 4px;border-radius:4px;font-size:9.5px;font-weight:800;" title="Google PageSpeed Móvil">⚡${ps}</span>`;
                    }
                    return safeHref
                        ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="tl-table-link">${domain}</a>${badges}`
                        : `<span>${domain}</span>${badges}`;
                }
            },
            {
                title: "Rubro",
                field: "category",
                widthGrow: 1.3,
                minWidth: 120,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    return `<span class="tl-table-category">${escapeHtml(val)}</span>`;
                }
            },
            {
                title: "📍 Distancia",
                field: "distanceKm",
                width: 96,
                minWidth: 86,
                hozAlign: "center",
                sorter: "number",
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (val === null || val === undefined || isNaN(val)) return '<span style="color: #94a3b8; font-size: 11px;">-</span>';
                    const formatted = val < 1 ? `${Math.round(val * 1000)} m` : `${val.toFixed(1)} km`;
                    return `<span class="tl-distance-pill">📍 ${formatted}</span>`;
                }
            },
            {
                title: "Inspector",
                width: 102,
                minWidth: 92,
                hozAlign: "center",
                formatter: () => `<button class="tl-btn tl-btn-primary" style="height: 26px; font-size: 11px; padding: 0 8px;">360° ↗</button>`,
                cellClick: (e, cell) => {
                    openLeadDrawer(cell.getRow().getData());
                }
            }
        ],
        rowClick: (e, row) => {
            if (!e.target.closest("a") && !e.target.closest("button")) {
                openLeadDrawer(row.getData());
            }
        }
    });
}

/**
 * ============================================================================
 * 2. GEOLOCATION, O(N) SPATIAL PROXIMITY & DATA LOADER
 * ============================================================================
 */
function initLocationAndDistances() {
    detectUserLocation((loc) => {
        if (loc) {
            userLocation = loc;
            const badge = document.getElementById("header-user-location");
            const textEl = document.getElementById("user-location-text");
            if (textEl) {
                textEl.textContent = loc.label || `${loc.city || ""}, ${loc.country || ""}`.trim().replace(/^,|,$/g, "");
            }
            if (badge) {
                badge.title = `Ubicación detectada: Lat ${loc.lat.toFixed(4)}, Lon ${loc.lon.toFixed(4)} (${String(loc.source || "ip").toUpperCase()})`;
            }
            storageAdapter.set({ user_location: loc });
        } else {
            const textEl = document.getElementById("user-location-text");
            if (textEl) textEl.textContent = "Centroide del Cuadrante";
        }
        recalculateDistances();
        applyFilters();
    });
}

function recalculateDistances() {
    if (!allLeads || allLeads.length === 0) return;

    clusterCentroid = calculateCentroid(allLeads);
    const refPoint = userLocation || clusterCentroid;

    if (refPoint) {
        allLeads.forEach(lead => {
            const dist = haversineDistance(refPoint.lat, refPoint.lon, lead.latitude, lead.longitude);
            lead.distanceKm = dist !== null ? parseFloat(dist.toFixed(2)) : null;
        });
    }

    calculateInterBusinessDistances(allLeads);
}

function populateNicheDropdown() {
    const nicheSelect = document.getElementById("filter-niche");
    if (!nicheSelect) return;

    const previousVal = nicheSelect.value || "all";
    const counts = new Map();

    allLeads.forEach(l => {
        const cat = (l.category || "Sin Categoría").trim();
        counts.set(cat, (counts.get(cat) || 0) + 1);
    });

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

    nicheSelect.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "all";
    defaultOpt.textContent = `Todos los Nichos (${allLeads.length})`;
    nicheSelect.appendChild(defaultOpt);

    sorted.forEach(([cat, count]) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = `${cat} (${count})`;
        if (cat === previousVal) opt.selected = true;
        nicheSelect.appendChild(opt);
    });
}

async function loadDashboardData() {
    const fetchedLeads = (typeof AtlasDB !== "undefined" && AtlasDB.getAllLeads)
        ? await AtlasDB.getAllLeads()
        : await new Promise(r => storageAdapter.get(["leads"], d => r(d.leads || [])));

    allLeads = Array.isArray(fetchedLeads) ? fetchedLeads : [];
    allLeads.forEach(normalizeLeadRecord);

    storageAdapter.get([
        "tl_webhook_url",
        "tl_gemini_key",
        "tl_edge_worker_url",
        "tl_branding",
        "user_location"
    ], (data) => {
        if (data.user_location) {
            userLocation = data.user_location;
            const textEl = document.getElementById("user-location-text");
            if (textEl && userLocation.label) textEl.textContent = userLocation.label;
        }

        if (data.tl_branding && typeof data.tl_branding === "object") {
            currentBranding = { ...currentBranding, ...data.tl_branding };
        }

        const setInput = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined && val !== null) el.value = val;
        };

        setInput("setting-webhook-url", data.tl_webhook_url || "");
        setInput("setting-gemini-key", data.tl_gemini_key || "");
        setInput("setting-edge-worker-url", data.tl_edge_worker_url || "");
        setInput("setting-agency-name", currentBranding.agencyName || "");
        setInput("setting-consultant-name", currentBranding.consultantName || "");
        setInput("setting-agency-web", currentBranding.agencyWeb || "");
        setInput("setting-agency-wa", currentBranding.agencyWa || "");

        recalculateDistances();
        populateNicheDropdown();
        applyFilters();
    });
}

/**
 * ============================================================================
 * 3. KPI ENGINE & MULTI-SIGNAL FILTERING
 * ============================================================================
 */
function updateKpiMetrics(totalDataset, displayedDataset) {
    const total = totalDataset.length;
    const displayed = displayedDataset.length;
    const withEmail = displayedDataset.filter(l => l.email && String(l.email).includes("@")).length;
    const withPhone = displayedDataset.filter(l => l.phone && String(l.phone).length > 5).length;
    const highScore = displayedDataset.filter(l => (parseInt(l.lead_score, 10) || 0) >= 75).length;
    const unclaimedCount = displayedDataset.filter(l => Boolean(l.unclaimed)).length;

    let ratingSum = 0;
    let ratingCount = 0;
    let reviewSum = 0;

    displayedDataset.forEach(l => {
        const r = parseFloat(l.averageRating);
        const rev = parseInt(l.reviewCount, 10);
        if (r && !isNaN(r)) {
            ratingSum += r;
            ratingCount++;
        }
        if (rev && !isNaN(rev)) {
            reviewSum += rev;
        }
    });

    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "0.0";
    const avgReviews = ratingCount > 0 ? Math.round(reviewSum / ratingCount) : 0;

    const totalEl = document.getElementById("kpi-total-leads");
    if (totalEl) {
        totalEl.textContent = total.toLocaleString();
        const sub = totalEl.nextElementSibling;
        if (sub) {
            sub.textContent = displayed !== total
                ? `${displayed.toLocaleString()} visibles tras filtros`
                : "Motor IndexedDB AtlasDB activo";
        }
    }

    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setTxt("kpi-total-emails", withEmail.toLocaleString());
    setTxt("kpi-email-pct", displayed > 0 ? `${Math.round((withEmail / displayed) * 100)}% con buzón detectado` : "0% con buzón detectado");
    setTxt("kpi-total-phones", withPhone.toLocaleString());
    setTxt("kpi-phone-pct", displayed > 0 ? `${Math.round((withPhone / displayed) * 100)}% accionables hoy` : "0% accionables hoy");
    setTxt("kpi-high-score", highScore.toLocaleString());
    setTxt("kpi-unclaimed-sub", unclaimedCount > 0 ? `${unclaimedCount} fichas sin reclamar detectadas` : "Prioridad inmediata de cierre");
    setTxt("kpi-avg-rating", `${avgRating}★`);
    setTxt("kpi-avg-reviews", `${avgReviews} reseñas promedio`);
}

function applyFilters() {
    const searchVal = (document.getElementById("filter-search")?.value || "").toLowerCase().trim();
    const nicheVal = (document.getElementById("filter-niche")?.value || "all").trim();
    const isStrict = document.getElementById("check-strict-niche")?.checked || false;
    const distanceVal = document.getElementById("filter-distance")?.value || "all";
    const maxDist = distanceVal !== "all" ? parseFloat(distanceVal) : null;

    const filtered = allLeads.filter(lead => {
        if (searchVal) {
            const haystack = [
                lead.name, lead.legal_name, lead.tax_id, lead.decision_maker,
                lead.phone, lead.email, lead.address, lead.category, lead.secondaryCategories,
                lead.website, lead.opportunities, lead.tech_stack, lead.review_pain_points,
                lead.booking_platform
            ].filter(Boolean).join(" ").toLowerCase();
            if (!haystack.includes(searchVal)) return false;
        }

        if (currentFilter === "high-score") {
            if ((parseInt(lead.lead_score, 10) || 0) < 75) return false;
        } else if (currentFilter === "unclaimed") {
            if (!lead.unclaimed) return false;
        } else if (currentFilter === "ads-active") {
            if (!lead.ad_spend_active) return false;
        } else if (currentFilter === "has-email") {
            if (!lead.email || !String(lead.email).includes("@")) return false;
        } else if (currentFilter === "has-phone") {
            if (!lead.phone || String(lead.phone).length <= 5) return false;
        } else if (currentFilter === "no-website") {
            if (lead.website && String(lead.website).trim().length > 0) return false;
        }

        if (nicheVal && nicheVal !== "all") {
            const leadCatNorm = normalizeCategory(lead.category);
            const targetNorm = normalizeCategory(nicheVal);
            if (isStrict) {
                if (leadCatNorm !== targetNorm) return false;
            } else {
                if (!leadCatNorm.includes(targetNorm) && !targetNorm.includes(leadCatNorm)) return false;
            }
        }

        if (maxDist !== null && !isNaN(maxDist)) {
            if (lead.distanceKm !== null && lead.distanceKm !== undefined && lead.distanceKm > maxDist) {
                return false;
            }
        }

        return true;
    });

    currentFilteredLeads = filtered;

    if (table) {
        table.setData(filtered);
    }

    updateKpiMetrics(allLeads, filtered);
    if (leafletMap) updateMapData(currentFilteredLeads);
    renderKanbanBoard(currentFilteredLeads);
    if (activeViewId === "analytics") renderAnalyticsBiCharts(currentFilteredLeads);

    const banner = document.getElementById("filter-reset-banner");
    const bannerFiltered = document.getElementById("banner-filtered-count");
    const bannerTotal = document.getElementById("banner-total-count");

    if (allLeads.length > 0 && filtered.length < allLeads.length) {
        if (banner) banner.style.display = "flex";
        if (bannerFiltered) bannerFiltered.textContent = filtered.length.toLocaleString();
        if (bannerTotal) bannerTotal.textContent = allLeads.length.toLocaleString();
    } else if (banner) {
        banner.style.display = "none";
    }

    updateMarketSaturationView(nicheVal);
}

/**
 * ============================================================================
 * 4. MARKET SATURATION & BLUE OCEAN RADAR (CSP-SAFE DELEGATION)
 * ============================================================================
 */
function updateMarketSaturationView(targetNiche = "all") {
    const ref = userLocation || clusterCentroid;
    const sat = analyzeMarketSaturation(allLeads, targetNiche, ref);

    if (sat.empty) {
        const sc = document.getElementById("sat-score-val");
        if (sc) sc.textContent = "0%";
        const lb = document.getElementById("sat-level-badge");
        if (lb) lb.textContent = "Sin datos";
        const ds = document.getElementById("sat-density-sub");
        if (ds) ds.textContent = "Inicia una prospección en Google Maps.";
        renderNicheBreakdownTable();
        return;
    }

    const scoreValEl = document.getElementById("sat-score-val");
    if (scoreValEl) {
        scoreValEl.textContent = `${sat.saturationIndex}%`;
        scoreValEl.style.color = sat.saturationColor;
    }

    const levelBadge = document.getElementById("sat-level-badge");
    if (levelBadge) {
        levelBadge.textContent = sat.saturationTag;
        levelBadge.style.color = sat.saturationColor;
        levelBadge.style.background = sat.saturationIndex >= 70 ? "#fef2f2" : (sat.saturationIndex >= 40 ? "#fffbeb" : "#ecfdf5");
    }

    const meterFill = document.getElementById("sat-meter-fill");
    if (meterFill) {
        meterFill.style.width = `${sat.saturationIndex}%`;
        meterFill.style.background = sat.saturationColor;
    }

    document.getElementById("sat-density-sub").textContent =
        `${sat.totalCompetitors} competidores (${sat.densityPerKm2}/km²) en un radio de ${sat.effectiveRadiusKm.toFixed(1)} km`;

    const peerDistEl = document.getElementById("sat-peer-dist-val");
    if (peerDistEl) {
        peerDistEl.textContent = sat.avgCompetitorDistanceKm !== null
            ? (sat.avgCompetitorDistanceKm < 1 ? `${Math.round(sat.avgCompetitorDistanceKm * 1000)} m` : `${sat.avgCompetitorDistanceKm} km`)
            : "-";
    }
    document.getElementById("sat-peer-dist-sub").textContent =
        "Separación promedio entre competidores del mismo rubro en el cuadrante.";

    document.getElementById("sat-vuln-val").textContent = `${sat.digitalVulnerability.withoutWebsitePct}% Sin Web`;
    document.getElementById("sat-vuln-sub").textContent =
        `${sat.digitalVulnerability.withoutPixelPct}% sin píxeles Ads · ${sat.digitalVulnerability.lowRatingPct}% con reputación < 4.0★`;

    document.getElementById("sat-quadrant-val").textContent = sat.leastDenseQuadrant;
    document.getElementById("sat-quadrant-sub").textContent =
        `Menor presión competitiva (${sat.leastDenseCount} negocios en este sub-sector)`;

    document.getElementById("sat-advice-text").textContent = sat.strategicAdvice;
    document.getElementById("sat-target-badge").textContent = sat.targetNiche;

    const chipsContainer = document.getElementById("sat-opportunity-chips");
    if (chipsContainer) {
        chipsContainer.innerHTML = "";
        const centerCoords = clusterCentroid || userLocation || { lat: 8.9248, lon: -67.4285 };

        sat.opportunityNiches.forEach(niche => {
            const chip = document.createElement("a");
            chip.className = "tl-opportunity-chip";
            chip.title = `${niche.reason} — Clic para explorar en Google Maps`;
            chip.target = "_blank";
            chip.rel = "noopener noreferrer";
            chip.href = `https://www.google.com/maps/search/${encodeURIComponent(niche.searchKeyword || niche.name)}/@${centerCoords.lat},${centerCoords.lon},14z`;

            const titleSpan = document.createElement("span");
            titleSpan.textContent = `+ ${niche.name} `;
            const smallEl = document.createElement("small");
            smallEl.style.opacity = "0.8";
            smallEl.style.fontWeight = "normal";
            smallEl.textContent = `(Viabilidad ${niche.viability}) ↗`;

            chip.appendChild(titleSpan);
            chip.appendChild(smallEl);
            chipsContainer.appendChild(chip);
        });
    }

    renderNicheBreakdownTable();
}

function renderNicheBreakdownTable() {
    const tbody = document.getElementById("sat-niche-tbody");
    if (!tbody) return;

    if (!allLeads || allLeads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding: 12px; text-align: center; color: #94a3b8;">No hay prospectos en la base de datos.</td></tr>';
        return;
    }

    const nicheMap = new Map();
    allLeads.forEach(lead => {
        const cat = (lead.category || "General").trim();
        if (!nicheMap.has(cat)) nicheMap.set(cat, []);
        nicheMap.get(cat).push(lead);
    });

    const sortedNiches = Array.from(nicheMap.entries()).sort((a, b) => b[1].length - a[1].length);

    let html = "";
    sortedNiches.forEach(([catName, leadList]) => {
        const total = leadList.length;
        let distSum = 0;
        let distCount = 0;
        let noWebCount = 0;

        leadList.forEach(l => {
            if (!l.website || String(l.website).trim() === "") noWebCount++;
            if (typeof l.nearestPeerDistanceKm === "number" && !isNaN(l.nearestPeerDistanceKm)) {
                distSum += l.nearestPeerDistanceKm;
                distCount++;
            }
        });

        const avgDist = distCount > 0 ? (distSum / distCount) : null;
        const avgDistText = avgDist !== null
            ? (avgDist < 1 ? `${Math.round(avgDist * 1000)} m` : `${avgDist.toFixed(1)} km`)
            : "-";

        let satBadge = '<span class="tl-sat-badge" style="background: #ecfdf5; color: #047857;">Océano Azul</span>';
        if (total >= 25 || (avgDist !== null && avgDist < 0.3)) {
            satBadge = '<span class="tl-sat-badge" style="background: #fef2f2; color: #b91c1c;">Saturado</span>';
        } else if (total >= 10 || (avgDist !== null && avgDist < 0.7)) {
            satBadge = '<span class="tl-sat-badge" style="background: #fffbeb; color: #b45309;">Equilibrado</span>';
        }

        const noWebPct = total > 0 ? Math.round((noWebCount / total) * 100) : 0;

        html += `
            <tr class="tl-niche-tr">
                <td class="tl-niche-name" style="padding: 8px 12px;">${escapeHtml(catName)}</td>
                <td class="tl-niche-total" style="padding: 8px 12px; text-align: center;">${total}</td>
                <td class="tl-niche-dist" style="padding: 8px 12px; text-align: center;">📍 ${escapeHtml(avgDistText)}</td>
                <td style="padding: 8px 12px; text-align: center;">${satBadge}</td>
                <td style="padding: 8px 12px; text-align: center; color: ${noWebPct > 50 ? '#ef4444' : 'var(--text-secondary)'}; font-weight: 600;">
                    ${noWebPct}% (${noWebCount}/${total})
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <button type="button" class="tl-btn tl-btn-outline btn-filter-niche-row" data-niche="${escapeHtml(catName)}" style="height: 24px; font-size: 11px; padding: 0 8px;">
                        Filtrar ↗
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function selectAndFilterNiche(nicheName) {
    const nicheSelect = document.getElementById("filter-niche");
    if (nicheSelect) nicheSelect.value = nicheName;
    applyFilters();
    const tableCard = document.getElementById("view-section-table");
    if (tableCard && tableCard.style.display !== "none") {
        tableCard.scrollIntoView({ behavior: "smooth" });
    }
}

/**
 * ============================================================================
 * 5. GEOSPATIAL LEAFLET HEATMAP & SCORE PINS (CSP-SAFE DELEGATION)
 * ============================================================================
 */
function setMapTileLayer(theme) {
    if (!leafletMap || typeof L === "undefined") return;
    const mapContainer = document.getElementById("atlasiq-map");
    if (mapContainer) {
        mapContainer.setAttribute("data-map-theme", theme === "dark" ? "dark" : "light");
    }
    if (mapTileLayer) return;

    // Esri World Street Map requires ZERO API key, never blocks chrome-extension:// origins,
    // and pairs with our CSS tactical dark-mode filter on .leaflet-tile-pane.
    mapTileLayer = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        {
            maxZoom: 19,
            attribution: '&copy; Esri & OpenStreetMap'
        }
    ).addTo(leafletMap);
}

function initLeafletMap() {
    const mapEl = document.getElementById("atlasiq-map");
    if (!mapEl || leafletMap || typeof L === "undefined") return;

    const initialLat = clusterCentroid?.lat || userLocation?.lat || 8.9248;
    const initialLon = clusterCentroid?.lon || userLocation?.lon || -67.4285;

    leafletMap = L.map("atlasiq-map", {
        center: [initialLat, initialLon],
        zoom: 13,
        zoomControl: true
    });

    const activeTheme = document.documentElement.getAttribute("data-theme") || "dark";
    setMapTileLayer(activeTheme);
    mapMarkerLayer = L.layerGroup().addTo(leafletMap);

    // Keep heatmap thermal intensity calibrated across any zoom level
    leafletMap.on("zoomend", () => {
        if (mapHeatLayer && typeof mapHeatLayer.setOptions === "function") {
            mapHeatLayer.setOptions({ maxZoom: Math.max(10, leafletMap.getZoom()) });
        }
    });

    // Event delegation inside Leaflet container for opening 360° drawer without inline onclick
    mapEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-map-open-drawer");
        if (btn) {
            const key = btn.getAttribute("data-lead-key");
            const found = findLeadByKey(key);
            if (found) openLeadDrawer(found);
        }
    });
}

function computeSmartClusterBounds(coordsList) {
    if (coordsList.length <= 3) return coordsList;
    const lats = coordsList.map(c => c[0]).slice().sort((a, b) => a - b);
    const lons = coordsList.map(c => c[1]).slice().sort((a, b) => a - b);
    const medLat = lats[Math.floor(lats.length / 2)];
    const medLon = lons[Math.floor(lons.length / 2)];

    // Filter out extreme geographic outliers (>80km from median cluster) so fitBounds stays focused on the target city
    const inliers = coordsList.filter(([lat, lon]) => {
        const d = haversineDistance(medLat, medLon, lat, lon);
        return d !== null && d <= 80;
    });
    return inliers.length > 0 ? inliers : coordsList;
}

function updateMapData(leadsToRender) {
    if (!leafletMap || typeof L === "undefined") return;

    const leads = leadsToRender || currentFilteredLeads || allLeads;
    const showMarkers = document.getElementById("check-map-markers")?.checked !== false;
    const showHeatmap = document.getElementById("check-map-heatmap")?.checked !== false;

    if (mapMarkerLayer) mapMarkerLayer.clearLayers();
    if (mapHeatLayer) {
        leafletMap.removeLayer(mapHeatLayer);
        mapHeatLayer = null;
    }

    const validLeads = leads.filter(l => {
        const lat = parseFloat(l.latitude);
        const lon = parseFloat(l.longitude);
        return !isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
    });

    const badge = document.getElementById("map-counter-badge");
    if (badge) badge.textContent = `${validLeads.length} Pines`;

    if (validLeads.length === 0) return;

    const latLngBounds = [];
    const heatPoints = [];

    validLeads.forEach(lead => {
        const lat = parseFloat(lead.latitude);
        const lon = parseFloat(lead.longitude);
        const score = parseInt(lead.lead_score, 10) || 50;

        latLngBounds.push([lat, lon]);
        const intensity = score >= 75 ? 1.0 : (score >= 45 ? 0.72 : 0.5);
        heatPoints.push([lat, lon, intensity]);

        if (showMarkers) {
            let pinColor = "#3b82f6";
            if (score >= 75) pinColor = "#10b981";
            else if (score >= 45) pinColor = "#f59e0b";

            const customIcon = L.divIcon({
                className: "tl-map-pin-div",
                html: `<div style="background:${pinColor};width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${score}</div>`,
                iconSize: [26, 26],
                iconAnchor: [13, 13],
                popupAnchor: [0, -13]
            });

            const distStr = lead.distanceKm !== null && lead.distanceKm !== undefined
                ? (lead.distanceKm < 1 ? `${Math.round(lead.distanceKm * 1000)} m` : `${lead.distanceKm} km`)
                : "-";

            const safeHref = safeExternalUrl(lead.website);
            const webStr = safeHref
                ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="color:#3b82f6;text-decoration:underline;">${escapeHtml(extractDomain(lead.website))}</a>`
                : '<span style="color:#ef4444;font-weight:700;">Sin Web (Oportunidad)</span>';

            const leadKey = escapeHtml(getLeadKey(lead));
            const popupContent = `
                <div style="font-family:inherit;font-size:12px;line-height:1.4;min-width:220px;padding:2px;">
                    <div class="tl-map-popup-title">${escapeHtml(lead.name || "Empresa")}</div>
                    <div class="tl-map-popup-sub">
                        ★ ${escapeHtml(lead.averageRating || "N/A")} · ${escapeHtml(lead.category || "General")}
                    </div>
                    <div class="tl-map-popup-box">
                        <div>📍 Distancia: <strong>${escapeHtml(distStr)}</strong></div>
                        <div>📞 Teléfono: <strong>${escapeHtml(lead.phone || "No detectado")}</strong></div>
                        <div>🌐 Sitio Web: <strong>${webStr}</strong></div>
                    </div>
                    <button type="button" class="tl-btn tl-btn-primary btn-map-open-drawer" data-lead-key="${leadKey}" style="width:100%;height:26px;font-size:11px;">
                        Abrir Inspector 360° ↗
                    </button>
                </div>
            `;

            const marker = L.marker([lat, lon], { icon: customIcon }).bindPopup(popupContent);
            mapMarkerLayer.addLayer(marker);
        }
    });

    // 1. Fit camera bounds FIRST (filtering geographic outliers) so zoom level is accurate before drawing heatmap
    if (latLngBounds.length > 0) {
        const focusedBounds = computeSmartClusterBounds(latLngBounds);
        leafletMap.fitBounds(focusedBounds, { padding: [44, 44], maxZoom: 15, animate: false });
    }

    // 2. Render calibrated Heatmap anchored to current zoom so thermal intensity never fades out
    if (showHeatmap && heatPoints.length > 0 && typeof L.heatLayer === "function") {
        const activeZoom = leafletMap.getZoom() || 13;
        mapHeatLayer = L.heatLayer(heatPoints, {
            radius: 34,
            blur: 22,
            minOpacity: 0.42,
            max: 1.0,
            maxZoom: Math.max(10, activeZoom),
            gradient: {
                0.2: "#3b82f6",
                0.45: "#06b6d4",
                0.65: "#10b981",
                0.82: "#f59e0b",
                1.0: "#ef4444"
            }
        }).addTo(leafletMap);
    }
}

/**
 * ============================================================================
 * 6. SALES PIPELINE KANBAN CRM (DRAG & DROP + CSP-SAFE DELEGATION)
 * ============================================================================
 */
function renderKanbanBoard(leadsToRender) {
    const leads = leadsToRender || currentFilteredLeads || allLeads;
    const stages = ["nuevo", "contactado", "negociacion", "ganado", "descartado"];
    const counts = { nuevo: 0, contactado: 0, negociacion: 0, ganado: 0, descartado: 0 };

    stages.forEach(st => {
        const container = document.getElementById(`kanban-cards-${st}`);
        if (container) container.innerHTML = "";
    });

    // Cap rendered DOM cards per column to 120 for 60fps smoothness on huge datasets while keeping exact counts
    leads.forEach(lead => {
        const stage = lead.pipeline_stage && stages.includes(lead.pipeline_stage) ? lead.pipeline_stage : "nuevo";
        counts[stage]++;

        const container = document.getElementById(`kanban-cards-${stage}`);
        if (!container || counts[stage] > 120) return;

        const score = parseInt(lead.lead_score, 10) || 50;
        const scoreClass = score >= 75 ? "tl-score-high" : (score < 45 ? "tl-score-low" : "tl-score-med");
        const pInfo = formatPhone(lead.phone);
        const distStr = lead.distanceKm !== null && lead.distanceKm !== undefined
            ? (lead.distanceKm < 1 ? `${Math.round(lead.distanceKm * 1000)} m` : `${lead.distanceKm} km`)
            : "-";

        const rawKey = getLeadKey(lead);
        const safeKey = escapeHtml(rawKey);

        const card = document.createElement("div");
        card.className = "tl-kanban-card-item";
        card.draggable = true;
        card.setAttribute("data-lead-key", rawKey);

        card.innerHTML = `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
                <strong class="tl-kanban-lead-title btn-kanban-open-drawer" data-lead-key="${safeKey}" style="font-size:13px;line-height:1.3;cursor:pointer;">${escapeHtml(lead.name || "Empresa")}</strong>
                <span class="tl-badge-score ${scoreClass}" style="font-size:10px;padding:1px 5px;">${score}</span>
            </div>
            <div class="tl-kanban-lead-meta" style="font-size:11px;display:flex;justify-content:space-between;">
                <span>★ ${escapeHtml(lead.averageRating || "-")} · ${escapeHtml(lead.category || "General")}</span>
                <span>📍 ${escapeHtml(distStr)}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;padding-top:6px;border-top:1px solid var(--border-color);">
                <div class="tl-kanban-lead-phone" style="font-size:11px;">
                    ${lead.phone ? `📞 ${escapeHtml(lead.phone)}` : '<span style="color:var(--text-muted);">Sin teléfono</span>'}
                </div>
                <div style="display:flex;gap:4px;">
                    ${pInfo.whatsappUrl ? `<a href="${pInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer" class="tl-btn tl-btn-outline" style="height:22px;font-size:10px;padding:0 5px;" title="WhatsApp">💬</a>` : ""}
                    <button type="button" class="tl-btn tl-btn-primary btn-kanban-open-drawer" data-lead-key="${safeKey}" style="height:22px;font-size:10px;padding:0 6px;">360° ↗</button>
                </div>
            </div>
        `;

        card.addEventListener("dragstart", (e) => {
            card.classList.add("dragging");
            e.dataTransfer.setData("text/plain", rawKey);
            e.dataTransfer.effectAllowed = "move";
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
        });

        container.appendChild(card);
    });

    stages.forEach(st => {
        const countEl = document.getElementById(`kanban-count-${st}`);
        if (countEl) countEl.textContent = counts[st];
    });
}

function initKanbanDropzones() {
    const board = document.getElementById("atlasiq-kanban-board");
    if (board) {
        board.addEventListener("click", (e) => {
            const trigger = e.target.closest(".btn-kanban-open-drawer");
            if (trigger) {
                const key = trigger.getAttribute("data-lead-key");
                const found = findLeadByKey(key);
                if (found) openLeadDrawer(found);
            }
        });
    }

    const stages = ["nuevo", "contactado", "negociacion", "ganado", "descartado"];
    stages.forEach(st => {
        const container = document.getElementById(`kanban-cards-${st}`);
        if (!container) return;

        container.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            container.classList.add("drag-over");
        });

        container.addEventListener("dragleave", () => {
            container.classList.remove("drag-over");
        });

        container.addEventListener("drop", async (e) => {
            e.preventDefault();
            container.classList.remove("drag-over");
            const leadKey = e.dataTransfer.getData("text/plain");
            if (!leadKey) return;

            const targetLead = findLeadByKey(leadKey);
            if (targetLead && targetLead.pipeline_stage !== st) {
                targetLead.pipeline_stage = st;
                await persistAllLeads();
                renderKanbanBoard(currentFilteredLeads);
                if (activeViewId === "analytics") renderAnalyticsBiCharts(currentFilteredLeads);
                playAudioNotification("success");
            }
        });
    });

    const btnReset = document.getElementById("btn-kanban-reset-all");
    if (btnReset) {
        btnReset.addEventListener("click", async () => {
            if (confirm("¿Deseas reiniciar todos los prospectos a la etapa 'Nuevo Prospecto'?")) {
                allLeads.forEach(l => { l.pipeline_stage = "nuevo"; });
                await persistAllLeads();
                renderKanbanBoard(currentFilteredLeads);
            }
        });
    }
}

/**
 * ============================================================================
 * 7. VIEW 4: EXECUTIVE BI ANALYTICS ENGINE (LOCAL APACHE ECHARTS)
 * ============================================================================
 */
function ensureBiChartInstance(key, domId) {
    if (typeof echarts === "undefined") return null;
    const el = document.getElementById(domId);
    if (!el) return null;
    if (!biCharts[key]) {
        biCharts[key] = echarts.init(el);
    } else {
        biCharts[key].resize();
    }
    return biCharts[key];
}

function renderAnalyticsBiCharts(dataset) {
    if (typeof echarts === "undefined") return;
    const leads = Array.isArray(dataset) ? dataset : currentFilteredLeads;
    const isDark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
    const textColor = isDark ? "#cbd5e1" : "#334155";
    const splitLineColor = isDark ? "rgba(148,163,184,0.14)" : "rgba(148,163,184,0.28)";
    const tooltipBg = isDark ? "#0f172a" : "#ffffff";
    const tooltipBorder = isDark ? "#334155" : "#cbd5e1";

    // 1. Opportunity Signals Bar Chart
    const sigNoWeb = leads.filter(l => !l.website || !String(l.website).trim()).length;
    const sigNoPixel = leads.filter(l => l.website && !l.ad_spend_active).length;
    const sigUnclaimed = leads.filter(l => Boolean(l.unclaimed)).length;
    const sigAdsActive = leads.filter(l => Boolean(l.ad_spend_active)).length;
    const sigPainPoints = leads.filter(l => Boolean(l.review_pain_points)).length;
    const sigOsintExec = leads.filter(l => Boolean(l.decision_maker || l.tax_id || l.legal_name)).length;

    const cSignals = ensureBiChartInstance("signals", "chart-signals");
    if (cSignals) {
        cSignals.setOption({
            backgroundColor: "transparent",
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
            grid: { left: "3%", right: "6%", bottom: "4%", top: "6%", containLabel: true },
            xAxis: { type: "value", axisLabel: { color: textColor }, splitLine: { lineStyle: { color: splitLineColor } } },
            yAxis: {
                type: "category",
                axisLabel: { color: textColor, fontWeight: 600 },
                data: ["OSINT Fiscal/Decisor", "Dolor en Reseñas", "Pagan Ads Activos", "Ficha No Reclamada", "Web sin Píxeles", "Sin Sitio Web"]
            },
            series: [{
                name: "Prospectos",
                type: "bar",
                barWidth: "56%",
                data: [
                    { value: sigOsintExec, itemStyle: { color: "#06b6d4" } },
                    { value: sigPainPoints, itemStyle: { color: "#f97316" } },
                    { value: sigAdsActive, itemStyle: { color: "#10b981" } },
                    { value: sigUnclaimed, itemStyle: { color: "#f59e0b" } },
                    { value: sigNoPixel, itemStyle: { color: "#6366f1" } },
                    { value: sigNoWeb, itemStyle: { color: "#ef4444" } }
                ],
                label: { show: true, position: "right", color: textColor, fontWeight: 700 }
            }]
        });
    }

    // 2. Tech Stack & Ad Pixel Penetration Doughnut
    const techCounts = {
        "WordPress / Woo": 0,
        "Shopify": 0,
        "Meta / Google Ads Pixel": 0,
        "GTM / GA4": 0,
        "Wix / Squarespace / Webflow": 0,
        "Web Custom / Sin CMS": 0,
        "Sin Sitio Web": 0
    };
    leads.forEach(l => {
        if (!l.website || !String(l.website).trim()) {
            techCounts["Sin Sitio Web"]++;
            return;
        }
        const st = String(l.tech_stack || "");
        let matched = false;
        if (st.includes("WordPress") || st.includes("WooCommerce")) { techCounts["WordPress / Woo"]++; matched = true; }
        if (st.includes("Shopify")) { techCounts["Shopify"]++; matched = true; }
        if (l.ad_spend_active || st.includes("Pixel")) { techCounts["Meta / Google Ads Pixel"]++; matched = true; }
        if (st.includes("GTM") || st.includes("GA4")) { techCounts["GTM / GA4"]++; matched = true; }
        if (st.includes("Wix") || st.includes("Squarespace") || st.includes("Webflow")) { techCounts["Wix / Squarespace / Webflow"]++; matched = true; }
        if (!matched) techCounts["Web Custom / Sin CMS"]++;
    });

    const cTech = ensureBiChartInstance("tech", "chart-tech");
    if (cTech) {
        cTech.setOption({
            backgroundColor: "transparent",
            tooltip: { trigger: "item", backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
            legend: { bottom: 0, textStyle: { color: textColor, fontSize: 11 } },
            series: [{
                name: "Huella Tecnológica",
                type: "pie",
                radius: ["40%", "68%"],
                center: ["50%", "44%"],
                itemStyle: { borderRadius: 6, borderColor: isDark ? "#111827" : "#ffffff", borderWidth: 2 },
                label: { color: textColor, fontSize: 11 },
                data: Object.entries(techCounts)
                    .filter(([, v]) => v > 0)
                    .map(([name, value]) => ({ name, value }))
            }]
        });
    }

    // 3. Top Niches Volume vs Digital Gap
    const nicheBuckets = new Map();
    leads.forEach(l => {
        const cat = (l.category || "General").trim();
        if (!nicheBuckets.has(cat)) nicheBuckets.set(cat, { total: 0, noWeb: 0 });
        const b = nicheBuckets.get(cat);
        b.total++;
        if (!l.website || !String(l.website).trim()) b.noWeb++;
    });
    const topNiches = Array.from(nicheBuckets.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 7);

    const cNiches = ensureBiChartInstance("niches", "chart-niches");
    if (cNiches) {
        cNiches.setOption({
            backgroundColor: "transparent",
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
            legend: { top: 0, textStyle: { color: textColor, fontSize: 11 } },
            grid: { left: "3%", right: "4%", bottom: "12%", top: "14%", containLabel: true },
            xAxis: {
                type: "category",
                axisLabel: { color: textColor, rotate: 18, fontSize: 10.5 },
                data: topNiches.map(([n]) => n.length > 18 ? n.substring(0, 18) + "…" : n)
            },
            yAxis: { type: "value", axisLabel: { color: textColor }, splitLine: { lineStyle: { color: splitLineColor } } },
            series: [
                {
                    name: "Total Rubro",
                    type: "bar",
                    itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] },
                    data: topNiches.map(([, v]) => v.total)
                },
                {
                    name: "Sin Sitio Web (Brecha)",
                    type: "bar",
                    itemStyle: { color: "#ef4444", borderRadius: [4, 4, 0, 0] },
                    data: topNiches.map(([, v]) => v.noWeb)
                }
            ]
        });
    }

    // 4. Commercial Pipeline Funnel
    const stageCounts = { nuevo: 0, contactado: 0, negociacion: 0, ganado: 0, descartado: 0 };
    leads.forEach(l => {
        const st = stageCounts[l.pipeline_stage] !== undefined ? l.pipeline_stage : "nuevo";
        stageCounts[st]++;
    });

    const cFunnel = ensureBiChartInstance("funnel", "chart-funnel");
    if (cFunnel) {
        cFunnel.setOption({
            backgroundColor: "transparent",
            tooltip: { trigger: "item", backgroundColor: tooltipBg, borderColor: tooltipBorder, textStyle: { color: textColor } },
            series: [{
                name: "Pipeline CRM",
                type: "funnel",
                left: "10%",
                top: 16,
                bottom: 16,
                width: "80%",
                sort: "none",
                gap: 4,
                label: { show: true, position: "inside", color: "#ffffff", fontWeight: 700, formatter: "{b}: {c}" },
                data: [
                    { value: stageCounts.nuevo, name: "Nuevos", itemStyle: { color: "#3b82f6" } },
                    { value: stageCounts.contactado, name: "Contactados", itemStyle: { color: "#f59e0b" } },
                    { value: stageCounts.negociacion, name: "Negociación", itemStyle: { color: "#8b5cf6" } },
                    { value: stageCounts.ganado, name: "Ganados", itemStyle: { color: "#10b981" } },
                    { value: stageCounts.descartado, name: "Descartados", itemStyle: { color: "#64748b" } }
                ]
            }]
        });
    }
}

function resizeBiCharts() {
    Object.values(biCharts).forEach(ch => {
        if (ch && typeof ch.resize === "function") ch.resize();
    });
}

/**
 * ============================================================================
 * 8. 360° DEEP INSPECTOR DRAWER, PAGESPEED V5, GEMINI 2.5 & CLOUD AUDIT
 * ============================================================================
 */
function openLeadDrawer(lead) {
    if (!lead) return;
    normalizeLeadRecord(lead);
    activeLeadForDrawer = lead;

    const overlay = document.getElementById("lead-drawer-overlay");
    document.getElementById("drawer-lead-name").textContent = lead.name || "Sin nombre";
    document.getElementById("drawer-lead-rating").textContent = lead.averageRating
        ? `★ ${lead.averageRating} (${lead.reviewCount || 0} reseñas)`
        : "Sin calificación";

    const claimBadge = document.getElementById("drawer-claim-badge");
    if (claimBadge) {
        claimBadge.innerHTML = lead.unclaimed
            ? `<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:800;">🏴 Ficha No Reclamada</span>`
            : `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:700;">✓ Ficha Verificada</span>`;
    }

    const priceBadge = document.getElementById("drawer-price-badge");
    if (priceBadge) {
        priceBadge.innerHTML = lead.priceLevel
            ? `<span style="background:rgba(59,130,246,0.14);color:#3b82f6;padding:2px 7px;border-radius:999px;font-size:10.5px;font-weight:800;">${escapeHtml(lead.priceLevel)}</span>`
            : "";
    }

    const score = parseInt(lead.lead_score, 10) || 50;
    const scoreEl = document.getElementById("drawer-ai-score");
    scoreEl.textContent = score;
    scoreEl.className = "tl-badge-score " + (score >= 75 ? "tl-score-high" : (score < 45 ? "tl-score-low" : "tl-score-med"));
    document.getElementById("drawer-ai-priority").textContent = lead.priority || "Media";

    const psVal = document.getElementById("drawer-pagespeed-val");
    if (psVal) {
        if (!lead.website) {
            psVal.innerHTML = `<span style="color:#ef4444;font-weight:700;">No aplica (Sin sitio web)</span>`;
        } else if (typeof lead.pagespeed_mobile === "number") {
            const c = lead.pagespeed_mobile >= 75 ? "#10b981" : (lead.pagespeed_mobile >= 50 ? "#f59e0b" : "#ef4444");
            psVal.innerHTML = `<strong style="color:${c};">${lead.pagespeed_mobile}/100 Móvil</strong> <small style="color:var(--text-muted);">(SEO: ${lead.pagespeed_seo || "-"} · LCP: ${escapeHtml(lead.pagespeed_lcp || "N/A")})</small>`;
        } else {
            psVal.textContent = "Sin auditar (Clic en ⚡ Auditar arriba)";
        }
    }

    const oppsContainer = document.getElementById("drawer-ai-opps");
    oppsContainer.innerHTML = "";
    const oppList = (lead.opportunities || "").split(",").map(o => o.trim()).filter(Boolean);
    if (oppList.length > 0) {
        oppList.forEach(opp => {
            const span = document.createElement("span");
            span.className = "tl-opp-tag";
            span.textContent = opp;
            oppsContainer.appendChild(span);
        });
    } else {
        oppsContainer.innerHTML = '<span style="color:#94a3b8;font-size:11px;">Presencia digital optimizada</span>';
    }

    // Corporate & Fiscal OSINT fields
    document.getElementById("drawer-legal-name").textContent = lead.legal_name || "No indexada en Schema.org";
    document.getElementById("drawer-tax-id").textContent = lead.tax_id || "No expuesto públicamente";
    document.getElementById("drawer-decision-maker").textContent = lead.decision_maker || "No identificado en DOM";

    const fullCats = [lead.category, lead.secondaryCategories].filter(Boolean).join(" · ");
    document.getElementById("drawer-category").textContent = fullCats || "General";

    const peerDistText = typeof lead.nearestPeerDistanceKm === "number"
        ? (lead.nearestPeerDistanceKm < 1 ? `${Math.round(lead.nearestPeerDistanceKm * 1000)} m` : `${lead.nearestPeerDistanceKm.toFixed(1)} km`)
        : "N/A";
    document.getElementById("drawer-nearest-peer").textContent = lead.nearestPeerName
        ? `${peerDistText} (${lead.nearestPeerName})`
        : peerDistText;

    const pInfo = formatPhone(lead.phone);
    document.getElementById("drawer-phone").textContent = pInfo.original || "No detectado";
    document.getElementById("drawer-email").textContent = lead.email || "No detectado";
    document.getElementById("drawer-address").textContent = lead.address || "No especificada";

    const bookingEl = document.getElementById("drawer-booking");
    if (bookingEl) {
        const bUrl = safeExternalUrl(lead.booking_url);
        if (lead.booking_platform && bUrl) {
            bookingEl.innerHTML = `<a href="${bUrl}" target="_blank" rel="noopener noreferrer" style="color:#10b981;font-weight:700;">✓ ${escapeHtml(lead.booking_platform)} ↗</a>`;
        } else if (lead.booking_platform) {
            bookingEl.textContent = lead.booking_platform;
        } else {
            bookingEl.textContent = "Sin motor de citas/delivery";
        }
    }

    const hoursEl = document.getElementById("drawer-hours");
    if (hoursEl) {
        const hParts = [lead.openStatus, lead.openingHours].filter(Boolean).join(" · ");
        hoursEl.textContent = hParts || "Horario no especificado";
    }

    // Cyber-Deliverability Badges (MX + SPF + DMARC)
    const mxSpan = document.getElementById("drawer-email-mx");
    if (mxSpan) {
        mxSpan.innerHTML = "";
        if (lead.email) {
            if (lead.mx_status === "valid") {
                const dmarcHtml = lead.dmarc_status === "present"
                    ? ` <span class="tl-mx-badge valid" title="SPF: ${escapeHtml(lead.spf_status)} · DMARC Activo">🛡️ DMARC</span>`
                    : (lead.dmarc_status === "missing" ? ` <span class="tl-mx-badge invalid" title="Sin política DMARC anti-spoofing">⚠ Sin DMARC</span>` : "");
                mxSpan.innerHTML = `<span class="tl-mx-badge valid">${escapeHtml(lead.mx_provider || "MX Activo")}</span>${dmarcHtml}`;
            } else if (lead.mx_status === "invalid") {
                mxSpan.innerHTML = `<span class="tl-mx-badge invalid">${escapeHtml(lead.mx_provider || "Sin MX")}</span>`;
            } else {
                const checkBtn = document.createElement("button");
                checkBtn.type = "button";
                checkBtn.style.cssText = "font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid #cbd5e1;background:transparent;color:inherit;cursor:pointer;";
                checkBtn.textContent = "🛡️ Auditar MX/DMARC";
                checkBtn.addEventListener("click", async () => {
                    checkBtn.textContent = "⏳...";
                    checkBtn.disabled = true;
                    const res = await verifyDomainMx(lead.email);
                    lead.mx_status = res.valid ? "valid" : "invalid";
                    lead.mx_provider = res.provider;
                    lead.spf_status = res.spf;
                    lead.dmarc_status = res.dmarc;
                    normalizeLeadRecord(lead);
                    await persistAllLeads();
                    if (table) table.replaceData(currentFilteredLeads);
                    openLeadDrawer(lead);
                });
                mxSpan.appendChild(checkBtn);
            }
        }
    }

    // Website & Tech Stack
    const webLink = document.getElementById("drawer-website");
    const safeWeb = safeExternalUrl(lead.website);
    if (safeWeb) {
        webLink.href = safeWeb;
        webLink.textContent = extractDomain(lead.website);
        webLink.style.color = "#3b82f6";
    } else {
        webLink.removeAttribute("href");
        webLink.textContent = "Sin Sitio Web (Venta Directa)";
        webLink.style.color = "#ef4444";
    }
    document.getElementById("drawer-tech").textContent = lead.tech_stack || "Sin stack ni píxeles detectados";

    // Social Links
    const socialContainer = document.getElementById("drawer-socials");
    socialContainer.innerHTML = "";
    const socials = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "twitter"];
    let hasAnySocial = false;
    socials.forEach(s => {
        const sUrl = safeExternalUrl(lead[s]);
        if (sUrl) {
            hasAnySocial = true;
            const a = document.createElement("a");
            a.href = sUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.className = "tl-social-link";
            a.textContent = s.toUpperCase();
            socialContainer.appendChild(a);
        }
    });
    if (!hasAnySocial) {
        socialContainer.innerHTML = '<span style="color:#94a3b8;font-size:11px;">Sin redes sociales vinculadas</span>';
    }

    if (currentPitchChannel !== "gemini") {
        updatePitchPreview();
    } else {
        document.getElementById("drawer-pitch-text").textContent =
            "Haz clic en '✨ Ejecutar Estrategia Profunda con Gemini 2.5 / Nano IA' para generar un análisis B2B a medida.";
    }

    if (overlay) overlay.classList.add("open");
}

function closeLeadDrawer() {
    const overlay = document.getElementById("lead-drawer-overlay");
    if (overlay) overlay.classList.remove("open");
    activeLeadForDrawer = null;
}

function updatePitchPreview() {
    if (!activeLeadForDrawer) return;
    const channel = currentPitchChannel === "gemini" ? "whatsapp" : currentPitchChannel;
    const pitch = generateOutreachPitch(activeLeadForDrawer, channel);
    document.getElementById("drawer-pitch-text").textContent = pitch;

    const pInfo = formatPhone(activeLeadForDrawer.phone);
    const waBtn = document.getElementById("btn-send-wa");
    if (pInfo.whatsappUrl) {
        waBtn.href = `${pInfo.whatsappUrl}?text=${encodeURIComponent(pitch)}`;
        waBtn.style.display = "inline-flex";
    } else {
        waBtn.style.display = "none";
    }
}

function resetAllFilters() {
    const searchInput = document.getElementById("filter-search");
    if (searchInput) searchInput.value = "";
    document.querySelectorAll(".tl-chip").forEach(c => c.classList.remove("active"));
    const allChip = document.querySelector('.tl-chip[data-filter="all"]');
    if (allChip) allChip.classList.add("active");
    currentFilter = "all";

    const nicheSelect = document.getElementById("filter-niche");
    if (nicheSelect) nicheSelect.value = "all";

    const strictCheck = document.getElementById("check-strict-niche");
    if (strictCheck) strictCheck.checked = false;

    const distSelect = document.getElementById("filter-distance");
    if (distSelect) distSelect.value = "all";

    applyFilters();
}

/**
 * ============================================================================
 * 9. SPEED OUTREACH QUEUE & BULK CLOUDFLARE DoH DNS/DMARC AUDITOR
 * ============================================================================
 */
let speedQueue = [];
let speedIndex = 0;

function startSpeedOutreach() {
    const candidates = (currentFilteredLeads && currentFilteredLeads.length > 0) ? currentFilteredLeads : allLeads;
    speedQueue = candidates.filter(l => l && l.phone && formatPhone(l.phone).whatsappUrl);

    if (speedQueue.length === 0) {
        alert("No hay prospectos con línea de WhatsApp válida en la vista actual.");
        return;
    }

    speedIndex = 0;
    document.getElementById("speed-outreach-modal")?.classList.add("open");
    document.getElementById("tl-modal-backdrop")?.classList.add("open");
    renderSpeedLead();
}

function renderSpeedLead() {
    if (speedIndex >= speedQueue.length) {
        alert("🎉 ¡Sesión completada! Todos los prospectos de la cola fueron procesados.");
        closeSpeedOutreach();
        applyFilters();
        return;
    }

    const lead = speedQueue[speedIndex];
    const total = speedQueue.length;

    document.getElementById("speed-queue-counter").textContent = `${speedIndex + 1} / ${total}`;
    document.getElementById("speed-progress-fill").style.width = `${Math.round((speedIndex / total) * 100)}%`;
    document.getElementById("speed-lead-name").textContent = lead.name || "Empresa";

    const distStr = lead.distanceKm ? ` · 📍 ${lead.distanceKm < 1 ? Math.round(lead.distanceKm * 1000) + "m" : lead.distanceKm + "km"}` : "";
    document.getElementById("speed-lead-meta").textContent = `${lead.category || "General"}${distStr} · ${lead.address || "Zona activa"}`;

    const score = parseInt(lead.lead_score, 10) || 50;
    const scoreEl = document.getElementById("speed-lead-score");
    scoreEl.textContent = score;
    scoreEl.className = `tl-badge-score ${score >= 75 ? "tl-score-high" : score < 45 ? "tl-score-low" : "tl-score-med"}`;

    document.getElementById("speed-lead-phone").textContent = lead.phone || "-";
    document.getElementById("speed-pitch-box").textContent = generateOutreachPitch(lead, "whatsapp");
}

async function sendSpeedAndAdvance() {
    if (speedIndex >= speedQueue.length) return;
    const lead = speedQueue[speedIndex];
    const pitch = document.getElementById("speed-pitch-box")?.textContent || generateOutreachPitch(lead, "whatsapp");

    const pInfo = formatPhone(lead.phone);
    if (pInfo.whatsappUrl) {
        window.open(`${pInfo.whatsappUrl}?text=${encodeURIComponent(pitch)}`, "_blank", "noopener");
    }

    lead.pipeline_stage = "contactado";
    await persistAllLeads();
    renderKanbanBoard(currentFilteredLeads);

    playAudioNotification("success");
    speedIndex++;
    renderSpeedLead();
}

function skipSpeedLead() {
    speedIndex++;
    renderSpeedLead();
}

function closeSpeedOutreach() {
    document.getElementById("speed-outreach-modal")?.classList.remove("open");
    document.getElementById("tl-modal-backdrop")?.classList.remove("open");
}

async function verifyAllLeadsMx() {
    const targets = (currentFilteredLeads && currentFilteredLeads.length > 0) ? currentFilteredLeads : allLeads;
    const emailLeads = targets.filter(l => l.email && String(l.email).includes("@"));

    if (emailLeads.length === 0) {
        alert("No hay prospectos con correo electrónico en la selección actual.");
        return;
    }

    const btn = document.getElementById("btn-verify-all-emails");
    const originalText = btn ? btn.textContent : "🛡️ Auditar DNS/DMARC";
    if (btn) {
        btn.disabled = true;
        btn.textContent = `⏳ Auditando 0/${emailLeads.length}...`;
    }

    // Concurrent batches of 5 domains (Cloudflare DoH caches domain hits automatically)
    let completed = 0;
    const batchSize = 5;
    for (let i = 0; i < emailLeads.length; i += batchSize) {
        const slice = emailLeads.slice(i, i + batchSize);
        await Promise.all(slice.map(async (lead) => {
            const res = await verifyDomainMx(lead.email);
            lead.mx_status = res.valid ? "valid" : "invalid";
            lead.mx_provider = res.provider;
            lead.spf_status = res.spf;
            lead.dmarc_status = res.dmarc;
            normalizeLeadRecord(lead);
            completed++;
            if (btn) btn.textContent = `⏳ Auditando ${completed}/${emailLeads.length}...`;
        }));
    }

    await persistAllLeads();
    if (table) table.replaceData(currentFilteredLeads);
    if (activeViewId === "analytics") renderAnalyticsBiCharts(currentFilteredLeads);

    if (btn) {
        btn.textContent = "✅ DNS/DMARC Auditados";
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2500);
    }
    playAudioNotification("success");
}

/**
 * ============================================================================
 * 10. THEME MANAGER & DOM INITIALIZATION
 * ============================================================================
 */
function initThemeManager() {
    const savedTheme = localStorage.getItem("atlasiq-theme") || "dark";
    setTheme(savedTheme);

    document.getElementById("btn-toggle-theme")?.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
        setTheme(currentTheme === "dark" ? "light" : "dark");
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("atlasiq-theme", theme);

    const toggleBtn = document.getElementById("btn-toggle-theme");
    if (toggleBtn) {
        toggleBtn.textContent = theme === "dark" ? "☀️ Modo Claro" : "🌙 Modo Oscuro";
    }

    if (leafletMap) setMapTileLayer(theme);
    if (activeViewId === "analytics") renderAnalyticsBiCharts(currentFilteredLeads);
}

document.addEventListener("DOMContentLoaded", () => {
    initThemeManager();
    initTable();
    initLocationAndDistances();
    loadDashboardData();
    if (typeof initLicenseUi === "function") initLicenseUi();

    // Debounced Reactive Sync with ContentScript / SidePanel
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.leads && !_isInternalSave) {
                clearTimeout(_syncDebounceTimer);
                _syncDebounceTimer = setTimeout(() => loadDashboardData(), 450);
            }
        });
    }
    window.addEventListener("storage", (e) => {
        if (e.key === "leads" && !_isInternalSave) loadDashboardData();
    });
    window.addEventListener("resize", resizeBiCharts);

    // Search & Granular Filters
    document.getElementById("filter-search")?.addEventListener("input", applyFilters);
    document.getElementById("filter-niche")?.addEventListener("change", applyFilters);
    document.getElementById("check-strict-niche")?.addEventListener("change", applyFilters);
    document.getElementById("filter-distance")?.addEventListener("change", applyFilters);
    document.getElementById("btn-reset-filters")?.addEventListener("click", resetAllFilters);
    document.getElementById("banner-btn-reset")?.addEventListener("click", resetAllFilters);

    // Filter Chips
    document.querySelectorAll(".tl-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            document.querySelectorAll(".tl-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentFilter = chip.getAttribute("data-filter") || "all";
            applyFilters();
        });
    });

    // Niche Breakdown Row Filter Delegation (Zero inline onclick)
    document.getElementById("sat-niche-tbody")?.addEventListener("click", (e) => {
        const btn = e.target.closest(".btn-filter-niche-row");
        if (btn) {
            const niche = btn.getAttribute("data-niche");
            if (niche) selectAndFilterNiche(niche);
        }
    });

    // 4-View Switcher (Table, Geospatial Map, Kanban CRM, Executive BI Analytics)
    const viewMapConfig = {
        table: { tab: "tab-view-table", sec: "view-section-table" },
        map: { tab: "tab-view-map", sec: "view-section-map" },
        kanban: { tab: "tab-view-kanban", sec: "view-section-kanban" },
        analytics: { tab: "tab-view-analytics", sec: "view-section-analytics" }
    };

    function switchMainView(viewKey) {
        activeViewId = viewKey;
        Object.entries(viewMapConfig).forEach(([k, cfg]) => {
            const t = document.getElementById(cfg.tab);
            const s = document.getElementById(cfg.sec);
            if (t) t.classList.toggle("active", k === viewKey);
            if (s) s.style.display = k === viewKey ? "block" : "none";
        });

        if (viewKey === "map") {
            if (!leafletMap) initLeafletMap();
            setTimeout(() => {
                if (leafletMap) {
                    leafletMap.invalidateSize();
                    updateMapData(currentFilteredLeads);
                }
            }, 90);
        } else if (viewKey === "kanban") {
            renderKanbanBoard(currentFilteredLeads);
        } else if (viewKey === "analytics") {
            setTimeout(() => renderAnalyticsBiCharts(currentFilteredLeads), 60);
        }
    }

    document.getElementById("tab-view-table")?.addEventListener("click", () => switchMainView("table"));
    document.getElementById("tab-view-map")?.addEventListener("click", () => switchMainView("map"));
    document.getElementById("tab-view-kanban")?.addEventListener("click", () => switchMainView("kanban"));
    document.getElementById("tab-view-analytics")?.addEventListener("click", () => switchMainView("analytics"));

    initKanbanDropzones();

    document.getElementById("check-map-heatmap")?.addEventListener("change", () => updateMapData(currentFilteredLeads));
    document.getElementById("check-map-markers")?.addEventListener("change", () => updateMapData(currentFilteredLeads));
    document.getElementById("btn-map-recenter")?.addEventListener("click", () => updateMapData(currentFilteredLeads));

    // Saturation Panel Toggle
    const satPanel = document.getElementById("market-saturation-panel");
    document.getElementById("btn-toggle-saturation")?.addEventListener("click", () => {
        if (!satPanel) return;
        const isHidden = window.getComputedStyle(satPanel).display === "none";
        satPanel.style.display = isHidden ? "block" : "none";
        if (isHidden) updateMarketSaturationView(document.getElementById("filter-niche")?.value || "all");
    });
    document.getElementById("btn-close-saturation")?.addEventListener("click", () => {
        if (satPanel) satPanel.style.display = "none";
    });

    // Explore in Google Maps
    document.getElementById("btn-open-maps-search")?.addEventListener("click", () => {
        const center = clusterCentroid || userLocation;
        const currentNiche = document.getElementById("filter-niche")?.value;
        const queryTerm = (currentNiche && currentNiche !== "all") ? currentNiche : "negocios y empresas";
        let mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(queryTerm)}`;
        if (center) mapsUrl += `/@${center.lat},${center.lon},14z`;
        window.open(mapsUrl, "_blank", "noopener");
    });

    // Drawer Controls
    document.getElementById("drawer-close-btn")?.addEventListener("click", closeLeadDrawer);
    document.getElementById("lead-drawer-overlay")?.addEventListener("click", (e) => {
        if (e.target.id === "lead-drawer-overlay") closeLeadDrawer();
    });

    // Live Google PageSpeed Insights v5 Mobile Audit inside Drawer
    document.getElementById("btn-audit-pagespeed")?.addEventListener("click", async () => {
        if (!activeLeadForDrawer) return;
        if (!activeLeadForDrawer.website) {
            alert("Este prospecto no tiene sitio web registrado. ¡Oportunidad directa para venderle desarrollo web!");
            return;
        }
        const btn = document.getElementById("btn-audit-pagespeed");
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = "⏳ Midiendo Core Web Vitals...";
        try {
            const report = await auditWebsitePageSpeed(activeLeadForDrawer.website);
            activeLeadForDrawer.pagespeed_mobile = report.performance;
            activeLeadForDrawer.pagespeed_seo = report.seo;
            activeLeadForDrawer.pagespeed_lcp = report.lcp;
            normalizeLeadRecord(activeLeadForDrawer);
            await persistAllLeads();
            if (table) table.replaceData(currentFilteredLeads);
            openLeadDrawer(activeLeadForDrawer);
            playAudioNotification("success");
        } catch (err) {
            alert("No se pudo completar PageSpeed Insights: " + err.message);
        } finally {
            btn.textContent = orig;
            btn.disabled = false;
        }
    });

    // 5-Channel Omnichannel Sequencer & Gemini 2.5 / Nano Hybrid AI
    document.querySelectorAll(".tl-pitch-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tl-pitch-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentPitchChannel = tab.getAttribute("data-channel") || "whatsapp";

            const geminiControls = document.getElementById("gemini-controls");
            const standardActions = document.getElementById("standard-pitch-actions");
            if (currentPitchChannel === "gemini") {
                if (geminiControls) geminiControls.style.display = "block";
                if (standardActions) standardActions.style.display = "flex";
                document.getElementById("drawer-pitch-text").textContent =
                    "Haz clic en '✨ Ejecutar Estrategia Profunda con Gemini 2.5 / Nano IA' para sintetizar vulnerabilidades, pérdida mensual estimada y secuencia de cierre.";
            } else {
                if (geminiControls) geminiControls.style.display = "none";
                if (standardActions) standardActions.style.display = "flex";
                updatePitchPreview();
            }
        });
    });

    document.getElementById("btn-ai-generate-pitch")?.addEventListener("click", () => {
        if (!activeLeadForDrawer) return;
        storageAdapter.get(["tl_gemini_key"], async (data) => {
            const apiKey = data.tl_gemini_key || "";
            const btn = document.getElementById("btn-ai-generate-pitch");
            const originalText = btn.textContent;
            btn.textContent = "⏳ Analizando huella OSINT con Gemini 2.5...";
            btn.disabled = true;

            try {
                const aiResponse = await callGeminiAnalysis(apiKey, activeLeadForDrawer, "whatsapp");
                document.getElementById("drawer-pitch-text").textContent = aiResponse;

                const pInfo = formatPhone(activeLeadForDrawer.phone);
                const waBtn = document.getElementById("btn-send-wa");
                if (pInfo.whatsappUrl && waBtn) {
                    waBtn.href = `${pInfo.whatsappUrl}?text=${encodeURIComponent(aiResponse.substring(0, 1500))}`;
                    waBtn.style.display = "inline-flex";
                }
                playAudioNotification("success");
            } catch (err) {
                alert(err.message);
                document.getElementById("settings-modal")?.classList.add("open");
                document.getElementById("tl-modal-backdrop")?.classList.add("open");
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });

    document.getElementById("btn-copy-pitch")?.addEventListener("click", () => {
        const text = document.getElementById("drawer-pitch-text")?.textContent || "";
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById("btn-copy-pitch");
            if (btn) {
                btn.textContent = "✅ ¡Guión Copiado!";
                setTimeout(() => { btn.textContent = "📋 Copiar Guión"; }, 2000);
            }
        });
    });

    // White-Label PDF Audit Download
    document.getElementById("btn-download-pdf-audit")?.addEventListener("click", () => {
        if (activeLeadForDrawer) {
            generateLeadPdfAudit(activeLeadForDrawer, currentBranding);
        }
    });

    // Live Tracked Cloud Audit Microsite Publisher
    document.getElementById("btn-publish-cloud-audit")?.addEventListener("click", () => {
        if (!activeLeadForDrawer) return;
        storageAdapter.get(["tl_edge_worker_url"], async (cfg) => {
            const edgeUrl = cfg.tl_edge_worker_url || "";
            if (!edgeUrl) {
                alert("Configura primero la URL de tu Cloudflare Edge Worker en ⚙️ Ajustes para publicar micrositios con tracking de lectura.");
                document.getElementById("settings-modal")?.classList.add("open");
                document.getElementById("tl-modal-backdrop")?.classList.add("open");
                return;
            }
            const btn = document.getElementById("btn-publish-cloud-audit");
            const orig = btn.textContent;
            btn.disabled = true;
            btn.textContent = "⏳ Publicando...";
            try {
                const pub = await publishLiveCloudAudit(edgeUrl, activeLeadForDrawer, currentBranding);
                activeLeadForDrawer.cloud_audit_url = pub.auditUrl;
                await persistAllLeads();
                await navigator.clipboard.writeText(pub.auditUrl).catch(() => {});
                playAudioNotification("success");
                alert(`✅ Micrositio B2B publicado y copiado al portapapeles:\n\n${pub.auditUrl}\n\nEnvíalo por WhatsApp o Email: registrará cada apertura en tiempo real.`);
            } catch (err) {
                alert("Error al publicar auditoría: " + err.message);
            } finally {
                btn.textContent = orig;
                btn.disabled = false;
            }
        });
    });

    // Exporters & JSON Importer
    document.getElementById("btn-export-csv")?.addEventListener("click", () => {
        exportToCsv("atlasiq_leads_v4.csv", currentFilteredLeads.length ? currentFilteredLeads : allLeads);
    });
    document.getElementById("btn-export-xlsx")?.addEventListener("click", () => {
        if (table) table.download("xlsx", "atlasiq_leads_v4.xlsx", { sheetName: "AtlasIQ_v4" });
    });
    document.getElementById("btn-export-json")?.addEventListener("click", () => {
        exportToJson("atlasiq_leads.json", currentFilteredLeads.length ? currentFilteredLeads : allLeads);
    });
    document.getElementById("btn-export-vcard")?.addEventListener("click", () => {
        exportToVCard("atlasiq_contactos_v4.vcf", currentFilteredLeads.length ? currentFilteredLeads : allLeads);
    });

    const importInput = document.getElementById("input-import-json-file");
    document.getElementById("btn-import-json")?.addEventListener("click", () => importInput?.click());
    importInput?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const parsed = JSON.parse(String(ev.target?.result || "[]"));
                const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.leads) ? parsed.leads : []);
                if (!incoming.length) throw new Error("El archivo no contiene una lista válida de prospectos.");

                const map = new Map();
                allLeads.forEach(l => map.set(getLeadKey(l), l));
                let added = 0;
                incoming.forEach(item => {
                    if (!item || !item.name) return;
                    normalizeLeadRecord(item);
                    const k = getLeadKey(item);
                    if (!map.has(k)) {
                        map.set(k, item);
                        added++;
                    } else {
                        Object.assign(map.get(k), item);
                    }
                });
                allLeads = Array.from(map.values());
                await persistAllLeads();
                recalculateDistances();
                populateNicheDropdown();
                applyFilters();
                playAudioNotification("success");
                alert(`✅ Importación completada: ${added} prospectos nuevos añadidos (${allLeads.length} totales en AtlasDB).`);
            } catch (err) {
                alert("Error al importar JSON: " + err.message);
            } finally {
                importInput.value = "";
            }
        };
        reader.readAsText(file);
    });

    // Webhook Sync
    document.getElementById("btn-sync-webhook")?.addEventListener("click", () => {
        storageAdapter.get(["tl_webhook_url"], async (data) => {
            const webhookUrl = data.tl_webhook_url;
            if (!webhookUrl) {
                alert("Configura primero la URL de tu Webhook (n8n, Make, Zapier, GoHighLevel, HubSpot) en ⚙️ Ajustes.");
                document.getElementById("settings-modal")?.classList.add("open");
                document.getElementById("tl-modal-backdrop")?.classList.add("open");
                return;
            }
            const leadsToSync = currentFilteredLeads.length ? currentFilteredLeads : allLeads;
            if (!leadsToSync.length) {
                alert("No hay prospectos para sincronizar.");
                return;
            }
            const btn = document.getElementById("btn-sync-webhook");
            const orig = btn.textContent;
            btn.textContent = "⏳ Sincronizando...";
            btn.disabled = true;
            try {
                await sendLeadsToWebhook(webhookUrl, leadsToSync);
                btn.textContent = "✅ ¡Sincronizado!";
                playAudioNotification("success");
                setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
            } catch (err) {
                alert("Error al sincronizar con Webhook: " + err.message);
                btn.textContent = orig;
                btn.disabled = false;
            }
        });
    });

    // Enterprise Settings & White-Label Modal
    document.getElementById("btn-settings")?.addEventListener("click", () => {
        document.getElementById("settings-modal")?.classList.add("open");
        document.getElementById("tl-modal-backdrop")?.classList.add("open");
    });
    document.getElementById("btn-modal-cancel")?.addEventListener("click", () => {
        document.getElementById("settings-modal")?.classList.remove("open");
        document.getElementById("tl-modal-backdrop")?.classList.remove("open");
    });
    document.getElementById("btn-modal-save")?.addEventListener("click", () => {
        const webhookUrl = document.getElementById("setting-webhook-url")?.value.trim() || "";
        const geminiKey = document.getElementById("setting-gemini-key")?.value.trim() || "";
        const edgeUrl = document.getElementById("setting-edge-worker-url")?.value.trim() || "";
        const branding = {
            agencyName: document.getElementById("setting-agency-name")?.value.trim() || "WINDOWSTELECOM",
            consultantName: document.getElementById("setting-consultant-name")?.value.trim() || "Joseph Castillo – CEO",
            agencyWeb: document.getElementById("setting-agency-web")?.value.trim() || "windowstelecom.com",
            agencyWa: document.getElementById("setting-agency-wa")?.value.trim() || "https://wa.me/584127785780"
        };
        currentBranding = branding;
        storageAdapter.set({
            tl_webhook_url: webhookUrl,
            tl_gemini_key: geminiKey,
            tl_edge_worker_url: edgeUrl,
            tl_branding: branding
        }, () => {
            playAudioNotification("success");
            document.getElementById("settings-modal")?.classList.remove("open");
            document.getElementById("tl-modal-backdrop")?.classList.remove("open");
        });
    });

    // Speed Outreach & Bulk DNS Audit
    document.getElementById("btn-start-speed-outreach")?.addEventListener("click", startSpeedOutreach);
    document.getElementById("btn-speed-close")?.addEventListener("click", closeSpeedOutreach);
    document.getElementById("btn-speed-skip")?.addEventListener("click", skipSpeedLead);
    document.getElementById("btn-speed-send-next")?.addEventListener("click", sendSpeedAndAdvance);
    document.getElementById("btn-verify-all-emails")?.addEventListener("click", verifyAllLeadsMx);

    // Universal Backdrop Close
    document.getElementById("tl-modal-backdrop")?.addEventListener("click", () => {
        closeSpeedOutreach();
        document.getElementById("settings-modal")?.classList.remove("open");
        document.getElementById("license-modal")?.classList.remove("open");
        document.getElementById("tl-modal-backdrop")?.classList.remove("open");
    });

    // Clear Database (AtlasDB + Mirror)
    document.getElementById("btn-clear-data")?.addEventListener("click", async () => {
        if (confirm("¿Deseas vaciar todos los prospectos almacenados en AtlasDB? Esta acción no se puede deshacer.")) {
            _isInternalSave = true;
            try {
                if (typeof AtlasDB !== "undefined" && AtlasDB.clearAllLeads) {
                    await AtlasDB.clearAllLeads();
                } else {
                    await new Promise(r => storageAdapter.remove(["leads"], r));
                }
                allLeads = [];
                currentFilteredLeads = [];
                if (table) table.setData([]);
                updateKpiMetrics([], []);
                populateNicheDropdown();
                updateMarketSaturationView("all");
                if (leafletMap) updateMapData([]);
                renderKanbanBoard([]);
                if (activeViewId === "analytics") renderAnalyticsBiCharts([]);
            } finally {
                setTimeout(() => { _isInternalSave = false; }, 350);
            }
        }
    });
});
