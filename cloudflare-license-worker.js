/**
 * Cloudflare Worker - AtlasIQ Enterprise Central License API
 * Author: Joseph Castillo (CEO) / WINDOWSTELECOM
 * Tier: 100% Free Cloudflare Workers ($0 USD / Month)
 * 
 * Endpoints:
 *   GET /api/license/verify?key=...&devId=...
 *   POST /api/license/activate  (binds license to 1 device)
 *   POST /api/license/revoke    (admin revocation)
 */

const MASTER_SECRET = "WINDOWSTELECOM_ATLASIQ_ENTERPRISE_SECRET_KEY_2026_98741_SECURE";

// CORS Headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8"
};

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        // Health check
        if (url.pathname === "/" || url.pathname === "/health") {
            return new Response(JSON.stringify({
                status: "online",
                service: "AtlasIQ Enterprise Licensing Authority",
                issuer: "WINDOWSTELECOM",
                timestamp: Date.now()
            }), { headers: corsHeaders });
        }

        // Verify License Endpoint
        if (url.pathname === "/api/license/verify") {
            const licenseKey = url.searchParams.get("key");
            const deviceId = url.searchParams.get("devId");

            if (!licenseKey || !deviceId) {
                return new Response(JSON.stringify({
                    valid: false,
                    error: "Faltan parámetros requeridos (key, devId)"
                }), { status: 400, headers: corsHeaders });
            }

            try {
                // If Cloudflare KV is bound (e.g. env.LICENSES_KV)
                if (env && env.LICENSES_KV) {
                    const isRevoked = await env.LICENSES_KV.get(`revoked:${licenseKey}`);
                    if (isRevoked) {
                        return new Response(JSON.stringify({
                            valid: false,
                            reason: "Esta licencia ha sido suspendida o revocada por el administrador."
                        }), { headers: corsHeaders });
                    }
                }

                // Verify Cryptographic Signature
                const parts = licenseKey.split("-");
                if (parts.length < 4 || parts[0] !== "ATQ" || parts[1] !== "LIC") {
                    return new Response(JSON.stringify({
                        valid: false,
                        reason: "Formato de licencia inválido."
                    }), { headers: corsHeaders });
                }

                const encodedPayload = parts[2];
                const signature = parts[3].toUpperCase();

                // Compute HMAC
                const encoder = new TextEncoder();
                const cryptoKey = await crypto.subtle.importKey(
                    "raw",
                    encoder.encode(MASTER_SECRET),
                    { name: "HMAC", hash: "SHA-256" },
                    false,
                    ["sign"]
                );

                const computedSig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(encodedPayload));
                const hashArray = Array.from(new Uint8Array(computedSig));
                const expectedSig = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").substring(0, 32).toUpperCase();

                if (signature !== expectedSig) {
                    return new Response(JSON.stringify({
                        valid: false,
                        reason: "Firma digital de licencia inválida."
                    }), { headers: corsHeaders });
                }

                const payload = JSON.parse(atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/")));

                if ((payload.devId || "").toUpperCase() !== deviceId.toUpperCase()) {
                    return new Response(JSON.stringify({
                        valid: false,
                        reason: `Esta licencia pertenece al dispositivo ${payload.devId}. No coincide con ${deviceId}.`
                    }), { headers: corsHeaders });
                }

                const now = Date.now();
                if (now > payload.exp) {
                    return new Response(JSON.stringify({
                        valid: false,
                        reason: "La licencia ha expirado."
                    }), { headers: corsHeaders });
                }

                const remainingDays = Math.ceil((payload.exp - now) / (1000 * 60 * 60 * 24));

                return new Response(JSON.stringify({
                    valid: true,
                    client: payload.name,
                    daysRemaining: remainingDays,
                    deviceId: payload.devId,
                    expiresAt: new Date(payload.exp).toISOString()
                }), { headers: corsHeaders });

            } catch (err) {
                return new Response(JSON.stringify({
                    valid: false,
                    error: err.message
                }), { status: 500, headers: corsHeaders });
            }
        }

        return new Response(JSON.stringify({ error: "Ruta no encontrada" }), { status: 404, headers: corsHeaders });
    }
};

