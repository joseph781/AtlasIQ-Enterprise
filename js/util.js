/**
 * AtlasIQ Enterprise v4.0 - Core Geo-Intelligence, Hybrid AI, OSINT & Cyber-Deliverability Engine
 * Author: Joseph Castillo (CEO) / WINDOWSTELECOM
 * Grade: Silicon Valley Principal Architecture
 */

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getQueryString(name) {
    const reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
    const r = window.location.search.substring(1).match(reg);
    return r !== null ? decodeURIComponent(r[2]) : null;
}

function normalizeUrl(url) {
    if (!url) return "";
    let clean = url.trim();
    if (clean.startsWith("//")) clean = "https:" + clean;
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) clean = "https://" + clean;
    try {
        return new URL(clean).toString();
    } catch (e) {
        return clean;
    }
}

function extractDomain(url) {
    if (!url) return "";
    try {
        return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
    } catch (e) {
        return "";
    }
}

function formatPhone(phone, countryCodeHint = "") {
    if (!phone) return { original: "", clean: "", whatsappUrl: "" };
    const digitsOnly = String(phone).replace(/[^\d+]/g, "");
    let clean = digitsOnly.replace(/^00/, "+");
    let waDigits = clean.replace(/\+/g, "");

    if (!clean.startsWith("+") && countryCodeHint && !waDigits.startsWith(countryCodeHint)) {
        waDigits = countryCodeHint + waDigits;
        clean = "+" + waDigits;
    }

    return {
        original: phone,
        clean,
        whatsappUrl: waDigits && waDigits.length >= 8 ? `https://wa.me/${waDigits}` : ""
    };
}

/**
 * Multi-Signal Commercial Opportunity Scoring Engine v4.0 (0 - 99)
 */
function calculateLeadScore(lead) {
    let score = 45;
    const opportunities = [];

    if (!lead.website || lead.website.trim() === "") {
        score += 26;
        opportunities.push("Sin Sitio Web (Venta Directa Web)");
    } else {
        score += 4;
        const tech = (lead.tech_stack || "").toLowerCase();
        if (tech && !tech.includes("pixel") && !tech.includes("gtm")) {
            score += 12;
            opportunities.push("Sin Píxel de Conversión (Oportunidad Ads)");
        }
        if (lead.ad_spend_active) {
            score += 8;
            opportunities.push("Invierte en Ads Activamente");
        }
        if (tech.includes("wix") || tech.includes("squarespace")) {
            opportunities.push("CMS Limitado (Oportunidad Rediseño)");
        }
        if (typeof lead.pagespeed_mobile === "number" && lead.pagespeed_mobile < 55) {
            score += 12;
            opportunities.push(`Web Móvil Lenta (${lead.pagespeed_mobile}/100 PageSpeed)`);
        }
    }

    if (lead.unclaimed) {
        score += 18;
        opportunities.push("Ficha Google No Reclamada (SEO Local)");
    }

    if (lead.review_pain_points) {
        score += 10;
        opportunities.push(`Dolor Clientes: ${lead.review_pain_points}`);
    }

    if (lead.dmarc_status === "missing") {
        score += 6;
        opportunities.push("Dominio sin Protección DMARC");
    }

    if (lead.phone && String(lead.phone).length > 6) score += 8;
    if (lead.email && String(lead.email).includes("@")) score += 12;
    if (lead.decision_maker || lead.legal_name) score += 6;

    const hasSocial = Boolean(lead.instagram || lead.facebook || lead.linkedin || lead.tiktok);
    if (!hasSocial && lead.website) {
        score += 6;
        opportunities.push("Sin Ecosistema RRSS Vinculado");
    }

    const rating = parseFloat(lead.averageRating) || 0;
    const reviews = parseInt(lead.reviewCount) || 0;

    if (rating >= 4.5 && reviews > 0 && reviews < 25) {
        score += 8;
        opportunities.push("Excelente Calificación, Pocas Reseñas");
    } else if (rating > 0 && rating < 4.1 && reviews >= 10) {
        score += 9;
        opportunities.push("Gestión de Reputación (<4.1★)");
    } else if (reviews >= 120) {
        score += 7;
        opportunities.push("Negocio Consolidado / Alto Tráfico");
    }

    score = Math.min(99, Math.max(15, score));

    let priority = "Media";
    let priorityColor = "#f59e0b";
    if (score >= 75) {
        priority = "Alta";
        priorityColor = "#10b981";
    } else if (score < 45) {
        priority = "Baja";
        priorityColor = "#94a3b8";
    }

    return {
        score,
        priority,
        priorityColor,
        opportunities: Array.from(new Set(opportunities))
    };
}

/**
 * Omnichannel Personalized Pitch & Sequence Generator v4.0
 * Channels: whatsapp | followup | email | call
 */
