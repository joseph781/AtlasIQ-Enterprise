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

const FAKE_WEB_HOSTS_UTIL = /(?:^|\.)(?:linktr\.ee|beacons\.ai|bio\.site|lnk\.bio|taplink\.cc|solo\.to|campsite\.bio|milkshake\.app|instagram\.com|instagr\.am|facebook\.com|fb\.com|tiktok\.com|wa\.me|wa\.link|api\.whatsapp\.com|canva\.site|sites\.google\.com|docs\.google\.com|forms\.gle|carrd\.co|bit\.ly)$/i;

function classifyWebsiteStatus(lead) {
    const raw = (lead && lead.website) ? String(lead.website).trim() : "";
    if (!raw) {
        return { status: "none", label: "⚡ Sin Web", shortBadge: "⚡ Sin Web", color: "#ef4444", bg: "rgba(239,68,68,0.14)", needsWeb: true };
    }
    let host = "";
    try {
        host = new URL(normalizeUrl(raw)).hostname.replace(/^www\./i, "").toLowerCase();
    } catch (_) {}

    if (lead.web_status === "social_link" || (host && FAKE_WEB_HOSTS_UTIL.test(host))) {
        return { status: "social_link", label: "🔗 Falsa Web (Linktree/RRSS)", shortBadge: "🔗 Solo Link/RRSS", color: "#f97316", bg: "rgba(249,115,22,0.16)", needsWeb: true };
    }
    if (lead.web_status === "broken") {
        return { status: "broken", label: "💀 Web Caída / Hosting Roto", shortBadge: "💀 Caída", color: "#dc2626", bg: "rgba(220,38,38,0.16)", needsWeb: true };
    }
    if (typeof lead.pagespeed_mobile === "number" && lead.pagespeed_mobile < 55) {
        return { status: "slow", label: `🐢 Móvil Lenta (${lead.pagespeed_mobile}/100)`, shortBadge: `🐢 ${lead.pagespeed_mobile}/100`, color: "#d97706", bg: "rgba(245,158,11,0.16)", needsWeb: true };
    }
    if (lead.web_status === "outdated" || (lead.copyright_year && lead.copyright_year <= 2022) || lead.has_viewport === false) {
        const yr = lead.copyright_year ? ` ©${lead.copyright_year}` : "";
        return { status: "outdated", label: `🦖 Web Obsoleta${yr}`, shortBadge: `🦖 Obsoleta${yr}`, color: "#d97706", bg: "rgba(245,158,11,0.15)", needsWeb: true };
    }
    if (lead.ssl_insecure) {
        return { status: "insecure", label: "🔓 Sin SSL (HTTP)", shortBadge: "🔓 Sin SSL", color: "#ea580c", bg: "rgba(234,88,12,0.15)", needsWeb: true };
    }
    return { status: "active", label: "✓ Web Propia Activa", shortBadge: "✓ Activa", color: "#10b981", bg: "rgba(16,185,129,0.14)", needsWeb: false };
}

const NICHE_REVENUE_PROFILES = [
    { key: "clinic", label: "Salud, Clínica & Odontología", rx: /cl[ií]nica|odont|dent|m[eé]dic|salud|hospital|pedia|dermat|oftalm|fisiot|psicol|veterin/i, avgTicket: 115, setupUsd: 890, retainerUsd: 197, botRole: "Recepcionista Médica IA 24/7 (Citas + Recordatorios Anti-Inasistencia)", heroHeadline: "Agenda tu valoración en menos de 60 segundos sin esperas telefónicas", sampleQ: "Hola, ¿tienen disponibilidad para consulta esta semana y qué costo tiene?", sampleA: "¡Hola! 👋 Sí, tenemos cupos disponibles mañana a las 10:30 AM y el jueves a las 4:00 PM. La valoración inicial incluye diagnóstico completo. ¿Cuál horario prefieres que te reserve ahora mismo?" },
    { key: "realestate", label: "Inmobiliaria & Bienes Raíces", rx: /inmobil|bienes\s*ra[ií]ces|propiedad|arquitect|construct|urbaniz|broker/i, avgTicket: 1850, setupUsd: 1200, retainerUsd: 297, botRole: "Calificador Inmobiliario IA 24/7 (Filtro de Presupuesto + Agendamiento Visitas)", heroHeadline: "Encuentra tu propiedad ideal con asesoría inmediata y recorrido agendado hoy", sampleQ: "Hola, vi una propiedad en su perfil, ¿sigue disponible y aceptan financiamiento?", sampleA: "¡Un gusto saludarte! 🏡 Sí, sigue disponible para entrega inmediata y aceptamos crédito bancario o financiamiento directo. ¿Buscas para inversión o vivienda familiar para enviarte la ficha PDF y agendar visita?" },
    { key: "legal", label: "Legal, Contable & Consultoría B2B", rx: /abogad|jur[ií]dic|notar|contab|contador|fiscal|consultor|auditor|seguros|agencia/i, avgTicket: 380, setupUsd: 950, retainerUsd: 247, botRole: "Asistente Ejecutivo IA (Pre-Calificación de Casos + Agenda Directa)", heroHeadline: "Protección legal y estrategia corporativa con respuesta ejecutiva inmediata", sampleQ: "Buenas noches, necesito asesoría urgente para mi empresa, ¿cómo agendamos?", sampleA: "¡Buenas noches! ⚖️ Tomamos tus datos de inmediato para priorizar tu caso a primera hora. Cuéntame en una línea el tema principal y elige si prefieres videollamada o reunión presencial mañana." },
    { key: "beauty", label: "Estética, Spa & Barbería", rx: /est[eé]tic|spa|belleza|peluquer|barber|u[ñn]as|salon|sal[oó]n|masaje|laser|cosm[eé]t/i, avgTicket: 65, setupUsd: 650, retainerUsd: 147, botRole: "Concierge IA de Reservas 24/7 (Cero Comisiones Booksy + Reconfirmación WA)", heroHeadline: "Reserva tu experiencia de bienestar en 1 clic con confirmación instantánea", sampleQ: "Hola! Quiero agendar corte y tratamiento para el sábado, ¿tienen turno?", sampleA: "¡Hola! ✨ Qué alegría atenderte. Para este sábado nos quedan 2 espacios: 11:00 AM y 3:30 PM, con 10% de beneficio reservando directo por aquí. ¿A qué nombre te bloqueo el turno?" },
    { key: "food", label: "Restaurante, Café & Gastronomía", rx: /restauran|caf[eé]|pizz|sushi|hamburg|panader|pasteler|gastron|bar|parrill|comida|bodeg/i, avgTicket: 32, setupUsd: 690, retainerUsd: 147, botRole: "Motor Propio de Pedidos & Reservas WA (Ahorra 28% de Comisión Delivery)", heroHeadline: "Pide directo sin recargos de apps o reserva tu mesa VIP en segundos", sampleQ: "Hola, ¿tienen delivery hasta mi zona y me pasan el menú actualizado?", sampleA: "¡Hola! 🍽️ Sí, llegamos en 25 min con envío bonificado pidiendo directo aquí (sin recargos de apps). Aquí tienes nuestro menú interactivo: ¿deseas ordenar a domicilio o reservar mesa para hoy?" },
    { key: "auto", label: "Automotriz, Taller & Repuestos", rx: /taller|mec[aá]nic|auto|veh[ií]cul|repuest|concesionar|caucho|llanta|lubric|lavado/i, avgTicket: 145, setupUsd: 750, retainerUsd: 167, botRole: "Cotizador Automotriz IA + Recordatorio Automático de Mantenimiento", heroHeadline: "Diagnóstico certificado y cotización de repuestos/servicio al instante", sampleQ: "Buenas, ¿cuánto sale el mantenimiento general y tienen turno hoy?", sampleA: "¡Hola! 🔧 Sí tenemos bahía disponible hoy. Indícame marca, modelo y año de tu vehículo y en 30 segundos te confirmo precio exacto y hora de recepción." },
    { key: "fitness", label: "Gimnasio, Fitness & Academia", rx: /gimnasio|fitness|crossfit|pilates|yoga|deport|academia|escuela|colegio|curso|idiom/i, avgTicket: 75, setupUsd: 690, retainerUsd: 167, botRole: "Closer IA de Inscripciones y Clases de Prueba 24/7", heroHeadline: "Activa tu pase de prueba gratuito hoy y transforma tus resultados", sampleQ: "Hola, ¿qué planes mensuales manejan y qué horarios tienen?", sampleA: "¡Hola! 💪 Tenemos horarios desde las 6:00 AM hasta las 9:30 PM y puedes venir mañana mismo a una sesión de prueba sin costo. ¿En qué turno te queda más cómodo entrenar?" }
];

