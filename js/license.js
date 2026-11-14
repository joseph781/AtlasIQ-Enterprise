/**
 * AtlasIQ Enterprise v4.0 - Zero-Knowledge Asymmetric Licensing & Edge Seat Lock Engine
 * Author: Joseph Castillo (CEO) / WINDOWSTELECOM
 * Security Architecture: WebCrypto ECDSA P-256 (Public Key Only in Client — Zero Secret Exposure)
 * Optional Live Edge Revocation & Seat Binding via Cloudflare Worker D1/KV.
 */

const ATLASIQ_PUBLIC_JWK = Object.freeze({
    kty: "EC",
    crv: "P-256",
    x: "jS5aBfgDiJbTLqJWHnxSYnEj7Zsyud2SeUBjHeK2neE",
    y: "bY5bfod3-ezJlIrebupk2Yhqb3dBhpFVPyr2tj_eL18",
    ext: true,
    key_ops: ["verify"]
});

const ATLASIQ_SUPPORT_WA = "https://wa.me/584127785780";

let _cachedLicenseStatus = null;
let _cachedDeviceId = null;
let _importedPublicKey = null;

function getLicenseStorage(keys, callback) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, callback);
    } else {
        const res = {};
        const keyArr = Array.isArray(keys) ? keys : [keys];
        keyArr.forEach(k => {
            const val = localStorage.getItem(k);
            if (val !== null) {
                try { res[k] = JSON.parse(val); } catch (e) { res[k] = val; }
            }
        });
        callback(res);
    }
}

function setLicenseStorage(obj, callback) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(obj, callback);
    } else {
        Object.keys(obj).forEach(k => {
            const val = typeof obj[k] === "string" ? obj[k] : JSON.stringify(obj[k]);
            localStorage.setItem(k, val);
        });
        if (callback) callback();
    }
}

