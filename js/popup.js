/**
 * AtlasIQ Enterprise v4.0 - Popup Controller (CSP-Safe)
 */
document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["leads"], (data) => {
        const count = (data.leads || []).length;
        document.getElementById("stored-leads-count").textContent = count.toLocaleString();
    });

    const searchInput = document.getElementById("query-input");

    document.querySelectorAll(".chip").forEach((chip) => {
        chip.addEventListener("click", () => {
            searchInput.value = chip.getAttribute("data-query") || "";
            searchInput.focus();
        });
    });

    document.getElementById("search-btn").addEventListener("click", () => {
        const query = (searchInput.value || "").trim();
        if (query) {
            chrome.tabs.create({
                url: "https://www.google.com/maps/search/" + encodeURIComponent(query)
            });
        }
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
                    statusEl.textContent = `🛡️ ECDSA Activa (${lic.daysRemaining}d)`;
                    statusEl.style.color = "#10b981";
                    if (btnEl) btnEl.textContent = "Ver";
                } else {
                    statusEl.textContent = "⚠️ Activación Requerida";
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
