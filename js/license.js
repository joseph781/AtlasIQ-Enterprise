/**
 * AtlasIQ Enterprise - Cryptographic Licensing & Device Lock Engine
 * Author: Joseph Castillo (CEO) / WINDOWSTELECOM
 * Method: Client-Side Device Token Binding + Asymmetric/HMAC Cryptography ($0 Cost)
 */

const ATLASIQ_MASTER_SECRET = "WINDOWSTELECOM_ATLASIQ_ENTERPRISE_SECRET_KEY_2026_98741_SECURE";
const ATLASIQ_SUPPORT_WA = "https://wa.me/584127785780"; // WINDOWSTELECOM Support WhatsApp

// In-memory cached status
let _cachedLicenseStatus = null;
let _cachedDeviceId = null;

/**
 * Universal Storage Helper for Licensing
 */
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

/**
 * Base64 URL Safe encoding & decoding
 */
function b64UrlEncode(str) {
    return btoa(unescape(encodeURIComponent(str)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function b64UrlDecode(str) {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
        base64 += "=";
    }
    return decodeURIComponent(escape(atob(base64)));
}

/**
 * SHA-256 Digest using WebCrypto
 */
async function computeSha256Hex(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * HMAC-SHA256 Signature using WebCrypto
 */
async function computeHmacHex(payloadString, secretKey) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(payloadString);

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32).toUpperCase();
}

/**
 * Generate or Retrieve Unique Hardware/Browser Device ID
 * Binds: Screen Geometry, Hardware Concurrency, Timezone, UserAgent Platform + Cryptographic Persistent Seed
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

            // Create persistent hardware seed if not present
            let seed = data.atlasiq_device_seed;
            if (!seed) {
                const randomBytes = new Uint8Array(16);
                crypto.getRandomValues(randomBytes);
                seed = Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("");
            }

            // Collect device & browser environment characteristics
            const screenInfo = `${window.screen?.width || 1920}x${window.screen?.height || 1080}x${window.screen?.colorDepth || 24}`;
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
            const concurrency = navigator.hardwareConcurrency || 4;
            const platform = navigator.platform || "Win32";
            const lang = navigator.language || "es";

            const rawFingerprint = `HWID|${platform}|${screenInfo}|${tz}|${concurrency}|${lang}|SEED:${seed}`;
            const fullHash = await computeSha256Hex(rawFingerprint);

            // Format as readable device key: ATQ-DEV-XXXX-XXXX-XXXX
            const devId = `ATQ-DEV-${fullHash.substring(0, 4)}-${fullHash.substring(4, 8)}-${fullHash.substring(8, 12)}`;

            setLicenseStorage({ atlasiq_device_id: devId, atlasiq_device_seed: seed }, () => {
                _cachedDeviceId = devId;
                resolve(devId);
            });
        });
    });
}

/**
 * Verify a License Key against a Device ID
 */
async function verifyLicenseKey(licenseKey, currentDevId) {
    try {
        if (!licenseKey || typeof licenseKey !== "string") {
            return { valid: false, reason: "Clave de licencia no proporcionada" };
        }

        const cleanKey = licenseKey.trim();
        if (!cleanKey.startsWith("ATQ-LIC-")) {
            return { valid: false, reason: "Formato de clave inválido (debe comenzar con ATQ-LIC-)" };
        }

        const parts = cleanKey.split("-");
        // ATQ, LIC, <encodedPayload>, <signature>
        if (parts.length < 4) {
            return { valid: false, reason: "Estructura de clave incompleta" };
        }

        const encodedPayload = parts[2];
        const signature = parts[3].toUpperCase();

        // Verify HMAC Signature
        const expectedSig = await computeHmacHex(encodedPayload, ATLASIQ_MASTER_SECRET);
        if (signature !== expectedSig) {
            return { valid: false, reason: "Firma digital no válida o clave adulterada" };
        }

        // Decode Payload
        const payloadJson = b64UrlDecode(encodedPayload);
        const payload = JSON.parse(payloadJson);

        // Check Device Binding
        const targetDevId = (payload.devId || "").trim().toUpperCase();
        const thisDevId = (currentDevId || "").trim().toUpperCase();

        if (targetDevId !== thisDevId) {
            return {
                valid: false,
                reason: `Esta licencia fue emitida para el equipo [${targetDevId}]. No corresponde a este dispositivo [${thisDevId}].`
            };
        }

        // Check Expiration Date
        const now = Date.now();
        if (now > payload.exp) {
            const expDate = new Date(payload.exp).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
            return { valid: false, reason: `Esta licencia anual venció el ${expDate}. Contacte a WINDOWSTELECOM para renovarla.` };
        }

        const remainingMs = payload.exp - now;
        const daysRemaining = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));

        return {
            valid: true,
            clientName: payload.name || "Cliente Corporativo",
            daysRemaining: daysRemaining,
            issuedDate: new Date(payload.iat).toLocaleDateString("es-ES"),
            expiresDate: new Date(payload.exp).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" }),
            expiresTimestamp: payload.exp,
            licenseType: payload.type || "ANUAL_ENTERPRISE",
            deviceId: targetDevId
        };
    } catch (err) {
        return { valid: false, reason: "Error al procesar clave de licencia: " + err.message };
    }
}

