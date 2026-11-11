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

// Tabulator & Leaflet Map Instances
let table = null;
let leafletMap = null;
let mapMarkerLayer = null;
let mapHeatLayer = null;
let currentFilteredLeads = [];

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
    const isMobile = window.innerWidth < 768;
    table = new Tabulator("#example-table", {
        layout: isMobile ? "fitDataFill" : "fitColumns",
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
                minWidth: 160,
                formatter: (cell) => {
                    const row = cell.getRow().getData();
                    const name = cell.getValue() || "Sin nombre";
                    const mapLink = row.mapsUrl ? `<a href="${row.mapsUrl}" target="_blank" title="Ver en Google Maps" style="margin-left: 6px; text-decoration: none;">📍</a>` : "";
                    return `<strong class="tl-table-name">${name}</strong>${mapLink}`;
                }
            },
            {
                title: "Calificación",
                field: "averageRating",
                width: 110,
                minWidth: 95,
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
                width: 90,
                minWidth: 80,
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
                minWidth: 125,
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
                minWidth: 160,
                formatter: (cell) => {
                    const val = cell.getValue();
                    const row = cell.getRow().getData();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    let mxBadge = "";
                    if (row.mx_status === "valid") {
                        mxBadge = `<span class="tl-mx-badge valid" title="${row.mx_provider || 'Servidor MX Activo'}">✓ MX</span>`;
                    } else if (row.mx_status === "invalid") {
                        mxBadge = `<span class="tl-mx-badge invalid" title="${row.mx_provider || 'Sin servidor MX'}">✕ Sin MX</span>`;
                    } else {
                        mxBadge = `<button class="tl-btn-verify-mx" data-email="${val}" style="font-size: 10px; padding: 1px 5px; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; margin-left: 4px;" title="Verificar DNS MX con DoH Cloudflare">🔍 Validar</button>`;
                    }
                    return `<a href="mailto:${val}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${val}</a>${mxBadge}`;
                },
                cellClick: async (e, cell) => {
                    if (e.target && e.target.classList.contains("tl-btn-verify-mx")) {
                        e.stopPropagation();
                        const row = cell.getRow();
                        const rowData = row.getData();
                        const email = e.target.getAttribute("data-email");
                        e.target.textContent = "⏳...";
                        const res = await verifyDomainMx(email);
                        rowData.mx_status = res.valid ? "valid" : "invalid";
                        rowData.mx_provider = res.provider;
                        row.update({ mx_status: rowData.mx_status, mx_provider: rowData.mx_provider });
                        const leadInAll = allLeads.find(l => l.name === rowData.name && l.phone === rowData.phone);
                        if (leadInAll) {
                            leadInAll.mx_status = rowData.mx_status;
                            leadInAll.mx_provider = rowData.mx_provider;
                            storageAdapter.set({ leads: allLeads });
                        }
                        if (res.valid) playAudioNotification("success");
                    }
                }
            },
            {
                title: "Sitio Web",
                field: "website",
                widthGrow: 1.6,
                minWidth: 130,
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
                    return `<a href="${val}" target="_blank" class="tl-table-link">${domain}</a>${techBadge}`;
                }
            },
            {
                title: "Rubro / Categoría",
                field: "category",
                widthGrow: 1.4,
                minWidth: 130,
                formatter: (cell) => {
                    const val = cell.getValue();
                    if (!val) return '<span style="color: #94a3b8;">-</span>';
                    return `<span class="tl-table-category">${val}</span>`;
                }
            },
            {
                title: "📍 Distancia",
                field: "distanceKm",
                width: 100,
                minWidth: 90,
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
                width: 100,
                minWidth: 90,
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

    currentFilteredLeads = filtered;

    if (table) {
        table.setData(filtered);
    }

    updateKpiMetrics(allLeads, filtered);
    updateMapData(currentFilteredLeads);
    renderKanbanBoard(currentFilteredLeads);

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

    // Populate Detailed Niche Breakdown Table
    renderNicheBreakdownTable();
}

