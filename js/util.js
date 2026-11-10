/**
 * AtlasIQ Enterprise - Core Utilities & Intelligence Engine
 * Grade: Silicon Valley Professional
 */

// Universal Helper: Extract Query Parameter
function getQueryString(name) {
    const reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
    const r = window.location.search.substring(1).match(reg);
    return r !== null ? decodeURIComponent(r[2]) : null;
}

// Clean and normalize URLs
function normalizeUrl(url) {
    if (!url) return "";
    let clean = url.trim();
    if (clean.startsWith("//")) clean = "https:" + clean;
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) clean = "https://" + clean;
    try {
        const parsed = new URL(clean);
        return parsed.toString();
    } catch (e) {
        return clean;
    }
}

// Extract base domain from URL
function extractDomain(url) {
    if (!url) return "";
    try {
        const parsed = new URL(normalizeUrl(url));
        return parsed.hostname.replace(/^www\./, "");
    } catch (e) {
        return "";
    }
}

// Normalize Phone Number for International E.164 & WhatsApp
function formatPhone(phone, countryCodeHint = "") {
    if (!phone) return { clean: "", international: "", whatsappUrl: "" };
    const digitsOnly = phone.replace(/[^\d+]/g, "");
    let clean = digitsOnly.replace(/^00/, "+");
    let waDigits = clean.replace(/\+/g, "");
    
    // If not starting with '+' and a regional hint is available
    if (!clean.startsWith("+") && countryCodeHint && !waDigits.startsWith(countryCodeHint)) {
        waDigits = countryCodeHint + waDigits;
        clean = "+" + waDigits;
    }

    return {
        original: phone,
        clean: clean,
        whatsappUrl: waDigits && waDigits.length >= 8 ? `https://wa.me/${waDigits}` : ""
    };
}

/**
 * Lead Opportunity Scoring Engine (0 - 100)
 * Evaluates commercial opportunity & digital readiness for B2B sales agencies.
 */
function calculateLeadScore(lead) {
    let score = 50; // Base score
    const opportunities = [];

    // 1. Digital Presence Gaps (High Opportunity for Agencies)
    if (!lead.website || lead.website.trim() === "") {
        score += 25; // Massive opportunity to sell website design / development
        opportunities.push("Sin Sitio Web (Oportunidad Web)");
    } else {
        // Has website: check tech stack & social signals
        score += 5; // Verified digital presence
        
        if (lead.tech_stack) {
            const tech = lead.tech_stack.toLowerCase();
            if (tech.includes("wordpress") || tech.includes("wix")) {
                opportunities.push("CMS Tradicional (Oportunidad Rediseño)");
            }
            if (!tech.includes("pixel") && !tech.includes("tag manager")) {
                score += 10;
                opportunities.push("Sin Pixel de Conversión (Oportunidad Ads)");
            }
        }
    }

    // 2. Contactability
    if (lead.phone && lead.phone.length > 6) {
        score += 10;
    } else {
        opportunities.push("Teléfono no detectado");
    }

    if (lead.email && lead.email.includes("@")) {
        score += 15;
    } else {
        opportunities.push("Email pendiente");
    }

    // 3. Social Media Presence
    const hasSocial = Boolean(lead.instagram || lead.facebook || lead.linkedin || lead.twitter);
    if (!hasSocial && lead.website) {
        score += 10;
        opportunities.push("Baja Presencia en RRSS");
    }

    // 4. Google Reviews & Reputation Analysis
    const rating = parseFloat(lead.averageRating) || 0;
    const reviews = parseInt(lead.reviewCount) || 0;

    if (rating >= 4.5 && reviews < 25) {
        score += 10;
        opportunities.push("Excelente Calificación, Pocas Reseñas");
    } else if (rating < 4.0 && reviews > 10) {
        opportunities.push("Gestión de Reputación / Feedback");
    } else if (reviews > 100) {
        score += 10;
        opportunities.push("Negocio Consolidado / Alto Tráfico");
    }

    // Clamp score to 10 - 99
    score = Math.min(99, Math.max(15, score));

    // Priority Tier
    let priority = "Media";
    let priorityColor = "#f59e0b"; // amber
    if (score >= 75) {
        priority = "Alta";
        priorityColor = "#10b981"; // emerald
    } else if (score < 45) {
        priority = "Baja";
        priorityColor = "#94a3b8"; // slate
    }

    return {
        score: score,
        priority: priority,
        priorityColor: priorityColor,
        opportunities: opportunities
    };
}

