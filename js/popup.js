/**
 * AtlasIQ Enterprise v4.0 - Popup Controller (Location-First Reference Engine)
 */
document.addEventListener("DOMContentLoaded", () => {
    let referenceMode = "gps"; // "gps" (default first option) | "city"
    let currentCoords = null;

    chrome.storage.local.get(["leads", "user_location"], (data) => {
        const count = (data.leads || []).length;
        document.getElementById("stored-leads-count").textContent = count.toLocaleString();
        if (data.user_location && data.user_location.lat && data.user_location.lon) {
            currentCoords = data.user_location;
            renderGpsStatus(currentCoords);
        }
        acquireLocation(false);
    });

    const searchInput = document.getElementById("query-input");
    const searchBtn = document.getElementById("search-btn");
    const gpsStrip = document.getElementById("gps-status-strip");
    const gpsText = document.getElementById("gps-status-text");
    const modeGpsBtn = document.getElementById("mode-gps-btn");
    const modeCityBtn = document.getElementById("mode-city-btn");
    const gridSelect = document.getElementById("popup-grid-select");
    const autoStartCheck = document.getElementById("popup-autostart");

    function renderGpsStatus(loc) {
        if (!loc || !loc.lat || !loc.lon) {
            gpsText.innerHTML = `${atqIcon("alert", 12)} <span>Ubicación pendiente — pulsa ↻ GPS</span>`;
            return;
        }
        const tag = escapeHtml(loc.source === "gps" ? "GPS Exacto" : (loc.city || "Ubicación IP"));
        gpsText.innerHTML = `${atqIcon("mapPin", 12)} <span>Punto Cero: ${Number(loc.lat).toFixed(4)}, ${Number(loc.lon).toFixed(4)} (${tag})</span>`;
    }

    function acquireLocation(highAccuracy = true) {
        gpsText.innerHTML = `${atqIcon("clock", 12)} <span>Obteniendo coordenadas de referencia...</span>`;
        if (typeof detectUserLocation === "function") {
            detectUserLocation((loc) => {
                if (loc && loc.lat && loc.lon) {
                    currentCoords = loc;
                    chrome.storage.local.set({ user_location: loc });
                    renderGpsStatus(loc);
                } else {
                    chrome.runtime.sendMessage({ action: "resolveUserLocation", forceRefresh: highAccuracy }, (res) => {
                        if (res?.location) {
                            currentCoords = res.location;
                            renderGpsStatus(currentCoords);
                        } else {
                            renderGpsStatus(currentCoords);
                        }
                    });
                }
            }, { highAccuracy });
        }
    }

    function applyModeUI() {
        if (referenceMode === "gps") {
            modeGpsBtn.classList.add("active");
            modeCityBtn.classList.remove("active");
            gpsStrip.style.display = "flex";
            searchInput.placeholder = "¿Qué buscas cerca de ti? Ej: Clínicas dentales";
            if (/^.+ en $/i.test(searchInput.value) || searchInput.value === "Clínicas dentales en Madrid") {
                searchInput.value = searchInput.value.replace(/\s+en(\s+Madrid)?$/i, "").trim() || "Clínicas dentales";
            }
            searchBtn.innerHTML = `${atqIcon("mapPin", 14)} Escanear desde Mi Ubicación Actual`;
            searchBtn.className = "btn btn-success";
        } else {
            modeCityBtn.classList.add("active");
            modeGpsBtn.classList.remove("active");
            gpsStrip.style.display = "none";
            searchInput.placeholder = "Ej: Clínicas dentales en Madrid";
            if (searchInput.value === "Clínicas dentales") {
                searchInput.value = "Clínicas dentales en Madrid";
            }
            searchBtn.innerHTML = `${atqIcon("globe", 14)} Lanzar Scrapeo en Ciudad Indicada`;
            searchBtn.className = "btn btn-primary";
        }
    }

    modeGpsBtn.addEventListener("click", () => {
        referenceMode = "gps";
        applyModeUI();
    });

    modeCityBtn.addEventListener("click", () => {
        referenceMode = "city";
        applyModeUI();
    });

    document.getElementById("btn-refresh-gps").addEventListener("click", () => acquireLocation(true));

    document.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            const niche = chip.getAttribute("data-niche") || "";
            searchInput.value = referenceMode === "gps" ? niche : `${niche} en `;
            searchInput.focus();
        });
    });

    async function launchMission() {
        const query = (searchInput.value || "").trim();
        if (!query) {
            searchInput.focus();
            return;
        }

        const selectedOption = gridSelect.options[gridSelect.selectedIndex];
        const gridMode = gridSelect.value || "single";
        const zoom = parseInt(selectedOption?.getAttribute("data-zoom") || "15", 10);
        const autoStart = Boolean(autoStartCheck.checked);

        if (referenceMode === "gps") {
            searchBtn.disabled = true;
            searchBtn.innerHTML = `${atqIcon("clock", 14)} Fijando tu ubicación...`;

            if (!currentCoords || !currentCoords.lat || !currentCoords.lon) {
                await new Promise((resolve) => {
                    detectUserLocation((loc) => {
                        if (loc && loc.lat && loc.lon) {
                            currentCoords = loc;
                            chrome.storage.local.set({ user_location: loc });
                        }
                        resolve();
                    }, { highAccuracy: true });
                });
            }

            searchBtn.disabled = false;
            applyModeUI();

            if (currentCoords && currentCoords.lat && currentCoords.lon) {
                const lat = Number(currentCoords.lat);
                const lon = Number(currentCoords.lon);
                const mission = {
                    autoStart,
                    useMyLocation: true,
                    lat,
                    lon,
                    zoom,
                    gridMode,
                    query,
                    createdAt: Date.now()
                };
                chrome.storage.local.set({ atlasiq_pending_mission: mission, user_location: currentCoords }, () => {
                    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${lat.toFixed(6)},${lon.toFixed(6)},${zoom}z/data=!3m1!4b1`;
                    chrome.tabs.create({ url });
                });
                return;
            }
        }

        // Fallback or Explicit Manual City Mode
        const mission = {
            autoStart,
            useMyLocation: false,
            gridMode,
            query,
            createdAt: Date.now()
        };
        chrome.storage.local.set({ atlasiq_pending_mission: mission }, () => {
            chrome.tabs.create({
                url: "https://www.google.com/maps/search/" + encodeURIComponent(query)
            });
        });
    }

    searchBtn.addEventListener("click", launchMission);
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") launchMission();
    });

    document.getElementById("open-crm-btn").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "openPage" });
    });

    const spBtn = document.getElementById("open-sidepanel-btn");
    if (spBtn) {
        spBtn.addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "openSidePanel" });
            window.close();
        });
    }

    if (typeof checkCurrentLicense === "function") {
        checkCurrentLicense().then((lic) => {
            const statusEl = document.getElementById("popup-license-status");
            const btnEl = document.getElementById("btn-popup-license-open");
            if (statusEl) {
                if (lic.active) {
                    statusEl.innerHTML = `${atqIcon("shield", 13)} <span>ECDSA Activa (${lic.daysRemaining}d)</span>`;
                    statusEl.style.color = "#10b981";
                    if (btnEl) btnEl.textContent = "Ver";
                } else {
                    statusEl.innerHTML = `${atqIcon("alert", 13)} <span>Activación Requerida</span>`;
                    statusEl.style.color = "#ef4444";
                    if (btnEl) {
                        btnEl.textContent = "Activar";
                        btnEl.style.borderColor = "#ef4444";
                        btnEl.style.color = "#ef4444";
                    }
                }
            }
        });
    }

    const openLicBtn = document.getElementById("btn-popup-license-open");
    if (openLicBtn) {
        openLicBtn.addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "openPage" });
        });
    }
});