function generateOutreachPitch(lead, channel = "whatsapp") {
    const name = lead.name || "su empresa";
    const execGreeting = lead.decision_maker ? `Hola ${lead.decision_maker.split(":")[1]?.trim() || lead.decision_maker}, saludo al equipo de *${name}*` : `Hola, un gusto saludar al equipo de *${name}*`;
    const category = lead.category || "su sector";
    const city = lead.address ? (lead.address.split(",")[1] || lead.address.split(",")[0]).trim() : "su zona";
    const rating = lead.averageRating ? `${lead.averageRating}★` : "buena reputación";
    const peerHook = lead.nearestPeerName && lead.nearestPeerDistanceKm
        ? ` (especialmente teniendo a *${lead.nearestPeerName}* a solo ${lead.nearestPeerDistanceKm < 1 ? Math.round(lead.nearestPeerDistanceKm * 1000) + "m" : lead.nearestPeerDistanceKm.toFixed(1) + "km"})`
        : "";

    let diagnosticHook = "";
    if (!lead.website) {
        diagnosticHook = `noté que aún no cuentan con un sitio web de conversión rápida conectado a Google Maps${peerHook}, dejando escapar clientes que buscan ${category} desde el móvil.`;
    } else if (lead.unclaimed) {
        diagnosticHook = `detecté que su ficha de Google Maps aparece con funciones sin reclamar/optimizar${peerHook}, lo que frena su posicionamiento orgánico local.`;
    } else if (typeof lead.pagespeed_mobile === "number" && lead.pagespeed_mobile < 60) {
        diagnosticHook = `audité su web móvil y actualmente marca ${lead.pagespeed_mobile}/100 en Google PageSpeed, perdiendo prospectos por tiempo de carga.`;
    } else if (lead.review_pain_points) {
        diagnosticHook = `analizando el flujo comercial en ${city}, vimos oportunidades clave para automatizar su atención (${lead.review_pain_points.toLowerCase()}) y multiplicar cierres.`;
    } else if (!lead.tech_stack || (!lead.tech_stack.toLowerCase().includes("pixel") && !lead.ad_spend_active)) {
        diagnosticHook = `vi que tienen sitio web y ${rating}, pero no tienen píxeles de retargeting activos para recapturar a quienes visitan su página sin comprar.`;
    } else {
        diagnosticHook = `vi que ya destacan con ${rating}${peerHook} y preparamos un sistema de captación automatizada para dominar las búsquedas de ${category} en ${city}.`;
    }

    if (channel === "whatsapp") {
        return `${execGreeting} 👋\n\nEstuve auditando los negocios líderes de *${category}* en ${city} y destacó su perfil (${rating}).\n\nSin embargo, ${diagnosticHook}\n\nPreparé un breve diagnóstico visual de 2 minutos específico para *${name}*. ¿Me autorizan enviarlo por aquí sin ningún compromiso?`;
    }

    if (channel === "followup") {
        return `Hola equipo de *${name}*, ¿cómo están? 👋\n\nLes escribí hace un par de días sobre el diagnóstico digital que armamos para su sede en ${city}${peerHook}.\n\nSolo quería confirmar si prefieren que les comparta el resumen en PDF por esta vía o a ${lead.email || "su correo corporativo"}. ¡Quedo atento!`;
    }

    if (channel === "call") {
        return `📞 GUIÓN DE LLAMADA FRÍA (30 SEGUNDOS):\n\n"Hola, buenos días. Busco a ${lead.decision_maker || "la persona encargada de crecimiento comercial"} en ${name}.\n\nTe llamo muy breve porque hicimos un estudio geoespacial de ${category} en ${city}; ustedes tienen ${rating}, pero ${diagnosticHook.replace(/\*/g, "")}\n\nNo te llamo para venderte hoy en frío: ya generamos la auditoría con los datos reales de su zona. ¿Te parece bien si la vemos 5 minutos el jueves o te la envío primero a tu WhatsApp?"`;
    }

    // Cold Email
    return `Asunto: Diagnóstico de captación local para ${name} en ${city}\n\nHola ${lead.decision_maker || `equipo directivo de ${name}`},\n\nAnalizando los referentes de ${category} en ${city}, su reputación (${rating}) sobresale claramente.\n\nNo obstante, realizando una auditoría técnica sobre su huella digital, ${diagnosticHook.replace(/\*/g, "")}\n\nHemos ayudado a empresas del rubro ${category} a incrementar su flujo de citas y ventas B2B/B2C entre un 28% y 45% en menos de 60 días.\n\n¿Tienen 7 minutos esta semana para mostrarles el informe comparativo de su cuadrante?\n\nSaludos cordiales,\nConsultoría de Inteligencia Comercial`;
}

/**
 * Hybrid 2026 AI Engine:
 * 1. Google Gemini 2.5 Flash Cloud API (with secure x-goog-api-key header, zero URL key leak)
 * 2. Chrome Built-in Gemini Nano Local AI (`self.LanguageModel` / `window.ai`) $0 fallback!
 */
