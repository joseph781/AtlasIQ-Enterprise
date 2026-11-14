/**
 * AtlasIQ Enterprise v4.0 - Native Chrome SidePanel Copilot Controller
 * CSP-Clean & XSS-Safe Live Prospect Stream
 */
(function () {
    let spLeads = [];
    let spFilter = "all";

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
            feedEl.innerHTML = `<div style="text-align:center;color:var(--sub);font-size:12px;padding:24px 8px;">Abre Google Maps, realiza una búsqueda y pulsa <strong>Lanzar Extracción</strong>.</div>`;
            return;
        }

        feedEl.innerHTML = filtered.slice(0, 60).map((l) => {
            const score = parseInt(l.lead_score) || 50;
            const pInfo = typeof formatPhone === "function" ? formatPhone(l.phone) : { whatsappUrl: "" };
            const pitch = typeof generateOutreachPitch === "function" ? generateOutreachPitch(l, "whatsapp") : "";
            const waHref = pInfo.whatsappUrl ? `${pInfo.whatsappUrl}?text=${encodeURIComponent(pitch)}` : "";

            const badges = [];
            if (!l.website) badges.push("Sin Web");
            if (l.unclaimed) badges.push("No Reclamado");
            if (l.email) badges.push("✉️ Email");
            if (l.ad_spend_active) badges.push("💰 Ads Activos");

            return `
                <div class="lead-item">
                    <div class="lead-top">
                        <div class="lead-name">${esc(l.name)}</div>
                        <span class="score-pill">${score}</span>
                    </div>
                    <div class="lead-meta">★ ${esc(l.averageRating || "-")} (${esc(l.reviewCount || 0)}) · ${esc(l.category || "Comercio")}</div>
                    ${badges.length ? `<div class="lead-badges">${badges.map(b => `<span class="mini-badge">${esc(b)}</span>`).join("")}</div>` : ""}
                    <div class="lead-actions">
                        ${waHref ? `<a class="mini-btn wa" href="${esc(waHref)}" target="_blank">💬 WhatsApp</a>` : ""}
                        ${l.website ? `<a class="mini-btn" href="${esc(l.website)}" target="_blank">🌐 Web</a>` : ""}
                    </div>
                </div>
            `;
        }).join("");
    }

    function refreshFromStorage() {
        chrome.storage.local.get(["leads"], (res) => {
            spLeads = Array.isArray(res?.leads) ? res.leads : [];
            renderSidePanel();
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        refreshFromStorage();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local" && changes.leads) {
                spLeads = Array.isArray(changes.leads.newValue) ? changes.leads.newValue : [];
                renderSidePanel();
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

        const btnStart = document.getElementById("sp-btn-start");
        const btnStop = document.getElementById("sp-btn-stop");

        btnStart.addEventListener("click", () => {
            const gridMode = document.getElementById("sp-grid").value;
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const activeTab = tabs[0];
                if (!activeTab || !activeTab.url || !activeTab.url.includes("/maps")) {
                    chrome.tabs.create({ url: "https://www.google.com/maps/search/Restaurantes" });
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