/**
 * Cold Outreach Pitch Generator
 * Generates tailored Cold Email & WhatsApp pitches based on detected business gaps.
 */
function generateOutreachPitch(lead, channel = "whatsapp") {
    const name = lead.name || "Estimado equipo";
    const category = lead.category || "su negocio";
    const city = lead.address ? lead.address.split(",")[1] || lead.address.split(",")[0] : "su zona";
    const rating = lead.averageRating ? `${lead.averageRating}★` : "excelente reputación";
    
    let specificPitch = "";
    if (!lead.website) {
        specificPitch = `noté que actualmente no cuentan con un sitio web moderno adaptado a móviles para capturar clientes directamente en Google.`;
    } else if (!lead.instagram && !lead.facebook) {
        specificPitch = `estuve revisando su presencia digital y veo que tienen gran potencial para multiplicar reservas/ventas si optimizan sus canales de redes sociales y publicidad digital.`;
    } else {
        specificPitch = `veo que ya tienen un buen posicionamiento con ${rating}. Queremos presentarles un sistema para automatizar la captura de clientes y superar a sus competidores locales.`;
    }

    if (channel === "whatsapp") {
        return `Hola, un gusto saludarlos en *${name}* 👋\n\nEstuve revisando los mejores negocios de ${category} en ${city.trim()} y me llamó la atención su trabajo (${rating}).\n\nSin embargo, ${specificPitch}\n\n¿Quién es la persona encargada del área comercial o marketing con quien pueda compartirle una breve propuesta de 2 minutos sin compromiso?\n\n¡Muchas gracias!`;
    } else {
        // Cold Email
        return `Asunto: Oportunidad de captación digital para ${name}\n\nHola equipo de ${name},\n\nEspero que se encuentren muy bien. Los contacto porque analicé recientemente las empresas destacadas de ${category} en ${city.trim()} y su perfil resalta de forma positiva (${rating}).\n\nAnalizando su ecosistema comercial, ${specificPitch}\n\nDesarrollamos soluciones especializadas para el sector de ${category} que ayudan a incrementar la facturación entre un 25% y 40% mediante captación automatizada.\n\n¿Tendrían 5 minutos esta semana para una llamada breve o prefieren que les comparta un video explicativo de 2 minutos?\n\nSaludos cordiales,\nEquipo Comercial`;
    }
}

/**
 * Modern CSV Exporter with UTF-8 BOM
 * Ensures Excel correctly displays accents and Spanish characters (ñ, á, é, í, ó, ú).
 */