// Render Detailed Niche Breakdown Table
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
            if (!l.website || l.website.trim() === "") noWebCount++;
            if (l.nearestPeerDistanceKm !== null && l.nearestPeerDistanceKm !== undefined && !isNaN(l.nearestPeerDistanceKm)) {
                distSum += l.nearestPeerDistanceKm;
                distCount++;
            }
        });

        const avgDist = distCount > 0 ? (distSum / distCount) : null;
        const avgDistText = avgDist !== null ? 
            (avgDist < 1 ? `${Math.round(avgDist * 1000)} m` : `${avgDist.toFixed(1)} km`) : "-";

        let satBadge = '<span class="tl-sat-badge" style="background: #ecfdf5; color: #047857;">Océano Azul</span>';
        if (total >= 25 || (avgDist !== null && avgDist < 0.3)) {
            satBadge = '<span class="tl-sat-badge" style="background: #fef2f2; color: #b91c1c;">Saturado</span>';
        } else if (total >= 10 || (avgDist !== null && avgDist < 0.7)) {
            satBadge = '<span class="tl-sat-badge" style="background: #fffbeb; color: #b45309;">Equilibrado</span>';
        }

        const noWebPct = total > 0 ? Math.round((noWebCount / total) * 100) : 0;

        html += `
            <tr class="tl-niche-tr">
                <td class="tl-niche-name" style="padding: 8px 12px;">
                    ${catName}
                </td>
                <td class="tl-niche-total" style="padding: 8px 12px; text-align: center;">
                    ${total}
                </td>
                <td class="tl-niche-dist" style="padding: 8px 12px; text-align: center;">
                    📍 ${avgDistText}
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    ${satBadge}
                </td>
                <td style="padding: 8px 12px; text-align: center; color: ${noWebPct > 50 ? '#ef4444' : 'var(--text-secondary)'}; font-weight: 600;">
                    ${noWebPct}% (${noWebCount}/${total})
                </td>
                <td style="padding: 8px 12px; text-align: center;">
                    <button class="tl-btn tl-btn-outline" onclick="selectAndFilterNiche('${catName.replace(/'/g, "\\'")}')" style="height: 24px; font-size: 11px; padding: 0 8px;">
                        Filtrar ↗
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

window.selectAndFilterNiche = function(nicheName) {
    const nicheSelect = document.getElementById("filter-niche");
    if (nicheSelect) {
        nicheSelect.value = nicheName;
    }
    applyFilters();
    const tableCard = document.querySelector(".tl-table-card");
    if (tableCard) tableCard.scrollIntoView({ behavior: "smooth" });
};

/**
 * Interactive Leaflet Map & Heatmap Controller ($0 Cost)
 */
let mapTileLayer = null;

function setMapTileLayer(theme) {
    if (!leafletMap || typeof L === "undefined") return;
    if (mapTileLayer) {
        leafletMap.removeLayer(mapTileLayer);
    }
    const isDark = theme === "dark";
    const tileUrl = isDark 
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    const attribution = isDark
        ? '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    
    mapTileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: attribution
    }).addTo(leafletMap);
}

function initLeafletMap() {
    const mapEl = document.getElementById("atlasiq-map");
    if (!mapEl || leafletMap || typeof L === "undefined") return;

    // Centroid or User Location or fallback
    const initialLat = clusterCentroid?.lat || userLocation?.lat || 8.9248;
    const initialLon = clusterCentroid?.lon || userLocation?.lon || -67.4285;

    leafletMap = L.map("atlasiq-map", {
        center: [initialLat, initialLon],
        zoom: 13,
        zoomControl: true
    });

    const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
    setMapTileLayer(activeTheme);

    mapMarkerLayer = L.layerGroup().addTo(leafletMap);
}

function updateMapData(leadsToRender) {
    if (!leafletMap || typeof L === "undefined") return;

    const leads = leadsToRender || currentFilteredLeads || allLeads;
    const showMarkers = document.getElementById("check-map-markers")?.checked !== false;
    const showHeatmap = document.getElementById("check-map-heatmap")?.checked !== false;

    // 1. Clear previous layers
    if (mapMarkerLayer) mapMarkerLayer.clearLayers();
    if (mapHeatLayer) {
        leafletMap.removeLayer(mapHeatLayer);
        mapHeatLayer = null;
    }

    const validLeads = leads.filter(l => {
        const lat = parseFloat(l.latitude);
        const lon = parseFloat(l.longitude);
        return !isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0);
    });

    const badge = document.getElementById("map-counter-badge");
    if (badge) badge.textContent = `${validLeads.length} Pines en mapa`;

    if (validLeads.length === 0) return;

    const latLngBounds = [];
    const heatPoints = [];

    validLeads.forEach(lead => {
        const lat = parseFloat(lead.latitude);
        const lon = parseFloat(lead.longitude);
        const score = parseInt(lead.lead_score) || 50;

        latLngBounds.push([lat, lon]);

        // Weight heat by lead score & density
        const intensity = score >= 75 ? 0.9 : (score >= 45 ? 0.6 : 0.3);
        heatPoints.push([lat, lon, intensity]);

        if (showMarkers) {
            let pinColor = "#3b82f6"; // Blue
            if (score >= 75) pinColor = "#10b981"; // Emerald
            else if (score >= 45) pinColor = "#f59e0b"; // Amber

            const customIcon = L.divIcon({
                className: "tl-map-pin-div",
                html: `<div style="background: ${pinColor}; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 800; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${score}</div>`,
                iconSize: [26, 26],
                iconAnchor: [13, 13],
                popupAnchor: [0, -13]
            });

            const distStr = lead.distanceKm !== null && lead.distanceKm !== undefined ? 
                (lead.distanceKm < 1 ? `${Math.round(lead.distanceKm * 1000)} m` : `${lead.distanceKm} km`) : "-";

            const webStr = lead.website ? 
                `<a href="${lead.website}" target="_blank" style="color: #2563eb; text-decoration: underline;">${extractDomain(lead.website)}</a>` : 
                '<span style="color: #ef4444; font-weight: 600;">Sin Web (Oportunidad)</span>';

            const popupContent = `
                <div style="font-family: inherit; font-size: 12px; line-height: 1.4; min-width: 220px; padding: 2px;">
                    <div class="tl-map-popup-title">${lead.name}</div>
                    <div class="tl-map-popup-sub">
                        ★ ${lead.averageRating || 'N/A'} · ${lead.category || 'General'}
                    </div>
                    <div class="tl-map-popup-box">
                        <div>📍 Distancia: <strong>${distStr}</strong></div>
                        <div>📞 Teléfono: <strong>${lead.phone || 'No detectado'}</strong></div>
                        <div>🌐 Sitio Web: <strong>${webStr}</strong></div>
                    </div>
                    <button onclick="window.openLeadDrawerById('${encodeURIComponent(lead.placeID || lead.name)}')" class="tl-btn tl-btn-primary" style="width: 100%; height: 26px; font-size: 11px;">
                        Ver Ficha y Contactar ↗
                    </button>
                </div>
            `;

            const marker = L.marker([lat, lon], { icon: customIcon }).bindPopup(popupContent);
            mapMarkerLayer.addLayer(marker);
        }
    });

    // 2. Add Heatmap Layer
    if (showHeatmap && heatPoints.length > 0 && typeof L.heatLayer === "function") {
        mapHeatLayer = L.heatLayer(heatPoints, {
            radius: 30,
            blur: 20,
            maxZoom: 16,
            gradient: { 0.3: "#3b82f6", 0.55: "#10b981", 0.75: "#f59e0b", 1.0: "#ef4444" }
        }).addTo(leafletMap);
    }

    // 3. Fit bounds
    if (latLngBounds.length > 0) {
        leafletMap.fitBounds(latLngBounds, { padding: [40, 40], maxZoom: 15 });
    }
}