function b64UrlToBytes(b64url) {
    let base64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function b64UrlDecodeUtf8(str) {
    const bytes = b64UrlToBytes(str);
    return new TextDecoder().decode(bytes);
}

async function computeSha256Hex(message) {
    const data = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

async function getPublicCryptoKey() {
    if (_importedPublicKey) return _importedPublicKey;
    _importedPublicKey = await crypto.subtle.importKey(
        "jwk",
        ATLASIQ_PUBLIC_JWK,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
    );
    return _importedPublicKey;
}

/**
 * Hardware/Environment Fingerprint + Persistent Seed
 */
async function getOrCreateDeviceId() {
    if (_cachedDeviceId) return _cachedDeviceId;

    return new Promise((resolve) => {
        getLicenseStorage(["atlasiq_device_id", "atlasiq_device_seed"], async (data) => {
            if (data.atlasiq_device_id) {
                _cachedDeviceId = data.atlasiq_device_id;
                resolve(_cachedDeviceId);
                return;
            }

            let seed = data.atlasiq_device_seed;
            if (!seed) {
                const randomBytes = new Uint8Array(16);
                crypto.getRandomValues(randomBytes);
                seed = Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("");
            }

            const scr = typeof screen !== "undefined" ? `${screen.width || 1920}x${screen.height || 1080}x${screen.colorDepth || 24}` : "1920x1080x24";
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
            const concurrency = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) : 4;
            const platform = typeof navigator !== "undefined" ? (navigator.platform || "Win32") : "Win32";
            const lang = typeof navigator !== "undefined" ? (navigator.language || "es") : "es";

            const rawFingerprint = `HWID|${platform}|${scr}|${tz}|${concurrency}|${lang}|SEED:${seed}`;
            const fullHash = await computeSha256Hex(rawFingerprint);
            const devId = `ATQ-DEV-${fullHash.substring(0, 4)}-${fullHash.substring(4, 8)}-${fullHash.substring(8, 12)}`;

            setLicenseStorage({ atlasiq_device_id: devId, atlasiq_device_seed: seed }, () => {
                _cachedDeviceId = devId;
                resolve(devId);
            });
        });
    });
}

/**
 * Verify ECDSA P-256 Asymmetric License Key (`ATQ4.<payloadB64Url>.<sigB64Url>`)
 * Optionally checks online revocation against Cloudflare Edge Licensing Authority if configured.
 */
async function verifyLicenseKey(licenseKey, currentDevId, edgeEndpoint = "") {
    try {
        if (!licenseKey || typeof licenseKey !== "string") {
            return { valid: false, reason: "Clave de licencia no proporcionada." };
        }

        const cleanKey = licenseKey.trim();
        let encodedPayload = "";
        let encodedSignature = "";

        if (cleanKey.startsWith("ATQ4.")) {
            const parts = cleanKey.split(".");
            if (parts.length !== 3) {
                return { valid: false, reason: "Formato de licencia asimétrica ATQ4 incompleto." };
            }
            encodedPayload = parts[1];
            encodedSignature = parts[2];
        } else if (cleanKey.startsWith("ATQ4-LIC-")) {
            // Alternate hyphen-safe wrapper: ATQ4-LIC-<payload>.<sig>
            const body = cleanKey.substring("ATQ4-LIC-".length);
            const dotIdx = body.lastIndexOf(".");
            if (dotIdx <= 0) {
                return { valid: false, reason: "Formato de firma digital ECDSA inválido." };
            }
            encodedPayload = body.substring(0, dotIdx);
            encodedSignature = body.substring(dotIdx + 1);
        } else {
            return {
                valid: false,
                reason: "Esta versión utiliza blindaje asimétrico ECDSA P-256 (clave ATQ4.). Solicita tu actualización gratuita de llave a WINDOWSTELECOM."
            };
        }

        const pubKey = await getPublicCryptoKey();
        const sigBytes = b64UrlToBytes(encodedSignature);
        const msgBytes = new TextEncoder().encode(encodedPayload);

        const isAuthentic = await crypto.subtle.verify(
            { name: "ECDSA", hash: { name: "SHA-256" } },
            pubKey,
            sigBytes,
            msgBytes
        );

        if (!isAuthentic) {
            return { valid: false, reason: "Firma criptográfica ECDSA P-256 inválida o adulterada." };
        }

        const payload = JSON.parse(b64UrlDecodeUtf8(encodedPayload));
        const targetDevId = (payload.devId || "").trim().toUpperCase();
        const thisDevId = (currentDevId || "").trim().toUpperCase();

        if (targetDevId !== "ANY-ENTERPRISE-SEAT" && targetDevId !== thisDevId) {
            return {
                valid: false,
                reason: `Licencia emitida exclusivamente para [${targetDevId}]. Este equipo es [${thisDevId}].`
            };
        }

        const now = Date.now();
        if (now > payload.exp) {
            const expDate = new Date(payload.exp).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
            return { valid: false, reason: `La licencia expiró el ${expDate}. Contacta a WINDOWSTELECOM para renovarla.` };
        }

        // Optional Online Cloudflare Worker Revocation / Seat Verification
        if (edgeEndpoint && edgeEndpoint.startsWith("http")) {
            try {
                const verifyUrl = `${edgeEndpoint.replace(/\/$/, "")}/api/license/verify?key=${encodeURIComponent(cleanKey)}&devId=${encodeURIComponent(thisDevId)}`;
                const resp = await fetch(verifyUrl, { signal: AbortSignal.timeout(4500) });
                if (resp.ok) {
                    const edgeData = await resp.json();
                    if (edgeData && edgeData.revoked === true) {
                        return { valid: false, reason: edgeData.reason || "Licencia revocada por la autoridad central WINDOWSTELECOM." };
                    }
                }
            } catch (netErr) {
                // Graceful offline fallback since ECDSA cryptographic signature already passed
            }
        }

        const daysRemaining = Math.max(1, Math.ceil((payload.exp - now) / (1000 * 60 * 60 * 24)));

        return {
            valid: true,
            clientName: payload.name || "Cliente Corporativo",
            daysRemaining,
            issuedDate: new Date(payload.iat || now).toLocaleDateString("es-ES"),
            expiresDate: new Date(payload.exp).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }),
            expiresTimestamp: payload.exp,
            licenseType: payload.tier || payload.type || "ENTERPRISE_V4",
            deviceId: thisDevId
        };
    } catch (err) {
        return { valid: false, reason: "No se pudo verificar la firma ECDSA: " + err.message };
    }
}

async function checkCurrentLicense() {
    const devId = await getOrCreateDeviceId();

    return new Promise((resolve) => {
        getLicenseStorage(["atlasiq_license_key", "tl_edge_worker_url"], async (data) => {
            const key = data.atlasiq_license_key;
            const edgeUrl = data.tl_edge_worker_url || "";
            if (!key) {
                const res = { active: false, deviceId: devId, reason: "Sin licencia activa. Activa tu copia de AtlasIQ Enterprise v4.0." };
                _cachedLicenseStatus = res;
                resolve(res);
                return;
            }

            const verification = await verifyLicenseKey(key, devId, edgeUrl);
            const res = verification.valid
                ? { active: true, deviceId: devId, licenseKey: key, ...verification }
                : { active: false, deviceId: devId, licenseKey: key, reason: verification.reason };

            _cachedLicenseStatus = res;
            resolve(res);
        });
    });
}

