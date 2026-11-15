/**
 * AtlasIQ Enterprise v4.0 - Native Chrome SidePanel Copilot Controller
 * CSP-Clean, XSS-Safe & Location-First Reference Launcher
 */
(function () {
    let spLeads = [];
    let spFilter = "all";
    let spUserLoc = null;

    function esc(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function renderSidePanel() {
        const total = spLeads.length;
        const emails = spLeads.filter(l => l.email && l.email.includes("@")).length;
        const hot = spLeads.filter(l => (parseInt(l.lead_score) || 0) >= 75).length;

        document.getElementById("sp-total").textContent = total.toLocaleString();
        document.getElementById("sp-emails").textContent = emails.toLocaleString();
        document.getElementById("sp-hot").textContent = hot.toLocaleString();

        let filtered = spLeads.slice().reverse();
        if (spFilter === "hot") filtered = filtered.filter(l => (parseInt(l.lead_score) || 0) >= 75);
        else if (spFilter === "noweb") filtered = filtered.filter(l => !l.website);
        else if (spFilter === "unclaimed") filtered = filtered.filter(l => l.unclaimed);

        const feedEl = document.getElementById("sp-feed");
        if (!filtered.length) {
            feedEl.innerHTML = `<div style="text-align:center;color:var(--sub);font-size:12px;padding:20px 8px;">Escribe qué buscas arriba y pulsa <strong>📍 1. Escanear desde Mi Ubicación</strong> para comenzar en tu zona.</div>`;
            return;
        }

        feedEl.innerHTML = filtered.slice(0, 60).map((l) => {
            const score = parseInt(l.lead_score) || 50;
            const pInfo = typeof formatPhone === "function" ? formatPhone(l.phone) : { whatsappUrl: "" };
            const pitch = typeof generateOutreachPitch === "function" ? generateOutreachPitch(l, "whatsapp") : "";
            const waHref = pInfo.whatsappUrl ? `${pInfo.whatsappUrl}?text=${encodeURIComponent(pitch)}` : "";

            let distLabel = "";
            if (spUserLoc && l.latitude && l.longitude && typeof haversineDistance === "function") {
                const d = haversineDistance(spUserLoc.lat, spUserLoc.lon, l.latitude, l.longitude);
                if (d !== null) {
                    distLabel = ` · 📍 ${d < 1 ? Math.round(d * 1000) + " m" : d.toFixed(1) + " km"}`;
                }
            }

            const badges = [];
            const ws = typeof classifyWebsiteStatus === "function" ? classifyWebsiteStatus(l) : null;
            const econ = typeof estimateNicheRevenueLeak === "function" ? estimateNicheRevenueLeak(l) : null;
            if (!l.website) badges.push("🚨 Sin Web");
            else if (ws && ws.status === "social_link") badges.push("⚠️ Falsa Web");
            else if (ws && ws.status === "broken") badges.push("💀 Web Caída");
            if (l.offer_type === "automation") badges.push("🤖 Vender Bot IA");
            else if (l.offer_type === "combo") badges.push("🚀 Web + Bot IA");
            if (econ && econ.monthlyLeakUsd) badges.push(`💸 -$${(econ.monthlyLeakUsd / 1000).toFixed(1)}k/m`);
            if (l.commission_bleed) badges.push("🩸 App Comisión");
            if (l.email) badges.push("✉️ Email");

            return `
                <div class="lead-item">
                    <div class="lead-top">
                        <div class="lead-name">${esc(l.name)}</div>
                        <span class="score-pill">${score}</span>
                    </div>
                    <div class="lead-meta">★ ${esc(l.averageRating || "-")} (${esc(l.reviewCount || 0)}) · ${esc(l.category || "Comercio")}${esc(distLabel)}</div>
                    ${badges.length ? `<div class="lead-badges">${badges.map(b => `<span class="mini-badge">${esc(b)}</span>`).join("")}</div>` : ""}
                    <div class="lead-actions">
                        ${waHref ? `<a class="mini-btn wa" href="${esc(waHref)}" target="_blank">💬 WhatsApp</a>` : ""}
                        ${l.website ? `<a class="mini-btn" href="${esc(l.website)}" target="_blank">🌐 Web</a>` : ""}
                    </div>
                </div>
            `;
        }).join("");
    }

    function updateGpsPill(loc) {
        const el = document.getElementById("sp-gps-label");
        if (!el || !loc || !loc.lat) return;
        const src = loc.source === "gps" ? "GPS" : (loc.city || "IP");
        el.textContent = `📍 Punto Cero: ${Number(loc.lat).toFixed(4)}, ${Number(loc.lon).toFixed(4)} (${src})`;
    }

    function refreshFromStorage() {
        chrome.storage.local.get(["leads", "user_location"], (res) => {
            spLeads = Array.isArray(res?.leads) ? res.leads : [];
            if (res?.user_location) {
                spUserLoc = res.user_location;
                updateGpsPill(spUserLoc);
            }
            renderSidePanel();
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        refreshFromStorage();

        if (typeof detectUserLocation === "function") {
            detectUserLocation((loc) => {
                if (loc && loc.lat && loc.lon) {
                    spUserLoc = loc;
                    chrome.storage.local.set({ user_location: loc });
                    updateGpsPill(loc);
                    renderSidePanel();
                }
            }, { highAccuracy: true });
        }

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local") {
                if (changes.leads) {
                    spLeads = Array.isArray(changes.leads.newValue) ? changes.leads.newValue : [];
                    renderSidePanel();
                }
                if (changes.user_location && changes.user_location.newValue) {
                    spUserLoc = changes.user_location.newValue;
                    updateGpsPill(spUserLoc);
                    renderSidePanel();
                }
            }
        });

        document.querySelectorAll(".chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                spFilter = chip.getAttribute("data-flt") || "all";
                renderSidePanel();
            });
        });

        document.getElementById("sp-btn-crm").addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "openPage" });
        });

        const btnGpsStart = document.getElementById("sp-btn-gps-start");
        const btnStart = document.getElementById("sp-btn-start");
        const btnStop = document.getElementById("sp-btn-stop");

        btnGpsStart.addEventListener("click", async () => {
            const query = (document.getElementById("sp-niche").value || "").trim() || "Negocios";
            const gridMode = document.getElementById("sp-grid").value || "single";
            const zoom = gridMode === "single" ? 15 : (gridMode === "2x2" ? 14 : 13);

            if (!spUserLoc || !spUserLoc.lat || !spUserLoc.lon) {
                btnGpsStart.textContent = "⏳ Obteniendo GPS...";
                await new Promise((resolve) => {
                    detectUserLocation((loc) => {
                        if (loc) spUserLoc = loc;
                        resolve();
                    }, { highAccuracy: true });
                });
                btnGpsStart.textContent = "📍 1. Escanear desde Mi Ubicación";
            }

            if (!spUserLoc || !spUserLoc.lat || !spUserLoc.lon) {
                alert("No se pudo obtener tu ubicación actual. Revisa los permisos de ubicación.");
                return;
            }

            const lat = Number(spUserLoc.lat);
            const lon = Number(spUserLoc.lon);
            const mission = {
                autoStart: true,
                useMyLocation: true,
                lat,
                lon,
                zoom,
                gridMode,
                query,
                createdAt: Date.now()
            };

            chrome.storage.local.set({ atlasiq_pending_mission: mission, user_location: spUserLoc }, () => {
                const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat.toFixed(6)},${lon.toFixed(6)},${zoom}z/data=!3m1!4b1`;
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const activeTab = tabs[0];
                    if (activeTab && activeTab.id && activeTab.url && activeTab.url.includes("google.")) {
                        chrome.tabs.update(activeTab.id, { url: targetUrl });
                    } else {
                        chrome.tabs.create({ url: targetUrl });
                    }
                    btnStop.style.display = "flex";
                });
            });
        });

        btnStart.addEventListener("click", () => {
            const gridMode = document.getElementById("sp-grid").value;
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                if (!activeTab || !activeTab.url || !activeTab.url.includes("/maps")) {
                    btnGpsStart.click();
                    return;
                }
                chrome.tabs.sendMessage(activeTab.id, { action: "remoteStartHarvester", gridMode }, () => {
                    btnStart.style.display = "none";
                    btnStop.style.display = "flex";
                });
            });
        });

        btnStop.addEventListener("click", () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                if (activeTab?.id) {
                    chrome.tabs.sendMessage(activeTab.id, { action: "remoteStopHarvester" });
                }
                btnStop.style.display = "none";
                btnStart.style.display = "flex";
            });
        });
    });
})();