const DEFAULT_NICHE_PROFILE = {
    key: "general",
    label: "Comercio & Servicios Profesionales",
    avgTicket: 95,
    setupUsd: 750,
    retainerUsd: 167,
    botRole: "Agente Comercial IA 24/7 en WhatsApp + Embudo Web de Alta Conversión",
    heroHeadline: "Atención inmediata 24/7 y cotización personalizada en menos de 1 minuto",
    sampleQ: "Hola, quisiera cotizar un servicio y confirmar si atienden hoy.",
    sampleA: "¡Hola! 👋 Gracias por escribirnos. Estamos activos para ayudarte ahora mismo: indícanos qué solución buscas y te enviamos disponibilidad y presupuesto al instante."
};

function getNicheEconomicsProfile(categoryStr) {
    const cat = String(categoryStr || "");
    for (const p of NICHE_REVENUE_PROFILES) {
        if (p.rx.test(cat)) return p;
    }
    return DEFAULT_NICHE_PROFILE;
}

function estimateNicheRevenueLeak(lead) {
    const prof = getNicheEconomicsProfile(`${lead?.category || ""} ${lead?.secondaryCategories || ""}`);
    const webInfo = classifyWebsiteStatus(lead || {});
    const reviews = Math.max(0, parseInt(lead?.reviewCount, 10) || 0);

    // Conservative monthly local search / inquiry volume proxy based on reviews & local presence
    const estimatedMonthlyInquiries = Math.max(18, Math.min(340, Math.round(16 + Math.sqrt(reviews + 4) * 9.5)));

    let leakRate = 0.06;
    const reasons = [];

    if (webInfo.status === "none") {
        leakRate += 0.24;
        reasons.push("fuga de búsquedas en Google sin sitio web propio");
    } else if (webInfo.status === "social_link") {
        leakRate += 0.21;
        reasons.push("uso de Linktree/red social en vez de embudo web de conversión");
    } else if (webInfo.status === "broken") {
        leakRate += 0.27;
        reasons.push("enlace web caído en Google Maps");
    } else if (webInfo.status === "slow" || webInfo.status === "outdated" || webInfo.status === "insecure") {
        leakRate += 0.14;
        reasons.push("fricción móvil y rebote en su web actual");
    }

    if (!lead?.has_ai_automation) {
        leakRate += 0.17;
        reasons.push("42% de consultas fuera de horario sin Agente IA 24/7");
    }
    if (lead?.commission_bleed) {
        leakRate += 0.12;
        reasons.push(`comisiones cedidas a ${lead.booking_platform || "apps externas"}`);
    }
    if (lead?.unclaimed) {
        leakRate += 0.08;
        reasons.push("ficha de Google Maps sin reclamar");
    }

    leakRate = Math.min(0.58, leakRate);
    // Conservative close rate (22%) applied to leaked inquiries * avgTicket
    const rawMonthlyUsd = Math.round((estimatedMonthlyInquiries * leakRate * 0.22 * prof.avgTicket) / 50) * 50;
    const monthlyLeakUsd = Math.max(450, Math.min(18500, rawMonthlyUsd));

    return {
        monthlyLeakUsd,
        annualLeakUsd: monthlyLeakUsd * 12,
        avgTicketUsd: prof.avgTicket,
        verticalKey: prof.key,
        verticalLabel: prof.label,
        botRole: prof.botRole,
        heroHeadline: prof.heroHeadline,
        sampleQ: prof.sampleQ,
        sampleA: prof.sampleA,
        setupUsd: prof.setupUsd,
        retainerUsd: prof.retainerUsd,
        leakSummary: reasons.slice(0, 2).join(" + ") || "optimización de conversión local"
    };
}

/**
 * Dual-Engine Commercial Opportunity Scoring v4.5 (Web Score + AI Automation Score + Offer Router)
 */