async function callGeminiAnalysis(apiKey, lead, customChannel = "whatsapp") {
    const cleanLead = typeof lead === "object" && lead !== null ? lead : { name: String(lead || "Prospecto") };

    const prompt = `Actúa como el Principal Revenue Strategist de una firma élite en Silicon Valley.
Analiza este prospecto real extraído con AtlasIQ v4.0 y entrega una estrategia quirúrgica de cierre B2B:

DATOS PROFUNDOS DEL PROSPECTO:
- Empresa: ${cleanLead.name || "N/A"} ${cleanLead.legal_name ? `(Razón Social: ${cleanLead.legal_name})` : ""}
- Decisor / Cargo OSINT: ${cleanLead.decision_maker || "No identificado públicamente"}
- ID Fiscal: ${cleanLead.tax_id || "No indexado"}
- Rubro: ${cleanLead.category || "Comercial"} ${cleanLead.secondaryCategories ? `(${cleanLead.secondaryCategories})` : ""}
- Calificación Maps: ${cleanLead.averageRating || "N/A"}★ (${cleanLead.reviewCount || 0} reseñas) | Ficha Reclamada: ${cleanLead.unclaimed ? "NO RECLAMADA (Alerta Crítica)" : "Sí"}
- Dolor en Reseñas: ${cleanLead.review_pain_points || "Sin quejas críticas detectadas"}
- Sitio Web: ${cleanLead.website || "SIN SITIO WEB"} ${typeof cleanLead.pagespeed_mobile === "number" ? `| Google PageSpeed Móvil: ${cleanLead.pagespeed_mobile}/100` : ""}
- Stack & Píxeles: ${cleanLead.tech_stack || "Ninguno"} | Invierte en Ads: ${cleanLead.ad_spend_active ? "SÍ" : "No detectado"}
- Plataforma Reservas/Delivery: ${cleanLead.booking_platform || "No integrada"}
- Seguridad Email DNS: Proveedor=${cleanLead.mx_provider || "Sin verificar"} | SPF=${cleanLead.spf_status || "N/A"} | DMARC=${cleanLead.dmarc_status || "N/A"}
- Competidor Más Cercano: ${cleanLead.nearestPeerName ? `${cleanLead.nearestPeerName} (${cleanLead.nearestPeerDistanceKm ? Math.round(cleanLead.nearestPeerDistanceKm * 1000) + "m" : "cercano"})` : "Zona activa"}

RESPONDE EN ESPAÑOL EJECUTIVO, DIRECTO Y ACCIONABLE CON ESTAS 5 SECCIONES:
1. 🎯 SCORE ESTRATÉGICO & PÉRDIDA ESTIMADA MENSUAL (en USD por sus brechas actuales).
2. 🔍 TOP 3 VULNERABILIDADES TÉCNICAS / COMERCIALES EXPLOTABLES HOY.
3. 🎣 ROMPEHIELOS DE 5 SEGUNDOS (imposible de ignorar por el dueño).
4. 💬 SECUENCIA WHATSAPP DE 2 TOQUES (Toque 1 Apertura + Toque 2 Seguimiento a las 48h).
5. 📞 GUIÓN DE OBJECIONES Y LLAMADA RÁPIDA (${customChannel.toUpperCase()}).`;

    // 1. Try Cloud Gemini 2.5 Flash if API Key is provided
    if (apiKey && apiKey.trim().length > 10) {
        const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash"];
        let lastErr = null;

        for (const modelName of modelsToTry) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": apiKey.trim()
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.65,
                            maxOutputTokens: 1600
                        }
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) return text;
                } else {
                    const errJson = await res.json().catch(() => ({}));
                    lastErr = new Error(errJson.error?.message || `HTTP ${res.status}`);
                }
            } catch (err) {
                lastErr = err;
            }
        }
        if (lastErr) throw lastErr;
    }

    // 2. Zero-Cost Fallback: Chrome Built-in Gemini Nano (`LanguageModel` / `window.ai`)
    try {
        const lmFactory = self.LanguageModel || window.ai?.languageModel;
        if (lmFactory && typeof lmFactory.create === "function") {
            const session = await lmFactory.create();
            const localResult = await session.prompt(prompt);
            if (session.destroy) session.destroy();
            if (localResult) return `⚡ [Generado con Chrome Gemini Nano Local · $0 API]\n\n${localResult}`;
        }
    } catch (nanoErr) {}

    throw new Error("Configura tu Google Gemini API Key gratuita en ⚙️ Ajustes (o habilita Chrome Built-in AI Gemini Nano).");
}

// Backward-compatible alias so legacy callers never fail
async function generateGeminiAnalysis(promptOrLead, apiKey) {
    if (typeof promptOrLead === "object") {
        return callGeminiAnalysis(apiKey, promptOrLead);
    }
    return callGeminiAnalysis(apiKey, { name: String(promptOrLead) });
}

/**
 * CSV, JSON, vCard Exporters & Webhook Dispatcher
 */
function exportToCsv(filename, rows) {
    if (!rows || !rows.length) return;
    const separator = ",";
    const keys = Object.keys(rows[0]).filter(k => !k.startsWith("_"));

    const csvContent = [
        keys.map(k => `"${k.replace(/"/g, '""')}"`).join(separator),
        ...rows.map(row =>
            keys.map(k => {
                const cell = row[k] === null || row[k] === undefined ? "" : String(row[k]);
                return `"${cell.replace(/"/g, '""')}"`;
            }).join(separator)
        )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportToVCard(filename, leads) {
    if (!leads || !leads.length) return;
    const vcfCards = leads.map(l => {
        const name = (l.name || "Lead").replace(/;/g, " ");
        const phone = l.phone || "";
        const email = l.email || "";
        const website = l.website || "";
        const address = (l.address || "").replace(/;/g, " ");
        const category = l.category || "";
        const note = `Score: ${l.lead_score || "N/A"} | Prioridad: ${l.priority || "Media"} | ${l.opportunities || ""}`;

        return [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `FN:${name}`,
            `ORG:${l.legal_name || name}`,
            category ? `TITLE:${category}` : "",
            phone ? `TEL;TYPE=WORK,VOICE:${phone}` : "",
            email ? `EMAIL;TYPE=WORK:${email}` : "",
            website ? `URL:${website}` : "",
            address ? `ADR;TYPE=WORK:;;${address};;;;` : "",
            note ? `NOTE:${note}` : "",
            "END:VCARD"
        ].filter(Boolean).join("\r\n");
    }).join("\r\n");

    const blob = new Blob([vcfCards], { type: "text/vcard;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function sendLeadsToWebhook(webhookUrl, leadsData) {
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
        throw new Error("URL de Webhook inválida.");
    }
    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            source: "AtlasIQ Enterprise v4.0",
            timestamp: new Date().toISOString(),
            total_leads: leadsData.length,
            leads: leadsData
        })
    });
    if (!response.ok) {
        throw new Error(`Error en Webhook: HTTP ${response.status}`);
    }
    return await response.text();
}

function playAudioNotification(type = "success") {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        if (type === "success") {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = "sine";
            osc2.type = "sine";
            osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc2.frequency.setValueAtTime(880.0, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.12);
            osc2.start(ctx.currentTime + 0.1);
            osc2.stop(ctx.currentTime + 0.45);
        }
    } catch (e) {}
}

