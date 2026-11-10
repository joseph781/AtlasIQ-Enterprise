/**
 * AtlasIQ Enterprise CRM - Dashboard Controller
 * Grade: Silicon Valley Professional
 * Author: Joseph Castillo (CEO) / WINDOWSTELECOM
 */

let allLeads = [];
let currentFilter = "all";
let activeLeadForDrawer = null;
let currentPitchChannel = "whatsapp";
let userLocation = null;
let clusterCentroid = null;

// Tabulator Instance
let table = null;

// Universal Storage Adapter (Extension & Cloudflare Pages Web App)
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
            localStorage.setItem(k, typeof v === "object" ? JSON.stringify(v) : v);
        });
        if (cb) cb();
    },
    remove: (keys, cb) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => localStorage.removeItem(k));
        if (cb) cb();
    }
};

function initTable() {
    table = new Tabulator("#example-table", {
        layout: "fitColumns",
        placeholder: "No se encontraron prospectos. Inicia una búsqueda en Google Maps con AtlasIQ.",
        selectable: true,
        pagination: "local",
        paginationSize: 25,
        paginationSizeSelector: [10, 25, 50, 100, 500],
        columns: [
            {
                title: "Empresa",
                field: "name",
                widthGrow: 2.2,
                formatter: (cell) => {
                    const row = cell.getRow().getData();
                    const name = cell.getValue() || "Sin nombre";
                    const mapLink = row.mapsUrl ? `<a href="${row.mapsUrl}" target="_blank" title="Ver en Google Maps" style="margin-left: 6px; text-decoration: none;">📍</a>` : "";
                    return `<strong style="color: #0f172a;">${name}</strong>${mapLink}`;
                }
            },
            {
                title: "Calificación",
                field: "averageRating",
                width: 120,
                hozAlign: "center",
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    const rev = row.reviewCount ? `(${row.reviewCount})` : "";
                    return `<span class="tl-rating-pill">★ ${val} <small style="color: #64748b;">${rev}</small></span>`;
                }
            },
            {
                title: "Score IA",
                field: "lead_score",
                width: 100,
                hozAlign: "center",
                sorter: "number",
                formatter: (cell) => {
                    const score = parseInt(cell.getValue()) || 50;
                    let cls = "tl-score-med";
                    if (score >= 75) cls = "tl-score-high";
                    else if (score < 45) cls = "tl-score-low";
                    return `<span class="tl-badge-score ${cls}">${score}</span>`;
                }
            },
            {
                title: "Teléfono",
                field: "phone",
                widthGrow: 1.5,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    const pInfo = formatPhone(val);
                    const waBtn = pInfo.whatsappUrl ? 
                        `<a href="${pInfo.whatsappUrl}" target="_blank" style="margin-left: 6px; text-decoration: none;" title="Abrir WhatsApp">💬</a>` : "";
                    return `<span>${val}</span>${waBtn}`;
                }
            },
            {
                title: "Email Verificado",
                field: "email",
                widthGrow: 1.8,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    return `<a href="mailto:${val}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${val}</a>`;
                }
            },
            {
                title: "Sitio Web",
                field: "website",
                widthGrow: 1.6,
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #ef4444; font-size: 11px; font-weight: 600;">Sin Web</span>';
                    const domain = extractDomain(val);
                    let techBadge = "";
                    if (row.tech_stack) {
                        if (row.tech_stack.includes("Shopify")) techBadge = ' <span style="background: #e0f2fe; color: #0284c7; padding: 1px 4px; border-radius: 4px; font-size: 10px;">Shopify</span>';
                        else if (row.tech_stack.includes("WordPress")) techBadge = ' <span style="background: #e2e8f0; color: #334155; padding: 1px 4px; border-radius: 4px; font-size: 10px;">WP</span>';
                    }
                    return `<a href="${val}" target="_blank" style="color: #0f172a; text-decoration: underline;">${domain}</a>${techBadge}`;
                }
            },
            {
                title: "Rubro / Categoría",
                field: "category",
                widthGrow: 1.4,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    return `<span style="color: #475569; font-size: 12px;">${val}</span>`;
                }
            },
            {
                title: "📍 Distancia",
                field: "distanceKm",
                width: 110,
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
                title: "Acción",
                width: 105,
                hozAlign: "center",
                formatter: () => {
                    return `<button class="tl-btn tl-btn-primary" style="height: 26px; font-size: 11px; padding: 0 8px;">Detalle ↗</button>`;
                },
                cellClick: (e, cell) => {
                    openLeadDrawer(cell.getRow().getData());
                }
            }
        ],
        rowClick: (e, row) => {
            // Open drawer on row click unless clicked on specific link
            if (e.target.tagName !== "A" && e.target.tagName !== "BUTTON") {
                openLeadDrawer(row.getData());
            }
        }
    });
}

