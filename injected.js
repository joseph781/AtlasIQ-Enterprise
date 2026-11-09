/**
 * AtlasIQ Professional - MAIN World Network Interceptor
 * Grade: Silicon Valley Enterprise
 * 
 * Captures high-frequency Google Maps RPC Protobuf/JSON streams directly from the network layer.
 * Eliminates DOM lag, bypasses class name obfuscation, and extracts complete lead metadata.
 */
(function() {
  if (window.__atlasiq_network_hooked) return;
  window.__atlasiq_network_hooked = true;

  console.info("%c[AtlasIQ Enterprise]%c Network Interception Layer Active (MAIN World)", "color:#2563eb;font-weight:bold;", "color:#10b981;font-weight:bold;");

  const searchDataHistory = [];
  const MAX_HISTORY = 40;

  function isMapsSearchUrl(url) {
    if (!url) return false;
    const u = url.toString().toLowerCase();
    return u.includes("/search") || 
           u.includes("/maps/rpc") || 
           u.includes("batchexecute") || 
           u.includes("/maps/preview") ||
           u.includes("search?") ||
           u.includes("viewport");
  }

  function broadcastData(data, url, source) {
    if (!data || typeof data !== "string" || data.length < 50) return;
    
    // Save to ring buffer
    searchDataHistory.push({ data, url, source, timestamp: Date.now() });
    if (searchDataHistory.length > MAX_HISTORY) searchDataHistory.shift();

    try {
      window.postMessage({
        type: "atlasiq_search_data",
        data: data,
        url: url,
        source: source,
        timestamp: Date.now()
      }, "*");
    } catch (err) {
      console.warn("[AtlasIQ] postMessage error:", err);
    }
  }

  // Answer requests for buffered search data
  window.addEventListener("message", function(event) {
    if (!event.data) return;
    if (event.data.type === "atlasiq_request_history" || event.data.type === "request_history") {
      searchDataHistory.forEach(item => {
        try {
          window.postMessage({
            type: "atlasiq_search_data",
            data: item.data,
            url: item.url,
            source: "history",
            timestamp: item.timestamp
          }, "*");
        } catch (e) {}
      });
    }
  });

  // 1. Intercept XMLHttpRequest
  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._atlasiq_url = url ? url.toString() : "";
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
      const handleState = () => {
        try {
          if (this.readyState === 4 && (this.status === 200 || this.status === 0)) {
            const url = this._atlasiq_url || "";
            if (isMapsSearchUrl(url)) {
              broadcastData(this.responseText, url, "xhr");
            }
          }
        } catch (e) {
          // Silent catch to prevent interference with Maps
        }
      };

      this.addEventListener("readystatechange", handleState, false);
      this.addEventListener("load", handleState, false);
      return origSend.apply(this, arguments);
    };
  } catch (err) {
    console.error("[AtlasIQ] Error hooking XMLHttpRequest:", err);
  }

  // 2. Intercept Fetch API
  try {
    if (window.fetch) {
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const response = await origFetch.apply(this, args);
        try {
          let url = "";
          if (typeof args[0] === "string") {
            url = args[0];
          } else if (args[0] && args[0].url) {
            url = args[0].url;
          }

          if (isMapsSearchUrl(url)) {
            const clone = response.clone();
            clone.text().then(text => {
              broadcastData(text, url, "fetch");
            }).catch(() => {});
          }
        } catch (e) {}
        return response;
      };
    }
  } catch (err) {
    console.error("[AtlasIQ] Error hooking window.fetch:", err);
  }
})();