/**
 * ============================================================================
 * Spatial Grid-Indexed Geodesic Proximity Engine — O(N) High-Speed Architecture
 * ============================================================================
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const pLat1 = parseFloat(lat1);
    const pLon1 = parseFloat(lon1);
    const pLat2 = parseFloat(lat2);
    const pLon2 = parseFloat(lon2);
    if (isNaN(pLat1) || isNaN(pLon1) || isNaN(pLat2) || isNaN(pLon2)) return null;

    const R = 6371;
    const dLat = (pLat2 - pLat1) * Math.PI / 180;
    const dLon = (pLon2 - pLon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(pLat1 * Math.PI / 180) * Math.cos(pLat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateCentroid(leads) {
    let latSum = 0;
    let lonSum = 0;
    let validCount = 0;

    for (const lead of leads) {
        const lat = parseFloat(lead.latitude);
        const lon = parseFloat(lead.longitude);
        if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
            latSum += lat;
            lonSum += lon;
            validCount++;
        }
    }

    if (validCount === 0) return null;
    return { lat: latSum / validCount, lon: lonSum / validCount, validCount };
}

function normalizeCategory(cat) {
    if (!cat) return "";
    return cat.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * O(N) Spatial Grid Bucketing Nearest-Neighbor Search (Replaces legacy O(N^2) nested scan)
 */
function calculateInterBusinessDistances(leads) {
    const CELL_DEG = 0.02; // ~2.2 km grid buckets
    const grid = new Map();
    const validLeads = [];

    for (const l of leads) {
        const lat = parseFloat(l.latitude);
        const lon = parseFloat(l.longitude);
        if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;
        const gx = Math.floor(lat / CELL_DEG);
        const gy = Math.floor(lon / CELL_DEG);
        const key = `${gx}:${gy}`;
        l._gx = gx;
        l._gy = gy;
        l._normCat = normalizeCategory(l.category);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(l);
        validLeads.push(l);
    }

    for (const cur of validLeads) {
        let minSameCatDist = Infinity;
        let nearestSameCatName = "";
        let minAnyDist = Infinity;
        let nearestAnyName = "";

        // Search 5x5 local spatial neighborhood (~11km x 11km) first in O(1) cell lookups
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const bucket = grid.get(`${cur._gx + dx}:${cur._gy + dy}`);
                if (!bucket) continue;
                for (const other of bucket) {
                    if (other === cur) continue;
                    const d = haversineDistance(cur.latitude, cur.longitude, other.latitude, other.longitude);
                    if (d === null) continue;
                    if (d < minAnyDist) {
                        minAnyDist = d;
                        nearestAnyName = other.name;
                    }
                    if (cur._normCat && other._normCat === cur._normCat && d < minSameCatDist) {
                        minSameCatDist = d;
                        nearestSameCatName = other.name;
                    }
                }
            }
        }

        // Fallback only if sparse rural dataset had zero neighbors within 11km
        if (minAnyDist === Infinity && validLeads.length <= 800) {
            for (const other of validLeads) {
                if (other === cur) continue;
                const d = haversineDistance(cur.latitude, cur.longitude, other.latitude, other.longitude);
                if (d !== null && d < minAnyDist) {
                    minAnyDist = d;
                    nearestAnyName = other.name;
                }
            }
        }

        cur.nearestPeerDistanceKm = minSameCatDist !== Infinity ? minSameCatDist : (minAnyDist !== Infinity ? minAnyDist : null);
        cur.nearestPeerName = minSameCatDist !== Infinity ? nearestSameCatName : nearestAnyName;
        delete cur._gx;
        delete cur._gy;
        delete cur._normCat;
    }
}

const BENCHMARK_URBAN_NICHES = [
    { name: "Supermercado / Bodegón", categoryKeywords: ["supermercado", "alimentacion", "viveres", "bodegon", "tienda"] },
    { name: "Panadería & Cafetería", categoryKeywords: ["panaderia", "cafeteria", "pasteleria", "cafe"] },
    { name: "Farmacia & Salud", categoryKeywords: ["farmacia", "botica", "drogueria", "salud"] },
    { name: "Gimnasio & Centro Fitness", categoryKeywords: ["gimnasio", "fitness", "crossfit", "deportes", "entrenamiento"] },
    { name: "Veterinaria & Pet Shop", categoryKeywords: ["veterinaria", "mascotas", "pet", "animales"] },
    { name: "Servicio Técnico Especializado", categoryKeywords: ["reparacion", "tecnico", "taller", "mecanico", "mantenimiento"] },
    { name: "Clínica & Odontología", categoryKeywords: ["clinica", "dentista", "odontologia", "medico", "consultorio"] },
    { name: "Coworking & Centro Ejecutivo", categoryKeywords: ["coworking", "oficinas", "centro de negocios"] },
    { name: "Inmobiliaria & PropTech", categoryKeywords: ["inmobiliaria", "bienes raices", "propiedades"] },
    { name: "Estética & MedSpa", categoryKeywords: ["estetica", "belleza", "peluqueria", "barberia", "spa"] }
];