/**
 * Geolocation & Distance Calculation Engine
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
                badge.title = `Ubicación detectada: Lat ${loc.lat.toFixed(4)}, Lon ${loc.lon.toFixed(4)} (${loc.source.toUpperCase()})`;
            }
            storageAdapter.set({ user_location: loc });
        } else {
            const textEl = document.getElementById("user-location-text");
            if (textEl) textEl.textContent = "Ubicación por Cuadrante";
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

    // Inter-business proximity: calculate distance from each business to its nearest peer
    calculateInterBusinessDistances(allLeads);
}

// Populate Dynamic Niche Dropdown
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

    nicheSelect.innerHTML = `<option value="all">Todos los Nichos (${allLeads.length})</option>`;
    sorted.forEach(([cat, count]) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = `${cat} (${count})`;
        if (cat === previousVal) opt.selected = true;
        nicheSelect.appendChild(opt);
    });
}

// Load and Render Leads
function loadDashboardData() {
    storageAdapter.get(["leads", "tl_webhook_url", "tl_gemini_key", "user_location"], (data) => {
        allLeads = data.leads || [];

        if (data.user_location) {
            userLocation = data.user_location;
            const textEl = document.getElementById("user-location-text");
            if (textEl && userLocation.label) textEl.textContent = userLocation.label;
        }

        // Precalculate scores if missing
        allLeads.forEach(lead => {
            if (!lead.lead_score) {
                const s = calculateLeadScore(lead);
                lead.lead_score = s.score;
                lead.priority = s.priority;
                lead.opportunities = s.opportunities.join(", ");
            }
        });

        recalculateDistances();
        populateNicheDropdown();
        updateKpiMetrics(allLeads, allLeads);
        applyFilters();

        if (data.tl_webhook_url) {
            const el = document.getElementById("setting-webhook-url");
            if (el) el.value = data.tl_webhook_url;
        }
        if (data.tl_gemini_key) {
            const el = document.getElementById("setting-gemini-key");
            if (el) el.value = data.tl_gemini_key;
        }
    });
}

// Compute KPI Metrics
function updateKpiMetrics(totalDataset, displayedDataset) {
    const total = totalDataset.length;
    const displayed = displayedDataset.length;
    const withEmail = displayedDataset.filter(l => l.email && l.email.includes("@")).length;
    const withPhone = displayedDataset.filter(l => l.phone && l.phone.length > 5).length;
    const highScore = displayedDataset.filter(l => (parseInt(l.lead_score) || 0) >= 75).length;

    let ratingSum = 0;
    let ratingCount = 0;
    let reviewSum = 0;

    displayedDataset.forEach(l => {
        const r = parseFloat(l.averageRating);
        const rev = parseInt(l.reviewCount);
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
            sub.textContent = displayed !== total ? 
                `${displayed.toLocaleString()} visibles tras filtros` : "Prospectos en base de datos";
        }
    }

    document.getElementById("kpi-total-emails").textContent = withEmail.toLocaleString();
    document.getElementById("kpi-email-pct").textContent = displayed > 0 ? `${Math.round((withEmail / displayed) * 100)}% del total` : "0% del total";
    document.getElementById("kpi-total-phones").textContent = withPhone.toLocaleString();
    document.getElementById("kpi-phone-pct").textContent = displayed > 0 ? `${Math.round((withPhone / displayed) * 100)}% con contacto` : "0%";
    document.getElementById("kpi-high-score").textContent = highScore.toLocaleString();
    document.getElementById("kpi-avg-rating").textContent = `${avgRating}★`;
    document.getElementById("kpi-avg-reviews").textContent = `${avgReviews} reseñas prom.`;
}

// Filter System
function applyFilters() {
    const searchVal = (document.getElementById("filter-search").value || "").toLowerCase().trim();
    const nicheVal = (document.getElementById("filter-niche")?.value || "all").trim();
    const isStrict = document.getElementById("check-strict-niche")?.checked || false;
    const distanceVal = document.getElementById("filter-distance")?.value || "all";
    const maxDist = distanceVal !== "all" ? parseFloat(distanceVal) : null;

    const filtered = allLeads.filter(lead => {
        // 1. Text search match
        if (searchVal) {
            const haystack = [
                lead.name, lead.phone, lead.email, lead.address, 
                lead.category, lead.website, lead.opportunities, lead.tech_stack
            ].join(" ").toLowerCase();
            if (!haystack.includes(searchVal)) return false;
        }

        // 2. Chip Filter Match
        if (currentFilter === "high-score") {
            if ((parseInt(lead.lead_score) || 0) < 75) return false;
        } else if (currentFilter === "has-email") {
            if (!lead.email || !lead.email.includes("@")) return false;
        } else if (currentFilter === "has-phone") {
            if (!lead.phone || lead.phone.length <= 5) return false;
        } else if (currentFilter === "has-website") {
            if (!lead.website || lead.website.trim().length === 0) return false;
        } else if (currentFilter === "no-website") {
            if (lead.website && lead.website.trim().length > 0) return false;
        }

        // 3. Niche / Category Filter
        if (nicheVal && nicheVal !== "all") {
            const leadCatNorm = normalizeCategory(lead.category);
            const targetNorm = normalizeCategory(nicheVal);

            if (isStrict) {
                // Strict exact match on primary category
                if (leadCatNorm !== targetNorm) return false;
            } else {
                // Flexible match (tokens or substrings)
                if (!leadCatNorm.includes(targetNorm) && !targetNorm.includes(leadCatNorm)) return false;
            }
        }

        // 4. Distance Filter
        if (maxDist !== null && !isNaN(maxDist)) {
            if (lead.distanceKm !== null && lead.distanceKm !== undefined) {
                if (lead.distanceKm > maxDist) return false;
            }
        }

        return true;
    });

    if (table) {
        table.setData(filtered);
    }

    updateKpiMetrics(allLeads, filtered);

    // Safety Alert Banner for Active Filters
    const banner = document.getElementById("filter-reset-banner");
    const bannerFiltered = document.getElementById("banner-filtered-count");
    const bannerTotal = document.getElementById("banner-total-count");

    if (allLeads.length > 0 && filtered.length < allLeads.length) {
        if (banner) banner.style.display = "flex";
        if (bannerFiltered) bannerFiltered.textContent = filtered.length.toLocaleString();
        if (bannerTotal) bannerTotal.textContent = allLeads.length.toLocaleString();
    } else {
        if (banner) banner.style.display = "none";
    }

    // Refresh Market Saturation Radar
    updateMarketSaturationView(nicheVal);
}

// Update Market Saturation & Niche Intelligence View
function updateMarketSaturationView(targetNiche = "all") {
    const ref = userLocation || clusterCentroid;
    const sat = analyzeMarketSaturation(allLeads, targetNiche, ref);

    if (sat.empty) {
        document.getElementById("sat-score-val").textContent = "0%";
        document.getElementById("sat-level-badge").textContent = "Sin datos";
        document.getElementById("sat-density-sub").textContent = "Inicia una prospección en Google Maps.";
        return;
    }

    // Update Saturation Gauge & Density
    document.getElementById("sat-score-val").textContent = `${sat.saturationIndex}%`;
    document.getElementById("sat-score-val").style.color = sat.saturationColor;
    
    const levelBadge = document.getElementById("sat-level-badge");
    levelBadge.textContent = sat.saturationTag;
    levelBadge.style.color = sat.saturationColor;
    levelBadge.style.background = sat.saturationIndex >= 70 ? "#fef2f2" : (sat.saturationIndex >= 40 ? "#fffbeb" : "#ecfdf5");

    const meterFill = document.getElementById("sat-meter-fill");
    meterFill.style.width = `${sat.saturationIndex}%`;
    meterFill.style.background = sat.saturationColor;

    document.getElementById("sat-density-sub").textContent = 
        `${sat.totalCompetitors} competidores (${sat.densityPerKm2}/km²) en un radio de ${sat.effectiveRadiusKm.toFixed(1)} km`;

    // Inter-competitor Proximity ("Distancia del uno al otro")
    const peerDistEl = document.getElementById("sat-peer-dist-val");
    if (sat.avgCompetitorDistanceKm !== null) {
        peerDistEl.textContent = sat.avgCompetitorDistanceKm < 1 ? 
            `${Math.round(sat.avgCompetitorDistanceKm * 1000)} m` : `${sat.avgCompetitorDistanceKm} km`;
    } else {
        peerDistEl.textContent = "-";
    }
    document.getElementById("sat-peer-dist-sub").textContent = 
        `Distancia promedio entre competidores idénticos en el cuadrante analizado.`;

    // Digital Vulnerability
    document.getElementById("sat-vuln-val").textContent = `${sat.digitalVulnerability.withoutWebsitePct}% Sin Web`;
    document.getElementById("sat-vuln-sub").textContent = 
        `${sat.digitalVulnerability.withoutPixelPct}% sin pixel de anuncios, ${sat.digitalVulnerability.lowRatingPct}% con reputación < 4.0`;

    // Spatial Expansion Quadrant
    document.getElementById("sat-quadrant-val").textContent = sat.leastDenseQuadrant;
    document.getElementById("sat-quadrant-sub").textContent = 
        `Sector con menor saturación comercial (${sat.leastDenseCount} negocios registrados)`;

    // Strategic Advisory Callout
    document.getElementById("sat-advice-text").textContent = sat.strategicAdvice;
    document.getElementById("sat-target-badge").textContent = sat.targetNiche;

    // Render Underserved Opportunity Niches
    const chipsContainer = document.getElementById("sat-opportunity-chips");
    chipsContainer.innerHTML = "";

    const centerCoords = clusterCentroid || userLocation || { lat: 8.9248, lon: -67.4285 };

    sat.opportunityNiches.forEach(niche => {
        const chip = document.createElement("a");
        chip.className = "tl-opportunity-chip";
        chip.title = `${niche.reason} - Clic para explorar en Google Maps`;
        chip.target = "_blank";
        const mapUrl = `https://www.google.com/maps/search/${encodeURIComponent(niche.name)}/@${centerCoords.lat},${centerCoords.lon},14z`;
        chip.href = mapUrl;
        chip.innerHTML = `<span>+ ${niche.name}</span> <small style="opacity: 0.8; font-weight: normal;">(Viabilidad ${niche.viability}) ↗</small>`;
        chipsContainer.appendChild(chip);
    });
}

// Lead Detail Drawer Controller
function openLeadDrawer(lead) {
    activeLeadForDrawer = lead;
    const overlay = document.getElementById("lead-drawer-overlay");

    document.getElementById("drawer-lead-name").textContent = lead.name || "Sin nombre";
    document.getElementById("drawer-lead-rating").textContent = lead.averageRating ? 
        `★ ${lead.averageRating} (${lead.reviewCount || 0} reseñas)` : "Sin calificación";

    // AI Score & Priority
    const score = parseInt(lead.lead_score) || 50;
    const scoreEl = document.getElementById("drawer-ai-score");
    scoreEl.textContent = score;
    scoreEl.className = "tl-badge-score " + (score >= 75 ? "tl-score-high" : (score < 45 ? "tl-score-low" : "tl-score-med"));

    document.getElementById("drawer-ai-priority").textContent = lead.priority || "Media";

    // Opportunities tags
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
        oppsContainer.innerHTML = '<span style="color: #94a3b8; font-size: 11px;">Presencia digital optimizada</span>';
    }

    // Contact Fields
    const pInfo = formatPhone(lead.phone);
    document.getElementById("drawer-phone").textContent = pInfo.original || "No detectado";
    document.getElementById("drawer-email").textContent = lead.email || "No verificado";
    document.getElementById("drawer-address").textContent = lead.address || "No especificada";
    document.getElementById("drawer-category").textContent = lead.category || "General";

    // Web & Tech Stack
    const webLink = document.getElementById("drawer-website");
    if (lead.website) {
        webLink.href = lead.website;
        webLink.textContent = extractDomain(lead.website);
        webLink.style.display = "inline";
    } else {
        webLink.removeAttribute("href");
        webLink.textContent = "Sin Sitio Web";
        webLink.style.color = "#ef4444";
    }
    document.getElementById("drawer-tech").textContent = lead.tech_stack || "No detectado / Estático";

    // Social Links
    const socialContainer = document.getElementById("drawer-socials");
    socialContainer.innerHTML = "";
    const socials = ["instagram", "facebook", "linkedin", "twitter", "youtube", "tiktok"];
    let hasAnySocial = false;
    socials.forEach(s => {
        if (lead[s]) {
            hasAnySocial = true;
            const a = document.createElement("a");
            a.href = lead[s];
            a.target = "_blank";
            a.className = "tl-social-link";
            a.textContent = s.toUpperCase();
            socialContainer.appendChild(a);
        }
    });
    if (!hasAnySocial) {
        socialContainer.innerHTML = '<span style="color: #94a3b8; font-size: 11px;">Sin redes detectadas</span>';
    }

    // Proximity Details in Drawer
    const distText = lead.distanceKm !== null && lead.distanceKm !== undefined ? 
        (lead.distanceKm < 1 ? `${Math.round(lead.distanceKm * 1000)} m` : `${lead.distanceKm} km`) : "No calculada";
    const peerDistText = lead.nearestPeerDistanceKm !== null && lead.nearestPeerDistanceKm !== undefined ? 
        (lead.nearestPeerDistanceKm < 1 ? `${Math.round(lead.nearestPeerDistanceKm * 1000)} m` : `${lead.nearestPeerDistanceKm.toFixed(1)} km`) : "N/A";
    
    // Refresh Outreach Pitch
    updatePitchPreview();

    overlay.classList.add("open");
}

function closeLeadDrawer() {
    const overlay = document.getElementById("lead-drawer-overlay");
    if (overlay) overlay.classList.remove("open");
    activeLeadForDrawer = null;
}

function updatePitchPreview() {
    if (!activeLeadForDrawer) return;
    const pitch = generateOutreachPitch(activeLeadForDrawer, currentPitchChannel);
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

// Reset all filters to default safe state
function resetAllFilters() {
    document.getElementById("filter-search").value = "";
    document.querySelectorAll(".tl-chip").forEach(c => c.classList.remove("active"));
    document.querySelector('.tl-chip[data-filter="all"]').classList.add("active");
    currentFilter = "all";

    const nicheSelect = document.getElementById("filter-niche");
    if (nicheSelect) nicheSelect.value = "all";

    const strictCheck = document.getElementById("check-strict-niche");
    if (strictCheck) strictCheck.checked = false;

    const distSelect = document.getElementById("filter-distance");
    if (distSelect) distSelect.value = "all";

    applyFilters();
}

// DOM Ready Initializer
document.addEventListener("DOMContentLoaded", () => {
    initTable();
    initLocationAndDistances();
    loadDashboardData();

    // Real-time synchronization when new leads are scraped
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.leads) {
                console.log("[AtlasIQ] Real-time leads sync detected:", changes.leads.newValue?.length);
                loadDashboardData();
            }
        });
    }
    window.addEventListener("storage", (e) => {
        if (e.key === "leads") {
            loadDashboardData();
        }
    });

    // SEARCH INPUT LISTENER
    document.getElementById("filter-search").addEventListener("input", () => applyFilters());

    // NICHE FILTER & STRICT CHECKBOX LISTENERS
    document.getElementById("filter-niche").addEventListener("change", () => applyFilters());
    document.getElementById("check-strict-niche").addEventListener("change", () => applyFilters());

    // DISTANCE FILTER LISTENER
    document.getElementById("filter-distance").addEventListener("change", () => applyFilters());

    // RESET BUTTONS
    document.getElementById("btn-reset-filters").addEventListener("click", () => resetAllFilters());
    const bannerReset = document.getElementById("banner-btn-reset");
    if (bannerReset) bannerReset.addEventListener("click", () => resetAllFilters());

    // CHIP FILTER LISTENERS
    document.querySelectorAll(".tl-chip").forEach(chip => {
        chip.addEventListener("click", (e) => {
            document.querySelectorAll(".tl-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            currentFilter = chip.getAttribute("data-filter");
            applyFilters();
        });
    });

    // SATURATION PANEL TOGGLE
    const satPanel = document.getElementById("market-saturation-panel");
    document.getElementById("btn-toggle-saturation").addEventListener("click", () => {
        if (satPanel.style.display === "none") {
            satPanel.style.display = "block";
            updateMarketSaturationView(document.getElementById("filter-niche")?.value || "all");
        } else {
            satPanel.style.display = "none";
        }
    });
    document.getElementById("btn-close-saturation").addEventListener("click", () => {
        satPanel.style.display = "none";
    });

    // OPEN GOOGLE MAPS SEARCH BUTTON
    document.getElementById("btn-open-maps-search").addEventListener("click", () => {
        const center = clusterCentroid || userLocation;
        const currentNiche = document.getElementById("filter-niche")?.value;
        const queryTerm = (currentNiche && currentNiche !== "all") ? currentNiche : "negocios y comercios";
        let mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(queryTerm)}`;
        if (center) {
            mapsUrl += `/@${center.lat},${center.lon},14z`;
        }
        window.open(mapsUrl, "_blank");
    });

    // DRAWER CONTROLS
    document.getElementById("drawer-close-btn").addEventListener("click", closeLeadDrawer);
    document.getElementById("lead-drawer-overlay").addEventListener("click", (e) => {
        if (e.target.id === "lead-drawer-overlay") closeLeadDrawer();
    });

    // Pitch Channel Tabs
    document.querySelectorAll(".tl-pitch-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tl-pitch-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentPitchChannel = tab.getAttribute("data-channel");
            updatePitchPreview();
        });
    });

    // Live Gemini AI Pitch Enhancement
    document.getElementById("btn-ai-generate-pitch").addEventListener("click", async () => {
        if (!activeLeadForDrawer) return;

        storageAdapter.get(["tl_gemini_key"], async (data) => {
            const apiKey = data.tl_gemini_key;
            if (!apiKey) {
                alert("Para usar el motor de IA en vivo, introduce tu Gemini API Key gratuita en el botón ⚙️ Ajustes.");
                document.getElementById("settings-modal").classList.add("open");
                return;
            }

            const btn = document.getElementById("btn-ai-generate-pitch");
            const originalText = btn.textContent;
            btn.textContent = "⏳ Analizando empresa con Gemini...";
            btn.disabled = true;

            try {
                const prompt = `Actúa como el consultor comercial senior de AtlasIQ Enterprise.
Analiza la siguiente empresa y redacta un diagnóstico de debilidades digitales y una propuesta comercial de alto impacto para cerrar una reunión de ventas:

Nombre: ${activeLeadForDrawer.name}
Rubro: ${activeLeadForDrawer.category || "General"}
Sitio Web: ${activeLeadForDrawer.website || "No tiene sitio web (Gran oportunidad)"}
Puntuación: ${activeLeadForDrawer.averageRating || "N/A"} estrellas (${activeLeadForDrawer.reviewCount || 0} opiniones)
Stack Tecnológico: ${activeLeadForDrawer.tech_stack || "Desconocido"}
Oportunidades Detectadas: ${activeLeadForDrawer.opportunities || "Servicios digitales generales"}

Entrega un mensaje directo, profesional y persuasivo adaptado para ${currentPitchChannel.toUpperCase()}.`;

                const aiResponse = await generateGeminiAnalysis(prompt, apiKey);
                document.getElementById("drawer-pitch-text").textContent = aiResponse;
                
                const pInfo = formatPhone(activeLeadForDrawer.phone);
                const waBtn = document.getElementById("btn-send-wa");
                if (pInfo.whatsappUrl) {
                    waBtn.href = `${pInfo.whatsappUrl}?text=${encodeURIComponent(aiResponse)}`;
                }

                playAudioNotification("success");
            } catch (err) {
                alert("Error al consultar Gemini: " + err.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });

    // Copy Pitch Button
    document.getElementById("btn-copy-pitch").addEventListener("click", () => {
        const text = document.getElementById("drawer-pitch-text").textContent;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById("btn-copy-pitch");
            btn.textContent = "✅ ¡Copiado!";
            setTimeout(() => { btn.textContent = "📋 Copiar Mensaje"; }, 2000);
        });
    });

    // EXPORTS
    document.getElementById("btn-export-csv").addEventListener("click", () => {
        const data = table ? table.getData() : allLeads;
        exportToCsv("atlasiq_leads.csv", data);
    });

    document.getElementById("btn-export-xlsx").addEventListener("click", () => {
        if (table) {
            table.download("xlsx", "atlasiq_leads.xlsx", { sheetName: "Leads" });
        }
    });

    document.getElementById("btn-export-json").addEventListener("click", () => {
        const data = table ? table.getData() : allLeads;
        exportToJson("atlasiq_leads.json", data);
    });

    const vCardBtn = document.getElementById("btn-export-vcard");
    if (vCardBtn) {
        vCardBtn.addEventListener("click", () => {
            const data = table ? table.getData() : allLeads;
            exportToVCard("atlasiq_contactos.vcf", data);
        });
    }

    // WEBHOOK SYNC
    document.getElementById("btn-sync-webhook").addEventListener("click", async () => {
        storageAdapter.get(["tl_webhook_url"], async (data) => {
            const webhookUrl = data.tl_webhook_url;
            if (!webhookUrl) {
                alert("Por favor configura primero la URL de tu Webhook en el botón ⚙️ Ajustes.");
                document.getElementById("settings-modal").classList.add("open");
                return;
            }

            const leadsToSync = table ? table.getData() : allLeads;
            if (!leadsToSync.length) {
                alert("No hay prospectos para sincronizar.");
                return;
            }

            const btn = document.getElementById("btn-sync-webhook");
            btn.textContent = "⏳ Sincronizando...";
            btn.disabled = true;

            try {
                await sendLeadsToWebhook(webhookUrl, leadsToSync);
                btn.textContent = "✅ ¡Sincronizado!";
                playAudioNotification("success");
                setTimeout(() => {
                    btn.textContent = "🚀 Sincronizar CRM / Webhook";
                    btn.disabled = false;
                }, 2500);
            } catch (err) {
                alert("Error al sincronizar con Webhook: " + err.message);
                btn.textContent = "🚀 Sincronizar CRM / Webhook";
                btn.disabled = false;
            }
        });
    });

    // SETTINGS MODAL
    document.getElementById("btn-settings").addEventListener("click", () => {
        document.getElementById("settings-modal").classList.add("open");
    });
    document.getElementById("btn-modal-cancel").addEventListener("click", () => {
        document.getElementById("settings-modal").classList.remove("open");
    });
    document.getElementById("btn-modal-save").addEventListener("click", () => {
        const url = document.getElementById("setting-webhook-url").value.trim();
        const geminiKey = document.getElementById("setting-gemini-key").value.trim();
        storageAdapter.set({ tl_webhook_url: url, tl_gemini_key: geminiKey }, () => {
            alert("Ajustes guardados correctamente.");
            document.getElementById("settings-modal").classList.remove("open");
        });
    });

    // CLEAR DATA
    document.getElementById("btn-clear-data").addEventListener("click", () => {
        if (confirm("¿Estás seguro de que deseas eliminar todos los prospectos guardados? Esta acción es irreversible.")) {
            storageAdapter.remove(["leads"], () => {
                allLeads = [];
                table.setData([]);
                updateKpiMetrics([], []);
                updateMarketSaturationView("all");
            });
        }
    });
});
