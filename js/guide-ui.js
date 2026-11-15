/**
 * AtlasIQ Enterprise v4.5 - CSP-Safe Standalone Landing & Guide UI Controller
 */
(function () {
    function updateThemeBtn(theme) {
        var btn = document.getElementById("btn-toggle-theme");
        if (btn) {
            btn.textContent = theme === "dark" ? "☀️ Modo Claro" : "🌙 Modo Oscuro";
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