function analyzeMarketSaturation(leads, targetNiche = "all", referenceCenter = null) {
    if (!leads || leads.length === 0) {
        return { empty: true, message: "No hay prospectos en la base de datos para analizar." };
    }

    let targetLeads = leads;
    const isAll = !targetNiche || targetNiche === "all";
    if (!isAll) {
        const normTarget = normalizeCategory(targetNiche);
        targetLeads = leads.filter(l => normalizeCategory(l.category) === normTarget);
        if (targetLeads.length === 0) {
            targetLeads = leads.filter(l => normalizeCategory(l.category).includes(normTarget));
        }
    }

    const totalCompetitors = targetLeads.length;
    const centroid = referenceCenter || calculateCentroid(targetLeads) || calculateCentroid(leads);
    const validCoords = targetLeads.filter(l => !isNaN(parseFloat(l.latitude)) && !isNaN(parseFloat(l.longitude)));

    const distancesFromCenter = [];
    if (centroid) {
        validCoords.forEach(l => {
            const d = haversineDistance(centroid.lat, centroid.lon, l.latitude, l.longitude);
            if (d !== null) {
                l.distanceKm = d;
                distancesFromCenter.push(d);
            }
        });
    }

    distancesFromCenter.sort((a, b) => a - b);
    const effectiveRadiusKm = distancesFromCenter.length > 0
        ? Math.max(distancesFromCenter[Math.floor(distancesFromCenter.length * 0.9)], 0.5)
        : 1.5;
    const areaKm2 = Math.PI * Math.pow(effectiveRadiusKm, 2);
    const densityPerKm2 = areaKm2 > 0 ? parseFloat((totalCompetitors / areaKm2).toFixed(2)) : 0;

    // Reuse precomputed nearestPeerDistanceKm in O(N)
    let peerDistancesSum = 0;
    let peerDistancesCount = 0;
    let minPeerDist = Infinity;
    let maxPeerDist = 0;

    for (const l of validCoords) {
        const d = l.nearestPeerDistanceKm;
        if (typeof d === "number" && !isNaN(d)) {
            peerDistancesSum += d;
            peerDistancesCount++;
            if (d < minPeerDist) minPeerDist = d;
            if (d > maxPeerDist) maxPeerDist = d;
        }
    }

    const avgCompetitorDistanceKm = peerDistancesCount > 0
        ? parseFloat((peerDistancesSum / peerDistancesCount).toFixed(2))
        : null;

    let saturationIndex = 25;
    if (densityPerKm2 >= 10) saturationIndex += 35;
    else if (densityPerKm2 >= 5) saturationIndex += 25;
    else if (densityPerKm2 >= 2) saturationIndex += 15;
    else saturationIndex += 5;

    if (totalCompetitors >= 40) saturationIndex += 25;
    else if (totalCompetitors >= 20) saturationIndex += 18;
    else if (totalCompetitors >= 10) saturationIndex += 10;
    else saturationIndex += 4;

    if (avgCompetitorDistanceKm !== null) {
        if (avgCompetitorDistanceKm < 0.25) saturationIndex += 25;
        else if (avgCompetitorDistanceKm < 0.5) saturationIndex += 18;
        else if (avgCompetitorDistanceKm < 1.0) saturationIndex += 10;
        else saturationIndex += 3;
    }

    saturationIndex = Math.min(100, Math.max(10, saturationIndex));

    let saturationLevel = "Océano Azul (Baja)";
    let saturationColor = "#10b981";
    let saturationTag = "OPORTUNIDAD ALTA";
    if (saturationIndex >= 70) {
        saturationLevel = "Alta Saturación (Zona Roja)";
        saturationColor = "#ef4444";
        saturationTag = "MERCADO SATURADO";
    } else if (saturationIndex >= 40) {
        saturationLevel = "Competitivo (Media)";
        saturationColor = "#f59e0b";
        saturationTag = "MERCADO EQUILIBRADO";
    }

    let withoutWebCount = 0;
    let withoutPixelCount = 0;
    let lowRatingCount = 0;

    targetLeads.forEach(l => {
        if (!l.website || l.website.trim() === "") withoutWebCount++;
        else {
            const stack = (l.tech_stack || "").toLowerCase();
            if (!stack.includes("pixel") && !stack.includes("gtm")) withoutPixelCount++;
        }
        const rating = parseFloat(l.averageRating);
        if (rating && rating < 4.0) lowRatingCount++;
    });

    const withoutWebsitePct = totalCompetitors > 0 ? Math.round((withoutWebCount / totalCompetitors) * 100) : 0;
    const withoutPixelPct = totalCompetitors > 0 ? Math.round((withoutPixelCount / totalCompetitors) * 100) : 0;
    const lowRatingPct = totalCompetitors > 0 ? Math.round((lowRatingCount / totalCompetitors) * 100) : 0;

    const quadrants = { NE: 0, NW: 0, SE: 0, SW: 0 };
    if (centroid) {
        validCoords.forEach(l => {
            const lat = parseFloat(l.latitude);
            const lon = parseFloat(l.longitude);
            if (lat >= centroid.lat && lon >= centroid.lon) quadrants.NE++;
            else if (lat >= centroid.lat && lon < centroid.lon) quadrants.NW++;
            else if (lat < centroid.lat && lon >= centroid.lon) quadrants.SE++;
            else quadrants.SW++;
        });
    }

    let minQuadKey = "NE";
    let minQuadCount = Infinity;
    Object.entries(quadrants).forEach(([k, count]) => {
        if (count < minQuadCount) {
            minQuadCount = count;
            minQuadKey = k;
        }
    });

    const quadrantNames = { NE: "Noreste (NE)", NW: "Noroeste (NW)", SE: "Sureste (SE)", SW: "Suroeste (SW)" };

    const presentCategories = new Set(leads.map(l => normalizeCategory(l.category)).filter(Boolean));
    const opportunityNiches = [];

    BENCHMARK_URBAN_NICHES.forEach(benchmark => {
        let matched = false;
        for (const kw of benchmark.categoryKeywords) {
            for (const pc of presentCategories) {
                if (pc.includes(kw)) { matched = true; break; }
            }
            if (matched) break;
        }
        if (!matched) {
            opportunityNiches.push({
                name: benchmark.name,
                reason: "Categoría ausente o desatendida en el cuadrante analizado.",
                viability: "Muy Alta",
                searchKeyword: benchmark.categoryKeywords[0]
            });
        }
    });

    if (opportunityNiches.length === 0) {
        opportunityNiches.push(
            { name: "Dark Kitchen & Delivery Gourmet", reason: "Alta densidad comercial apta para e-commerce gastronómico.", viability: "Alta", searchKeyword: "delivery comida" },
            { name: "Centro MedSpa & Wellness", reason: "Diferenciación de alto ticket en zona consolidada.", viability: "Media-Alta", searchKeyword: "estetica spa" }
        );
    }

    const distText = avgCompetitorDistanceKm !== null
        ? (avgCompetitorDistanceKm < 1 ? `${Math.round(avgCompetitorDistanceKm * 1000)} metros` : `${avgCompetitorDistanceKm} km`)
        : "distancia variable";

    let strategicAdvice = "";
    if (saturationIndex >= 70) {
        strategicAdvice = `Cuadrante saturado con ${totalCompetitors} competidores en un radio de ${effectiveRadiusKm.toFixed(1)} km (separación promedio: ${distText}). OPORTUNIDAD B2B: El ${withoutWebsitePct}% carece de sitio web y el ${withoutPixelPct}% no mide conversiones. Vende diferenciación digital agresiva o expande hacia el sector ${quadrantNames[minQuadKey]}.`;
    } else if (saturationIndex >= 40) {
        strategicAdvice = `Mercado en equilibrio competitivo (${densityPerKm2} negocios/km², cercanía promedio: ${distText}). Alta demanda validada con margen claro para captar cuota mediante automatización y SEO Local.`;
    } else {
        strategicAdvice = `Océano Azul detectado (${totalCompetitors} competidores en ${areaKm2.toFixed(1)} km², separación: ${distText}). Baja presión competitiva ideal para posicionamiento rápido en Top 3 de Google Maps.`;
    }

    return {
        empty: false,
        targetNiche: isAll ? "Todos los rubros" : targetNiche,
        totalCompetitors,
        densityPerKm2,
        avgCompetitorDistanceKm,
        minPeerDist: minPeerDist !== Infinity ? minPeerDist : null,
        maxPeerDist,
        effectiveRadiusKm,
        areaKm2: parseFloat(areaKm2.toFixed(1)),
        saturationIndex,
        saturationLevel,
        saturationColor,
        saturationTag,
        digitalVulnerability: { withoutWebsitePct, withoutPixelPct, lowRatingPct },
        quadrants,
        leastDenseQuadrant: quadrantNames[minQuadKey],
        leastDenseCount: minQuadCount,
        opportunityNiches: opportunityNiches.slice(0, 4),
        strategicAdvice,
        centroid
    };
}

