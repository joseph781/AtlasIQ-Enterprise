#!/usr/bin/env node
/**
 * AtlasIQ Enterprise v4.0 - Native Model Context Protocol (MCP) Server
 * Author: Joseph Castillo (CEO) / WINDOWSTELECOM
 * Zero-dependency Node.js >= 20 stdio MCP server exposing B2B Geo-Revenue Intelligence
 * to Claude Desktop, Antigravity, Cursor, Windsurf, and autonomous AI agents.
 *
 * Usage in MCP client config:
 * {
 *   "mcpServers": {
 *     "atlasiq-geo-revenue": {
 *       "command": "node",
 *       "args": ["C:/Users/windo/Desktop/AtlasIQ-Enterprise-v2.5/mcp-server/atlasiq-mcp.mjs"],
 *       "env": {
 *         "ATLASIQ_DATA_PATH": "C:/Users/windo/Downloads/atlasiq_leads.json"
 *       }
 *     }
 *   }
 * }
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SERVER_INFO = {
    name: "atlasiq-geo-revenue-mcp",
    version: "4.0.0"
};

function resolveLeadsFilePath(customPath) {
    if (customPath && fs.existsSync(customPath)) return customPath;
    const argIdx = process.argv.indexOf("--data");
    if (argIdx !== -1 && process.argv[argIdx + 1] && fs.existsSync(process.argv[argIdx + 1])) {
        return process.argv[argIdx + 1];
    }
    if (process.env.ATLASIQ_DATA_PATH && fs.existsSync(process.env.ATLASIQ_DATA_PATH)) {
        return process.env.ATLASIQ_DATA_PATH;
    }
    const candidates = [
        path.resolve(process.cwd(), "atlasiq_leads.json"),
        path.join(os.homedir(), "Downloads", "atlasiq_leads.json"),
        path.join(os.homedir(), "Desktop", "atlasiq_leads.json")
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return candidates[0];
}

function loadLeads(customPath) {
    const filePath = resolveLeadsFilePath(customPath);
    if (!fs.existsSync(filePath)) {
        return { filePath, exists: false, leads: [] };
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const leads = Array.isArray(raw) ? raw : (Array.isArray(raw.leads) ? raw.leads : []);
    return { filePath, exists: true, leads };
}

async function queryDoh(name, type) {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j?.Answer) ? j.Answer : [];
}

async function verifyDomainDnsSecurity(domainOrEmail) {
    let domain = String(domainOrEmail || "").trim();
    if (domain.includes("@")) domain = domain.split("@")[1];
    domain = domain.replace(/^https?:\/\//i, "").split("/")[0].replace(/^www\./i, "").toLowerCase();
    if (!domain || !domain.includes(".")) {
        throw new Error("Dominio inválido proporcionado.");
    }

    const [mxAns, txtAns, dmarcAns] = await Promise.all([
        queryDoh(domain, "MX"),
        queryDoh(domain, "TXT"),
        queryDoh(`_dmarc.${domain}`, "TXT")
    ]);

    const mxRecords = mxAns.map(a => String(a.data || ""));
    const rawMx = mxRecords.join(" ").toLowerCase();
    let provider = mxRecords.length ? "Custom MX Server" : "None (Bounce Risk)";
    if (rawMx.includes("google")) provider = "Google Workspace";
    else if (rawMx.includes("outlook")) provider = "Microsoft 365";
    else if (rawMx.includes("zoho")) provider = "Zoho Mail";
    else if (rawMx.includes("protonmail")) provider = "Proton Mail";

    const spf = txtAns.some(a => String(a.data || "").toLowerCase().includes("v=spf1")) ? "present" : "missing";
    const dmarc = dmarcAns.some(a => String(a.data || "").toLowerCase().includes("v=dmarc1")) ? "present" : "missing";

    return {
        domain,
        mx_valid: mxRecords.length > 0,
        mx_provider: provider,
        spf_status: spf,
        dmarc_status: dmarc,
        mx_records: mxRecords
    };
}

async function auditPageSpeedMobile(websiteUrl) {
    let clean = String(websiteUrl || "").trim();
    if (!clean) throw new Error("URL vacía.");
    if (!/^https?:\/\//i.test(clean)) clean = "https://" + clean;

    const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(clean)}&strategy=mobile&category=PERFORMANCE&category=SEO`;
    const res = await fetch(api, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`Google PageSpeed API HTTP ${res.status}`);
    const json = await res.json();
    return {
        url: clean,
        mobile_performance_score: Math.round((json?.lighthouseResult?.categories?.performance?.score || 0) * 100),
        mobile_seo_score: Math.round((json?.lighthouseResult?.categories?.seo?.score || 0) * 100),
        lcp: json?.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue || "N/A",
        fcp: json?.lighthouseResult?.audits?.["first-contentful-paint"]?.displayValue || "N/A"
    };
}

function buildOutreachSequence(lead) {
    const name = lead.name || "su empresa";
    const cat = lead.category || "su sector";
    const rating = lead.averageRating ? `${lead.averageRating}★` : "alta reputación";
    const gap = !lead.website
        ? "aún no cuentan con un sitio web de conversión rápida conectado a Google Maps"
        : (lead.unclaimed ? "su ficha de Google Maps figura con opciones pendientes de reclamar/optimizar" : "detectamos margen directo para recapturar visitas con píxeles de retargeting y automatización por WhatsApp");

    return {
        whatsapp_touch_1: `Hola equipo de *${name}* 👋 Auditando negocios referentes de *${cat}* vimos su perfil (${rating}), pero notamos que ${gap}. Armamos un diagnóstico visual de 2 min específico para ustedes. ¿Se los comparto por aquí sin compromiso?`,
        whatsapp_followup_48h: `Hola equipo de *${name}*, ¿cómo están? Les escribí hace 48h sobre el diagnóstico digital de su zona. ¿Prefieren verlo por aquí o se los envío a ${lead.email || "su correo"}?`,
        cold_email: `Asunto: Diagnóstico digital de ${name}\n\nHola ${lead.decision_maker || `dirección de ${name}`},\n\nAnalizando ${cat}, destacan con ${rating}, pero ${gap}.\n\n¿Tienen 7 minutos esta semana para revisar las métricas comparativas de su cuadrante?`,
        cold_call_30s: `Hola, busco a ${lead.decision_maker || "quien lidera crecimiento comercial"} en ${name}. Hicimos un estudio geoespacial de ${cat}; tienen ${rating}, pero ${gap}. Ya generamos el PDF con sus datos reales: ¿te lo envío a tu WhatsApp ahora mismo?`
    };
}

const TOOLS = [
    {
        name: "search_leads",
        description: "Busca y filtra prospectos B2B extraídos con AtlasIQ Enterprise v4.0 (por rubro, keyword, score mínimo, sin web, no reclamados o inversión en Ads).",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Ruta opcional a atlasiq_leads.json" },
                query: { type: "string", description: "Texto libre para buscar en nombre, rubro, dirección, stack o decisor" },
                min_score: { type: "number", description: "Score mínimo v4.0 (ej. 75 para Hot Leads)" },
                no_website: { type: "boolean", description: "Si es true, filtra solo negocios sin sitio web" },
                unclaimed_only: { type: "boolean", description: "Si es true, filtra fichas de Google Maps no reclamadas" },
                ads_active_only: { type: "boolean", description: "Si es true, filtra empresas que invierten en Ads" },
                limit: { type: "number", description: "Máximo de resultados a devolver (default 25)" }
            }
        }
    },
    {
        name: "get_market_saturation",
        description: "Analiza la saturación por nicho, brecha digital (% sin web, % sin píxeles) y oportunidades B2B del dataset actual de AtlasIQ.",
        inputSchema: {
            type: "object",
            properties: {
                file_path: { type: "string", description: "Ruta opcional a atlasiq_leads.json" }
            }
        }
    },
    {
        name: "verify_domain_dns_security",
        description: "Audita en vivo registros DNS MX, SPF y DMARC de un dominio o email corporativo vía Cloudflare DoH ($0).",
        inputSchema: {
            type: "object",
            properties: {
                domain_or_email: { type: "string", description: "Dominio o correo corporativo (ej. contacto@empresa.com)" }
            },
            required: ["domain_or_email"]
        }
    },
    {
        name: "audit_pagespeed_mobile",
        description: "Ejecuta una auditoría real en Google PageSpeed Insights v5 Móvil (Performance, SEO, LCP, FCP) sobre el sitio web de un prospecto.",
        inputSchema: {
            type: "object",
            properties: {
                url: { type: "string", description: "URL del sitio web a auditar" }
            },
            required: ["url"]
        }
    },
    {
        name: "generate_outreach_sequence",
        description: "Genera una secuencia omnicanal B2B personalizada (WhatsApp Toque 1, Seguimiento 48h, Email Frío y Guión de Llamada 30s) para un prospecto.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string" },
                category: { type: "string" },
                averageRating: { type: "string" },
                website: { type: "string" },
                unclaimed: { type: "boolean" },
                email: { type: "string" },
                decision_maker: { type: "string" }
            },
            required: ["name"]
        }
    }
];

async function handleToolCall(name, args = {}) {
    if (name === "search_leads") {
        const { filePath, exists, leads } = loadLeads(args.file_path);
        if (!exists) {
            return { warning: `No se encontró archivo JSON en ${filePath}. Exporta primero '{ } JSON' desde el Dashboard de AtlasIQ.`, count: 0, results: [] };
        }
        const q = String(args.query || "").toLowerCase().trim();
        const minScore = Number(args.min_score || 0);
        const limit = Math.min(100, Math.max(1, Number(args.limit || 25)));

        const matches = leads.filter(l => {
            if (minScore && (Number(l.lead_score) || 0) < minScore) return false;
            if (args.no_website && l.website && String(l.website).trim() !== "") return false;
            if (args.unclaimed_only && !l.unclaimed) return false;
            if (args.ads_active_only && !l.ad_spend_active) return false;
            if (q) {
                const hay = [l.name, l.category, l.address, l.tech_stack, l.decision_maker, l.tax_id, l.opportunities].filter(Boolean).join(" ").toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        }).sort((a, b) => (Number(b.lead_score) || 0) - (Number(a.lead_score) || 0)).slice(0, limit);

        return { source: filePath, total_in_db: leads.length, returned: matches.length, results: matches };
    }

    if (name === "get_market_saturation") {
        const { filePath, exists, leads } = loadLeads(args.file_path);
        if (!exists || !leads.length) {
            return { source: filePath, total_leads: 0, message: "Dataset vacío o no encontrado." };
        }
        const niches = {};
        let noWeb = 0;
        let unclaimed = 0;
        let adsActive = 0;
        leads.forEach(l => {
            const c = (l.category || "General").trim();
            if (!niches[c]) niches[c] = { count: 0, without_website: 0 };
            niches[c].count++;
            if (!l.website) { niches[c].without_website++; noWeb++; }
            if (l.unclaimed) unclaimed++;
            if (l.ad_spend_active) adsActive++;
        });
        const topNiches = Object.entries(niches)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 12)
            .map(([niche, stats]) => ({
                niche,
                count: stats.count,
                without_website_pct: Math.round((stats.without_website / stats.count) * 100)
            }));

        return {
            source: filePath,
            total_leads: leads.length,
            digital_gap_no_website_pct: Math.round((noWeb / leads.length) * 100),
            unclaimed_profiles: unclaimed,
            active_advertisers: adsActive,
            top_niches: topNiches
        };
    }

    if (name === "verify_domain_dns_security") {
        return await verifyDomainDnsSecurity(args.domain_or_email);
    }

    if (name === "audit_pagespeed_mobile") {
        return await auditPageSpeedMobile(args.url);
    }

    if (name === "generate_outreach_sequence") {
        return buildOutreachSequence(args);
    }

    throw new Error(`Herramienta MCP desconocida: ${name}`);
}

let useContentLengthFraming = false;

function sendJsonRpc(msg) {
    const json = JSON.stringify(msg);
    if (useContentLengthFraming) {
        const byteLen = Buffer.byteLength(json, "utf8");
        process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
    } else {
        process.stdout.write(json + "\n");
    }
}

async function processRpcMessage(req) {
    if (!req || typeof req !== "object") return;
    const { id, method, params } = req;

    try {
        if (method === "initialize") {
            sendJsonRpc({
                jsonrpc: "2.0",
                id,
                result: {
                    protocolVersion: params?.protocolVersion || "2024-11-05",
                    capabilities: { tools: {} },
                    serverInfo: SERVER_INFO
                }
            });
            return;
        }
        if (method === "notifications/initialized" || id === undefined) {
            return;
        }
        if (method === "ping") {
            sendJsonRpc({ jsonrpc: "2.0", id, result: {} });
            return;
        }
        if (method === "tools/list") {
            sendJsonRpc({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
            return;
        }
        if (method === "tools/call") {
            const output = await handleToolCall(params?.name, params?.arguments || {});
            sendJsonRpc({
                jsonrpc: "2.0",
                id,
                result: {
                    content: [{ type: "text", text: JSON.stringify(output, null, 2) }]
                }
            });
            return;
        }
        sendJsonRpc({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method not found: ${method}` }
        });
    } catch (err) {
        sendJsonRpc({
            jsonrpc: "2.0",
            id,
            result: {
                isError: true,
                content: [{ type: "text", text: `Error: ${err.message}` }]
            }
        });
    }
}

// Dual-framing stdio parser (supports both newline-delimited JSON-RPC and Content-Length headers)
let inputBuffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    while (inputBuffer.length > 0) {
        const preview = inputBuffer.toString("utf8", 0, Math.min(64, inputBuffer.length));
        if (preview.startsWith("Content-Length:")) {
            useContentLengthFraming = true;
            const headerEnd = inputBuffer.indexOf("\r\n\r\n");
            if (headerEnd === -1) break;
            const headerStr = inputBuffer.toString("utf8", 0, headerEnd);
            const m = headerStr.match(/Content-Length:\s*(\d+)/i);
            const bodyLen = m ? parseInt(m[1], 10) : 0;
            const totalLen = headerEnd + 4 + bodyLen;
            if (inputBuffer.length < totalLen) break;
            const bodyStr = inputBuffer.toString("utf8", headerEnd + 4, totalLen);
            inputBuffer = inputBuffer.subarray(totalLen);
            try { processRpcMessage(JSON.parse(bodyStr)); } catch (e) {}
        } else {
            const nlIdx = inputBuffer.indexOf("\n");
            if (nlIdx === -1) break;
            const line = inputBuffer.toString("utf8", 0, nlIdx).trim();
            inputBuffer = inputBuffer.subarray(nlIdx + 1);
            if (!line) continue;
            try { processRpcMessage(JSON.parse(line)); } catch (e) {}
        }
    }
});
