/**
 * AtlasIQ Enterprise v4.0 - CSP-Safe Theme Preloader
 * Prevents FOUC (Flash of Unstyled Content) while strictly complying with Chrome MV3 script-src 'self'.
 */
(function () {
    try {
        var savedTheme = localStorage.getItem("atlasiq-theme") || "dark";
        document.documentElement.setAttribute("data-theme", savedTheme);
    } catch (e) {
        document.documentElement.setAttribute("data-theme", "dark");
    }
})();