window.openLeadDrawerById = function(encodedId) {
    const targetId = decodeURIComponent(encodedId);
    const found = allLeads.find(l => (l.placeID && l.placeID === targetId) || l.name === targetId);
    if (found) {
        openLeadDrawer(found);
    }
};

/**
 * Sales Pipeline Kanban Controller ($0 Cost)
 */
function renderKanbanBoard(leadsToRender) {
    const leads = leadsToRender || currentFilteredLeads || allLeads;
    const stages = ["nuevo", "contactado", "negociacion", "ganado", "descartado"];

    const counts = { nuevo: 0, contactado: 0, negociacion: 0, ganado: 0, descartado: 0 };

    stages.forEach(st => {
        const container = document.getElementById(`kanban-cards-${st}`);
        if (container) container.innerHTML = "";
    });

    leads.forEach(lead => {
        const stage = lead.pipeline_stage && stages.includes(lead.pipeline_stage) ? lead.pipeline_stage : "nuevo";
        counts[stage]++;

        const container = document.getElementById(`kanban-cards-${stage}`);
        if (!container) return;

        const score = parseInt(lead.lead_score) || 50;
        let scoreClass = "tl-score-med";
        if (score >= 75) scoreClass = "tl-score-high";
        else if (score < 45) scoreClass = "tl-score-low";

        const pInfo = formatPhone(lead.phone);
        const distStr = lead.distanceKm !== null && lead.distanceKm !== undefined ? 
            (lead.distanceKm < 1 ? `${Math.round(lead.distanceKm * 1000)} m` : `${lead.distanceKm} km`) : "-";

        const leadKey = lead.placeID || lead.name;

        const card = document.createElement("div");
        card.className = "tl-kanban-card-item";
        card.draggable = true;
        card.setAttribute("data-lead-key", leadKey);

        card.innerHTML = `
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;">
                <strong class="tl-kanban-lead-title" style="font-size: 13px; line-height: 1.3; cursor: pointer;" onclick="window.openLeadDrawerById('${encodeURIComponent(leadKey)}')">${lead.name}</strong>
                <span class="tl-badge-score ${scoreClass}" style="font-size: 10px; padding: 1px 5px;">${score}</span>
            </div>
            <div class="tl-kanban-lead-meta" style="font-size: 11px; display: flex; justify-content: space-between;">
                <span>★ ${lead.averageRating || '-'} · ${lead.category || 'General'}</span>
                <span>📍 ${distStr}</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--border-color);">
                <div class="tl-kanban-lead-phone" style="font-size: 11px;">
                    ${lead.phone ? `📞 ${lead.phone}` : '<span style="color: var(--text-muted);">Sin teléfono</span>'}
                </div>
                <div style="display: flex; gap: 4px;">
                    ${pInfo.whatsappUrl ? `<a href="${pInfo.whatsappUrl}" target="_blank" class="tl-btn tl-btn-outline" style="height: 22px; font-size: 10px; padding: 0 5px;" title="WhatsApp">💬</a>` : ''}
                    <button class="tl-btn tl-btn-primary" style="height: 22px; font-size: 10px; padding: 0 6px;" onclick="window.openLeadDrawerById('${encodeURIComponent(leadKey)}')">Detalle ↗</button>
                </div>
            </div>
        `;

        card.addEventListener("dragstart", (e) => {
            card.classList.add("dragging");
            e.dataTransfer.setData("text/plain", leadKey);
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

        container.addEventListener("drop", (e) => {
            e.preventDefault();
            container.classList.remove("drag-over");
            const leadKey = e.dataTransfer.getData("text/plain");
            if (!leadKey) return;

            const targetLead = allLeads.find(l => (l.placeID && l.placeID === leadKey) || l.name === leadKey);
            if (targetLead && targetLead.pipeline_stage !== st) {
                targetLead.pipeline_stage = st;
                storageAdapter.set({ leads: allLeads });
                renderKanbanBoard(currentFilteredLeads);
                playAudioNotification("success");
            }
        });
    });

    const btnReset = document.getElementById("btn-kanban-reset-all");
    if (btnReset) {
        btnReset.addEventListener("click", () => {
            if (confirm("¿Deseas reiniciar todos los prospectos al estado 'Nuevo Prospecto'?")) {
                allLeads.forEach(l => { l.pipeline_stage = "nuevo"; });
                storageAdapter.set({ leads: allLeads });
                renderKanbanBoard(currentFilteredLeads);
            }
        });
    }
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

    // MX Deliverability Pill in Drawer
    const mxSpan = document.getElementById("drawer-email-mx");
    if (mxSpan) {
        if (!lead.email) {
            mxSpan.innerHTML = "";
        } else if (lead.mx_status === "valid") {
            mxSpan.innerHTML = `<span class="tl-mx-badge valid" title="${lead.mx_provider || 'Servidor MX Activo'}">✓ MX Activo</span>`;
        } else if (lead.mx_status === "invalid") {
            mxSpan.innerHTML = `<span class="tl-mx-badge invalid" title="${lead.mx_provider || 'Sin servidor MX'}">✕ Sin MX</span>`;
        } else {
            mxSpan.innerHTML = `<button id="btn-drawer-check-mx" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer;">🔍 Validar MX</button>`;
            const btn = document.getElementById("btn-drawer-check-mx");
            if (btn) {
                btn.onclick = async () => {
                    btn.textContent = "⏳...";
                    const res = await verifyDomainMx(lead.email);
                    lead.mx_status = res.valid ? "valid" : "invalid";
                    lead.mx_provider = res.provider;
                    storageAdapter.set({ leads: allLeads });
                    if (table) table.replaceData(currentFilteredLeads);
                    openLeadDrawer(lead);
                };
            }
        }
    }

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

    const distEl = document.getElementById("drawer-distance");
    if (distEl) distEl.textContent = distText;
    const peerEl = document.getElementById("drawer-nearest-peer");
    if (peerEl) {
        peerEl.textContent = lead.nearestPeerName ? 
            `${peerDistText} (${lead.nearestPeerName})` : peerDistText;
    }
    
    // Refresh Outreach Pitch
    updatePitchPreview();

    // Wire White-Label PDF Audit Generator
    const btnPdf = document.getElementById("btn-download-pdf-audit");
    if (btnPdf) {
        btnPdf.onclick = () => {
            if (activeLeadForDrawer) {
                generateLeadPdfAudit(activeLeadForDrawer);
            }
        };
    }

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

// ==========================================
// FEATURE 3: SPEED OUTREACH QUEUE CONTROLLER
// ==========================================
let speedQueue = [];
let speedIndex = 0;

function startSpeedOutreach() {
    const candidates = (currentFilteredLeads && currentFilteredLeads.length > 0) ? currentFilteredLeads : allLeads;
    speedQueue = candidates.filter(l => {
        if (!l || !l.phone) return false;
        const p = formatPhone(l.phone);
        return !!p.whatsappUrl;
    });

    if (speedQueue.length === 0) {
        alert("No se encontraron prospectos con número de teléfono o WhatsApp en la lista actual.");
        return;
    }

    speedIndex = 0;
    const modal = document.getElementById("speed-outreach-modal");
    const backdrop = document.getElementById("tl-modal-backdrop");
    if (modal) modal.classList.add("open");
    if (backdrop) backdrop.classList.add("open");
    renderSpeedLead();
}

function renderSpeedLead() {
    if (speedIndex >= speedQueue.length) {
        alert("🎉 ¡Has completado todos los prospectos de la cola de prospección rápida!");
        closeSpeedOutreach();
        applyFilters();
        return;
    }

    const lead = speedQueue[speedIndex];
    const total = speedQueue.length;

    // Counter & Progress Bar
    const counterEl = document.getElementById("speed-queue-counter");
    if (counterEl) counterEl.textContent = `${speedIndex + 1} / ${total}`;

    const progressFill = document.getElementById("speed-progress-fill");
    if (progressFill) {
        const pct = Math.round(((speedIndex) / total) * 100);
        progressFill.style.width = pct + "%";
    }

    // Lead Details
    const nameEl = document.getElementById("speed-lead-name");
    if (nameEl) nameEl.textContent = lead.name || "Empresa Sin Nombre";

    const metaEl = document.getElementById("speed-lead-meta");
    if (metaEl) {
        const distStr = lead.distanceKm ? ` · 📍 ${lead.distanceKm < 1 ? Math.round(lead.distanceKm * 1000) + 'm' : lead.distanceKm + 'km'}` : "";
        metaEl.textContent = `${lead.category || "General"}${distStr} · ${lead.city || lead.address || "Ubicación detectada"}`;
    }

    const scoreEl = document.getElementById("speed-lead-score");
    if (scoreEl) {
        const score = parseInt(lead.lead_score) || 50;
        scoreEl.textContent = score;
        scoreEl.className = `tl-badge-score ${score >= 75 ? 'tl-score-high' : score < 45 ? 'tl-score-low' : 'tl-score-med'}`;
    }

    const phoneEl = document.getElementById("speed-lead-phone");
    if (phoneEl) phoneEl.textContent = lead.phone || "-";

    // Dynamic Personalized Pitch
    const pitch = generateOutreachPitch(lead, "whatsapp");
    const pitchBox = document.getElementById("speed-pitch-box");
    if (pitchBox) pitchBox.textContent = pitch;
}

function sendSpeedAndAdvance() {
    if (speedIndex >= speedQueue.length) return;
    const lead = speedQueue[speedIndex];
    const pitchBox = document.getElementById("speed-pitch-box");
    const pitch = pitchBox ? pitchBox.textContent : generateOutreachPitch(lead, "whatsapp");

    const pInfo = formatPhone(lead.phone);
    if (pInfo.whatsappUrl) {
        window.open(`${pInfo.whatsappUrl}?text=${encodeURIComponent(pitch)}`, "_blank");
    }

    // Advance Stage to Contacted in CRM Pipeline
    lead.pipeline_stage = "contactado";
    storageAdapter.set({ leads: allLeads }, () => {
        renderKanbanBoard(currentFilteredLeads);
    });

    playAudioNotification("success");
    speedIndex++;
    renderSpeedLead();
}

function skipSpeedLead() {
    speedIndex++;
    renderSpeedLead();
}

function closeSpeedOutreach() {
    const modal = document.getElementById("speed-outreach-modal");
    const backdrop = document.getElementById("tl-modal-backdrop");
    if (modal) modal.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
}

// ==========================================
// FEATURE 4: LIVE DNS MX BULK VERIFICATION
// ==========================================
async function verifyAllLeadsMx() {
    const targets = (currentFilteredLeads && currentFilteredLeads.length > 0) ? currentFilteredLeads : allLeads;
    const emailLeads = targets.filter(l => l.email && l.email.includes("@"));

    if (emailLeads.length === 0) {
        alert("No se encontraron prospectos con correo electrónico en la vista actual.");
        return;
    }

    const btn = document.getElementById("btn-verify-all-emails");
    const originalText = btn ? btn.textContent : "";
    if (btn) {
        btn.disabled = true;
        btn.textContent = `⏳ Validando 0/${emailLeads.length}...`;
    }

    let checked = 0;
    for (const lead of emailLeads) {
        const res = await verifyDomainMx(lead.email);
        lead.mx_status = res.valid ? "valid" : "invalid";
        lead.mx_provider = res.provider;
        checked++;
        if (btn) btn.textContent = `⏳ Validando ${checked}/${emailLeads.length}...`;
    }

    storageAdapter.set({ leads: allLeads }, () => {
        if (table) table.replaceData(currentFilteredLeads);
        if (btn) {
            btn.textContent = "✅ ¡Emails Validados!";
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2500);
        }
        playAudioNotification("success");
    });
}

/**
 * Silicon Valley Grade Theme Manager (Modo Claro & Modo Oscuro)
 */
function initThemeManager() {
    const savedTheme = localStorage.getItem("atlasiq-theme") || "light";
    setTheme(savedTheme);

    const toggleBtn = document.getElementById("btn-toggle-theme");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
            const nextTheme = currentTheme === "dark" ? "light" : "dark";
            setTheme(nextTheme);
        });
    }
}