/**
 * Check Current License Status from Storage
 */
async function checkCurrentLicense() {
    const devId = await getOrCreateDeviceId();

    return new Promise((resolve) => {
        getLicenseStorage(["atlasiq_license_key"], async (data) => {
            const key = data.atlasiq_license_key;
            if (!key) {
                const res = { active: false, deviceId: devId, reason: "Sin licencia activa. Activa tu copia de AtlasIQ Enterprise." };
                _cachedLicenseStatus = res;
                resolve(res);
                return;
            }

            const verification = await verifyLicenseKey(key, devId);
            if (verification.valid) {
                const res = {
                    active: true,
                    deviceId: devId,
                    licenseKey: key,
                    ...verification
                };
                _cachedLicenseStatus = res;
                resolve(res);
            } else {
                const res = {
                    active: false,
                    deviceId: devId,
                    licenseKey: key,
                    reason: verification.reason
                };
                _cachedLicenseStatus = res;
                resolve(res);
            }
        });
    });
}

/**
 * Activate License by entering a key
 */
async function activateLicenseKey(inputKey) {
    const devId = await getOrCreateDeviceId();
    const result = await verifyLicenseKey(inputKey, devId);

    if (!result.valid) {
        return { success: false, message: result.reason };
    }

    return new Promise((resolve) => {
        setLicenseStorage({
            atlasiq_license_key: inputKey.trim(),
            atlasiq_license_info: result
        }, () => {
            _cachedLicenseStatus = { active: true, deviceId: devId, licenseKey: inputKey.trim(), ...result };
            resolve({
                success: true,
                message: `¡Licencia activada con éxito para ${result.clientName}! Válida por ${result.daysRemaining} días (hasta el ${result.expiresDate}).`,
                details: result
            });
        });
    });
}

/**
 * UI Controller: Initialize and Bind License Modal & Header Badge
 */
async function initLicenseUi() {
    const status = await checkCurrentLicense();
    const devId = status.deviceId;

    // 1. Update Header License Badge in Dashboard if exists
    const badgeEl = document.getElementById("header-license-badge");
    const badgeText = document.getElementById("header-license-text");

    if (badgeEl && badgeText) {
        if (status.active) {
            badgeEl.className = "tl-license-badge active";
            badgeText.textContent = `🛡️ Licencia Activa (${status.daysRemaining}d)`;
            badgeEl.title = `Licencia corporativa de ${status.clientName}. Expira: ${status.expiresDate}`;
        } else {
            badgeEl.className = "tl-license-badge expired";
            badgeText.textContent = "⚠️ Licencia Requerida";
            badgeEl.title = status.reason || "Haz clic para activar";
        }

        badgeEl.onclick = () => openLicenseModal();
    }

    // 2. Populate Device ID and WhatsApp Links in Modal
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
        const msg = encodeURIComponent(`Hola Joseph / WINDOWSTELECOM, deseo solicitar/activar mi licencia anual de AtlasIQ Enterprise.\n\nMi ID de Dispositivo es: ${devId}`);
        waLink.href = `${ATLASIQ_SUPPORT_WA}?text=${msg}`;
    }

    // 3. Activation Button Listener
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
                    alertBox.textContent = "Por favor introduce la clave de licencia recibida.";
                }
                return;
            }

            btnActivate.disabled = true;
            btnActivate.textContent = "⏳ Validando...";

            const res = await activateLicenseKey(keyVal);

            btnActivate.disabled = false;
            btnActivate.textContent = "🚀 Activar Licencia";

            if (alertBox) {
                alertBox.style.display = "block";
                if (res.success) {
                    alertBox.className = "tl-license-alert success";
                    alertBox.textContent = res.message;
                    if (typeof playAudioNotification === "function") playAudioNotification("success");
                    
                    // Refresh Header Badge
                    if (badgeEl && badgeText) {
                        badgeEl.className = "tl-license-badge active";
                        badgeText.textContent = `🛡️ Licencia Activa (${res.details.daysRemaining}d)`;
                    }

                    setTimeout(() => {
                        closeLicenseModal();
                    }, 2500);
                } else {
                    alertBox.className = "tl-license-alert error";
                    alertBox.textContent = res.message;
                }
            }
        };
    }

    // 4. Modal Close Listener
    const btnCloseModal = document.getElementById("btn-close-license-modal");
    if (btnCloseModal) {
        btnCloseModal.onclick = () => closeLicenseModal();
    }

    // 5. If NOT active, prompt the user immediately
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