function detectUserLocation(callback) {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (callback) callback({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    source: "gps",
                    label: "GPS Preciso",
                    detectedAt: Date.now()
                });
            },
            () => fetchIpGeolocation(callback),
            { timeout: 5000, maximumAge: 300000 }
        );
    } else {
        fetchIpGeolocation(callback);
    }
}

async function fetchIpGeolocation(callback) {
    try {
        const res = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
            const data = await res.json();
            if (data && data.success !== false && data.latitude && data.longitude) {
                if (callback) callback({
                    lat: data.latitude,
                    lon: data.longitude,
                    city: data.city || "",
                    region: data.region || "",
                    country: data.country || "",
                    source: "ip",
                    label: `${data.city || data.region || "Ubicación"}, ${data.country || ""}`.trim().replace(/^,|,$/g, ""),
                    detectedAt: Date.now()
                });
                return;
            }
        }
    } catch (e) {}
    if (callback) callback(null);
}

/**
 * Full DNS Cyber-Deliverability Audit via Cloudflare DoH ($0): MX + SPF + DMARC
 */
const _mxVerificationCache = new Map();

async function queryDohTxt(domainName) {
    try {
        const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domainName)}&type=TXT`, {
            headers: { "Accept": "application/dns-json" },
            signal: AbortSignal.timeout(4500)
        });
        if (!r.ok) return [];
        const j = await r.json();
        return Array.isArray(j?.Answer) ? j.Answer.map(a => String(a.data || "").replace(/"/g, "")) : [];
    } catch (e) {
        return [];
    }
}

async function verifyDomainMx(input) {
    if (!input || typeof input !== "string") {
        return { valid: false, provider: "Inválido", spf: "missing", dmarc: "missing", records: [] };
    }

    let domain = input.trim();
    if (domain.includes("@")) domain = domain.split("@")[1].trim();
    else domain = domain.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].trim();

    if (!domain || !domain.includes(".")) {
        return { valid: false, provider: "Dominio inválido", spf: "missing", dmarc: "missing", records: [] };
    }

    const key = domain.toLowerCase();
    if (_mxVerificationCache.has(key)) return _mxVerificationCache.get(key);

    try {
        const [mxRes, rootTxt, dmarcTxt] = await Promise.all([
            fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(key)}&type=MX`, {
                headers: { "Accept": "application/dns-json" },
                signal: AbortSignal.timeout(5000)
            }),
            queryDohTxt(key),
            queryDohTxt(`_dmarc.${key}`)
        ]);

        const data = mxRes.ok ? await mxRes.json() : null;
        const hasSpf = rootTxt.some(t => t.toLowerCase().includes("v=spf1"));
        const hasDmarc = dmarcTxt.some(t => t.toLowerCase().includes("v=dmarc1"));

        if (data && data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0) {
            const records = data.Answer.map(a => a.data || "");
            const rawStr = records.join(" ").toLowerCase();
            let provider = "Servidor MX Activo";
            if (rawStr.includes("google") || rawStr.includes("googlemail")) provider = "Google Workspace";
            else if (rawStr.includes("outlook") || rawStr.includes("protection.outlook")) provider = "Microsoft 365";
            else if (rawStr.includes("zoho")) provider = "Zoho Mail";
            else if (rawStr.includes("protonmail")) provider = "Proton Mail";
            else if (rawStr.includes("hostinger") || rawStr.includes("ovh") || rawStr.includes("secureserver")) provider = "Hosting Dedicado";

            const result = {
                valid: true,
                provider,
                spf: hasSpf ? "present" : "missing",
                dmarc: hasDmarc ? "present" : "missing",
                records
            };
            _mxVerificationCache.set(key, result);
            return result;
        } else {
            const result = { valid: false, provider: "Sin servidor MX (Rebote Seguro)", spf: "missing", dmarc: "missing", records: [] };
            _mxVerificationCache.set(key, result);
            return result;
        }
    } catch (e) {
        return { valid: false, provider: "Error DNS (" + e.message + ")", spf: "unknown", dmarc: "unknown", records: [] };
    }
}