function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("atlasiq-theme", theme);

    const toggleBtn = document.getElementById("btn-toggle-theme");
    if (toggleBtn) {
        if (theme === "dark") {
            toggleBtn.innerHTML = "☀️ Modo Claro";
            toggleBtn.setAttribute("title", "Cambiar a Modo Claro");
        } else {
            toggleBtn.innerHTML = "🌙 Modo Oscuro";
            toggleBtn.setAttribute("title", "Cambiar a Modo Oscuro");
        }
    }

    // Adapt Leaflet Map tile layer dynamically if map exists
    if (typeof setMapTileLayer === "function" && leafletMap) {
        setMapTileLayer(theme);
    }
}

// DOM Ready Initializer
document.addEventListener("DOMContentLoaded", () => {
    initThemeManager();
    initTable();
    initLocationAndDistances();
    loadDashboardData();
    if (typeof initLicenseUi === "function") initLicenseUi();

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

    // VIEW SWITCHER TABS
    const tabTable = document.getElementById("tab-view-table");
    const tabMap = document.getElementById("tab-view-map");
    const tabKanban = document.getElementById("tab-view-kanban");
    const viewTable = document.getElementById("view-section-table");
    const viewMap = document.getElementById("view-section-map");
    const viewKanban = document.getElementById("view-section-kanban");

    function setActiveView(activeTab, activeView) {
        [tabTable, tabMap, tabKanban].forEach(t => t && t.classList.remove("active"));
        [viewTable, viewMap, viewKanban].forEach(v => v && (v.style.display = "none"));
        if (activeTab) activeTab.classList.add("active");
        if (activeView) activeView.style.display = "block";
    }

    if (tabTable) {
        tabTable.addEventListener("click", () => {
            setActiveView(tabTable, viewTable);
        });
    }

    if (tabMap) {
        tabMap.addEventListener("click", () => {
            setActiveView(tabMap, viewMap);
            if (!leafletMap) initLeafletMap();
            setTimeout(() => {
                if (leafletMap) {
                    leafletMap.invalidateSize();
                    updateMapData(currentFilteredLeads);
                }
            }, 100);
        });
    }

    if (tabKanban) {
        tabKanban.addEventListener("click", () => {
            setActiveView(tabKanban, viewKanban);
            renderKanbanBoard(currentFilteredLeads);
        });
    }

    initKanbanDropzones();

    // Map checkboxes & Recenter
    const checkHeatmap = document.getElementById("check-map-heatmap");
    if (checkHeatmap) checkHeatmap.addEventListener("change", () => updateMapData(currentFilteredLeads));

    const checkMarkers = document.getElementById("check-map-markers");
    if (checkMarkers) checkMarkers.addEventListener("change", () => updateMapData(currentFilteredLeads));

    const btnRecenter = document.getElementById("btn-map-recenter");
    if (btnRecenter) {
        btnRecenter.addEventListener("click", () => {
            if (leafletMap) updateMapData(currentFilteredLeads);
        });
    }

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
        const isHidden = window.getComputedStyle(satPanel).display === "none";
        satPanel.style.display = isHidden ? "block" : "none";
        if (isHidden) {
            updateMarketSaturationView(document.getElementById("filter-niche")?.value || "all");
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
            currentPitchChannel = tab.getAttribute("data-channel") || "whatsapp";

            const geminiControls = document.getElementById("gemini-controls");
            const standardActions = document.getElementById("standard-pitch-actions");
            if (currentPitchChannel === "gemini") {
                if (geminiControls) geminiControls.style.display = "block";
                if (standardActions) standardActions.style.display = "none";
                document.getElementById("drawer-pitch-text").textContent = "Haz clic en el botón de abajo para generar una auditoría y guión de ventas personalizado con Google Gemini.";
            } else {
                if (geminiControls) geminiControls.style.display = "none";
                if (standardActions) standardActions.style.display = "flex";
                updatePitchPreview();
            }
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
        const backdrop = document.getElementById("tl-modal-backdrop");
        if (backdrop) backdrop.classList.add("open");
    });
    document.getElementById("btn-modal-cancel").addEventListener("click", () => {
        document.getElementById("settings-modal").classList.remove("open");
        const backdrop = document.getElementById("tl-modal-backdrop");
        if (backdrop) backdrop.classList.remove("open");
    });
    document.getElementById("btn-modal-save").addEventListener("click", () => {
        const url = document.getElementById("setting-webhook-url").value.trim();
        const geminiKey = document.getElementById("setting-gemini-key").value.trim();
        storageAdapter.set({ tl_webhook_url: url, tl_gemini_key: geminiKey }, () => {
            alert("Ajustes guardados correctamente.");
            document.getElementById("settings-modal").classList.remove("open");
            const backdrop = document.getElementById("tl-modal-backdrop");
            if (backdrop) backdrop.classList.remove("open");
        });
    });

    // SPEED OUTREACH LISTENERS
    const btnStartSpeed = document.getElementById("btn-start-speed-outreach");
    if (btnStartSpeed) btnStartSpeed.addEventListener("click", startSpeedOutreach);

    const btnSpeedClose = document.getElementById("btn-speed-close");
    if (btnSpeedClose) btnSpeedClose.addEventListener("click", closeSpeedOutreach);

    const btnSpeedSkip = document.getElementById("btn-speed-skip");
    if (btnSpeedSkip) btnSpeedSkip.addEventListener("click", skipSpeedLead);

    const btnSpeedNext = document.getElementById("btn-speed-send-next");
    if (btnSpeedNext) btnSpeedNext.addEventListener("click", sendSpeedAndAdvance);

    // LIVE DNS MX BULK VERIFICATION LISTENER
    const btnVerifyAllMx = document.getElementById("btn-verify-all-emails");
    if (btnVerifyAllMx) btnVerifyAllMx.addEventListener("click", verifyAllLeadsMx);

    // UNIVERSAL MODAL BACKDROP LISTENER
    const modalBackdrop = document.getElementById("tl-modal-backdrop");
    if (modalBackdrop) {
        modalBackdrop.addEventListener("click", () => {
            closeSpeedOutreach();
            const setModal = document.getElementById("settings-modal");
            if (setModal) setModal.classList.remove("open");
            modalBackdrop.classList.remove("open");
        });
    }

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
