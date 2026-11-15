/**
 * AtlasIQ Enterprise v4.5 - CSP-Safe Standalone Landing & Guide UI Controller
 */
(function () {
    var SUN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
    var MOON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

    function updateThemeBtn(theme) {
        var btn = document.getElementById("btn-toggle-theme");
        if (btn) {
            btn.innerHTML = theme === "dark"
                ? SUN_SVG + " <span>Modo Claro</span>"
                : MOON_SVG + " <span>Modo Oscuro</span>";
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        var currentTheme = "dark";
        try {
            currentTheme = localStorage.getItem("atlasiq-theme") || "dark";
        } catch (e) {}
        document.documentElement.setAttribute("data-theme", currentTheme);
        updateThemeBtn(currentTheme);

        var btn = document.getElementById("btn-toggle-theme");
        if (btn) {
            btn.addEventListener("click", function () {
                var active = document.documentElement.getAttribute("data-theme") || "dark";
                var next = active === "dark" ? "light" : "dark";
                document.documentElement.setAttribute("data-theme", next);
                try {
                    localStorage.setItem("atlasiq-theme", next);
                } catch (e) {}
                updateThemeBtn(next);
            });
        }

        // Show direct extension ZIP download buttons when hosted on web (https://atlasiq.windowstelecom.com)
        if (window.location.protocol === "https:" || window.location.protocol === "http:") {
            var dlBtn = document.getElementById("btn-download-ext-zip");
            if (dlBtn) dlBtn.style.display = "inline-flex";
            var extraBtns = document.querySelectorAll(".js-ext-download-btn");
            for (var i = 0; i < extraBtns.length; i++) {
                extraBtns[i].style.display = "inline-flex";
            }
        }
    });
})();