/**
 * Live Google PageSpeed Insights Mobile Performance & Core Web Vitals Audit ($0 Public Google API)
 */
const _pageSpeedCache = new Map();

async function auditWebsitePageSpeed(websiteUrl) {
    const clean = normalizeUrl(websiteUrl);
    if (!clean) throw new Error("El prospecto no tiene sitio web para auditar.");
    if (_pageSpeedCache.has(clean)) return _pageSpeedCache.get(clean);

    const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(clean)}&strategy=mobile&category=PERFORMANCE&category=SEO`;
    const res = await fetch(api, { signal: AbortSignal.timeout(22000) });
    if (!res.ok) {
        throw new Error(`PageSpeed API respondió HTTP ${res.status}`);
    }
    const json = await res.json();
    const perfScore = Math.round((json?.lighthouseResult?.categories?.performance?.score || 0) * 100);
    const seoScore = Math.round((json?.lighthouseResult?.categories?.seo?.score || 0) * 100);
    const lcpDisplay = json?.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue || "N/A";
    const fcpDisplay = json?.lighthouseResult?.audits?.["first-contentful-paint"]?.displayValue || "N/A";

    const report = {
        performance: perfScore,
        seo: seoScore,
        lcp: lcpDisplay,
        fcp: fcpDisplay,
        auditedAt: Date.now()
    };
    _pageSpeedCache.set(clean, report);
    return report;
}

/**
 * Publish Interactive Trojan-Horse Audit Landing Page to Cloudflare Worker
 */
async function publishLiveCloudAudit(edgeWorkerUrl, lead, branding = {}) {
    if (!edgeWorkerUrl || !edgeWorkerUrl.startsWith("http")) {
        throw new Error("Configura primero la URL de tu Cloudflare Edge Worker en ⚙️ Ajustes.");
    }
    const slugBase = (lead.name || "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 32);
    const slug = `${slugBase}-${Math.floor(1000 + Math.random() * 9000)}`;

    const resp = await fetch(`${edgeWorkerUrl.replace(/\/$/, "")}/api/audit/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            slug,
            leadName: lead.name,
            category: lead.category,
            score: lead.lead_score || 75,
            website: lead.website || "",
            speedScore: lead.pagespeed_mobile ?? null,
            opportunities: lead.opportunities || "",
            nearestPeer: lead.nearestPeerName ? `${lead.nearestPeerName} (${lead.nearestPeerDistanceKm ? Math.round(lead.nearestPeerDistanceKm * 1000) + "m" : "cercano"})` : "",
            agencyName: branding.agencyName || "WINDOWSTELECOM",
            agencyWa: branding.agencyWa || "https://wa.me/584127785780"
        })
    });

    const data = await resp.json();
    if (!resp.ok || !data.auditUrl) {
        throw new Error(data.error || "No se pudo publicar el micrositio de auditoría.");
    }
    return data;
}

/**
 * Configurable White-Label Executive PDF Audit Generator v4.0 (jsPDF)
 */