async function activateLicenseKey(inputKey) {
    const devId = await getOrCreateDeviceId();
    return new Promise((resolve) => {
        getLicenseStorage(["tl_edge_worker_url"], async (cfg) => {
            const edgeUrl = cfg.tl_edge_worker_url || "";
            const result = await verifyLicenseKey(inputKey, devId, edgeUrl);
            if (!result.valid) {
                resolve({ success: false, message: result.reason });
                return;
            }

            // Register seat on Cloudflare Edge if configured
            if (edgeUrl && edgeUrl.startsWith("http")) {
                try {
                    await fetch(`${edgeUrl.replace(/\/$/, "")}/api/license/activate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ key: inputKey.trim(), devId }),
                        signal: AbortSignal.timeout(4500)
                    });
                } catch (e) {}
            }

            setLicenseStorage({
                atlasiq_license_key: inputKey.trim(),
                atlasiq_license_info: result
            }, () => {
                _cachedLicenseStatus = { active: true, deviceId: devId, licenseKey: inputKey.trim(), ...result };
                resolve({
                    success: true,
                    message: `¡Licencia ECDSA P-256 activada para ${result.clientName}! Vigencia: ${result.daysRemaining} días (hasta el ${result.expiresDate}).`,
                    details: result
                });
            });
        });
    });
}

async function initLicenseUi() {
    const status = await checkCurrentLicense();
    const devId = status.deviceId;

    const badgeEl = document.getElementById("header-license-badge");
    const badgeText = document.getElementById("header-license-text");

    if (badgeEl && badgeText) {
        if (status.active) {
            badgeEl.className = "tl-license-badge active";
            badgeText.textContent = `🛡️ ECDSA Activa (${status.daysRemaining}d)`;
            badgeEl.title = `Licencia verificada para ${status.clientName}. Expira: ${status.expiresDate}`;
        } else {
            badgeEl.className = "tl-license-badge expired";
            badgeText.textContent = "⚠️ Activar Licencia";
            badgeEl.title = status.reason || "Haz clic para activar";
        }
        badgeEl.onclick = () => openLicenseModal(false);
    }

    const devIdEl = document.getElementById("license-modal-device-id");
    if (devIdEl) devIdEl.textContent = devId;

    const btnCopyDevId = document.getElementById("btn-copy-device-id");
    if (btnCopyDevId) {
        btnCopyDevId.onclick = () => {
            navigator.clipboard.writeText(devId).then(() => {
                btnCopyDevId.textContent = "✅ ¡Copiado!";
                setTimeout(() => { btnCopyDevId.textContent = "📋 Copiar ID"; }, 2000);
            });
        };
    }

    const waLink = document.getElementById("link-whatsapp-license");
    if (waLink) {
        const msg = encodeURIComponent(`Hola Joseph / WINDOWSTELECOM, solicito mi clave criptográfica ATQ4 para AtlasIQ Enterprise v4.0.\n\nMi ID de Dispositivo es: ${devId}`);
        waLink.href = `${ATLASIQ_SUPPORT_WA}?text=${msg}`;
    }

    const btnActivate = document.getElementById("btn-submit-license");
    const inputKey = document.getElementById("input-license-key");
    const alertBox = document.getElementById("license-alert-msg");

    if (btnActivate && inputKey) {
        btnActivate.onclick = async () => {
            const keyVal = inputKey.value.trim();
            if (!keyVal) {
                if (alertBox) {
                    alertBox.style.display = "block";
                    alertBox.className = "tl-license-alert error";
                    alertBox.textContent = "Introduce tu clave asimétrica ATQ4...";
                }
                return;
            }

            btnActivate.disabled = true;
            btnActivate.textContent = "⏳ Verificando firma ECDSA...";

            const res = await activateLicenseKey(keyVal);

            btnActivate.disabled = false;
            btnActivate.textContent = "🚀 Activar Licencia ECDSA";

            if (alertBox) {
                alertBox.style.display = "block";
                alertBox.className = res.success ? "tl-license-alert success" : "tl-license-alert error";
                alertBox.textContent = res.message;
                if (res.success) {
                    if (typeof playAudioNotification === "function") playAudioNotification("success");
                    if (badgeEl && badgeText) {
                        badgeEl.className = "tl-license-badge active";
                        badgeText.textContent = `🛡️ ECDSA Activa (${res.details.daysRemaining}d)`;
                    }
                    setTimeout(() => closeLicenseModal(), 2000);
                }
            }
        };
    }

    const btnCloseModal = document.getElementById("btn-close-license-modal");
    if (btnCloseModal) {
        btnCloseModal.onclick = () => closeLicenseModal();
    }

    if (!status.active) {
        openLicenseModal(true);
    }
}

function openLicenseModal(isBlocking = false) {
    const modal = document.getElementById("license-modal");
    const backdrop = document.getElementById("tl-modal-backdrop");
    if (modal) modal.classList.add("open");
    if (backdrop) backdrop.classList.add("open");

    const closeBtn = document.getElementById("btn-close-license-modal");
    if (closeBtn) {
        closeBtn.style.display = isBlocking ? "none" : "block";
    }
}

function closeLicenseModal() {
    const modal = document.getElementById("license-modal");
    const backdrop = document.getElementById("tl-modal-backdrop");
    if (modal) modal.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
}
