/**
 * AtlasIQ Enterprise - Master Keygen CLI
 * Usage:
 *   node keygen.js "ATQ-DEV-7F82-93A1-C4E2" "Nombre Cliente" 365
 */

const crypto = require('crypto');

const MASTER_SECRET = "WINDOWSTELECOM_ATLASIQ_ENTERPRISE_SECRET_KEY_2026_98741_SECURE";

function base64UrlEncode(str) {
    return Buffer.from(str, 'utf8').toString('base64url');
}

function generateLicense(deviceId, clientName = "Cliente Corporativo", daysValid = 365) {
    if (!deviceId) {
        console.error("❌ Error: Debes proporcionar el ID de Dispositivo.");
        console.log("Uso: node keygen.js <ATQ-DEV-XXXX-XXXX-XXXX> [Nombre Cliente] [Días]");
        process.exit(1);
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + (daysValid * 24 * 60 * 60 * 1000);

    const payload = {
        devId: deviceId.trim().toUpperCase(),
        name: clientName.trim(),
        iat: issuedAt,
        exp: expiresAt,
        type: daysValid >= 365 ? "ANUAL_ENTERPRISE" : "PROMO_ENTERPRISE",
        issuer: "WINDOWSTELECOM"
    };

    const payloadStr = JSON.stringify(payload);
    const encodedPayload = base64UrlEncode(payloadStr);

    const hmac = crypto.createHmac('sha256', MASTER_SECRET);
    hmac.update(encodedPayload);
    const signature = hmac.digest('hex').substring(0, 32).toUpperCase();

    const licenseKey = `ATQ-LIC-${encodedPayload}-${signature}`;
    const expDate = new Date(expiresAt).toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });

    console.log("\n=======================================================");
    console.log("   🛡️ WINDOWSTELECOM - AtlasIQ Enterprise Master Keygen");
    console.log("=======================================================");
    console.log(`📌 Cliente:         ${clientName}`);
    console.log(`🖥️ ID Dispositivo:  ${payload.devId}`);
    console.log(`📅 Vigencia:        ${daysValid} días (Hasta: ${expDate})`);
    console.log("\n🔑 CLAVE DE ACTIVACIÓN:");
    console.log(`\x1b[32m${licenseKey}\x1b[0m`);
    console.log("=======================================================\n");

    return licenseKey;
}

const args = process.argv.slice(2);
const devId = args[0];
const client = args[1] || "Cliente AtlasIQ";
const days = parseInt(args[2]) || 365;

generateLicense(devId, client, days);