function calculateLeadScore(lead) {
    let webScore = 38;
    let autoScore = 36;
    const opportunities = [];

    const webInfo = classifyWebsiteStatus(lead);
    const reviews = parseInt(lead.reviewCount, 10) || 0;
    const rating = parseFloat(lead.averageRating) || 0;
    const tech = (lead.tech_stack || "").toLowerCase();

    // 1. Web Design / Redesign Scoring
    if (webInfo.status === "none") {
        webScore += 44;
        opportunities.push("Sin Sitio Web (Venta Directa Web)");
    } else if (webInfo.status === "social_link") {
        webScore += 46;
        autoScore += 14;
        opportunities.push("Falsa Web: Solo Linktree/RRSS (Cierre Rápido Web)");
    } else if (webInfo.status === "broken") {
        webScore += 48;
        opportunities.push("Web Caída / Hosting Roto (Urgencia Inmediata)");
    } else {
        if (webInfo.status === "slow") {
            webScore += 30;
            opportunities.push(`Web Móvil Lenta (${lead.pagespeed_mobile}/100 PageSpeed)`);
        } else if (webInfo.status === "outdated") {
            webScore += 28;
            opportunities.push(lead.copyright_year ? `Web Obsoleta (©${lead.copyright_year})` : "Web No Adaptada a Móvil");
        }
        if (lead.ssl_insecure) {
            webScore += 16;
            opportunities.push("Dominio Sin SSL HTTPS");
        }
        if (tech.includes("wix") || tech.includes("squarespace")) {
            webScore += 18;
            opportunities.push("CMS Limitado (Migración a Web Rápida)");
        }
        if (tech && !tech.includes("pixel") && !tech.includes("gtm")) {
            webScore += 12;
            autoScore += 10;
            opportunities.push("Sin Píxel de Conversión (Fuga Retargeting)");
        }
        if (lead.has_whatsapp_cta === false && lead._enrichedDone) {
            webScore += 10;
            autoScore += 12;
            opportunities.push("Web sin Botón WhatsApp Directo");
        }
    }

    // 2. AI Automation, Chatbot & CRM Scoring
    const isCommissionApp = Boolean(lead.commission_bleed || (lead.booking_platform && /ubereats|rappi|pedidosya|doctoralia|booksy|fresha|treatwell|opentable|thefork|glovo/i.test(lead.booking_platform)));
    if (isCommissionApp) {
        lead.commission_bleed = true;
        autoScore += 22;
        webScore += 10;
        opportunities.push(`Sangría de Comisiones (${lead.booking_platform}) · Canal Propio`);
    } else if (!lead.booking_platform && reviews >= 25) {
        autoScore += 14;
        opportunities.push("Sin Agendamiento / Pedidos 24/7");
    }

    if (!lead.has_ai_automation) {
        if (reviews >= 40) {
            autoScore += 26;
            opportunities.push("Alto Flujo Manual (Vender Agente IA 24/7)");
        } else if (reviews >= 12) {
            autoScore += 16;
            opportunities.push("Atención Manual sin Bot IA");
        }
    }

    if (lead.ad_spend_active) {
        autoScore += 18;
        opportunities.push("Invierte en Ads Activamente");
    }

    if (lead.review_pain_points) {
        autoScore += 18;
        opportunities.push(`Dolor Clientes: ${lead.review_pain_points}`);
    }

    if (lead.unclaimed) {
        webScore += 16;
        autoScore += 8;
        opportunities.push("Ficha Google No Reclamada (SEO Local)");
    }

    if (lead.dmarc_status === "missing") {
        webScore += 6;
        opportunities.push("Dominio sin Protección DMARC");
    }

    // Contactability multipliers
    if (lead.phone && String(lead.phone).length > 6) { webScore += 6; autoScore += 10; }
    if (lead.email && String(lead.email).includes("@")) { webScore += 8; autoScore += 8; }
    if (lead.decision_maker || lead.legal_name) { webScore += 4; autoScore += 6; }

    const hasSocial = Boolean(lead.instagram || lead.facebook || lead.linkedin || lead.tiktok);
    if (!hasSocial && lead.website && !webInfo.needsWeb) {
        autoScore += 5;
        opportunities.push("Sin Ecosistema RRSS Vinculado");
    }

    if (rating >= 4.5 && reviews > 0 && reviews < 25) {
        webScore += 7;
        opportunities.push("Excelente Calificación, Pocas Reseñas");
    } else if (rating > 0 && rating < 4.1 && reviews >= 10) {
        autoScore += 12;
        opportunities.push("Automatizar Reseñas 5★ (<4.1★)");
    } else if (reviews >= 120) {
        autoScore += 10;
        opportunities.push("Negocio Consolidado / Alto Tráfico");
    }

    webScore = Math.min(99, Math.max(15, webScore));
    autoScore = Math.min(99, Math.max(15, autoScore));
    const score = Math.max(webScore, autoScore);

    const econ = estimateNicheRevenueLeak(lead);

    let offerType = "web";
    let recommendedOffer = `Diseño Web Rápida + SEO Local`;
    let suggestedTicket = `$${econ.setupUsd} USD único`;

    if (webScore >= 74 && autoScore >= 72) {
        offerType = "combo";
        recommendedOffer = "Pack Web Conversión + Agente IA 24/7";
        suggestedTicket = `$${econ.setupUsd + 300} setup + $${econ.retainerUsd}/mes`;
    } else if (autoScore > webScore) {
        offerType = "automation";
        recommendedOffer = "Agente IA WhatsApp 24/7 + CRM";
        suggestedTicket = `$${Math.round(econ.setupUsd * 0.85)} setup + $${econ.retainerUsd}/mes`;
    }

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
        webScore,
        automationScore: autoScore,
        webStatus: webInfo.status,
        webStatusLabel: webInfo.label,
        offerType,
        recommendedOffer,
        suggestedTicket,
        monthlyLeakUsd: econ.monthlyLeakUsd,
        annualLeakUsd: econ.annualLeakUsd,
        botRole: econ.botRole,
        priority,
        priorityColor,
        opportunities: Array.from(new Set(opportunities))
    };
}

/**
 * Quadrant Top 3 Competitor Benchmark ("Tú vs. Los Líderes de Tu Zona")
 */