function generateLeadPdfAudit(lead, branding = {}) {
    if (!lead) return;
    const jspdfModule = (typeof window !== "undefined" && window.jspdf) ? window.jspdf : (typeof jspdf !== "undefined" ? jspdf : null);
    if (!jspdfModule || !jspdfModule.jsPDF) {
        alert("La biblioteca jsPDF no está cargada.");
        return;
    }

    const agencyName = branding.agencyName || "WINDOWSTELECOM";
    const consultantName = branding.consultantName || "Joseph Castillo – CEO & Principal Strategist";
    const agencyWeb = branding.agencyWeb || "windowstelecom.com";

    const doc = new jspdfModule.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;

    // 1. Header Banner
    doc.setFillColor(11, 15, 25);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 40, pageWidth, 2.5, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`${agencyName}  |  AtlasIQ Deep Intelligence v4.0`, margin, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("AUDITORÍA EJECUTIVA DE HUELLA DIGITAL, VELOCIDAD WEB & PRESIÓN GEOESPACIAL", margin, 23);

    const todayStr = new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
    doc.text(`Fecha: ${todayStr}  |  Ref: ATQ4-${Math.floor(100000 + Math.random() * 900000)}`, margin, 30);

    // 2. Business Title & OSINT
    let y = 51;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(String(lead.name || "Empresa Auditada").substring(0, 62), margin, y);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    const osintLine = [
        `Rubro: ${lead.category || "Comercial"}`,
        lead.legal_name ? `Entidad: ${lead.legal_name}` : "",
        lead.tax_id ? `ID Fiscal: ${lead.tax_id}` : ""
    ].filter(Boolean).join("  •  ");
    doc.text(osintLine.substring(0, 95), margin, y);

    // 3. Score Card
    y += 8;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 31, 3, 3, "FD");

    const score = parseInt(lead.lead_score) || 65;
    const scoreColor = score >= 75 ? [16, 185, 129] : (score >= 50 ? [245, 158, 11] : [239, 68, 68]);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Índice de Oportunidad y Potencial de Captación (Score v4.0):", margin + 6, y + 9);

    doc.setFontSize(17);
    doc.setTextColor(scoreColor[0], scoreColor[1], scoreColor[2]);
    doc.text(`${score} / 100`, margin + 6, y + 19);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(lead.opportunities || "Oportunidad de expansión multicanal").substring(0, 82), margin + 38, y + 18);

    doc.setFillColor(226, 232, 240);
    doc.roundedRect(margin + 6, y + 24, contentWidth - 12, 3, 1.5, 1.5, "F");
    doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
    doc.roundedRect(margin + 6, y + 24, (contentWidth - 12) * (score / 100), 3, 1.5, 1.5, "F");

    // 4. Deep Technical Matrix
    y += 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text("1. Auditoría Profunda de Activos Digitales y Ciberseguridad", margin, y);

    y += 5;
    const speedTxt = typeof lead.pagespeed_mobile === "number" ? ` (PageSpeed Móvil: ${lead.pagespeed_mobile}/100, LCP: ${lead.pagespeed_lcp || "N/A"})` : "";
    const dmarcTxt = lead.dmarc_status === "present" ? "SPF+DMARC Protegido" : (lead.dmarc_status === "missing" ? "Sin DMARC (Riesgo Spoofing)" : "DoH");

    const checks = [
        { label: "Presencia Web & Velocidad:", val: lead.website ? `${extractDomain(lead.website)}${speedTxt}` : "CRÍTICO: Sin sitio web activo (fuga directa de clientes)", ok: !!lead.website && (lead.pagespeed_mobile === null || lead.pagespeed_mobile >= 55) },
        { label: "Propiedad Google Maps:", val: lead.unclaimed ? "ALERTA: Perfil sin reclamar oficialmente en Google Business" : `Verificado · ${lead.averageRating || "N/A"}★ (${lead.reviewCount || 0} reseñas)`, ok: !lead.unclaimed },
        { label: "Email & Seguridad DNS:", val: lead.email ? `${lead.email} (${lead.mx_provider || "MX"} · ${dmarcTxt})` : "Sin buzón corporativo público detectado", ok: !!lead.email && lead.dmarc_status !== "missing" },
        { label: "Stack & Píxeles Ads:", val: lead.tech_stack || "Sin analítica ni píxeles de retargeting detectados", ok: !!lead.tech_stack && lead.ad_spend_active },
        { label: "Reservas / E-Commerce:", val: lead.booking_platform ? `Integrado con ${lead.booking_platform}` : "Sin motor automatizado de citas/pedidos detectado", ok: !!lead.booking_platform },
        { label: "Decisor / Contacto:", val: `${lead.decision_maker || "Gerencia"}  •  Tel: ${lead.phone || "No listado"}`, ok: !!lead.phone }
    ];

    checks.forEach((item) => {
        doc.setFillColor(item.ok ? 240 : 254, item.ok ? 253 : 242, item.ok ? 244 : 242);
        doc.roundedRect(margin, y, contentWidth, 8.5, 1.5, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(item.label, margin + 3.5, y + 5.7);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.2);
        doc.setTextColor(item.ok ? 21 : 185, item.ok ? 128 : 28, item.ok ? 61 : 28);
        doc.text(String(item.val).substring(0, 72), margin + 56, y + 5.7);
        y += 10;
    });

    // 5. Competitive Pressure
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text("2. Inteligencia Geoespacial y Competencia Cercana", margin, y);

    y += 5;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 21, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.setTextColor(51, 65, 85);
    const pDist = lead.nearestPeerDistanceKm
        ? (lead.nearestPeerDistanceKm < 1 ? `${Math.round(lead.nearestPeerDistanceKm * 1000)} m` : `${lead.nearestPeerDistanceKm.toFixed(1)} km`)
        : null;
    doc.text(pDist ? `Competidor directo más cercano detectado a ${pDist}: ${lead.nearestPeerName || "Mismo rubro"}.` : "Cuadrante comercial con competencia local activa en Google Maps.", margin + 4, y + 7);
    doc.text("Los comercios con web rápida (<2.5s), SEO Local optimizado y respuesta automática por WhatsApp", margin + 4, y + 13);
    doc.text("absorben hasta el 72% de los clics de alta intención en su radio inmediato.", margin + 4, y + 18);

    // 6. Action Plan
    y += 28;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text("3. Hoja de Ruta Recomendada (Implementación en 30 Días)", margin, y);

    y += 5;
    const steps = [
        "Optimización de Ficha Google Business Profile + Automatización de Reseñas 5★.",
        "Arquitectura Web Móvil Ultra-Rápida (>90 PageSpeed) con Embudo a WhatsApp CRM.",
        "Instalación de Meta Pixel, Google Ads Tag y Campañas Hiperlocales de Retargeting.",
        "Blindaje de Dominio Corporativo (MX, SPF, DMARC) y Agendamiento Online 24/7."
    ];
    steps.forEach((st, i) => {
        doc.setFillColor(238, 242, 255);
        doc.circle(margin + 3.5, y + 3.5, 2.8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(37, 99, 235);
        doc.text(String(i + 1), margin + 2.6, y + 5.2);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.8);
        doc.setTextColor(30, 41, 59);
        doc.text(st, margin + 10, y + 5.2);
        y += 8.2;
    });

    // Footer
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${consultantName}  |  ${agencyName}`, margin, pageHeight - 13.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generado con AtlasIQ Enterprise v4.0  •  ${agencyWeb}  •  Auditoría Confidencial`, margin, pageHeight - 8.5);

    const safeName = String(lead.name || "Empresa").replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, "_").substring(0, 35);
    doc.save(`${safeName}_Auditoria_${agencyName.replace(/\s+/g, "_")}.pdf`);
    playAudioNotification("success");
}
