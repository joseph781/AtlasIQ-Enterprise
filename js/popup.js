/**
 * AtlasIQ Enterprise - Popup Controller
 */

document.addEventListener("DOMContentLoaded", () => {
    // Load stored leads count
    chrome.storage.local.get(["leads"], (data) => {
        const count = (data.leads || []).length;
        document.getElementById("stored-leads-count").textContent = count.toLocaleString();
    });

    const searchInput = document.getElementById("query-input");

    // Category chips
    document.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const prefix = chip.getAttribute("data-query");
            searchInput.value = prefix;
            searchInput.focus();
        });
    });

    // Search button
    document.getElementById("search-btn").addEventListener("click", () => {
        const query = (searchInput.value || "").trim();
        if (query) {
            chrome.tabs.create({
                url: "https://www.google.com/maps/search/" + encodeURIComponent(query)
            });
        }
    });

    // Open CRM Dashboard
    document.getElementById("open-crm-btn").addEventListener("click", () => {
        chrome.tabs.create({ url: "dashboard.html" });
    });
});