function computeQuadrantTop3Benchmark(lead, allLeads) {
    if (!lead || !Array.isArray(allLeads) || allLeads.length === 0) {
        return { rank: 1, totalPeers: 1, top3: [], gapSummary: "" };
    }
    const targetCat = normalizeCategory(lead.category);
    let peers = targetCat
        ? allLeads.filter(l => normalizeCategory(l.category) === targetCat)
        : [];
    if (peers.length < 3 && targetCat) {
        const rootWord = targetCat.split(/\s+/)[0];
        if (rootWord && rootWord.length >= 4) {
            peers = allLeads.filter(l => normalizeCategory(l.category).includes(rootWord));
        }
    }
    if (peers.length < 2) {
        peers = allLeads.slice();
    }

    const authorityScore = (item) => {
        const r = parseFloat(item.averageRating) || 0;
        const rev = Math.max(0, parseInt(item.reviewCount, 10) || 0);
        const wInfo = classifyWebsiteStatus(item);
        return (r * Math.log10(rev + 10) * 22)
            + (!wInfo.needsWeb ? 20 : 0)
            + (item.has_ai_automation ? 14 : 0)
            + (item.ad_spend_active ? 12 : 0)
            + (item.booking_platform && !item.commission_bleed ? 8 : 0);
    };

    const ranked = peers
        .map(p => ({ item: p, auth: authorityScore(p) }))
        .sort((a, b) => b.auth - a.auth);

    const idx = ranked.findIndex(x =>
        (lead.dedupeKey && x.item.dedupeKey === lead.dedupeKey) ||
        x.item.name === lead.name
    );
    const rank = idx >= 0 ? idx + 1 : ranked.length;

    const top3 = ranked
        .filter(x => x.item.name !== lead.name)
        .slice(0, 3)
        .map((x, i) => {
            const p = x.item;
            const d = haversineDistance(lead.latitude, lead.longitude, p.latitude, p.longitude);
            const distStr = d !== null ? (d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`) : "tu zona";
            const wInfo = classifyWebsiteStatus(p);
            return {
                pos: i + 1,
                name: p.name || "Competidor",
                rating: p.averageRating || "4.5",
                reviews: parseInt(p.reviewCount, 10) || 0,
                distStr,
                hasRealWeb: !wInfo.needsWeb,
                hasAuto: Boolean(p.has_ai_automation || p.booking_platform),
                ads: Boolean(p.ad_spend_active)
            };
        });

    const leader = top3[0];
    const gapSummary = leader
        ? `Puesto #${rank} de ${ranked.length} en su rubro · Líder cercano: ${leader.name} (${leader.rating}★, ${leader.reviews} reseñas a ${leader.distStr})`
        : `Puesto #${rank} de ${ranked.length} analizados en el cuadrante`;

    return { rank, totalPeers: ranked.length, top3, gapSummary };
}

/**
 * 1-Click Competitor Ad Spy URLs (Meta Ad Library + Google Ads Transparency)
 */
function getAdSpyLinks(lead) {
    const cleanName = String(lead?.name || "").trim();
    const domain = extractDomain(lead?.website || "");
    const ws = classifyWebsiteStatus(lead || {});
    let fbQuery = cleanName;
    if (lead?.facebook) {
        try {
            const fbPath = new URL(normalizeUrl(lead.facebook)).pathname.replace(/\//g, "").trim();
            if (fbPath && fbPath.length > 2 && !/^(profile\.php|pages|people)$/i.test(fbPath)) {
                fbQuery = fbPath;
            }
        } catch (_) {}
    }
    const googleTarget = (domain && !ws.needsWeb) ? domain : cleanName;
    return {
        metaAdsUrl: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(fbQuery)}`,
        googleAdsUrl: `https://adstransparency.google.com/?region=anywhere&q=${encodeURIComponent(googleTarget)}`
    };
}

/**
 * Offer-Aware Omnichannel & Follow-Up Cadence Sequencer (Día 1 · Día 3 · Día 7 · Email · Call)
 * Channels: whatsapp | followup | closing | email | call
 */
function generateOutreachPitch(lead, channel = "whatsapp", benchmark = null) {
    const name = lead.name || "su empresa";
    const execGreeting = lead.decision_maker ? `Hola ${lead.decision_maker.split(":")[1]?.trim() || lead.decision_maker}, saludo al equipo de *${name}*` : `Hola, un gusto saludar al equipo de *${name}*`;
    const category = lead.category || "su sector";
    const city = lead.address ? (lead.address.split(",")[1] || lead.address.split(",")[0]).trim() : "su zona";
    const rating = lead.averageRating ? `${lead.averageRating}★` : "excelente reputación";
    const econ = estimateNicheRevenueLeak(lead);
    const webInfo = classifyWebsiteStatus(lead);
    const leakStr = `$${econ.monthlyLeakUsd.toLocaleString("en-US")} USD/mes`;

    const leaderPeer = benchmark?.top3?.[0]?.name || lead.nearestPeerName || "";
    const leaderDist = benchmark?.top3?.[0]?.distStr || (lead.nearestPeerDistanceKm ? (lead.nearestPeerDistanceKm < 1 ? Math.round(lead.nearestPeerDistanceKm * 1000) + "m" : lead.nearestPeerDistanceKm.toFixed(1) + "km") : "");
    const peerHook = leaderPeer
        ? ` frente a competidores como *${leaderPeer}*${leaderDist ? ` (a ${leaderDist})` : ""}`
        : "";

    let diagnosticHook = "";
    let solutionPromise = "";

    if (lead.offer_type === "automation") {
        if (lead.commission_bleed && lead.booking_platform) {
            diagnosticHook = `vimos que tienen gran tracción (${rating}), pero dependen de *${lead.booking_platform}* cediendo margen en comisiones y sin un Agente IA propio en WhatsApp que atienda y agende 24/7 (fuga estimada: *${leakStr}*).`;
        } else if (lead.review_pain_points) {
            diagnosticHook = `analizando su flujo en ${city}, detectamos alta demanda pero cuello de botella en atención manual (${lead.review_pain_points.toLowerCase()}), dejando escapar aprox. *${leakStr}* en consultas fuera de horario${peerHook}.`;
        } else {
            diagnosticHook = `vi que ya tienen presencia web y ${rating}, pero su captación sigue siendo manual sin un *${econ.botRole}* que responda y cierre citas en menos de 30 segundos las 24 horas (fuga estimada: *${leakStr}*).`;
        }
        solutionPromise = `Ya montamos una *demo interactiva en vivo* de cómo respondería el Agente IA entrenado específicamente para *${name}*.`;
    } else if (lead.offer_type === "combo") {
        const webGap = webInfo.status === "social_link" ? "usan un enlace genérico de redes/Linktree en vez de web propia" : "aún no cuentan con un ecosistema web rápido";
        diagnosticHook = `notamos que aunque destacan con ${rating}, ${webGap} ni tienen recepción automatizada 24/7 en WhatsApp, desviando aprox. *${leakStr}* en clientes de alta intención${peerHook}.`;
        solutionPromise = `Armamos una *vista previa real* de cómo luciría la nueva Web + Recepcionista IA 24/7 de *${name}*.`;
    } else {
        if (webInfo.status === "social_link") {
            diagnosticHook = `noté que en Google Maps dirigen su tráfico a un enlace de Linktree/red social en lugar de una web propia de conversión rápida${peerHook}, perdiendo posicionamiento local (fuga estimada: *${leakStr}*).`;
        } else if (webInfo.status === "broken") {
            diagnosticHook = `detecté urgente que el enlace de su página web en Google Maps está caído/con error ahora mismo${peerHook}, haciendo que los clientes que intentan entrar reboten directo a la competencia.`;
        } else if (!lead.website) {
            diagnosticHook = `noté que con ${rating} aún no tienen página web conectada a Google Maps${peerHook}, dejando en la mesa aprox. *${leakStr}* de clientes que buscan ${category} desde el celular.`;
        } else {
            diagnosticHook = `audité su página móvil actual y presenta fricción de conversión${typeof lead.pagespeed_mobile === "number" ? ` (${lead.pagespeed_mobile}/100 en Google PageSpeed)` : ""}${peerHook}, frenando cierres por *${leakStr}*.`;
        }
        solutionPromise = `Ya diseñamos un *prototipo visual sin costo* de cómo se vería la nueva web rápida de *${name}* conectada a WhatsApp.`;
    }

    if (channel === "whatsapp") {
        const auditSuffix = lead.cloud_audit_url ? `\n\n🔗 Diagnóstico + Demo aquí: ${lead.cloud_audit_url}` : "";
        return `${execGreeting} 👋\n\nEstuve auditando los negocios referentes de *${category}* en ${city} y destacó su perfil (${rating}).\n\nSin embargo, ${diagnosticHook}\n\n${solutionPromise} ¿Me autorizan enviársela por aquí en 1 minuto sin ningún compromiso?${auditSuffix}`;
    }

    if (channel === "followup") {
        return `Hola equipo de *${name}*, ¿cómo va la semana? 👋\n\nLes escribí hace un par de días porque dejamos armada la demostración personalizada de *${lead.recommended_offer || "Web + Automatización IA"}* para su sede en ${city}.\n\nEn negocios de *${category}*, implementar esto suele recuperar entre *${leakStr}* desde el primer mes al atender en segundos incluso de noche y domingos.\n\n¿Les comparto el enlace interactivo por aquí para que lo prueben desde su celular en 60 segundos?`;
    }

    if (channel === "closing") {
        return `Hola *${name}* 👋 Te escribo por última vez para no incomodar.\n\nEsta semana estamos activando el sistema exclusivo de captación y *${econ.botRole}* para *un solo negocio de ${category}* en este cuadrante de ${city} (para no generar conflicto de interés con ${leaderPeer || "sus competidores directos"}).\n\nComo ustedes ya tienen ${rating}, los priorizamos primero. Si les interesa ver el prototipo antes de que pasemos al siguiente en la lista, respóndeme *"DEMO"* hoy y se los activo. ¡Éxitos!`;
    }

    if (channel === "call") {
        return `📞 GUIÓN DE LLAMADA FRÍA (30 SEGUNDOS · ${(lead.recommended_offer || "WEB + IA").toUpperCase()}):\n\n"Hola, buenos días. Busco a ${lead.decision_maker || "la persona encargada de crecimiento comercial"} en ${name}.\n\nTe llamo muy puntual: hicimos un barrido de ${category} en ${city}; ustedes tienen ${rating}, pero ${diagnosticHook.replace(/\*/g, "")}\n\nNo te llamo para venderte a ciegas: ya montamos un prototipo funcionando con el nombre de ${name}. ¿Te lo paso ahora mismo a este WhatsApp para que lo veas en 1 minuto?"`;
    }

    // Cold Email
    return `Asunto: Prototipo listo para ${name} (Fuga detectada: ~${leakStr})\n\nHola ${lead.decision_maker || `equipo directivo de ${name}`},\n\nAnalizando el cuadrante comercial de ${category} en ${city}, su reputación (${rating}) destaca claramente${benchmark?.rank ? ` (posición actual #${benchmark.rank} de ${benchmark.totalPeers} en huella digital)` : ""}.\n\nNo obstante, en nuestra auditoría técnica detectamos que ${diagnosticHook.replace(/\*/g, "")}\n\n${solutionPromise.replace(/\*/g, "")}\n\n¿Tienen 7 minutos este jueves para mostrársela en vivo o prefieren que les responda este correo con el enlace de prueba?\n\nSaludos cordiales,\nConsultoría de Crecimiento Web & Automatización IA`;
}

/**
 * Hybrid 2026 AI Engine:
 * 1. Google Gemini 2.5 Flash Cloud API (with secure x-goog-api-key header, zero URL key leak)
 * 2. Chrome Built-in Gemini Nano Local AI (`self.LanguageModel` / `window.ai`) $0 fallback!
 */
async function callGeminiAnalysis(apiKey, lead, customChannel = "whatsapp") {
    const cleanLead = typeof lead === "object" && lead !== null ? lead : { name: String(lead || "Prospecto") };
    const econ = estimateNicheRevenueLeak(cleanLead);
    const ws = classifyWebsiteStatus(cleanLead);

    const prompt = `Actúa como el Principal Revenue Strategist de una agencia élite de Desarrollo Web y Automatizaciones IA.
Analiza este prospecto real extraído con AtlasIQ y entrega un plan quirúrgico para cerrarle "${cleanLead.recommended_offer || "Web + Agente IA 24/7"}":

DATOS PROFUNDOS DEL PROSPECTO:
- Empresa: ${cleanLead.name || "N/A"} ${cleanLead.legal_name ? `(Razón Social: ${cleanLead.legal_name})` : ""}
- Decisor / Cargo OSINT: ${cleanLead.decision_maker || "No identificado públicamente"}
- Rubro: ${cleanLead.category || "Comercial"} | Ticket Promedio Rubro: ~$${econ.avgTicketUsd} USD
- Score Venta Web: ${cleanLead.web_score || 70}/99 | Score Automatización IA: ${cleanLead.automation_score || 70}/99
- Oferta Ganadora Detectada: ${cleanLead.recommended_offer || "Pack Web + IA"} (${cleanLead.suggested_ticket || ""})
- Fuga Mensual Estimada: ~$${econ.monthlyLeakUsd} USD/mes (${econ.leakSummary})
- Estado Real del Enlace Web: ${ws.label} (${cleanLead.website || "SIN WEB"}) ${typeof cleanLead.pagespeed_mobile === "number" ? `| PageSpeed Móvil: ${cleanLead.pagespeed_mobile}/100` : ""}
- Calificación Maps: ${cleanLead.averageRating || "N/A"}★ (${cleanLead.reviewCount || 0} reseñas) | Reclamada: ${cleanLead.unclaimed ? "NO" : "Sí"}
- Dolor en Reseñas: ${cleanLead.review_pain_points || "Sin quejas críticas"}
- Stack & Bots actuales: ${cleanLead.tech_stack || "Ninguno"} | Automatización IA activa: ${cleanLead.has_ai_automation ? "Sí (" + cleanLead.automation_stack + ")" : "NO (100% Manual)"}
- Reservas / Comisiones: ${cleanLead.booking_platform ? `${cleanLead.booking_platform}${cleanLead.commission_bleed ? " (PAGA COMISIÓN EXTERNA)" : ""}` : "Sin agenda online"}
- Competidor Cercano: ${cleanLead.nearestPeerName ? `${cleanLead.nearestPeerName} (${cleanLead.nearestPeerDistanceKm ? Math.round(cleanLead.nearestPeerDistanceKm * 1000) + "m" : "cercano"})` : "Zona activa"}

RESPONDE EN ESPAÑOL EJECUTIVO, DIRECTO Y ACCIONABLE CON ESTAS 5 SECCIONES:
1. 💰 DIAGNÓSTICO DE FUGA DE DINERO (por qué pierden ~$${econ.monthlyLeakUsd}/mes hoy y qué paquete exacto venderles: Web, Automatización o Combo).
2. 🤖 ARQUITECTURA DE AUTOMATIZACIÓN + WEB IDEAL PARA ESTE NEGOCIO (flujo exacto WhatsApp/IA/CRM que les ahorrará horas y multiplicará citas).
3. 🎣 ROMPEHIELOS DE 5 SEGUNDOS POR WHATSAPP (natural, humano, imposible de ignorar).
4. 💬 CADENCIA DE 3 TOQUES (Día 1 Diagnóstico + Día 3 Demo en Vivo + Día 7 Escasez de Zona).
5. 🛡️ MANEJO DE LAS 2 OBJECIONES MÁS PROBABLES ("Ya tengo Instagram/conocido" o "Está caro").`;

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

function detectUserLocation(callback, options = {}) {
    const forceHighAccuracy = Boolean(options && options.highAccuracy);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (callback) callback({
                    lat: pos.coords.latitude,
                    lon: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    source: "gps",
                    label: `GPS Exacto (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`,
                    detectedAt: Date.now()
                });
            },
            () => fetchIpGeolocation(callback),
            {
                enableHighAccuracy: forceHighAccuracy,
                timeout: forceHighAccuracy ? 7000 : 5000,
                maximumAge: forceHighAccuracy ? 0 : 180000
            }
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
                    lat: Number(data.latitude),
                    lon: Number(data.longitude),
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

    try {
        const res2 = await fetch("https://get.geojs.io/v1/ip/geo.json", { signal: AbortSignal.timeout(4000) });
        if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.latitude && data2.longitude) {
                if (callback) callback({
                    lat: parseFloat(data2.latitude),
                    lon: parseFloat(data2.longitude),
                    city: data2.city || "",
                    region: data2.region || "",
                    country: data2.country || "",
                    source: "ip",
                    label: `${data2.city || data2.region || "Ubicación"}, ${data2.country || ""}`.trim().replace(/^,|,$/g, ""),
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
 * Publish Interactive Trojan-Horse Audit + Live Niche Web/Bot Demo to Cloudflare Worker
 */
async function publishLiveCloudAudit(edgeWorkerUrl, lead, branding = {}, benchmark = null) {
    if (!edgeWorkerUrl || !edgeWorkerUrl.startsWith("http")) {
        throw new Error("Configura primero la URL de tu Cloudflare Edge Worker en ⚙️ Ajustes.");
    }
    const econ = estimateNicheRevenueLeak(lead);
    const ws = classifyWebsiteStatus(lead);
    const slugBase = (lead.name || "empresa").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 32);
    const slug = lead.cloud_audit_slug || `${slugBase}-${Math.floor(1000 + Math.random() * 9000)}`;

    const resp = await fetch(`${edgeWorkerUrl.replace(/\/$/, "")}/api/audit/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            slug,
            leadName: lead.name,
            category: lead.category,
            rating: lead.averageRating || "4.7",
            reviewCount: lead.reviewCount || 0,
            score: lead.lead_score || 75,
            webScore: lead.web_score || 75,
            automationScore: lead.automation_score || 75,
            webStatusLabel: ws.label,
            recommendedOffer: lead.recommended_offer || "Pack Web + Agente IA 24/7",
            monthlyLeakUsd: econ.monthlyLeakUsd,
            botRole: econ.botRole,
            heroHeadline: econ.heroHeadline,
            sampleQ: econ.sampleQ,
            sampleA: econ.sampleA,
            website: lead.website || "",
            speedScore: lead.pagespeed_mobile ?? null,
            opportunities: lead.opportunities || "",
            nearestPeer: lead.nearestPeerName ? `${lead.nearestPeerName} (${lead.nearestPeerDistanceKm ? Math.round(lead.nearestPeerDistanceKm * 1000) + "m" : "cercano"})` : "",
            top3: benchmark?.top3 || [],
            rank: benchmark?.rank || null,
            totalPeers: benchmark?.totalPeers || null,
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
 * Fetch Real-Time Prospect Open & Click Telemetry from Cloudflare Edge Worker
 */
async function fetchCloudAuditStats(edgeWorkerUrl, slugOrUrl) {
    if (!edgeWorkerUrl || !slugOrUrl) return null;
    let slug = String(slugOrUrl).trim();
    if (slug.includes("/audit/")) {
        slug = slug.split("/audit/")[1].split(/[?#]/)[0].trim();
    }
    if (!slug) return null;
    const resp = await fetch(`${edgeWorkerUrl.replace(/\/$/, "")}/api/audit/stats/${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(6000)
    });
    if (!resp.ok) return null;
    return await resp.json();
}

/**
 * Export Standalone 1-File Interactive Client Website + 24/7 AI Bot Demo (.html)
 * Client opens it on mobile/desktop -> sees their custom brand website + live simulated AI chat!
 */
function downloadStandaloneClientDemoHtml(lead, branding = {}) {
    if (!lead) return;
    const econ = estimateNicheRevenueLeak(lead);
    const agencyName = branding.agencyName || "WINDOWSTELECOM";
    const agencyWa = branding.agencyWa || "https://wa.me/584127785780";
    const safeName = escapeHtml(lead.name || "Empresa");
    const safeCat = escapeHtml(lead.category || econ.verticalLabel);
    const safeAddr = escapeHtml(lead.address || "Atención preferencial en tu ciudad");
    const safeRating = escapeHtml(lead.averageRating || "4.9");
    const safePhone = escapeHtml(lead.phone || "WhatsApp Directo 24/7");
    const ctaText = encodeURIComponent(`Hola ${agencyName}, acabo de probar la Demo Web + Agente IA de ${lead.name || "mi negocio"} y quiero implementarla.`);

    const demoHtml = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Demo Interactiva: ${safeName} · Web + Agente IA 24/7</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#090d16;color:#f8fafc;line-height:1.5}
.topbar{background:linear-gradient(90deg,#1e3a8a,#0f766e);padding:10px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;font-size:12.5px}
.topbar b{color:#6ee7b7}
.topbar a{background:#10b981;color:#052e16;font-weight:800;text-decoration:none;padding:6px 14px;border-radius:99px}
.hero{max-width:1040px;margin:32px auto;padding:0 20px;display:grid;grid-template-columns:1.15fr 0.85fr;gap:28px;align-items:center}
@media(max-width:820px){.hero{grid-template-columns:1fr}}
.pill{display:inline-flex;align-items:center;gap:6px;background:rgba(59,130,246,.16);border:1px solid rgba(59,130,246,.4);color:#93c5fd;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700}
h1{font-size:clamp(28px,4vw,44px);line-height:1.12;margin:14px 0;font-weight:900}
.sub{color:#94a3b8;font-size:16px;margin-bottom:22px}
.cta-row{display:flex;gap:12px;flex-wrap:wrap}
.btn-p{background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;border:none;padding:13px 22px;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none}
.btn-s{background:#111827;color:#e2e8f0;border:1px solid #334155;padding:13px 18px;border-radius:12px;font-weight:700;font-size:14px}
.trust{margin-top:22px;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.tcard{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:12px}
.tcard strong{display:block;font-size:18px;color:#38bdf8}
.tcard span{font-size:11.5px;color:#94a3b8}
.botbox{background:#0f172a;border:1.5px solid #22c55e;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(16,185,129,.18)}
.bothead{background:linear-gradient(135deg,#065f46,#047857);padding:14px 16px;display:flex;justify-content:space-between;align-items:center}
.botmsgs{padding:16px;height:310px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;background:#0b1120}
.msg{max-width:86%;padding:10px 13px;border-radius:12px;font-size:13px}
.msg.u{align-self:flex-end;background:#1d4ed8;color:#fff;border-bottom-right-radius:3px}
.msg.b{align-self:flex-start;background:#1e293b;color:#f1f5f9;border:1px solid #334155;border-bottom-left-radius:3px}
.chips{padding:10px 14px;background:#0f172a;border-top:1px solid #1e293b;display:flex;gap:6px;flex-wrap:wrap}
.chip{background:#172554;color:#93c5fd;border:1px solid #1d4ed8;padding:6px 10px;border-radius:99px;font-size:11.5px;font-weight:700;cursor:pointer}
.chip:hover{background:#2563eb;color:#fff}
</style>
</head>
<body>
<div class="topbar">
  <div>🚀 Prototipo Exclusivo preparado por <b>${escapeHtml(agencyName)}</b> · Recuperación estimada: <b>~$${econ.monthlyLeakUsd.toLocaleString("en-US")} USD/mes</b></div>
  <a href="${escapeHtml(agencyWa)}?text=${ctaText}" target="_blank">Activar en mi negocio ➔</a>
</div>
<section class="hero">
  <div>
    <span class="pill">★ ${safeRating} en Google · ${safeCat}</span>
    <h1>${safeName}: ${escapeHtml(econ.heroHeadline)}</h1>
    <p class="sub">📍 ${safeAddr} · ${safePhone}. Sistema web ultra-rápido (&lt;1.2s) integrado con ${escapeHtml(econ.botRole)}.</p>
    <div class="cta-row">
      <a class="btn-p" href="#bot" data-q="Quiero agendar ahora mismo">⚡ Probar Agendamiento IA</a>
      <span class="btn-s">🛡️ Atención Automática 24/7</span>
    </div>
    <div class="trust">
      <div class="tcard"><strong>&lt; 15 seg</strong><span>Tiempo respuesta IA</span></div>
      <div class="tcard"><strong>24/7/365</strong><span>Noches y domingos</span></div>
      <div class="tcard"><strong>0% Comisión</strong><span>100% canal propio</span></div>
    </div>
  </div>
  <div class="botbox" id="bot">
    <div class="bothead">
      <div><strong style="font-size:14px">🤖 Asistente IA · ${safeName}</strong><div style="font-size:11px;color:#a7f3d0">● En línea 24/7 en WhatsApp y Web</div></div>
      <span style="font-size:11px;background:rgba(0,0,0,.25);padding:3px 8px;border-radius:99px">DEMO VIVO</span>
    </div>
    <div class="botmsgs" id="chat">
      <div class="msg u">${escapeHtml(econ.sampleQ)}</div>
      <div class="msg b">${escapeHtml(econ.sampleA)}</div>
    </div>
    <div class="chips">
      <button type="button" class="chip" data-q="📅 Quiero reservar turno mañana">📅 Reservar turno</button>
      <button type="button" class="chip" data-q="💰 ¿Cuáles son sus precios y promos?">💰 Consultar precios</button>
      <button type="button" class="chip" data-q="📍 ¿Dónde están ubicados y horarios?">📍 Ubicación</button>
    </div>
  </div>
</section>
<script>
const replies = {
  "📅 Quiero reservar turno mañana": "¡Perfecto! ✅ Ya bloqueé prioridad para ti mañana. Solo confírmame tu nombre completo y si prefieres en la mañana (10:00 AM) o tarde (4:00 PM) para enviarte el recordatorio automático a tu WhatsApp.",
  "💰 ¿Cuáles son sus precios y promos?": "¡Con gusto! 📋 Manejamos opciones adaptadas a lo que necesitas y beneficio exclusivo por reserva directa web sin intermediarios. ¿Deseas que te envíe el catálogo PDF interactivo ahora mismo?",
  "📍 ¿Dónde están ubicados y horarios?": "📍 Nos encontramos en ${safeAddr}. Aunque nuestro local cierre en la noche, yo estoy activo 24/7 aquí para dejarte agendado en 30 segundos.",
  "Quiero agendar ahora mismo": "¡Excelente elección! 🚀 Dime qué día te queda mejor y te confirmo disponibilidad en tiempo real."
};
function sendQuick(q){
  const c=document.getElementById('chat');
  const u=document.createElement('div');u.className='msg u';u.textContent=q;c.appendChild(u);
  setTimeout(()=>{
    const b=document.createElement('div');b.className='msg b';
    b.textContent=replies[q]||"¡Recibido! Un especialista ya tiene tu ficha pre-calificada en nuestro CRM.";
    c.appendChild(b);c.scrollTop=c.scrollHeight;
  },350);
  c.scrollTop=c.scrollHeight;
}
document.addEventListener("click", (e) => {
  const trg = e.target.closest("[data-q]");
  if (!trg) return;
  e.preventDefault();
  sendQuick(trg.getAttribute("data-q"));
});
<\/script>
</body>
</html>`;

    const blob = new Blob([demoHtml], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    const fileSlug = String(lead.name || "Cliente").replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, "_").substring(0, 32);
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Demo_Web_IA_${fileSlug}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    playAudioNotification("success");
}

/**
 * Configurable White-Label Executive PDF Audit Generator v4.5 (Dual Score + USD Leak + Top 3 Benchmark)
 */
function generateLeadPdfAudit(lead, branding = {}, allLeadsRef = []) {
    if (!lead) return;
    const jspdfModule = (typeof window !== "undefined" && window.jspdf) ? window.jspdf : (typeof jspdf !== "undefined" ? jspdf : null);
    if (!jspdfModule || !jspdfModule.jsPDF) {
        alert("La biblioteca jsPDF no está cargada.");
        return;
    }

    const agencyName = branding.agencyName || "WINDOWSTELECOM";
    const consultantName = branding.consultantName || "Joseph Castillo – CEO & Principal Strategist";
    const agencyWeb = branding.agencyWeb || "windowstelecom.com";
    const econ = estimateNicheRevenueLeak(lead);
    const ws = classifyWebsiteStatus(lead);
    const bench = computeQuadrantTop3Benchmark(lead, allLeadsRef);

    const doc = new jspdfModule.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;

    // 1. Header Banner
    doc.setFillColor(11, 15, 25);
    doc.rect(0, 0, pageWidth, 38, "F");
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 38, pageWidth, 2.5, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    doc.text(`${agencyName}  |  Diagnóstico de Conversión Web & Automatización IA`, margin, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.8);
    doc.setTextColor(148, 163, 184);
    doc.text("AUDITORÍA DE FUGA DE INGRESOS, HUELLA WEB, RECEPCIÓN IA 24/7 Y RANKING DE CUADRANTE", margin, 22);

    const todayStr = new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
    doc.text(`Fecha: ${todayStr}  |  Oferta Recomendada: ${lead.recommended_offer || "Web + Agente IA 24/7"}`, margin, 29);

    // 2. Business Title & OSINT
    let y = 49;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(String(lead.name || "Empresa Auditada").substring(0, 62), margin, y);

    y += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const osintLine = [
        `Rubro: ${lead.category || "Comercial"}`,
        `Posición Cuadrante: #${bench.rank} de ${bench.totalPeers}`,
        lead.legal_name ? `Entidad: ${lead.legal_name}` : ""
    ].filter(Boolean).join("  •  ");
    doc.text(osintLine.substring(0, 98), margin, y);

    // 3. Dual Score + Revenue Leak Card
    y += 7;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 32, 3, 3, "FD");

    const wScore = parseInt(lead.web_score, 10) || 70;
    const aScore = parseInt(lead.automation_score, 10) || 70;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Score Oportunidad Web: ${wScore}/99`, margin + 5, y + 9);
    doc.text(`Score Automatización IA: ${aScore}/99`, margin + 65, y + 9);

    doc.setTextColor(220, 38, 38);
    doc.text(`Fuga Estimada: ~$${econ.monthlyLeakUsd.toLocaleString("en-US")} USD/mes`, margin + 124, y + 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    doc.setTextColor(71, 85, 105);
    doc.text(`Causa principal: ${econ.leakSummary}`.substring(0, 96), margin + 5, y + 17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235);
    doc.text(`Solución llave en mano: ${econ.botRole}`.substring(0, 96), margin + 5, y + 24.5);

    // 4. Deep Technical Matrix
    y += 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("1. Radiografía Técnica de Captación Web y Automatización Comercial", margin, y);

    y += 4.5;
    const speedTxt = typeof lead.pagespeed_mobile === "number" ? ` (PageSpeed: ${lead.pagespeed_mobile}/100)` : "";
    const dmarcTxt = lead.dmarc_status === "present" ? "SPF+DMARC OK" : (lead.dmarc_status === "missing" ? "Sin DMARC" : "DoH");

    const checks = [
        { label: "Estado Real Web:", val: `${ws.label.replace(/[^\w\sáéíóúÁÉÍÓÚñÑ()/.-]/g, "").trim()}${lead.website ? " · " + extractDomain(lead.website) : ""}${speedTxt}`, ok: !ws.needsWeb },
        { label: "Recepción & Bots IA:", val: lead.has_ai_automation ? `Automatizado (${lead.automation_stack || "CRM Activo"})` : "CRÍTICO: Atención 100% manual (pierde el 42% de leads fuera de horario)", ok: Boolean(lead.has_ai_automation) },
        { label: "Agenda / Comisiones:", val: lead.booking_platform ? `${lead.booking_platform}${lead.commission_bleed ? " (ALERTA: Cede 18%-28% de comisión a terceros)" : " (Canal directo)"}` : "Sin motor propio de citas o pedidos online 24/7", ok: Boolean(lead.booking_platform && !lead.commission_bleed) },
        { label: "Ficha Google Maps:", val: lead.unclaimed ? "ALERTA: Ficha sin reclamar oficialmente en Google Business" : `Verificada · ${lead.averageRating || "N/A"}★ (${lead.reviewCount || 0} reseñas)`, ok: !lead.unclaimed },
        { label: "Píxeles & Tráfico Pago:", val: lead.tech_stack || "Sin píxeles de retargeting Meta/Google detectados", ok: Boolean(lead.ad_spend_active) },
        { label: "Correo & DNS:", val: lead.email ? `${lead.email} (${lead.mx_provider || "MX"} · ${dmarcTxt})` : "Sin buzón corporativo público indexado", ok: Boolean(lead.email && lead.dmarc_status !== "missing") }
    ];

    checks.forEach((item) => {
        doc.setFillColor(item.ok ? 240 : 254, item.ok ? 253 : 242, item.ok ? 244 : 242);
        doc.roundedRect(margin, y, contentWidth, 8.2, 1.5, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.3);
        doc.setTextColor(15, 23, 42);
        doc.text(item.label, margin + 3.5, y + 5.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(item.ok ? 21 : 185, item.ok ? 128 : 28, item.ok ? 61 : 28);
        doc.text(String(item.val).substring(0, 76), margin + 46, y + 5.5);
        y += 9.5;
    });

    // 5. Top 3 Local Quadrant Benchmark
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("2. Comparativa Directa: Usted vs. Top Competidores de su Cuadrante", margin, y);

    y += 4.5;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 25, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    doc.setTextColor(51, 65, 85);

    if (bench.top3.length > 0) {
        bench.top3.forEach((c, idx) => {
            const tags = [
                c.hasRealWeb ? "Web Propia" : "Sin Web",
                c.hasAuto ? "Agenda/Bot" : "Manual",
                c.ads ? "Paga Ads" : "Orgánico"
            ].join(" · ");
            doc.text(`#${idx + 1} ${c.name.substring(0, 34)} (${c.distStr}) — ${c.rating}★ (${c.reviews} res.)  [${tags}]`, margin + 4, y + 6.5 + idx * 6);
        });
    } else {
        doc.text("Cuadrante comercial activo con oportunidad inmediata de dominar el Top 3 de Google Maps.", margin + 4, y + 12);
    }

    // 6. Action Plan
    y += 31;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("3. Plan de Implementación Llave en Mano (14 a 21 Días)", margin, y);

    y += 4.5;
    const steps = [
        "Despliegue de Web Móvil Ultra-Rápida (>92 PageSpeed) con SEO Local para Google Maps.",
        `Activación de ${econ.botRole} conectado a WhatsApp.`,
        "Sistema automático de captura de leads, recordatorios de citas y solicitud de reseñas 5★.",
        "Instalación de Meta Pixel + Google Tag para recapturar el 100% de las visitas interesadas."
    ];
    steps.forEach((st, i) => {
        doc.setFillColor(238, 242, 255);
        doc.circle(margin + 3.5, y + 3.2, 2.6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.8);
        doc.setTextColor(37, 99, 235);
        doc.text(String(i + 1), margin + 2.6, y + 4.9);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.4);
        doc.setTextColor(30, 41, 59);
        doc.text(st.substring(0, 95), margin + 9.5, y + 4.9);
        y += 7.6;
    });

    // Footer
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageHeight - 19, pageWidth - margin, pageHeight - 19);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${consultantName}  |  ${agencyName}`, margin, pageHeight - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generado con AtlasIQ Enterprise  •  ${agencyWeb}  •  Diagnóstico Comercial Confidencial`, margin, pageHeight - 8);

    const safeFileName = String(lead.name || "Empresa").replace(/[^a-zA-Z0-9_\u00C0-\u017F]/g, "_").substring(0, 35);
    doc.save(`${safeFileName}_Auditoria_${agencyName.replace(/\s+/g, "_")}.pdf`);
    playAudioNotification("success");
}