function exportToCsv(filename, rows) {
    if (!rows || !rows.length) return;
    const separator = ",";
    const keys = Object.keys(rows[0]);
    
    const csvContent = [
        keys.map(k => `"${k.replace(/"/g, '""')}"`).join(separator),
        ...rows.map(row => 
            keys.map(k => {
                let cell = row[k] === null || row[k] === undefined ? "" : String(row[k]);
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

/**
 * Export to JSON
 */
function exportToJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export to vCard (.vcf)
 * Allows users to import hundreds of B2B leads directly into Android/iOS/Google Contacts in 1 click.
 */
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
            `ORG:${name}`,
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

/**
 * Webhook Dispatcher
 * Pushes leads directly to Zapier, Make, n8n, GoHighLevel, or HubSpot.
 */
async function sendLeadsToWebhook(webhookUrl, leadsData) {
    if (!webhookUrl || !webhookUrl.startsWith("http")) {
        throw new Error("URL de Webhook inválida.");
    }
    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            source: "AtlasIQ Enterprise",
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

/**
 * Live Google Gemini AI Strategic Lead Audit
 * Calls Gemini 1.5/2.0 API directly with full context on the lead.
 */
async function callGeminiAnalysis(apiKey, lead) {
    if (!apiKey) {
        throw new Error("Por favor configura tu Gemini API Key en el menú de ⚙️ Ajustes.");
    }

    const prompt = `Actúa como el Director Comercial de una agencia digital de élite en Silicon Valley.
Analiza este prospecto B2B obtenido de Google Maps y genera un reporte estratégico de prospección:

DATOS DEL PROSPECTO:
- Nombre: ${lead.name || "N/A"}
- Rubro/Categoría: ${lead.category || "N/A"}
- Calificación: ${lead.averageRating || "N/A"} estrellas (${lead.reviewCount || 0} reseñas)
- Sitio Web: ${lead.website || "No tiene sitio web"}
- Redes Sociales: Instagram (${lead.instagram || "No"}), Facebook (${lead.facebook || "No"}), LinkedIn (${lead.linkedin || "No"})
- Tech Stack Detectado: ${lead.tech_stack || "Ninguno detectado"}
- Dirección / Zona: ${lead.address || "N/A"}

RESPONDE CON EL SIGUIENTE FORMATO CLARO Y DIRECTO EN ESPAÑOL:
1. 🎯 ICP FIT SCORE (1-100) y por qué este cliente vale la pena.
2. 🔍 DIAGNÓSTICO DE VULNERABILIDAD DIGITAL (¿Qué les falta y cuánto dinero están perdiendo por no tenerlo?).
3. 🎣 GANCHO COMERCIAL IRRESISTIBLE (Una frase de impacto para captar la atención del dueño o gerente en 5 segundos).
4. 💬 PITCH DE WHATSAPP ULTRA-CONVERTIDOR (Corto, humano, directo, sin sonar a spam corporativo).
5. 📞 GUIÓN RÁPIDO PARA LLAMADA FRÍA (Cold Calling de 30 segundos).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1200
            }
        })
    });

    if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Error HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar la respuesta de IA.";
}

/**
 * Web Audio Synthesizer (Zero dependencies, pure browser audio)
 * Plays pleasant notification chimes for extraction completion or high-score discovery.
 */
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
            osc2.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.12);
            osc2.start(ctx.currentTime + 0.1);
            osc2.stop(ctx.currentTime + 0.5);
        }
    } catch (e) {}
}

/**
 * ============================================================================
 * AtlasIQ GeoIntelligence & Market Saturation Engine (Silicon Valley Grade)
 * ============================================================================
 */

/**
 * Geodesic Haversine Distance (km)
 * Accurately measures physical distance between any two GPS coordinates.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === null || lat1 === undefined || lon1 === null || lon1 === undefined ||
        lat2 === null || lat2 === undefined || lon2 === null || lon2 === undefined) {
        return null;
    }
    const pLat1 = parseFloat(lat1);
    const pLon1 = parseFloat(lon1);
    const pLat2 = parseFloat(lat2);
    const pLon2 = parseFloat(lon2);
    if (isNaN(pLat1) || isNaN(pLon1) || isNaN(pLat2) || isNaN(pLon2)) return null;

    const R = 6371; // Earth radius in km
    const dLat = (pLat2 - pLat1) * Math.PI / 180;
    const dLon = (pLon2 - pLon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(pLat1 * Math.PI / 180) * Math.cos(pLat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Geometric Centroid
 * Computes the cluster center of gravity for scraped businesses.
 */
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
    return {
        lat: latSum / validCount,
        lon: lonSum / validCount,
        validCount: validCount
    };
}

/**
 * Normalize category string for strict vs broad matching
 */
function normalizeCategory(cat) {
    if (!cat) return "";
    return cat.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
}

/**
 * Measure Inter-business Proximity ("Distancia del uno al otro")
 * Calculates distance from each business to its closest competitor in the same niche.
 */
function calculateInterBusinessDistances(leads) {
    const validLeads = leads.filter(l => {
        const lat = parseFloat(l.latitude);
        const lon = parseFloat(l.longitude);
        return !isNaN(lat) && !isNaN(lon);
    });

    for (let i = 0; i < validLeads.length; i++) {
        const current = validLeads[i];
        const curCat = normalizeCategory(current.category);
        let minSameCatDist = Infinity;
        let nearestSameCatName = "";
        let minAnyDist = Infinity;
        let nearestAnyName = "";

        for (let j = 0; j < validLeads.length; j++) {
            if (i === j) continue;
            const other = validLeads[j];
            const d = haversineDistance(current.latitude, current.longitude, other.latitude, other.longitude);
            if (d === null) continue;

            if (d < minAnyDist) {
                minAnyDist = d;
                nearestAnyName = other.name;
            }

            if (curCat && normalizeCategory(other.category) === curCat) {
                if (d < minSameCatDist) {
                    minSameCatDist = d;
                    nearestSameCatName = other.name;
                }
            }
        }

        current.nearestPeerDistanceKm = minSameCatDist !== Infinity ? minSameCatDist : (minAnyDist !== Infinity ? minAnyDist : null);
        current.nearestPeerName = minSameCatDist !== Infinity ? nearestSameCatName : nearestAnyName;
    }
}

/**
 * Standard Urban Commercial Niches
 * Benchmark catalogue used to detect underrepresented / underserved opportunity sectors.
 */
const BENCHMARK_URBAN_NICHES = [
    { name: "Supermercado / Bodegón", categoryKeywords: ["supermercado", "alimentacion", "viveres", "bodegon", "tienda"] },
    { name: "Panadería & Cafetería", categoryKeywords: ["panaderia", "cafeteria", "pasteleria", "cafe"] },
    { name: "Farmacia & Cuidado Personal", categoryKeywords: ["farmacia", "botica", "drogueria", "salud"] },
    { name: "Gimnasio & Centro Fitness", categoryKeywords: ["gimnasio", "fitness", "crossfit", "deportes", "entrenamiento"] },
    { name: "Veterinaria & Pet Shop", categoryKeywords: ["veterinaria", "mascotas", "pet", "animales"] },
    { name: "Reparación & Servicio Técnico", categoryKeywords: ["reparacion", "tecnico", "taller", "mecanico", "mantenimiento"] },
    { name: "Clínica & Odontología", categoryKeywords: ["clinica", "dentista", "odontologia", "medico", "consultorio"] },
    { name: "Coworking & Oficinas Compartidas", categoryKeywords: ["coworking", "oficinas", "centro de negocios"] },
    { name: "Inmobiliaria & Bienes Raíces", categoryKeywords: ["inmobiliaria", "bienes raices", "propiedades"] },
    { name: "Centro de Estética & Belleza", categoryKeywords: ["estetica", "belleza", "peluqueria", "barberia", "spa"] }
];

/**
 * Market Saturation & Niche Intelligence Engine
 * Evaluates competitor density, geographic proximity, saturation index,
 * digital vulnerability, and recommends underserved opportunity niches.
 */
function analyzeMarketSaturation(leads, targetNiche = "all", referenceCenter = null) {
    if (!leads || leads.length === 0) {
        return {
            empty: true,
            message: "No hay prospectos en la base de datos para analizar."
        };
    }

    // 1. Determine Target Lead Population
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

    // 2. Centroid & Reference Center
    const centroid = referenceCenter || calculateCentroid(targetLeads) || calculateCentroid(leads);
    const validCoords = targetLeads.filter(l => {
        const lat = parseFloat(l.latitude);
        const lon = parseFloat(l.longitude);
        return !isNaN(lat) && !isNaN(lon);
    });

    // 3. Compute distances from center and between peers
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
    const effectiveRadiusKm = distancesFromCenter.length > 0 ? 
        Math.max(distancesFromCenter[Math.floor(distancesFromCenter.length * 0.9)], 0.5) : 1.5;
    const areaKm2 = Math.PI * Math.pow(effectiveRadiusKm, 2);
    const densityPerKm2 = areaKm2 > 0 ? parseFloat((totalCompetitors / areaKm2).toFixed(2)) : 0;

    // 4. Calculate Inter-Competitor Proximity (Distance to Nearest Competitor)
    let peerDistancesSum = 0;
    let peerDistancesCount = 0;
    let minPeerDist = Infinity;
    let maxPeerDist = 0;

    for (let i = 0; i < validCoords.length; i++) {
        let localMin = Infinity;
        for (let j = 0; j < validCoords.length; j++) {
            if (i === j) continue;
            const dist = haversineDistance(validCoords[i].latitude, validCoords[i].longitude, validCoords[j].latitude, validCoords[j].longitude);
            if (dist !== null && dist < localMin) {
                localMin = dist;
            }
        }
        if (localMin !== Infinity) {
            peerDistancesSum += localMin;
            peerDistancesCount++;
            if (localMin < minPeerDist) minPeerDist = localMin;
            if (localMin > maxPeerDist) maxPeerDist = localMin;
        }
    }

    const avgCompetitorDistanceKm = peerDistancesCount > 0 ? 
        parseFloat((peerDistancesSum / peerDistancesCount).toFixed(2)) : null;

    // 5. Saturation Score (0 - 100)
    // Factors: Density, Total count, and Proximity between competitors
    let saturationIndex = 25; // baseline

    // Density factor (up to 35 pts)
    if (densityPerKm2 >= 10) saturationIndex += 35;
    else if (densityPerKm2 >= 5) saturationIndex += 25;
    else if (densityPerKm2 >= 2) saturationIndex += 15;
    else saturationIndex += 5;

    // Total Count factor (up to 25 pts)
    if (totalCompetitors >= 40) saturationIndex += 25;
    else if (totalCompetitors >= 20) saturationIndex += 18;
    else if (totalCompetitors >= 10) saturationIndex += 10;
    else saturationIndex += 4;

    // Proximity factor: tightly packed competitors mean high local saturation (up to 25 pts)
    if (avgCompetitorDistanceKm !== null) {
        if (avgCompetitorDistanceKm < 0.25) saturationIndex += 25; // Less than 250m apart
        else if (avgCompetitorDistanceKm < 0.5) saturationIndex += 18;
        else if (avgCompetitorDistanceKm < 1.0) saturationIndex += 10;
        else saturationIndex += 3;
    }

    saturationIndex = Math.min(100, Math.max(10, saturationIndex));

    let saturationLevel = "Océano Azul (Baja)";
    let saturationColor = "#10b981"; // Emerald
    let saturationTag = "OPORTUNIDAD ALTA";
    if (saturationIndex >= 70) {
        saturationLevel = "Alta Saturación (Zona Roja)";
        saturationColor = "#ef4444"; // Red
        saturationTag = "MERCADO SATURADO";
    } else if (saturationIndex >= 40) {
        saturationLevel = "Competitivo (Media)";
        saturationColor = "#f59e0b"; // Amber
        saturationTag = "MERCADO EQUILIBRADO";
    }

    // 6. Digital Vulnerability Analysis
    let withoutWebCount = 0;
    let withoutPixelCount = 0;
    let lowRatingCount = 0;

    targetLeads.forEach(l => {
        if (!l.website || l.website.trim() === "") withoutWebCount++;
        else {
            const stack = (l.tech_stack || "").toLowerCase();
            if (!stack.includes("pixel") && !stack.includes("tag manager")) withoutPixelCount++;
        }
        const rating = parseFloat(l.averageRating);
        if (rating && rating < 4.0) lowRatingCount++;
    });

    const withoutWebsitePct = totalCompetitors > 0 ? Math.round((withoutWebCount / totalCompetitors) * 100) : 0;
    const withoutPixelPct = totalCompetitors > 0 ? Math.round((withoutPixelCount / totalCompetitors) * 100) : 0;
    const lowRatingPct = totalCompetitors > 0 ? Math.round((lowRatingCount / totalCompetitors) * 100) : 0;

    // 7. Spatial Quadrants Breakdown (NE, NW, SE, SW relative to centroid)
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

    const quadrantNames = {
        NE: "Noreste (NE)",
        NW: "Noroeste (NW)",
        SE: "Sureste (SE)",
        SW: "Suroeste (SW)"
    };

    // 8. Identify Underserved Opportunity Niches in the Scraped Quadrant
    const presentCategories = new Set(leads.map(l => normalizeCategory(l.category)).filter(Boolean));
    const opportunityNiches = [];

    BENCHMARK_URBAN_NICHES.forEach(benchmark => {
        let matched = false;
        for (const kw of benchmark.categoryKeywords) {
            for (const pc of presentCategories) {
                if (pc.includes(kw)) {
                    matched = true;
                    break;
                }
            }
            if (matched) break;
        }

        if (!matched) {
            opportunityNiches.push({
                name: benchmark.name,
                reason: "Categoría ausente o casi nula en el cuadrante analizado.",
                viability: "Muy Alta",
                searchKeyword: benchmark.categoryKeywords[0]
            });
        }
    });

    // If all benchmarks are present, suggest adjacent specialized verticals
    if (opportunityNiches.length === 0) {
        opportunityNiches.push(
            { name: "Dark Kitchen & Delivery Gourmet", reason: "Alta densidad comercial apta para e-commerce gastronómico.", viability: "Alta", searchKeyword: "delivery comida" },
            { name: "Centro de Estética & Wellness", reason: "Diferenciación de alto ticket en zona consolidada.", viability: "Media-Alta", searchKeyword: "estetica spa" }
        );
    }

    // 9. Strategic Diagnosis Formulation
    let strategicAdvice = "";
    const distText = avgCompetitorDistanceKm !== null ? 
        (avgCompetitorDistanceKm < 1 ? `${Math.round(avgCompetitorDistanceKm * 1000)} metros` : `${avgCompetitorDistanceKm} km`) : "distancia no precisada";

    if (saturationIndex >= 70) {
        strategicAdvice = `Cuadrante saturado con ${totalCompetitors} competidores en un radio de ${effectiveRadiusKm.toFixed(1)} km (separación promedio de ${distText}). No se recomienda abrir negocios idénticos tradicionales. OPORTUNIDAD: El ${withoutWebsitePct}% no tiene sitio web. Se recomienda un modelo disruptivo digital (delivery, e-commerce) o expandirse hacia el cuadrante ${quadrantNames[minQuadKey]} donde la competencia es un ${Math.max(40, 100 - Math.round((minQuadCount / Math.max(1, totalCompetitors)) * 100))}% menor.`;
    } else if (saturationIndex >= 40) {
        strategicAdvice = `Mercado en equilibrio competitivo (${densityPerKm2} competidores/km²). Existe demanda comercial activa y espacio para nuevos participantes con propuesta de valor diferenciada. La cercanía promedio es de ${distText}.`;
    } else {
        strategicAdvice = `Océano Azul detectado (${totalCompetitors} competidores en ${areaKm2.toFixed(1)} km²). Baja saturación comercial y amplia distancia entre puntos de venta (${distText}). Excelente viabilidad para instalación y captura rápida de cuota de mercado.`;
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
        digitalVulnerability: {
            withoutWebsitePct,
            withoutPixelPct,
            lowRatingPct
        },
        quadrants,
        leastDenseQuadrant: quadrantNames[minQuadKey],
        leastDenseCount: minQuadCount,
        opportunityNiches: opportunityNiches.slice(0, 4),
        strategicAdvice,
        centroid
    };
}

/**
 * Universal User Location Detector (Zero Cost)
 * 1. Checks Browser Geolocation API
 * 2. Fallbacks to free public IP Geolocation without API keys
 */
function detectUserLocation(callback) {
    // 1. Try Browser HTML5 Geolocation (high precision)
    if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = {
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    source: "gps",
                    label: "GPS Preciso",
                    detectedAt: Date.now()
                };
                if (callback) callback(loc);
            },
            (err) => {
                // Denied or unavailable, fallback to IP Geolocation
                fetchIpGeolocation(callback);
            },
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
                const loc = {
                    lat: data.latitude,
                    lon: data.longitude,
                    city: data.city || "",
                    region: data.region || "",
                    country: data.country || "",
                    source: "ip",
                    label: `${data.city || data.region || "Ubicación"}, ${data.country || ""}`.trim().replace(/^,|,$/g, ""),
                    detectedAt: Date.now()
                };
                if (callback) callback(loc);
                return;
            }
        }
    } catch (e) {}

    // Secondary fallback
    try {
        const res2 = await fetch("https://freeipapi.com/api/json", { signal: AbortSignal.timeout(4000) });
        if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.latitude && data2.longitude) {
                const loc = {
                    lat: data2.latitude,
                    lon: data2.longitude,
                    city: data2.cityName || "",
                    region: data2.regionName || "",
                    country: data2.countryName || "",
                    source: "ip",
                    label: `${data2.cityName || "Ubicación"}, ${data2.countryName || ""}`.trim().replace(/^,|,$/g, ""),
                    detectedAt: Date.now()
                };
                if (callback) callback(loc);
                return;
            }
        }
    } catch (e) {}

    if (callback) callback(null);
}

