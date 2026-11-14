/**
 * AtlasIQ Enterprise v4.0 - MAIN World Deep RPC & Reviews Stream Interceptor
 * Captures Search Feeds, Place Detail Streams, and UGC Review Payloads directly from network transport.
 */
(function () {
    if (window.__atlasiq_network_hooked) return;
    window.__atlasiq_network_hooked = true;

    console.info(
        "%c[AtlasIQ Enterprise v4.0]%c Deep RPC + Reviews Network Layer Active (MAIN World)",
        "color:#3b82f6;font-weight:800;",
        "color:#10b981;font-weight:700;"
    );

    const searchDataHistory = [];
    const MAX_HISTORY = 75;

    function classifyMapsUrl(url) {
        if (!url) return null;
        const u = url.toString().toLowerCase();
        if (u.includes("listugcposts") || u.includes("reviews")) return "reviews";
        if (u.includes("/maps/preview/place") || u.includes("place?")) return "place_detail";
        if (
            u.includes("/search") ||
            u.includes("/maps/rpc") ||
            u.includes("batchexecute") ||
            u.includes("/maps/preview") ||
            u.includes("search?") ||
            u.includes("listentities") ||
            u.includes("viewport")
        ) {
            return "search_feed";
        }
        return null;
    }

    function broadcastData(data, url, source, streamKind) {
        if (!data || typeof data !== "string" || data.length < 50) return;

        const packet = {
            type: "atlasiq_search_data",
            streamKind: streamKind || "search_feed",
            data,
            url,
            source,
            timestamp: Date.now()
        };

        searchDataHistory.push(packet);
        if (searchDataHistory.length > MAX_HISTORY) searchDataHistory.shift();

        try {
            window.postMessage(packet, "*");
        } catch (err) {}
    }

    window.addEventListener("message", function (event) {
        if (!event.data) return;
        if (event.data.type === "atlasiq_request_history" || event.data.type === "request_history") {
            searchDataHistory.forEach((pkt) => {
                try {
                    window.postMessage({ ...pkt, source: "history" }, "*");
                } catch (e) {}
            });
        }
    });

    // 1. Hook XMLHttpRequest
    try {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this._atlasiq_url = url ? url.toString() : "";
            return origOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function () {
            const handleDone = () => {
                try {
                    if (this.readyState === 4 && (this.status === 200 || this.status === 0)) {
                        const url = this._atlasiq_url || "";
                        const kind = classifyMapsUrl(url);
                        if (kind && typeof this.responseText === "string") {
                            broadcastData(this.responseText, url, "xhr", kind);
                        }
                    }
                } catch (e) {}
            };
            this.addEventListener("load", handleDone, false);
            return origSend.apply(this, arguments);
        };
    } catch (err) {}

    // 2. Hook Fetch API
    try {
        if (window.fetch) {
            const origFetch = window.fetch;
            window.fetch = async function (...args) {
                const response = await origFetch.apply(this, args);
                try {
                    let url = "";
                    if (typeof args[0] === "string") url = args[0];
                    else if (args[0] && args[0].url) url = args[0].url;

                    const kind = classifyMapsUrl(url);
                    if (kind) {
                        response.clone().text().then((txt) => {
                            broadcastData(txt, url, "fetch", kind);
                        }).catch(() => {});
                    }
                } catch (e) {}
                return response;
            };
        }
    } catch (err) {}
})();
